import { MythgramTool } from '../types.js';
import { scheduleRunNowSchema, toIso } from './schedule_shared.js';

export const scheduleRunNowTool: MythgramTool<typeof scheduleRunNowSchema> = {
  name: 'schedule_run_now',
  description:
    'Immediately start executing a scheduled task without waiting for its next scheduled time. Returns right away while the run continues in the background — do not wait for it to finish.',
  schema: scheduleRunNowSchema,
  execute: async (args) => {
    const { runScheduleNow } = await import('../../cron/engine.js');
    const run = await runScheduleNow(args.schedule_id);
    return {
      success: true,
      schedule_id: run.schedule_id,
      run_id: run.id,
      status: run.status,
      session_id: run.session_id ?? null,
      started_at: toIso(run.started_at),
      message:
        'The scheduled task started in a new session. It continues in the background; do not wait for it to finish.',
    };
  },
};
