import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { restoreCheckpoint } from '../../checkpoint/index.js';

export const restoreCheckpointSchema = z
  .object({
    checkpoint_id: z
      .string()
      .min(1)
      .describe(
        'Checkpoint id or name returned by list_checkpoints. Example: cp_1735689600000_ab12cd'
      ),
  })
  .strict();

export const restoreCheckpointTool: MythgramTool<typeof restoreCheckpointSchema> = {
  name: 'restore_checkpoint',
  description:
    'Restore a checkpoint into the current workspace. Before extracting, the current workspace is zipped (excluding ".mythgram") and stored in ".mythgram/checkpoints/backup" so the restore can be undone. Files from the checkpoint overwrite matching workspace files; other files are left in place. Returns the backup path, restored checkpoint, and a confirmation message.',
  schema: restoreCheckpointSchema,
  execute: async (args, context) => {
    const result = await restoreCheckpoint({
      workspace: context.workspace,
      checkpointId: args.checkpoint_id,
    });
    return result;
  },
};
