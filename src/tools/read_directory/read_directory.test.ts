import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readDirectoryTool } from './read_directory.js';

export async function testReadDirectory() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-rd-'));
  await fs.writeFile(path.join(tmpDir, 'one.txt'), 'line1\nline2');
  const sub = path.join(tmpDir, 'sub');
  await fs.mkdir(sub);
  await fs.writeFile(path.join(sub, 'two.txt'), 'lineA');

  const resAll = await readDirectoryTool.execute(
    { directory_path: tmpDir },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(resAll.total_files, 2);

  const resTop = await readDirectoryTool.execute(
    { directory_path: tmpDir, read_only_files: true },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(resTop.total_files, 1);
  await fs.rm(tmpDir, { recursive: true, force: true });
}
