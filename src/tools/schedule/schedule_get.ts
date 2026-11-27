import { MythgramTool } from '../types.js';
import { scheduleDetail, scheduleGetSchema, toIso } from './schedule_shared.js';

export const scheduleGetTool: MythgramTool<typeof scheduleGetSchema> = {
  name: 'schedule_get',
  description:
    'Get the complete details of a specific scheduled task: its full task prompt, cadence, timezone, next run, upcoming runs, run count, and recent run history.',
  schema: scheduleGetSchema,
  execute: async (args) => {
    const { getSchedule, getScheduleRuns } = await import('../../cron/engine.js');
    const schedule = await getSchedule(args.schedule_id);
    if (!schedule) {
      throw new Error(`Schedule "${args.schedule_id}" not found.`);
    }

    const runs = await getScheduleRuns(schedule.id, 5);
    return {
      success: true,
      ...scheduleDetail(schedule),
      recent_runs: runs.map((run) => ({
        run_id: run.id,
        status: run.status,
        trigger: run.trigger,
        started_at: toIso(run.started_at),
        finished_at: toIso(run.finished_at),
        duration_ms: run.duration_ms ?? null,
        session_id: run.session_id ?? null,
        error: run.error ?? null,
      })),
    };
  },
};
