import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { listArtifacts } from '../../artifacts/index.js';

export const listArtifactsSchema = z.object({}).strict();

export const listArtifactsTool: MythgramTool<typeof listArtifactsSchema> = {
  name: 'list_artifacts',
  description:
    'List all available artifacts and return their relevant metadata, such as artifact IDs, and file paths.',
  schema: listArtifactsSchema,
  execute: async () => {
    const artifacts = await listArtifacts();
    return {
      success: true,
      count: artifacts.length,
      artifacts: artifacts.map((a) => ({
        id: a.id,
        name: a.name,
        title: a.title,
        description: a.description,
        type: a.type,
        file_path: a.file_path,
        created_at: a.created_at,
      })),
    };
  },
};
