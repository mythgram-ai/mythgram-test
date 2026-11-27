import { MythgramTool } from '../types.js';
import { scheduleDeleteSchema } from './schedule_shared.js';

export const scheduleDeleteTool: MythgramTool<typeof scheduleDeleteSchema> = {
  name: 'schedule_delete',
  description:
    'Permanently delete a scheduled task and prevent future executions. A run that is already in progress is stopped first.',
  schema: scheduleDeleteSchema,
  execute: async (args) => {
    const { deleteSchedule, getSchedule } = await import('../../cron/engine.js');
    const schedule = await getSchedule(args.schedule_id);
    if (!schedule) {
      throw new Error(`Schedule "${args.schedule_id}" not found.`);
    }
    const deleted = await deleteSchedule(schedule.id);
    if (!deleted) {
      throw new Error(`Schedule "${args.schedule_id}" could not be deleted.`);
    }
    return {
      success: true,
      schedule_id: schedule.id,
      name: schedule.name,
      message: `Schedule "${schedule.name}" was deleted and will not run again.`,
    };
  },
};
