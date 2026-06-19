#!/usr/bin/env tsx
// Watch mode for provider catalog ↔ registry sync.
//
// Watches provider files for changes and re-runs findCatalogSyncGaps()
// immediately whenever any watched file is saved. Prints a timestamped
// pass/fail banner with a diff of new vs. resolved gaps so drift is caught
// the moment it is introduced during development.
//
// Run via:  npm run watch:providers
//
// The watcher stays alive until killed (Ctrl-C). A debounce of 150 ms
// prevents double-fires when editors write the file in two steps.

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Gap } from './provider-catalog-sync-core.js';

if (process.env.NODE_ENV === 'production' || process.env.CI === 'true' || process.env.CI === '1') {
  console.log('watch:providers — skipped in CI/production environment');
  process.exit(0);
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '..');

const WATCHED_FILES = [
  resolve(root, 'shared/provider-catalog.ts'),
  resolve(root, 'shared/provider-config.ts'),
  resolve(root, 'server/config/ai-video-providers-static.ts'),
  resolve(root, 'server/config/image-providers.ts'),
];

const JSON_CHECK_SCRIPT = resolve(__dirname, 'provider-catalog-sync-check-json.ts');

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let previousGaps: Gap[] | null = null;

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

function gapKey(g: Gap): string {
  return `${g.catalog}|${g.registry}|${g.id}|${g.direction}`;
}

function runCheck(changedFile?: string): void {
  if (running) return;
  running = true;

  const label = changedFile ? relative(root, changedFile) : 'initial run';
  console.log(`\n[${timestamp()}] ${changedFile ? `change in ${label}` : label} — checking sync…`);

  let rawOutput = '';

  const child = spawn('npx', ['tsx', JSON_CHECK_SCRIPT], {
    stdio: ['ignore', 'pipe', 'inherit'],
    cwd: root,
    shell: true,
  });

  child.stdout.on('data', (chunk: Buffer) => {
    rawOutput += chunk.toString();
  });

  child.on('close', code => {
    running = false;

    if (code !== 0) {
      console.error(`[${timestamp()}] ✗ check script exited with code ${code} — see stderr above\n`);
      return;
    }

    let currentGaps: Gap[];
    try {
      currentGaps = JSON.parse(rawOutput.trim()) as Gap[];
    } catch {
      console.error(`[${timestamp()}] ✗ failed to parse gap output — unexpected script output:\n${rawOutput}\n`);
      return;
    }

    if (previousGaps === null) {
      // First run — show baseline
      if (currentGaps.length === 0) {
        console.log(`[${timestamp()}] ✓ catalog in sync — no gaps detected\n`);
      } else {
        console.error(`[${timestamp()}] ✗ ${currentGaps.length} gap(s) on startup:\n`);
        printGaps(currentGaps);
      }
    } else {
      // Subsequent runs — show diff
      const prevKeys = new Set(previousGaps.map(gapKey));
      const currKeys = new Set(currentGaps.map(gapKey));

      const newGaps = currentGaps.filter(g => !prevKeys.has(gapKey(g)));
      const resolvedGaps = previousGaps.filter(g => !currKeys.has(gapKey(g)));
      const unchanged = currentGaps.filter(g => prevKeys.has(gapKey(g)));

      if (newGaps.length === 0 && resolvedGaps.length === 0) {
        if (currentGaps.length === 0) {
          console.log(`[${timestamp()}] ✓ still in sync — no change\n`);
        } else {
          console.log(`[${timestamp()}] ✓ no change — ${unchanged.length} pre-existing gap(s) unchanged\n`);
        }
      } else {
        if (newGaps.length > 0) {
          console.error(`[${timestamp()}] ✗ ${newGaps.length} NEW gap(s) introduced:\n`);
          printGaps(newGaps, '  🔴 NEW     ');
        }
        if (resolvedGaps.length > 0) {
          console.log(`[${timestamp()}] ✓ ${resolvedGaps.length} gap(s) resolved:\n`);
          printGaps(resolvedGaps, '  ✅ FIXED   ');
        }
        if (unchanged.length > 0) {
          console.log(`  ⚪ unchanged: ${unchanged.length} pre-existing gap(s)\n`);
        }
      }
    }

    previousGaps = currentGaps;
  });
}

function printGaps(gaps: Gap[], prefix = '  '): void {
  for (const { catalog, registry, id, direction, reason } of gaps) {
    const arrow = direction === 'catalog→registry'
      ? `${catalog}["${id}"]  →  missing from  ${registry}`
      : `${registry}["${id}"]  →  missing from  ${catalog}`;
    console.log(`${prefix}${arrow}`);
    console.log(`${' '.repeat(prefix.length)}reason: ${reason}`);
  }
  console.log('');
}

function scheduleCheck(filename: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runCheck(filename);
  }, 150);
}

for (const file of WATCHED_FILES) {
  watch(file, { persistent: true }, () => {
    scheduleCheck(file);
  });
}

console.log('watch:providers — watching for catalog/registry drift:');
for (const file of WATCHED_FILES) {
  console.log(`  ${relative(root, file)}`);
}
console.log('Press Ctrl-C to stop.\n');

runCheck();
