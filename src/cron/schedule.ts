import type {
  NormalMode,
  NormalTrigger,
  ScheduleDefinition,
  SchedulePreview,
} from './types.js';

const MAX_SEARCH_DAYS = 732;

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};
const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const FALLBACK_TIMEZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Bangkok',
  'Asia/Dhaka',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Karachi',
  'Asia/Kathmandu',
  'Asia/Kolkata',
  'Asia/Manila',
  'Asia/Riyadh',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Taipei',
  'Asia/Tehran',
  'Asia/Tokyo',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Pacific/Auckland',
  'Pacific/Honolulu',
];

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function isValidTimezone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function getTimezoneList(): string[] {
  try {
    const supported = (Intl as any).supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) {
      const merged = new Set<string>(['UTC', ...supported]);
      return Array.from(merged).sort();
    }
  } catch {
    // fall through
  }
  return FALLBACK_TIMEZONES;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

export function getZonedParts(date: Date | number, timeZone: string): ZonedParts {
  const d = typeof date === 'number' ? new Date(date) : date;
  const parts = getFormatter(timeZone).formatToParts(d);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  const weekdayLabel = (values.weekday || 'Sun').slice(0, 3).toLowerCase();
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: WEEKDAY_INDEX[weekdayLabel] ?? 0,
  };
}

function offsetMsAt(utcMs: number, timeZone: string): number {
  const p = getZonedParts(utcMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Converts wall-clock components in a timezone to a UTC epoch in milliseconds. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): number {
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = offsetMsAt(wallUtc, timeZone);
  let result = wallUtc - offset;
  const secondOffset = offsetMsAt(result, timeZone);
  if (secondOffset !== offset) {
    offset = secondOffset;
    result = wallUtc - offset;
  }
  return result;
}

function localWallMs(date: Date | number, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** Parses `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]` as wall-clock time in `timeZone`. */
export function localDateTimeStringToUtc(value: string, timeZone: string): number {
  const trimmed = String(value || '').trim();
  if (!trimmed) return NaN;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(trimmed);
  if (!match) return NaN;
  return zonedTimeToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4] || 0),
    Number(match[5] || 0),
    Number(match[6] || 0),
    timeZone
  );
}

export function formatInTimezone(
  value: number,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!Number.isFinite(value)) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...options,
    }).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
}

export function parseTimeOfDay(value: string | null | undefined): {
  hour: number;
  minute: number;
} {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) throw new Error('Time of day must use HH:MM (24-hour) format.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Time of day must be between 00:00 and 23:59.');
  }
  return { hour, minute };
}

// ==================== CRON EXPRESSION PARSER ====================

export interface CronFields {
  seconds: number[];
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
  domRestricted: boolean;
  dowRestricted: boolean;
  hasSeconds: boolean;
  expression: string;
}

function expandCronField(
  raw: string,
  min: number,
  max: number,
  names?: Record<string, number>
): { values: number[]; restricted: boolean } {
  const field = raw.trim();
  if (!field) throw new Error('Cron expression contains an empty field.');
  if (field === '*' || field === '?') {
    return { values: range(min, max), restricted: false };
  }

  const values = new Set<number>();
  for (const chunk of field.split(',')) {
    const part = chunk.trim();
    if (!part) throw new Error(`Invalid cron list item in "${raw}".`);

    let step = 1;
    let base = part;
    const slash = part.indexOf('/');
    if (slash !== -1) {
      base = part.slice(0, slash);
      step = Number(part.slice(slash + 1));
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`Invalid cron step "${part}".`);
      }
    }

    let start: number;
    let end: number;
    if (base === '*' || base === '?') {
      start = min;
      end = max;
    } else if (base.includes('-')) {
      const [a, b] = base.split('-');
      start = parseCronValue(a, names);
      end = parseCronValue(b, names);
    } else {
      start = parseCronValue(base, names);
      end = slash === -1 ? start : max;
    }

    if (start < min || end > max || start > end) {
      throw new Error(`Cron value "${part}" is out of range ${min}-${max}.`);
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }

  return { values: Array.from(values).sort((a, b) => a - b), restricted: true };
}

function range(min: number, max: number): number[] {
  const out: number[] = [];
  for (let i = min; i <= max; i++) out.push(i);
  return out;
}

function parseCronValue(raw: string, names?: Record<string, number>): number {
  const value = raw.trim().toLowerCase();
  if (names && value in names) return names[value];
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`Invalid cron value "${raw}".`);
  return n;
}

