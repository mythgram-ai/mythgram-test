import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db/index.js';
import { getProviderRuntimeCredentials } from '../providers/index.js';
import { getSubAgentOpenAIToolsList, executeNativeTool } from '../tools/index.js';
import {
  getSubAgentByName,
  ensureSubAgentsStore,
  filterAllowedSubAgentTools,
} from '../sub-agents/index.js';
import { agentEvents, streamChatCompletionWithRetry } from './agent.js';
import { isMcpToolName } from '../mcp/index.js';

// Map of parentSessionId -> Set of AbortControllers for all active sub-agents in that session
const sessionSubAgentAbortControllers = new Map<string, Set<AbortController>>();

// Map of subAgentRunId -> AbortController
const activeSubAgentControllers = new Map<string, AbortController>();

export function abortSubAgentsForSession(parentSessionId: string) {
  const set = sessionSubAgentAbortControllers.get(parentSessionId);
  if (!set) return;
  for (const ctrl of set) {
    try {
      ctrl.abort();
    } catch {
      // ignore
    }
  }
  sessionSubAgentAbortControllers.delete(parentSessionId);
}

export function isSubAgentRunning(runId: string): boolean {
  return activeSubAgentControllers.has(runId);
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function generateId(prefix: string = 'submsg'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeToolResultForTransport(result: any): any {
  if (!result || Array.isArray(result) || typeof result !== 'object') return result;
  const copy: any = { ...result };
  if (typeof copy.data_url === 'string' && copy.data_url.length > 500) {
    copy.data_url = '[image_data_attached_as_vision_input]';
  }
  return copy;
}

export interface SubAgentExecutionRequest {
  runId?: string;
  parentSessionId: string;
  parentToolCallId: string;
  agentName: string;
  task: string;
  sendMyContext?: boolean;
  waitForOutput: boolean;
  parentSignal?: AbortSignal;
}

export interface SubAgentExecutionResult {
  runId: string;
  agent: string;
  status: 'completed' | 'running' | 'aborted' | 'error';
  output?: string;
  output_file_path?: string;
}

/**
 * Executes a single sub-agent with no iteration limits, sharing the exact same LLM settings
 * as the main agent, using the 2-second RAM-buffered SQLite writer, and streaming live events
 * over `agentEvents` (both under `runId` and forwarded to `parentSessionId`).
 * Returns ONLY the final output text (no reasoning, no intermediate tool calls) to the main agent.
 */
export async function runSingleSubAgent(
  req: SubAgentExecutionRequest
): Promise<SubAgentExecutionResult> {
  const subAgentDef = await getSubAgentByName(req.agentName);
  if (!subAgentDef) {
    throw new Error(
      `Sub-agent "${req.agentName}" not found. Call list_sub_agents to see available sub-agents.`
    );
  }

  const parentSession = db.getSession(req.parentSessionId);
  const workspace = parentSession?.workspace || process.cwd();
  const providerId =
    parentSession?.provider_id || db.getSetting('active_provider', 'pollinations');
  const modelId =
    parentSession?.model_id || db.getSetting('active_model', 'openai');
  const reasoningEffort = db.getSetting('reasoning_effort', 'default');

  const runId =
    req.runId ||
    `subrun_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const { subAgentOutputsDir } = await ensureSubAgentsStore();
  const outputFilePath = path.join(
    subAgentOutputsDir,
    `${runId}_${subAgentDef.name}.md`
  );

  const startedAt = Date.now();
  db.upsertSubAgentRun({
    id: runId,
    parent_session_id: req.parentSessionId,
    parent_tool_call_id: req.parentToolCallId,
    agent_name: subAgentDef.name,
    task: req.task,
    status: 'running',
    final_output: '',
    output_file_path: req.waitForOutput ? undefined : outputFilePath,
    created_at: startedAt,
    updated_at: startedAt,
  });

  // Notify parent session UI that a sub-agent run has started
  agentEvents.emit({
    type: 'sub_agent_status' as any,
    sessionId: req.parentSessionId,
    payload: {
      runId,
      parentToolCallId: req.parentToolCallId,
      agentName: subAgentDef.name,
      task: req.task,
      status: 'running',
      outputFilePath: req.waitForOutput ? undefined : outputFilePath,
    },
    timestamp: startedAt,
  });

  const executeLoop = async (): Promise<string> => {
    const abortController = new AbortController();
    activeSubAgentControllers.set(runId, abortController);
    db.setStreamActive(runId, true);

    let set = sessionSubAgentAbortControllers.get(req.parentSessionId);
    if (!set) {
      set = new Set();
      sessionSubAgentAbortControllers.set(req.parentSessionId, set);
    }
    set.add(abortController);

    if (req.parentSignal) {
      if (req.parentSignal.aborted) {
        abortController.abort();
      } else {
        req.parentSignal.addEventListener(
          'abort',
          () => abortController.abort(),
          { once: true }
        );
      }
    }

    // Seed initial user task message into the sub-agent's RAM/SQLite stream
    let initialUserPrompt = req.task;
    if (req.sendMyContext) {
      const parentMsgs = db
        .getSessionMessages(req.parentSessionId)
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-12);
      if (parentMsgs.length > 0) {
        const contextTranscript = parentMsgs
          .map((m) => `[${m.role.toUpperCase()}]: ${m.content || ''}`)
          .join('\n\n');
        initialUserPrompt = `### Shared Conversation Context from Main Agent\n${contextTranscript}\n\n### Your Assigned Sub-Agent Task\n${req.task}`;
      }
    }

    const userMsgId = generateId('subusr');
    db.createOrUpdateRamMessage({
      id: userMsgId,
      sessionId: runId,
      role: 'user',
      content: initialUserPrompt,
      tokens: estimateTokens(initialUserPrompt),
      createdAt: Date.now(),
    });

    const allowedToolNames = filterAllowedSubAgentTools(subAgentDef.tools);
    const pendingVisionQueue: {
      type: 'image';
      mimeType: string;
      dataUrl: string;
      filePath: string;
    }[] = [];

    let visionSupported: boolean | null = null;
    let finalAssistantText = '';

    try {
      while (!abortController.signal.aborted) {
        const providerCreds = getProviderRuntimeCredentials(providerId);
        if (visionSupported === null) visionSupported = providerCreds.visionSupport;

        const subSystemPrompt = `${subAgentDef.system_prompt}

## Sub-Agent Operating Environment
- Sub-Agent Name: ${subAgentDef.name}
- Active Workspace Root: ${workspace}
- Always use ABSOLUTE file paths starting with "/".
- Execute all required steps using your native tools until your assigned task is 100% complete, then respond with a clear, comprehensive final output.`;

        const historyRows = db.getSessionMessages(runId);
        const apiMessages: any[] = [
          {
            role: 'system',
            content: subSystemPrompt,
          },
        ];

        for (const row of historyRows) {
          if (row.role === 'system') continue;
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

        if (pendingVisionQueue.length > 0 && visionSupported) {
          const visionParts: any[] = [
            {
              type: 'text',
              text: 'Attached image(s) from read_image tool for visual inspection:',
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
          pendingVisionQueue.length = 0;
        }

        const toolsList = getSubAgentOpenAIToolsList(
          allowedToolNames,
          visionSupported ?? true
        );
        const assistantMsgId = generateId('submsg');

        db.createOrUpdateRamMessage({
          id: assistantMsgId,
          sessionId: runId,
          role: 'assistant',
          content: '',
          reasoning: '',
          tokens: 0,
          createdAt: Date.now(),
        });

        agentEvents.emit({
          type: 'assistant_start',
          sessionId: runId,
          payload: { messageId: assistantMsgId, runId },
          timestamp: Date.now(),
        });

        const streamResult = await streamChatCompletionWithRetry({
          sessionId: runId,
          assistantMsgId,
          baseUrl: providerCreds.baseUrl,
          apiKey: providerCreds.apiKey,
          headers: providerCreds.headers,
          model: modelId,
          messages: apiMessages,
          tools: toolsList,
          reasoningEffort,
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) break;

        if (streamResult.visionRejected) {
          visionSupported = false;
          continue;
        }

        const toolCalls = streamResult.toolCalls;
        const toolCallsJson =
          toolCalls.length > 0 ? JSON.stringify(toolCalls) : undefined;

        if (streamResult.content && streamResult.content.trim()) {
          finalAssistantText = streamResult.content;
        }

        db.createOrUpdateRamMessage({
          id: assistantMsgId,
          sessionId: runId,
          role: 'assistant',
          content: streamResult.content,
          reasoning: streamResult.reasoning,
          toolCallsJson,
          tokens: estimateTokens(streamResult.content + streamResult.reasoning),
        });

        agentEvents.emit({
          type: 'assistant_done',
          sessionId: runId,
          payload: {
            messageId: assistantMsgId,
            content: streamResult.content,
            reasoning: streamResult.reasoning,
            toolCalls,
          },
          timestamp: Date.now(),
        });

        if (toolCalls.length === 0) {
          break;
        }

        for (const tc of toolCalls) {
          if (abortController.signal.aborted) break;

          const callId = tc.id || generateId('subcall');
          const toolName = tc.function?.name || '';
          const rawArgsStr = tc.function?.arguments || '{}';
          let parsedArgs: any = {};
          try {
            parsedArgs = JSON.parse(rawArgsStr);
          } catch {
            parsedArgs = {};
          }

          const activityId = generateId('subact');
          const actStarted = Date.now();

          db.upsertToolActivity({
            id: activityId,
            session_id: runId,
            tool_call_id: callId,
            tool_name: toolName,
            args_json: JSON.stringify(parsedArgs),
            result_json: '',
            status: 'running',
            created_at: actStarted,
            updated_at: actStarted,
          });

          agentEvents.emit({
            type: 'tool_call_start',
            sessionId: runId,
            payload: {
              activityId,
              toolCallId: callId,
              toolName,
              args: parsedArgs,
            },
            timestamp: actStarted,
          });

          let toolOutputObj: any;
          let status: 'completed' | 'error' = 'completed';

          try {
            if (!allowedToolNames.includes(toolName) && !isMcpToolName(toolName)) {
              throw new Error(
                `Tool "${toolName}" is restricted or not enabled for sub-agent "${subAgentDef.name}".`
              );
            }
            toolOutputObj = await executeNativeTool(toolName, parsedArgs, {
              sessionId: runId,
              workspace,
              visionSupport: Boolean(visionSupported),
              isSubAgent: true,
              signal: abortController.signal,
              onVisionAttachment: (att) => {
                pendingVisionQueue.push(att);
              },
            });
          } catch (toolErr: any) {
            status = 'error';
            toolOutputObj = {
              error: true,
              message: toolErr?.message || String(toolErr),
            };
          }

          const transportSafeOutput = sanitizeToolResultForTransport(toolOutputObj);
          const llmResultStr = JSON.stringify(transportSafeOutput);

          db.upsertToolActivity({
            id: activityId,
            session_id: runId,
            tool_call_id: callId,
            tool_name: toolName,
            args_json: JSON.stringify(parsedArgs),
            result_json: llmResultStr,
            status,
            created_at: actStarted,
            updated_at: Date.now(),
          });

          const toolMsgId = generateId('subtool');
          db.createOrUpdateRamMessage({
            id: toolMsgId,
            sessionId: runId,
            role: 'tool',
            name: toolName,
            toolCallId: callId,
            content: llmResultStr,
            tokens: estimateTokens(llmResultStr),
            createdAt: Date.now(),
          });

          agentEvents.emit({
            type: 'tool_call_done',
            sessionId: runId,
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

      const finalStatus = abortController.signal.aborted ? 'aborted' : 'completed';
      const cleanFinalOutput =
        finalAssistantText.trim() ||
        (finalStatus === 'aborted'
          ? 'Sub-agent execution was aborted.'
          : 'Sub-agent completed task.');

      if (!req.waitForOutput) {
        const fileReport = `# Sub-Agent Output: ${subAgentDef.name}\n- **Run ID**: ${runId}\n- **Status**: ${finalStatus}\n- **Completed At**: ${new Date().toISOString()}\n\n## Task\n${req.task}\n\n## Final Output\n${cleanFinalOutput}\n`;
        await fs.writeFile(outputFilePath, fileReport, 'utf-8');
      }

      db.upsertSubAgentRun({
        id: runId,
        parent_session_id: req.parentSessionId,
        parent_tool_call_id: req.parentToolCallId,
        agent_name: subAgentDef.name,
        task: req.task,
        status: finalStatus,
        final_output: cleanFinalOutput,
        output_file_path: req.waitForOutput ? undefined : outputFilePath,
        created_at: startedAt,
        updated_at: Date.now(),
      });
      db.flushRamToSqlite();

      agentEvents.emit({
        type: 'session_status',
        sessionId: runId,
        payload: { status: finalStatus, finalOutput: cleanFinalOutput },
        timestamp: Date.now(),
      });

      agentEvents.emit({
        type: 'sub_agent_status' as any,
        sessionId: req.parentSessionId,
        payload: {
          runId,
          parentToolCallId: req.parentToolCallId,
          agentName: subAgentDef.name,
          task: req.task,
          status: finalStatus,
          finalOutput: cleanFinalOutput,
          outputFilePath: req.waitForOutput ? undefined : outputFilePath,
        },
        timestamp: Date.now(),
      });

      return cleanFinalOutput;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (!req.waitForOutput) {
        await fs
          .writeFile(
            outputFilePath,
            `# Sub-Agent Error: ${subAgentDef.name}\n\nError: ${errMsg}\n`,
            'utf-8'
          )
          .catch(() => {});
      }
      db.upsertSubAgentRun({
        id: runId,
        parent_session_id: req.parentSessionId,
        parent_tool_call_id: req.parentToolCallId,
        agent_name: subAgentDef.name,
        task: req.task,
        status: 'error',
        final_output: `Error: ${errMsg}`,
        output_file_path: req.waitForOutput ? undefined : outputFilePath,
        created_at: startedAt,
        updated_at: Date.now(),
      });
      db.flushRamToSqlite();

      agentEvents.emit({
        type: 'session_status',
        sessionId: runId,
        payload: { status: 'error', message: errMsg },
        timestamp: Date.now(),
      });

      agentEvents.emit({
        type: 'sub_agent_status' as any,
        sessionId: req.parentSessionId,
        payload: {
          runId,
          parentToolCallId: req.parentToolCallId,
          agentName: subAgentDef.name,
          task: req.task,
          status: 'error',
          finalOutput: `Error: ${errMsg}`,
        },
        timestamp: Date.now(),
      });

      return `Error in sub-agent ${subAgentDef.name}: ${errMsg}`;
    } finally {
      activeSubAgentControllers.delete(runId);
      db.setStreamActive(runId, false);
      set?.delete(abortController);
      db.flushRamToSqlite();
    }
  };

  if (!req.waitForOutput) {
    // Write initial placeholder file immediately so main agent can check it at any time
    await fs.writeFile(
      outputFilePath,
      `# Sub-Agent Running: ${subAgentDef.name}\n- **Run ID**: ${runId}\n- **Status**: running\n- **Task**: ${req.task}\n\nSub-agent is currently executing in the background. When completed, the final output will be written to this file.\n`,
      'utf-8'
    );
    setImmediate(() => {
      executeLoop().catch((err) => {
        console.error(`[SubAgent ${runId}] Background error:`, err);
      });
    });
    return {
      runId,
      agent: subAgentDef.name,
      status: 'running',
      output_file_path: outputFilePath,
    };
  }

  const finalOutput = await executeLoop();
  return {
    runId,
    agent: subAgentDef.name,
    status: 'completed',
    output: finalOutput,
  };
}
