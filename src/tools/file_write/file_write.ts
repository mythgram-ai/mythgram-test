import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MythgramTool, assertAbsolutePath } from '../types.js';

export const fileWriteSchema = z
  .object({
    file_path: z
      .string()
      .describe('Path of the file to create or overwrite, absolute path.'),
    content: z
      .string()
      .describe('The full content to write to the file. Overwrites any existing file.'),
  })
  .strict();

export const fileWriteTool: MythgramTool<typeof fileWriteSchema> = {
  name: 'file_write',
  description:
    'Create a new file or completely overwrite an existing file with the provided content. Parent directories are created automatically. Use this for creating files or fully rewriting them, use only absolute path.',
  schema: fileWriteSchema,
  execute: async (args) => {
    const absPath = assertAbsolutePath(args.file_path, 'file_path');
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, args.content, 'utf-8');
    const bytes = Buffer.byteLength(args.content, 'utf-8');
    const lines = args.content.split(/\r?\n/).length;
    return {
      success: true,
      file_path: absPath,
      bytes_written: bytes,
      lines_written: lines,
      content: args.content,
    };
  },
};
