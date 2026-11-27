import { z } from 'zod';
import type { NormalTrigger, ScheduleDefinition } from '../../cron/types.js';
import {
  describeNormalTrigger,
  formatInTimezone,
  getUpcomingRuns,
  isValidTimezone,
  localDateTimeStringToUtc,
  parseCronExpression,
} from '../../cron/schedule.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Rejects calendar dates such as 2026-02-30 that Date would silently roll forward. */
function isRealDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export const SCHEDULE_CADENCES = [
  'one_time',
  'every_x',
  'daily',
  'weekly',
  'monthly',
  'custom_cron',
] as const;

export const SCHEDULE_WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export const scheduleCreateSchema = z
  .object({
    schedule_name: z
      .string()
      .min(1)
      .describe('A short human-readable name for the schedule.'),
    task_prompt: z
      .string()
      .min(1)
      .describe('The task instructions that the agent will execute on each run.'),
    cadence: z.enum(SCHEDULE_CADENCES).describe('How often the task should run.'),
    date: z
      .string()
      .optional()
      .describe('Execution date for one_time schedules. Use YYYY-MM-DD.'),
    time: z.string().optional().describe('Execution time in HH:MM format.'),
    interval: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('The interval amount for every_x schedules.'),
    interval_unit: z
      .enum(['minutes', 'hours', 'days'])
      .optional()
      .describe('The time unit for the every_x interval.'),
    weekdays: z
      .array(z.enum(SCHEDULE_WEEKDAYS))
      .optional()
      .describe('Weekdays on which a weekly schedule should run.'),
    day_of_month: z
      .number()
      .int()
      .min(1)
      .max(31)
      .optional()
      .describe('Day of the month for monthly schedules.'),
    cron_expression: z
      .string()
      .optional()
      .describe('A valid 5-field cron expression for custom_cron schedules.'),
    timezone: z
      .string()
      .min(1)
      .describe('IANA timezone used to interpret the schedule, such as Asia/Calcutta.'),
    start_date: z
      .string()
      .optional()
      .describe(
        'Optional date from which a recurring schedule becomes active. Use YYYY-MM-DD.'
      ),
    end_date: z
      .string()
      .optional()
      .describe(
        'Optional date after which a recurring schedule stops. Use YYYY-MM-DD.'
      ),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (field: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });

    if (value.date && !DATE_PATTERN.test(value.date)) {
      issue('date', 'date must use YYYY-MM-DD format.');
    } else if (value.date && !isRealDate(value.date)) {
      issue('date', `"${value.date}" is not a real calendar date.`);
    }
    if (value.time && !TIME_PATTERN.test(value.time)) {
      issue('time', 'time must use 24-hour HH:MM format, for example 09:30.');
    }
    if (value.start_date && !DATE_PATTERN.test(value.start_date)) {
      issue('start_date', 'start_date must use YYYY-MM-DD format.');
    } else if (value.start_date && !isRealDate(value.start_date)) {
      issue('start_date', `"${value.start_date}" is not a real calendar date.`);
    }
    if (value.end_date && !DATE_PATTERN.test(value.end_date)) {
      issue('end_date', 'end_date must use YYYY-MM-DD format.');
    } else if (value.end_date && !isRealDate(value.end_date)) {
      issue('end_date', `"${value.end_date}" is not a real calendar date.`);
    }
    if (value.start_date && value.end_date && value.start_date > value.end_date) {
      issue('end_date', 'end_date must be on or after start_date.');
    }

    switch (value.cadence) {
      case 'one_time':
        if (!value.date) issue('date', 'one_time schedules need date (YYYY-MM-DD).');
        if (!value.time) issue('time', 'one_time schedules need time (HH:MM).');
        break;
      case 'every_x':
        if (value.interval == null) {
          issue('interval', 'every_x schedules need interval (a positive integer).');
        }
        if (!value.interval_unit) {
          issue('interval_unit', 'every_x schedules need interval_unit.');
        }
        break;
      case 'daily':
        if (!value.time) issue('time', 'daily schedules need time (HH:MM).');
        break;
      case 'weekly':
        if (!value.weekdays || value.weekdays.length === 0) {
          issue('weekdays', 'weekly schedules need at least one weekday.');
        }
        if (!value.time) issue('time', 'weekly schedules need time (HH:MM).');
        break;
      case 'monthly':
        if (value.day_of_month == null) {
          issue('day_of_month', 'monthly schedules need day_of_month (1-31).');
        }
        if (!value.time) issue('time', 'monthly schedules need time (HH:MM).');
        break;
      case 'custom_cron': {
        const expression = value.cron_expression?.trim();
        if (!expression) {
          issue(
            'cron_expression',
            'custom_cron schedules need a 5-field cron_expression (minute hour day month weekday).'
          );
        } else {
          try {
            parseCronExpression(expression);
          } catch (err: any) {
            issue('cron_expression', err?.message || 'Invalid cron expression.');
          }
        }
        break;
      }
    }

    if (!isValidTimezone(value.timezone)) {
      issue(
        'timezone',
        `Unknown timezone "${value.timezone}". Use an IANA timezone such as UTC, Asia/Calcutta, or America/New_York.`
      );
    }
  });

