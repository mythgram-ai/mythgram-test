import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { listKnowledgeEntries, searchKnowledge } from '../../knowledge/index.js';

export const knowledgeSearchSchema = z
  .object({
    query: z.string().min(1).describe('The search query.'),
  })
  .strict();

export const knowledgeSearchTool: MythgramTool<typeof knowledgeSearchSchema> = {
  name: 'knowledge_search',
  description:
    'Search the persistent knowledge base using a natural-language query. Returns matching file paths and matching line numbers/content; use file_read on those paths to load surrounding context.',
  schema: knowledgeSearchSchema,
  execute: async (args) => {
    const matches = await searchKnowledge(args.query, 30);
    const entries = await listKnowledgeEntries();
    return {
      success: true,
      query: args.query,
      total_matches: matches.length,
      total_knowledge_files: entries.length,
      files: entries.map((e) => ({
        id: e.id,
        name: e.name,
        source_type: e.source_type,
        file_path: e.file_path,
        source_url: e.source_url,
      })),
      matches,
      hint:
        matches.length === 0
          ? 'No knowledge matched. Try broader keywords, or list the knowledge folder with read_directory.'
          : 'Use file_read on the returned file paths to read the surrounding context.',
    };
  },
};
