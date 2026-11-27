import assert from 'node:assert';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCheckpointTool } from './create_checkpoint.js';
import { deleteCheckpoint } from '../../checkpoint/index.js';

export async function testCreateCheckpointTool() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-cp-create-'));
  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'README.md'), '# Workspace', 'utf-8');
  await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'export const x = 1;', 'utf-8');
  await fs.mkdir(path.join(tmpDir, '.mythgram', 'cache'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, '.mythgram', 'cache', 'ignored.txt'), 'ignored', 'utf-8');

  const name = `test-create-${Date.now()}`;
  const res = await createCheckpointTool.execute(
    { name, description: 'Create tool test' },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );

  assert.equal(res.success, true);
  assert.equal(res.checkpoint.name, name);
  assert.ok(res.checkpoint.file_path.includes(`${path.sep}.mythgram${path.sep}checkpoints`));
  assert.ok(fsSync.existsSync(res.checkpoint.file_path));
  assert.equal(res.checkpoint.files_count, 2, 'Data directory must be excluded');
  assert.ok(res.checkpoint.size_bytes > 0);

  await deleteCheckpoint(res.checkpoint.id);
  await fs.rm(tmpDir, { recursive: true, force: true });
}
