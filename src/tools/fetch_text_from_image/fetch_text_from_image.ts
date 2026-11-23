import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { MythgramTool, assertAbsolutePath } from '../types.js';

export const fetchTextFromImageSchema = z
  .object({
    image_source: z
      .string()
      .min(1)
      .describe(
        'The image to process. Provide either a publicly accessible HTTP/HTTPS image URL or an absolute local file path.'
      ),
  })
  .strict();

export const fetchTextFromImageTool: MythgramTool<typeof fetchTextFromImageSchema> = {
  name: 'fetch_text_from_image',
  description:
    "Use this tool whenever you need to extract, read, or analyze text contained in an image. Provide the image source as either a publicly accessible HTTP/HTTPS image URL or an absolute file path. Use this tool when a task requires reading screenshots, scanned documents, photographs, receipts, signs, handwritten notes, or other images containing text. Pass the image source in the image_source parameter. Ensure that local file paths are absolute and that remote image URLs are accessible. After receiving the result, use the extracted text to continue the user's task.",
  schema: fetchTextFromImageSchema,
  execute: async (args) => {
    const src = args.image_source.trim();
    const isUrl = /^https?:\/\//i.test(src);
    const resolvedSource = isUrl ? src : assertAbsolutePath(src, 'image_source');

    let dataUrl = resolvedSource;
    if (!isUrl) {
      const buf = await fs.readFile(resolvedSource);
      const ext = path.extname(resolvedSource).toLowerCase().replace('.', '') || 'png';
      dataUrl = `data:image/${ext};base64,${buf.toString('base64')}`;
    }

    const worker = await createWorker('eng');
    try {
      const ret = await worker.recognize(resolvedSource);
      return {
        success: true,
        image_source: resolvedSource,
        data_url: dataUrl,
        text: ret.data.text.trim(),
        confidence: ret.data.confidence,
      };
    } finally {
      await worker.terminate();
    }
  },
};
