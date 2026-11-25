import assert from 'node:assert/strict';
import {
  DESCRIPTION_TRUNCATION_MARKER,
  DESCRIPTION_WORD_LIMIT,
  decodeBingRedirectUrl,
  extractVqd,
  getMaskedWebSearchSettings,
  getWebSearchSettings,
  isDuckDuckGoChallenge,
  parseBingHtml,
  parseBingImagesHtml,
  parseDuckDuckGoHtml,
  parseDuckDuckGoImages,
  parseDuckDuckGoLite,
  truncateDescription,
  updateWebSearchSettings,
} from './index.js';

const SAMPLE_DDG_HTML = `
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&amp;rut=abc">Example Docs</a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">A documentation page for the example project.</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsecond.example.org%2F">Second Result</a>
    </h2>
    <a class="result__snippet">Second snippet.</a>
  </div>
</div>`;

const SAMPLE_DDG_FLAT_HTML = `
<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fflat.example.com%2F" class="result__a" rel="nofollow">Flat Result</a>
<div class="result__snippet">Flat snippet with <b>markup</b>.</div>
<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fflat.example.com%2F">Duplicate Result</a>
<a class="result__a" href="https://duckduckgo.com/y.js?ad_provider=bing&u3=x">Sponsored</a>
<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsecond-flat.example.com%2F">Second Flat</a>
<div class="result__snippet">Second flat snippet.</div>`;

const SAMPLE_DDG_CHALLENGE = `<!DOCTYPE html><html><body>
<form id="challenge-form" action="//duckduckgo.com/anomaly.js?sv=html" method="POST">
  <div class="anomaly-modal__modal" data-testid="anomaly-modal">
    <div class="anomaly-modal__title">Unfortunately, bots use DuckDuckGo too.</div>
  </div>
</form></body></html>`;

const SAMPLE_BING_HTML = `
<ol id="b_results">
  <li class="b_algo" data-id iid=SERP.1>
    <h2><a target="_blank" href="https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1aHR0cHM6Ly93d3cuZXhhbXBsZS5jb20vZG9jcw&amp;ntb=1"><strong>Example</strong> Docs</a></h2>
    <div class="b_caption"><p class="b_lineclamp2">Official documentation for the example project.<a class="b_algoReadMore" href="https://www.bing.com/ck/a?!&amp;&amp;p=abc">Read more</a></p></div>
    <cite>https://www.example.com/docs</cite>
  </li>
  <li class="b_algo">
    <h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=def&amp;u=a1aHR0cHM6Ly9zZWNvbmQuZXhhbXBsZS5vcmcv&amp;ntb=1">Second <b>Result</b></a></h2>
    <p>Second snippet.</p>
  </li>
  <li class="b_algo">
    <h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=ghi&amp;u=a1aHR0cHM6Ly9kb2NzLmV4YW1wbGUuY29tL2d1aWRlL2ludHJv&amp;ntb=1">Breadcrumb Result</a></h2>
    <p>Breadcrumb snippet.</p>
    <cite>https://docs.example.com › guide › intro</cite>
  </li>
</ol>`;

const SAMPLE_BING_IMAGES = `
<a class="iusc" m="{&quot;murl&quot;:&quot;https://img.example.com/panda.jpg&quot;,&quot;turl&quot;:&quot;https://tse.example.com/panda_t.jpg&quot;,&quot;purl&quot;:&quot;https://example.com/panda&quot;,&quot;t&quot;:&quot;Red panda&quot;}"></a>
<a class="iusc" m="{&quot;murl&quot;:&quot;https://img.example.com/panda.jpg&quot;}"></a>
<a class="iusc" m="{&quot;turl&quot;:&quot;https://tse.example.com/no-murl.jpg&quot;}"></a>`;

