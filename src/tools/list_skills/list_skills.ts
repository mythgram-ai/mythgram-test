import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { listSkills } from '../../skills/index.js';

export const listSkillsSchema = z.object({}).strict();

export const listSkillsTool: MythgramTool<typeof listSkillsSchema> = {
  name: 'list_skills',
  description:
    'Return available skills and metadata and their local file path. Use this tool before reading a skill.',
  schema: listSkillsSchema,
  execute: async () => {
    const skills = await listSkills();
    return {
      success: true,
      count: skills.length,
      skills: skills.map((s) => ({
        name: s.name,
        description: s.description,
        is_default: s.is_default,
        folder_path: s.folder_path,
        skill_md_path: s.skill_md_path,
        subfolders: s.subfolders,
        files: s.files,
      })),
    };
  },
};
