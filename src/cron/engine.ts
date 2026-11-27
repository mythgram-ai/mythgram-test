import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { createNewSession, submitUserPromptToSession } from '../session/index.js';
import { abortSessionRun, isSessionRunning } from '../agents/agent.js';
import { getCustomAgentById, setSessionCustomAgentId } from '../custom-agents/index.js';
import * as store from './store.js';
import {
  computeNextRun,
  describeNormalTrigger,
  getUpcomingRuns,
  isValidTimezone,
  localDateTimeStringToUtc,
  parseCronExpression,
  parseTimeOfDay,
  previewNormalSchedule,
  validateNormalTrigger,
} from './schedule.js';
import {
  authenticateWebhook,
  buildWebhookPrompt,
  dedupeKey,
  extractEventType,
  filtersMatch,
  generateWebhookSecret,
  generateWebhookToken,
  isIpAllowed,
  maskSecret,
  matchEventType,
  normalizeWebhookTrigger,
  parseWebhookPayload,
  payloadPreview,
  validateWebhookTrigger,
  webhookRejection,
} from './webhook.js';
import type {
  CronEngineStatus,
  NormalTrigger,
  RunStatus,
  RunTrigger,
  ScheduleAgentConfig,
  ScheduleDefinition,
  SchedulePreview,
  ScheduleRun,
  WebhookRequestInput,
  WebhookResult,
  WebhookTrigger,
} from './types.js';

const TICK_INTERVAL_MS = Math.max(
  2000,
  Number(process.env.MYTHGRAM_CRON_TICK_MS || 10_000) || 10_000
);
const MAX_PENDING_WEBHOOK_EVENTS = 100;
const DEFAULT_TIMEOUT_SECONDS = 0;

export interface ScheduleInput {
  name?: string;
  description?: string;
  prompt?: string;
  method?: 'normal' | 'webhook';
  enabled?: boolean;
  normal?: Partial<NormalTrigger> & Record<string, unknown>;
  webhook?: Partial<WebhookTrigger> & Record<string, unknown>;
  agent?: Partial<ScheduleAgentConfig> & Record<string, unknown>;
}

interface ActiveRun {
  runId: string;
  scheduleId: string;
  sessionId: string;
  startedAt: number;
  timeoutSeconds: number;
}

interface PendingWebhookEvent {
  payload: unknown;
  eventType: string;
  sourceIp?: string;
  receivedAt: number;
  headers: Record<string, string>;
}

interface PendingWebhookBatch {
  events: PendingWebhookEvent[];
  firstAt: number;
  debounceSeconds: number;
}

const activeRuns = new Map<string, ActiveRun>();
const scheduleActiveRun = new Map<string, string>();
const pendingWebhooks = new Map<string, PendingWebhookBatch>();
const debounceTimers = new Map<string, NodeJS.Timeout>();
const dedupeCache = new Map<string, number>();

let engineTimer: NodeJS.Timeout | null = null;
let engineStartedAt: number | null = null;
let lastTickAt: number | null = null;
let tickInProgress = false;
let lastScheduleCount = 0;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function parseDateInput(value: unknown, timezone: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const parsed = localDateTimeStringToUtc(text, timezone);
  if (Number.isFinite(parsed)) return parsed;
  const native = Date.parse(text);
  return Number.isFinite(native) ? native : NaN;
}

function normalizeWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<number>();
  for (const item of value) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function normalizeDaysOfMonth(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<number>();
  for (const item of value) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 1 && n <= 31) set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function normalizeNormalTrigger(raw: any): NormalTrigger {
  const input = raw && typeof raw === 'object' ? raw : {};
  const modes = ['once', 'interval', 'cron', 'daily', 'weekly', 'monthly'];
  const mode = modes.includes(input.mode) ? input.mode : 'daily';
  const timezone =
    typeof input.timezone === 'string' && input.timezone.trim()
      ? input.timezone.trim()
      : 'UTC';
  const units = ['minutes', 'hours', 'days'];
  const intervalUnit = units.includes(input.interval_unit)
    ? input.interval_unit
    : 'minutes';

  const startAt = parseDateInput(input.start_at, timezone);
  const endAt = parseDateInput(input.end_at, timezone);
  const runAt = parseDateInput(input.run_at, timezone);

  return {
    mode,
    timezone,
    start_at: Number.isFinite(startAt as number) ? (startAt as number) : null,
    end_at: Number.isFinite(endAt as number) ? (endAt as number) : null,
    run_at: Number.isFinite(runAt as number) ? (runAt as number) : null,
    interval_value: clampInt(input.interval_value, 15, 1, 100_000),
    interval_unit: intervalUnit,
    cron_expression:
      typeof input.cron_expression === 'string'
        ? input.cron_expression.trim()
        : '0 9 * * *',
    time_of_day:
      typeof input.time_of_day === 'string' && input.time_of_day.trim()
        ? input.time_of_day.trim()
        : '09:00',
    weekdays: normalizeWeekdays(input.weekdays),
    days_of_month: normalizeDaysOfMonth(input.days_of_month),
    skip_if_missed: input.skip_if_missed === undefined ? true : Boolean(input.skip_if_missed),
    catch_up_grace_seconds: clampInt(
      input.catch_up_grace_seconds,
      60,
      0,
      86_400
    ),
  };
}

