import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  agent as createAgentApp,
  PROTOCOL_VERSION,
  RequestError,
  type AgentContext,
  type ContentBlock,
  type PermissionOption,
  type SessionModeState,
  type SessionUpdate,
  type Stream,
  type ToolKind,
} from '@agentclientprotocol/sdk';
import { db } from '../db/index.js';
import { getDataDir, initDataDir } from '../datadir/index.js';
import { ensureCustomAgentsStore, setSessionCustomAgentId } from '../custom-agents/index.js';
import { appendUserPromptToSession, createNewSession, getDefaultWorkspace } from '../session/index.js';
import {
  abortSessionRun,
  agentEvents,
  isSessionRunning,
  runAgentLoop,
  type StreamEvent,
} from '../agents/agent.js';
import { resolveUserInteraction } from '../tools/interactive-store.js';
import { initializeMcp } from '../mcp/index.js';
import {
  ACP_DEFAULT_MODE_ID,
  buildAcpModeState,
  resolveConfiguredAcpAgentId,
} from './settings.js';
import { createStdioStream } from './stdio.js';

const AGENT_NAME = 'mythgram';
const AGENT_TITLE = 'Mythgram';
const AGENT_VERSION = '1.0.0';

interface AcpSessionState {
  sessionId: string;
  cwd: string;
  modeId: string;
}

const acpSessions = new Map<string, AcpSessionState>();

const TOOL_KINDS: Record<string, ToolKind> = {
  file_read: 'read',
  file_list: 'read',
  read_directory: 'read',
  read_todos: 'read',
  list_artifacts: 'read',
  list_sub_agents: 'read',
  list_skills: 'read',
  list_available_mcp_servers: 'read',
  list_available_application_connectors: 'read',
  schedule_list: 'read',
  schedule_get: 'read',
  grep: 'search',
  glob: 'search',
  astgrep: 'search',
  lsp: 'search',
  memory_search: 'search',
  knowledge_search: 'search',
  web_search: 'search',
  image_search: 'search',
  github_repository_search: 'search',
  file_write: 'edit',
  str_replace: 'edit',
  apply_patch: 'edit',
  save_artifacts: 'edit',
  shall_tool: 'execute',
  wait: 'execute',
  schedule_create: 'execute',
  schedule_run_now: 'execute',
  schedule_delete: 'execute',
  fatch_web_urls: 'fetch',
  embed_url: 'fetch',
  todo_write: 'think',
  submit_plan: 'think',
  ask_question_to_user: 'think',
  ask_for_something: 'think',
};

function toolKindFor(toolName: string): ToolKind {
  return TOOL_KINDS[toolName] || 'other';
}

function truncate(value: string, max = 8000): string {
  return value.length > max ? `${value.slice(0, max)}\n… (truncated)` : value;
}

function formatToolResult(result: unknown): string {
  if (result === undefined || result === null) return '';
  if (typeof result === 'string') return truncate(result);
  try {
    return truncate(JSON.stringify(result, null, 2));
  } catch {
    return truncate(String(result));
  }
}

/**
 * Converts ACP prompt content blocks into the text + attachments shape that the
 * Mythgram runtime understands. Images are written into the datadir uploads
 * folder so the agent can inspect them with its normal file tools.
 */
async function promptToSessionInput(
  sessionId: string,
  blocks: ContentBlock[]
): Promise<{
  text: string;
  attachments: { name: string; path: string; size: number; type?: string }[];
}> {
  const parts: string[] = [];
  const attachments: { name: string; path: string; size: number; type?: string }[] = [];
  const uploadsDir = getDataDir().uploadsDir;
  let imageIndex = 0;

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        if (block.text.trim()) parts.push(block.text);
        break;
      case 'resource_link':
        parts.push(
          `[Referenced resource: ${block.name || block.uri} (${block.uri})]`
        );
        break;
      case 'resource': {
        const resource = block.resource;
        if ('text' in resource && typeof resource.text === 'string') {
          parts.push(`[Resource ${resource.uri}]\n${resource.text}`);
        } else if (resource.uri.startsWith('file://')) {
          parts.push(`[Resource file: ${fileURLToPath(resource.uri)}]`);
        } else {
          parts.push(`[Resource: ${resource.uri}]`);
        }
        break;
      }
      case 'image': {
        await fs.mkdir(uploadsDir, { recursive: true });
        const extension = block.mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
        const fileName = `acp_${sessionId}_${Date.now()}_${imageIndex++}.${extension}`;
        const filePath = path.join(uploadsDir, fileName);
        const buffer = Buffer.from(block.data, 'base64');
        await fs.writeFile(filePath, buffer);
        attachments.push({
          name: fileName,
          path: filePath,
          size: buffer.length,
          type: block.mimeType,
        });
        parts.push(`[Image attached: ${filePath}]`);
        break;
      }
      case 'audio':
        parts.push('[Audio content was provided but Mythgram does not support audio input.]');
        break;
    }
  }

  return { text: parts.join('\n\n'), attachments };
}

