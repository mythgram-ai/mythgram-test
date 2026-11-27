import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { listCheckpoints } from '../../checkpoint/index.js';
import { getDataDir } from '../../datadir/index.js';

export const listCheckpointsSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .nullish()
      .describe('Maximum number of checkpoints to return, newest first. Defaults to all.'),
  })
  .strict();

export const listCheckpointsTool: MythgramTool<typeof listCheckpointsSchema> = {
  name: 'list_checkpoints',
  description:
    'List all available checkpoints saved in the Mythgram data directory (".mythgram/checkpoints"). Each item includes its id, name, description, zip file path, source workspace, file count, size, and creation time. Use the returned id or name with restore_checkpoint.',
  schema: listCheckpointsSchema,
  execute: async (args) => {
    const checkpoints = await listCheckpoints(args.limit ?? undefined);
    return {
      success: true,
      checkpoints_dir: getDataDir().checkpointsDir,
      count: checkpoints.length,
      checkpoints,
    };
  },
};
