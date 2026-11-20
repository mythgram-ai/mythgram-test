import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { strReplaceTool } from './str_replace.js';

export async function testStrReplace() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-sr-'));
  const target = path.join(tmpDir, 'file.txt');
  await fs.writeFile(target, 'line1\nline2\nline3\n', 'utf-8');

  await strReplaceTool.execute(
    { file_path: target, old_string: 'line2', new_string: 'line2_updated', replace_all: false },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  const afterReplace = await fs.readFile(target, 'utf-8');
  assert.strictEqual(afterReplace, 'line1\nline2_updated\nline3\n');

  // Test line deletion when new_string is empty
  await strReplaceTool.execute(
    { file_path: target, old_string: 'line2_updated', new_string: '', replace_all: false },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  const afterDelete = await fs.readFile(target, 'utf-8');
  assert.strictEqual(afterDelete, 'line1\nline3\n');

  await fs.rm(tmpDir, { recursive: true, force: true });
}
