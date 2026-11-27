import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Globe2,
  History,
  Inbox,
  KeyRound,
  Link2,
  Loader2,
  Menu,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Power,
  RefreshCw,
  Repeat,
  RotateCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Square,
  Terminal,
  Timer,
  Trash2,
  Webhook,
  X,
  Zap,
} from 'lucide-react';

type ScheduleMethod = 'normal' | 'webhook';
type NormalMode = 'once' | 'interval' | 'cron' | 'daily' | 'weekly' | 'monthly';
type IntervalUnit = 'minutes' | 'hours' | 'days';
type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'regex'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'exists'
  | 'not_exists';

interface NormalConfig {
  mode: NormalMode;
  timezone: string;
  start_at?: number | null;
  end_at?: number | null;
  run_at?: number | null;
  interval_value?: number | null;
  interval_unit?: IntervalUnit | null;
  cron_expression?: string | null;
  time_of_day?: string | null;
  weekdays?: number[] | null;
  days_of_month?: number[] | null;
  skip_if_missed?: boolean;
  catch_up_grace_seconds?: number;
}

interface WebhookFilterView {
  id: string;
  path: string;
  operator: FilterOperator;
  value?: string;
  case_sensitive?: boolean;
}

interface WebhookView {
  url: string;
  auth_mode: 'signature' | 'token' | 'none';
  signature_header: string;
  signature_prefix: string;
  secret_preview: string;
  token: string;
  event_types: string[];
  event_type_path: string;
  filter_logic: 'all' | 'any';
  filters: WebhookFilterView[];
  dedupe_path: string;
  dedupe_ttl_seconds: number;
  debounce_seconds: number;
  cooldown_seconds: number;
  max_runs_per_hour: number;
  max_runs_per_day: number;
  max_payload_bytes: number;
  allowed_ips: string[];
  replay_tolerance_seconds: number;
  timestamp_header: string;
  session_mode: 'new' | 'continue';
  include_payload: boolean;
  prompt_template: string;
}

interface ScheduleItem {
  id: string;
  name: string;
  description: string;
  prompt: string;
  method: ScheduleMethod;
  enabled: boolean;
  status: 'active' | 'paused' | 'completed' | 'error';
  normal?: NormalConfig;
  webhook?: WebhookView;
  agent: {
    agent_id?: string | null;
    provider_id?: string | null;
    model_id?: string | null;
    workspace?: string | null;
    timeout_seconds?: number | null;
  };
  created_at: number;
  updated_at: number;
  next_run_at?: number | null;
  last_run_at?: number | null;
  last_status?: string | null;
  run_count: number;
  consecutive_failures: number;
  last_session_id?: string | null;
  last_error?: string | null;
  isRunning?: boolean;
  webhook_secret_preview?: string;
}

interface ScheduleRun {
  id: string;
  schedule_id: string;
  trigger: string;
  status: string;
  scheduled_for?: number | null;
  started_at: number;
  finished_at?: number | null;
  duration_ms?: number | null;
  session_id?: string | null;
  error?: string | null;
  summary?: string | null;
  payload_preview?: string | null;
  event_type?: string | null;
  source_ip?: string | null;
}

interface CustomAgentOption {
  id: string;
  name: string;
  logo?: string;
}

interface EngineStatus {
  running: boolean;
  startedAt: number | null;
  lastTickAt: number | null;
  tickIntervalMs: number;
  scheduleCount: number;
  activeRunCount: number;
  pendingWebhookCount: number;
}

interface AutomationPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
  onOpenSession: (sessionId: string) => void;
}

interface NormalDraft {
  mode: NormalMode;
  timezone: string;
  run_at: string;
  start_at: string;
  end_at: string;
  interval_value: number;
  interval_unit: IntervalUnit;
  cron_expression: string;
  time_of_day: string;
  weekdays: number[];
  days_of_month: number[];
  skip_if_missed: boolean;
  catch_up_grace_seconds: number;
}

interface WebhookDraft {
  auth_mode: 'signature' | 'token' | 'none';
  signature_header: string;
  signature_prefix: string;
  event_types: string;
  event_type_path: string;
  filter_logic: 'all' | 'any';
  filters: WebhookFilterView[];
  dedupe_path: string;
  dedupe_ttl_seconds: number;
  debounce_seconds: number;
  cooldown_seconds: number;
  max_runs_per_hour: number;
  max_runs_per_day: number;
  max_payload_bytes: number;
  allowed_ips: string;
  replay_tolerance_seconds: number;
  timestamp_header: string;
  session_mode: 'new' | 'continue';
  include_payload: boolean;
  prompt_template: string;
}

interface ScheduleDraft {
  id?: string;
  name: string;
  description: string;
  prompt: string;
  method: ScheduleMethod;
  enabled: boolean;
  agent_id: string;
  workspace: string;
  timeout_seconds: number;
  normal: NormalDraft;
  webhook: WebhookDraft;
}

interface PreviewState {
  valid: boolean;
  errors: string[];
  nextRuns: number[];
  description: string;
}

interface ToastState {
  type: 'success' | 'error' | 'info';
  message: string;
}

interface CreatedWebhookState {
  name: string;
  url: string;
  secret?: string | null;
  token?: string;
  authMode: string;
}

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const NORMAL_MODES: { value: NormalMode; label: string; icon: React.ReactNode }[] = [
  { value: 'once', label: 'Once', icon: <CalendarDays size={13} /> },
  { value: 'interval', label: 'Interval', icon: <Timer size={13} /> },
  { value: 'cron', label: 'Cron', icon: <Terminal size={13} /> },
  { value: 'daily', label: 'Daily', icon: <Clock size={13} /> },
  { value: 'weekly', label: 'Weekly', icon: <Repeat size={13} /> },
  { value: 'monthly', label: 'Monthly', icon: <CalendarClock size={13} /> },
];

const CRON_PRESETS = [
  { label: 'Every 5 min', value: '*/5 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily 09:00', value: '0 9 * * *' },
  { label: 'Weekdays 09:00', value: '0 9 * * 1-5' },
  { label: 'Mondays 09:00', value: '0 9 * * 1' },
  { label: '1st of month', value: '0 0 1 * *' },
  { label: 'Every 30 sec', value: '*/30 * * * * *' },
];

const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'in', label: 'is one of (comma list)' },
  { value: 'regex', label: 'matches regex' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'greater or equal' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'less or equal' },
  { value: 'exists', label: 'exists' },
  { value: 'not_exists', label: 'does not exist' },
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toZonedInput(ms: number | null | undefined, timeZone: string): string {
  if (!ms) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') map[part.type] = part.value;
    }
    return `${map.year}-${map.month}-${map.day}T${pad2(Number(map.hour))}:${map.minute}`;
  } catch {
    return '';
  }
}

