import fs from 'node:fs';
import path from 'node:path';
import type { LspServerConfig, ResolvedLspServerConfig } from './types.js';

/**
 * Built-in language servers, ordered by preference. A server is only registered when its
 * executable is actually present on the machine. The first server that claims an extension
 * wins, so alternatives for the same language are listed in priority order.
 */
export const BUILTIN_LSP_SERVERS: LspServerConfig[] = [
  {
    id: 'typescript',
    name: 'TypeScript Language Server',
    command: 'typescript-language-server',
    args: ['--stdio'],
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
    languageIds: {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.mts': 'typescript',
      '.cts': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
    },
    rootPatterns: ['tsconfig.json', 'jsconfig.json', 'package.json'],
  },
  {
    id: 'pyright',
    name: 'Pyright Language Server',
    command: 'pyright-langserver',
    args: ['--stdio'],
    extensions: ['.py', '.pyi'],
    languageIds: { '.py': 'python', '.pyi': 'python' },
    rootPatterns: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile'],
  },
  {
    id: 'pylsp',
    name: 'Python LSP Server',
    command: 'pylsp',
    args: [],
    extensions: ['.py', '.pyi'],
    languageIds: { '.py': 'python', '.pyi': 'python' },
    rootPatterns: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile'],
  },
  {
    id: 'gopls',
    name: 'gopls',
    command: 'gopls',
    args: ['serve'],
    extensions: ['.go'],
    languageIds: { '.go': 'go' },
    rootPatterns: ['go.mod', 'go.sum'],
  },
  {
    id: 'rust-analyzer',
    name: 'rust-analyzer',
    command: 'rust-analyzer',
    args: [],
    extensions: ['.rs'],
    languageIds: { '.rs': 'rust' },
    rootPatterns: ['Cargo.toml'],
  },
  {
    id: 'clangd',
    name: 'clangd',
    command: 'clangd',
    args: ['--background-index'],
    extensions: ['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'],
    rootPatterns: ['compile_commands.json', 'CMakeLists.txt', 'Makefile'],
  },
  {
    id: 'solargraph',
    name: 'Solargraph',
    command: 'solargraph',
    args: ['stdio'],
    extensions: ['.rb'],
    languageIds: { '.rb': 'ruby' },
    rootPatterns: ['Gemfile', '.ruby-version'],
  },
  {
    id: 'lua-language-server',
    name: 'Lua Language Server',
    command: 'lua-language-server',
    args: [],
    extensions: ['.lua'],
    languageIds: { '.lua': 'lua' },
    rootPatterns: ['.luarc.json', 'stylua.toml'],
  },
  {
    id: 'intelephense',
    name: 'Intelephense',
    command: 'intelephense',
    args: ['--stdio'],
    extensions: ['.php'],
    languageIds: { '.php': 'php' },
    rootPatterns: ['composer.json'],
  },
  {
    id: 'bash-language-server',
    name: 'Bash Language Server',
    command: 'bash-language-server',
    args: ['start'],
    extensions: ['.sh', '.bash', '.zsh'],
    languageIds: { '.sh': 'shellscript', '.bash': 'shellscript', '.zsh': 'shellscript' },
  },
  {
    id: 'yaml-language-server',
    name: 'YAML Language Server',
    command: 'yaml-language-server',
    args: ['--stdio'],
    extensions: ['.yaml', '.yml'],
    languageIds: { '.yaml': 'yaml', '.yml': 'yaml' },
  },
  {
    id: 'json-language-server',
    name: 'JSON Language Server',
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    extensions: ['.json', '.jsonc'],
    languageIds: { '.json': 'json', '.jsonc': 'jsonc' },
  },
  {
    id: 'html-language-server',
    name: 'HTML Language Server',
    command: 'vscode-html-language-server',
    args: ['--stdio'],
    extensions: ['.html', '.htm'],
    languageIds: { '.html': 'html', '.htm': 'html' },
  },
  {
    id: 'css-language-server',
    name: 'CSS Language Server',
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    extensions: ['.css', '.scss', '.less'],
    languageIds: { '.css': 'css', '.scss': 'scss', '.less': 'less' },
  },
  {
    id: 'kotlin-language-server',
    name: 'Kotlin Language Server',
    command: 'kotlin-language-server',
    args: [],
    extensions: ['.kt', '.kts'],
    languageIds: { '.kt': 'kotlin', '.kts': 'kotlin' },
    rootPatterns: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
  },
  {
    id: 'sourcekit-lsp',
    name: 'SourceKit-LSP',
    command: 'sourcekit-lsp',
    args: [],
    extensions: ['.swift'],
    languageIds: { '.swift': 'swift' },
    rootPatterns: ['Package.swift'],
  },
  {
    id: 'zls',
    name: 'ZLS',
    command: 'zls',
    args: [],
    extensions: ['.zig'],
    languageIds: { '.zig': 'zig' },
    rootPatterns: ['build.zig'],
  },
  {
    id: 'omnisharp',
    name: 'OmniSharp',
    command: 'omnisharp',
    args: ['-lsp'],
    extensions: ['.cs'],
    languageIds: { '.cs': 'csharp' },
    rootPatterns: ['.sln', '.csproj'],
  },
];

