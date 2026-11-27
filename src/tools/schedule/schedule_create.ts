import { MythgramTool } from '../types.js';
import { db } from '../../db/index.js';
import { getCustomAgentForSession } from '../../custom-agents/index.js';
import { describeNormalTrigger } from '../../cron/schedule.js';
import {
  buildNormalTrigger,
  scheduleCreateSchema,
  scheduleSummary,
} from './schedule_shared.js';

export const scheduleCreateTool: MythgramTool<typeof scheduleCreateSchema> = {
  name: 'schedule_create',
  description:
    'Create a background schedule that runs an agent task at the specified time or recurrence. Choose a cadence and provide only the fields required for that cadence: one_time needs date and time; every_x needs interval and interval_unit; daily needs time; weekly needs weekdays and time; monthly needs day_of_month and time; custom_cron needs a 5-field cron_expression. Always pass the IANA timezone. Each run starts a new autonomous agent session that inherits the current workspace, model, and agent persona, so the task keeps running after this conversation ends.',
  schema: scheduleCreateSchema,
  execute: async (args, context) => {
    const { createSchedule, ensureCronStore } = await import('../../cron/engine.js');
    await ensureCronStore();

    const normal = buildNormalTrigger(args);
    const session = db.getSession(context.sessionId);
    const customAgent = await getCustomAgentForSession(context.sessionId);

    const schedule = await createSchedule({
      name: args.schedule_name,
      description: describeNormalTrigger(normal),
      prompt: args.task_prompt,
      method: 'normal',
      enabled: true,
      normal,
      agent: {
        agent_id: customAgent?.id ?? null,
        provider_id: session?.provider_id ?? null,
        model_id: session?.model_id ?? null,
        workspace: context.workspace || session?.workspace || null,
        timeout_seconds: null,
      },
    });

    const summary = scheduleSummary(schedule);
    return {
      success: true,
      ...summary,
      message: `Schedule "${schedule.name}" created: ${summary.schedule_description}.`,
    };
  },
};
