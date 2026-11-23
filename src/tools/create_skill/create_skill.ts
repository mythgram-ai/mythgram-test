import { z } from 'zod';
import { MythgramTool, assertAbsolutePath } from '../types.js';
import { createSkillFromDirectory } from '../../skills/index.js';

export const createSkillSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(70)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .describe(
        'Skill identifier: lowercase alphanumeric segments separated by single hyphens; maximum 70 characters.'
      ),
    description: z
      .string()
      .min(1)
      .max(300)
      .describe(
        'Concise description of what the skill does and when it should be used.'
      ),
    source_path: z
      .string()
      .min(1)
      .describe(
        'Absolute path to the directory containing SKILL.md and any skill reference files.'
      ),
  })
  .strict();

export const createSkillTool: MythgramTool<typeof createSkillSchema> = {
  name: 'create_skill',
  description:
    'Create and persist a custom skill by reading the completed skill directory at source_path and storing its files under the supplied skill name.',
  schema: createSkillSchema,
  execute: async (args) => {
    const absSource = assertAbsolutePath(args.source_path, 'source_path');
    const skill = await createSkillFromDirectory({
      name: args.name,
      description: args.description,
      sourcePath: absSource,
    });
    return {
      success: true,
      skill: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        folder_path: skill.folder_path,
        skill_md_path: skill.skill_md_path,
        subfolders: skill.subfolders,
        files: skill.files,
      },
    };
  },
};
