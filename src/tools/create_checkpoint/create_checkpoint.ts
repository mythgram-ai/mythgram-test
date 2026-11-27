import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { createCheckpoint } from '../../checkpoint/index.js';

export const createCheckpointSchema = z
  .object({
    name: z
      .string()
      .max(120)
      .nullish()
      .describe(
        'Optional checkpoint name. Defaults to a timestamped name. Example: before-refactor'
      ),
    description: z
      .string()
      .max(500)
      .nullish()
      .describe('Optional short note describing what this checkpoint captures.'),
  })
  .strict();

export const createCheckpointTool: MythgramTool<typeof createCheckpointSchema> = {
  name: 'create_checkpoint',
  description:
    'Create a checkpoint of the current workspace. The workspace is zipped into the Mythgram data directory at ".mythgram/checkpoints" (the ".mythgram" data directory itself is excluded). Returns the checkpoint id, name, zip file path, file count, and size.',
  schema: createCheckpointSchema,
  execute: async (args, context) => {
    const checkpoint = await createCheckpoint({
      workspace: context.workspace,
      name: args.name ?? undefined,
      description: args.description ?? undefined,
    });
    return {
      success: true,
      checkpoint,
      message: `Checkpoint "${checkpoint.name}" created with ${checkpoint.files_count} files at ${checkpoint.file_path}.`,
    };
  },
};