export async function testWebSearchSystem() {
  assert.equal(DESCRIPTION_WORD_LIMIT, 30);
  assert.equal(DESCRIPTION_TRUNCATION_MARKER, '.'.repeat(11) + ' ');

  const shortDescription = 'A short description with six words here.';
  assert.equal(truncateDescription(shortDescription), shortDescription);

  const exactlyThirty = Array.from({ length: 30 }, (_, i) => `w${i + 1}`).join(' ');
  assert.equal(truncateDescription(exactlyThirty), exactlyThirty);
  assert.ok(!truncateDescription(exactlyThirty).endsWith(DESCRIPTION_TRUNCATION_MARKER));

  const tooLong = Array.from({ length: 45 }, (_, i) => `w${i + 1}`).join(' ');
  const truncated = truncateDescription(tooLong);
  assert.ok(truncated.endsWith(DESCRIPTION_TRUNCATION_MARKER), 'truncated description ends with the marker');
  const keptWords = truncated.slice(0, -DESCRIPTION_TRUNCATION_MARKER.length);
  assert.equal(keptWords.split(' ').length, 30, 'keeps exactly 30 words');
  assert.equal(keptWords.split(' ')[29], 'w30');
  assert.ok(!truncated.includes('w31'));

  assert.equal(truncateDescription('  spaced   out\n\ntext  '), 'spaced out text');
  assert.equal(truncateDescription(''), '');

  const results = parseDuckDuckGoHtml(SAMPLE_DDG_HTML, 20);
  assert.equal(results.length, 2);
  assert.equal(results[0].title, 'Example Docs');
  assert.equal(results[0].url, 'https://example.com/docs');
  assert.ok(results[0].description.includes('documentation page'));
  assert.equal(results[1].url, 'https://second.example.org/');

  const lite = parseDuckDuckGoLite(
    `<a rel="nofollow" class='result-link' href="//duckduckgo.com/l/?uddg=https%3A%2F%2Flite.example.com%2F">Lite Result</a>
     <td class='result-snippet'>Lite snippet.</td>`,
    20
  );
  assert.equal(lite.length, 1);
  assert.equal(lite[0].url, 'https://lite.example.com/');
  assert.equal(lite[0].description, 'Lite snippet.');

  const flat = parseDuckDuckGoHtml(SAMPLE_DDG_FLAT_HTML, 20);
  assert.equal(flat.length, 2, 'flat markup parses, dedupes, and skips ads');
  assert.equal(flat[0].title, 'Flat Result');
  assert.equal(flat[0].description, 'Flat snippet with markup .');
  assert.equal(flat[1].url, 'https://second-flat.example.com/');
  assert.equal(flat[1].description, 'Second flat snippet.');

  assert.equal(isDuckDuckGoChallenge(SAMPLE_DDG_CHALLENGE, 202), true);
  assert.equal(isDuckDuckGoChallenge(SAMPLE_DDG_CHALLENGE, 200), true);
  assert.equal(isDuckDuckGoChallenge(SAMPLE_DDG_HTML, 200), false);

  const bing = parseBingHtml(SAMPLE_BING_HTML, 20);
  assert.equal(bing.length, 3);
  assert.equal(bing[0].title, 'Example Docs');
  assert.equal(bing[0].url, 'https://www.example.com/docs');
  assert.equal(bing[0].description, 'Official documentation for the example project.');
  assert.equal(bing[0].source, 'bing');
  assert.equal(bing[1].title, 'Second Result');
  assert.equal(bing[1].url, 'https://second.example.org/');
  assert.equal(bing[1].description, 'Second snippet.');
  assert.equal(bing[2].url, 'https://docs.example.com/guide/intro', 'decoded redirect wins over breadcrumb cite');

  assert.equal(
    decodeBingRedirectUrl('https://www.bing.com/ck/a?!&&p=abc&u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS94&ntb=1'),
    'https://example.com/x'
  );

  const bingImages = parseBingImagesHtml(SAMPLE_BING_IMAGES, 20);
  assert.equal(bingImages.length, 1);
  assert.equal(bingImages[0].image_url, 'https://img.example.com/panda.jpg');
  assert.equal(bingImages[0].thumbnail_url, 'https://tse.example.com/panda_t.jpg');
  assert.equal(bingImages[0].source_url, 'https://example.com/panda');
  assert.equal(bingImages[0].title, 'Red panda');

  assert.equal(extractVqd('<script>var vqd="4-1234567890";</script>'), '4-1234567890');
  assert.equal(extractVqd('vqd=4-999&f=,,,&p=1'), '4-999');

  const images = parseDuckDuckGoImages(
    {
      results: [
        { image: 'https://img.example.com/a.png', thumbnail: 'https://img.example.com/a_t.png', title: 'A', url: 'https://example.com/a', width: 100, height: 50 },
        { image: 'https://img.example.com/b.png', title: 'B' },
        { title: 'no image' },
      ],
    },
    20
  );
  assert.equal(images.length, 2);
  assert.equal(images[0].image_url, 'https://img.example.com/a.png');
  assert.equal(images[0].width, 100);

  const original = await getWebSearchSettings();
  try {
    const saved = await updateWebSearchSettings({
      provider: 'tavily',
      api_keys: { tavily: 'tvly-test-key-123456' },
      scraper_provider: 'builtin',
    });
    assert.equal(saved.provider, 'tavily');

    const masked = await getMaskedWebSearchSettings();
    assert.equal(masked.provider, 'tavily');
    assert.equal(masked.api_keys.tavily.configured, true);
    assert.ok(!masked.api_keys.tavily.masked.includes('test-key'));

    await updateWebSearchSettings({ api_keys: { tavily: null } });
    const cleared = await getMaskedWebSearchSettings();
    assert.equal(cleared.api_keys.tavily.configured, false);
  } finally {
    await updateWebSearchSettings({
      provider: original.provider,
      scraper_provider: original.scraper_provider,
      api_keys: original.api_keys,
      firecrawl_api_key: original.firecrawl_api_key,
    });
  }
}
