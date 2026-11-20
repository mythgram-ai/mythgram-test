import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MythgramTool, assertAbsolutePath } from '../types.js';

export const readImageSchema = z
  .object({
    file_path: z
      .string()
      .min(1)
      .describe(
        'Absolute path starting Example: project/src/image.png Or enter a live image url example: https://example.com/images/image.png'
      ),
  })
  .strict();

const SUPPORTED_EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

export const readImageTool: MythgramTool<typeof readImageSchema> = {
  name: 'read_image',
  description:
    'Read a image from local file system or read an image by its live url.\n\nThe loaded image is attached to the conversation as a vision input, so in your next step you can visually analyze it (describe the content, read text/OCR, inspect a UI screenshot, compare images, etc.).\n\nSupported image formats: .jpg, .jpeg, .png, .gif, .webp, .heic, .heif.\n\nUsage:\n- file_path must be an absolute workspace path (the workspace-relative path reported by file_list also works) OR a live hosted image URL such as https://example.com/images/image.png\n- This tool only works with models that support image inputs.',
  schema: readImageSchema,
  execute: async (args, context) => {
    if (!context.visionSupport) {
      throw new Error(
        'The currently selected LLM model does not support vision/image inputs. Please switch to a vision-capable model or enable vision support in Settings.'
      );
    }

    const input = args.file_path.trim();
    if (/^https?:\/\//i.test(input)) {
      if (context.onVisionAttachment) {
        context.onVisionAttachment({
          type: 'image',
          mimeType: 'image/png',
          dataUrl: input,
          filePath: input,
        });
      }
      return {
        success: true,
        source: input,
        type: 'url',
        data_url: input,
        message: 'Image URL attached to the conversation as a vision input.',
      };
    }

    const absPath = assertAbsolutePath(input, 'file_path');
    const ext = path.extname(absPath).toLowerCase();
    const mimeType = SUPPORTED_EXT_MIME[ext] || 'image/png';
    const buf = await fs.readFile(absPath);
    const base64 = buf.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    if (context.onVisionAttachment) {
      context.onVisionAttachment({
        type: 'image',
        mimeType,
        dataUrl,
        filePath: absPath,
      });
    }

    return {
      success: true,
      source: absPath,
      type: 'file',
      mime_type: mimeType,
      bytes: buf.length,
      data_url: dataUrl,
      message: 'Local image attached to the conversation as a vision input.',
    };
  },
};
