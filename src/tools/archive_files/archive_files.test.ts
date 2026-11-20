import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { archiveFilesTool } from './archive_files.js';

export async function testArchiveFiles() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-arch-'));
  const fileA = path.join(tmpDir, 'note.txt');
  await fs.writeFile(fileA, 'archived content', 'utf-8');

  const res = await archiveFilesTool.execute(
    {
      archive_name: 'my_backup',
      archive_format: 'zip',
      output_directory: tmpDir,
      file_paths: [fileA],
      overwrite: true,
    },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(res.success, true);
  assert.ok(res.bytes > 0);
  await fs.rm(tmpDir, { recursive: true, force: true });
}
