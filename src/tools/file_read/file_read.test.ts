import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileReadTool } from './file_read.js';

export async function testFileRead() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-fr-'));
  const target = path.join(tmpDir, 'sample.txt');
  await fs.writeFile(target, 'alpha\nbeta\ngamma\ndelta', 'utf-8');

  const res = await fileReadTool.execute(
    { file_path: target, offset: 2, limit: 2, return_line_number: true },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(res.first_line, 2);
  assert.strictEqual(res.last_line, 3);
  assert.ok(res.content.includes('     2  beta'));
  await fs.rm(tmpDir, { recursive: true, force: true });
}
