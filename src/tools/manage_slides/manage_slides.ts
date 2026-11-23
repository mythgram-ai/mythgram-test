import { z } from 'zod';
import fs from 'node:fs/promises';
import { MythgramTool, assertAbsolutePath } from '../types.js';
import { db, SlideItem } from '../../db/index.js';

export const manageSlidesSchema = z
  .object({
    project_id: z
      .string()
      .describe('Unique ID of the slide project to manage.'),
    action: z
      .enum([
        'delete_slide',
        'replace_slide',
        'change_slide_position',
        'rename_slide_project',
        'delete_slide_project',
      ])
      .describe('Operation to perform on the slide project.'),
    slide_number: z
      .number()
      .int()
      .optional()
      .describe(
        'Current slide number; required for delete_slide, replace_slide, and change_slide_position.'
      ),
    html_file_path: z
      .string()
      .optional()
      .describe(
        'Absolute path to the replacement HTML slide file; required for replace_slide.'
      ),
    new_position: z
      .number()
      .int()
      .optional()
      .describe('Desired slide position; required for change_slide_position.'),
    new_project_name: z
      .string()
      .optional()
      .describe('New project name; required for rename_slide_project.'),
  })
  .strict();

export const manageSlidesTool: MythgramTool<typeof manageSlidesSchema> = {
  name: 'manage_slides',
  description:
    'Manage an existing slide project by deleting or replacing a slide, changing slide order, renaming the project, or deleting the project. Supply parameters required by the selected action.',
  schema: manageSlidesSchema,
  execute: async (args, context) => {
    const project = db.getSlideProject(args.project_id);
    if (!project) {
      throw new Error(`Slide project "${args.project_id}" not found.`);
    }

    if (args.action === 'delete_slide_project') {
      db.deleteSlideProject(args.project_id);
      return {
        success: true,
        project_id: args.project_id,
        action: args.action,
        message: `Slide project "${project.name}" (${args.project_id}) deleted.`,
      };
    }

    let slides: SlideItem[] = [];
    try {
      slides = JSON.parse(project.slides_json);
    } catch {
      slides = [];
    }

    if (args.action === 'rename_slide_project') {
      if (!args.new_project_name || !args.new_project_name.trim()) {
        throw new Error('new_project_name is required for rename_slide_project.');
      }
      const updated = db.upsertSlideProject({
        id: project.id,
        name: args.new_project_name.trim(),
        sessionId: project.session_id || context.sessionId,
        slides,
      });
      return {
        success: true,
        project_id: updated.id,
        project_name: updated.name,
        action: args.action,
      };
    }

    if (args.slide_number === undefined) {
      throw new Error(`slide_number is required for action "${args.action}".`);
    }

    const targetIdx = slides.findIndex((s) => s.slide_number === args.slide_number);
    if (targetIdx === -1) {
      throw new Error(
        `Slide number ${args.slide_number} not found in project "${project.name}".`
      );
    }

    if (args.action === 'delete_slide') {
      slides.splice(targetIdx, 1);
      slides.forEach((s, idx) => {
        s.slide_number = idx + 1;
      });
    } else if (args.action === 'replace_slide') {
      if (!args.html_file_path) {
        throw new Error('html_file_path is required for replace_slide.');
      }
      const absPath = assertAbsolutePath(args.html_file_path, 'html_file_path');
      const htmlContent = await fs.readFile(absPath, 'utf-8');
      slides[targetIdx] = {
        slide_number: args.slide_number,
        html_file_path: absPath,
        html_content: htmlContent,
      };
    } else if (args.action === 'change_slide_position') {
      if (args.new_position === undefined || args.new_position < 1) {
        throw new Error('Valid new_position (>= 1) is required for change_slide_position.');
      }
      const [moved] = slides.splice(targetIdx, 1);
      const insertIdx = Math.min(Math.max(0, args.new_position - 1), slides.length);
      slides.splice(insertIdx, 0, moved);
      slides.forEach((s, idx) => {
        s.slide_number = idx + 1;
      });
    }

    const updated = db.upsertSlideProject({
      id: project.id,
      name: project.name,
      sessionId: project.session_id || context.sessionId,
      slides,
    });

    return {
      success: true,
      project_id: updated.id,
      project_name: updated.name,
      action: args.action,
      slides_count: slides.length,
      slides: slides.map((s) => ({
        slide_number: s.slide_number,
        html_file_path: s.html_file_path,
      })),
    };
  },
};
