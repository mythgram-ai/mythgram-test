import { z } from 'zod';
import { MythgramTool, assertAbsolutePath } from '../types.js';
import { saveArtifact } from '../../artifacts/index.js';

export const saveArtifactsSchema = z
  .object({
    artifact_file_path: z
      .string()
      .min(1)
      .describe('The absolute file system path of the artifact file to save.'),
    title: z
      .string()
      .min(1)
      .describe('The title of the artifact.'),
    description: z
      .string()
      .min(1)
      .describe('A brief description of the artifact and its contents.'),
    type: z
      .enum([
        'markdown',
        'code_file',
        'text',
        'html',
        'csv',
        'json',
        'docs',
        'design',
        'slides',
      ])
      .describe('The type of artifact being saved.'),
  })
  .strict();

export const saveArtifactsTool: MythgramTool<typeof saveArtifactsSchema> = {
  name: 'save_artifacts',
  description:
    "Save an artifact using an absolute file path, its title, description, and artifact type. The file is copied into '.mythgram/artifacts/' and becomes a reusable artifact. Media files (images, video, audio) cannot be saved as artifacts.",
  schema: saveArtifactsSchema,
  execute: async (args, context) => {
    const absPath = assertAbsolutePath(args.artifact_file_path, 'artifact_file_path');
    const saved = await saveArtifact({
      artifactFilePath: absPath,
      title: args.title,
      description: args.description,
      type: args.type,
      sessionId: context.sessionId,
    });
    return {
      success: true,
      artifact_id: saved.id,
      title: saved.title,
      description: saved.description,
      type: saved.type,
      artifact_file_path: saved.file_path,
    };
  },
};
