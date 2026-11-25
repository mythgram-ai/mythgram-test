import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {
  buildMemoryContext,
  createMemoryEntry,
  isFirstUserRequest,
  deleteMemoryEntry,
  listMemoryEntries,
  restoreDefaultMemoryFiles,
  searchMemory,
  updateMemoryEntry,
} from './index.js';
import { getDataDir } from '../datadir/index.js';

export async function testMemorySystem() {
  assert.equal(isFirstUserRequest([]), true);
  assert.equal(isFirstUserRequest([{ role: 'user' }]), true);
  assert.equal(isFirstUserRequest([{ role: 'user' }, { role: 'assistant' }]), false);
  assert.equal(
    isFirstUserRequest([{ role: 'user' }, { role: 'assistant' }, { role: 'user' }]),
    false
  );
  assert.equal(isFirstUserRequest([{ role: 'user' }, { role: 'user' }]), false);

  const paths = getDataDir();
  const seeded = await listMemoryEntries();
  for (const file of ['MEMORY.md', 'USER.md', 'SOUL.md', 'TEMP-MEMORY.md']) {
    assert.ok(
      seeded.some((e) => e.file === file && e.is_default),
      `Expected default memory file ${file}`
    );
    assert.ok(fsSync.existsSync(path.join(paths.memoryDir, file)), `${file} must exist on disk`);
  }

  const custom = await createMemoryEntry({
    name: 'Project Notes',
    description: 'Notes used by the memory test',
    content: '# Notes\n\nUniqueMarkerAlpha belongs to project alpha.',
    send_on_request: false,
  });
  assert.equal(custom.send_on_request, false);
  assert.ok(fsSync.existsSync(custom.file_path));

  const deferredContext = await buildMemoryContext();
  assert.ok(deferredContext.includes('Project Notes'), 'Deferred file must be announced');
  assert.ok(
    !deferredContext.includes('UniqueMarkerAlpha'),
    'Deferred file content must not be inlined'
  );

  const matches = await searchMemory('UniqueMarkerAlpha');
  assert.ok(
    matches.some((m) => m.file === custom.file),
    'memory_search must find custom memory content'
  );

  await updateMemoryEntry(custom.id, { send_on_request: true });
  const inlineContext = await buildMemoryContext();
  assert.ok(inlineContext.includes('UniqueMarkerAlpha'), 'send_on_request=true must inline content');

  // Deleting a default memory file is healed automatically.
  await fs.rm(path.join(paths.memoryDir, 'USER.md'), { force: true });
  const restored = await restoreDefaultMemoryFiles();
  assert.ok(restored.some((e) => e.file === 'USER.md'));
  assert.ok(fsSync.existsSync(path.join(paths.memoryDir, 'USER.md')));

  // Custom entries can be removed; built-in files are protected.
  assert.equal(await deleteMemoryEntry(custom.id), true);
  await assert.rejects(() => deleteMemoryEntry('MEMORY.md'));

  // A deleted index is rebuilt from the Markdown files that are still on disk.
  const strayFile = path.join(paths.memoryDir, 'stray-notes.md');
  await fs.writeFile(strayFile, '# Stray\n\nStrayMemoryToken', 'utf-8');
  await fs.rm(paths.memoryJsonPath, { force: true });
  const rebuilt = await listMemoryEntries();
  const adopted = rebuilt.find((e) => e.file === 'stray-notes.md');
  assert.ok(adopted, 'stray memory file must be adopted into the index');
  assert.ok(rebuilt.some((e) => e.file === 'MEMORY.md' && e.is_default));
  await deleteMemoryEntry(adopted!.id);
  await restoreDefaultMemoryFiles();
}
