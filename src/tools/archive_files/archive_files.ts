import { z } from 'zod';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import archiver from 'archiver';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MythgramTool, assertAbsolutePath } from '../types.js';

const execFileAsync = promisify(execFile);

export const archiveFilesSchema = z
  .object({
    archive_name: z
      .string()
      .min(1)
      .describe(
        'Name of the output archive file, without the extension. Example: backup_2026'
      ),
    archive_format: z
      .enum(['zip', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz', 'tar.lz4', 'tar.zst', '7z'])
      .describe('Format of the archive to create.'),
    output_directory: z
      .string()
      .min(1)
      .describe(
        'Absolute directory path where the resulting archive will be saved. Example: /home/user/archives'
      ),
    source_directory: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Absolute path of a directory whose contents should be archived recursively. Use this or file_paths, but not both. Example: /home/user/documents'
      ),
    file_paths: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe(
        'List of absolute paths to files to include in the archive. Use this or source_directory, but not both. Example: ["/home/user/report.pdf", "/home/user/notes.txt"]'
      ),
    password: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional password for archive encryption, if supported by the selected format.'
      ),
    overwrite: z
      .boolean()
      .default(false)
      .describe(
        'Whether to overwrite an existing archive with the same output path and filename. Defaults to false.'
      ),
  })
  .strict();

export const archiveFilesTool: MythgramTool<typeof archiveFilesSchema> = {
  name: 'archive_files',
  description:
    'Create an archive from a directory or a list of absolute file paths. Select the archive name and format, specify the output directory, and optionally set a password if supported. Provide exactly one source: source_directory or file_paths.',
  schema: archiveFilesSchema,
  execute: async (args) => {
    const outDir = assertAbsolutePath(args.output_directory, 'output_directory');
    if (
      (args.source_directory && args.file_paths) ||
      (!args.source_directory && !args.file_paths)
    ) {
      throw new Error(
        'Provide exactly one source: either source_directory or file_paths, not both.'
      );
    }

    const srcDir = args.source_directory
      ? assertAbsolutePath(args.source_directory, 'source_directory')
      : undefined;
    const srcFiles = args.file_paths
      ? args.file_paths.map((p) => assertAbsolutePath(p, 'file_paths item'))
      : undefined;

    await fsp.mkdir(outDir, { recursive: true });
    const outputFilePath = path.join(outDir, `${args.archive_name}.${args.archive_format}`);

    try {
      await fsp.access(outputFilePath);
      if (!args.overwrite) {
        throw new Error(
          `Archive already exists at ${outputFilePath} and overwrite=false.`
        );
      }
      await fsp.unlink(outputFilePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    // Use native archiver stream for zip/tar/tar.gz (when no password), or system CLI fallback for others
    if (
      !args.password &&
      (args.archive_format === 'zip' ||
        args.archive_format === 'tar' ||
        args.archive_format === 'tar.gz')
    ) {
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(outputFilePath);
        const isTar = args.archive_format.startsWith('tar');
        const archive = archiver(isTar ? 'tar' : 'zip', {
          gzip: args.archive_format === 'tar.gz',
          zlib: { level: 9 },
        });

        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        if (srcDir) {
          archive.directory(srcDir, false);
        } else if (srcFiles) {
          for (const f of srcFiles) {
            archive.file(f, { name: path.basename(f) });
          }
        }
        archive.finalize();
      });
    } else if (args.archive_format === 'zip' && args.password) {
      const inputs = srcDir ? ['-r', outputFilePath, '.'] : [outputFilePath, ...(srcFiles || [])];
      await execFileAsync('zip', ['-P', args.password, ...inputs], {
        cwd: srcDir || outDir,
      });
    } else if (args.archive_format === '7z') {
      const sevenArgs = ['a', outputFilePath];
      if (args.password) sevenArgs.push(`-p${args.password}`);
      if (srcDir) sevenArgs.push(path.join(srcDir, '*'));
      else if (srcFiles) sevenArgs.push(...srcFiles);
      await execFileAsync('7z', sevenArgs);
    } else {
      // tar.bz2, tar.xz, tar.lz4, tar.zst
      const flagMap: Record<string, string> = {
        'tar.bz2': '-cjf',
        'tar.xz': '-cJf',
        'tar.lz4': '--use-compress-program=lz4 -cf',
        'tar.zst': '--zstd -cf',
      };
      const flag = flagMap[args.archive_format] || '-czf';
      const tarArgs = flag.split(' ').concat([outputFilePath]);
      if (srcDir) {
        tarArgs.push('-C', srcDir, '.');
      } else if (srcFiles) {
        tarArgs.push(...srcFiles);
      }
      await execFileAsync('tar', tarArgs);
    }

    const stat = await fsp.stat(outputFilePath);
    return {
      success: true,
      archive_path: outputFilePath,
      format: args.archive_format,
      bytes: stat.size,
    };
  },
};
