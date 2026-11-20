import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MythgramTool, assertAbsolutePath } from '../types.js';

export const readDirectorySchema = z
  .object({
    directory_path: z
      .string()
      .min(1)
      .describe('Absolute path of the directory to read.'),
    read_only_files: z
      .boolean()
      .optional()
      .describe(
        'If true, read only the files directly inside the given directory and ignore subdirectories. If false or omitted, recursively read files in all subdirectories. Default: false'
      ),
  })
  .strict();

const IGNORED_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  '.mythgram',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'vendor',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.heic', '.heif',
  '.pdf', '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.zst', '.lz4',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.mov', '.avi',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm', '.sqlite', '.db',
]);

async function collectFiles(dir: string, recursive: boolean): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive && !IGNORED_DIRS.has(entry.name)) {
        const sub = await collectFiles(full, true);
        results.push(...sub);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!BINARY_EXTENSIONS.has(ext)) {
        results.push(full);
      }
    }
  }
  return results;
}

export const readDirectoryTool: MythgramTool<typeof readDirectorySchema> = {
  name: 'read_directory',
  description:
    'Read all supported text files in a directory in a single tool call and return their complete contents with their paths. Use this to load a whole folder quickly instead of calling file_read for every file. Set read_only_files=true to read only the files directly inside the directory (ignoring subdirectories); otherwise files in all subdirectories are read recursively. VCS data, dependencies, build artifacts, and binary files are skipped. If the combined content would exceed the available context budget, the tool returns a structured error listing the files and their sizes instead of partial or truncated content — in that case read the files you need individually with file_read.',
  schema: readDirectorySchema,
  execute: async (args) => {
    const absDir = assertAbsolutePath(args.directory_path, 'directory_path');
    const recursive = !args.read_only_files;
    const files = await collectFiles(absDir, recursive);

    const fileRecords: { path: string; lines: number; size: number; content: string }[] = [];
    let totalLines = 0;

    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.size > 2 * 1024 * 1024) continue; // skip >2MB single files
        const buf = await fs.readFile(filePath);
        // Check for null byte indicating binary
        if (buf.includes(0)) continue;
        const text = buf.toString('utf-8');
        const lineCount = text.split(/\r?\n/).length;
        totalLines += lineCount;
        fileRecords.push({
          path: filePath,
          lines: lineCount,
          size: stat.size,
          content: text,
        });
      } catch {
        // ignore unreadable files
      }
    }

    if (totalLines > 50000) {
      return {
        error: 'CONTEXT_BUDGET_EXCEEDED',
        message: `Combined directory content (${totalLines} lines across ${fileRecords.length} files) exceeds the 50,000-line limit. Please read individual files using file_read.`,
        total_lines: totalLines,
        limit_lines: 50000,
        files: fileRecords.map((f) => ({
          path: f.path,
          lines: f.lines,
          size: f.size,
        })),
      };
    }

    return {
      directory_path: absDir,
      total_files: fileRecords.length,
      total_lines: totalLines,
      files: fileRecords,
    };
  },
};
