import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { imageSearch } from '../../web-search/index.js';

export const imageSearchSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('The search query used to find relevant images.'),
  })
  .strict();

const MAX_RESULTS = 20;
const TIMEOUT_MS = 3 * 60 * 1000;

export const imageSearchTool: MythgramTool<typeof imageSearchSchema> = {
  name: 'image_search',
  description:
    'Search the web for images using a search query. Returns image results with direct live image URLs and source URLs.',
  schema: imageSearchSchema,
  execute: async (args) => {
    const result = await imageSearch(args.query, {
      maxResults: MAX_RESULTS,
      timeoutMs: TIMEOUT_MS,
    });
    return {
      success: true,
      query: args.query,
      provider: result.provider,
      engine: result.image_provider,
      note: result.note,
      total_results: result.results.length,
      max_results: MAX_RESULTS,
      results: result.results,
    };
  },
};
