import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MythgramTool, assertAbsolutePath } from '../types.js';

export const applyPatchSchema = z
  .object({
    input: z
      .string()
      .min(1)
      .describe(
        "The full apply_patch command to execute — a single string beginning with '*** Begin Patch' and ending with '*** End Patch'. Inside the envelope, use '*** Add File: <path>', '*** Update File: <path>' (optionally followed by '*** Move to: <path>' and one or more '@@' hunks), or '*** Delete File: <path>'. In a hunk, prefix each line with ' ' (context), '-' (remove the line) or '+' (add the line). Paths MUST be absolute (start with '/')."
      ),
  })
  .strict();

interface Hunk {
  headers: string[];
  lines: { type: ' ' | '-' | '+'; text: string }[];
}

interface PatchOperation {
  action: 'add' | 'delete' | 'update';
  filePath: string;
  moveTo?: string;
  addLines?: string[];
  hunks?: Hunk[];
}

function parsePatchInput(input: string): PatchOperation[] {
  const rawLines = input.replace(/\r\n/g, '\n').split('\n');
  let startIdx = rawLines.findIndex((l) => l.trim() === '*** Begin Patch');
  let endIdx = rawLines.findIndex((l) => l.trim() === '*** End Patch');

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error("Invalid patch envelope: must start with '*** Begin Patch' and end with '*** End Patch'.");
  }

  const bodyLines = rawLines.slice(startIdx + 1, endIdx);
  const ops: PatchOperation[] = [];
  let i = 0;

  while (i < bodyLines.length) {
    const line = bodyLines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    if (line.startsWith('*** Add File: ')) {
      const filePath = assertAbsolutePath(line.slice('*** Add File: '.length).trim(), 'Add File path');
      i++;
      const addLines: string[] = [];
      while (i < bodyLines.length && !bodyLines[i].startsWith('*** ')) {
        const l = bodyLines[i];
        if (!l.startsWith('+')) {
          throw new Error(`Invalid line in Add File (${filePath}): every line must start with '+'. Got: "${l}"`);
        }
        addLines.push(l.slice(1));
        i++;
      }
      ops.push({ action: 'add', filePath, addLines });
    } else if (line.startsWith('*** Delete File: ')) {
      const filePath = assertAbsolutePath(line.slice('*** Delete File: '.length).trim(), 'Delete File path');
      i++;
      ops.push({ action: 'delete', filePath });
    } else if (line.startsWith('*** Update File: ')) {
      const filePath = assertAbsolutePath(line.slice('*** Update File: '.length).trim(), 'Update File path');
      i++;
      let moveTo: string | undefined;
      if (i < bodyLines.length && bodyLines[i].startsWith('*** Move to: ')) {
        moveTo = assertAbsolutePath(bodyLines[i].slice('*** Move to: '.length).trim(), 'Move to path');
        i++;
      }

      const hunks: Hunk[] = [];
      while (i < bodyLines.length && !bodyLines[i].startsWith('*** Add File:') && !bodyLines[i].startsWith('*** Delete File:') && !bodyLines[i].startsWith('*** Update File:')) {
        if (bodyLines[i].startsWith('@@')) {
          const headers: string[] = [];
          while (i < bodyLines.length && bodyLines[i].startsWith('@@')) {
            headers.push(bodyLines[i].slice(2).trim());
            i++;
          }
          const hunkLines: { type: ' ' | '-' | '+'; text: string }[] = [];
          while (
            i < bodyLines.length &&
            !bodyLines[i].startsWith('@@') &&
            !bodyLines[i].startsWith('*** ')
          ) {
            const hl = bodyLines[i];
            const prefix = hl[0];
            if (prefix !== ' ' && prefix !== '-' && prefix !== '+') {
              throw new Error(
                `Invalid hunk line in ${filePath}: must start with ' ', '-', or '+'. Got: "${hl}"`
              );
            }
            hunkLines.push({ type: prefix, text: hl.slice(1) });
            i++;
          }
          if (i < bodyLines.length && bodyLines[i].trim() === '*** End of File') {
            i++;
          }
          hunks.push({ headers, lines: hunkLines });
        } else {
          throw new Error(`Unexpected line in Update File (${filePath}): "${bodyLines[i]}"`);
        }
      }
      ops.push({ action: 'update', filePath, moveTo, hunks });
    } else {
      throw new Error(`Unknown patch operation header: "${line}"`);
    }
  }

  return ops;
}

