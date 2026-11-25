import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { listMemoryEntries, searchMemory } from '../../memory/index.js';

export const memorySearchSchema = z
  .object({
    query: z.string().min(1).describe('The search query.'),
  })
  .strict();

export const memorySearchTool: MythgramTool<typeof memorySearchSchema> = {
  name: 'memory_search',
  description:
    'Search persistent memory using a natural-language query. Returns matching file paths and matching line numbers/content; use file_read on those paths to load surrounding context.',
  schema: memorySearchSchema,
  execute: async (args) => {
    const matches = await searchMemory(args.query, 30);
    const entries = await listMemoryEntries();
    return {
      success: true,
      query: args.query,
      total_matches: matches.length,
      total_memory_files: entries.length,
      files: entries.map((e) => ({
        file: e.file,
        file_path: e.file_path,
        name: e.name,
        send_on_request: e.send_on_request,
      })),
      matches,
      hint:
        matches.length === 0
          ? 'No memory matched. Try broader keywords, or read the memory files directly with file_read.'
          : 'Use file_read on the returned file paths to read the surrounding context.',
    };
  },
};
