import { z } from 'zod';
import fsp from 'node:fs/promises';
import path from 'node:path';
import extractZip from 'extract-zip';
import * as tar from 'tar';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MythgramTool, assertAbsolutePath } from '../types.js';

const execFileAsync = promisify(execFile);

export const extractArchiveSchema = z
  .object({
    archive_path: z
      .string()
      .min(1)
      .describe(
        'Absolute path to the archive file. Example: /home/user/downloads/archive.zip'
      ),
    password: z
      .string()
      .nullable()
      .describe(
        'Password for an encrypted archive. Use null if the archive is not password-protected.'
      ),
  })
  .strict();

function stripArchiveExtension(filename: string): string {
  return filename.replace(/\.(tar\.(gz|bz2|xz|lz4|zst)|zip|tar|7z|tgz)$/i, '');
}

export const extractArchiveTool: MythgramTool<typeof extractArchiveSchema> = {
  name: 'extract_archive',
  description:
    'Extract files from an archive file. Provide the absolute path to the archive file and an optional password if it is encrypted. Files are extracted into a new folder named after the archive (without its extension) in the same directory as the archive; the path of that folder is returned. Supports any archive of a supported format, not only those created by archive_files.',
  schema: extractArchiveSchema,
  execute: async (args) => {
    const absArchive = assertAbsolutePath(args.archive_path, 'archive_path');
    await fsp.access(absArchive);

    const parentDir = path.dirname(absArchive);
    const folderName = stripArchiveExtension(path.basename(absArchive));
    const targetDir = path.join(parentDir, folderName);
    await fsp.mkdir(targetDir, { recursive: true });

    const lower = absArchive.toLowerCase();
    if (lower.endsWith('.zip') && !args.password) {
      await extractZip(absArchive, { dir: targetDir });
    } else if (lower.endsWith('.zip') && args.password) {
      await execFileAsync('unzip', ['-P', args.password, '-o', absArchive, '-d', targetDir]);
    } else if (lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
      await tar.x({ file: absArchive, cwd: targetDir });
    } else if (lower.endsWith('.7z')) {
      const sevenArgs = ['x', absArchive, `-o${targetDir}`, '-y'];
      if (args.password) sevenArgs.push(`-p${args.password}`);
      await execFileAsync('7z', sevenArgs);
    } else {
      await execFileAsync('tar', ['-xf', absArchive, '-C', targetDir]);
    }

    const entries = await fsp.readdir(targetDir);
    return {
      success: true,
      archive_path: absArchive,
      extracted_directory: targetDir,
      extracted_items: entries,
    };
  },
};
