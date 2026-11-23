import { z } from 'zod';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { MythgramTool, assertAbsolutePath } from '../types.js';
import { db, SlideItem } from '../../db/index.js';

export const organizeSlidesSchema = z
  .object({
    project_name: z.string().describe('Name of the slide project.'),
    slides: z
      .array(
        z
          .object({
            html_file_path: z
              .string()
              .describe('Absolute path to the HTML file containing the slide.'),
            slide_number: z
              .number()
              .int()
              .describe('Slide number within the project.'),
          })
          .strict()
      )
      .min(1)
      .describe('Slides to organize into the project.'),
  })
  .strict();

export const organizeSlidesTool: MythgramTool<typeof organizeSlidesSchema> = {
  name: 'organize_slides',
  description:
    'Organize one or more HTML slide files into a single slide project. Each slide needs its HTML file path and slide number.',
  schema: organizeSlidesSchema,
  execute: async (args, context) => {
    const slideItems: SlideItem[] = [];

    for (const s of args.slides) {
      const absPath = assertAbsolutePath(s.html_file_path, 'html_file_path');
      let htmlContent = '';
      try {
        htmlContent = await fs.readFile(absPath, 'utf-8');
      } catch (err: any) {
        throw new Error(
          `Failed to read slide HTML file at "${absPath}": ${err?.message || String(err)}`
        );
      }

      slideItems.push({
        slide_number: s.slide_number,
        html_file_path: absPath,
        html_content: htmlContent,
      });
    }

    slideItems.sort((a, b) => a.slide_number - b.slide_number);
    // Normalize slide numbers sequentially 1..N
    slideItems.forEach((item, idx) => {
      item.slide_number = idx + 1;
    });

    const projectId = `slides_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const saved = db.upsertSlideProject({
      id: projectId,
      name: args.project_name.trim() || 'Presentation',
      sessionId: context.sessionId,
      slides: slideItems,
    });

    return {
      success: true,
      project_id: saved.id,
      project_name: saved.name,
      slides_count: slideItems.length,
      slides: slideItems.map((s) => ({
        slide_number: s.slide_number,
        html_file_path: s.html_file_path,
      })),
    };
  },
};
