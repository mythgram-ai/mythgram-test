import assert from 'node:assert';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import extractZip from 'extract-zip';
import { restoreCheckpointTool } from './restore_checkpoint.js';
import { createCheckpointTool } from '../create_checkpoint/create_checkpoint.js';
import { deleteCheckpoint } from '../../checkpoint/index.js';

export async function testRestoreCheckpointTool() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-cp-restore-'));
  const appFile = path.join(tmpDir, 'app.txt');
  await fs.writeFile(appFile, 'version-one', 'utf-8');

  const created = await createCheckpointTool.execute(
    { name: `test-restore-${Date.now()}`, description: 'Restore tool test' },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );

  await fs.writeFile(appFile, 'version-two', 'utf-8');
  await fs.writeFile(path.join(tmpDir, 'extra.txt'), 'added later', 'utf-8');

  const res = await restoreCheckpointTool.execute(
    { checkpoint_id: created.checkpoint.id },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );

  assert.equal(res.success, true);
  assert.equal(res.checkpoint.id, created.checkpoint.id);
  assert.ok(res.backup_path);
  assert.ok(fsSync.existsSync(res.backup_path));
  assert.ok(res.message.includes(created.checkpoint.name));
  assert.ok(res.message.includes(res.backup_path));

  assert.equal(await fs.readFile(appFile, 'utf-8'), 'version-one');
  assert.ok(fsSync.existsSync(path.join(tmpDir, 'extra.txt')), 'Non-checkpoint files stay in place');

  const backupExtractDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-cp-backup-'));
  await extractZip(res.backup_path, { dir: backupExtractDir });
  assert.equal(
    await fs.readFile(path.join(backupExtractDir, 'app.txt'), 'utf-8'),
    'version-two',
    'Backup must contain the workspace state from before the restore'
  );

  await fs.rm(backupExtractDir, { recursive: true, force: true });
  await fs.rm(res.backup_path, { force: true });
  await deleteCheckpoint(created.checkpoint.id);
  await fs.rm(tmpDir, { recursive: true, force: true });
}
