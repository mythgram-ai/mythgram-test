#!/usr/bin/env node
// Runs the TypeScript daemon CLI through tsx so no build step is required.
import { tsImport } from 'tsx/esm/api';

await tsImport(new URL('../src/deamon/index.ts', import.meta.url).href, import.meta.url);
