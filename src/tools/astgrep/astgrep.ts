import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { MythgramTool, assertAbsolutePath } from '../types.js';

export const astgrepSchema = z
  .object({
    pattern: z
      .string()
      .min(1)
      .describe(
        "AST pattern to search for (e.g. 'function $NAME($ARGS) { $BODY }', 'class $CLASS extends $PARENT', 'import $MODULE from \"$PATH\"'). Use $UPPERCASE wildcards to capture variable parts."
      ),
    path: z
      .string()
      .optional()
      .describe(
        'The absolute path to the directory to search within. If omitted, searches the current working directory (the workspace root)'
      ),
    include: z
      .string()
      .optional()
      .describe(
        "A glob pattern to filter which files are searched (e.g. '*.js', '*.{ts,tsx}', 'src/**'). If omitted, searches all files"
      ),
    language: z
      .string()
      .optional()
      .describe(
        "Programming language for AST parsing (e.g. 'javascript', 'python', 'typescript'). If omitted, auto-detects from file extensions"
      ),
  })
  .strict();

function astPatternToRegex(astPattern: string): RegExp {
  // Convert AST structural pattern with $UPPERCASE wildcards into a structural multi-line regex
  const tokens = astPattern.split(/(\$\$?[A-Z_][A-Z0-9_]*|\s+)/);
  const regexParts = tokens.map((tok) => {
    if (/^\$\$?[A-Z_][A-Z0-9_]*$/.test(tok)) {
      return '([\\s\\S]*?)';
    }
    if (/^\s+$/.test(tok)) {
      return '\\s+';
    }
    return tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp(regexParts.join(''), 'gm');
}

export const astgrepTool: MythgramTool<typeof astgrepSchema> = {
  name: 'astgrep',
  description:
    'Searches for AST patterns within code files using structural matching. Supports multiple programming languages and returns matches with file paths, line numbers, and code context. YOU MUST USE THIS TOOL WHENEVER YOU WANT TO SEARCH FOR CODE. Usage: AST patterns use code-like patterns with wildcards (e.g. \'function $NAME($ARGS) { $BODY }\', \'import $MODULE from "$PATH"\'). Wildcards use $UPPERCASE for capturing parts (e.g. $NAME, $ARGS, $BODY). Language auto-detection detects the programming language from file extensions. Filter files by pattern with the `include` parameter (e.g. \'*.js\', \'*.{ts,tsx}\'). Supports 20+ programming languages including JavaScript, TypeScript, Python, Java, Go, Rust, etc.',
  schema: astgrepSchema,
  execute: async (args, context) => {
    const searchDir = args.path
      ? assertAbsolutePath(args.path, 'path')
      : context.workspace;

    const globPattern = args.include || '**/*.{ts,tsx,js,jsx,py,go,rs,java,c,cpp,cs,rb,php,swift,kt}';
    const files = await fg(globPattern, {
      cwd: searchDir,
      absolute: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.mythgram/**'],
    });

    const regex = astPatternToRegex(args.pattern);
    const matches: {
      file: string;
      start_line: number;
      end_line: number;
      snippet: string;
    }[] = [];

    for (const file of files) {
      if (matches.length >= 50) break;
      try {
        const content = await fs.readFile(file, 'utf-8');
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(content)) !== null) {
          const prefix = content.slice(0, m.index);
          const startLine = prefix.split(/\r?\n/).length;
          const matchLines = m[0].split(/\r?\n/).length;
          matches.push({
            file,
            start_line: startLine,
            end_line: startLine + matchLines - 1,
            snippet: m[0],
          });
          if (matches.length >= 50) break;
          if (m.index === regex.lastIndex) regex.lastIndex++;
        }
      } catch {
        // ignore read error
      }
    }

    return {
      pattern: args.pattern,
      language: args.language || 'auto',
      path: searchDir,
      total_matches: matches.length,
      matches,
    };
  },
};
