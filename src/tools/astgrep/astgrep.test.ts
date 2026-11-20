import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { astgrepTool } from './astgrep.js';

export async function testAstgrep() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-ast-'));
  await fs.writeFile(
    path.join(tmpDir, 'sample.ts'),
    'function calculateSum(a, b) {\n  return a + b;\n}\n'
  );
  const res = await astgrepTool.execute(
    { pattern: 'function $NAME($ARGS) { $BODY }', path: tmpDir },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(res.total_matches, 1);
  assert.strictEqual(res.matches[0].start_line, 1);
  await fs.rm(tmpDir, { recursive: true, force: true });
}
