import { z } from 'zod';
import fg from 'fast-glob';
import { MythgramTool, assertAbsolutePath } from '../types.js';

export const globSchema = z
  .object({
    pattern: z
      .string()
      .min(1)
      .describe(
        "The glob pattern to match files against, such as '**/*.ts', '*.json', or 'src/**'."
      ),
    path: z
      .string()
      .optional()
      .describe(
        'Optional directory to search in. If omitted, the current working directory is used. Must be a valid directory path.'
      ),
  })
  .strict();

export const globTool: MythgramTool<typeof globSchema> = {
  name: 'glob',
  description:
    'Find files and directories matching a glob pattern. Searches recursively within the specified directory or the current working directory when no path is provided. Returns matching file paths, up to 100 results.',
  schema: globSchema,
  execute: async (args, context) => {
    const cwd = args.path ? assertAbsolutePath(args.path, 'path') : context.workspace;
    const entries = await fg(args.pattern, {
      cwd,
      absolute: true,
      onlyFiles: false,
      markDirectories: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/.mythgram/**'],
    });
    const limited = entries.slice(0, 100);
    return {
      pattern: args.pattern,
      directory: cwd,
      total_matches: limited.length,
      truncated: entries.length > 100,
      matches: limited,
    };
  },
};
