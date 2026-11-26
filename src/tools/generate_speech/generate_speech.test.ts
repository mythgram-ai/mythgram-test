import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { executeNativeTool, toOpenAIToolDefinition } from '../index.js';
import { generateSpeechTool } from './generate_speech.js';
import { DEFAULT_LOCAL_TTS_BASE_URL, updateTtsSettings } from '../../tts/index.js';

export async function testGenerateSpeechTool() {
  // 1. Verify OpenAI tool definition matches the exact required JSON schema
  const openAiDef = toOpenAIToolDefinition(generateSpeechTool);
  assert.equal(openAiDef.type, 'function');
  assert.equal(openAiDef.function.name, 'generate_speech');
  assert.equal(
    openAiDef.function.description,
    'Generate spoken audio from text and save the generated audio file to the specified absolute output directory (any accessible location on the local filesystem).'
  );
  assert.equal(openAiDef.function.parameters.type, 'object');
  assert.equal(openAiDef.function.parameters.additionalProperties, false);
  assert.deepEqual(openAiDef.function.parameters.required, ['speech', 'output_directory']);
  assert.equal(
    openAiDef.function.parameters.properties.speech.description,
    'The text to convert into speech.'
  );
  assert.equal(
    openAiDef.function.parameters.properties.output_directory.description,
    'The absolute directory where the generated audio file will be saved (e.g. /home/user/project/audio). Relative paths are rejected.'
  );

  // 2. Test end-to-end tool execution with a local mock OpenAI-compatible TTS server
  let receivedInput = '';
  const sampleWav = Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00data', 'binary');
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        receivedInput = body.input || '';
      } catch {
        receivedInput = '';
      }
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      res.end(sampleWav);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 7878;
  await updateTtsSettings({ base_url: `http://127.0.0.1:${port}` });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram_gen_speech_'));
  const ctx = {
    sessionId: 'test_generate_speech_session',
    workspace: tmpDir,
    visionSupport: true,
  };

  try {
    const res = await executeNativeTool(
      'generate_speech',
      {
        speech: 'Today is a wonderful day.',
        output_directory: tmpDir,
      },
      ctx
    );

    assert.equal(res.success, true);
    assert.equal(receivedInput, 'Today is a wonderful day.');
    assert.equal(res.output_directory, tmpDir);
    assert.equal(res.provider, 'local-tts');
    assert.ok(res.file_path.startsWith(tmpDir));
    assert.ok(res.file_path.endsWith('.wav'));
    // Must not attach raw audio or data_url to LLM input
    assert.equal(res.data_url, undefined);

    const savedBytes = await fs.readFile(res.file_path);
    assert.equal(savedBytes.length, sampleWav.length);

    // Reject relative path
    await assert.rejects(
      () =>
        executeNativeTool(
          'generate_speech',
          {
            speech: 'Test relative path rejection',
            output_directory: 'relative/audio',
          },
          ctx
        ),
      /must be an absolute path/
    );
  } finally {
    server.close();
    await updateTtsSettings({ base_url: DEFAULT_LOCAL_TTS_BASE_URL });
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
