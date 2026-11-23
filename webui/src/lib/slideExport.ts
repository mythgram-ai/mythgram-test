import { strToU8, zipSync } from 'fflate';

/**
 * Slide export helpers.
 *
 * Slides in Mythgram are authored as standalone HTML documents for a
 * 1280x720 (16:9) viewport. These utilities rasterize / re-package those
 * documents so a deck can be exported as real image files (PNG/JPEG),
 * vector SVG, a multi-page PDF, a PPTX, or the raw HTML - and downloaded
 * as a single ZIP archive.
 *
 * jsPDF and PptxGenJS are imported lazily inside their builders so the
 * (large) PDF/PPTX code only downloads when the user actually picks those
 * formats.
 */

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

export type SlideExportFormat = 'png' | 'jpeg' | 'svg' | 'pdf' | 'pptx' | 'html';

export interface ExportableSlide {
  slide_number: number;
  html_content: string;
}

export interface ExportableProject {
  id: string;
  name: string;
}

export const EXPORT_FORMATS: {
  value: SlideExportFormat;
  label: string;
}[] = [
  { value: 'png', label: 'PNG image' },
  { value: 'jpeg', label: 'JPEG image' },
  { value: 'svg', label: 'SVG (vector)' },
  { value: 'pdf', label: 'PDF document' },
  { value: 'pptx', label: 'PowerPoint (PPTX)' },
  { value: 'html', label: 'HTML pages' },
];

export function safeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'slides'
  );
}

function padSlideNumber(n: number): string {
  return String(n).padStart(2, '0');
}

/** Escape a value so it can be safely placed inside an XML attribute. */
function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function serializeDocument(htmlContent: string): Document {
  return new DOMParser().parseFromString(htmlContent, 'text/html');
}

/**
 * Best-effort inlining of <img> sources so that the SVG-as-image
 * rasterization (which blocks external resource loads) still shows them.
 */
async function inlineImages(doc: Document): Promise<void> {
  const images = Array.from(doc.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      try {
        const normalized = src.startsWith('//') ? `https:${src}` : src;
        const res = await fetch(normalized);
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        img.setAttribute('src', dataUrl);
      } catch {
        // Leave the original source untouched if it cannot be inlined.
      }
    })
  );
}

/**
 * Replace external <link rel="stylesheet"> tags with inline <style> so the
 * slide keeps its styling when rasterized from an SVG data URL (external
 * resources are not fetched in that context).
 */
async function inlineStylesheets(doc: Document): Promise<void> {
  const links = Array.from(
    doc.querySelectorAll('link[rel="stylesheet"][href]')
  ) as HTMLLinkElement[];
  await Promise.all(
    links.map(async (link) => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('data:')) return;
      try {
        const normalized = href.startsWith('//') ? `https:${href}` : href;
        const res = await fetch(normalized);
        if (!res.ok) return;
        const css = await res.text();
        const style = doc.createElement('style');
        style.textContent = css;
        link.replaceWith(style);
      } catch {
        // Leave the link in place if it cannot be inlined.
      }
    })
  );
}

/**
 * Build a self-contained SVG that embeds the slide HTML through a
 * <foreignObject>. Serialized to a `data:` URL this rasterizes reliably in
 * the browser (blob: URLs taint the canvas and cannot be exported).
 */
