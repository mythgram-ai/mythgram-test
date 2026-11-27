/**
 * CLI entry for the published `mythgram` binary.
 *
 * `mythgram` with no arguments speaks ACP over stdio so editors can launch it
 * with `npx --yes mythgram`. `mythgram serve` starts the HTTP backend instead.
 */

export {};

// stdout is the ACP transport; every log line must go to stderr.
console.log = (...args: unknown[]) => console.error(...args);
console.info = (...args: unknown[]) => console.error(...args);
console.debug = (...args: unknown[]) => console.error(...args);

const command = process.argv[2];

if (!command || command === 'acp' || command === 'agent') {
  const { startAcpServer } = await import('./server.js');
  await startAcpServer();
} else if (command === 'serve' || command === 'web') {
  await import('../index.js');
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.error(
    [
      'Mythgram',
      '',
      'Usage:',
      '  mythgram          Start the ACP agent on stdio (for editors and ACP clients)',
      '  mythgram acp      Same as above',
      '  mythgram serve    Start the HTTP backend and WebUI API server',
    ].join('\n')
  );
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Run "mythgram help" for available commands.');
  process.exit(1);
}
