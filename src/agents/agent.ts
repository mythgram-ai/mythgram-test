import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { getProviderRuntimeCredentials } from '../providers/index.js';
import { getOpenAIToolsList, executeNativeTool } from '../tools/index.js';
import { abortSubAgentsForSession } from './sub-agent.js';
import { cancelPendingInteractionsForSession } from '../tools/interactive-store.js';
import { buildMemoryContext, isFirstUserRequest } from '../memory/index.js';
import { getCustomAgentForSession, CustomAgentDefinition } from '../custom-agents/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StreamEvent {
  type:
    | 'session_status'
    | 'assistant_start'
    | 'assistant_delta'
    | 'assistant_reasoning'
    | 'assistant_done'
    | 'tool_call_start'
    | 'tool_call_done'
    | 'context_usage'
    | 'network_waiting'
    | 'ui_action'
    | 'sub_agent_status'
    | 'interactive_request'
    | 'interactive_resolved'
    | 'error';
  sessionId: string;
  payload: any;
  timestamp: number;
}

type EventSubscriber = (event: StreamEvent) => void;

class AgentEventBus {
  private subscribers: Map<string, Set<EventSubscriber>> = new Map();

  public subscribe(sessionId: string, cb: EventSubscriber): () => void {
    let set = this.subscribers.get(sessionId);
    if (!set) {
      set = new Set();
      this.subscribers.set(sessionId, set);
    }
    set.add(cb);
    return () => {
      set?.delete(cb);
      if (set && set.size === 0) {
        this.subscribers.delete(sessionId);
      }
    };
  }

  public emit(event: StreamEvent) {
    const set = this.subscribers.get(event.sessionId);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(event);
      } catch {
        // ignore subscriber error
      }
    }
  }
}

export const agentEvents = new AgentEventBus();

// Active AbortControllers per running session (supports concurrent multi-session execution)
const activeAbortControllers = new Map<string, AbortController>();

export function isSessionRunning(sessionId: string): boolean {
  return activeAbortControllers.has(sessionId);
}

export function abortSessionRun(sessionId: string): boolean {
  // Always abort any running sub-agents and pending interactive prompts for this session
  abortSubAgentsForSession(sessionId);
  cancelPendingInteractionsForSession(sessionId);

  const controller = activeAbortControllers.get(sessionId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(sessionId);
    db.setStreamActive(sessionId, false);
    db.updateSession(sessionId, { status: 'aborted' });
    db.flushRamToSqlite();
    agentEvents.emit({
      type: 'session_status',
      sessionId,
      payload: { status: 'aborted' },
      timestamp: Date.now(),
    });
    return true;
  }
  return false;
}

