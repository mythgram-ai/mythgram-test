import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileListTool } from './file_list.js';

export async function testFileList() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-fl-'));
  await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a');
  await fs.mkdir(path.join(tmpDir, 'subdir'));
  const res = await fileListTool.execute(
    { path: tmpDir },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(res.total, 2);
  assert.strictEqual(res.items[0].name, 'subdir');
  await fs.rm(tmpDir, { recursive: true, force: true });
}
