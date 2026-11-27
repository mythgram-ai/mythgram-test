export type ScheduleMethod = 'normal' | 'webhook';

export type NormalMode = 'once' | 'interval' | 'cron' | 'daily' | 'weekly' | 'monthly';

export type IntervalUnit = 'minutes' | 'hours' | 'days';

export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'error';

export type RunStatus =
  | 'queued'
  | 'debounced'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'skipped'
  | 'rejected';

export type RunTrigger = 'schedule' | 'manual' | 'webhook' | 'test' | 'catch-up';

export type WebhookAuthMode = 'signature' | 'token' | 'none';

export type FilterOperator =
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

export interface NormalTrigger {
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

export interface WebhookFilter {
  id: string;
  path: string;
  operator: FilterOperator;
  value?: string;
  case_sensitive?: boolean;
}

export interface WebhookTrigger {
  auth_mode: WebhookAuthMode;
  signature_header: string;
  signature_prefix: string;
  secret: string;
  token: string;
  event_types: string[];
  event_type_path: string;
  filter_logic: 'all' | 'any';
  filters: WebhookFilter[];
  dedupe_path?: string;
  dedupe_ttl_seconds?: number;
  debounce_seconds?: number;
  cooldown_seconds?: number;
  max_runs_per_hour?: number;
  max_runs_per_day?: number;
  max_payload_bytes?: number;
  allowed_ips?: string[];
  replay_tolerance_seconds?: number;
  timestamp_header?: string;
  session_mode: 'new' | 'continue';
  include_payload?: boolean;
  prompt_template?: string;
}

export interface ScheduleAgentConfig {
  agent_id?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  workspace?: string | null;
  timeout_seconds?: number | null;
}

export interface ScheduleDefinition {
  id: string;
  name: string;
  description: string;
  prompt: string;
  method: ScheduleMethod;
  enabled: boolean;
  status: ScheduleStatus;
  normal?: NormalTrigger;
  webhook?: WebhookTrigger;
  agent: ScheduleAgentConfig;
  created_at: number;
  updated_at: number;
  next_run_at?: number | null;
  last_run_at?: number | null;
  last_status?: RunStatus | null;
  run_count: number;
  consecutive_failures: number;
  last_session_id?: string | null;
  last_error?: string | null;
}

export interface ScheduleRun {
  id: string;
  schedule_id: string;
  trigger: RunTrigger;
  status: RunStatus;
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
  meta?: Record<string, unknown>;
}

export interface SchedulePreview {
  valid: boolean;
  errors: string[];
  nextRuns: number[];
  description: string;
}

export interface CronEngineStatus {
  running: boolean;
  startedAt: number | null;
  lastTickAt: number | null;
  tickIntervalMs: number;
  scheduleCount: number;
  activeRunCount: number;
  pendingWebhookCount: number;
}

export interface WebhookRequestInput {
  rawBody: string;
  headers: Record<string, string>;
  ip?: string;
  method?: string;
  query?: Record<string, string>;
}

export interface WebhookResult {
  statusCode: number;
  body: Record<string, unknown>;
}
