import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { waitForUserInteraction } from '../interactive-store.js';

export const submitPlanSchema = z
  .object({
    plan: z
      .string()
      .describe(
        'The complete project implementation plan, including the overall summary and milestones.'
      ),
  })
  .strict();

export const submitPlanTool: MythgramTool<typeof submitPlanSchema> = {
  name: 'submit_plan',
  description:
    "Submit the completed project implementation plan for the user's review. The user can approve, cancel, or edit it before approving.",
  schema: submitPlanSchema,
  execute: async (args, context) => {
    const response = await waitForUserInteraction({
      sessionId: context.sessionId,
      toolCallId: context.toolCallId || `plan_${Date.now()}`,
      activityId: context.activityId,
      kind: 'submit_plan',
      payload: {
        plan: args.plan,
      },
      signal: context.signal,
    });

    return {
      success: true,
      decision: response?.decision || 'approved',
      plan: response?.editedPlan || args.plan,
      feedback: response?.feedback || '',
    };
  },
};
