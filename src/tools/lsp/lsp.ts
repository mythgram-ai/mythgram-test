import { z } from 'zod';
import { MythgramTool, assertAbsolutePath } from '../types.js';
import { lspEngine } from '../../lsp/index.js';

export const lspSchema = z
  .object({
    operation: z
      .enum([
        'goToDefinition',
        'findReferences',
        'hover',
        'documentSymbol',
        'workspaceSymbol',
        'goToImplementation',
        'prepareCallHierarchy',
        'incomingCalls',
        'outgoingCalls',
      ])
      .describe('The LSP operation to perform.'),
    filePath: z
      .string()
      .min(1)
      .describe('The absolute path to the file.'),
    line: z
      .number()
      .int()
      .min(1)
      .describe('The 1-based line number.'),
    character: z
      .number()
      .int()
      .min(1)
      .describe('The 1-based character offset.'),
    query: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe(
        'Optional symbol name for workspaceSymbol. When omitted, the identifier under the cursor is used.'
      ),
  })
  .strict();

export const lspTool: MythgramTool<typeof lspSchema> = {
  name: 'lsp',
  description:
    'Interact with Language Server Protocol (LSP) servers to get code intelligence features. Supported operations: goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls. All operations require an absolute file path plus a 1-based line and character offset. workspaceSymbol optionally accepts a query; when omitted the identifier under the cursor is used. An LSP server must be installed/configured for the file type.',
  schema: lspSchema,
  execute: async (args, context) => {
    const filePath = assertAbsolutePath(args.filePath, 'filePath');

    const result = await lspEngine.execute(
      args.operation,
      {
        filePath,
        line: args.line,
        character: args.character,
        query: args.query ?? undefined,
      },
      {
        workspaceRoot: context.workspace,
        signal: context.signal,
      }
    );

    return {
      success: true,
      ...result,
    };
  },
};
