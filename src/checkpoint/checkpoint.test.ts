import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createCheckpoint,
  deleteBackup,
  deleteCheckpoint,
  listBackups,
  listCheckpoints,
  restoreBackup,
  restoreCheckpoint,
  updateCheckpoint,
} from './index.js';

export async function testCheckpointSystem() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-cp-system-'));
  const appFile = path.join(tmpDir, 'app.txt');
  await fs.writeFile(appFile, 'one', 'utf-8');

  const name = `test-system-${Date.now()}`;
  const checkpoint = await createCheckpoint({
    workspace: tmpDir,
    name,
    description: 'System test checkpoint',
  });
  assert.ok(fsSync.existsSync(checkpoint.file_path));

  const listed = await listCheckpoints();
  assert.ok(listed.some((item) => item.id === checkpoint.id));

  const renamed = await updateCheckpoint(checkpoint.id, {
    name: `${name}-renamed`,
    description: 'Updated description',
  });
  assert.equal(renamed?.name, `${name}-renamed`);
  assert.equal(renamed?.description, 'Updated description');

  await fs.writeFile(appFile, 'two', 'utf-8');
  const restored = await restoreCheckpoint({ workspace: tmpDir, checkpointId: checkpoint.id });
  assert.equal(await fs.readFile(appFile, 'utf-8'), 'one');
  assert.ok(restored.backup_path && fsSync.existsSync(restored.backup_path));

  const backupFile = path.basename(restored.backup_path as string);
  const backups = await listBackups();
  assert.ok(backups.some((item) => item.file === backupFile));

  await fs.writeFile(appFile, 'three', 'utf-8');
  const restoredBackup = await restoreBackup({ workspace: tmpDir, backupFile });
  assert.equal(await fs.readFile(appFile, 'utf-8'), 'two');
  assert.ok(restoredBackup.safety_backup_path);

  await deleteBackup(backupFile);
  await deleteBackup(path.basename(restoredBackup.safety_backup_path as string));
  assert.equal(await deleteCheckpoint(checkpoint.id), true);
  await fs.rm(tmpDir, { recursive: true, force: true });
}