export async function buildSlideSvg(
  htmlContent: string,
  width = SLIDE_WIDTH,
  height = SLIDE_HEIGHT
): Promise<string> {
  const doc = serializeDocument(htmlContent);
  await Promise.all([inlineImages(doc), inlineStylesheets(doc)]);

  const serializer = new XMLSerializer();
  const headMarkup = Array.from(doc.head.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el) => serializer.serializeToString(el))
    .join('\n');
  const bodyAttributes = Array.from(doc.body.attributes)
    .map((attr) => `${attr.name}="${escapeXmlAttribute(attr.value)}"`)
    .join(' ');
  const bodyMarkup = Array.from(doc.body.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <foreignObject x="0" y="0" width="${width}" height="${height}">
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta charset="utf-8" />
        ${headMarkup}
        <style>
          html, body { margin: 0 !important; padding: 0 !important; width: ${width}px !important; height: ${height}px !important; }
        </style>
      </head>
      <body ${bodyAttributes}>${bodyMarkup}</body>
    </html>
  </foreignObject>
</svg>`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to rasterize slide'));
    img.src = src;
  });
}

/**
 * Rasterize a slide HTML document to a canvas at exactly 1280x720 CSS pixels
 * (times the requested device scale for sharper exports).
 */
export async function renderSlideToCanvas(
  htmlContent: string,
  options: { width?: number; height?: number; scale?: number; background?: string } = {}
): Promise<HTMLCanvasElement> {
  const width = options.width ?? SLIDE_WIDTH;
  const height = options.height ?? SLIDE_HEIGHT;
  const scale = options.scale ?? 2;
  const background = options.background ?? '#ffffff';

  const svg = await buildSlideSvg(htmlContent, width, height);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
      type,
      quality
    );
  });
}

export async function renderSlideToPngBlob(
  htmlContent: string,
  scale = 1
): Promise<Blob> {
  const canvas = await renderSlideToCanvas(htmlContent, { scale });
  return canvasToBlob(canvas, 'image/png');
}

export async function renderSlideToJpegBlob(
  htmlContent: string,
  scale = 1,
  quality = 0.92
): Promise<Blob> {
  const canvas = await renderSlideToCanvas(htmlContent, { scale, background: '#ffffff' });
  return canvasToBlob(canvas, 'image/jpeg', quality);
}

export async function renderSlideToPngDataUrl(
  htmlContent: string,
  scale = 2
): Promise<string> {
  const canvas = await renderSlideToCanvas(htmlContent, { scale });
  return canvas.toDataURL('image/png');
}

async function blobToUint8(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Build a multi-page PDF (one 1280x720 page per slide). */
export async function buildDeckPdf(
  slides: ExportableSlide[],
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [SLIDE_WIDTH, SLIDE_HEIGHT],
    hotfixes: ['px_scaling'],
    compress: true,
  });

  for (let i = 0; i < slides.length; i++) {
    if (i > 0) pdf.addPage([SLIDE_WIDTH, SLIDE_HEIGHT], 'landscape');
    const dataUrl = await renderSlideToPngDataUrl(slides[i].html_content, 2);
    pdf.addImage(dataUrl, 'PNG', 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
    onProgress?.(i + 1, slides.length);
  }

  return pdf.output('blob');
}

/** Build a PPTX deck with each slide as a full-bleed 16:9 image. */
export async function buildDeckPptx(
  projectName: string,
  slides: ExportableSlide[],
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'MYTHGRAM_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'MYTHGRAM_16_9';
  pptx.author = 'Mythgram';
  pptx.title = projectName;

  for (let i = 0; i < slides.length; i++) {
    const dataUrl = await renderSlideToPngDataUrl(slides[i].html_content, 2);
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addImage({ data: dataUrl, x: 0, y: 0, w: 13.333, h: 7.5 });
    onProgress?.(i + 1, slides.length);
  }

  const out = await pptx.write({ outputType: 'blob' });
  if (out instanceof Blob) return out;
  if (out instanceof ArrayBuffer) return new Blob([out], { type: 'application/zip' });
  if (typeof out === 'string') {
    return new Blob([strToU8(out)], { type: 'application/zip' });
  }
  return new Blob([out as BlobPart], { type: 'application/zip' });
}

export interface BuiltDeckArchive {
  blob: Blob;
  fileName: string;
}

/**
 * Build a ZIP archive containing every slide of the deck converted to the
 * selected format. Image/SVG/HTML formats produce one file per slide;
 * PDF/PPTX produce one combined document for the whole deck.
 */
export async function buildDeckArchive(
  format: SlideExportFormat,
  project: ExportableProject,
  slides: ExportableSlide[],
  onProgress?: (done: number, total: number) => void
): Promise<BuiltDeckArchive> {
  const base = safeFileName(project.name);
  const files: Record<string, Uint8Array> = {};

  if (format === 'pdf') {
    const pdfBlob = await buildDeckPdf(slides, onProgress);
    files[`${base}.pdf`] = await blobToUint8(pdfBlob);
  } else if (format === 'pptx') {
    const pptxBlob = await buildDeckPptx(project.name, slides, onProgress);
    files[`${base}.pptx`] = await blobToUint8(pptxBlob);
  } else {
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const prefix = `slide-${padSlideNumber(slide.slide_number)}`;
      if (format === 'png') {
        const blob = await renderSlideToPngBlob(slide.html_content, 1);
        files[`${prefix}.png`] = await blobToUint8(blob);
      } else if (format === 'jpeg') {
        const blob = await renderSlideToJpegBlob(slide.html_content, 1);
        files[`${prefix}.jpg`] = await blobToUint8(blob);
      } else if (format === 'svg') {
        const svg = await buildSlideSvg(slide.html_content);
        files[`${prefix}.svg`] = strToU8(svg);
      } else if (format === 'html') {
        files[`${prefix}.html`] = strToU8(slide.html_content);
      }
      onProgress?.(i + 1, slides.length);
    }
  }

  files['README.txt'] = strToU8(
    [
      `${project.name}`,
      `Exported from Mythgram as ${format.toUpperCase()} (${slides.length} slide${
        slides.length === 1 ? '' : 's'
      }).`,
      '',
      'Slides are authored for a 1280x720 (16:9) viewport.',
      format === 'png' || format === 'jpeg'
        ? 'Image exports are 1280x720 pixels.'
        : format === 'pdf' || format === 'pptx'
        ? 'PDF/PPTX pages are 1280x720 (16:9) with high-resolution imagery embedded.'
        : '',
    ]
      .filter(Boolean)
      .join('\n')
  );

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: 'application/zip' });
  return { blob, fileName: `${base}_${format}.zip` };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