export function parseCronExpression(expression: string): CronFields {
  const clean = String(expression || '').trim().replace(/\s+/g, ' ');
  const fields = clean.split(' ');
  if (fields.length !== 5 && fields.length !== 6) {
    throw new Error(
      'Cron expression must have 5 fields (min hour day month weekday) or 6 fields (sec min hour day month weekday).'
    );
  }
  const hasSeconds = fields.length === 6;
  const [secondRaw, minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = hasSeconds
    ? fields
    : ['0', ...fields];

  const seconds = expandCronField(secondRaw, 0, 59);
  const minutes = expandCronField(minuteRaw, 0, 59);
  const hours = expandCronField(hourRaw, 0, 23);
  const dom = expandCronField(domRaw, 1, 31);
  const months = expandCronField(monthRaw, 1, 12, MONTH_NAMES);
  const dow = expandCronField(dowRaw.replace(/7/g, '0'), 0, 6, WEEKDAY_INDEX);

  return {
    seconds: seconds.values,
    minutes: minutes.values,
    hours: hours.values,
    daysOfMonth: dom.values,
    months: months.values,
    daysOfWeek: dow.values,
    domRestricted: dom.restricted,
    dowRestricted: dow.restricted,
    hasSeconds,
    expression: clean,
  };
}

function cronDayMatches(fields: CronFields, parts: ZonedParts): boolean {
  if (!fields.months.includes(parts.month)) return false;
  const domMatch = fields.daysOfMonth.includes(parts.day);
  const dowMatch = fields.daysOfWeek.includes(parts.weekday);
  if (fields.domRestricted && fields.dowRestricted) return domMatch || dowMatch;
  if (fields.domRestricted) return domMatch;
  if (fields.dowRestricted) return dowMatch;
  return true;
}

export function computeCronNext(
  fields: CronFields,
  fromMs: number,
  timeZone: string,
  endAt?: number | null
): number | null {
  const nowParts = getZonedParts(fromMs, timeZone);
  const nowWall = localWallMs(fromMs, timeZone);
  const startDay = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day);

  for (let dayOffset = 0; dayOffset <= MAX_SEARCH_DAYS; dayOffset++) {
    const dayWall = startDay + dayOffset * 86_400_000;
    const dayDate = new Date(dayWall);
    const parts: ZonedParts = {
      year: dayDate.getUTCFullYear(),
      month: dayDate.getUTCMonth() + 1,
      day: dayDate.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
      weekday: dayDate.getUTCDay(),
    };
    if (!cronDayMatches(fields, parts)) continue;

    for (const hour of fields.hours) {
      for (const minute of fields.minutes) {
        for (const second of fields.seconds) {
          const candidateWall =
            dayWall + hour * 3_600_000 + minute * 60_000 + second * 1_000;
          if (candidateWall <= nowWall) continue;
          const utc = zonedTimeToUtc(
            parts.year,
            parts.month,
            parts.day,
            hour,
            minute,
            second,
            timeZone
          );
          if (utc <= fromMs) continue;
          if (endAt != null && utc > endAt) return null;
          return utc;
        }
      }
    }
  }
  return null;
}

// ==================== NEXT RUN COMPUTATION ====================

function nextDailyAtOrAfter(
  time: string,
  timeZone: string,
  fromMs: number,
  weekdays?: number[] | null,
  dayOfMonth?: number | null
): number | null {
  const { hour, minute } = parseTimeOfDay(time);
  const fromParts = getZonedParts(fromMs, timeZone);
  const fromWall = localWallMs(fromMs, timeZone);
  const startDay = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);

  for (let offset = 0; offset <= MAX_SEARCH_DAYS; offset++) {
    const dayWall = startDay + offset * 86_400_000;
    const dayDate = new Date(dayWall);
    const year = dayDate.getUTCFullYear();
    const month = dayDate.getUTCMonth() + 1;
    const day = dayDate.getUTCDate();
    const weekday = dayDate.getUTCDay();

    if (weekdays && weekdays.length > 0 && !weekdays.includes(weekday)) continue;
    if (dayOfMonth != null && day !== dayOfMonth) continue;

    const candidateWall = dayWall + hour * 3_600_000 + minute * 60_000;
    if (candidateWall <= fromWall) continue;
    const utc = zonedTimeToUtc(year, month, day, hour, minute, 0, timeZone);
    if (utc > fromMs) return utc;
  }
  return null;
}

