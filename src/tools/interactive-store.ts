import { agentEvents } from '../agents/agent.js';

export type InteractiveKind =
  | 'ask_for_something'
  | 'ask_question_to_user'
  | 'submit_plan'
  | 'connect_connector';

export interface PendingInteractivePrompt {
  id: string;
  sessionId: string;
  toolCallId: string;
  activityId?: string;
  kind: InteractiveKind;
  payload: any;
  createdAt: number;
  resolve: (value: any) => void;
}

const pendingPrompts = new Map<string, PendingInteractivePrompt>();

export function waitForUserInteraction(params: {
  sessionId: string;
  toolCallId: string;
  activityId?: string;
  kind: InteractiveKind;
  payload: any;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<any> {
  const promptId = params.toolCallId || `inter_${Date.now()}`;

  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    const entry: PendingInteractivePrompt = {
      id: promptId,
      sessionId: params.sessionId,
      toolCallId: params.toolCallId,
      activityId: params.activityId,
      kind: params.kind,
      payload: params.payload,
      createdAt: Date.now(),
      resolve: (val: any) => {
        if (timer) clearTimeout(timer);
        pendingPrompts.delete(promptId);
        agentEvents.emit({
          type: 'interactive_resolved',
          sessionId: params.sessionId,
          payload: {
            promptId,
            toolCallId: params.toolCallId,
            kind: params.kind,
            response: val,
          },
          timestamp: Date.now(),
        });
        resolve(val);
      },
    };

    pendingPrompts.set(promptId, entry);

    if (params.timeoutMs && params.timeoutMs > 0) {
      timer = setTimeout(() => {
        if (!pendingPrompts.has(promptId)) return;
        pendingPrompts.delete(promptId);
        agentEvents.emit({
          type: 'interactive_resolved',
          sessionId: params.sessionId,
          payload: {
            promptId,
            toolCallId: params.toolCallId,
            kind: params.kind,
            response: { timed_out: true },
          },
          timestamp: Date.now(),
        });
        reject(new Error('Timed out waiting for the user to complete the connection.'));
      }, params.timeoutMs);
    }

    if (params.signal) {
      if (params.signal.aborted) {
        if (timer) clearTimeout(timer);
        pendingPrompts.delete(promptId);
        reject(new Error('Operation aborted by user.'));
        return;
      }
      params.signal.addEventListener(
        'abort',
        () => {
          if (pendingPrompts.has(promptId)) {
            if (timer) clearTimeout(timer);
            pendingPrompts.delete(promptId);
            reject(new Error('Operation aborted by user.'));
          }
        },
        { once: true }
      );
    }

    agentEvents.emit({
      type: 'interactive_request',
      sessionId: params.sessionId,
      payload: {
        promptId,
        toolCallId: params.toolCallId,
        activityId: params.activityId,
        kind: params.kind,
        data: params.payload,
      },
      timestamp: entry.createdAt,
    });
  });
}

export function resolveUserInteraction(promptId: string, responseData: any): boolean {
  const entry = pendingPrompts.get(promptId);
  if (!entry) return false;
  entry.resolve(responseData);
  return true;
}

export function getPendingInteractionsForSession(sessionId: string) {
  const list: Array<{
    promptId: string;
    toolCallId: string;
    activityId?: string;
    kind: InteractiveKind;
    data: any;
    createdAt: number;
  }> = [];
  for (const p of pendingPrompts.values()) {
    if (p.sessionId === sessionId) {
      list.push({
        promptId: p.id,
        toolCallId: p.toolCallId,
        activityId: p.activityId,
        kind: p.kind,
        data: p.payload,
        createdAt: p.createdAt,
      });
    }
  }
  return list;
}

export function cancelPendingInteractionsForSession(sessionId: string) {
  for (const [id, p] of pendingPrompts.entries()) {
    if (p.sessionId === sessionId) {
      pendingPrompts.delete(id);
      p.resolve({ cancelled: true, reason: 'Session aborted by user.' });
    }
  }
}
