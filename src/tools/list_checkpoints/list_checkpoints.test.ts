import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { listCheckpointsTool } from './list_checkpoints.js';
import { createCheckpointTool } from '../create_checkpoint/create_checkpoint.js';
import { deleteCheckpoint } from '../../checkpoint/index.js';
import { getDataDir } from '../../datadir/index.js';

export async function testListCheckpointsTool() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-cp-list-'));
  await fs.writeFile(path.join(tmpDir, 'note.txt'), 'list me', 'utf-8');

  const created = await createCheckpointTool.execute(
    { name: `test-list-${Date.now()}`, description: 'List tool test' },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );

  const res = await listCheckpointsTool.execute(
    { limit: 100 },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );

  assert.equal(res.success, true);
  assert.equal(res.checkpoints_dir, getDataDir().checkpointsDir);
  assert.ok(res.count >= 1);
  const found = res.checkpoints.find((cp: any) => cp.id === created.checkpoint.id);
  assert.ok(found, 'Created checkpoint must appear in the list');
  assert.equal(found.file_path, created.checkpoint.file_path);
  assert.ok(found.file_path.startsWith(getDataDir().checkpointsDir));

  const limited = await listCheckpointsTool.execute(
    { limit: 1 },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.equal(limited.checkpoints.length, 1);

  await deleteCheckpoint(created.checkpoint.id);
  await fs.rm(tmpDir, { recursive: true, force: true });
}
