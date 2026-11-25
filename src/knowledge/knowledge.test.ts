import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createKnowledgeFromCurl,
  createKnowledgeFromPath,
  createKnowledgeFromText,
  deleteKnowledgeEntry,
  getKnowledgeEntry,
  listKnowledgeEntries,
  parseCurlCommand,
  searchKnowledge,
  updateKnowledgeEntry,
} from './index.js';

export async function testKnowledgeSystem() {
  const created = await createKnowledgeFromText({
    name: 'Test Knowledge Entry',
    description: 'Knowledge test entry',
    content: '# Reference\n\nUniqueKnowledgeToken explains the API contract.',
  });
  assert.ok(created.id.startsWith('kb_'));
  assert.equal(created.source_type, 'text');

  const list = await listKnowledgeEntries();
  assert.ok(list.some((e) => e.id === created.id));

  const detail = await getKnowledgeEntry(created.id);
  assert.ok(detail);
  assert.ok(detail!.content.includes('UniqueKnowledgeToken'));

  const matches = await searchKnowledge('UniqueKnowledgeToken');
  assert.ok(matches.some((m) => m.id === created.id));

  await updateKnowledgeEntry(created.id, { content: '# Updated\n\nUniqueKnowledgeToken v2' });
  const updated = await getKnowledgeEntry(created.id);
  assert.ok(updated!.content.includes('v2'));

  // Import a local file.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram_kb_'));
  const sourceFile = path.join(tmpDir, 'notes.md');
  await fs.writeFile(sourceFile, 'FolderImportToken content', 'utf-8');
  const imported = await createKnowledgeFromPath({ targetPath: sourceFile });
  assert.equal(imported.length, 1);
  assert.equal(imported[0].source_type, 'upload');
  const importedDetail = await getKnowledgeEntry(imported[0].id);
  assert.ok(importedDetail!.content.includes('FolderImportToken'));
  await fs.rm(tmpDir, { recursive: true, force: true });

  // Curl command parsing.
  const parsed = parseCurlCommand(
    `curl -X POST 'https://api.example.com/v1/items' \\\n      -H 'Content-Type: application/json' -H "Authorization: Bearer abc" \\\n      -d '{"name":"demo"}'`
  );
  assert.equal(parsed.method, 'POST');
  assert.equal(parsed.url, 'https://api.example.com/v1/items');
  assert.equal(parsed.headers['Content-Type'], 'application/json');
  assert.equal(parsed.headers.Authorization, 'Bearer abc');
  assert.equal(parsed.body, '{"name":"demo"}');

  // Curl capture against a local server (no external network).
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, token: 'CurlCaptureToken', path: req.url }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    const captured = await createKnowledgeFromCurl({
      curlCommand: `curl http://127.0.0.1:${port}/health`,
      name: 'Curl Capture Test',
    });
    const capturedDetail = await getKnowledgeEntry(captured.id);
    assert.ok(capturedDetail!.content.includes('CurlCaptureToken'));
    assert.equal(captured.source_type, 'curl');
    await deleteKnowledgeEntry(captured.id);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  assert.equal(await deleteKnowledgeEntry(created.id), true);
  assert.equal(await deleteKnowledgeEntry(imported[0].id), true);
  assert.equal(await getKnowledgeEntry(created.id), null);
}