/** Streams Mythgram agent events to the ACP client as session updates. */
class AcpEventBridge {
  private queue: Promise<void> = Promise.resolve();
  private messageId: string | null = null;
  private thoughtId: string | null = null;
  private lastReportedUsage = -1;

  constructor(
    private readonly client: AgentContext,
    private readonly sessionId: string
  ) {}

  public handle(event: StreamEvent): void {
    switch (event.type) {
      case 'assistant_start':
        this.messageId = `acp_${event.payload?.messageId || Date.now()}`;
        this.thoughtId = `${this.messageId}_thought`;
        break;
      case 'assistant_delta': {
        const text = String(event.payload?.delta || '');
        if (text) {
          this.push({
            sessionUpdate: 'agent_message_chunk',
            messageId: this.messageId,
            content: { type: 'text', text },
          });
        }
        break;
      }
      case 'assistant_reasoning': {
        const text = String(event.payload?.delta || '');
        if (text) {
          this.push({
            sessionUpdate: 'agent_thought_chunk',
            messageId: this.thoughtId,
            content: { type: 'text', text },
          });
        }
        break;
      }
      case 'tool_call_start': {
        const toolName = String(event.payload?.toolName || 'tool');
        this.push({
          sessionUpdate: 'tool_call',
          toolCallId: String(event.payload?.toolCallId || ''),
          title: toolName,
          name: toolName,
          kind: toolKindFor(toolName),
          status: 'in_progress',
          rawInput: event.payload?.args,
        });
        break;
      }
      case 'tool_call_done': {
        const resultText = formatToolResult(event.payload?.result);
        this.push({
          sessionUpdate: 'tool_call_update',
          toolCallId: String(event.payload?.toolCallId || ''),
          status: event.payload?.status === 'error' ? 'failed' : 'completed',
          content: resultText
            ? [{ type: 'content', content: { type: 'text', text: resultText } }]
            : [],
          rawOutput: event.payload?.result,
        });
        break;
      }
      case 'context_usage': {
        const used = Number(event.payload?.contextTokens) || 0;
        const size = Number(event.payload?.contextWindow) || 0;
        if (size > 0 && used !== this.lastReportedUsage) {
          this.lastReportedUsage = used;
          this.push({ sessionUpdate: 'usage_update', used, size });
        }
        break;
      }
      case 'interactive_request':
        void this.handleInteractiveRequest(event.payload);
        break;
      case 'error': {
        const message = String(event.payload?.message || 'Unknown error');
        this.push({
          sessionUpdate: 'agent_message_chunk',
          messageId: `acp_error_${Date.now()}`,
          content: { type: 'text', text: `\n\nError: ${message}` },
        });
        break;
      }
      default:
        break;
    }
  }

  public flush(): Promise<void> {
    return this.queue;
  }

  private push(update: SessionUpdate): void {
    this.queue = this.queue
      .then(() => this.client.notify('session/update', { sessionId: this.sessionId, update }))
      .catch(() => {
        // The client may have disconnected; never break the agent loop because of it.
      });
  }

