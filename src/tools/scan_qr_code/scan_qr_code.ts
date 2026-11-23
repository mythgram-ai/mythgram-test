import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import jsQR from 'jsqr';
import { MythgramTool, assertAbsolutePath } from '../types.js';

export const scanQrCodeSchema = z
  .object({
    image_path: z
      .string()
      .min(1)
      .describe('Absolute file path to the image file containing the QR code.'),
  })
  .strict();

export const scanQrCodeTool: MythgramTool<typeof scanQrCodeSchema> = {
  name: 'scan_qr_code',
  description:
    'Scan and decode QR codes from an image file. Provide absolute file path to the image containing the QR code. The tool returns the decoded QR code data.',
  schema: scanQrCodeSchema,
  execute: async (args) => {
    const absPath = assertAbsolutePath(args.image_path, 'image_path');
    const buf = await fs.readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();

    let width = 0;
    let height = 0;
    let rgbaData: Uint8ClampedArray;

    if (ext === '.png') {
      const png = PNG.sync.read(buf);
      width = png.width;
      height = png.height;
      rgbaData = new Uint8ClampedArray(png.data);
    } else if (ext === '.jpg' || ext === '.jpeg') {
      const decoded = jpeg.decode(buf, { useTArray: true });
      width = decoded.width;
      height = decoded.height;
      rgbaData = new Uint8ClampedArray(decoded.data);
    } else {
      // Try PNG first then JPEG
      try {
        const png = PNG.sync.read(buf);
        width = png.width;
        height = png.height;
        rgbaData = new Uint8ClampedArray(png.data);
      } catch {
        const decoded = jpeg.decode(buf, { useTArray: true });
        width = decoded.width;
        height = decoded.height;
        rgbaData = new Uint8ClampedArray(decoded.data);
      }
    }

    const code = jsQR(rgbaData, width, height);
    const dataUrl = `data:image/${ext === '.png' ? 'png' : 'jpeg'};base64,${buf.toString('base64')}`;

    if (!code) {
      return {
        success: false,
        image_path: absPath,
        data_url: dataUrl,
        decoded_text: null,
        message: 'No QR code detected in the provided image.',
      };
    }

    return {
      success: true,
      image_path: absPath,
      data_url: dataUrl,
      decoded_text: code.data,
      location: code.location,
    };
  },
};