function applyHunksToContent(filePath: string, originalContent: string, hunks: Hunk[]): string {
  let fileLines = originalContent.replace(/\r\n/g, '\n').split('\n');
  let searchStart = 0;

  for (const hunk of hunks) {
    const expectedOldLines = hunk.lines
      .filter((l) => l.type === ' ' || l.type === '-')
      .map((l) => l.text);
    const replacementLines = hunk.lines
      .filter((l) => l.type === ' ' || l.type === '+')
      .map((l) => l.text);

    if (expectedOldLines.length === 0) {
      // Pure addition
      fileLines.splice(searchStart, 0, ...replacementLines);
      searchStart += replacementLines.length;
      continue;
    }

    let matchIndex = -1;
    for (let idx = searchStart; idx <= fileLines.length - expectedOldLines.length; idx++) {
      let matches = true;
      for (let j = 0; j < expectedOldLines.length; j++) {
        if (fileLines[idx + j] !== expectedOldLines[j]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        matchIndex = idx;
        break;
      }
    }

    // Fallback search from start of file if not found after searchStart
    if (matchIndex === -1 && searchStart > 0) {
      for (let idx = 0; idx <= fileLines.length - expectedOldLines.length; idx++) {
        let matches = true;
        for (let j = 0; j < expectedOldLines.length; j++) {
          if (fileLines[idx + j] !== expectedOldLines[j]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          matchIndex = idx;
          break;
        }
      }
    }

    if (matchIndex === -1) {
      throw new Error(
        `Failed to apply hunk in ${filePath}: could not find matching context/removal lines:\n${expectedOldLines.join('\n')}`
      );
    }

    fileLines.splice(matchIndex, expectedOldLines.length, ...replacementLines);
    searchStart = matchIndex + replacementLines.length;
  }

  return fileLines.join('\n');
}

export const applyPatchTool: MythgramTool<typeof applyPatchSchema> = {
  name: 'apply_patch',
  description:
    "Edit files by applying a structured, file-oriented patch instead of rewriting whole files. Pass ONE 'input' string wrapped in '*** Begin Patch' ... '*** End Patch'. Each file section is one operation: '*** Add File: <path>' (create a new file; every following line starts with '+'), '*** Update File: <path>' (edit in place; optional '*** Move to: <path>' to rename, then '@@' hunks whose lines start with ' ' for context, '-' to REMOVE/delete a line, or '+' to ADD a line), or '*** Delete File: <path>'. '-' lines are physically deleted from the file, not just replaced. Paths MUST be absolute (start with '/'). The tool validates the whole patch and verifies every operation can be applied BEFORE writing — on any structural or apply error NO file is changed and a precise error is returned. Prefer this for surgical, multi-file, token-efficient edits.",
  schema: applyPatchSchema,
  execute: async (args) => {
    const ops = parsePatchInput(args.input);
    if (ops.length === 0) {
      throw new Error('Patch contains no file operations.');
    }

    // Phase 1: Dry-run & validate all operations in memory before touching disk
    const stagedWrites: { targetPath: string; content: string; deleteOldPath?: string }[] = [];
    const stagedDeletes: string[] = [];

    for (const op of ops) {
      if (op.action === 'add') {
        stagedWrites.push({
          targetPath: op.filePath,
          content: (op.addLines || []).join('\n'),
        });
      } else if (op.action === 'delete') {
        await fs.access(op.filePath);
        stagedDeletes.push(op.filePath);
      } else if (op.action === 'update') {
        const currentContent = await fs.readFile(op.filePath, 'utf-8');
        const newContent = applyHunksToContent(op.filePath, currentContent, op.hunks || []);
        stagedWrites.push({
          targetPath: op.moveTo || op.filePath,
          content: newContent,
          deleteOldPath: op.moveTo && op.moveTo !== op.filePath ? op.filePath : undefined,
        });
      }
    }

    // Phase 2: Commit all validated operations
    for (const writeOp of stagedWrites) {
      await fs.mkdir(path.dirname(writeOp.targetPath), { recursive: true });
      await fs.writeFile(writeOp.targetPath, writeOp.content, 'utf-8');
      if (writeOp.deleteOldPath) {
        await fs.unlink(writeOp.deleteOldPath);
      }
    }

    for (const delPath of stagedDeletes) {
      await fs.unlink(delPath);
    }

    return {
      success: true,
      operations_applied: ops.map((op) => ({
        action: op.action,
        file_path: op.filePath,
        move_to: op.moveTo,
      })),
      patch: args.input,
    };
  },
};