  private async handleInteractiveRequest(payload: any): Promise<void> {
    const promptId = String(payload?.promptId || '');
    const toolCallId = String(payload?.toolCallId || promptId);
    const kind = String(payload?.kind || '');
    const data = payload?.data || {};

    try {
      if (kind === 'ask_question_to_user' && Array.isArray(data.questions)) {
        const answers: Array<{ question: string; answer: string }> = [];
        for (const question of data.questions) {
          const options: PermissionOption[] =
            Array.isArray(question.options) && question.options.length > 0
              ? question.options.map((option: string, index: number) => ({
                  optionId: `opt_${index}`,
                  name: String(option),
                  kind: 'allow_once',
                }))
              : [{ optionId: 'opt_0', name: 'Continue', kind: 'allow_once' }];

          const response = await this.client.request('session/request_permission', {
            sessionId: this.sessionId,
            toolCall: {
              toolCallId,
              title: String(question.question || 'Question'),
              status: 'pending',
              rawInput: { context: question.context },
            },
            options,
          });

          if (response.outcome.outcome === 'selected') {
            const index = Number(response.outcome.optionId.replace('opt_', ''));
            answers.push({
              question: String(question.question || ''),
              answer: String(question.options?.[index] ?? ''),
            });
          } else {
            answers.push({ question: String(question.question || ''), answer: '' });
          }
        }
        resolveUserInteraction(promptId, answers);
        return;
      }

      if (kind === 'submit_plan') {
        const planOptions: PermissionOption[] = [
          { optionId: 'approve', name: 'Approve plan', kind: 'allow_once' },
          { optionId: 'cancel', name: 'Cancel plan', kind: 'reject_once' },
        ];
        const response = await this.client.request('session/request_permission', {
          sessionId: this.sessionId,
          toolCall: {
            toolCallId,
            title: 'Approve implementation plan',
            status: 'pending',
            rawInput: { plan: data.plan },
          },
          options: planOptions,
        });
        const approved =
          response.outcome.outcome === 'selected' && response.outcome.optionId === 'approve';
        resolveUserInteraction(promptId, { decision: approved ? 'approved' : 'cancelled' });
        return;
      }

      resolveUserInteraction(promptId, {
        cancelled: true,
        reason: `The ${kind || 'interactive'} prompt is not supported by this ACP client.`,
      });
    } catch {
      resolveUserInteraction(promptId, {
        cancelled: true,
        reason: 'The interactive prompt was cancelled by the client.',
      });
    }
  }
}

function resolveWorkspace(cwd: string | undefined): string {
  const fallback = getDefaultWorkspace();
  if (!cwd || !cwd.trim()) return fallback;
  if (!path.isAbsolute(cwd)) return path.resolve(fallback, cwd);
  return path.resolve(cwd);
}

function sessionModeState(state: AcpSessionState): Promise<SessionModeState> {
  return buildAcpModeState(state.modeId);
}

function registerSessionState(sessionId: string, cwd: string, modeId: string): AcpSessionState {
  const state: AcpSessionState = {
    sessionId,
    cwd,
    modeId: modeId || ACP_DEFAULT_MODE_ID,
  };
  acpSessions.set(sessionId, state);
  return state;
}