function normalizeAgentConfig(raw: any): ScheduleAgentConfig {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    agent_id: input.agent_id ? String(input.agent_id) : null,
    provider_id: input.provider_id ? String(input.provider_id) : null,
    model_id: input.model_id ? String(input.model_id) : null,
    workspace: input.workspace ? String(input.workspace) : null,
    timeout_seconds: clampInt(
      input.timeout_seconds,
      DEFAULT_TIMEOUT_SECONDS,
      0,
      7 * 86_400
    ),
  };
}

function normalizeScheduleName(value: unknown): string {
  return String(value || '').trim();
}

function computeScheduleStatus(schedule: ScheduleDefinition): ScheduleDefinition {
  if (!schedule.enabled) {
    schedule.status = schedule.status === 'completed' ? 'completed' : 'paused';
    schedule.next_run_at = null;
    return schedule;
  }
  if (schedule.method === 'webhook') {
    schedule.status = 'active';
    schedule.next_run_at = null;
    return schedule;
  }
  const next = computeNextRun(schedule, Date.now());
  schedule.next_run_at = next;
  if (next == null) {
    schedule.status = 'completed';
    schedule.enabled = false;
  } else {
    schedule.status = 'active';
  }
  return schedule;
}

async function buildAndValidateSchedule(
  input: ScheduleInput,
  existing: ScheduleDefinition | null
): Promise<ScheduleDefinition> {
  const now = Date.now();
  const method =
    input.method === 'webhook'
      ? 'webhook'
      : input.method === 'normal'
        ? 'normal'
        : existing?.method || 'normal';
  const name = normalizeScheduleName(input.name ?? existing?.name);
  const description = String(input.description ?? existing?.description ?? '').trim();
  const prompt = String(input.prompt ?? existing?.prompt ?? '').trim();
  const enabled =
    input.enabled === undefined ? existing?.enabled ?? true : Boolean(input.enabled);

  const errors: string[] = [];
  if (!name) errors.push('Schedule name is required.');
  if (name.length > 120) errors.push('Schedule name must be 120 characters or fewer.');
  if (description.length > 2000) errors.push('Description must be 2000 characters or fewer.');
  if (prompt.length > 50_000) errors.push('Prompt must be 50,000 characters or fewer.');

  const agent = normalizeAgentConfig(input.agent ?? existing?.agent);
  if (agent.agent_id) {
    const customAgent = await getCustomAgentById(agent.agent_id);
    if (!customAgent) errors.push('The selected custom agent no longer exists.');
  }

  let normal: NormalTrigger | undefined;
  let webhook: WebhookTrigger | undefined;

  if (method === 'normal') {
    normal = normalizeNormalTrigger({
      ...(existing?.method === 'normal' && existing.normal ? existing.normal : {}),
      ...(input.normal || {}),
    });
    if (!isValidTimezone(normal.timezone)) {
      errors.push('Choose a valid IANA timezone.');
    }
    errors.push(...validateNormalTrigger(normal));
    if (!prompt) errors.push('A prompt is required for a normal schedule.');
    if (normal.mode === 'once' && normal.run_at != null) {
      if (!existing && normal.run_at <= now) {
        errors.push('The one-time date must be in the future.');
      }
    }
  } else {
    const existingWebhook =
      existing?.method === 'webhook' && existing.webhook ? existing.webhook : null;
    webhook = normalizeWebhookTrigger(input.webhook ?? existingWebhook ?? {}, existingWebhook);
    // A client must never be able to overwrite a stored secret with a masked value.
    if (existingWebhook) {
      webhook.secret = existingWebhook.secret;
      webhook.token = existingWebhook.token;
    }
    errors.push(...validateWebhookTrigger(webhook));
    if (!prompt && !webhook.prompt_template?.trim()) {
      errors.push('A prompt is required (or provide a webhook prompt template).');
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const schedule: ScheduleDefinition = {
    id: existing?.id || generateId('sched'),
    name,
    description,
    prompt,
    method,
    enabled,
    status: 'paused',
    normal,
    webhook,
    agent,
    created_at: existing?.created_at || now,
    updated_at: now,
    next_run_at: existing?.next_run_at ?? null,
    last_run_at: existing?.last_run_at ?? null,
    last_status: existing?.last_status ?? null,
    run_count: existing?.run_count ?? 0,
    consecutive_failures: existing?.consecutive_failures ?? 0,
    last_session_id: existing?.last_session_id ?? null,
    last_error: existing?.last_error ?? null,
  };

  computeScheduleStatus(schedule);
  if (schedule.status === 'completed' && schedule.method === 'normal') {
    const hasFuture = computeNextRun(schedule, now) != null;
    if (!hasFuture && normal?.mode !== 'once') {
      // A recurring schedule whose end date has passed is complete rather than broken.
      schedule.last_error = schedule.last_error || 'The schedule end date has passed.';
    }
  }
  return schedule;
}

export async function ensureCronStore(): Promise<void> {
  await store.ensureCronStore();
}

export async function listSchedules(): Promise<ScheduleDefinition[]> {
  const schedules = await store.readSchedules();
  return schedules
    .map((schedule) => {
      if (schedule.method === 'normal' && schedule.enabled) {
        return {
          ...schedule,
          next_run_at: computeNextRun(schedule, Date.now()),
        };
      }
      return schedule;
    })
    .sort((a, b) => a.created_at - b.created_at);
}

export async function getSchedule(id: string): Promise<ScheduleDefinition | null> {
  return store.getScheduleById(id);
}

export async function createSchedule(input: ScheduleInput): Promise<ScheduleDefinition> {
  const schedule = await buildAndValidateSchedule(input, null);
  await store.saveSchedule(schedule);
  return schedule;
}

export async function updateSchedule(
  id: string,
  input: ScheduleInput
): Promise<ScheduleDefinition> {
  const existing = await store.getScheduleById(id);
  if (!existing) throw new Error('Schedule not found.');
  const schedule = await buildAndValidateSchedule(input, existing);
  if (schedule.method === 'normal' && schedule.enabled) {
    schedule.next_run_at = computeNextRun(schedule, Date.now());
  }
  await store.saveSchedule(schedule);
  return schedule;
}

export async function setScheduleEnabled(
  id: string,
  enabled: boolean
): Promise<ScheduleDefinition> {
  return store.withCronStoreLock(async () => {
    const schedules = await store.readSchedules();
    const schedule = schedules.find((s) => s.id === id);
    if (!schedule) throw new Error('Schedule not found.');
    schedule.enabled = enabled;
    schedule.updated_at = Date.now();
    if (enabled) {
      schedule.status = schedule.method === 'webhook' ? 'active' : 'active';
      schedule.next_run_at =
        schedule.method === 'normal' ? computeNextRun(schedule, Date.now()) : null;
      if (schedule.method === 'normal' && schedule.next_run_at == null) {
        schedule.status = 'completed';
        schedule.enabled = false;
      }
    } else {
      schedule.status = schedule.status === 'completed' ? 'completed' : 'paused';
      schedule.next_run_at = null;
    }
    await store.writeSchedules(schedules);
    return schedule;
  });
}

export async function deleteSchedule(id: string): Promise<boolean> {
  stopSchedule(id);
  pendingWebhooks.delete(id);
  const timer = debounceTimers.get(id);
  if (timer) clearTimeout(timer);
  debounceTimers.delete(id);
  return store.deleteScheduleRecord(id);
}

export async function duplicateSchedule(id: string): Promise<ScheduleDefinition> {
  const source = await store.getScheduleById(id);
  if (!source) throw new Error('Schedule not found.');
  const now = Date.now();
  const copy: ScheduleDefinition = {
    ...source,
    id: generateId('sched'),
    name: `${source.name} (copy)`.slice(0, 120),
    enabled: false,
    status: 'paused',
    created_at: now,
    updated_at: now,
    next_run_at: null,
    last_run_at: null,
    last_status: null,
    run_count: 0,
    consecutive_failures: 0,
    last_session_id: null,
    last_error: null,
    normal: source.normal ? { ...source.normal } : undefined,
    webhook: source.webhook
      ? {
          ...source.webhook,
          secret: generateWebhookSecret(),
          token: generateWebhookToken(),
          filters: source.webhook.filters.map((f) => ({ ...f })),
          event_types: [...source.webhook.event_types],
          allowed_ips: [...(source.webhook.allowed_ips || [])],
        }
      : undefined,
    agent: { ...source.agent },
  };
  await store.saveSchedule(copy);
  return copy;
}

export async function rotateWebhookCredentials(
  id: string
): Promise<{ schedule: ScheduleDefinition; secret: string; token: string }> {
  const schedule = await store.getScheduleById(id);
  if (!schedule || schedule.method !== 'webhook' || !schedule.webhook) {
    throw new Error('Webhook schedule not found.');
  }
  schedule.webhook.secret = generateWebhookSecret();
  schedule.webhook.token = generateWebhookToken();
  schedule.updated_at = Date.now();
  await store.saveSchedule(schedule);
  return { schedule, secret: schedule.webhook.secret, token: schedule.webhook.token };
}

export function webhookSecretPreview(schedule: ScheduleDefinition): string {
  return schedule.webhook ? maskSecret(schedule.webhook.secret) : '';
}

export async function getScheduleRuns(
  id: string,
  limit = 50
): Promise<ScheduleRun[]> {
  return store.getRunsForSchedule(id, limit);
}

export async function getScheduleRun(runId: string): Promise<ScheduleRun | null> {
  return store.getRunById(runId);
}

export function previewScheduleInput(input: ScheduleInput): SchedulePreview & {
  normalDescription?: string;
} {
  if (input.method === 'webhook') {
    const trigger = normalizeWebhookTrigger(input.webhook || {});
    const errors = validateWebhookTrigger(trigger);
    return {
      valid: errors.length === 0,
      errors,
      nextRuns: [],
      description: 'Runs when the webhook receives a matching event.',
    };
  }
  const normal = normalizeNormalTrigger(input.normal);
  const preview = previewNormalSchedule(normal, 5);
  return { ...preview, normalDescription: preview.description };
}

// ==================== ENGINE ====================

function isDedupeHit(scheduleId: string, key: string): boolean {
  if (!key) return false;
  const cacheKey = `${scheduleId}:${key}`;
  const expires = dedupeCache.get(cacheKey);
  if (!expires) return false;
  if (expires <= Date.now()) {
    dedupeCache.delete(cacheKey);
    return false;
  }
  return true;
}

function rememberDedupe(scheduleId: string, key: string, ttlSeconds: number): void {
  if (!key || !ttlSeconds) return;
  dedupeCache.set(`${scheduleId}:${key}`, Date.now() + ttlSeconds * 1000);
}

async function mutateSchedule(
  id: string,
  fn: (schedule: ScheduleDefinition) => ScheduleDefinition
): Promise<ScheduleDefinition | null> {
  return store.withCronStoreLock(async () => {
    const schedules = await store.readSchedules();
    const idx = schedules.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const updated = fn(schedules[idx]);
    schedules[idx] = updated;
    await store.writeSchedules(schedules);
    return updated;
  });
}

async function finishRun(
  runId: string,
  status: RunStatus,
  error?: string | null,
  summary?: string | null
): Promise<void> {
  const active = activeRuns.get(runId);
  if (!active) return;
  activeRuns.delete(runId);
  scheduleActiveRun.delete(active.scheduleId);
  const now = Date.now();
  await store.updateRun(runId, {
    status,
    finished_at: now,
    duration_ms: now - active.startedAt,
    error: error ?? null,
    summary: summary ?? null,
  });

  await mutateSchedule(active.scheduleId, (schedule) => {
    schedule.last_status = status;
    schedule.last_error = error ?? null;
    if (status === 'completed') {
      schedule.consecutive_failures = 0;
    } else if (status === 'failed') {
      schedule.consecutive_failures = (schedule.consecutive_failures || 0) + 1;
    }
    if (schedule.method === 'normal') {
      const next = schedule.enabled ? computeNextRun(schedule, now) : null;
      schedule.next_run_at = next;
      if (next == null && schedule.normal?.mode === 'once') {
        schedule.enabled = false;
        schedule.status = 'completed';
      } else if (next == null && schedule.enabled) {
        schedule.enabled = false;
        schedule.status = 'completed';
      }
    }
    schedule.updated_at = now;
    return schedule;
  });

  // A webhook event may have arrived while the run was in flight.
  void flushPendingWebhook(active.scheduleId).catch(() => undefined);
}

async function reconcileActiveRuns(): Promise<void> {
  const now = Date.now();
  for (const active of Array.from(activeRuns.values())) {
    const session = db.getSession(active.sessionId);
    if (!session) {
      await finishRun(active.runId, 'failed', 'The scheduled chat session was deleted.');
      continue;
    }
    const running = isSessionRunning(active.sessionId);
    if (running) {
      if (
        active.timeoutSeconds > 0 &&
        now - active.startedAt > active.timeoutSeconds * 1000
      ) {
        abortSessionRun(active.sessionId);
        await finishRun(
          active.runId,
          'failed',
          `Run exceeded the ${active.timeoutSeconds}s timeout and was stopped.`
        );
      }
      continue;
    }

    if (session.status === 'completed') {
      const messages = db.getSessionMessages(active.sessionId);
      const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant' && String(m.content || '').trim());
      const summary = lastAssistant
        ? String(lastAssistant.content).slice(0, 2000)
        : 'Run completed.';
      await finishRun(active.runId, 'completed', null, summary);
      continue;
    }
    if (session.status === 'error') {
      await finishRun(active.runId, 'failed', 'The agent run ended with an error.');
      continue;
    }
    if (session.status === 'aborted') {
      await finishRun(active.runId, 'stopped', 'Run was stopped.');
      continue;
    }

    // The session was created but the background loop has not marked it running yet.
    if (session.status === 'idle' && now - active.startedAt < 60_000) continue;

    await finishRun(active.runId, 'failed', 'The scheduled chat session stalled.');
  }
}

async function startRun(
  schedule: ScheduleDefinition,
  trigger: RunTrigger,
  options: {
    payload?: unknown;
    eventType?: string;
    sourceIp?: string;
    headers?: Record<string, string>;
    scheduledFor?: number | null;
  } = {}
): Promise<ScheduleRun> {
  const existingActive = scheduleActiveRun.get(schedule.id);
  if (existingActive) {
    throw new Error('This schedule is already running.');
  }

  const now = Date.now();
  const eventType = options.eventType || '';

  let sessionId = '';
  const canContinue =
    schedule.method === 'webhook' &&
    schedule.webhook?.session_mode === 'continue' &&
    schedule.last_session_id &&
    db.getSession(schedule.last_session_id) &&
    !isSessionRunning(schedule.last_session_id);

  if (canContinue) {
    sessionId = schedule.last_session_id as string;
  } else {
    const titleSuffix = eventType ? ` · ${eventType}` : '';
    const session = createNewSession({
      title: `⏰ ${schedule.name}${titleSuffix}`.slice(0, 160),
      workspace: schedule.agent.workspace || undefined,
      providerId: schedule.agent.provider_id || undefined,
      modelId: schedule.agent.model_id || undefined,
      scheduleId: schedule.id,
      origin: 'schedule',
    });
    sessionId = session.id;
  }

  if (schedule.agent.agent_id) {
    setSessionCustomAgentId(sessionId, schedule.agent.agent_id);
  }

  let prompt = schedule.prompt;
  if (schedule.method === 'webhook' && options.payload !== undefined) {
    prompt = buildWebhookPrompt(schedule, options.payload, eventType, {
      sourceIp: options.sourceIp,
      receivedAt: now,
      headers: options.headers,
    });
  } else if (trigger === 'manual') {
    prompt = `${schedule.prompt}\n\n[Manual run requested at ${new Date(now).toISOString()}]`;
  } else if (trigger === 'test' && options.payload !== undefined) {
    prompt = buildWebhookPrompt(schedule, options.payload, eventType || 'test', {
      sourceIp: options.sourceIp,
      receivedAt: now,
      headers: options.headers,
    });
  }

  const run: ScheduleRun = {
    id: generateId('run'),
    schedule_id: schedule.id,
    trigger,
    status: 'running',
    scheduled_for: options.scheduledFor ?? null,
    started_at: now,
    finished_at: null,
    duration_ms: null,
    session_id: sessionId,
    error: null,
    summary: null,
    payload_preview:
      options.payload !== undefined ? payloadPreview(options.payload) : null,
    event_type: eventType || null,
    source_ip: options.sourceIp || null,
    meta: { session_mode: canContinue ? 'continue' : 'new' },
  };
  await store.appendRun(run);

  activeRuns.set(run.id, {
    runId: run.id,
    scheduleId: schedule.id,
    sessionId,
    startedAt: now,
    timeoutSeconds: Number(schedule.agent.timeout_seconds || 0),
  });
  scheduleActiveRun.set(schedule.id, run.id);

  await mutateSchedule(schedule.id, (current) => {
    current.run_count = (current.run_count || 0) + 1;
    current.last_run_at = now;
    current.last_status = 'running';
    current.last_session_id = sessionId;
    current.updated_at = now;
    if (current.method === 'normal') {
      if (current.normal?.mode === 'once') {
        current.enabled = false;
        current.status = 'completed';
        current.next_run_at = null;
      } else {
        current.next_run_at = computeNextRun(current, now);
      }
    }
    return current;
  });

  try {
    await submitUserPromptToSession({
      sessionId,
      prompt,
      workspace: schedule.agent.workspace || undefined,
      providerId: schedule.agent.provider_id || undefined,
      modelId: schedule.agent.model_id || undefined,
    });
  } catch (err: any) {
    await finishRun(run.id, 'failed', err?.message || 'Failed to start the agent run.');
    throw err;
  }

  return run;
}

async function recordSkippedRun(
  schedule: ScheduleDefinition,
  reason: string,
  scheduledFor: number
): Promise<void> {
  const now = Date.now();
  await store.appendRun({
    id: generateId('run'),
    schedule_id: schedule.id,
    trigger: 'schedule',
    status: 'skipped',
    scheduled_for: scheduledFor,
    started_at: now,
    finished_at: now,
    duration_ms: 0,
    session_id: null,
    error: reason,
  });
  await mutateSchedule(schedule.id, (current) => {
    current.last_status = 'skipped';
    current.last_error = reason;
    current.updated_at = now;
    if (current.method === 'normal') {
      if (current.normal?.mode === 'once') {
        current.enabled = false;
        current.status = 'completed';
        current.next_run_at = null;
      } else {
        current.next_run_at = computeNextRun(current, now);
      }
    }
    return current;
  });
}

async function processDueSchedules(): Promise<void> {
  const now = Date.now();
  const schedules = await store.readSchedules();
  for (const schedule of schedules) {
    if (schedule.method !== 'normal' || !schedule.enabled) continue;
    if (scheduleActiveRun.has(schedule.id)) continue;
    if (!schedule.normal) continue;

    const next = schedule.next_run_at ?? computeNextRun(schedule, now);
    if (next == null) {
      if (schedule.normal.mode === 'once' || schedule.normal.end_at != null) {
        await mutateSchedule(schedule.id, (current) => {
          current.enabled = false;
          current.status = 'completed';
          current.next_run_at = null;
          current.updated_at = now;
          return current;
        });
      } else {
        await mutateSchedule(schedule.id, (current) => {
          current.next_run_at = computeNextRun(current, now);
          current.updated_at = now;
          return current;
        });
      }
      continue;
    }

    if (next > now) {
      if (next !== schedule.next_run_at) {
        await mutateSchedule(schedule.id, (current) => {
          current.next_run_at = next;
          return current;
        });
      }
      continue;
    }

    const graceSeconds = Number(schedule.normal.catch_up_grace_seconds ?? 60);
    const missedBy = now - next;
    if (missedBy > graceSeconds * 1000 && schedule.normal.skip_if_missed !== false) {
      await recordSkippedRun(
        schedule,
        `Missed the scheduled time by ${Math.round(missedBy / 1000)}s.`,
        next
      );
      continue;
    }

    try {
      const trigger: RunTrigger = missedBy > 5000 ? 'catch-up' : 'schedule';
      await startRun(schedule, trigger, { scheduledFor: next });
    } catch (err: any) {
      console.error(`[Cron] Failed to start schedule ${schedule.id}:`, err?.message || err);
    }
  }
}

function scheduleDebounceFlush(scheduleId: string, delaySeconds: number): void {
  const existing = debounceTimers.get(scheduleId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    debounceTimers.delete(scheduleId);
    void flushPendingWebhook(scheduleId).catch(() => undefined);
  }, Math.max(0, delaySeconds * 1000));
  if (timer.unref) timer.unref();
  debounceTimers.set(scheduleId, timer);
}

async function flushPendingWebhook(scheduleId: string): Promise<void> {
  const batch = pendingWebhooks.get(scheduleId);
  if (!batch || batch.events.length === 0) return;
  if (scheduleActiveRun.has(scheduleId)) {
    scheduleDebounceFlush(scheduleId, 5);
    return;
  }
  const remainingMs = batch.debounceSeconds * 1000 - (Date.now() - batch.firstAt);
  if (remainingMs > 0) {
    scheduleDebounceFlush(scheduleId, Math.max(1, Math.ceil(remainingMs / 1000)));
    return;
  }

  const schedule = await store.getScheduleById(scheduleId);
  if (!schedule || !schedule.enabled || schedule.method !== 'webhook') {
    pendingWebhooks.delete(scheduleId);
    return;
  }

  const events = batch.events.splice(0, batch.events.length);
  pendingWebhooks.delete(scheduleId);

  const single = events.length === 1;
  const payload = single
    ? events[0].payload
    : {
        count: events.length,
        events: events.map((e) => ({
          event_type: e.eventType,
          received_at: e.receivedAt,
          payload: e.payload,
        })),
      };
  const eventType = single ? events[0].eventType : 'batch';
  const first = events[0];

  try {
    await startRun(schedule, 'webhook', {
      payload,
      eventType,
      sourceIp: first.sourceIp,
      headers: first.headers,
    });
  } catch (err: any) {
    await store.appendRun({
      id: generateId('run'),
      schedule_id: scheduleId,
      trigger: 'webhook',
      status: 'failed',
      started_at: Date.now(),
      finished_at: Date.now(),
      duration_ms: 0,
      error: err?.message || 'Failed to start webhook run.',
      event_type: eventType,
      payload_preview: payloadPreview(payload),
    });
  }
}

async function flushAllPendingWebhooks(): Promise<void> {
  for (const scheduleId of Array.from(pendingWebhooks.keys())) {
    await flushPendingWebhook(scheduleId);
  }
}

function pruneDedupeCache(): void {
  const now = Date.now();
  for (const [key, expires] of dedupeCache.entries()) {
    if (expires <= now) dedupeCache.delete(key);
  }
}

async function tick(): Promise<void> {
  if (tickInProgress) return;
  tickInProgress = true;
  try {
    await reconcileActiveRuns();
    await processDueSchedules();
    await flushAllPendingWebhooks();
    pruneDedupeCache();
    lastScheduleCount = (await store.readSchedules()).length;
    lastTickAt = Date.now();
  } catch (err: any) {
    console.error('[Cron] Scheduler tick failed:', err?.message || err);
  } finally {
    tickInProgress = false;
  }
}

async function recoverInterruptedRuns(): Promise<void> {
  const runs = await store.readRuns();
  const interrupted = runs.filter(
    (run) => run.status === 'running' || run.status === 'queued' || run.status === 'debounced'
  );
  if (interrupted.length === 0) return;
  for (const run of interrupted) {
    await store.updateRun(run.id, {
      status: 'failed',
      finished_at: Date.now(),
      error: 'Interrupted by a backend restart.',
    });
  }
  const schedules = await store.readSchedules();
  for (const schedule of schedules) {
    if (schedule.last_status === 'running') {
      schedule.last_status = 'failed';
      schedule.last_error = 'Interrupted by a backend restart.';
      schedule.updated_at = Date.now();
    }
  }
  await store.writeSchedules(schedules);
}

export async function startCronEngine(): Promise<void> {
  if (engineTimer) return;
  await store.ensureCronStore();
  await recoverInterruptedRuns();

  // Recompute every next-run so a clock change or downtime cannot leave a schedule stranded.
  const schedules = await store.readSchedules();
  const now = Date.now();
  for (const schedule of schedules) {
    if (schedule.method === 'normal') {
      if (schedule.enabled) {
        schedule.next_run_at = computeNextRun(schedule, now);
        if (schedule.next_run_at == null && schedule.normal?.mode !== 'once') {
          schedule.status = 'completed';
          schedule.enabled = false;
        }
      } else if (schedule.status !== 'completed') {
        schedule.status = 'paused';
      }
    } else if (schedule.enabled) {
      schedule.status = 'active';
    }
    schedule.updated_at = now;
  }
  await store.writeSchedules(schedules);
  lastScheduleCount = schedules.length;

  engineStartedAt = now;
  lastTickAt = now;
  engineTimer = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
  if (engineTimer.unref) engineTimer.unref();
  console.log(`[Cron] Automation engine started (tick ${TICK_INTERVAL_MS}ms).`);
  void tick();
}

export function stopCronEngine(): void {
  if (engineTimer) clearInterval(engineTimer);
  engineTimer = null;
  engineStartedAt = null;
  for (const timer of debounceTimers.values()) clearTimeout(timer);
  debounceTimers.clear();
}

export function getCronEngineStatus(): CronEngineStatus {
  return {
    running: engineTimer !== null,
    startedAt: engineStartedAt,
    lastTickAt,
    tickIntervalMs: TICK_INTERVAL_MS,
    scheduleCount: lastScheduleCount,
    activeRunCount: activeRuns.size,
    pendingWebhookCount: Array.from(pendingWebhooks.values()).reduce(
      (total, batch) => total + batch.events.length,
      0
    ),
  };
}

export async function runScheduleNow(id: string): Promise<ScheduleRun> {
  const schedule = await store.getScheduleById(id);
  if (!schedule) throw new Error('Schedule not found.');
  return startRun(schedule, 'manual');
}

export function stopSchedule(id: string): number {
  let stopped = 0;
  for (const active of Array.from(activeRuns.values())) {
    if (active.scheduleId !== id) continue;
    abortSessionRun(active.sessionId);
    void finishRun(active.runId, 'stopped', 'Stopped by user.');
    stopped++;
  }
  const pending = pendingWebhooks.get(id);
  if (pending) {
    pendingWebhooks.delete(id);
    stopped += pending.events.length;
  }
  const timer = debounceTimers.get(id);
  if (timer) clearTimeout(timer);
  debounceTimers.delete(id);
  return stopped;
}

export function isScheduleRunning(id: string): boolean {
  return scheduleActiveRun.has(id);
}

async function checkRateLimits(
  schedule: ScheduleDefinition,
  now: number
): Promise<{ ok: boolean; error?: string }> {
  const webhook = schedule.webhook;
  if (!webhook) return { ok: true };

  if (webhook.cooldown_seconds && webhook.cooldown_seconds > 0) {
    const last = schedule.last_run_at || 0;
    if (now - last < webhook.cooldown_seconds * 1000) {
      return {
        ok: false,
        error: `Cooldown active: wait ${Math.ceil(
          (webhook.cooldown_seconds * 1000 - (now - last)) / 1000
        )}s before the next run.`,
      };
    }
  }

  if (webhook.max_runs_per_hour && webhook.max_runs_per_hour > 0) {
    const runs = await store.getRunsSince(schedule.id, now - 3_600_000);
    const accepted = runs.filter(
      (r) => r.status !== 'rejected' && r.status !== 'skipped'
    );
    if (accepted.length >= webhook.max_runs_per_hour) {
      return { ok: false, error: 'Hourly run limit reached for this webhook.' };
    }
  }
  if (webhook.max_runs_per_day && webhook.max_runs_per_day > 0) {
    const runs = await store.getRunsSince(schedule.id, now - 86_400_000);
    const accepted = runs.filter(
      (r) => r.status !== 'rejected' && r.status !== 'skipped'
    );
    if (accepted.length >= webhook.max_runs_per_day) {
      return { ok: false, error: 'Daily run limit reached for this webhook.' };
    }
  }
  return { ok: true };
}

async function recordRejectedWebhook(
  schedule: ScheduleDefinition,
  reason: string,
  input: WebhookRequestInput,
  eventType?: string
): Promise<void> {
  await store.appendRun({
    id: generateId('run'),
    schedule_id: schedule.id,
    trigger: 'webhook',
    status: 'rejected',
    started_at: Date.now(),
    finished_at: Date.now(),
    duration_ms: 0,
    error: reason,
    event_type: eventType || null,
    source_ip: input.ip || null,
    payload_preview: input.rawBody
      ? input.rawBody.length > 1200
        ? `${input.rawBody.slice(0, 1200)}…`
        : input.rawBody
      : null,
  });
}

async function handleWebhookForSchedule(
  schedule: ScheduleDefinition,
  input: WebhookRequestInput
): Promise<WebhookResult> {
  const now = Date.now();
  if (schedule.method !== 'webhook' || !schedule.webhook) {
    return webhookRejection(404, 'Webhook schedule not found.');
  }
  if (!schedule.enabled) {
    await recordRejectedWebhook(schedule, 'Schedule is paused.', input);
    return webhookRejection(409, 'Schedule is paused.');
  }
  if (!isIpAllowed(input.ip, schedule.webhook.allowed_ips)) {
    await recordRejectedWebhook(schedule, 'Source IP is not allowed.', input);
    return webhookRejection(403, 'Source IP is not allowed.');
  }

  const auth = authenticateWebhook(schedule.webhook, input, now);
  if (!auth.ok) {
    await recordRejectedWebhook(schedule, auth.error || 'Unauthorized.', input);
    return webhookRejection(401, auth.error || 'Unauthorized.');
  }

  const parsed = parseWebhookPayload(schedule.webhook, input.rawBody, input.headers);
  if (!parsed.ok) {
    await recordRejectedWebhook(schedule, parsed.error || 'Invalid payload.', input);
    return webhookRejection(400, parsed.error || 'Invalid payload.');
  }
  const payload = parsed.payload;
  const eventType = extractEventType(payload, schedule.webhook);

  if (!matchEventType(eventType, schedule.webhook.event_types)) {
    return {
      statusCode: 202,
      body: { ok: true, ignored: true, reason: 'Event type did not match.', event_type: eventType },
    };
  }
  if (!filtersMatch(payload, schedule.webhook)) {
    return {
      statusCode: 202,
      body: { ok: true, ignored: true, reason: 'Payload filters did not match.', event_type: eventType },
    };
  }

  const dedupe = dedupeKey(payload, schedule.webhook);
  if (isDedupeHit(schedule.id, dedupe)) {
    return {
      statusCode: 202,
      body: { ok: true, ignored: true, reason: 'Duplicate event ignored.', event_type: eventType },
    };
  }
  if (dedupe) {
    rememberDedupe(
      schedule.id,
      dedupe,
      Number(schedule.webhook.dedupe_ttl_seconds || 3600)
    );
  }

  const limits = await checkRateLimits(schedule, now);
  if (!limits.ok) {
    await recordRejectedWebhook(schedule, limits.error || 'Rate limited.', input, eventType);
    return webhookRejection(429, limits.error || 'Rate limited.', { event_type: eventType });
  }

  const shouldQueue =
    scheduleActiveRun.has(schedule.id) ||
    (Number(schedule.webhook.debounce_seconds || 0) > 0);

  if (shouldQueue) {
    let batch = pendingWebhooks.get(schedule.id);
    if (!batch) {
      batch = {
        events: [],
        firstAt: now,
        debounceSeconds: Number(schedule.webhook.debounce_seconds || 0),
      };
      pendingWebhooks.set(schedule.id, batch);
    }
    batch.events.push({
      payload,
      eventType,
      sourceIp: input.ip,
      receivedAt: now,
      headers: input.headers,
    });
    if (batch.events.length > MAX_PENDING_WEBHOOK_EVENTS) batch.events.shift();

    if (batch.debounceSeconds > 0) {
      scheduleDebounceFlush(schedule.id, batch.debounceSeconds);
    } else if (!scheduleActiveRun.has(schedule.id)) {
      scheduleDebounceFlush(schedule.id, 0);
    }

    return {
      statusCode: 202,
      body: {
        ok: true,
        queued: true,
        debounce_seconds: batch.debounceSeconds,
        pending_events: batch.events.length,
        event_type: eventType,
      },
    };
  }

  try {
    const run = await startRun(schedule, 'webhook', {
      payload,
      eventType,
      sourceIp: input.ip,
      headers: input.headers,
    });
    return {
      statusCode: 202,
      body: {
        ok: true,
        run_id: run.id,
        session_id: run.session_id,
        event_type: eventType,
      },
    };
  } catch (err: any) {
    const message = err?.message || 'Failed to start webhook run.';
    await recordRejectedWebhook(schedule, message, input, eventType);
    const statusCode = /already running/i.test(message) ? 429 : 500;
    return webhookRejection(statusCode, message, { event_type: eventType });
  }
}

export async function handleWebhookByToken(
  token: string,
  input: WebhookRequestInput
): Promise<WebhookResult> {
  const schedules = await store.readSchedules();
  const schedule = schedules.find(
    (s) => s.method === 'webhook' && s.webhook?.token === token
  );
  if (!schedule) return webhookRejection(404, 'Unknown webhook endpoint.');
  return handleWebhookForSchedule(schedule, input);
}

export async function handleWebhookById(
  id: string,
  input: WebhookRequestInput
): Promise<WebhookResult> {
  const schedule = await store.getScheduleById(id);
  if (!schedule) return webhookRejection(404, 'Unknown webhook endpoint.');
  return handleWebhookForSchedule(schedule, input);
}

export async function simulateWebhook(
  id: string,
  payload: unknown = { type: 'test', message: 'Mythgram webhook test event' }
): Promise<ScheduleRun> {
  const schedule = await store.getScheduleById(id);
  if (!schedule) throw new Error('Schedule not found.');
  if (schedule.method !== 'webhook') throw new Error('Schedule is not a webhook schedule.');
  return startRun(schedule, 'test', {
    payload,
    eventType: 'test',
    sourceIp: '127.0.0.1',
    headers: { 'content-type': 'application/json' },
  });
}

export { describeNormalTrigger, getUpcomingRuns, parseCronExpression, parseTimeOfDay };
