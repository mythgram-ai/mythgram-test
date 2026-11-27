import crypto from 'node:crypto';
import type {
  ScheduleDefinition,
  WebhookFilter,
  WebhookRequestInput,
  WebhookResult,
  WebhookTrigger,
} from './types.js';

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

export function generateWebhookToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 12) return '••••';
  return `${secret.slice(0, 8)}…${secret.slice(-4)}`;
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(String(a || ''), 'utf-8');
  const right = Buffer.from(String(b || ''), 'utf-8');
  if (left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function hmacSha256Hex(secret: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf-8').digest('hex');
}

function headerValue(headers: Record<string, string>, name: string): string {
  const target = name.trim().toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === target) return String(value ?? '');
  }
  return '';
}

export function getPathValues(root: unknown, pathExpression: string): unknown[] {
  const expr = String(pathExpression || '').trim();
  if (!expr) return [];
  const tokens: (string | number | '[]')[] = [];
  const normalized = expr
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\[\]/g, '.[]')
    .replace(/^\./, '');
  for (const token of normalized.split('.')) {
    if (!token) continue;
    if (token === '[]') tokens.push('[]');
    else if (/^\d+$/.test(token)) tokens.push(Number(token));
    else tokens.push(token);
  }

  let current: unknown[] = [root];
  for (const token of tokens) {
    const next: unknown[] = [];
    for (const value of current) {
      if (token === '[]') {
        if (Array.isArray(value)) next.push(...value);
        else if (value && typeof value === 'object') next.push(...Object.values(value));
      } else if (typeof token === 'number') {
        if (Array.isArray(value) && value[token] !== undefined) next.push(value[token]);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        if (token in obj) next.push(obj[token]);
      }
    }
    current = next;
  }
  return current;
}

export function getPathValue(root: unknown, pathExpression: string): unknown {
  const values = getPathValues(root, pathExpression);
  return values.length > 0 ? values[0] : undefined;
}

function stringifyValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function evaluateFilter(payload: unknown, filter: WebhookFilter): boolean {
  const values = getPathValues(payload, filter.path);
  const exists = values.some((v) => v !== undefined && v !== null && v !== '');
  if (filter.operator === 'exists') return exists;
  if (filter.operator === 'not_exists') return !exists;

  const expected = String(filter.value ?? '');
  const caseSensitive = filter.case_sensitive === true;
  const normalize = (s: string) => (caseSensitive ? s : s.toLowerCase());
  const expectedNorm = normalize(expected);

  for (const raw of values) {
    if (raw === undefined) continue;
    if (Array.isArray(raw)) {
      if (filter.operator === 'contains' && raw.some((v) => normalize(stringifyValue(v)) === expectedNorm)) {
        return true;
      }
      if (
        filter.operator === 'not_contains' &&
        !raw.some((v) => normalize(stringifyValue(v)) === expectedNorm)
      ) {
        return true;
      }
    }
    const actual = normalize(stringifyValue(raw));

    switch (filter.operator) {
      case 'equals':
        if (actual === expectedNorm) return true;
        break;
      case 'not_equals':
        if (actual !== expectedNorm) return true;
        break;
      case 'contains':
        if (actual.includes(expectedNorm)) return true;
        break;
      case 'not_contains':
        if (!actual.includes(expectedNorm)) return true;
        break;
      case 'starts_with':
        if (actual.startsWith(expectedNorm)) return true;
        break;
      case 'ends_with':
        if (actual.endsWith(expectedNorm)) return true;
        break;
      case 'in': {
        const list = expected.split(',').map((s) => normalize(s.trim()));
        if (list.includes(actual)) return true;
        break;
      }
      case 'regex': {
        try {
          const re = new RegExp(expected, caseSensitive ? '' : 'i');
          if (re.test(stringifyValue(raw))) return true;
        } catch {
          return false;
        }
        break;
      }
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const a = asNumber(raw);
        const b = asNumber(expected);
        if (a == null || b == null) break;
        if (filter.operator === 'gt' && a > b) return true;
        if (filter.operator === 'gte' && a >= b) return true;
        if (filter.operator === 'lt' && a < b) return true;
        if (filter.operator === 'lte' && a <= b) return true;
        break;
      }
      default:
        break;
    }
  }
  return false;
}

