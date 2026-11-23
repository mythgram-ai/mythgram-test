import { z } from 'zod';
import { spawn } from 'node:child_process';
import { MythgramTool } from '../types.js';

export const shallToolSchema = z
  .object({
    command: z
      .string()
      .describe(
        "The shell command to run, e.g. 'npm install', 'ls -la', 'node script.js'."
      ),
    session_name: z
      .string()
      .default('default')
      .describe(
        'Logical session/label for grouping related commands. For background commands (wait_for_output=false).'
      ),
    timeout: z
      .number()
      .int()
      .min(1)
      .max(180)
      .default(60)
      .describe('The timeout for the command in seconds. Maximum is 180 seconds.'),
    wait_for_output: z
      .boolean()
      .default(true)
      .describe(
        'If true (default) wait for the command to finish and return stdout/stderr/exit_code. If false, start the command in the background and return immediately with the PID.'
      ),
  })
  .strict();

// Persistent shell cwd state per session_name
const sessionCwds = new Map<string, string>();

export const shallTool: MythgramTool<typeof shallToolSchema> = {
  name: 'shall_tool',
  description:
    "Executes a bash command in a persistent shell session\n\nUsage notes:\n- To run multiple commands, join them with ';' or '&&'. Do not use newlines\n- For long-running tasks (e.g., deployments), set `wait_for_output` to False, You can specify an optional timeout in seconds (up to 180 seconds). If not specified, commands will timeout after 60 seconds",
  schema: shallToolSchema,
  execute: async (args, context) => {
    const sessionKey = `${context.sessionId}:${args.session_name || 'default'}`;
    const currentCwd = sessionCwds.get(sessionKey) || context.workspace;
    const timeoutSec = Math.min(180, Math.max(1, args.timeout ?? 60));
    const timeoutMs = timeoutSec * 1000;

    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/bash';
    const wrappedCommand = isWindows
      ? args.command
      : `${args.command}; __EC=$?; pwd > /tmp/.mythgram_pwd_${process.pid}_${Date.now()} 2>/dev/null; exit $__EC`;

    if (!args.wait_for_output) {
      const child = spawn(shell, isWindows ? ['/c', args.command] : ['-c', args.command], {
        cwd: currentCwd,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.unref();
      return {
        command: args.command,
        session_name: args.session_name,
        cwd: currentCwd,
        background: true,
        pid: child.pid,
        status: 'started_in_background',
      };
    }

    const pwdMarker = `___MYTHGRAM_PWD_MARKER___`;
    const fullCmd = isWindows
      ? args.command
      : `${args.command}\n__MYTH_EC=$?\necho "${pwdMarker}$(pwd)"\nexit $__MYTH_EC`;

    return await new Promise((resolve) => {
      const child = spawn(shell, isWindows ? ['/c', fullCmd] : ['-c', fullCmd], {
        cwd: currentCwd,
        env: { ...process.env, FORCE_COLOR: '1' },
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGTERM');
          setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore
            }
          }, 1500);
        } catch {
          // ignore
        }
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf-8');
        if (stdout.length > 500_000) {
          stdout = stdout.slice(0, 500_000) + '\n...[output truncated]';
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf-8');
        if (stderr.length > 500_000) {
          stderr = stderr.slice(0, 500_000) + '\n...[stderr truncated]';
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        let cleanStdout = stdout;
        const markerIdx = cleanStdout.lastIndexOf(pwdMarker);
        if (markerIdx !== -1) {
          const newPwd = cleanStdout.slice(markerIdx + pwdMarker.length).trim();
          if (newPwd) {
            sessionCwds.set(sessionKey, newPwd);
          }
          cleanStdout = cleanStdout.slice(0, markerIdx).replace(/\r?\n$/, '');
        }

        resolve({
          command: args.command,
          session_name: args.session_name,
          cwd: sessionCwds.get(sessionKey) || currentCwd,
          stdout: cleanStdout,
          stderr: timedOut
            ? `${stderr}\nCommand timed out after ${timeoutSec} seconds.`
            : stderr,
          exit_code: timedOut ? 124 : (code ?? 0),
          timed_out: timedOut,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          command: args.command,
          session_name: args.session_name,
          cwd: currentCwd,
          stdout,
          stderr: err.message,
          exit_code: 1,
          timed_out: false,
        });
      });
    });
  },
};
