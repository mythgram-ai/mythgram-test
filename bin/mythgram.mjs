#!/usr/bin/env node
// Launches the TypeScript CLI through tsx so `npx --yes mythgram` works without a build step.
import { tsImport } from 'tsx/esm/api';

console.log = (...args) => console.error(...args);
console.info = (...args) => console.error(...args);
console.debug = (...args) => console.error(...args);

await tsImport(new URL('../src/acp/cli.ts', import.meta.url).href, import.meta.url);
