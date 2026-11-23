import assert from 'node:assert';
import os from 'node:os';
import { shallTool } from './shall_tool.js';

export async function testShallTool() {
  const res = await shallTool.execute(
    {
      command: 'echo "mythgram_shell_ok"',
      session_name: 'default',
      timeout: 10,
      wait_for_output: true,
    },
    { sessionId: 'test', workspace: os.tmpdir(), visionSupport: true }
  );
  assert.strictEqual(res.exit_code, 0);
  assert.ok(res.stdout.includes('mythgram_shell_ok'));
}
