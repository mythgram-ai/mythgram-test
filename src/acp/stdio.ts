import { ndJsonStream, type Stream } from '@agentclientprotocol/sdk';

/**
 * Bridges ACP's Web Streams transport to the process stdio pipes.
 * stdout carries protocol messages only; all logging must go to stderr.
 */
export function createStdioStream(): Stream {
  const output = new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        process.stdout.write(Buffer.from(chunk), (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  });

  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      process.stdin.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      process.stdin.on('end', () => controller.close());
      process.stdin.on('error', (error) => controller.error(error));
    },
  });

  return ndJsonStream(output, input);
}