export function createAcpAgentApp() {
  const app = createAgentApp({ name: AGENT_NAME });

  app.onRequest('initialize', async ({ params }) => {
    const requested = Number(params.protocolVersion);
    return {
      protocolVersion: requested === PROTOCOL_VERSION ? requested : PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          image: true,
          audio: false,
          embeddedContext: true,
        },
        sessionCapabilities: {
          list: {},
        },
      },
      agentInfo: {
        name: AGENT_NAME,
        title: AGENT_TITLE,
        version: AGENT_VERSION,
      },
      authMethods: [],
    };
  });

  app.onRequest('session/new', async ({ params }) => {
    const cwd = resolveWorkspace(params.cwd);
    const configuredMode = await resolveConfiguredAcpAgentId();
    const session = createNewSession({ workspace: cwd, title: 'ACP Session' });

    if (configuredMode) {
      setSessionCustomAgentId(session.id, configuredMode);
    }
    const state = registerSessionState(session.id, cwd, configuredMode || ACP_DEFAULT_MODE_ID);

    return {
      sessionId: session.id,
      modes: await sessionModeState(state),
    };
  });

  app.onRequest('session/load', async ({ params, client }) => {
    const session = db.getSession(params.sessionId);
    if (!session) {
      throw new RequestError(-32002, `Session not found: ${params.sessionId}`);
    }

    const cwd = resolveWorkspace(params.cwd || session.workspace);
    if (cwd !== session.workspace) {
      db.updateSession(session.id, { workspace: cwd });
    }

    const configuredMode = await resolveConfiguredAcpAgentId();
    if (configuredMode) {
      setSessionCustomAgentId(session.id, configuredMode);
    }
    const state = registerSessionState(session.id, cwd, configuredMode || ACP_DEFAULT_MODE_ID);

    for (const message of db.getSessionMessages(session.id)) {
      if (message.role === 'user' && message.content.trim()) {
        await client.notify('session/update', {
          sessionId: session.id,
          update: {
            sessionUpdate: 'user_message_chunk',
            messageId: message.id,
            content: { type: 'text', text: message.content },
          },
        });
      } else if (message.role === 'assistant' && message.content.trim()) {
        await client.notify('session/update', {
          sessionId: session.id,
          update: {
            sessionUpdate: 'agent_message_chunk',
            messageId: message.id,
            content: { type: 'text', text: message.content },
          },
        });
      }
    }

    return { modes: await sessionModeState(state) };
  });

  app.onRequest('session/list', () => ({
    sessions: db.listSessions().map((session) => ({
      sessionId: session.id,
      cwd: session.workspace,
      title: session.title,
      updatedAt: new Date(session.updated_at).toISOString(),
    })),
  }));

  app.onRequest('session/set_mode', async ({ params, client }) => {
    const session = db.getSession(params.sessionId);
    if (!session) {
      throw new RequestError(-32002, `Session not found: ${params.sessionId}`);
    }

    const modes = await buildAcpModeState();
    if (!modes.availableModes.some((mode) => mode.id === params.modeId)) {
      throw RequestError.invalidParams(undefined, `Unknown session mode: ${params.modeId}`);
    }

    const state = registerSessionState(params.sessionId, session.workspace, params.modeId);
    setSessionCustomAgentId(
      params.sessionId,
      params.modeId === ACP_DEFAULT_MODE_ID ? null : params.modeId
    );

    await client.notify('session/update', {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'current_mode_update',
        currentModeId: state.modeId,
      },
    });

    return {};
  });

  app.onNotification('session/cancel', ({ params }) => {
    abortSessionRun(params.sessionId);
  });

  app.onRequest('session/prompt', async ({ params, client }) => {
    const session = db.getSession(params.sessionId);
    if (!session) {
      throw new RequestError(-32002, `Session not found: ${params.sessionId}`);
    }

    if (isSessionRunning(session.id)) {
      throw new RequestError(-32000, 'This session is already running a turn.');
    }

    const { text, attachments } = await promptToSessionInput(session.id, params.prompt);
    if (!text.trim() && attachments.length === 0) {
      throw RequestError.invalidParams(undefined, 'The prompt is empty.');
    }

    await appendUserPromptToSession({
      sessionId: session.id,
      prompt: text,
      attachments,
    });

    const bridge = new AcpEventBridge(client, session.id);
    const unsubscribe = agentEvents.subscribe(session.id, (event) => bridge.handle(event));

    try {
      await runAgentLoop(session.id);
    } finally {
      unsubscribe();
      await bridge.flush();
    }

    const finalSession = db.getSession(session.id);
    const status = finalSession?.status;
    return {
      stopReason: status === 'aborted' ? 'cancelled' : status === 'error' ? 'refusal' : 'end_turn',
    };
  });

  return app;
}

/** Runs an ACP agent over the given stream, or over stdio when none is provided. */
export async function startAcpServer(options: { stream?: Stream } = {}): Promise<void> {
  initDataDir();
  await ensureCustomAgentsStore();

  const app = createAcpAgentApp();
  const connection = app.connect(options.stream ?? createStdioStream());

  void initializeMcp().catch(() => {
    // MCP servers are optional; the agent still works with its native tools.
  });

  process.stderr.write(`[Mythgram ACP] ${AGENT_TITLE} agent listening on stdio\n`);

  void connection.closed.then(() => {
    for (const sessionId of acpSessions.keys()) {
      abortSessionRun(sessionId);
    }
  });

  await connection.closed;
}
