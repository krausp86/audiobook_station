#!/usr/bin/env node
//
// Startet vitest unter Electrons Node statt unter dem System-Node.
//
// Grund: `postinstall` baut better-sqlite3 via electron-builder gegen Electrons
// ABI (NODE_MODULE_VERSION 140). Das System-Node hier ist v20 (ABI 115). Jeder
// Test, der die DB anfasst, scheitert deshalb beim Laden des nativen Moduls:
//
//   The module '.../better_sqlite3.node' was compiled against a different
//   Node.js version using NODE_MODULE_VERSION 140. This version of Node.js
//   requires NODE_MODULE_VERSION 115.
//
// Electron bringt genau die passende Node-Runtime mit. Mit ELECTRON_RUN_AS_NODE=1
// verhält sich das Electron-Binary wie ein normales Node — kein Fenster, kein
// Chromium, aber die richtige ABI. Damit braucht es weder einen zweiten Build
// von better-sqlite3 noch Mocks für die DB-Schicht.
//
// Siehe DEV-01 in tasks/known-issues.md.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

const electronBin =
  process.platform === 'darwin'
    ? join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : join(APP_DIR, 'node_modules/electron/dist/electron');

const vitestEntry = join(APP_DIR, 'node_modules/vitest/vitest.mjs');

for (const [label, path] of [
  ['Electron-Binary', electronBin],
  ['vitest', vitestEntry],
]) {
  if (!existsSync(path)) {
    console.error(`FEHLER: ${label} nicht gefunden: ${path}`);
    console.error('        Fehlt `npm install`?');
    process.exit(1);
  }
}

const child = spawn(electronBin, [vitestEntry, ...process.argv.slice(2)], {
  cwd: APP_DIR,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
