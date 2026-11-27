import { MythgramTool } from '../types.js';
import { scheduleListSchema, scheduleSummary } from './schedule_shared.js';

export const scheduleListTool: MythgramTool<typeof scheduleListSchema> = {
  name: 'schedule_list',
  description:
    'List scheduled tasks filtered by their current status. Returns each schedule ID, name, description, cadence, next run time, and last run status. Use active for enabled schedules, paused for paused schedules, or all for both.',
  schema: scheduleListSchema,
  execute: async (args) => {
    const { listSchedules } = await import('../../cron/engine.js');
    const filter = args.status ?? 'all';
    const schedules = await listSchedules();
    const filtered = schedules.filter((schedule) => {
      if (filter === 'active') return schedule.status === 'active';
      if (filter === 'paused') return schedule.status === 'paused';
      return true;
    });

    return {
      success: true,
      filter,
      count: filtered.length,
      schedules: filtered.map(scheduleSummary),
      hint:
        filtered.length === 0
          ? 'No schedules match this filter. Use schedule_create to create one.'
          : 'Use schedule_get with a schedule_id for the full task prompt and upcoming run times.',
    };
  },
};
