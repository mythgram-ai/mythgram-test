import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { db } from '../../db/index.js';

export const presentSlidesSchema = z
  .object({
    project_ids: z
      .array(z.string().describe('Unique ID of a slide project.'))
      .min(1)
      .describe('IDs of the slide projects to present.'),
  })
  .strict();

export const presentSlidesTool: MythgramTool<typeof presentSlidesSchema> = {
  name: 'present_slides',
  description: 'Present previews of one or more slide projects to the user.',
  schema: presentSlidesSchema,
  execute: async (args, context) => {
    const uniqueIds = Array.from(new Set(args.project_ids));
    const projects: any[] = [];
    const missing: string[] = [];

    for (const id of uniqueIds) {
      const row = db.getSlideProject(id);
      if (!row) {
        missing.push(id);
        continue;
      }
      let slides = [];
      try {
        slides = JSON.parse(row.slides_json);
      } catch {
        slides = [];
      }
      projects.push({
        id: row.id,
        name: row.name,
        slides_count: slides.length,
        slides,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    if (projects.length === 0) {
      throw new Error(
        `None of the requested slide project IDs were found: ${uniqueIds.join(', ')}`
      );
    }

    context.onUiAction?.({
      action: 'open_slides',
      data: {
        project_ids: projects.map((p) => p.id),
        projects,
      },
    });

    return {
      success: true,
      presented_count: projects.length,
      project_ids: projects.map((p) => p.id),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        slides_count: p.slides_count,
      })),
      missing_ids: missing,
    };
  },
};
