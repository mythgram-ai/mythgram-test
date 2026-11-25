import assert from 'node:assert/strict';
import { executeNativeTool } from '../index.js';
import { createMemoryEntry, deleteMemoryEntry } from '../../memory/index.js';

export async function testMemorySearchTool() {
  const entry = await createMemoryEntry({
    name: 'Tool Search Memory',
    description: 'Used by the memory_search tool test',
    content: '# Tool Memory\n\nMemoryToolToken is here.',
  });

  const ctx = { sessionId: 'test_memory_search', workspace: process.cwd(), visionSupport: true };
  const result = await executeNativeTool('memory_search', { query: 'MemoryToolToken' }, ctx);
  assert.equal(result.success, true);
  assert.ok(result.total_matches >= 1);
  assert.ok(result.matches.some((m: any) => m.file === entry.file));
  assert.ok(Array.isArray(result.files));

  const empty = await executeNativeTool('memory_search', { query: 'zzz-no-such-token-zzz' }, ctx);
  assert.equal(empty.success, true);
  assert.equal(empty.total_matches, 0);

  await deleteMemoryEntry(entry.id);
}