export function normalizeExtension(ext: string): string {
  const trimmed = String(ext).trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

function isExecutableFile(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) return false;
    if (process.platform === 'win32') return true;
    return (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/**
 * Resolves a server command to an absolute executable path. Absolute/relative commands are
 * used directly; bare command names are looked up on PATH, then in the workspace and
 * application `node_modules/.bin` folders so locally installed servers work out of the box.
 */
export function resolveExecutable(
  command: string,
  workspaceRoot?: string
): string | null {
  if (!command) return null;

  if (command.includes('/') || command.includes('\\')) {
    const candidate = path.isAbsolute(command)
      ? command
      : path.resolve(workspaceRoot ?? process.cwd(), command);
    return isExecutableFile(candidate) ? candidate : null;
  }

  const pathDirs = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean);
  const localBinDirs = [
    workspaceRoot ? path.join(workspaceRoot, 'node_modules', '.bin') : null,
    path.join(process.cwd(), 'node_modules', '.bin'),
  ].filter((dir): dir is string => Boolean(dir));

  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').filter(Boolean)
      : [''];

  for (const dir of [...localBinDirs, ...pathDirs]) {
    for (const ext of extensions) {
      const candidate = path.join(dir, command + ext);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

function coerceServerConfig(raw: any, index: number): LspServerConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const command = typeof raw.command === 'string' ? raw.command.trim() : '';
  const extensions = Array.isArray(raw.extensions)
    ? raw.extensions.map(normalizeExtension).filter(Boolean)
    : [];
  if (!command || extensions.length === 0) return null;

  return {
    id:
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : `custom-${index + 1}`,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    command,
    args: Array.isArray(raw.args) ? raw.args.map(String) : undefined,
    extensions,
    languageIds:
      raw.languageIds && typeof raw.languageIds === 'object'
        ? Object.fromEntries(
            Object.entries(raw.languageIds).map(([key, value]) => [
              normalizeExtension(key),
              String(value),
            ])
          )
        : undefined,
    defaultLanguageId:
      typeof raw.defaultLanguageId === 'string' ? raw.defaultLanguageId : undefined,
    env:
      raw.env && typeof raw.env === 'object'
        ? Object.fromEntries(Object.entries(raw.env).map(([key, value]) => [key, String(value)]))
        : undefined,
    initializationOptions:
      raw.initializationOptions && typeof raw.initializationOptions === 'object'
        ? raw.initializationOptions
        : undefined,
    rootPatterns: Array.isArray(raw.rootPatterns)
      ? raw.rootPatterns.map(String)
      : undefined,
    requestTimeoutMs:
      typeof raw.requestTimeoutMs === 'number' && raw.requestTimeoutMs > 0
        ? raw.requestTimeoutMs
        : undefined,
    disabled: raw.disabled === true,
  };
}

function parseServerConfigJson(text: string): LspServerConfig[] {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.servers)
      ? parsed.servers
      : parsed && typeof parsed === 'object'
        ? Object.entries(parsed).map(([id, value]) =>
            value && typeof value === 'object' ? { id, ...(value as object) } : null
          )
        : [];

  return entries
    .map((entry: any, index: number) => coerceServerConfig(entry, index))
    .filter((entry: LspServerConfig | null): entry is LspServerConfig => entry !== null);
}

function readConfigFile(filePath: string): LspServerConfig[] {
  try {
    return parseServerConfigJson(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Loads user-supplied server definitions. Sources, in priority order:
 * 1. `MYTHGRAM_LSP_SERVERS` (JSON array, `{ "servers": [...] }`, or id -> config object)
 * 2. `MYTHGRAM_LSP_CONFIG` file path
 * 3. `<workspace>/.mythgram/lsp.json`
 * 4. `<cwd>/.mythgram/lsp.json`
 */
export function loadConfiguredServers(workspaceRoot: string): LspServerConfig[] {
  const configured: LspServerConfig[] = [];

  const envJson = process.env.MYTHGRAM_LSP_SERVERS;
  if (envJson && envJson.trim()) {
    configured.push(...parseServerConfigJson(envJson));
  }

  const configPaths = [
    process.env.MYTHGRAM_LSP_CONFIG,
    path.join(workspaceRoot, '.mythgram', 'lsp.json'),
    path.join(process.cwd(), '.mythgram', 'lsp.json'),
  ].filter((p): p is string => Boolean(p));

  const seen = new Set<string>();
  for (const configPath of configPaths) {
    const resolved = path.resolve(configPath);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    configured.push(...readConfigFile(resolved));
  }

  return configured;
}

/**
 * Returns the server definitions that are both configured/installed for this workspace.
 * User definitions take priority over built-ins for overlapping extensions.
 */
export function loadServerConfigs(workspaceRoot: string): ResolvedLspServerConfig[] {
  const candidates = [...loadConfiguredServers(workspaceRoot), ...BUILTIN_LSP_SERVERS];
  const claimedExtensions = new Set<string>();
  const result: ResolvedLspServerConfig[] = [];

  for (const config of candidates) {
    if (config.disabled) continue;

    const executable = resolveExecutable(config.command, workspaceRoot);
    if (!executable) continue;

    const extensions = config.extensions
      .map(normalizeExtension)
      .filter((ext) => ext && !claimedExtensions.has(ext));
    if (extensions.length === 0) continue;

    for (const ext of extensions) claimedExtensions.add(ext);

    result.push({
      ...config,
      command: executable,
      name: config.name ?? config.id,
      extensions,
    });
  }

  return result;
}

export function availableExtensions(configs: ResolvedLspServerConfig[]): string[] {
  return configs.flatMap((config) => config.extensions).sort();
}