function nextMonthlyAtOrAfter(
  time: string,
  timeZone: string,
  fromMs: number,
  daysOfMonth: number[]
): number | null {
  const { hour, minute } = parseTimeOfDay(time);
  const fromParts = getZonedParts(fromMs, timeZone);
  const fromWall = localWallMs(fromMs, timeZone);
  const sortedDays = Array.from(new Set(daysOfMonth)).sort((a, b) => a - b);

  for (let monthOffset = 0; monthOffset <= 48; monthOffset++) {
    const anchor = new Date(
      Date.UTC(fromParts.year, fromParts.month - 1 + monthOffset, 1)
    );
    const year = anchor.getUTCFullYear();
    const month = anchor.getUTCMonth() + 1;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    for (const day of sortedDays) {
      if (day > daysInMonth) continue;
      const candidateWall = Date.UTC(year, month - 1, day, hour, minute);
      if (candidateWall <= fromWall) continue;
      const utc = zonedTimeToUtc(year, month, day, hour, minute, 0, timeZone);
      if (utc > fromMs) return utc;
    }
  }
  return null;
}

const INTERVAL_UNIT_MS: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

export function computeNextRun(
  schedule: Pick<ScheduleDefinition, 'normal' | 'created_at'>,
  fromMs: number = Date.now()
): number | null {
  const normal = schedule.normal;
  if (!normal || !isValidTimezone(normal.timezone)) return null;

  const endAt = normal.end_at ?? null;
  if (endAt != null && fromMs >= endAt) return null;

  let baseFrom = fromMs;
  if (
    normal.start_at != null &&
    normal.mode !== 'once' &&
    baseFrom < normal.start_at - 1
  ) {
    baseFrom = normal.start_at - 1;
  }

  let next: number | null = null;
  switch (normal.mode) {
    case 'once': {
      if (normal.run_at == null) return null;
      next = normal.run_at;
      break;
    }
    case 'interval': {
      const value = Number(normal.interval_value || 0);
      const unitMs = INTERVAL_UNIT_MS[normal.interval_unit || 'minutes'];
      if (!Number.isFinite(value) || value <= 0 || !unitMs) return null;
      const step = value * unitMs;
      const anchor = normal.start_at ?? schedule.created_at ?? fromMs;
      if (anchor > baseFrom) {
        next = anchor;
      } else {
        const steps = Math.floor((baseFrom - anchor) / step) + 1;
        next = anchor + steps * step;
      }
      break;
    }
    case 'cron': {
      try {
        const fields = parseCronExpression(normal.cron_expression || '');
        next = computeCronNext(fields, baseFrom, normal.timezone, endAt);
      } catch {
        return null;
      }
      break;
    }
    case 'daily': {
      next = nextDailyAtOrAfter(
        normal.time_of_day || '09:00',
        normal.timezone,
        baseFrom
      );
      break;
    }
    case 'weekly': {
      const weekdays =
        normal.weekdays && normal.weekdays.length > 0
          ? normal.weekdays
          : [0, 1, 2, 3, 4, 5, 6];
      next = nextDailyAtOrAfter(
        normal.time_of_day || '09:00',
        normal.timezone,
        baseFrom,
        weekdays
      );
      break;
    }
    case 'monthly': {
      const days =
        normal.days_of_month && normal.days_of_month.length > 0
          ? normal.days_of_month
          : [1];
      next = nextMonthlyAtOrAfter(
        normal.time_of_day || '09:00',
        normal.timezone,
        baseFrom,
        days
      );
      break;
    }
    default:
      return null;
  }

  if (next == null) return null;
  if (normal.start_at != null && next < normal.start_at) {
    if (normal.mode === 'once' || fromMs >= normal.start_at) return null;
    return computeNextRun(schedule, normal.start_at - 1);
  }
  if (endAt != null && next > endAt) return null;
  return next;
}

export function getUpcomingRuns(
  schedule: Pick<ScheduleDefinition, 'normal' | 'created_at'>,
  count = 5,
  fromMs: number = Date.now()
): number[] {
  const out: number[] = [];
  let cursor = fromMs;
  for (let i = 0; i < Math.max(1, count); i++) {
    const next = computeNextRun(schedule, cursor);
    if (next == null) break;
    out.push(next);
    if (schedule.normal?.mode === 'once') break;
    cursor = next;
  }
  return out;
}

// ==================== VALIDATION & DESCRIPTION ====================

