import assert from 'node:assert/strict';
import http from 'node:http';
import {
  extractImages,
  extractLinks,
  extractTitle,
  htmlToMarkdown,
  htmlToText,
  scrapeUrlBuiltIn,
} from './index.js';

const SAMPLE_HTML = `<!doctype html>
<html>
  <head>
    <title>Mythgram Docs</title>
    <meta name="description" content="Agent documentation" />
  </head>
  <body>
    <nav>ignore me</nav>
    <h1>Mythgram Scraper</h1>
    <p>Clean <strong>markdown</strong> output.</p>
    <ul><li>First item</li><li>Second item</li></ul>
    <a href="/relative/page">Relative link</a>
    <a href="https://example.com/absolute">Absolute link</a>
    <img src="/assets/logo.png" alt="logo" />
    <script>console.log('noise')</script>
  </body>
</html>`;

export async function testScraperSystem() {
  assert.equal(extractTitle(SAMPLE_HTML), 'Mythgram Docs');

  const markdown = htmlToMarkdown(SAMPLE_HTML);
  assert.ok(markdown.includes('# Mythgram Scraper'));
  assert.ok(markdown.includes('**markdown**'));
  assert.ok(markdown.includes('- First item'));
  assert.ok(markdown.includes('[Relative link](/relative/page)'));
  assert.ok(!markdown.includes('console.log'), 'script content must be removed');
  assert.ok(!markdown.includes('ignore me'), 'nav content must be removed');

  const text = htmlToText(SAMPLE_HTML);
  assert.ok(text.includes('Mythgram Scraper'));
  assert.ok(!text.includes('<h1>'));

  const links = extractLinks(SAMPLE_HTML, 'https://docs.example.com/start');
  assert.ok(links.includes('https://docs.example.com/relative/page'));
  assert.ok(links.includes('https://example.com/absolute'));

  const images = extractImages(SAMPLE_HTML, 'https://docs.example.com/start');
  assert.ok(images.includes('https://docs.example.com/assets/logo.png'));

  const server = http.createServer((req, res) => {
    if (req.url === '/next') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>Next</title></head><body><h2>Next page</h2></body></html>');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(SAMPLE_HTML.replace('/relative/page', '/next'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const page = await scrapeUrlBuiltIn(`http://127.0.0.1:${port}/`, { format: 'markdown' });
    assert.equal(page.status, 200);
    assert.equal(page.title, 'Mythgram Docs');
    assert.ok(page.content.includes('# Mythgram Scraper'));
    assert.ok(page.links.some((l) => l.endsWith('/next')));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
