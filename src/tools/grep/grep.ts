import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MythgramTool, assertAbsolutePath } from '../types.js';

const execFileAsync = promisify(execFile);

export const grepSchema = z
  .object({
    pattern: z
      .string()
      .min(1)
      .describe(
        "The regular expression (regex) pattern to search for within file contents (e.g. 'function\\s+myFunction', 'import\\s+\\{.*\\}\\s+from\\s+.*')"
      ),
    path: z
      .string()
      .optional()
      .describe(
        'The absolute path to the directory to search within. If omitted, searches the current working directory (the workspace root)'
      ),
    include: z
      .string()
      .optional()
      .describe(
        "A glob pattern to filter which files are searched (e.g. '*.js', '*.{ts,tsx}', 'src/**'). If omitted, searches all files"
      ),
  })
  .strict();

export const grepTool: MythgramTool<typeof grepSchema> = {
  name: 'grep',
  description:
    'Fast text-based regex search that finds exact pattern matches within files or directories, utilizing the ripgrep command for efficient searching.\nResults will be formatted in the style of ripgrep and can be configured to include line numbers and content.\nTo avoid overwhelming output, the results are capped at 50 matches.\nUse the include or exclude patterns to filter the search scope by file type or specific paths.\n\nThis is best for finding exact text matches or regex patterns.\nMore precise than semantic search for finding specific strings or patterns.\nThis is preferred over semantic search when we know the exact symbol/function name/etc. to search in some set of directories/file types.\n\nUsage:\n- Supports full regex syntax (eg. "log.*Error", "function\\s+\\w+", etc.)\n- Filter files by pattern with the `include` parameter (eg. "*.js", "*.{ts,tsx}")\n- If you need to identify/count the number of matches within files, use the Bash tool with `rg` (ripgrep) directly. Do NOT use `grep`',
  schema: grepSchema,
  execute: async (args, context) => {
    const searchPath = args.path
      ? assertAbsolutePath(args.path, 'path')
      : context.workspace;

    const rgArgs = ['--line-number', '--no-heading', '--color=never', '--max-count=50'];
    if (args.include) {
      rgArgs.push('-g', args.include);
    }
    rgArgs.push(args.pattern, searchPath);

    try {
      const { stdout } = await execFileAsync('rg', rgArgs, {
        maxBuffer: 10 * 1024 * 1024,
      });
      const lines = stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, 50);

      const matches = lines.map((line) => {
        const match = line.match(/^(.*?):(\d+):(.*)$/);
        if (match) {
          return {
            file: match[1],
            line: Number(match[2]),
            text: match[3],
          };
        }
        return { file: searchPath, line: 0, text: line };
      });

      return {
        pattern: args.pattern,
        path: searchPath,
        total_matches: matches.length,
        capped: matches.length >= 50,
        matches,
        raw_output: lines.join('\n'),
      };
    } catch (err: any) {
      if (err.code === 1) {
        return {
          pattern: args.pattern,
          path: searchPath,
          total_matches: 0,
          capped: false,
          matches: [],
          raw_output: '',
        };
      }
      throw new Error(`grep error: ${err.message}`);
    }
  },
};
