import assert from 'node:assert/strict';
import http from 'node:http';
import { executeNativeTool } from '../index.js';

export async function testFatchWebUrlsTool() {
  const html = `<!doctype html><html><head><title>Fetch Target</title>
    <meta name="description" content="Fetch tool test" /></head>
    <body><h1>Fetch Target Page</h1><p>FetchToolToken body text.</p>
    <a href="/second">Second</a><img src="/img.png" /></body></html>`;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const ctx = { sessionId: 'test_fatch_web_urls', workspace: process.cwd(), visionSupport: true };
    const result = await executeNativeTool(
      'fatch_web_urls',
      { url: `http://127.0.0.1:${port}/` },
      ctx
    );
    assert.equal(result.success, true);
    assert.equal(result.total_pages, 1);
    assert.equal(result.provider, 'builtin');
    assert.equal(result.pages[0].title, 'Fetch Target');
    assert.ok(result.pages[0].content.includes('FetchToolToken'));
    assert.ok(result.pages[0].links.some((l: string) => l.endsWith('/second')));
    assert.ok(result.pages[0].images.some((i: string) => i.endsWith('/img.png')));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
