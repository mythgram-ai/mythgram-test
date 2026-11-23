import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { grepTool } from './grep.js';

export async function testGrep() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-grep-'));
  await fs.writeFile(path.join(tmpDir, 'code.ts'), 'export function helloWorld() {\n  return 42;\n}\n');
  const res = await grepTool.execute(
    { pattern: 'function\\s+helloWorld', path: tmpDir },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(res.total_matches, 1);
  assert.strictEqual(res.matches[0].line, 1);
  await fs.rm(tmpDir, { recursive: true, force: true });
}
