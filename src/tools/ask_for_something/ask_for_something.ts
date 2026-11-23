import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { waitForUserInteraction } from '../interactive-store.js';

export const askForSomethingSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            request: z
              .string()
              .describe(
                'Explain what information the user needs to provide and why it is needed.'
              ),
            placeholder: z
              .string()
              .describe(
                "Placeholder text displayed inside this item's input field."
              ),
          })
          .strict()
          .describe('One piece of information to request from the user.')
      )
      .min(1)
      .describe(
        'List of all information requests to display to the user in a single form.'
      ),
  })
  .strict();

export const askForSomethingTool: MythgramTool<typeof askForSomethingSchema> = {
  name: 'ask_for_something',
  description:
    "Ask the user to provide one or more pieces of information in a single tool call. Each item displays an input field with a request description and placeholder; the tool waits for the user's response.",
  schema: askForSomethingSchema,
  execute: async (args, context) => {
    const response = await waitForUserInteraction({
      sessionId: context.sessionId,
      toolCallId: context.toolCallId || `ask_for_${Date.now()}`,
      activityId: context.activityId,
      kind: 'ask_for_something',
      payload: {
        items: args.items,
      },
      signal: context.signal,
    });

    return {
      success: true,
      user_response: response,
    };
  },
};
