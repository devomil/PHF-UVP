#!/usr/bin/env tsx
// Watch mode for provider catalog ↔ registry sync.
//
// Watches shared/provider-catalog.ts and shared/provider-config.ts for
// changes and re-runs check-provider-catalog-sync.ts immediately whenever
// either file is saved. Prints a timestamped pass/fail banner to the console
// so drift is caught the moment it's introduced during development.
//
// Run via:  npm run watch:providers
//
// The watcher stays alive until killed (Ctrl-C). A debounce of 150 ms
// prevents double-fires when editors write the file in two steps.

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '..');

const WATCHED_FILES = [
  resolve(root, 'shared/provider-catalog.ts'),
  resolve(root, 'shared/provider-config.ts'),
];

const CHECK_SCRIPT = resolve(__dirname, 'check-provider-catalog-sync.ts');

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

function runCheck(changedFile?: string): void {
  if (running) return;
  running = true;

  const label = changedFile
    ? relative(root, changedFile)
    : 'initial run';

  console.log(`\n[${timestamp()}] change detected in ${label} — running sync check…`);

  const child = spawn('npx', ['tsx', CHECK_SCRIPT], {
    stdio: 'inherit',
    cwd: root,
    shell: true,
  });

  child.on('close', code => {
    running = false;
    if (code === 0) {
      console.log(`[${timestamp()}] ✓ catalog in sync\n`);
    } else {
      console.error(`[${timestamp()}] ✗ sync check failed — fix the gaps above before committing\n`);
    }
  });
}

function scheduleCheck(filename: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runCheck(filename);
  }, 150);
}

for (const file of WATCHED_FILES) {
  watch(file, { persistent: true }, (_event, _name) => {
    scheduleCheck(file);
  });
}

console.log('watch:providers — watching for catalog/registry drift:');
for (const file of WATCHED_FILES) {
  console.log(`  ${relative(root, file)}`);
}
console.log('Press Ctrl-C to stop.\n');

runCheck();
