import assert from 'node:assert';
import { fetchTextFromImageTool } from './fetch_text_from_image.js';

export async function testFetchTextFromImage() {
  assert.strictEqual(fetchTextFromImageTool.name, 'fetch_text_from_image');
}
