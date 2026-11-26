import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  DEFAULT_LOCAL_TTS_BASE_URL,
  ensureTtsStore,
  getTtsSettings,
  updateTtsSettings,
  generateSpeechWithLocalTts,
  getLocalTtsStatus,
} from './index.js';

export async function testTtsSystem() {
  ensureTtsStore();
  const initial = await getTtsSettings();
  assert.ok(initial.base_url.startsWith('http'));

  // Test updating custom base URL
  const updated = await updateTtsSettings({ base_url: 'http://127.0.0.1:17878/' });
  assert.equal(updated.base_url, 'http://127.0.0.1:17878');

  // Test status retrieval
  const status = await getLocalTtsStatus();
  assert.equal(status.base_url, 'http://127.0.0.1:17878');
  assert.ok(Array.isArray(status.logs));

  // Spin up a local mock OpenAI-compatible /v1/audio/speech server
  let receivedMethod = '';
  let receivedUrl = '';
  let receivedBody: any = null;
  const fakeWavBytes = Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00', 'binary');

  const server = http.createServer((req, res) => {
    receivedMethod = req.method || '';
    receivedUrl = req.url || '';
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      } catch {
        receivedBody = null;
      }
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      res.end(fakeWavBytes);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 17878;
  const mockBaseUrl = `http://127.0.0.1:${port}`;
  await updateTtsSettings({ base_url: mockBaseUrl });

  const tmpOutDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram_tts_test_'));

  try {
    const res = await generateSpeechWithLocalTts({
      speech: 'Today is a wonderful day.',
      output_directory: tmpOutDir,
    });

    assert.equal(receivedMethod, 'POST');
    assert.equal(receivedUrl, '/v1/audio/speech');
    assert.deepEqual(receivedBody, { input: 'Today is a wonderful day.' });
    assert.equal(res.success, true);
    assert.equal(res.provider, 'local-tts');
    assert.equal(res.output_directory, tmpOutDir);
    assert.equal(res.format, 'wav');
    assert.equal(res.bytes, fakeWavBytes.length);

    const written = await fs.readFile(res.file_path);
    assert.equal(written.length, fakeWavBytes.length);

    // Reject relative output_directory
    await assert.rejects(
      () =>
        generateSpeechWithLocalTts({
          speech: 'Hello',
          output_directory: 'relative/audio',
        }),
      /must be an absolute path/
    );
  } finally {
    server.close();
    await updateTtsSettings({ base_url: DEFAULT_LOCAL_TTS_BASE_URL });
    await fs.rm(tmpOutDir, { recursive: true, force: true });
  }
}
