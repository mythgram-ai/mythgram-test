import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileWriteTool } from './file_write.js';

export async function testFileWrite() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-fw-'));
  const target = path.join(tmpDir, 'nested', 'hello.txt');
  const res = await fileWriteTool.execute(
    { file_path: target, content: 'Hello Mythgram\nLine 2' },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.lines_written, 2);
  const readBack = await fs.readFile(target, 'utf-8');
  assert.strictEqual(readBack, 'Hello Mythgram\nLine 2');
  await fs.rm(tmpDir, { recursive: true, force: true });
}
