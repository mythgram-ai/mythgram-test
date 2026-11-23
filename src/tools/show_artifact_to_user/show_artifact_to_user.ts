import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { getArtifactById } from '../../artifacts/index.js';

export const showArtifactToUserSchema = z
  .object({
    artifact_id: z
      .string()
      .min(1)
      .describe(
        'The unique identifier of the artifact to display to the user; use list_artifacts to get artifact IDs.'
      ),
  })
  .strict();

export const showArtifactToUserTool: MythgramTool<typeof showArtifactToUserSchema> = {
  name: 'show_artifact_to_user',
  description:
    'Show an artifact preview to the user. Use the artifact ID to present the artifact.',
  schema: showArtifactToUserSchema,
  execute: async (args, context) => {
    const found = await getArtifactById(args.artifact_id);
    if (!found) {
      throw new Error(
        `Artifact "${args.artifact_id}" not found. Call list_artifacts to see available artifact IDs.`
      );
    }

    context.onUiAction?.({
      action: 'open_artifact',
      data: {
        artifact_id: found.artifact.id,
        title: found.artifact.title,
        description: found.artifact.description,
        type: found.artifact.type,
        file_path: found.artifact.file_path,
        content: found.content,
      },
    });

    return {
      success: true,
      artifact_id: found.artifact.id,
      title: found.artifact.title,
      description: found.artifact.description,
      type: found.artifact.type,
      file_path: found.artifact.file_path,
      content: found.content,
    };
  },
};
