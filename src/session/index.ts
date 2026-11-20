import crypto from 'node:crypto';
import { db, SessionRow } from '../db/index.js';
import { getDataDir } from '../datadir/index.js';
import { runAgentLoop, abortSessionRun, isSessionRunning } from '../agents/agent.js';

const ALPHANUMERIC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generates an exact 30-character alphanumeric session ID including numbers and letters.
 */
export function generate30DigitSessionId(): string {
  const bytes = crypto.randomBytes(30);
  let id = '';
  for (let i = 0; i < 30; i++) {
    id += ALPHANUMERIC[bytes[i] % ALPHANUMERIC.length];
  }
  return id;
}

export function getDefaultWorkspace(): string {
  const saved = db.getSetting('default_workspace', '');
  if (saved && saved.trim()) return saved.trim();
  const base = getDataDir().baseDir;
  db.setSetting('default_workspace', base);
  return base;
}

export function setDefaultWorkspace(workspacePath: string): string {
  db.setSetting('default_workspace', workspacePath);
  return workspacePath;
}

export function createNewSession(params: {
  sessionId?: string;
  title?: string;
  workspace?: string;
  providerId?: string;
  modelId?: string;
}): SessionRow {
  const id =
    params.sessionId && params.sessionId.length === 30
      ? params.sessionId
      : generate30DigitSessionId();

  const existing = db.getSession(id);
  if (existing) return existing;

  const workspace = params.workspace || getDefaultWorkspace();
  const providerId =
    params.providerId || db.getSetting('active_provider', 'pollinations');
  const modelId =
    params.modelId || db.getSetting('active_model', 'openai');

  const now = Date.now();
  return db.createSession({
    id,
    title: params.title || 'New Task',
    workspace,
    provider_id: providerId,
    model_id: modelId,
    status: 'idle',
    context_tokens: 0,
    created_at: now,
    updated_at: now,
  });
}

export async function submitUserPromptToSession(params: {
  sessionId?: string;
  prompt: string;
  workspace?: string;
  providerId?: string;
  modelId?: string;
  attachments?: { name: string; path: string; size: number; type?: string }[];
}): Promise<{ session: SessionRow; userMessageId: string }> {
  const titleFromPrompt =
    params.prompt.trim().slice(0, 64) || 'Autonomous Agent Session';

  let session = params.sessionId ? db.getSession(params.sessionId) : null;
  if (!session) {
    session = createNewSession({
      sessionId: params.sessionId,
      title: titleFromPrompt,
      workspace: params.workspace,
      providerId: params.providerId,
      modelId: params.modelId,
    });
  } else {
    const patch: Partial<SessionRow> = {};
    if (session.title === 'New Task' && params.prompt.trim()) {
      patch.title = titleFromPrompt;
    }
    if (params.workspace) patch.workspace = params.workspace;
    if (params.providerId) patch.provider_id = params.providerId;
    if (params.modelId) patch.model_id = params.modelId;
    if (Object.keys(patch).length > 0) {
      session = db.updateSession(session.id, patch) || session;
    }
  }

  let finalPromptContent = params.prompt;
  if (params.attachments && params.attachments.length > 0) {
    const pathsFormatted = params.attachments
      .map((a) => `- ${a.name}: ${a.path}`)
      .join('\n');
    finalPromptContent = `${params.prompt}\n\n[System Attachment Notice: The user has attached the following file(s)/folder(s) in this chat session. Their absolute file paths in .mythgram/uploads are listed below. Please inspect and read them first using your file_read / file_list / read_directory tools before proceeding:]\n${pathsFormatted}`;
  }

  const userMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  db.createOrUpdateRamMessage({
    id: userMsgId,
    sessionId: session.id,
    role: 'user',
    content: finalPromptContent,
    attachmentsJson:
      params.attachments && params.attachments.length > 0
        ? JSON.stringify(params.attachments)
        : undefined,
    tokens: Math.ceil(finalPromptContent.length / 4),
    createdAt: Date.now(),
  });
  db.flushRamToSqlite();

  // Launch the background autonomous ReAct loop without blocking other sessions
  setImmediate(() => {
    runAgentLoop(session!.id).catch((err) => {
      console.error(`[Session ${session!.id}] Background agent error:`, err);
    });
  });

  return {
    session: db.getSession(session.id) || session,
    userMessageId: userMsgId,
  };
}

export { abortSessionRun, isSessionRunning };
