import { z } from 'zod';
import { MythgramTool } from '../types.js';

export const waitSchema = z
  .object({
    seconds: z
      .number()
      .int()
      .min(1)
      .max(180)
      .describe(
        'The amount of time to wait in seconds. Must be between 1 and 180 seconds.'
      ),
  })
  .strict();

export const waitTool: MythgramTool<typeof waitSchema> = {
  name: 'wait',
  description:
    'Pause the agent for a specified amount of time before continuing. Use this tool when you need to wait for a process, task, event, or external operation to complete. The wait duration is provided in seconds and can be between 1 and 180 seconds (3 minutes).',
  schema: waitSchema,
  execute: async (args, context) => {
    const durationMs = args.seconds * 1000;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => resolve(), durationMs);
      if (context.signal) {
        if (context.signal.aborted) {
          clearTimeout(timer);
          reject(new Error('Wait aborted.'));
          return;
        }
        context.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error('Wait aborted.'));
          },
          { once: true }
        );
      }
    });
    return {
      success: true,
      waited_seconds: args.seconds,
      message: `Waited ${args.seconds} second(s).`,
    };
  },
};