function formatDate(ms: number | null | undefined, timeZone?: string): string {
  if (!ms) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function formatRelative(ms: number | null | undefined): string {
  if (!ms) return '';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  let text = '';
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) text = `${Math.round(abs / 60_000)}m`;
  else if (abs < 86_400_000) text = `${Math.round(abs / 3_600_000)}h`;
  else text = `${Math.round(abs / 86_400_000)}d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

function describeNormal(normal: NormalConfig | NormalDraft | undefined): string {
  if (!normal) return 'No schedule configured';
  const time = normal.time_of_day || '09:00';
  switch (normal.mode) {
    case 'once':
      return normal.run_at
        ? `Once · ${formatDate(
            typeof normal.run_at === 'number' ? normal.run_at : null,
            normal.timezone
          )}`
        : 'Once';
    case 'interval':
      return `Every ${normal.interval_value || 1} ${normal.interval_unit || 'minutes'}`;
    case 'cron':
      return `Cron ${normal.cron_expression || ''}`.trim();
    case 'daily':
      return `Daily at ${time}`;
    case 'weekly': {
      const days = (normal.weekdays || [])
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAYS.find((w) => w.value === d)?.label || d)
        .join(', ');
      return `Weekly on ${days || 'every day'} at ${time}`;
    }
    case 'monthly': {
      const days = (normal.days_of_month || []).slice().sort((a, b) => a - b).join(', ');
      return `Monthly on day ${days || '1'} at ${time}`;
    }
    default:
      return String(normal.mode);
  }
}

function statusLabel(schedule: ScheduleItem): string {
  if (schedule.isRunning) return 'Running';
  if (schedule.status === 'active') {
    return schedule.method === 'webhook' ? 'Listening' : 'Active';
  }
  if (schedule.status === 'completed') return 'Completed';
  if (schedule.status === 'error') return 'Error';
  return 'Paused';
}

function statusTone(schedule: ScheduleItem): string {
  if (schedule.isRunning) return 'running';
  if (schedule.status === 'active') return 'active';
  if (schedule.status === 'completed') return 'completed';
  if (schedule.status === 'error') return 'error';
  return 'paused';
}

function runTone(status: string): string {
  if (status === 'completed') return 'completed';
  if (status === 'running') return 'running';
  if (status === 'failed' || status === 'rejected') return 'failed';
  if (status === 'stopped') return 'stopped';
  if (status === 'skipped' || status === 'debounced') return 'skipped';
  return 'queued';
}

function defaultNormalDraft(timezone: string): NormalDraft {
  return {
    mode: 'daily',
    timezone,
    run_at: '',
    start_at: '',
    end_at: '',
    interval_value: 15,
    interval_unit: 'minutes',
    cron_expression: '0 9 * * *',
    time_of_day: '09:00',
    weekdays: [1, 2, 3, 4, 5],
    days_of_month: [1],
    skip_if_missed: true,
    catch_up_grace_seconds: 60,
  };
}

function defaultWebhookDraft(): WebhookDraft {
  return {
    auth_mode: 'signature',
    signature_header: 'X-Signature-256',
    signature_prefix: 'sha256=',
    event_types: '',
    event_type_path: 'type',
    filter_logic: 'all',
    filters: [],
    dedupe_path: '',
    dedupe_ttl_seconds: 3600,
    debounce_seconds: 0,
    cooldown_seconds: 0,
    max_runs_per_hour: 0,
    max_runs_per_day: 0,
    max_payload_bytes: 1048576,
    allowed_ips: '',
    replay_tolerance_seconds: 300,
    timestamp_header: 'X-Webhook-Timestamp',
    session_mode: 'new',
    include_payload: true,
    prompt_template: '',
  };
}

function emptyDraft(timezone: string): ScheduleDraft {
  return {
    name: '',
    description: '',
    prompt: '',
    method: 'normal',
    enabled: true,
    agent_id: '',
    workspace: '',
    timeout_seconds: 0,
    normal: defaultNormalDraft(timezone),
    webhook: defaultWebhookDraft(),
  };
}

function draftFromSchedule(schedule: ScheduleItem, timezone: string): ScheduleDraft {
  const normal = schedule.normal;
  const webhook = schedule.webhook;
  return {
    id: schedule.id,
    name: schedule.name,
    description: schedule.description || '',
    prompt: schedule.prompt || '',
    method: schedule.method,
    enabled: schedule.enabled,
    agent_id: schedule.agent?.agent_id || '',
    workspace: schedule.agent?.workspace || '',
    timeout_seconds: schedule.agent?.timeout_seconds || 0,
    normal: normal
      ? {
          mode: normal.mode,
          timezone: normal.timezone || timezone,
          run_at: toZonedInput(normal.run_at, normal.timezone || timezone),
          start_at: toZonedInput(normal.start_at, normal.timezone || timezone),
          end_at: toZonedInput(normal.end_at, normal.timezone || timezone),
          interval_value: normal.interval_value || 15,
          interval_unit: normal.interval_unit || 'minutes',
          cron_expression: normal.cron_expression || '0 9 * * *',
          time_of_day: normal.time_of_day || '09:00',
          weekdays:
            normal.weekdays && normal.weekdays.length > 0
              ? [...normal.weekdays]
              : [1, 2, 3, 4, 5],
          days_of_month:
            normal.days_of_month && normal.days_of_month.length > 0
              ? [...normal.days_of_month]
              : [1],
          skip_if_missed: normal.skip_if_missed !== false,
          catch_up_grace_seconds: normal.catch_up_grace_seconds ?? 60,
        }
      : defaultNormalDraft(timezone),
    webhook: webhook
      ? {
          auth_mode: webhook.auth_mode,
          signature_header: webhook.signature_header,
          signature_prefix: webhook.signature_prefix,
          event_types: (webhook.event_types || []).join(', '),
          event_type_path: webhook.event_type_path,
          filter_logic: webhook.filter_logic,
          filters: (webhook.filters || []).map((f) => ({ ...f })),
          dedupe_path: webhook.dedupe_path || '',
          dedupe_ttl_seconds: webhook.dedupe_ttl_seconds ?? 3600,
          debounce_seconds: webhook.debounce_seconds ?? 0,
          cooldown_seconds: webhook.cooldown_seconds ?? 0,
          max_runs_per_hour: webhook.max_runs_per_hour ?? 0,
          max_runs_per_day: webhook.max_runs_per_day ?? 0,
          max_payload_bytes: webhook.max_payload_bytes ?? 1048576,
          allowed_ips: (webhook.allowed_ips || []).join(', '),
          replay_tolerance_seconds: webhook.replay_tolerance_seconds ?? 300,
          timestamp_header: webhook.timestamp_header,
          session_mode: webhook.session_mode,
          include_payload: webhook.include_payload !== false,
          prompt_template: webhook.prompt_template || '',
        }
      : defaultWebhookDraft(),
  };
}

function normalPayload(draft: NormalDraft) {
  const dateOrNull = (value: string) => (value.trim() ? value.trim() : null);
  return {
    mode: draft.mode,
    timezone: draft.timezone,
    run_at: dateOrNull(draft.run_at),
    start_at: dateOrNull(draft.start_at),
    end_at: dateOrNull(draft.end_at),
    interval_value: Number(draft.interval_value) || 1,
    interval_unit: draft.interval_unit,
    cron_expression: draft.cron_expression,
    time_of_day: draft.time_of_day,
    weekdays: draft.weekdays,
    days_of_month: draft.days_of_month,
    skip_if_missed: draft.skip_if_missed,
    catch_up_grace_seconds: Number(draft.catch_up_grace_seconds) || 0,
  };
}

function webhookPayload(draft: WebhookDraft) {
  return {
    auth_mode: draft.auth_mode,
    signature_header: draft.signature_header,
    signature_prefix: draft.signature_prefix,
    event_types: draft.event_types
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    event_type_path: draft.event_type_path,
    filter_logic: draft.filter_logic,
    filters: draft.filters.map((f) => ({ ...f, value: f.value || '' })),
    dedupe_path: draft.dedupe_path,
    dedupe_ttl_seconds: Number(draft.dedupe_ttl_seconds) || 3600,
    debounce_seconds: Number(draft.debounce_seconds) || 0,
    cooldown_seconds: Number(draft.cooldown_seconds) || 0,
    max_runs_per_hour: Number(draft.max_runs_per_hour) || 0,
    max_runs_per_day: Number(draft.max_runs_per_day) || 0,
    max_payload_bytes: Number(draft.max_payload_bytes) || 1048576,
    allowed_ips: draft.allowed_ips
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    replay_tolerance_seconds: Number(draft.replay_tolerance_seconds) || 0,
    timestamp_header: draft.timestamp_header,
    session_mode: draft.session_mode,
    include_payload: draft.include_payload,
    prompt_template: draft.prompt_template,
  };
}

type CardAction =
  | 'edit'
  | 'run'
  | 'stop'
  | 'history'
  | 'duplicate'
  | 'pause'
  | 'resume'
  | 'copy-url'
  | 'test'
  | 'rotate'
  | 'delete';

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}> = ({ icon, label, onClick, danger, disabled }) => (
  <button
    type="button"
    className={`automation-menu-item ${danger ? 'is-danger' : ''}`}
    onClick={onClick}
    disabled={disabled}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const AutomationSkeleton: React.FC<{ index?: number }> = ({ index = 0 }) => (
  <div
    className="automation-card automation-skeleton-card"
    style={{ animationDelay: `${index * 70}ms` }}
    aria-hidden="true"
  >
    <div className="automation-skeleton-line" style={{ width: '38%' }} />
    <div className="automation-skeleton-line" style={{ width: '72%', height: 14 }} />
    <div className="automation-skeleton-line" style={{ width: '92%' }} />
    <div className="automation-skeleton-line" style={{ width: '60%' }} />
    <div className="automation-skeleton-stats">
      <span className="automation-skeleton-line" />
      <span className="automation-skeleton-line" />
      <span className="automation-skeleton-line" />
    </div>
    <div className="automation-skeleton-line" style={{ width: '48%', marginTop: 14 }} />
  </div>
);

const ScheduleCard: React.FC<{
  schedule: ScheduleItem;
  agentName: string;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onAction: (action: CardAction, schedule: ScheduleItem) => void;
}> = ({ schedule, agentName, menuOpen, onMenuToggle, onAction }) => {
  const normal = schedule.normal;
  const summary =
    schedule.method === 'webhook'
      ? schedule.webhook?.event_types?.length
        ? `On ${schedule.webhook.event_types.join(', ')}`
        : 'Any webhook event'
      : describeNormal(normal);
  const nextLabel =
    schedule.method === 'webhook'
      ? 'On event'
      : schedule.enabled
        ? formatDate(schedule.next_run_at, normal?.timezone)
        : 'Paused';
  const nextRelative =
    schedule.method === 'normal' && schedule.enabled && schedule.next_run_at
      ? formatRelative(schedule.next_run_at)
      : '';
  const lastRelative = schedule.last_run_at ? formatRelative(schedule.last_run_at) : '';

  return (
    <article className={`automation-card ${schedule.isRunning ? 'is-running' : ''}`}>
      <div className="automation-card-head">
        <span className={`automation-method method-${schedule.method}`}>
          {schedule.method === 'webhook' ? <Webhook size={12} /> : <Clock size={12} />}
          {schedule.method === 'webhook' ? 'Webhook' : 'Normal'}
        </span>
        <span className={`automation-status tone-${statusTone(schedule)}`}>
          <span className="automation-status-dot" />
          {statusLabel(schedule)}
        </span>
        <div className="automation-menu-wrap">
          <button
            type="button"
            className="automation-icon-btn"
            aria-label="Schedule options"
            title="More options"
            onClick={onMenuToggle}
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <div className="automation-menu" onClick={(e) => e.stopPropagation()}>
              <MenuItem
                icon={<Pencil size={13} />}
                label="Edit schedule"
                onClick={() => onAction('edit', schedule)}
              />
              <MenuItem
                icon={<Play size={13} />}
                label="Run now"
                disabled={schedule.isRunning}
                onClick={() => onAction('run', schedule)}
              />
              {schedule.isRunning && (
                <MenuItem
                  icon={<Square size={13} />}
                  label="Stop run"
                  onClick={() => onAction('stop', schedule)}
                />
              )}
              <MenuItem
                icon={<History size={13} />}
                label="Execution history"
                onClick={() => onAction('history', schedule)}
              />
              <MenuItem
                icon={<Copy size={13} />}
                label="Duplicate schedule"
                onClick={() => onAction('duplicate', schedule)}
              />
              <MenuItem
                icon={schedule.enabled ? <Pause size={13} /> : <Power size={13} />}
                label={schedule.enabled ? 'Pause schedule' : 'Resume schedule'}
                onClick={() => onAction(schedule.enabled ? 'pause' : 'resume', schedule)}
              />
              {schedule.method === 'webhook' && (
                <>
                  <div className="automation-menu-sep" />
                  <MenuItem
                    icon={<Link2 size={13} />}
                    label="Copy webhook URL"
                    onClick={() => onAction('copy-url', schedule)}
                  />
                  <MenuItem
                    icon={<Send size={13} />}
                    label="Send test event"
                    disabled={schedule.isRunning}
                    onClick={() => onAction('test', schedule)}
                  />
                  <MenuItem
                    icon={<RotateCw size={13} />}
                    label="Rotate secret"
                    onClick={() => onAction('rotate', schedule)}
                  />
                </>
              )}
              <div className="automation-menu-sep" />
              <MenuItem
                icon={<Trash2 size={13} />}
                label="Delete schedule"
                danger
                onClick={() => onAction('delete', schedule)}
              />
            </div>
          )}
        </div>
      </div>

      <h3 className="automation-card-title">{schedule.name}</h3>
      <p className="automation-card-desc">
        {schedule.description || schedule.prompt || 'No description provided.'}
      </p>

      <div className="automation-card-meta">
        <span>
          {schedule.method === 'webhook' ? <Webhook size={12} /> : <CalendarClock size={12} />}
          {summary}
        </span>
        <span>
          <Globe2 size={12} />
          {schedule.method === 'webhook'
            ? schedule.webhook?.auth_mode === 'signature'
              ? 'Signed webhook'
              : schedule.webhook?.auth_mode === 'token'
                ? 'Token protected'
                : 'Open endpoint'
            : normal?.timezone || 'UTC'}
        </span>
      </div>

      <div className="automation-card-stats">
        <div>
          <span className="automation-stat-label">Next run</span>
          <strong>{nextLabel}</strong>
          {nextRelative && <em>{nextRelative}</em>}
        </div>
        <div>
          <span className="automation-stat-label">Last run</span>
          <strong>{formatDate(schedule.last_run_at, normal?.timezone)}</strong>
          {lastRelative && <em>{lastRelative}</em>}
        </div>
        <div>
          <span className="automation-stat-label">Runs</span>
          <strong>{schedule.run_count}</strong>
          <em>{schedule.last_status ? `last: ${schedule.last_status}` : 'never run'}</em>
        </div>
        <div>
          <span className="automation-stat-label">Agent</span>
          <strong className="automation-agent-name">{agentName}</strong>
          <em>{schedule.agent?.timeout_seconds ? `${schedule.agent.timeout_seconds}s timeout` : 'no timeout'}</em>
        </div>
      </div>

      {schedule.last_error && (
        <div className="automation-card-error">
          <AlertTriangle size={12} />
          <span>{schedule.last_error}</span>
        </div>
      )}

      <div className="automation-card-actions">
        <button
          type="button"
          className="automation-action-btn primary"
          onClick={() => onAction('run', schedule)}
          disabled={schedule.isRunning}
        >
          {schedule.isRunning ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
          Run now
        </button>
        {schedule.isRunning ? (
          <button
            type="button"
            className="automation-action-btn danger"
            onClick={() => onAction('stop', schedule)}
          >
            <Square size={12} />
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="automation-action-btn"
            onClick={() => onAction('edit', schedule)}
          >
            <Pencil size={12} />
            Edit
          </button>
        )}
        <button
          type="button"
          className="automation-action-btn"
          onClick={() => onAction('history', schedule)}
        >
          <History size={12} />
          History
        </button>
      </div>
    </article>
  );
};

const EditorModal: React.FC<{
  draft: ScheduleDraft;
  customAgents: CustomAgentOption[];
  timezones: string[];
  preview: PreviewState | null;
  previewLoading: boolean;
  saving: boolean;
  error: string;
  existingWebhook?: WebhookView;
  onPatch: (patch: Partial<ScheduleDraft>) => void;
  onPatchNormal: (patch: Partial<NormalDraft>) => void;
  onPatchWebhook: (patch: Partial<WebhookDraft>) => void;
  onClose: () => void;
  onSave: () => void;
  onCopy: (text: string) => void;
  onRotateSecret: () => void;
  onTestWebhook: () => void;
}> = ({
  draft,
  customAgents,
  timezones,
  preview,
  previewLoading,
  saving,
  error,
  existingWebhook,
  onPatch,
  onPatchNormal,
  onPatchWebhook,
  onClose,
  onSave,
  onCopy,
  onRotateSecret,
  onTestWebhook,
}) => {
  const normal = draft.normal;
  const webhook = draft.webhook;
  const fullWebhookUrl = existingWebhook
    ? `${window.location.origin}${existingWebhook.url}`
    : '';

  const toggleWeekday = (value: number) => {
    const next = normal.weekdays.includes(value)
      ? normal.weekdays.filter((d) => d !== value)
      : [...normal.weekdays, value].sort((a, b) => a - b);
    onPatchNormal({ weekdays: next });
  };

  const toggleDay = (value: number) => {
    const next = normal.days_of_month.includes(value)
      ? normal.days_of_month.filter((d) => d !== value)
      : [...normal.days_of_month, value].sort((a, b) => a - b);
    onPatchNormal({ days_of_month: next });
  };

  const updateFilter = (id: string, patch: Partial<WebhookFilterView>) => {
    onPatchWebhook({
      filters: webhook.filters.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  };

  const addFilter = () => {
    onPatchWebhook({
      filters: [
        ...webhook.filters,
        {
          id: `filter_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          path: '',
          operator: 'equals',
          value: '',
          case_sensitive: false,
        },
      ],
    });
  };

  const removeFilter = (id: string) => {
    onPatchWebhook({ filters: webhook.filters.filter((f) => f.id !== id) });
  };

  const authHeader =
    webhook.auth_mode === 'token'
      ? ` \\\n  -H 'X-Webhook-Token: <token>'`
      : webhook.auth_mode === 'signature'
        ? ` \\\n  -H 'X-Signature-256: sha256=<signature>'`
        : '';
  const sampleCurl = fullWebhookUrl
    ? `curl -X POST '${fullWebhookUrl}' \\\n  -H 'Content-Type: application/json'${authHeader} \\\n  -d '{"type":"issues.opened","issue":{"title":"Example bug"}}'`
    : '';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="automation-editor">
        <header className="automation-editor-head">
          <div>
            <h2>{draft.id ? 'Edit schedule' : 'Create schedule'}</h2>
            <p>Run an agent prompt on a timer or when a webhook event arrives.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <X size={17} />
          </button>
        </header>

        <div className="automation-editor-body">
          <section className="automation-section">
            <div className="automation-section-title">Basics</div>
            <div className="automation-two-col">
              <div>
                <label className="field-label">Schedule name</label>
                <input
                  className="input-field"
                  placeholder="Daily repository digest"
                  value={draft.name}
                  onChange={(e) => onPatch({ name: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Agent</label>
                <select
                  className="input-field"
                  value={draft.agent_id}
                  onChange={(e) => onPatch({ agent_id: e.target.value })}
                >
                  <option value="">Default Mythgram Agent</option>
                  {customAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">Description</label>
              <textarea
                className="input-field"
                rows={2}
                placeholder="What this automation does and why it exists."
                value={draft.description}
                onChange={(e) => onPatch({ description: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Prompt sent to the agent</label>
              <textarea
                className="input-field"
                rows={5}
                placeholder="Summarize yesterday's commits, open issues, and anything that needs my attention."
                value={draft.prompt}
                onChange={(e) => onPatch({ prompt: e.target.value })}
              />
              <div className="automation-help">
                Every run creates a normal chat session, so it appears in the sidebar and can be
                reopened later.
              </div>
            </div>
            <div className="automation-three-col">
              <div>
                <label className="field-label">Workspace (optional)</label>
                <input
                  className="input-field"
                  placeholder="Default workspace"
                  value={draft.workspace}
                  onChange={(e) => onPatch({ workspace: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Timeout seconds (0 = none)</label>
                <input
                  className="input-field"
                  type="number"
                  min={0}
                  value={draft.timeout_seconds}
                  onChange={(e) =>
                    onPatch({ timeout_seconds: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>
              <label className="automation-toggle" style={{ alignSelf: 'end', marginBottom: 9 }}>
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => onPatch({ enabled: e.target.checked })}
                />
                <span>Enabled after saving</span>
              </label>
            </div>
          </section>

          <div className="automation-method-tabs">
            <button
              type="button"
              className={`automation-method-tab ${draft.method === 'normal' ? 'is-active' : ''}`}
              onClick={() => onPatch({ method: 'normal' })}
            >
              <Clock size={16} />
              <span>
                <strong>Normal schedule</strong>
                <em>Time, cron, interval, daily, weekly, monthly</em>
              </span>
            </button>
            <button
              type="button"
              className={`automation-method-tab ${draft.method === 'webhook' ? 'is-active' : ''}`}
              onClick={() => onPatch({ method: 'webhook' })}
            >
              <Webhook size={16} />
              <span>
                <strong>Webhook trigger</strong>
                <em>Run instantly when an external event arrives</em>
              </span>
            </button>
          </div>

          {draft.method === 'normal' ? (
            <section className="automation-section">
              <div className="automation-section-title">Schedule</div>
              <div className="automation-segmented">
                {NORMAL_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    className={`automation-segment ${
                      normal.mode === mode.value ? 'is-active' : ''
                    }`}
                    onClick={() => onPatchNormal({ mode: mode.value })}
                  >
                    {mode.icon}
                    {mode.label}
                  </button>
                ))}
              </div>

              <div className="automation-two-col">
                <div>
                  <label className="field-label">Timezone</label>
                  <input
                    className="input-field"
                    list="automation-tz-list"
                    value={normal.timezone}
                    onChange={(e) => onPatchNormal({ timezone: e.target.value })}
                    placeholder="UTC"
                  />
                </div>
                <div>
                  <label className="field-label">
                    {normal.mode === 'once' ? 'Run at' : 'Start date (optional)'}
                  </label>
                  <input
                    className="input-field"
                    type="datetime-local"
                    value={normal.mode === 'once' ? normal.run_at : normal.start_at}
                    onChange={(e) =>
                      onPatchNormal(
                        normal.mode === 'once'
                          ? { run_at: e.target.value }
                          : { start_at: e.target.value }
                      )
                    }
                  />
                </div>
              </div>

              {normal.mode === 'interval' && (
                <div className="automation-two-col">
                  <div>
                    <label className="field-label">Every</label>
                    <input
                      className="input-field"
                      type="number"
                      min={1}
                      value={normal.interval_value}
                      onChange={(e) =>
                        onPatchNormal({ interval_value: Number(e.target.value) || 1 })
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label">Unit</label>
                    <select
                      className="input-field"
                      value={normal.interval_unit}
                      onChange={(e) =>
                        onPatchNormal({ interval_unit: e.target.value as IntervalUnit })
                      }
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>
                </div>
              )}

              {normal.mode === 'cron' && (
                <div>
                  <label className="field-label">Cron expression</label>
                  <input
                    className="input-field automation-mono"
                    value={normal.cron_expression}
                    onChange={(e) => onPatchNormal({ cron_expression: e.target.value })}
                    placeholder="0 9 * * 1-5"
                  />
                  <div className="automation-chips">
                    {CRON_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        className={`automation-chip ${
                          normal.cron_expression === preset.value ? 'is-active' : ''
                        }`}
                        onClick={() => onPatchNormal({ cron_expression: preset.value })}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="automation-help">
                    5 fields: minute hour day month weekday. 6 fields add seconds at the front.
                  </div>
                </div>
              )}

              {['daily', 'weekly', 'monthly'].includes(normal.mode) && (
                <div>
                  <label className="field-label">Time of day</label>
                  <input
                    className="input-field"
                    type="time"
                    value={normal.time_of_day}
                    onChange={(e) => onPatchNormal({ time_of_day: e.target.value })}
                  />
                </div>
              )}

              {normal.mode === 'weekly' && (
                <div>
                  <label className="field-label">Weekdays</label>
                  <div className="automation-chips">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        className={`automation-weekday ${
                          normal.weekdays.includes(day.value) ? 'is-active' : ''
                        }`}
                        onClick={() => toggleWeekday(day.value)}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {normal.mode === 'monthly' && (
                <div>
                  <label className="field-label">Days of month</label>
                  <div className="automation-day-grid">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <button
                        key={day}
                        type="button"
                        className={`automation-day ${
                          normal.days_of_month.includes(day) ? 'is-active' : ''
                        }`}
                        onClick={() => toggleDay(day)}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <div className="automation-help">
                    Months without the selected day are skipped.
                  </div>
                </div>
              )}

              {normal.mode !== 'once' && (
                <div className="automation-two-col">
                  <div>
                    <label className="field-label">End date (optional)</label>
                    <input
                      className="input-field"
                      type="datetime-local"
                      value={normal.end_at}
                      onChange={(e) => onPatchNormal({ end_at: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label">Missed run grace (seconds)</label>
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      value={normal.catch_up_grace_seconds}
                      onChange={(e) =>
                        onPatchNormal({
                          catch_up_grace_seconds: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </div>
                </div>
              )}

              {normal.mode !== 'once' && (
                <label className="automation-toggle">
                  <input
                    type="checkbox"
                    checked={normal.skip_if_missed}
                    onChange={(e) => onPatchNormal({ skip_if_missed: e.target.checked })}
                  />
                  <span>Skip missed runs instead of catching up after downtime</span>
                </label>
              )}

              <div className="automation-preview-box">
                <div className="automation-preview-head">
                  <span>
                    <CalendarClock size={13} />
                    Next executions
                  </span>
                  {previewLoading && <Loader2 size={13} className="spin" />}
                </div>
                {preview?.errors?.length ? (
                  <div className="automation-preview-error">
                    <AlertTriangle size={13} />
                    <span>{preview.errors.join(' ')}</span>
                  </div>
                ) : preview?.nextRuns?.length ? (
                  <div className="automation-preview-runs">
                    {preview.nextRuns.map((ts, index) => (
                      <span key={`${ts}-${index}`}>
                        {formatDate(ts, normal.timezone)}
                        <em>{formatRelative(ts)}</em>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="automation-help">
                    No upcoming executions for this configuration.
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="automation-section">
              <div className="automation-section-title">Webhook trigger</div>
              <div className="automation-callout">
                <Webhook size={16} />
                <div>
                  <strong>Unique endpoint, verified delivery.</strong>
                  <p>
                    Point GitHub, Stripe, Linear, Slack, Jira, or any custom service at this URL.
                    Mythgram verifies the request, applies filters, deduplicates retries, and starts
                    the agent with the event payload.
                  </p>
                </div>
              </div>

              {existingWebhook && (
                <div className="automation-webhook-url">
                  <div>
                    <span className="automation-stat-label">Endpoint URL</span>
                    <code>{fullWebhookUrl}</code>
                  </div>
                  <div className="automation-webhook-url-actions">
                    <button
                      type="button"
                      className="btn-secondary inline-center"
                      onClick={() => onCopy(fullWebhookUrl)}
                    >
                      <Copy size={12} />
                      Copy
                    </button>
                    <button
                      type="button"
                      className="btn-secondary inline-center"
                      onClick={onTestWebhook}
                      disabled={saving}
                    >
                      <Send size={12} />
                      Test
                    </button>
                    <button
                      type="button"
                      className="btn-secondary inline-center"
                      onClick={onRotateSecret}
                      disabled={saving}
                    >
                      <RotateCw size={12} />
                      Rotate secret
                    </button>
                  </div>
                  <div className="automation-help">
                    Secret: <code>{existingWebhook.secret_preview}</code>. Rotating invalidates the
                    old URL and secret immediately.
                  </div>
                </div>
              )}

              <div className="automation-three-col">
                <div>
                  <label className="field-label">Authentication</label>
                  <select
                    className="input-field"
                    value={webhook.auth_mode}
                    onChange={(e) =>
                      onPatchWebhook({
                        auth_mode: e.target.value as WebhookDraft['auth_mode'],
                      })
                    }
                  >
                    <option value="signature">HMAC signature (recommended)</option>
                    <option value="token">Token header (X-Webhook-Token / Bearer)</option>
                    <option value="none">Open (no auth; use an IP allowlist)</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Signature header</label>
                  <input
                    className="input-field"
                    value={webhook.signature_header}
                    onChange={(e) => onPatchWebhook({ signature_header: e.target.value })}
                    disabled={webhook.auth_mode !== 'signature'}
                  />
                </div>
                <div>
                  <label className="field-label">Signature prefix</label>
                  <input
                    className="input-field"
                    value={webhook.signature_prefix}
                    onChange={(e) => onPatchWebhook({ signature_prefix: e.target.value })}
                    disabled={webhook.auth_mode !== 'signature'}
                    placeholder="sha256="
                  />
                </div>
              </div>

              <div className="automation-two-col">
                <div>
                  <label className="field-label">Event types (comma separated, * = any)</label>
                  <input
                    className="input-field"
                    placeholder="issues.opened, pull_request.*"
                    value={webhook.event_types}
                    onChange={(e) => onPatchWebhook({ event_types: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Event type payload path</label>
                  <input
                    className="input-field automation-mono"
                    value={webhook.event_type_path}
                    onChange={(e) => onPatchWebhook({ event_type_path: e.target.value })}
                    placeholder="type"
                  />
                </div>
              </div>

              <div className="automation-filter-head">
                <div>
                  <div className="automation-section-title" style={{ margin: 0 }}>
                    Payload filters
                  </div>
                  <div className="automation-help">
                    Only run when the payload matches these conditions.
                  </div>
                </div>
                <div className="automation-filter-head-actions">
                  <select
                    className="input-field"
                    style={{ width: 150 }}
                    value={webhook.filter_logic}
                    onChange={(e) =>
                      onPatchWebhook({ filter_logic: e.target.value as 'all' | 'any' })
                    }
                  >
                    <option value="all">Match all</option>
                    <option value="any">Match any</option>
                  </select>
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    onClick={addFilter}
                  >
                    <Plus size={12} />
                    Add filter
                  </button>
                </div>
              </div>

              {webhook.filters.length === 0 ? (
                <div className="automation-empty-inline">
                  No filters — every matching event runs.
                </div>
              ) : (
                <div className="automation-filter-list">
                  {webhook.filters.map((filter) => (
                    <div key={filter.id} className="automation-filter-row">
                      <input
                        className="input-field automation-mono"
                        placeholder="payload path e.g. issue.labels[].name"
                        value={filter.path}
                        onChange={(e) => updateFilter(filter.id, { path: e.target.value })}
                      />
                      <select
                        className="input-field"
                        value={filter.operator}
                        onChange={(e) =>
                          updateFilter(filter.id, {
                            operator: e.target.value as FilterOperator,
                          })
                        }
                      >
                        {FILTER_OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input-field"
                        placeholder="value"
                        value={filter.value || ''}
                        disabled={filter.operator === 'exists' || filter.operator === 'not_exists'}
                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                      />
                      <label className="automation-toggle automation-filter-case">
                        <input
                          type="checkbox"
                          checked={Boolean(filter.case_sensitive)}
                          onChange={(e) =>
                            updateFilter(filter.id, { case_sensitive: e.target.checked })
                          }
                        />
                        <span>Case</span>
                      </label>
                      <button
                        type="button"
                        className="automation-icon-btn danger"
                        title="Remove filter"
                        onClick={() => removeFilter(filter.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <details className="automation-advanced" open>
                <summary>Advanced delivery controls</summary>
                <div className="automation-three-col">
                  <div>
                    <label className="field-label">Debounce seconds</label>
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      value={webhook.debounce_seconds}
                      onChange={(e) =>
                        onPatchWebhook({ debounce_seconds: Number(e.target.value) || 0 })
                      }
                    />
                    <div className="automation-help">Coalesce bursts into one run.</div>
                  </div>
                  <div>
                    <label className="field-label">Cooldown seconds</label>
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      value={webhook.cooldown_seconds}
                      onChange={(e) =>
                        onPatchWebhook({ cooldown_seconds: Number(e.target.value) || 0 })
                      }
                    />
                    <div className="automation-help">Minimum gap between runs.</div>
                  </div>
                  <div>
                    <label className="field-label">Max runs / hour</label>
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      value={webhook.max_runs_per_hour}
                      onChange={(e) =>
                        onPatchWebhook({ max_runs_per_hour: Number(e.target.value) || 0 })
                      }
                    />
                    <div className="automation-help">0 = unlimited.</div>
                  </div>
                  <div>
                    <label className="field-label">Max runs / day</label>
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      value={webhook.max_runs_per_day}
                      onChange={(e) =>
                        onPatchWebhook({ max_runs_per_day: Number(e.target.value) || 0 })
                      }
                    />
                    <div className="automation-help">0 = unlimited.</div>
                  </div>
                  <div>
                    <label className="field-label">Dedupe payload path</label>
                    <input
                      className="input-field automation-mono"
                      placeholder="id"
                      value={webhook.dedupe_path}
                      onChange={(e) => onPatchWebhook({ dedupe_path: e.target.value })}
                    />
                    <div className="automation-help">Ignore retries with the same value.</div>
                  </div>
                  <div>
                    <label className="field-label">Dedupe window (seconds)</label>
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      value={webhook.dedupe_ttl_seconds}
                      onChange={(e) =>
                        onPatchWebhook({ dedupe_ttl_seconds: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>

                <div className="automation-three-col">
                  <div>
                    <label className="field-label">Max payload bytes</label>
                    <input
                      className="input-field"
                      type="number"
                      min={1024}
                      value={webhook.max_payload_bytes}
                      onChange={(e) =>
                        onPatchWebhook({ max_payload_bytes: Number(e.target.value) || 1048576 })
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label">Replay tolerance (seconds)</label>
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      value={webhook.replay_tolerance_seconds}
                      onChange={(e) =>
                        onPatchWebhook({
                          replay_tolerance_seconds: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label">Timestamp header</label>
                    <input
                      className="input-field"
                      value={webhook.timestamp_header}
                      onChange={(e) => onPatchWebhook({ timestamp_header: e.target.value })}
                    />
                  </div>
                </div>

                <div className="automation-two-col">
                  <div>
                    <label className="field-label">IP allowlist (comma separated, CIDR ok)</label>
                    <input
                      className="input-field automation-mono"
                      placeholder="203.0.113.4, 10.0.0.0/8"
                      value={webhook.allowed_ips}
                      onChange={(e) => onPatchWebhook({ allowed_ips: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label">Conversation mode</label>
                    <select
                      className="input-field"
                      value={webhook.session_mode}
                      onChange={(e) =>
                        onPatchWebhook({
                          session_mode: e.target.value as 'new' | 'continue',
                        })
                      }
                    >
                      <option value="new">New chat per event</option>
                      <option value="continue">Continue the last webhook chat</option>
                    </select>
                  </div>
                </div>

                <label className="automation-toggle">
                  <input
                    type="checkbox"
                    checked={webhook.include_payload}
                    onChange={(e) => onPatchWebhook({ include_payload: e.target.checked })}
                  />
                  <span>Append the event payload to the prompt</span>
                </label>

                <div>
                  <label className="field-label">Prompt template (optional)</label>
                  <textarea
                    className="input-field automation-mono"
                    rows={3}
                    placeholder="New {{event.type}} event: {{payload.issue.title}}"
                    value={webhook.prompt_template}
                    onChange={(e) => onPatchWebhook({ prompt_template: e.target.value })}
                  />
                  <div className="automation-help">
                    Supports {'{{payload.issue.title}}'}, {'{{event.type}}'}, {'{{schedule.name}}'},{' '}
                    {'{{now}}'} and {'{{json payload}}'}. When empty, the prompt above is used.
                  </div>
                </div>

                {sampleCurl && (
                  <div>
                    <label className="field-label">Example request</label>
                    <pre className="automation-code">{sampleCurl}</pre>
                  </div>
                )}
              </details>
            </section>
          )}

          {error && (
            <div className="automation-editor-error">
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="automation-editor-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary inline-center"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
            {draft.id ? 'Save changes' : 'Create schedule'}
          </button>
        </footer>
      </div>
    </div>
  );
};

const HistoryModal: React.FC<{
  schedule: ScheduleItem;
  runs: ScheduleRun[];
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onOpenSession: (sessionId: string) => void;
}> = ({ schedule, runs, loading, onClose, onRefresh, onOpenSession }) => (
  <div className="modal-backdrop" role="dialog" aria-modal="true">
    <div className="automation-history-modal">
      <header className="automation-editor-head">
        <div>
          <h2>
            <History size={17} />
            Execution history
          </h2>
          <p>
            {schedule.name} · {runs.length} run{runs.length === 1 ? '' : 's'} ·{' '}
            {schedule.method === 'webhook' ? 'webhook' : 'normal schedule'}
          </p>
        </div>
        <div className="automation-history-actions">
          <button type="button" className="icon-btn" onClick={onRefresh} title="Refresh">
            {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          </button>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <X size={17} />
          </button>
        </div>
      </header>
      <div className="automation-history-body">
        {loading && runs.length === 0 ? (
          <div className="automation-run-list">
            {[0, 1, 2].map((i) => (
              <div className="automation-run automation-run-skeleton" key={i}>
                <div className="automation-skeleton-line" style={{ width: '35%' }} />
                <div className="automation-skeleton-line" style={{ width: '80%' }} />
              </div>
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="automation-empty">
            <Inbox size={30} />
            <strong>No runs yet</strong>
            <span>Trigger this schedule or send a webhook event to see execution history.</span>
          </div>
        ) : (
          <div className="automation-run-list">
            {runs.map((run) => (
              <div className="automation-run" key={run.id}>
                <div className="automation-run-head">
                  <span className={`automation-run-status tone-${runTone(run.status)}`}>
                    {run.status}
                  </span>
                  <span className="automation-run-trigger">{run.trigger}</span>
                  <span className="automation-run-time">{formatDate(run.started_at)}</span>
                  {run.duration_ms != null && (
                    <span className="automation-run-time">
                      {Math.max(1, Math.round(run.duration_ms / 1000))}s
                    </span>
                  )}
                  {run.session_id && (
                    <button
                      type="button"
                      className="automation-run-link"
                      onClick={() => onOpenSession(run.session_id as string)}
                    >
                      <ExternalLink size={11} />
                      Open chat
                    </button>
                  )}
                </div>
                {run.event_type && (
                  <div className="automation-run-line">
                    Event: <code>{run.event_type}</code>
                    {run.source_ip && <span> · from {run.source_ip}</span>}
                  </div>
                )}
                {run.error && (
                  <div className="automation-run-error">
                    <AlertTriangle size={12} />
                    <span>{run.error}</span>
                  </div>
                )}
                {run.summary && (
                  <details className="automation-run-details">
                    <summary>Result summary</summary>
                    <pre>{run.summary}</pre>
                  </details>
                )}
                {run.payload_preview && (
                  <details className="automation-run-details">
                    <summary>Payload preview</summary>
                    <pre>{run.payload_preview}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

const WebhookCreatedModal: React.FC<{
  data: CreatedWebhookState;
  onClose: () => void;
  onCopy: (text: string) => void;
}> = ({ data, onClose, onCopy }) => {
  const authHeader =
    data.authMode === 'token'
      ? ` \\\n  -H 'X-Webhook-Token: ${data.token || '<token>'}'`
      : data.authMode === 'signature'
        ? ` \\\n  -H 'X-Signature-256: sha256=<hmac-sha256-of-body>'`
        : '';
  const sampleCurl = `curl -X POST '${data.url}' \\\n  -H 'Content-Type: application/json'${authHeader} \\\n  -d '{"type":"issues.opened","issue":{"title":"Example bug"}}'`;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="automation-webhook-created">
        <header className="automation-editor-head">
          <div>
            <h2>
              <ShieldCheck size={18} />
              Webhook endpoint ready
            </h2>
            <p>{data.name}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <X size={17} />
          </button>
        </header>
        <div className="automation-webhook-created-body">
          <div className="automation-callout">
            <Zap size={16} />
            <div>
              <strong>Store these values now.</strong>
              <p>
                The URL is the endpoint. The signing secret is shown only once; if you lose it,
                rotate the secret to get a new URL and secret.
              </p>
            </div>
          </div>

          <div className="automation-secret-row">
            <div>
              <span className="automation-stat-label">Endpoint URL</span>
              <code>{data.url}</code>
            </div>
            <button
              type="button"
              className="btn-secondary inline-center"
              onClick={() => onCopy(data.url)}
            >
              <Copy size={12} />
              Copy URL
            </button>
          </div>

          {data.token && (
            <div className="automation-secret-row">
              <div>
                <span className="automation-stat-label">Webhook token</span>
                <code>{data.token}</code>
              </div>
              <button
                type="button"
                className="btn-secondary inline-center"
                onClick={() => onCopy(data.token as string)}
              >
                <KeyRound size={12} />
                Copy token
              </button>
            </div>
          )}

          {data.secret && (
            <div className="automation-secret-row">
              <div>
                <span className="automation-stat-label">
                  Signing secret
                  {data.authMode !== 'signature' ? ' (unused in this auth mode)' : ''}
                </span>
                <code>{data.secret}</code>
              </div>
              <button
                type="button"
                className="btn-secondary inline-center"
                onClick={() => onCopy(data.secret as string)}
              >
                <KeyRound size={12} />
                Copy secret
              </button>
            </div>
          )}

          <div>
            <span className="automation-stat-label">Example request</span>
            <pre className="automation-code">{sampleCurl}</pre>
          </div>

          <div className="automation-help">
            For HMAC signature mode, sign the raw request body with the secret using SHA-256 and
            send the hex digest in <code>X-Signature-256</code> prefixed with <code>sha256=</code>.
            For token mode, send <code>X-Webhook-Token</code> or <code>Authorization: Bearer</code>
            with the webhook token.
          </div>
        </div>
        <footer className="automation-editor-footer">
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};

export const AutomationPage: React.FC<AutomationPageProps> = ({
  onOpenSettings,
  onOpenSidebar,
  onOpenSession,
}) => {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [customAgents, setCustomAgents] = useState<CustomAgentOption[]>([]);
  const [timezones, setTimezones] = useState<string[]>(['UTC']);
  const [systemTimezone, setSystemTimezone] = useState('UTC');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [filter, setFilter] = useState<'all' | 'normal' | 'webhook' | 'active' | 'paused'>('all');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(9);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ScheduleDraft | null>(null);
  const [editorError, setEditorError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [historyFor, setHistoryFor] = useState<ScheduleItem | null>(null);
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [createdWebhook, setCreatedWebhook] = useState<CreatedWebhookState | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((type: ToastState['type'], message: string) => {
    setToast({ type, message });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    []
  );

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [schedulesRes, agentsRes, tzRes] = await Promise.all([
        fetch('/api/automation'),
        fetch('/api/custom-agents'),
        fetch('/api/automation/timezones'),
      ]);
      const schedulesData = await schedulesRes.json();
      if (Array.isArray(schedulesData.schedules)) setSchedules(schedulesData.schedules);
      if (schedulesData.engine) setEngine(schedulesData.engine);

      const agentsData = await agentsRes.json();
      if (Array.isArray(agentsData.agents)) {
        setCustomAgents(
          agentsData.agents.map((agent: any) => ({
            id: String(agent.id),
            name: String(agent.name),
            logo: agent.logo,
          }))
        );
      }

      const tzData = await tzRes.json();
      if (Array.isArray(tzData.timezones)) setTimezones(tzData.timezones);
      if (tzData.systemTimezone) setSystemTimezone(String(tzData.systemTimezone));
      setError('');
    } catch (err: any) {
      if (!silent) setError(err?.message || 'Failed to load automation schedules.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    let interval: number | undefined;
    const start = () => {
      if (interval === undefined) {
        interval = window.setInterval(() => void loadAll(true), 8000);
      }
    };
    const stop = () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void loadAll(true);
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadAll]);

  const agentsById = useMemo(() => {
    const map = new Map<string, CustomAgentOption>();
    for (const agent of customAgents) map.set(agent.id, agent);
    return map;
  }, [customAgents]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return schedules.filter((schedule) => {
      if (filter === 'normal' && schedule.method !== 'normal') return false;
      if (filter === 'webhook' && schedule.method !== 'webhook') return false;
      if (filter === 'active' && !schedule.enabled) return false;
      if (filter === 'paused' && schedule.enabled) return false;
      if (
        query &&
        !`${schedule.name} ${schedule.description} ${schedule.prompt} ${schedule.method}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [schedules, filter, search]);

  useEffect(() => {
    setVisibleCount(9);
  }, [filter, search]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => Math.min(filtered.length, count + 6));
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length]);

  useEffect(() => {
    if (!menuOpenId) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.automation-menu-wrap')) setMenuOpenId(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpenId]);

  useEffect(() => {
    if (!editor || editor.method !== 'normal') {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/automation/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'normal', normal: normalPayload(editor.normal) }),
        });
        const data = await res.json();
        setPreview({
          valid: Boolean(data.valid),
          errors: Array.isArray(data.errors) ? data.errors : [],
          nextRuns: Array.isArray(data.nextRuns) ? data.nextRuns : [],
          description: String(data.description || ''),
        });
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [editor]);

  const stats = useMemo(
    () => ({
      total: schedules.length,
      active: schedules.filter((s) => s.enabled).length,
      webhooks: schedules.filter((s) => s.method === 'webhook').length,
      running: schedules.filter((s) => s.isRunning).length,
      failures: schedules.filter(
        (s) => s.last_status === 'failed' || s.last_status === 'rejected'
      ).length,
    }),
    [schedules]
  );

  const visible = filtered.slice(0, visibleCount);

  const openCreate = () => {
    setEditor(emptyDraft(systemTimezone));
    setEditorError('');
    setPreview(null);
    setMenuOpenId(null);
  };

  const openEdit = (schedule: ScheduleItem) => {
    setEditor(draftFromSchedule(schedule, systemTimezone));
    setEditorError('');
    setPreview(null);
    setMenuOpenId(null);
  };

  const patchEditor = (patch: Partial<ScheduleDraft>) => {
    setEditor((prev) => (prev ? { ...prev, ...patch } : prev));
  };
  const patchNormal = (patch: Partial<NormalDraft>) => {
    setEditor((prev) => (prev ? { ...prev, normal: { ...prev.normal, ...patch } } : prev));
  };
  const patchWebhook = (patch: Partial<WebhookDraft>) => {
    setEditor((prev) => (prev ? { ...prev, webhook: { ...prev.webhook, ...patch } } : prev));
  };

  const copyText = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        notify('success', 'Copied to clipboard.');
      } catch {
        notify('error', 'Could not copy to the clipboard.');
      }
    },
    [notify]
  );

  const handleSave = async () => {
    if (!editor || saving) return;
    if (!editor.name.trim()) {
      setEditorError('Schedule name is required.');
      return;
    }
    if (
      !editor.prompt.trim() &&
      !(editor.method === 'webhook' && editor.webhook.prompt_template.trim())
    ) {
      setEditorError('A prompt is required (or a webhook prompt template).');
      return;
    }
    setSaving(true);
    setEditorError('');
    const payload = {
      name: editor.name,
      description: editor.description,
      prompt: editor.prompt,
      method: editor.method,
      enabled: editor.enabled,
      agent: {
        agent_id: editor.agent_id || null,
        workspace: editor.workspace || null,
        timeout_seconds: editor.timeout_seconds,
      },
      normal: editor.method === 'normal' ? normalPayload(editor.normal) : undefined,
      webhook: editor.method === 'webhook' ? webhookPayload(editor.webhook) : undefined,
    };
    try {
      const res = await fetch(editor.id ? `/api/automation/${editor.id}` : '/api/automation', {
        method: editor.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setEditorError(data.error || 'Failed to save the schedule.');
        return;
      }
      const saved = data.schedule as ScheduleItem;
      if (saved.method === 'webhook' && !editor.id) {
        setCreatedWebhook({
          name: saved.name,
          url: `${window.location.origin}${saved.webhook?.url || ''}`,
          secret: data.webhook_secret,
          token: saved.webhook?.token,
          authMode: saved.webhook?.auth_mode || 'signature',
        });
      }
      setEditor(null);
      notify('success', editor.id ? 'Schedule updated.' : 'Schedule created.');
      await loadAll(true);
    } catch (err: any) {
      setEditorError(err?.message || 'Failed to save the schedule.');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (schedule: ScheduleItem) => {
    setMenuOpenId(null);
    setHistoryFor(schedule);
    setRuns([]);
    setRunsLoading(true);
    try {
      const res = await fetch(`/api/automation/${schedule.id}/runs?limit=100`);
      const data = await res.json();
      if (Array.isArray(data.runs)) setRuns(data.runs);
    } catch {
      notify('error', 'Failed to load execution history.');
    } finally {
      setRunsLoading(false);
    }
  };

  const refreshHistory = async () => {
    if (!historyFor) return;
    setRunsLoading(true);
    try {
      const res = await fetch(`/api/automation/${historyFor.id}/runs?limit=100`);
      const data = await res.json();
      if (Array.isArray(data.runs)) setRuns(data.runs);
    } catch {
      notify('error', 'Failed to refresh execution history.');
    } finally {
      setRunsLoading(false);
    }
  };

  const handleAction = async (action: CardAction, schedule: ScheduleItem) => {
    setMenuOpenId(null);
    if (action === 'edit') {
      openEdit(schedule);
      return;
    }
    if (action === 'history') {
      void openHistory(schedule);
      return;
    }
    if (action === 'copy-url') {
      if (schedule.webhook?.url) {
        void copyText(`${window.location.origin}${schedule.webhook.url}`);
      }
      return;
    }
    if (action === 'delete') {
      if (!window.confirm(`Delete schedule "${schedule.name}" and its run history?`)) return;
    }
    if (action === 'rotate') {
      if (
        !window.confirm(
          'Rotate the webhook secret? The old URL and secret stop working immediately.'
        )
      ) {
        return;
      }
    }

    setActionBusyId(schedule.id);
    try {
      let res: Response;
      switch (action) {
        case 'run':
          res = await fetch(`/api/automation/${schedule.id}/run`, { method: 'POST' });
          break;
        case 'stop':
          res = await fetch(`/api/automation/${schedule.id}/stop`, { method: 'POST' });
          break;
        case 'duplicate':
          res = await fetch(`/api/automation/${schedule.id}/duplicate`, { method: 'POST' });
          break;
        case 'pause':
          res = await fetch(`/api/automation/${schedule.id}/pause`, { method: 'POST' });
          break;
        case 'resume':
          res = await fetch(`/api/automation/${schedule.id}/resume`, { method: 'POST' });
          break;
        case 'test':
          res = await fetch(`/api/automation/${schedule.id}/test`, { method: 'POST' });
          break;
        case 'rotate':
          res = await fetch(`/api/automation/${schedule.id}/rotate-secret`, {
            method: 'POST',
          });
          break;
        case 'delete':
          res = await fetch(`/api/automation/${schedule.id}`, { method: 'DELETE' });
          break;
        default:
          return;
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        notify('error', data.error || 'The action could not be completed.');
        return;
      }

      if (action === 'rotate') {
        const rotated = data.schedule as ScheduleItem;
        setCreatedWebhook({
          name: rotated.name,
          url: `${window.location.origin}${rotated.webhook?.url || ''}`,
          secret: data.webhook_secret,
          token: data.webhook_token,
          authMode: rotated.webhook?.auth_mode || 'signature',
        });
        notify('success', 'Webhook secret rotated.');
      } else if (action === 'run') {
        notify('success', 'Run started. The scheduled chat is in the sidebar.');
      } else if (action === 'stop') {
        notify('success', 'Schedule stopped.');
      } else if (action === 'duplicate') {
        notify('success', 'Schedule duplicated as paused.');
      } else if (action === 'pause') {
        notify('success', 'Schedule paused.');
      } else if (action === 'resume') {
        notify('success', 'Schedule resumed.');
      } else if (action === 'test') {
        notify('success', 'Test event sent.');
        if (historyFor?.id === schedule.id) void refreshHistory();
      } else if (action === 'delete') {
        notify('success', 'Schedule deleted.');
        if (historyFor?.id === schedule.id) setHistoryFor(null);
      }
      await loadAll(true);
    } catch (err: any) {
      notify('error', err?.message || 'The action could not be completed.');
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <main className="main-canvas">
      <datalist id="automation-tz-list">
        {timezones.map((zone) => (
          <option value={zone} key={zone} />
        ))}
      </datalist>

      <header className="main-topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            onClick={onOpenSidebar}
            title="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div className="app-topbar-brand">
            <CalendarClock size={15} />
            <span>Automation</span>
            <span className="version-block">{schedules.length} schedules</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className={`automation-engine-pill ${engine?.running ? 'is-live' : ''}`}>
            <span className="automation-status-dot" />
            {engine?.running
              ? `Engine live${engine.activeRunCount ? ` · ${engine.activeRunCount} running` : ''}`
              : 'Engine stopped'}
          </span>
          <button
            type="button"
            className="btn-primary inline-center"
            style={{ padding: '5px 11px', fontSize: 12 }}
            onClick={openCreate}
          >
            <Plus size={13} />
            New schedule
          </button>
          <button type="button" className="topbar-btn" onClick={onOpenSettings}>
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <div className="automation-page-body">
        <div className="automation-stats-bar">
          <div className="automation-stat">
            <span className="automation-stat-icon">
              <CalendarClock size={15} />
            </span>
            <div>
              <strong>{stats.total}</strong>
              <span>Total schedules</span>
            </div>
          </div>
          <div className="automation-stat">
            <span className="automation-stat-icon is-green">
              <Power size={15} />
            </span>
            <div>
              <strong>{stats.active}</strong>
              <span>Active</span>
            </div>
          </div>
          <div className="automation-stat">
            <span className="automation-stat-icon is-blue">
              <Webhook size={15} />
            </span>
            <div>
              <strong>{stats.webhooks}</strong>
              <span>Webhook endpoints</span>
            </div>
          </div>
          <div className="automation-stat">
            <span className={`automation-stat-icon ${stats.failures ? 'is-red' : ''}`}>
              <AlertTriangle size={15} />
            </span>
            <div>
              <strong>{stats.failures}</strong>
              <span>Recent failures</span>
            </div>
          </div>
        </div>

        <div className="automation-toolbar">
          <div className="automation-filter-tabs">
            {(
              [
                ['all', 'All'],
                ['normal', 'Normal'],
                ['webhook', 'Webhook'],
                ['active', 'Active'],
                ['paused', 'Paused'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`automation-filter-tab ${filter === value ? 'is-active' : ''}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="automation-toolbar-right">
            <div className="automation-search">
              <Search size={13} />
              <input
                placeholder="Search schedules..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="automation-icon-btn"
              title="Refresh"
              onClick={() => void loadAll(true)}
              disabled={refreshing}
            >
              <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {error && (
          <div className="automation-banner-error">
            <AlertTriangle size={14} />
            <span>{error}</span>
            <button type="button" onClick={() => void loadAll()}>
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="automation-grid">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <AutomationSkeleton key={i} index={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="automation-empty">
            <span className="automation-empty-icon">
              {schedules.length === 0 ? <CalendarClock size={30} /> : <Search size={28} />}
            </span>
            <strong>
              {schedules.length === 0 ? 'No schedules yet' : 'No schedules match this filter'}
            </strong>
            <span>
              {schedules.length === 0
                ? 'Create a normal schedule or a webhook trigger and the agent will run on its own.'
                : 'Try a different filter or clear the search box.'}
            </span>
            {schedules.length === 0 && (
              <button type="button" className="btn-primary inline-center" onClick={openCreate}>
                <Plus size={14} />
                Create your first schedule
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="automation-grid">
              {visible.map((schedule, index) => (
                <div
                  className="automation-card-wrap"
                  key={schedule.id}
                  style={{ animationDelay: `${(index % 9) * 35}ms` }}
                >
                  <ScheduleCard
                    schedule={schedule}
                    agentName={
                      schedule.agent?.agent_id
                        ? agentsById.get(schedule.agent.agent_id)?.name || 'Custom agent'
                        : 'Default Agent'
                    }
                    menuOpen={menuOpenId === schedule.id}
                    onMenuToggle={() =>
                      setMenuOpenId((current) =>
                        current === schedule.id ? null : schedule.id
                      )
                    }
                    onAction={(action, item) => void handleAction(action, item)}
                  />
                  {actionBusyId === schedule.id && (
                    <span className="automation-card-busy">
                      <Loader2 size={13} className="spin" />
                    </span>
                  )}
                </div>
              ))}
            </div>
            {visible.length < filtered.length && (
              <div className="automation-load-more" ref={sentinelRef}>
                <AutomationSkeleton index={0} />
                <AutomationSkeleton index={1} />
              </div>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className={`automation-toast tone-${toast.type}`} role="status">
          {toast.type === 'success' ? (
            <Check size={14} />
          ) : toast.type === 'error' ? (
            <AlertTriangle size={14} />
          ) : (
            <Zap size={14} />
          )}
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} title="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      {editor && (
        <EditorModal
          draft={editor}
          customAgents={customAgents}
          timezones={timezones}
          preview={preview}
          previewLoading={previewLoading}
          saving={saving}
          error={editorError}
          existingWebhook={schedules.find((s) => s.id === editor.id)?.webhook}
          onPatch={patchEditor}
          onPatchNormal={patchNormal}
          onPatchWebhook={patchWebhook}
          onClose={() => {
            if (!saving) setEditor(null);
          }}
          onSave={() => void handleSave()}
          onCopy={(text) => void copyText(text)}
          onRotateSecret={() => {
            const schedule = schedules.find((s) => s.id === editor.id);
            if (schedule) void handleAction('rotate', schedule);
          }}
          onTestWebhook={() => {
            const schedule = schedules.find((s) => s.id === editor.id);
            if (schedule) void handleAction('test', schedule);
          }}
        />
      )}

      {historyFor && (
        <HistoryModal
          schedule={historyFor}
          runs={runs}
          loading={runsLoading}
          onClose={() => setHistoryFor(null)}
          onRefresh={() => void refreshHistory()}
          onOpenSession={(sessionId) => {
            setHistoryFor(null);
            onOpenSession(sessionId);
          }}
        />
      )}

      {createdWebhook && (
        <WebhookCreatedModal
          data={createdWebhook}
          onClose={() => setCreatedWebhook(null)}
          onCopy={(text) => void copyText(text)}
        />
      )}
    </main>
  );
};
