import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { archiveFilesTool } from '../archive_files/archive_files.js';
import { extractArchiveTool } from './extract_archive.js';

export async function testExtractArchive() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-ext-'));
  const fileA = path.join(tmpDir, 'hello.txt');
  await fs.writeFile(fileA, 'hello archive', 'utf-8');

  const archRes = await archiveFilesTool.execute(
    {
      archive_name: 'bundle',
      archive_format: 'zip',
      output_directory: tmpDir,
      file_paths: [fileA],
      overwrite: true,
    },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );

  const extRes = await extractArchiveTool.execute(
    { archive_path: archRes.archive_path, password: null },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(extRes.success, true);
  assert.ok(extRes.extracted_items.includes('hello.txt'));
  await fs.rm(tmpDir, { recursive: true, force: true });
}