async function loadSystemPrompt(
  workspaceRoot: string,
  memoryContext: string = '',
  customAgent: CustomAgentDefinition | null = null
): Promise<string> {
  const promptPath = path.join(__dirname, 'prompt', 'system-prompt.md');
  let base: string;
  try {
    const raw = await fs.readFile(promptPath, 'utf-8');
    base = raw.replace(/\$\{workspaceRoot\}/g, workspaceRoot);
  } catch {
    base = `You are Mythgram, an autonomous AI agent. Active workspace: ${workspaceRoot}`;
  }
  if (customAgent) {
    const description = customAgent.description
      ? `Agent description: ${customAgent.description}\n`
      : '';
    base += `\n\n## Active Custom Agent: ${customAgent.name}
${description}You are running as the user's custom agent "${customAgent.name}". It uses the exact same Mythgram runtime, capabilities, and tool system described above. The custom agent instructions below define your persona, focus, and working style, and take precedence over the default persona where they conflict. All runtime rules (absolute paths, native tool calls, ReAct loop, and safety requirements) still apply.

${customAgent.system_prompt}`;
  }
  return memoryContext ? `${base}\n\n${memoryContext}` : base;
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function generateId(prefix: string = 'msg'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Image bytes are delivered to the model through the separate multimodal vision queue.
 * Keeping the full base64 data_url inside a tool result would bloat the LLM context and,
 * worse, push multi-megabyte strings through the SSE stream / SQLite activity log, which
 * can break live streaming. Both the LLM result and the UI result use this sanitized copy.
 */
function sanitizeToolResultForTransport(result: any): any {
  if (!result || Array.isArray(result) || typeof result !== 'object') return result;
  const copy: any = { ...result };
  if (typeof copy.data_url === 'string' && copy.data_url.length > 500) {
    copy.data_url = '[image_data_attached_as_vision_input]';
  }
  return copy;
}

const VISION_UNSUPPORTED_NUDGE =
  'System notice: the image returned by read_image could not be analyzed because the current model does not accept image/vision inputs. Do not stop and do not retry read_image. Continue the task using fetch_text_from_image (OCR), scan_qr_code, and the other available tools, and only tell the user a vision-capable model is needed if those cannot solve it.';

/**
 * Starts or continues the autonomous ReAct loop in the background for a session.
 * Browser refreshes or SSE disconnects have zero impact on this background loop.
 */
export async function runAgentLoop(sessionId: string): Promise<void> {
  if (activeAbortControllers.has(sessionId)) {
    // Already running
    return;
  }

  const session = db.getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const abortController = new AbortController();
  activeAbortControllers.set(sessionId, abortController);
  db.setStreamActive(sessionId, true);

  db.updateSession(sessionId, { status: 'running' });
  agentEvents.emit({
    type: 'session_status',
    sessionId,
    payload: { status: 'running' },
    timestamp: Date.now(),
  });

  // Pending vision attachments added via read_image tool
  const pendingVisionQueue: {
    type: 'image';
    mimeType: string;
    dataUrl: string;
    filePath: string;
  }[] = [];

  // Captured once per run: if the provider rejects an image we disable vision for the
  // rest of this run and nudge the model to keep going with OCR/text tools.
  let visionSupported: boolean | null = null;
  let visionFailureNotice = false;

  // Memory is injected only on the first user request of a session, then kept for the
  // whole run so every ReAct iteration sees the same context.
  let memoryContext = '';
  try {
    if (isFirstUserRequest(db.getSessionMessages(sessionId))) {
      memoryContext = await buildMemoryContext();
    }
  } catch {
    memoryContext = '';
  }

  // The active custom agent is captured once per run so activating another agent
  // mid-run does not swap prompts or tools under the model.
  let customAgent: CustomAgentDefinition | null = null;
  try {
    customAgent = await getCustomAgentForSession(sessionId);
  } catch {
    customAgent = null;
  }

  try {
    // Unlimited ReAct loop: Thought -> Action -> Observation -> Repeat
    while (!abortController.signal.aborted) {
      const currentSession = db.getSession(sessionId);
      if (!currentSession) break;

      const providerCreds = getProviderRuntimeCredentials(currentSession.provider_id, currentSession.model_id);
      if (visionSupported === null) visionSupported = providerCreds.visionSupport;
      const reasoningEffort = db.getSetting('reasoning_effort', 'default');
      const systemPrompt = await loadSystemPrompt(
        currentSession.workspace,
        memoryContext,
        customAgent
      );
      const historyRows = db.getSessionMessages(sessionId);

      // Build OpenAI-compatible messages array
      const apiMessages: any[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
      ];

      let totalContextTokens = estimateTokens(systemPrompt);

      for (const row of historyRows) {
        if (row.role === 'system') continue;
        totalContextTokens += row.tokens || estimateTokens(row.content);

        if (row.role === 'assistant') {
          const msg: any = {
            role: 'assistant',
            content: row.content || null,
          };
          if (row.tool_calls) {
            try {
              const parsedCalls = JSON.parse(row.tool_calls);
              if (Array.isArray(parsedCalls) && parsedCalls.length > 0) {
                msg.tool_calls = parsedCalls;
              }
            } catch {
              // ignore
            }
          }
          apiMessages.push(msg);
        } else if (row.role === 'tool') {
          apiMessages.push({
            role: 'tool',
            tool_call_id: row.tool_call_id || 'call_unknown',
            name: row.name,
            content: row.content,
          });
        } else if (row.role === 'user') {
          apiMessages.push({
            role: 'user',
            content: row.content,
          });
        }
      }

      // If read_image attached any vision inputs in the previous step, inject them as multimodal user content
      if (pendingVisionQueue.length > 0 && visionSupported) {
        const visionParts: any[] = [
          {
            type: 'text',
            text: `Attached image(s) from read_image tool for visual inspection:`,
          },
        ];
        while (pendingVisionQueue.length > 0) {
          const item = pendingVisionQueue.shift()!;
          visionParts.push({
            type: 'image_url',
            image_url: { url: item.dataUrl },
          });
        }
        apiMessages.push({
          role: 'user',
          content: visionParts,
        });
      } else {
        // A previous attempt may have attached an image that the model could not accept.
        pendingVisionQueue.length = 0;
      }

      // Tell the model that vision is unavailable so it continues instead of stalling
      if (visionFailureNotice) {
        apiMessages.push({ role: 'user', content: VISION_UNSUPPORTED_NUDGE });
        visionFailureNotice = false;
      }

      // Update context tokens from logs
      db.updateSession(sessionId, { context_tokens: totalContextTokens });
      agentEvents.emit({
        type: 'context_usage',
        sessionId,
        payload: {
          contextTokens: totalContextTokens,
          contextWindow: providerCreds.contextWindow,
        },
        timestamp: Date.now(),
      });

      const toolsList = getOpenAIToolsList(
        visionSupported ?? true,
        customAgent?.tools
      );
      const assistantMsgId = generateId('msg');

      db.createOrUpdateRamMessage({
        id: assistantMsgId,
        sessionId,
        role: 'assistant',
        content: '',
        reasoning: '',
        tokens: 0,
        createdAt: Date.now(),
      });

      agentEvents.emit({
        type: 'assistant_start',
        sessionId,
        payload: { messageId: assistantMsgId },
        timestamp: Date.now(),
      });

      // Execute streaming call with automatic network retry resilience
      const streamResult = await streamChatCompletionWithRetry({
        sessionId,
        assistantMsgId,
        baseUrl: providerCreds.baseUrl,
        apiKey: providerCreds.apiKey,
        headers: providerCreds.headers,
        model: currentSession.model_id,
        messages: apiMessages,
        tools: toolsList,
        reasoningEffort,
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) break;

      // The provider refused the injected image (model has no vision input). Do not fail the
      // whole run: record a brief explanation, disable vision for this run, and let the ReAct
      // loop continue so the model can finish the task with OCR / other tools.
      if (streamResult.visionRejected) {
        const notice =
          'The attached image could not be analyzed because this model does not support image inputs. Continuing with text/OCR tools instead.';
        db.createOrUpdateRamMessage({
          id: assistantMsgId,
          sessionId,
          role: 'assistant',
          content: notice,
          reasoning: '',
          tokens: estimateTokens(notice),
        });
        agentEvents.emit({
          type: 'assistant_done',
          sessionId,
          payload: {
            messageId: assistantMsgId,
            content: notice,
            reasoning: '',
            toolCalls: [],
          },
          timestamp: Date.now(),
        });
        visionSupported = false;
        visionFailureNotice = true;
        db.flushRamToSqlite();
        continue;
      }

      // Update context usage if provider returned usage stats
      if (streamResult.totalTokens && streamResult.totalTokens > 0) {
        totalContextTokens = streamResult.totalTokens;
        db.updateSession(sessionId, { context_tokens: totalContextTokens });
        agentEvents.emit({
          type: 'context_usage',
          sessionId,
          payload: {
            contextTokens: totalContextTokens,
            contextWindow: providerCreds.contextWindow,
          },
          timestamp: Date.now(),
        });
      }

      const toolCalls = streamResult.toolCalls;
      const toolCallsJson = toolCalls.length > 0 ? JSON.stringify(toolCalls) : undefined;

      db.createOrUpdateRamMessage({
        id: assistantMsgId,
        sessionId,
        role: 'assistant',
        content: streamResult.content,
        reasoning: streamResult.reasoning,
        toolCallsJson,
        tokens: estimateTokens(streamResult.content + streamResult.reasoning),
      });

      agentEvents.emit({
        type: 'assistant_done',
        sessionId,
        payload: {
          messageId: assistantMsgId,
          content: streamResult.content,
          reasoning: streamResult.reasoning,
          toolCalls,
        },
        timestamp: Date.now(),
      });

      // If no tool calls were emitted by the LLM, the task turn is complete
      if (toolCalls.length === 0) {
        break;
      }

      // Execute all native tool calls in sequence and feed observations back into the ReAct loop
      for (const tc of toolCalls) {
        if (abortController.signal.aborted) break;

        const callId = tc.id || generateId('call');
        const toolName = tc.function?.name || '';
        const rawArgsStr = tc.function?.arguments || '{}';
        let parsedArgs: any = {};
        try {
          parsedArgs = JSON.parse(rawArgsStr);
        } catch {
          parsedArgs = {};
        }

        const activityId = generateId('act');
        const startedAt = Date.now();

        db.upsertToolActivity({
          id: activityId,
          session_id: sessionId,
          tool_call_id: callId,
          tool_name: toolName,
          args_json: JSON.stringify(parsedArgs),
          result_json: '',
          status: 'running',
          created_at: startedAt,
          updated_at: startedAt,
        });

        agentEvents.emit({
          type: 'tool_call_start',
          sessionId,
          payload: {
            activityId,
            toolCallId: callId,
            toolName,
            args: parsedArgs,
          },
          timestamp: startedAt,
        });

        let toolOutputObj: any;
        let status: 'completed' | 'error' = 'completed';

        try {
          toolOutputObj = await executeNativeTool(toolName, parsedArgs, {
            sessionId,
            toolCallId: callId,
            activityId,
            workspace: currentSession.workspace,
            visionSupport: Boolean(visionSupported),
            signal: abortController.signal,
            onVisionAttachment: (att) => {
              pendingVisionQueue.push(att);
            },
            onUiAction: (action) => {
              agentEvents.emit({
                type: 'ui_action',
                sessionId,
                payload: action,
                timestamp: Date.now(),
              });
            },
          });
        } catch (toolErr: any) {
          status = 'error';
          toolOutputObj = {
            error: true,
            message: toolErr?.message || String(toolErr),
          };
        }

        // Never push multi-megabyte base64 image bytes into the LLM context, the SSE stream,
        // or the persisted activity log. The image itself travels via the vision queue.
        const transportSafeOutput = sanitizeToolResultForTransport(toolOutputObj);
        const llmResultStr = JSON.stringify(transportSafeOutput);
        const uiResultStr = llmResultStr;

        db.upsertToolActivity({
          id: activityId,
          session_id: sessionId,
          tool_call_id: callId,
          tool_name: toolName,
          args_json: JSON.stringify(parsedArgs),
          result_json: uiResultStr,
          status,
          created_at: startedAt,
          updated_at: Date.now(),
        });

        // Save tool response message into RAM buffer (flushed to SQLite every 2s)
        const toolMsgId = generateId('msg');
        db.createOrUpdateRamMessage({
          id: toolMsgId,
          sessionId,
          role: 'tool',
          name: toolName,
          toolCallId: callId,
          content: llmResultStr,
          tokens: estimateTokens(llmResultStr),
          createdAt: Date.now(),
        });

        agentEvents.emit({
          type: 'tool_call_done',
          sessionId,
          payload: {
            activityId,
            toolCallId: callId,
            toolName,
            args: parsedArgs,
            result: transportSafeOutput,
            status,
          },
          timestamp: Date.now(),
        });
      }
    }

    if (!abortController.signal.aborted) {
      db.updateSession(sessionId, { status: 'completed' });
      db.flushRamToSqlite();
      agentEvents.emit({
        type: 'session_status',
        sessionId,
        payload: { status: 'completed' },
        timestamp: Date.now(),
      });
    }
  } catch (err: any) {
    if (!abortController.signal.aborted) {
      console.error(`[AgentLoop] Error in session ${sessionId}:`, err);
      db.updateSession(sessionId, { status: 'error' });
      db.flushRamToSqlite();
      const message = err?.message || String(err);
      agentEvents.emit({
        type: 'error',
        sessionId,
        payload: { message },
        timestamp: Date.now(),
      });
      // Always emit a terminal status so the UI never stays stuck in "Thinking..."
      agentEvents.emit({
        type: 'session_status',
        sessionId,
        payload: { status: 'error' },
        timestamp: Date.now(),
      });
    }
  } finally {
    activeAbortControllers.delete(sessionId);
    db.setStreamActive(sessionId, false);
    db.flushRamToSqlite();
  }
}

export interface StreamCallOptions {
  sessionId: string;
  assistantMsgId: string;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
  model: string;
  messages: any[];
  tools: any[];
  reasoningEffort: string;
  signal: AbortSignal;
}

/**
 * Streams OpenAI-compatible chat completion.
 * When network is offline or low/unstable, NEVER throws a network error to the user:
 * keeps emitting `network_waiting` (so UI continues showing "thinking") and retries until network recovers.
 */
export async function streamChatCompletionWithRetry(opts: StreamCallOptions): Promise<{
  content: string;
  reasoning: string;
  toolCalls: any[];
  totalTokens?: number;
  visionRejected?: boolean;
}> {
  let content = '';
  let reasoning = '';
  const toolCallsMap = new Map<
    number,
    { id: string; type: 'function'; function: { name: string; arguments: string } }
  >();
  let totalTokens = 0;

  while (!opts.signal.aborted) {
    try {
      const endpoint = `${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...opts.headers,
      };
      if (opts.apiKey && opts.apiKey.trim()) {
        reqHeaders['Authorization'] = `Bearer ${opts.apiKey.trim()}`;
      }

      const body: Record<string, any> = {
        model: opts.model || 'gpt-4o',
        messages: opts.messages,
        tools: opts.tools.length > 0 ? opts.tools : undefined,
        tool_choice: opts.tools.length > 0 ? 'auto' : undefined,
        stream: true,
      };

      if (opts.reasoningEffort && opts.reasoningEffort !== 'default') {
        body.reasoning_effort = opts.reasoningEffort;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(body),
        signal: opts.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        // If server 502/503/504 or gateway timeout, treat as transient network issue and keep thinking
        if (response.status >= 502 && response.status <= 504) {
          throw new TypeError(`Transient gateway status ${response.status}`);
        }
        // If model rejects `reasoning_effort` parameter, retry once without it
        if (
          response.status === 400 &&
          body.reasoning_effort &&
          errBody.toLowerCase().includes('reasoning')
        ) {
          opts.reasoningEffort = 'default';
          continue;
        }
        // A model may be flagged as vision-capable yet still reject image parts. Recover
        // gracefully so the agent keeps running with OCR/text tools instead of dying here.
        const hasImageInput = opts.messages.some(
          (m: any) =>
            Array.isArray(m.content) &&
            m.content.some((p: any) => p && p.type === 'image_url')
        );
        if (
          (response.status === 400 || response.status === 415 || response.status === 422) &&
          hasImageInput &&
          /image|vision|multimodal|image_url/i.test(errBody)
        ) {
          return {
            content,
            reasoning,
            toolCalls: [],
            totalTokens,
            visionRejected: true,
          };
        }
        throw new Error(
          `Provider API Error (${response.status}): ${errBody || response.statusText}`
        );
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream') && !response.body) {
        const json: any = await response.json();
        const choice = json.choices?.[0]?.message;
        if (choice?.content) {
          content += choice.content;
          db.appendRamMessageDelta(
            opts.assistantMsgId,
            opts.sessionId,
            choice.content,
            '',
            estimateTokens(choice.content)
          );
          agentEvents.emit({
            type: 'assistant_delta',
            sessionId: opts.sessionId,
            payload: { messageId: opts.assistantMsgId, delta: choice.content },
            timestamp: Date.now(),
          });
        }
        const calls = choice?.tool_calls || [];
        return {
          content,
          reasoning: choice?.reasoning_content || '',
          toolCalls: calls,
          totalTokens: json.usage?.total_tokens,
        };
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (!opts.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith('data:')) continue;
          const dataStr = line.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.usage?.total_tokens) {
              totalTokens = parsed.usage.total_tokens;
            }

            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            const reasoningDelta =
              delta.reasoning_content || delta.reasoning || delta.thinking || '';
            if (reasoningDelta) {
              reasoning += reasoningDelta;
              db.appendRamMessageDelta(
                opts.assistantMsgId,
                opts.sessionId,
                '',
                reasoningDelta,
                estimateTokens(reasoningDelta)
              );
              agentEvents.emit({
                type: 'assistant_reasoning',
                sessionId: opts.sessionId,
                payload: { messageId: opts.assistantMsgId, delta: reasoningDelta },
                timestamp: Date.now(),
              });
            }

            if (delta.content) {
              content += delta.content;
              db.appendRamMessageDelta(
                opts.assistantMsgId,
                opts.sessionId,
                delta.content,
                '',
                estimateTokens(delta.content)
              );
              agentEvents.emit({
                type: 'assistant_delta',
                sessionId: opts.sessionId,
                payload: { messageId: opts.assistantMsgId, delta: delta.content },
                timestamp: Date.now(),
              });
            }

            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                let existing = toolCallsMap.get(idx);
                if (!existing) {
                  existing = {
                    id: tc.id || `call_${Date.now()}_${idx}`,
                    type: 'function',
                    function: {
                      name: tc.function?.name || '',
                      arguments: tc.function?.arguments || '',
                    },
                  };
                  toolCallsMap.set(idx, existing);
                } else {
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.function.name += tc.function.name;
                  if (tc.function?.arguments)
                    existing.function.arguments += tc.function.arguments;
                }
              }
            }
          } catch {
            // ignore partial JSON line
          }
        }
      }

      return {
        content,
        reasoning,
        toolCalls: Array.from(toolCallsMap.values()),
        totalTokens,
      };
    } catch (err: any) {
      if (opts.signal.aborted) {
        throw err;
      }

      const isNetworkIssue =
        err instanceof TypeError ||
        /fetch failed|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket|Transient/i.test(
          err?.message || ''
        );

      if (isNetworkIssue) {
        // Network resilience requirement: never throw network error; keep showing "thinking" and wait for network recovery
        agentEvents.emit({
          type: 'network_waiting',
          sessionId: opts.sessionId,
          payload: {
            status: 'thinking',
            detail: 'Waiting for network connection...',
          },
          timestamp: Date.now(),
        });
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }

      throw err;
    }
  }

  return {
    content,
    reasoning,
    toolCalls: Array.from(toolCallsMap.values()),
    totalTokens,
  };
}