export function validateNormalTrigger(normal: NormalTrigger): string[] {
  const errors: string[] = [];
  const modes: NormalMode[] = ['once', 'interval', 'cron', 'daily', 'weekly', 'monthly'];
  if (!modes.includes(normal.mode)) {
    errors.push(`Unknown schedule mode "${normal.mode}".`);
    return errors;
  }
  if (!isValidTimezone(normal.timezone || '')) {
    errors.push('Choose a valid IANA timezone (for example UTC or America/New_York).');
  }

  if (normal.mode === 'once') {
    if (normal.run_at == null || !Number.isFinite(normal.run_at)) {
      errors.push('A one-time schedule needs a date and time.');
    }
  }
  if (normal.mode === 'interval') {
    if (!Number.isFinite(Number(normal.interval_value)) || Number(normal.interval_value) <= 0) {
      errors.push('Interval must be a positive number.');
    }
    if (!['minutes', 'hours', 'days'].includes(String(normal.interval_unit))) {
      errors.push('Interval unit must be minutes, hours, or days.');
    }
  }
  if (normal.mode === 'cron') {
    try {
      parseCronExpression(normal.cron_expression || '');
    } catch (err: any) {
      errors.push(err?.message || 'Invalid cron expression.');
    }
  }
  if (['daily', 'weekly', 'monthly'].includes(normal.mode)) {
    try {
      parseTimeOfDay(normal.time_of_day);
    } catch (err: any) {
      errors.push(err?.message || 'Invalid time of day.');
    }
  }
  if (normal.mode === 'weekly') {
    const weekdays = normal.weekdays || [];
    if (weekdays.length === 0) errors.push('Pick at least one weekday.');
    if (weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      errors.push('Weekdays must be between 0 (Sunday) and 6 (Saturday).');
    }
  }
  if (normal.mode === 'monthly') {
    const days = normal.days_of_month || [];
    if (days.length === 0) errors.push('Pick at least one day of the month.');
    if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) {
      errors.push('Days of month must be between 1 and 31.');
    }
  }
  if (
    normal.start_at != null &&
    normal.end_at != null &&
    normal.start_at >= normal.end_at
  ) {
    errors.push('Start date must be before the end date.');
  }
  if (normal.mode === 'once' && normal.run_at != null) {
    if (normal.start_at != null && normal.run_at < normal.start_at) {
      errors.push('The one-time date is before the start date.');
    }
    if (normal.end_at != null && normal.run_at > normal.end_at) {
      errors.push('The one-time date is after the end date.');
    }
  }
  return errors;
}

export function describeNormalTrigger(normal: NormalTrigger): string {
  const tz = normal.timezone || 'UTC';
  const time = normal.time_of_day || '09:00';
  let base = '';
  switch (normal.mode) {
    case 'once':
      base = normal.run_at
        ? `Once on ${formatInTimezone(normal.run_at, tz)}`
        : 'One-time schedule';
      break;
    case 'interval':
      base = `Every ${normal.interval_value} ${normal.interval_unit}`;
      break;
    case 'cron':
      base = `Cron ${normal.cron_expression}`;
      break;
    case 'daily':
      base = `Daily at ${time}`;
      break;
    case 'weekly': {
      const days = (normal.weekdays || [])
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_NAMES[d] || String(d))
        .join(', ');
      base = `Weekly on ${days || 'every day'} at ${time}`;
      break;
    }
    case 'monthly': {
      const days = (normal.days_of_month || [])
        .slice()
        .sort((a, b) => a - b)
        .join(', ');
      base = `Monthly on day ${days || '1'} at ${time}`;
      break;
    }
    default:
      base = normal.mode;
  }
  const extras: string[] = [tz];
  if (normal.start_at) extras.push(`from ${formatInTimezone(normal.start_at, tz)}`);
  if (normal.end_at) extras.push(`until ${formatInTimezone(normal.end_at, tz)}`);
  return `${base} (${extras.join(' · ')})`;
}

export function previewNormalSchedule(
  normal: NormalTrigger,
  count = 5
): SchedulePreview {
  const errors = validateNormalTrigger(normal);
  if (errors.length > 0) {
    return { valid: false, errors, nextRuns: [], description: '' };
  }
  const stub: Pick<ScheduleDefinition, 'normal' | 'created_at'> = {
    normal,
    created_at: Date.now(),
  };
  return {
    valid: true,
    errors: [],
    nextRuns: getUpcomingRuns(stub, count),
    description: describeNormalTrigger(normal),
  };
}

export { WEEKDAY_NAMES };
