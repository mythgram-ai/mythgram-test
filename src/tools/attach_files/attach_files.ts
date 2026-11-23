import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MythgramTool } from '../types.js';

export const attachFilesSchema = z
  .object({
    file_paths: z
      .array(z.string().min(1))
      .min(1)
      .describe(
        'Absolute paths of the files to attach (for example, /home/user/project/report.pdf). Relative paths are rejected.'
      ),
  })
  .strict();

export const attachFilesTool: MythgramTool<typeof attachFilesSchema> = {
  name: 'attach_files',
  description:
    "Attach one or more files from their absolute paths to the user's conversation. The attached files are made available to the user for preview or download. Only real files are attached; nonexistent paths and non-file paths are reported and skipped.",
  schema: attachFilesSchema,
  execute: async (args) => {
    const attached: {
      name: string;
      file_path: string;
      size: number;
      ext: string;
    }[] = [];
    const skipped: { file_path: string; reason: string }[] = [];

    for (const rawPath of args.file_paths) {
      if (!path.isAbsolute(rawPath)) {
        skipped.push({
          file_path: rawPath,
          reason: 'Relative paths are rejected; must be an absolute path.',
        });
        continue;
      }

      const normalized = path.normalize(rawPath);
      try {
        const stat = await fs.stat(normalized);
        if (!stat.isFile()) {
          skipped.push({
            file_path: normalized,
            reason: 'Path is not a regular file.',
          });
          continue;
        }
        attached.push({
          name: path.basename(normalized),
          file_path: normalized,
          size: stat.size,
          ext: path.extname(normalized).toLowerCase(),
        });
      } catch {
        skipped.push({
          file_path: normalized,
          reason: 'File does not exist.',
        });
      }
    }

    return {
      success: attached.length > 0,
      attached_count: attached.length,
      attached_files: attached,
      skipped_files: skipped,
    };
  },
};
