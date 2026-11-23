import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { waitForUserInteraction } from '../interactive-store.js';

export const askQuestionToUserSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            question: z
              .string()
              .describe('The question that should be shown to the user.'),
            context: z
              .string()
              .describe(
                'Context or explanation that helps the user understand why the question is being asked and make an informed choice.'
              ),
            options: z
              .array(z.string())
              .min(1)
              .describe(
                'Predefined answers the user can choose from; the user may also provide a custom answer.'
              ),
          })
          .strict()
          .describe('A single question with context and predefined options.')
      )
      .min(1)
      .describe(
        'A list of questions to present to the user. Multiple questions can be asked in one tool call.'
      ),
  })
  .strict();

export const askQuestionToUserTool: MythgramTool<typeof askQuestionToUserSchema> = {
  name: 'ask_question_to_user',
  description:
    'Ask the user one or more questions when additional information, clarification, or a decision is required. Each question needs context and at least one predefined option; custom answers are also allowed.',
  schema: askQuestionToUserSchema,
  execute: async (args, context) => {
    const response = await waitForUserInteraction({
      sessionId: context.sessionId,
      toolCallId: context.toolCallId || `ask_q_${Date.now()}`,
      activityId: context.activityId,
      kind: 'ask_question_to_user',
      payload: {
        questions: args.questions,
      },
      signal: context.signal,
    });

    return {
      success: true,
      answers: response,
    };
  },
};
