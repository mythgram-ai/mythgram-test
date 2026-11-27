import fs from 'node:fs';
import path from 'node:path';

type Level = 'debug' | 'info' | 'warn' | 'error';

export class DaemonLogger {
  constructor(
    private readonly file: string,
    private readonly maxBytes = 5 * 1024 * 1024,
    private readonly maxFiles = 5,
    private readonly echo = true
  ) {}

  private rotateIfNeeded(): void {
    try {
      const stat = fs.statSync(this.file);
      if (stat.size < this.maxBytes) return;
      this.rotate();
    } catch {
      // file does not exist yet
    }
  }

  rotate(): void {
    try {
      if (!fs.existsSync(this.file)) return;
      for (let index = this.maxFiles - 1; index >= 1; index--) {
        const from = `${this.file}.${index}`;
        const to = `${this.file}.${index + 1}`;
        if (fs.existsSync(from)) {
          try { fs.renameSync(from, to); } catch { /* ignore */ }
        }
      }
      fs.renameSync(this.file, `${this.file}.1`);
    } catch {
      // rotation is best effort; never take the daemon down for it
    }
  }

  log(level: Level, message: string, meta?: unknown): void {
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${
      meta === undefined ? '' : ` ${safeJson(meta)}`
    }\n`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      this.rotateIfNeeded();
      fs.appendFileSync(this.file, line, 'utf-8');
    } catch {
      // logging must never crash the daemon
    }
    if (this.echo) {
      const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      method(line.trimEnd());
    }
  }

  debug(message: string, meta?: unknown): void { this.log('debug', message, meta); }
  info(message: string, meta?: unknown): void { this.log('info', message, meta); }
  warn(message: string, meta?: unknown): void { this.log('warn', message, meta); }
  error(message: string, meta?: unknown): void { this.log('error', message, meta); }
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function rotateFile(file: string, maxBytes: number, maxFiles: number): void {
  try {
    if (!fs.existsSync(file)) return;
    const stat = fs.statSync(file);
    if (stat.size < maxBytes) return;
    for (let index = maxFiles - 1; index >= 1; index--) {
      const from = `${file}.${index}`;
      const to = `${file}.${index + 1}`;
      if (fs.existsSync(from)) {
        try { fs.renameSync(from, to); } catch { /* ignore */ }
      }
    }
    fs.renameSync(file, `${file}.1`);
  } catch {
    // ignore
  }
}

export function openChildLog(file: string): number {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return fs.openSync(file, 'a');
}

export function readLogTail(file: string, lines = 80): string[] {
  try {
    if (!fs.existsSync(file)) return [];
    const stat = fs.statSync(file);
    const maxRead = 2 * 1024 * 1024;
    const start = stat.size > maxRead ? stat.size - maxRead : 0;
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      const text = buffer.toString('utf-8');
      const parts = text.split(/\r?\n/);
      if (start > 0) parts.shift();
      return parts.filter(Boolean).slice(-lines);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}
