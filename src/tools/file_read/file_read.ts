import { z } from 'zod';
import fs from 'node:fs/promises';
import { MythgramTool, assertAbsolutePath } from '../types.js';

export const fileReadSchema = z
  .object({
    file_path: z
      .string()
      .min(1)
      .describe('The absolute path to the file to read.'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Optional number of lines to read from the text file. Use for large files to limit output. Must be 1 or greater. If omitted, reads up to 4000 lines by default'
      ),
    offset: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Optional line number to start reading from (1-based). Use with limit to read specific sections of large files. Must be 1 or greater. If omitted, starts from line 1'
      ),
    return_line_number: z
      .boolean()
      .optional()
      .describe(
        'Optional flag controlling whether the returned content is prefixed with line numbers. When true, each line is rendered in `cat -n` style (right-aligned line number, two spaces, then the line content, e.g. "     1  import fs"). When false or omitted, the raw file content is returned with no line numbers. Default: false'
      ),
  })
  .strict();

export const fileReadTool: MythgramTool<typeof fileReadSchema> = {
  name: 'file_read',
  description:
    'Reads and returns the content of a specified file from the local filesystem.\n\nUsage:\n- file_path must be an absolute path\n- reads up to 4000 lines with optional offset/limit\n  - Use offset and limit parameters for large files to read specific sections\n  - Lines longer than 4000 chars are truncated\n  - Returns the raw file content with no line numbers by default; set return_line_number=true to have each line prefixed with its line number in `cat -n` style\n  - The first_line/last_line metadata fields always report which lines were returned',
  schema: fileReadSchema,
  execute: async (args) => {
    const absPath = assertAbsolutePath(args.file_path, 'file_path');
    const raw = await fs.readFile(absPath, 'utf-8');
    const allLines = raw.split(/\r?\n/);
    const totalLines = allLines.length;

    const startLine = Math.max(1, args.offset ?? 1);
    const maxLines = Math.min(4000, Math.max(1, args.limit ?? 4000));
    const startIdx = startLine - 1;
    const endIdx = Math.min(totalLines, startIdx + maxLines);

    const sliced = allLines.slice(startIdx, endIdx).map((line, i) => {
      const truncated =
        line.length > 4000 ? line.slice(0, 4000) + '... [truncated]' : line;
      if (args.return_line_number) {
        const lineNum = String(startLine + i).padStart(6, ' ');
        return `${lineNum}  ${truncated}`;
      }
      return truncated;
    });

    return {
      file_path: absPath,
      content: sliced.join('\n'),
      first_line: totalLines === 0 ? 0 : startLine,
      last_line: totalLines === 0 ? 0 : endIdx,
      total_lines: totalLines,
      truncated_lines: endIdx < totalLines,
    };
  },
};
