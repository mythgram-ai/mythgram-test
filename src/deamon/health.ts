import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';

export interface HttpHealth {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
  durationMs: number;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function pidAlive(pid: number | null | undefined): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === 'EPERM';
  }
}

export function readPid(file: string): number | null {
  try {

    const raw = fs.readFileSync(file, 'utf-8').trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function httpHealth(url: string, timeoutMs = 6_000): Promise<HttpHealth> {
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Omit<HttpHealth, 'durationMs'>) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, durationMs: Date.now() - started });
    };
    try {
      const req = http.get(url, { timeout: timeoutMs }, (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => {
          if (body.length < 200_000) body += chunk;
        });
        res.on('end', () => {
          finish({
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 400,
            status: res.statusCode,
            body: body.slice(0, 500),
          });
        });
        res.on('error', (err) => finish({ ok: false, error: err.message }));
      });
      req.on('timeout', () => {
        req.destroy();
        finish({ ok: false, error: 'timeout' });
      });
      req.on('error', (err) => finish({ ok: false, error: err.message }));
    } catch (err: any) {
      finish({ ok: false, error: err?.message || String(err) });
    }
  });
}

export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    try {
      server.listen(port, host);
    } catch {
      resolve(false);
    }
  });
}

export async function waitForPortFree(
  port: number,
  timeoutMs = 10_000,
  host = '127.0.0.1'
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortFree(port, host)) return true;
    await sleep(250);
  }
  return isPortFree(port, host);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}


export function processCommand(pid: number): string {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ').trim();
  } catch {
    const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf-8',
    });
    return String(result.stdout || '').trim();
  }
}

export function looksLikeMythgramProcess(pid: number, projectRoot?: string): boolean {
  const command = processCommand(pid);
  if (!command) return false;
  if (projectRoot) return command.includes(projectRoot);
  return (
    command.includes('src/index.ts') ||
    command.includes('src/deamon/index.ts') ||
    command.includes('mythgram') ||
    command.includes('vite')
  );
}

function listeningInodesFromProc(port: number): Set<string> {
  const inodes = new Set<string>();
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 10) continue;
      const local = fields[1];
      const state = fields[3];
      const inode = fields[9];
      if (state !== '0A') continue;
      const portHex = local.split(':')[1];
      if (!portHex) continue;
      if (Number.parseInt(portHex, 16) === port && /^\d+$/.test(inode)) {
        inodes.add(inode);
      }
    }
  }
  return inodes;
}

function pidsFromInodes(inodes: Set<string>): number[] {
  const pids = new Set<number>();
  if (inodes.size === 0) return [];
  let entries: string[] = [];
  try {
    entries = fs.readdirSync('/proc');
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === process.pid) continue;
    let fds: string[] = [];
    try {
      fds = fs.readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        const target = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
        const match = /^socket:\[(\d+)\]$/.exec(target);
        if (match && inodes.has(match[1])) {
          pids.add(pid);
          break;
        }
      } catch {
        // permission denied or fd closed
      }
    }
  }
  return [...pids];
}

export function findListeningPids(port: number): number[] {
  const pids = new Set<number>(pidsFromInodes(listeningInodesFromProc(port)));
  if (pids.size) return [...pids];

  const lsof = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf-8',
  });
  if (lsof.status === 0) {
    for (const token of String(lsof.stdout || '').split(/\s+/)) {
      const pid = Number(token);
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
    if (pids.size) return [...pids];
  }
  const fuser = spawnSync('fuser', ['-n', 'tcp', String(port)], { encoding: 'utf-8' });
  for (const token of `${fuser.stdout || ''} ${fuser.stderr || ''}`.split(/\s+/)) {
    const pid = Number(token);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

export function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // not a process-group leader, or already gone
  }
  try {
    process.kill(pid, signal);
  } catch {
    // ignore
  }
}
