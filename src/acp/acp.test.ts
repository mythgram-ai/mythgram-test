import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  client as createClientApp,
  ndJsonStream,
  type ClientConnection,
  type Stream,
} from '@agentclientprotocol/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CLI_ENTRY = path.join(__dirname, 'cli.ts');

function childToStream(child: ChildProcessWithoutNullStreams): Stream {
  const output = new WritableStream<Uint8Array>({
    write(chunk) {
      if (!child.stdin.destroyed) child.stdin.write(Buffer.from(chunk));
    },
  });

  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      child.stdout.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      child.stdout.on('end', () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return ndJsonStream(output, input);
}

interface AcpProcess {
  child: ChildProcessWithoutNullStreams;
  connection: ClientConnection;
  updates: Array<{ sessionId: string; update: any }>;
  stderr: () => string;
}

function spawnAcpServer(tmpDir: string): AcpProcess {
  const child = spawn(
    process.execPath,
    ['--import', import.meta.resolve('tsx'), CLI_ENTRY],
    {
      cwd: tmpDir,
      env: { ...process.env, MYTHGRAM_START_DIR: tmpDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const updates: Array<{ sessionId: string; update: any }> = [];
  const app = createClientApp({ name: 'mythgram-acp-test' }).onNotification(
    'session/update',
    ({ params }) => {
      updates.push(params);
    }
  );

  return {
    child,
    connection: app.connect(childToStream(child)),
    updates,
    stderr: () => stderr,
  };
}

async function stopAcpServer(proc: AcpProcess): Promise<void> {
  proc.connection.close();
  proc.child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    if (proc.child.exitCode !== null) return resolve();
    proc.child.once('exit', () => resolve());
    setTimeout(resolve, 3000);
  });
}

export async function testAcpServer(): Promise<void> {
  console.log('Running ACP agent protocol tests...');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram_acp_'));
  const proc = spawnAcpServer(tmpDir);
  const { connection, updates } = proc;

  try {
    const init = await connection.agent.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: 'mythgram-acp-test', version: '1.0.0' },
    });
    assert.equal(init.protocolVersion, 1);
    assert.equal(init.agentInfo?.name, 'mythgram');
    assert.equal(init.agentCapabilities?.loadSession, true);
    assert.equal(init.agentCapabilities?.promptCapabilities?.image, true);

    const created = await connection.agent.request('session/new', {
      cwd: tmpDir,
      mcpServers: [],
    });
    assert.equal(typeof created.sessionId, 'string');
    assert.equal(created.sessionId.length, 30);
    assert.equal(created.modes?.currentModeId, 'default');
    assert.ok((created.modes?.availableModes.length ?? 0) >= 1);

    const list = await connection.agent.request('session/list', {});
    assert.ok(list.sessions.some((session) => session.sessionId === created.sessionId));
    const listed = list.sessions.find((session) => session.sessionId === created.sessionId);
    assert.equal(listed?.cwd, tmpDir);

    await connection.agent.request('session/load', {
      sessionId: created.sessionId,
      cwd: tmpDir,
      mcpServers: [],
    });

    // Unknown sessions must surface a JSON-RPC error instead of hanging.
    await assert.rejects(
      connection.agent.request('session/load', {
        sessionId: 'does-not-exist',
        cwd: tmpDir,
        mcpServers: [],
      })
    );

    await connection.agent.request('session/set_mode', {
      sessionId: created.sessionId,
      modeId: 'default',
    });

    assert.ok(
      updates.some((entry) => entry.update?.sessionUpdate === 'current_mode_update'),
      'session/set_mode should notify the client about the new mode'
    );
  } catch (error) {
    console.error('ACP test stderr:\n', proc.stderr());
    throw error;
  } finally {
    await stopAcpServer(proc);
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  console.log('ACP agent protocol tests passed!');
}

export async function testAcpPromptTurn(): Promise<void> {
  console.log('Running ACP prompt turn test...');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram_acp_prompt_'));
  const outputFile = path.join(tmpDir, 'acp_e2e.txt');
  let calls = 0;

  // Minimal OpenAI-compatible provider: first call requests file_write, second answers.
  const mockProvider = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      calls += 1;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (calls === 1) {
        const args = JSON.stringify({ file_path: outputFile, content: 'written by acp' });
        const toolCall = {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'file_write', arguments: args },
        };
        send({ choices: [{ delta: { tool_calls: [toolCall] } }] });
      } else {
        send({ choices: [{ delta: { content: 'All done.' } }] });
      }
      res.end();
    });
  });
  await new Promise<void>((resolve) => mockProvider.listen(0, '127.0.0.1', resolve));
  const port = (mockProvider.address() as { port: number }).port;

  const seedScript = `import('./src/db/index.js').then(({ db }) => {
    db.saveProviderConfig({
      provider_id: 'mock_llm',
      name: 'Mock LLM',
      base_url: 'http://127.0.0.1:${port}/v1',
      api_key: 'test',
      selected_model: 'mock-model',
      is_custom: 1
    });
    db.setSetting('active_provider', 'mock_llm');
    db.setSetting('active_model', 'mock-model');
  })`;
  await new Promise<void>((resolve, reject) => {
    const seed = spawn(
      process.execPath,
      ['--import', import.meta.resolve('tsx'), '-e', seedScript],
      {
        cwd: PROJECT_ROOT,
        env: { ...process.env, MYTHGRAM_START_DIR: tmpDir },
        stdio: ['ignore', 'ignore', 'pipe'],
      }
    );
    let seedError = '';
    seed.stderr.on('data', (chunk: Buffer) => {
      seedError += chunk.toString();
    });
    seed.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Failed to seed provider config: ${seedError}`));
    });
  });

  const proc = spawnAcpServer(tmpDir);

  try {
    await proc.connection.agent.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: {},
    });
    const created = await proc.connection.agent.request('session/new', {
      cwd: tmpDir,
      mcpServers: [],
    });
    const result = await proc.connection.agent.request('session/prompt', {
      sessionId: created.sessionId,
      prompt: [{ type: 'text', text: 'Create the file.' }],
    });

    assert.equal(result.stopReason, 'end_turn');
    assert.equal(await fs.readFile(outputFile, 'utf-8'), 'written by acp');

    const kinds = proc.updates.map((entry) => entry.update?.sessionUpdate);
    assert.ok(kinds.includes('tool_call'), 'expected a tool_call update');
    assert.ok(kinds.includes('tool_call_update'), 'expected a tool_call_update update');

    const text = proc.updates
      .filter((entry) => entry.update?.sessionUpdate === 'agent_message_chunk')
      .map((entry) => entry.update.content.text)
      .join('');
    assert.ok(text.includes('All done.'), 'expected assistant text from the provider');
  } catch (error) {
    console.error('ACP prompt test stderr:\n', proc.stderr());
    throw error;
  } finally {
    await stopAcpServer(proc);
    mockProvider.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  console.log('ACP prompt turn test passed!');
}
