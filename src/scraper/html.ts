const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|canvas|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
}

function absolutize(href: string, baseUrl: string): string | null {
  const value = decodeHtmlEntities(href.trim());
  if (
    !value ||
    value.startsWith('#') ||
    value.startsWith('javascript:') ||
    value.startsWith('mailto:') ||
    value.startsWith('data:')
  ) {
    return null;
  }
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return decodeHtmlEntities(og[1]).trim();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title ? decodeHtmlEntities(title[1]).replace(/\s+/g, ' ').trim() : '';
}

export function extractMetaDescription(html: string): string {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim();
  }
  return '';
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html))) {
    const abs = absolutize(match[1], baseUrl);
    if (abs && /^https?:\/\//i.test(abs)) links.add(abs);
  }
  return [...links];
}

export function extractImages(html: string, baseUrl: string): string[] {
  const images = new Set<string>();
  const imgRe = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRe.exec(html))) {
    const tag = match[0];
    const srcMatch = tag.match(/\b(?:src|data-src|data-original)=["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const abs = absolutize(srcMatch[1], baseUrl);
    if (abs) images.add(abs);
  }
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogImage) {
    const abs = absolutize(ogImage[1], baseUrl);
    if (abs) images.add(abs);
  }
  return [...images];
}

/**
 * Converts HTML to readable Markdown without external dependencies.
 */
export function htmlToMarkdown(html: string): string {
  let out = stripNoise(html);

  out = out
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n# ${t}\n`)
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n## ${t}\n`)
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n### ${t}\n`)
    .replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `\n#### ${t}\n`)
    .replace(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi, (_, t) => `\n##### ${t}\n`)
    .replace(/<h6\b[^>]*>([\s\S]*?)<\/h6>/gi, (_, t) => `\n###### ${t}\n`)
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => `\n\`\`\`\n${stripTags(t).trim()}\n\`\`\`\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${t}`)
    .replace(/<\/(p|div|section|article|tr|ul|ol|table|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<img\b[^>]*\b(?:src|data-src)=["']([^"']+)["'][^>]*>/gi, (_, src) => `\n![](${src})\n`)
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const label = stripTags(text).trim();
      return label ? `[${label}](${href})` : href;
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => `**${stripTags(t).trim()}**`)
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => `*${stripTags(t).trim()}*`)
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => `\`${stripTags(t).trim()}\``);

  out = decodeHtmlEntities(stripTags(out));
  return out
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function htmlToText(html: string): string {
  return decodeHtmlEntities(stripTags(stripNoise(html)))
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
