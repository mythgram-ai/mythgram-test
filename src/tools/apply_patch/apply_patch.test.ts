import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { applyPatchTool } from './apply_patch.js';

export async function testApplyPatch() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-ap-'));
  const fileA = path.join(tmpDir, 'hello.txt');
  const fileB = path.join(tmpDir, 'app.py');
  const fileBMoved = path.join(tmpDir, 'main.py');

  await fs.writeFile(fileB, 'def greet():\n  print("Hi")\n', 'utf-8');

  const patch = [
    '*** Begin Patch',
    `*** Add File: ${fileA}`,
    '+Hello world',
    `*** Update File: ${fileB}`,
    `*** Move to: ${fileBMoved}`,
    '@@ def greet():',
    ' def greet():',
    '-  print("Hi")',
    '+  print("Hello, world!")',
    '*** End Patch',
  ].join('\n');

  const res = await applyPatchTool.execute(
    { input: patch },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(res.success, true);
  assert.strictEqual(await fs.readFile(fileA, 'utf-8'), 'Hello world');
  assert.strictEqual(await fs.readFile(fileBMoved, 'utf-8'), 'def greet():\n  print("Hello, world!")\n');
  await fs.rm(tmpDir, { recursive: true, force: true });
}