export type ScheduleCreateArgs = z.infer<typeof scheduleCreateSchema>;

export const scheduleListSchema = z
  .object({
    status: z
      .enum(['active', 'paused', 'all'])
      .optional()
      .describe(
        'Filter schedules by status. Use active for enabled schedules, paused for paused schedules, or all for both.'
      ),
  })
  .strict();

export const scheduleGetSchema = z
  .object({
    schedule_id: z
      .string()
      .min(1)
      .describe('The ID of the schedule to inspect.'),
  })
  .strict();

export const scheduleRunNowSchema = z
  .object({
    schedule_id: z
      .string()
      .min(1)
      .describe('The ID of the schedule to execute now.'),
  })
  .strict();

export const scheduleDeleteSchema = z
  .object({
    schedule_id: z
      .string()
      .min(1)
      .describe('The ID of the schedule to delete.'),
  })
  .strict();

function dateBoundaryToUtc(
  date: string | undefined,
  timezone: string,
  edge: 'start' | 'end'
): number | null {
  if (!date) return null;
  const suffix = edge === 'start' ? 'T00:00:00' : 'T23:59:59';
  const parsed = localDateTimeStringToUtc(`${date}${suffix}`, timezone);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Maps the tool's flat cadence arguments onto the cron engine's NormalTrigger shape. */
export function buildNormalTrigger(
  args: ScheduleCreateArgs
): NormalTrigger & Record<string, unknown> {
  const timezone = args.timezone.trim();
  const trigger: NormalTrigger = {
    mode: 'daily',
    timezone,
    start_at: dateBoundaryToUtc(args.start_date, timezone, 'start'),
    end_at: dateBoundaryToUtc(args.end_date, timezone, 'end'),
    run_at: null,
    interval_value: null,
    interval_unit: null,
    cron_expression: null,
    time_of_day: null,
    weekdays: null,
    days_of_month: null,
    skip_if_missed: true,
    catch_up_grace_seconds: 60,
  };

  switch (args.cadence) {
    case 'one_time':
      return {
        ...trigger,
        mode: 'once',
        run_at: localDateTimeStringToUtc(`${args.date}T${args.time}`, timezone),
      };
    case 'every_x':
      return {
        ...trigger,
        mode: 'interval',
        interval_value: args.interval ?? null,
        interval_unit: args.interval_unit ?? 'minutes',
      };
    case 'daily':
      return { ...trigger, mode: 'daily', time_of_day: args.time ?? null };
    case 'weekly':
      return {
        ...trigger,
        mode: 'weekly',
        time_of_day: args.time ?? null,
        weekdays: (args.weekdays ?? []).map((day) => WEEKDAY_INDEX[day]),
      };
    case 'monthly':
      return {
        ...trigger,
        mode: 'monthly',
        time_of_day: args.time ?? null,
        days_of_month: args.day_of_month != null ? [args.day_of_month] : [],
      };
    case 'custom_cron':
      return {
        ...trigger,
        mode: 'cron',
        cron_expression: (args.cron_expression ?? '').trim(),
      };
  }
}

export function toIso(value?: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

export function scheduleSummary(schedule: ScheduleDefinition) {
  const normal = schedule.normal;
  const timezone = normal?.timezone ?? 'UTC';
  const nextRunAt = schedule.next_run_at ?? null;
  return {
    schedule_id: schedule.id,
    name: schedule.name,
    description: schedule.description,
    enabled: schedule.enabled,
    status: schedule.status,
    cadence: normal?.mode ?? (schedule.method === 'webhook' ? 'webhook' : null),
    timezone,
    schedule_description: normal ? describeNormalTrigger(normal) : '',
    next_run_at: toIso(nextRunAt),
    next_run_local: nextRunAt ? formatInTimezone(nextRunAt, timezone) : null,
    last_run_at: toIso(schedule.last_run_at),
    last_status: schedule.last_status ?? null,
    run_count: schedule.run_count,
    task_prompt_preview:
      schedule.prompt.length > 300
        ? `${schedule.prompt.slice(0, 300)}…`
        : schedule.prompt,
  };
}

export function scheduleDetail(schedule: ScheduleDefinition) {
  const normal = schedule.normal;
  const upcoming =
    normal != null
      ? getUpcomingRuns(schedule, 5).map((ms) => ({
          at: toIso(ms),
          local: formatInTimezone(ms, normal.timezone),
        }))
      : [];
  return {
    ...scheduleSummary(schedule),
    task_prompt: schedule.prompt,
    upcoming_runs: upcoming,
    created_at: toIso(schedule.created_at),
    updated_at: toIso(schedule.updated_at),
    last_session_id: schedule.last_session_id ?? null,
    last_error: schedule.last_error ?? null,
  };
}
