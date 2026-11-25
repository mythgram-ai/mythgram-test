import assert from 'node:assert/strict';
import { executeNativeTool } from '../index.js';
import { createKnowledgeFromText, deleteKnowledgeEntry } from '../../knowledge/index.js';

export async function testKnowledgeSearchTool() {
  const entry = await createKnowledgeFromText({
    name: 'Tool Search Knowledge',
    description: 'Used by the knowledge_search tool test',
    content: '# Tool Knowledge\n\nKnowledgeToolToken is here.',
  });

  const ctx = { sessionId: 'test_knowledge_search', workspace: process.cwd(), visionSupport: true };
  const result = await executeNativeTool('knowledge_search', { query: 'KnowledgeToolToken' }, ctx);
  assert.equal(result.success, true);
  assert.ok(result.total_matches >= 1);
  assert.ok(result.matches.some((m: any) => m.id === entry.id));
  assert.ok(result.total_knowledge_files >= 1);

  const empty = await executeNativeTool(
    'knowledge_search',
    { query: 'zzz-no-such-token-zzz' },
    ctx
  );
  assert.equal(empty.success, true);
  assert.equal(empty.total_matches, 0);

  await deleteKnowledgeEntry(entry.id);
}
