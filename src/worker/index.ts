import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface WorkspaceNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  size?: number;
  children?: WorkspaceNode[];
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.mythgram', '.next', 'dist']);

/**
 * Lists directories only (for the workspace folder picker) or full workspace tree (for the Files tab).
 */
export async function listWorkspaceTree(
  rootDir: string,
  options: { onlyDirectories?: boolean; maxDepth?: number } = {}
): Promise<WorkspaceNode[]> {
  const maxDepth = options.maxDepth ?? 3;
  const onlyDirectories = options.onlyDirectories ?? false;

  async function walk(currentPath: string, depth: number): Promise<WorkspaceNode[]> {
    if (depth > maxDepth) return [];
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const nodes: WorkspaceNode[] = [];
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        const children = depth < maxDepth ? await walk(fullPath, depth + 1) : [];
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children,
        });
      } else if (!onlyDirectories && entry.isFile()) {
        let size = 0;
        try {
          const st = await fs.stat(fullPath);
          size = st.size;
        } catch {
          // ignore
        }
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
          size,
        });
      }
    }

    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }

  return await walk(path.resolve(rootDir), 1);
}

/**
 * Interactive Terminal Worker using python3 pty (or bash fallback) so xterm.js gets a real pseudo-terminal
 * with full ANSI colors, prompts, tab completion, and interactive CLI support across macOS, Linux, and Windows.
 */
export class InteractiveTerminalSession {
  private proc: ChildProcess | null = null;
  private onDataCallback: (data: string) => void;
  private cwd: string;

  constructor(cwd: string, onData: (data: string) => void) {
    this.cwd = cwd || os.homedir();
    this.onDataCallback = onData;
    this.start();
  }

  private start() {
    const isWin = process.platform === 'win32';
    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3',
    };

    if (isWin) {
      this.proc = spawn('powershell.exe', ['-NoLogo'], {
        cwd: this.cwd,
        env,
      });
    } else {
      // Spawn an interactive PTY shell using python3 pty module if available, or script/bash fallback
      const pyScript = `import pty, os; os.environ['TERM']='xterm-256color'; pty.spawn(['/bin/bash', '-i'])`;
      this.proc = spawn('python3', ['-c', pyScript], {
        cwd: this.cwd,
        env,
      });

      this.proc.on('error', () => {
        this.proc = spawn('/bin/bash', ['-i'], {
          cwd: this.cwd,
          env,
        });
        this.attachListeners();
      });
    }

    this.attachListeners();
  }

  private attachListeners() {
    if (!this.proc) return;
    this.proc.stdout?.on('data', (chunk: Buffer) => {
      this.onDataCallback(chunk.toString('utf-8'));
    });
    this.proc.stderr?.on('data', (chunk: Buffer) => {
      this.onDataCallback(chunk.toString('utf-8'));
    });
    this.proc.on('close', (code) => {
      this.onDataCallback(`\r\n\x1b[90m[Terminal process exited with code ${code ?? 0}]\x1b[0m\r\n`);
    });
  }

  public write(input: string) {
    if (this.proc && this.proc.stdin && !this.proc.killed) {
      this.proc.stdin.write(input);
    }
  }

  public kill() {
    if (this.proc && !this.proc.killed) {
      try {
        this.proc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  }
}
