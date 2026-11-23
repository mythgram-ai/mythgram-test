import { z } from 'zod';
import { MythgramTool } from '../types.js';

export const embedUrlSchema = z
  .object({
    url: z
      .string()
      .min(1)
      .describe(
        'Publicly accessible HTTP or HTTPS URL to preview, such as a website, web app, stream, image, or document.'
      ),
  })
  .strict();

export const embedUrlTool: MythgramTool<typeof embedUrlSchema> = {
  name: 'embed_url',
  description:
    "Embed a live public URL inside the app's browser preview panel so the user can see it. The URL must be publicly accessible over HTTP or HTTPS; prefer public URLs over localhost or private addresses, localhost, private addresses supported.",
  schema: embedUrlSchema,
  execute: async (args, context) => {
    let targetUrl = args.url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      if (
        targetUrl.startsWith('localhost') ||
        targetUrl.startsWith('127.0.0.1') ||
        targetUrl.startsWith('0.0.0.0')
      ) {
        targetUrl = `http://${targetUrl}`;
      } else {
        targetUrl = `https://${targetUrl}`;
      }
    }

    context.onUiAction?.({
      action: 'open_browser',
      data: {
        url: targetUrl,
      },
    });

    return {
      success: true,
      embedded_url: targetUrl,
      message: `URL "${targetUrl}" has been embedded and opened in the Browser tab.`,
    };
  },
};
