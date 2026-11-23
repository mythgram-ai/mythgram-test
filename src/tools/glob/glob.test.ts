import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { globTool } from './glob.js';

export async function testGlob() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-glob-'));
  await fs.writeFile(path.join(tmpDir, 'index.ts'), 'export {};');
  const res = await globTool.execute(
    { pattern: '**/*.ts', path: tmpDir },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(res.total_matches, 1);
  await fs.rm(tmpDir, { recursive: true, force: true });
}
