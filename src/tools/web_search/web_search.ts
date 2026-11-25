import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { webSearch } from '../../web-search/index.js';

export const webSearchSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('The search query.'),
  })
  .strict();

const MAX_RESULTS = 20;
const TIMEOUT_MS = 3 * 60 * 1000;

export const webSearchTool: MythgramTool<typeof webSearchSchema> = {
  name: 'web_search',
  description:
    'Search the web for up-to-date information, news, and general knowledge. Returns up to 20 results with titles, URLs, and descriptions. Uses the web search provider selected in Settings → Web Search (DuckDuckGo by default, which falls back to Bing when DuckDuckGo blocks the request). Each description is capped at 30 words, and a cut description ends with the marker "........... " — read the full page with fatch_web_urls when you need more.',
  schema: webSearchSchema,
  execute: async (args) => {
    const result = await webSearch(args.query, {
      maxResults: MAX_RESULTS,
      timeoutMs: TIMEOUT_MS,
    });
    return {
      success: true,
      query: args.query,
      provider: result.provider,
      engine: result.engine,
      note: result.note,
      total_results: result.results.length,
      max_results: MAX_RESULTS,
      results: result.results,
      hint:
        result.results.length === 0
          ? 'No results returned. Try a different query or fetch a known URL with fatch_web_urls.'
          : 'Use fatch_web_urls on a result URL to read the full page content.',
    };
  },
};
