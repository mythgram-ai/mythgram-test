import assert from 'node:assert';
import { readImageTool } from './read_image.js';

export async function testReadImage() {
  const noVision = await readImageTool.execute(
    { file_path: 'https://example.com/image.png' },
    { sessionId: 'test', workspace: '/tmp', visionSupport: false }
  );
  assert.strictEqual(noVision.success, false);
  assert.strictEqual(noVision.error, true);
  assert.match(noVision.message, /does not support image\/vision inputs/i);
  assert.match(noVision.message, /continue/i);

  const res = await readImageTool.execute(
    { file_path: 'https://example.com/image.png' },
    { sessionId: 'test', workspace: '/tmp', visionSupport: true }
  );
  assert.strictEqual(res.success, true);
}
