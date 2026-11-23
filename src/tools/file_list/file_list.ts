import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MythgramTool, assertAbsolutePath } from '../types.js';

export const fileListSchema = z
  .object({
    path: z
      .string()
      .default('.')
      .describe('Directory path (only absolute file path) to list.'),
  })
  .strict();

export const fileListTool: MythgramTool<typeof fileListSchema> = {
  name: 'file_list',
  description:
    'List the files and directories directly inside the given directory of the workspace. Use this to discover what files exist before reading or editing them.',
  schema: fileListSchema,
  execute: async (args, context) => {
    const rawPath = args.path === '.' ? context.workspace : args.path;
    const absPath = assertAbsolutePath(rawPath, 'path');
    const entries = await fs.readdir(absPath, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(absPath, entry.name);
        let size = 0;
        try {
          const st = await fs.stat(fullPath);
          size = st.size;
        } catch {
          // ignore broken symlinks
        }
        return {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size,
        };
      })
    );

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      directory: absPath,
      total: items.length,
      items,
    };
  },
};
