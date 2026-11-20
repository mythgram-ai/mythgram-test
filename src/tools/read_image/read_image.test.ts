import assert from 'node:assert';
import { readImageTool } from './read_image.js';

export async function testReadImage() {
  let failedForNoVision = false;
  try {
    await readImageTool.execute(
      { file_path: 'https://example.com/image.png' },
      { sessionId: 'test', workspace: '/tmp', visionSupport: false }
    );
  } catch {
    failedForNoVision = true;
  }
  assert.strictEqual(failedForNoVision, true);

  const res = await readImageTool.execute(
    { file_path: 'https://example.com/image.png' },
    { sessionId: 'test', workspace: '/tmp', visionSupport: true }
  );
  assert.strictEqual(res.success, true);
}