export function filtersMatch(payload: unknown, trigger: WebhookTrigger): boolean {
  if (!trigger.filters || trigger.filters.length === 0) return true;
  if (trigger.filter_logic === 'any') {
    return trigger.filters.some((f) => evaluateFilter(payload, f));
  }
  return trigger.filters.every((f) => evaluateFilter(payload, f));
}

export function matchEventType(eventType: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return true;
  const value = String(eventType || '');
  return patterns.some((pattern) => {
    const clean = String(pattern || '').trim();
    if (!clean || clean === '*') return true;
    const escaped = clean.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(value);
  });
}

export function extractEventType(payload: unknown, trigger: WebhookTrigger): string {
  const value = getPathValue(payload, trigger.event_type_path || 'type');
  if (Array.isArray(value)) return stringifyValue(value[0]);
  return stringifyValue(value);
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

function ipMatches(ip: string, rule: string): boolean {
  const cleanIp = String(ip || '').replace(/^::ffff:/i, '');
  const cleanRule = String(rule || '').trim().replace(/^::ffff:/i, '');
  if (!cleanIp || !cleanRule) return false;
  if (cleanRule === '*') return true;
  if (cleanRule.includes('/')) {
    const [network, bitsRaw] = cleanRule.split('/');
    const bits = Number(bitsRaw);
    const ipNum = ipv4ToNumber(cleanIp);
    const netNum = ipv4ToNumber(network);
    if (ipNum != null && netNum != null && Number.isInteger(bits) && bits >= 0 && bits <= 32) {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (ipNum & mask) === (netNum & mask);
    }
    return cleanIp.toLowerCase().startsWith(network.toLowerCase());
  }
  return cleanIp === cleanRule;
}

export function isIpAllowed(ip: string | undefined, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!ip) return false;
  return allowed.some((rule) => ipMatches(ip, rule));
}

function tokenFromRequest(
  trigger: WebhookTrigger,
  headers: Record<string, string>,
  query: Record<string, string>
): string {
  if (query.token) return query.token;
  const explicit = headerValue(headers, 'x-webhook-token');
  if (explicit) return explicit;
  const auth = headerValue(headers, 'authorization');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return '';
}

export function verifyWebhookSignature(
  trigger: WebhookTrigger,
  rawBody: string,
  headers: Record<string, string>
): boolean {
  if (trigger.auth_mode !== 'signature') return true;
  const providedRaw = headerValue(headers, trigger.signature_header || 'X-Signature-256');
  if (!providedRaw) return false;
  const prefix = trigger.signature_prefix || '';
  const provided = prefix && providedRaw.startsWith(prefix)
    ? providedRaw.slice(prefix.length)
    : providedRaw;
  const expected = hmacSha256Hex(trigger.secret, rawBody);
  return timingSafeEqualString(provided.trim().toLowerCase(), expected);
}

export function verifyWebhookToken(
  trigger: WebhookTrigger,
  headers: Record<string, string>,
  query: Record<string, string>
): boolean {
  if (trigger.auth_mode === 'none') return true;
  const provided = tokenFromRequest(trigger, headers, query);
  if (!provided) return false;
  return timingSafeEqualString(provided, trigger.token);
}

function checkReplay(
  trigger: WebhookTrigger,
  headers: Record<string, string>,
  now: number
): { ok: boolean; error?: string } {
  const tolerance = Number(trigger.replay_tolerance_seconds || 0);
  if (!tolerance || tolerance <= 0) return { ok: true };
  const raw = headerValue(headers, trigger.timestamp_header || 'X-Webhook-Timestamp');
  if (!raw) return { ok: false, error: 'Missing webhook timestamp header.' };
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return { ok: false, error: 'Invalid webhook timestamp.' };
  const tsMs = numeric > 10_000_000_000 ? numeric : numeric * 1000;
  if (Math.abs(now - tsMs) > tolerance * 1000) {
    return { ok: false, error: 'Webhook timestamp is outside the allowed replay window.' };
  }
  return { ok: true };
}

