export type LspOperation =
  | 'goToDefinition'
  | 'findReferences'
  | 'hover'
  | 'documentSymbol'
  | 'workspaceSymbol'
  | 'goToImplementation'
  | 'prepareCallHierarchy'
  | 'incomingCalls'
  | 'outgoingCalls';

export const LSP_OPERATIONS: LspOperation[] = [
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
  'goToImplementation',
  'prepareCallHierarchy',
  'incomingCalls',
  'outgoingCalls',
];

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

/**
 * A language server definition. Built-in definitions live in `servers.ts`; users can add or
 * override definitions with `.mythgram/lsp.json` or the `MYTHGRAM_LSP_SERVERS` env variable.
 */
export interface LspServerConfig {
  id: string;
  name?: string;
  command: string;
  args?: string[];
  extensions: string[];
  languageIds?: Record<string, string>;
  defaultLanguageId?: string;
  env?: Record<string, string>;
  initializationOptions?: Record<string, unknown>;
  rootPatterns?: string[];
  requestTimeoutMs?: number;
  disabled?: boolean;
}

export interface ResolvedLspServerConfig extends LspServerConfig {
  /** Absolute path to the executable that was found on disk. */
  command: string;
}

export interface LspExecuteParams {
  filePath: string;
  line: number;
  character: number;
  query?: string;
}

export interface LspExecuteOptions {
  workspaceRoot: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface LspServerInfo {
  id: string;
  name: string;
  command: string;
}

export interface LspOperationResult {
  operation: LspOperation;
  filePath: string;
  position: { line: number; character: number };
  server: LspServerInfo;
  [key: string]: unknown;
}
