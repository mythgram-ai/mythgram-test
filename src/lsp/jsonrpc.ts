import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

interface PendingRequest {
  method: string;
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  cleanup: () => void;
}

export interface LspConnectionOptions {
  cwd?: string;
  env?: Record<string, string>;
  onNotification?: (method: string, params: any) => void;
  onServerRequest?: (method: string, params: any) => any;
}

const MAX_STDERR_CHARS = 8_000;

/**
 * JSON-RPC 2.0 connection to a language server over stdio using the LSP
 * `Content-Length` framing. Handles concurrent requests, server notifications,
 * server-initiated requests, timeouts, cancellation and process failures.
 */
export class LspConnection {
  private readonly proc: ChildProcessWithoutNullStreams;
  private buffer: Buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private stderr = '';
  private closed = false;

  constructor(
    command: string,
    args: string[],
    private readonly options: LspConnectionOptions = {}
  ) {
    this.proc = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams;

    this.proc.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    this.proc.stderr.on('data', (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString('utf8')).slice(-MAX_STDERR_CHARS);
    });
    this.proc.on('error', (err) => {
      this.failAll(new Error(`Failed to run LSP server "${command}": ${err.message}`));
    });
    this.proc.on('exit', (code, signal) => {
      const detail = this.stderr.trim();
      this.failAll(
        new Error(
          `LSP server exited (code ${code ?? 'null'}${
            signal ? `, signal ${signal}` : ''
          })${detail ? `: ${detail}` : ''}`
        )
      );
    });
    this.proc.stdin.on('error', () => {
      // EPIPE is reported through the process exit handler with a better message.
    });

    // Language servers are long-lived helpers. Do not keep the host process alive
    // solely because a server is idle; the engine shuts servers down explicitly.
    this.proc.unref();
    (this.proc.stdin as any).unref?.();
    (this.proc.stdout as any).unref?.();
    (this.proc.stderr as any).unref?.();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get stderrOutput(): string {
    return this.stderr;
  }

  request<T = any>(
    method: string,
    params: any,
    timeoutMs: number = 20_000,
    signal?: AbortSignal
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error(`LSP connection is closed; cannot send "${method}".`));
    }
    if (signal?.aborted) {
      return Promise.reject(new Error(`LSP request "${method}" was aborted.`));
    }

    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const settle = (fn: () => void) => {
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        clearTimeout(entry.timer);
        entry.cleanup();
        fn();
      };

      const timer = setTimeout(() => {
        settle(() => {
          this.notify('$/cancelRequest', { id });
          reject(new Error(`LSP request "${method}" timed out after ${timeoutMs}ms.`));
        });
      }, timeoutMs);

      const onAbort = () => {
        settle(() => {
          this.notify('$/cancelRequest', { id });
          reject(new Error(`LSP request "${method}" was aborted.`));
        });
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      this.pending.set(id, {
        method,
        resolve: (value) => settle(() => resolve(value)),
        reject: (err) => settle(() => reject(err)),
        timer,
        cleanup: () => signal?.removeEventListener('abort', onAbort),
      });

      try {
        this.write({ jsonrpc: '2.0', id, method, params });
      } catch (err: any) {
        settle(() => reject(err));
      }
    });
  }

  notify(method: string, params: any): void {
    if (this.closed) return;
    try {
      this.write({ jsonrpc: '2.0', method, params });
    } catch {
      // A closed server pipe is surfaced by pending requests and the exit handler.
    }
  }

  async close(timeoutMs: number = 2_000): Promise<void> {
    if (this.closed) return;
    try {
      await this.request('shutdown', null, timeoutMs);
    } catch {
      // Servers often close the pipe right after shutdown; ignore failures here.
    }
    this.notify('exit', null);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          this.proc.kill('SIGKILL');
        } catch {
          // ignore
        }
        resolve();
      }, 1_000);
      this.proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.failAll(new Error('LSP connection closed.'));
  }

  /** Synchronous hard kill used during process shutdown. */
  kill(): void {
    this.closed = true;
    try {
      this.proc.kill('SIGKILL');
    } catch {
      // ignore
    }
  }

  private write(payload: Record<string, any>): void {
    if (this.closed) throw new Error('LSP connection is closed.');
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
    this.proc.stdin.write(Buffer.concat([header, body]));
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const headerText = this.buffer.subarray(0, headerEnd).toString('ascii');
      const match = /Content-Length:\s*(\d+)/i.exec(headerText);
      const bodyStart = headerEnd + 4;

      if (!match) {
        this.buffer = this.buffer.subarray(bodyStart);
        continue;
      }

      const contentLength = Number(match[1]);
      if (!Number.isFinite(contentLength) || contentLength < 0) {
        this.buffer = this.buffer.subarray(bodyStart);
        continue;
      }
      if (this.buffer.length < bodyStart + contentLength) return;

      const body = this.buffer.subarray(bodyStart, bodyStart + contentLength).toString('utf8');
      this.buffer = this.buffer.subarray(bodyStart + contentLength);

      let message: any;
      try {
        message = JSON.parse(body);
      } catch {
        continue;
      }
      this.handleMessage(message);
    }
  }

  private handleMessage(message: any): void {
    if (!message || typeof message !== 'object') return;

    const hasId = message.id !== undefined && message.id !== null;

    if (hasId && (message.result !== undefined || message.error !== undefined)) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      if (message.error) {
        const err = new Error(
          `LSP request "${entry.method}" failed: ${message.error.message ?? 'unknown error'}${
            message.error.code !== undefined ? ` (code ${message.error.code})` : ''
          }`
        );
        entry.reject(err);
      } else {
        entry.resolve(message.result);
      }
      return;
    }

    if (hasId && message.method) {
      void this.handleServerRequest(message);
      return;
    }

    if (message.method) {
      try {
        this.options.onNotification?.(message.method, message.params);
      } catch {
        // Notifications must never break the transport loop.
      }
    }
  }

  private async handleServerRequest(message: any): Promise<void> {
    let result: any = null;
    let error: { code: number; message: string } | undefined;

    try {
      if (this.options.onServerRequest) {
        result = await this.options.onServerRequest(message.method, message.params);
      }
    } catch (err: any) {
      error = { code: -32603, message: err?.message ?? String(err) };
    }

    if (this.closed) return;
    try {
      this.write(
        error
          ? { jsonrpc: '2.0', id: message.id, error }
          : { jsonrpc: '2.0', id: message.id, result }
      );
    } catch {
      // ignore
    }
  }

  private failAll(err: Error): void {
    this.closed = true;
    for (const entry of Array.from(this.pending.values())) {
      entry.reject(err);
    }
    this.pending.clear();
  }
}