export function authenticateWebhook(
  trigger: WebhookTrigger,
  input: WebhookRequestInput,
  now = Date.now()
): { ok: boolean; error?: string } {
  const headers = input.headers || {};
  const query = input.query || {};

  if (trigger.auth_mode === 'signature') {
    if (!verifyWebhookSignature(trigger, input.rawBody, headers)) {
      return { ok: false, error: 'Invalid or missing webhook signature.' };
    }
  } else {
    if (!verifyWebhookToken(trigger, headers, query)) {
      return { ok: false, error: 'Invalid or missing webhook token.' };
    }
  }

  if (trigger.auth_mode === 'signature') {
    const replay = checkReplay(trigger, headers, now);
    if (!replay.ok) return replay;
  }
  return { ok: true };
}

export function parseWebhookPayload(
  trigger: WebhookTrigger,
  rawBody: string,
  headers: Record<string, string>
): { ok: boolean; payload?: unknown; error?: string; isJson?: boolean } {
  const maxBytes = Number(trigger.max_payload_bytes || 1_048_576);
  if (Buffer.byteLength(rawBody, 'utf-8') > maxBytes) {
    return { ok: false, error: `Payload exceeds the ${maxBytes} byte limit.` };
  }
  const contentType = headerValue(headers, 'content-type').toLowerCase();
  const looksJson = contentType.includes('json') || /^[\s]*[[{]/.test(rawBody);
  if (!looksJson) {
    return { ok: true, payload: { raw: rawBody }, isJson: false };
  }
  try {
    return { ok: true, payload: JSON.parse(rawBody || '{}'), isJson: true };
  } catch {
    return { ok: false, error: 'Payload is not valid JSON.' };
  }
}

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  return String(template || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expr: string) => {
    const clean = expr.trim();
    if (clean.startsWith('json ')) {
      const value = getPathValue(context, clean.slice(5).trim());
      try {
        return JSON.stringify(value ?? null, null, 2);
      } catch {
        return '';
      }
    }
    const value = getPathValue(context, clean);
    if (value === undefined) return '';
    if (value !== null && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    return stringifyValue(value);
  });
}

export function buildWebhookPrompt(
  schedule: ScheduleDefinition,
  payload: unknown,
  eventType: string,
  meta: { sourceIp?: string; receivedAt?: number; headers?: Record<string, string> }
): string {
  const trigger = schedule.webhook!;
  const receivedAt = meta.receivedAt || Date.now();
  const context: Record<string, unknown> = {
    payload,
    event: { type: eventType },
    schedule: { id: schedule.id, name: schedule.name, description: schedule.description },
    now: new Date(receivedAt).toISOString(),
    received_at: new Date(receivedAt).toISOString(),
    source_ip: meta.sourceIp || '',
    headers: meta.headers || {},
  };

  let prompt = '';
  if (trigger.prompt_template && trigger.prompt_template.trim()) {
    prompt = renderTemplate(trigger.prompt_template, context).trim();
  }
  if (!prompt) {
    prompt = schedule.prompt;
  }
  if (!prompt) prompt = `Webhook event ${eventType || 'received'} triggered schedule "${schedule.name}".`;

  if (trigger.include_payload !== false) {
    let payloadText = '';
    try {
      payloadText = JSON.stringify(payload ?? {}, null, 2);
    } catch {
      payloadText = String(payload ?? '');
    }
    if (payloadText.length > 12_000) payloadText = `${payloadText.slice(0, 12_000)}\n... (truncated)`;
    prompt +=
      `\n\n[Webhook trigger: ${eventType || 'event'}]\n` +
      `[Received at: ${new Date(receivedAt).toISOString()}]\n` +
      `[Source IP: ${meta.sourceIp || 'unknown'}]\n` +
      'Payload:\n```json\n' +
      payloadText +
      '\n```';
  }
  return prompt.trim();
}

export function payloadPreview(payload: unknown, limit = 1200): string {
  let text = '';
  try {
    text = JSON.stringify(payload ?? {});
  } catch {
    text = String(payload ?? '');
  }
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function dedupeKey(payload: unknown, trigger: WebhookTrigger): string {
  if (!trigger.dedupe_path) return '';
  const value = getPathValue(payload, trigger.dedupe_path);
  return stringifyValue(value);
}

export function defaultWebhookTrigger(): WebhookTrigger {
  return {
    auth_mode: 'signature',
    signature_header: 'X-Signature-256',
    signature_prefix: 'sha256=',
    secret: generateWebhookSecret(),
    token: generateWebhookToken(),
    event_types: [],
    event_type_path: 'type',
    filter_logic: 'all',
    filters: [],
    dedupe_path: '',
    dedupe_ttl_seconds: 3600,
    debounce_seconds: 0,
    cooldown_seconds: 0,
    max_runs_per_hour: 0,
    max_runs_per_day: 0,
    max_payload_bytes: 1_048_576,
    allowed_ips: [],
    replay_tolerance_seconds: 300,
    timestamp_header: 'X-Webhook-Timestamp',
    session_mode: 'new',
    include_payload: true,
    prompt_template: '',
  };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeWebhookTrigger(
  raw: any,
  existing?: WebhookTrigger | null
): WebhookTrigger {
  const base = existing || defaultWebhookTrigger();
  const input = raw && typeof raw === 'object' ? raw : {};
  const authModes = ['signature', 'token', 'none'];
  const authMode = authModes.includes(input.auth_mode)
    ? input.auth_mode
    : base.auth_mode;

  const filters: WebhookFilter[] = Array.isArray(input.filters)
    ? input.filters
        .filter((f: any) => f && typeof f === 'object' && f.path)
        .map((f: any, index: number) => ({
          id: String(f.id || `filter_${index + 1}`),
          path: String(f.path || '').trim(),
          operator: f.operator || 'equals',
          value: f.value == null ? '' : String(f.value),
          case_sensitive: Boolean(f.case_sensitive),
        }))
    : base.filters || [];

  return {
    auth_mode: authMode,
    signature_header: String(
      input.signature_header || base.signature_header || 'X-Signature-256'
    ).trim(),
    signature_prefix:
      input.signature_prefix !== undefined
        ? String(input.signature_prefix)
        : base.signature_prefix ?? 'sha256=',
    secret: existing?.secret || base.secret || generateWebhookSecret(),
    token: existing?.token || base.token || generateWebhookToken(),
    event_types: Array.isArray(input.event_types)
      ? input.event_types.map((s: any) => String(s).trim()).filter(Boolean)
      : base.event_types || [],
    event_type_path: String(
      input.event_type_path || base.event_type_path || 'type'
    ).trim(),
    filter_logic:
      input.filter_logic === 'any' ||
      (input.filter_logic === undefined && base.filter_logic === 'any')
        ? 'any'
        : 'all',
    filters,
    dedupe_path: String(input.dedupe_path ?? base.dedupe_path ?? '').trim(),
    dedupe_ttl_seconds: clampNumber(
      input.dedupe_ttl_seconds ?? base.dedupe_ttl_seconds,
      3600,
      0,
      604_800
    ),
    debounce_seconds: clampNumber(
      input.debounce_seconds ?? base.debounce_seconds,
      0,
      0,
      3600
    ),
    cooldown_seconds: clampNumber(
      input.cooldown_seconds ?? base.cooldown_seconds,
      0,
      0,
      86_400
    ),
    max_runs_per_hour: clampNumber(
      input.max_runs_per_hour ?? base.max_runs_per_hour,
      0,
      0,
      10_000
    ),
    max_runs_per_day: clampNumber(
      input.max_runs_per_day ?? base.max_runs_per_day,
      0,
      0,
      100_000
    ),
    max_payload_bytes: clampNumber(
      input.max_payload_bytes ?? base.max_payload_bytes,
      1_048_576,
      1_024,
      10_485_760
    ),
    allowed_ips: Array.isArray(input.allowed_ips)
      ? input.allowed_ips.map((s: any) => String(s).trim()).filter(Boolean)
      : base.allowed_ips || [],
    replay_tolerance_seconds: clampNumber(
      input.replay_tolerance_seconds ?? base.replay_tolerance_seconds,
      0,
      0,
      86_400
    ),
    timestamp_header: String(
      input.timestamp_header || base.timestamp_header || 'X-Webhook-Timestamp'
    ).trim(),
    session_mode:
      input.session_mode === 'continue' ||
      (input.session_mode === undefined && base.session_mode === 'continue')
        ? 'continue'
        : 'new',
    include_payload:
      input.include_payload === undefined
        ? base.include_payload !== false
        : Boolean(input.include_payload),
    prompt_template:
      input.prompt_template !== undefined
        ? String(input.prompt_template)
        : base.prompt_template || '',
  };
}

export function validateWebhookTrigger(trigger: WebhookTrigger): string[] {
  const errors: string[] = [];
  if (!['signature', 'token', 'none'].includes(trigger.auth_mode)) {
    errors.push('Webhook auth mode must be signature, token, or none.');
  }
  if (!trigger.secret) errors.push('Webhook secret is missing.');
  if (!trigger.token) errors.push('Webhook token is missing.');
  if (!trigger.event_type_path) errors.push('Event type path is required.');
  for (const filter of trigger.filters || []) {
    if (!filter.path) errors.push('Every webhook filter needs a payload path.');
    if (filter.operator === 'regex') {
      try {
        new RegExp(filter.value || '');
      } catch {
        errors.push(`Filter regex "${filter.value}" is invalid.`);
      }
    }
  }
  for (const rule of trigger.allowed_ips || []) {
    if (rule.includes('/')) {
      const bits = Number(rule.split('/')[1]);
      if (!Number.isInteger(bits) || bits < 0 || bits > 32) {
        errors.push(`IP allowlist rule "${rule}" has an invalid CIDR prefix.`);
      }
    }
  }
  return errors;
}

export function webhookPublicView(trigger: WebhookTrigger, baseUrl = '') {
  const url = `${baseUrl}/api/cron/webhook/${trigger.token}`;
  return {
    url,
    auth_mode: trigger.auth_mode,
    signature_header: trigger.signature_header,
    signature_prefix: trigger.signature_prefix,
    secret_preview: maskSecret(trigger.secret),
    token: trigger.token,
    event_types: trigger.event_types,
    event_type_path: trigger.event_type_path,
    filter_logic: trigger.filter_logic,
    filters: trigger.filters,
    dedupe_path: trigger.dedupe_path,
    dedupe_ttl_seconds: trigger.dedupe_ttl_seconds,
    debounce_seconds: trigger.debounce_seconds,
    cooldown_seconds: trigger.cooldown_seconds,
    max_runs_per_hour: trigger.max_runs_per_hour,
    max_runs_per_day: trigger.max_runs_per_day,
    max_payload_bytes: trigger.max_payload_bytes,
    allowed_ips: trigger.allowed_ips,
    replay_tolerance_seconds: trigger.replay_tolerance_seconds,
    timestamp_header: trigger.timestamp_header,
    session_mode: trigger.session_mode,
    include_payload: trigger.include_payload,
    prompt_template: trigger.prompt_template,
  };
}

export function webhookRejection(
  statusCode: number,
  error: string,
  extra: Record<string, unknown> = {}
): WebhookResult {
  return { statusCode, body: { ok: false, error, ...extra } };
}
