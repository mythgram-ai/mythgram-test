import { z } from 'zod';
import fs from 'node:fs/promises';
import { MythgramTool, assertAbsolutePath } from '../types.js';

export const strReplaceSchema = z
  .object({
    file_path: z
      .string()
      .describe('Path of the file to edit, absolute file path only.'),
    old_string: z
      .string()
      .describe(
        'The exact text/code block to find and remove. The matched text (including its full lines) is deleted and replaced by new_string.'
      ),
    new_string: z
      .string()
      .describe(
        'The replacement text/code. Use an empty string to delete the matched block entirely.'
      ),
    replace_all: z
      .boolean()
      .default(false)
      .describe(
        'Replace every occurrence of old_string instead of requiring a single unique match.'
      ),
  })
  .strict();

export const strReplaceTool: MythgramTool<typeof strReplaceSchema> = {
  name: 'str_replace',
  description:
    'Perform an exact string replacement inside a file. old_string must match the file content exactly (including indentation and newlines). The matched text — and its lines — is fully removed and replaced by new_string. Fails if old_string is not found, or is not unique unless replace_all is true.',
  schema: strReplaceSchema,
  execute: async (args) => {
    const absPath = assertAbsolutePath(args.file_path, 'file_path');
    const content = await fs.readFile(absPath, 'utf-8');

    if (!args.old_string) {
      throw new Error('old_string must not be empty.');
    }

    const parts = content.split(args.old_string);
    const occurrences = parts.length - 1;

    if (occurrences === 0) {
      throw new Error(`old_string not found in file ${absPath}.`);
    }

    if (occurrences > 1 && !args.replace_all) {
      throw new Error(
        `old_string found ${occurrences} times in ${absPath}. Provide more surrounding context to make it unique or set replace_all=true.`
      );
    }

    let updated: string;
    if (args.new_string === '') {
      // When deleting matched block entirely, also clean up leftover blank line if old_string was full line(s)
      const escaped = args.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const lineDeletionRegex = new RegExp(`${escaped}\\r?\\n?`, args.replace_all ? 'g' : '');
      updated = content.replace(lineDeletionRegex, '');
    } else if (args.replace_all) {
      updated = parts.join(args.new_string);
    } else {
      const idx = content.indexOf(args.old_string);
      updated =
        content.slice(0, idx) +
        args.new_string +
        content.slice(idx + args.old_string.length);
    }

    await fs.writeFile(absPath, updated, 'utf-8');

    return {
      success: true,
      file_path: absPath,
      occurrences_replaced: args.replace_all ? occurrences : 1,
      old_string: args.old_string,
      new_string: args.new_string,
    };
  },
};
