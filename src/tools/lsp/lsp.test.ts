import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { lspTool } from './lsp.js';
import { lspEngine } from '../../lsp/index.js';
import {
  TOOLS_MAP,
  executeNativeTool,
  getOpenAIToolsList,
  getSubAgentOpenAIToolsList,
} from '../index.js';
import { DEFAULT_ALLOWED_SUB_AGENT_TOOLS } from '../../sub-agents/index.js';

async function retryUntil<T>(
  fn: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs: number = 20_000
): Promise<T> {
  const startedAt = Date.now();
  for (;;) {
    const value = await fn();
    if (done(value) || Date.now() - startedAt >= timeoutMs) return value;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

export async function testLsp() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-lsp-'));
  const sourceDir = path.join(tmpDir, 'src');
  await fs.mkdir(sourceDir, { recursive: true });

  const filePath = path.join(sourceDir, 'greeter.ts');
  const source = [
    'export function greet(name: string): string {',
    '  return `Hello ${name}`;',
    '}',
    '',
    'export function main(): void {',
    "  const message = greet('world');",
    '  console.log(message);',
    '}',
    '',
    'interface Greeter {',
    '  greet(name: string): string;',
    '}',
    '',
    'class SimpleGreeter implements Greeter {',
    '  greet(name: string): string {',
    '    return `Hi ${name}`;',
    '  }',
    '}',
    '',
    'main();',
    '',
  ].join('\n');

  await fs.writeFile(filePath, source, 'utf-8');
  await fs.writeFile(
    path.join(tmpDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
        },
        include: ['src/**/*.ts'],
      },
      null,
      2
    ),
    'utf-8'
  );

  const serverBin = path.resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    'typescript-language-server'
  );
  await fs.access(serverBin);

  await fs.mkdir(path.join(tmpDir, '.mythgram'), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, '.mythgram', 'lsp.json'),
    JSON.stringify({
      servers: [
        {
          id: 'test-typescript',
          name: 'TypeScript Language Server',
          command: serverBin,
          args: ['--stdio'],
          extensions: ['.ts'],
          languageIds: { '.ts': 'typescript' },
          rootPatterns: ['tsconfig.json'],
          requestTimeoutMs: 30_000,
        },
      ],
    }),
    'utf-8'
  );

  await lspEngine.reloadConfig(tmpDir);

  const ctx = {
    sessionId: 'test_lsp_session_123456789012345',
    workspace: tmpDir,
    visionSupport: true,
  };

  const run = (operation: any, line: number, character: number, query?: string) =>
    lspTool.execute(
      { operation, filePath, line, character, ...(query ? { query } : {}) },
      ctx
    );

  try {
    assert.ok(TOOLS_MAP.has('lsp'), 'lsp tool must be registered in the tool registry');
    assert.ok(
      getSubAgentOpenAIToolsList().some(
        (definition) => definition.function.name === 'lsp'
      ),
      'lsp must be available to sub-agents'
    );
    assert.ok(
      DEFAULT_ALLOWED_SUB_AGENT_TOOLS.includes('lsp'),
      'default sub-agents must allow the lsp tool'
    );
    const openAiDef = getOpenAIToolsList(true).find(
      (definition) => definition.function.name === 'lsp'
    );
    assert.ok(openAiDef, 'lsp must be exposed as a native OpenAI tool');
    assert.deepEqual(openAiDef.function.parameters.required.slice(0, 4), [
      'operation',
      'filePath',
      'line',
      'character',
    ]);
    assert.equal(openAiDef.function.parameters.properties.line.type, 'integer');
    assert.equal(openAiDef.function.parameters.properties.character.minimum, 1);
    assert.ok(
      openAiDef.function.parameters.properties.query.anyOf.some(
        (variant: any) => variant.type === 'null'
      ),
      'optional query must accept null from native tool calls'
    );
    assert.equal(
      openAiDef.function.parameters.additionalProperties,
      false,
      'lsp schema must reject additional properties'
    );

    const definition = await run('goToDefinition', 6, 19);
    assert.ok(definition.count >= 1, 'goToDefinition should resolve the greet call');
    assert.equal(definition.locations[0].file, filePath);
    assert.equal(definition.locations[0].range.start.line, 1);
    assert.match(definition.locations[0].lineText, /greet/);

    const references = await run('findReferences', 1, 17);
    assert.ok(references.count >= 2, 'findReferences should include the declaration and call');
    assert.ok(
      references.locations.some((location: any) => location.range.start.line === 6),
      'references should include the call site on line 6'
    );

    const hover = await run('hover', 1, 17);
    assert.match(hover.contents, /greet/);

    const documentSymbols = await run('documentSymbol', 1, 1);
    const documentSymbolNames = documentSymbols.symbols.map((symbol: any) => symbol.name);
    assert.ok(documentSymbolNames.includes('greet'));
    assert.ok(documentSymbolNames.includes('main'));
    assert.ok(documentSymbolNames.includes('SimpleGreeter'));

    const workspaceSymbols = await retryUntil(
      () => run('workspaceSymbol', 1, 1, 'greet'),
      (result) => result.count > 0
    );
    assert.equal(workspaceSymbols.query, 'greet');
    assert.ok(workspaceSymbols.symbols.some((symbol: any) => symbol.name === 'greet'));

    const cursorSymbols = await retryUntil(
      () => run('workspaceSymbol', 1, 17),
      (result) => result.count > 0
    );
    assert.equal(cursorSymbols.query, 'greet', 'identifier under cursor should be used as query');

    const hierarchy = await retryUntil(
      () => run('prepareCallHierarchy', 1, 17),
      (result) => result.count > 0
    );
    assert.ok(hierarchy.items.some((item: any) => item.name === 'greet'));

    const incoming = await retryUntil(
      () => run('incomingCalls', 1, 17),
      (result) => result.count > 0
    );
    assert.ok(
      incoming.calls.some((call: any) => call.from?.name === 'main'),
      'incomingCalls should report main as a caller of greet'
    );

    const outgoing = await retryUntil(
      () => run('outgoingCalls', 5, 17),
      (result) => result.count > 0
    );
    assert.ok(
      outgoing.calls.some((call: any) => call.to?.name === 'greet'),
      'outgoingCalls should report greet as callee of main'
    );

    const implementations = await retryUntil(
      () => run('goToImplementation', 11, 3),
      (result) => result.count > 0
    );
    assert.ok(
      implementations.locations.some(
        (location: any) => location.range.start.line === 15
      ),
      'goToImplementation should find SimpleGreeter.greet'
    );

    const nativeResult = await executeNativeTool(
      'lsp',
      { operation: 'hover', filePath, line: 1, character: 17, query: null },
      ctx
    );
    assert.equal(nativeResult.success, true);
    assert.match(nativeResult.contents, /greet/);

    await fs.writeFile(path.join(tmpDir, 'notes.txt'), 'plain text', 'utf-8');
    await assert.rejects(
      () =>
        lspTool.execute(
          {
            operation: 'hover',
            filePath: path.join(tmpDir, 'notes.txt'),
            line: 1,
            character: 1,
          },
          ctx
        ),
      /No LSP server is configured or installed/
    );

    await assert.rejects(
      () =>
        lspTool.execute(
          { operation: 'hover', filePath: 'src/greeter.ts', line: 1, character: 1 },
          ctx
        ),
      /must be an absolute path/
    );
  } finally {
    await lspEngine.disposeAll().catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
