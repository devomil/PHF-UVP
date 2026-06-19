#!/usr/bin/env tsx
// check-cost-baseline.ts
//
// Dry-run verifier for scripts/provider-cost-baseline.json.
//
// Re-derives the baseline from the live provider registry (same logic as
// update-cost-baseline.ts) and compares it against the committed snapshot.
// Exits 1 if they differ, so CI and pre-commit can catch hand-edits that
// bypass `npm run update-cost-baseline`.
//
// Usage:
//   npm run lint:baseline
//
// Exit codes:
//   0  — committed baseline matches what the generator would produce
//   1  — mismatch detected (or unexpected error)

import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { VIDEO_PROVIDERS, IMAGE_PROVIDERS, SOUND_PROVIDERS } from '../shared/provider-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(__dirname, 'provider-cost-baseline.json');

const _require = createRequire(import.meta.url);

interface BaselineSection {
  [id: string]: Record<string, number>;
}

interface BaselineFile {
  _comment: string;
  _tolerancePct: number;
  video: BaselineSection;
  image: BaselineSection;
  sound: BaselineSection;
}

const committed = _require('./provider-cost-baseline.json') as BaselineFile;

// ── Re-derive sections from the live registry (mirrors update-cost-baseline) ──

const COST_FIELDS = ['costPerSecond', 'costPerImage', 'costPerTrack', 'costPerEffect'] as const;

function extractCosts(
  providers: Record<string, Record<string, unknown>>,
): BaselineSection {
  const out: BaselineSection = {};
  for (const [id, entry] of Object.entries(providers)) {
    const costs: Record<string, number> = {};
    for (const field of COST_FIELDS) {
      const v = entry[field];
      if (typeof v === 'number' && isFinite(v) && v > 0) {
        costs[field] = v;
      }
    }
    if (Object.keys(costs).length > 0) {
      out[id] = costs;
    }
  }
  return out;
}

const derived: BaselineFile = {
  _comment: committed._comment,
  _tolerancePct: committed._tolerancePct,
  video: extractCosts(VIDEO_PROVIDERS as unknown as Record<string, Record<string, unknown>>),
  image: extractCosts(IMAGE_PROVIDERS as unknown as Record<string, Record<string, unknown>>),
  sound: extractCosts(SOUND_PROVIDERS as unknown as Record<string, Record<string, unknown>>),
};

// ── Compare by serialising both to canonical JSON ─────────────────────────────

const committedJson = JSON.stringify(committed, null, 2) + '\n';
const derivedJson = JSON.stringify(derived, null, 2) + '\n';

if (committedJson === derivedJson) {
  console.log('lint:baseline: OK — provider-cost-baseline.json matches the live registry.');
  process.exit(0);
}

// ── Explain which entries differ ───────────────────────────────────────────────

console.error('lint:baseline: FAIL — provider-cost-baseline.json does not match the live registry.\n');
console.error('The file appears to have been edited by hand instead of via:');
console.error('  npm run update-cost-baseline\n');
console.error('Differences (committed → expected):');

type Section = 'video' | 'image' | 'sound';
const SECTIONS: Section[] = ['video', 'image', 'sound'];

let diffCount = 0;

for (const section of SECTIONS) {
  const committedSection = committed[section] as BaselineSection;
  const derivedSection = derived[section] as BaselineSection;
  const allIds = new Set([...Object.keys(committedSection), ...Object.keys(derivedSection)]);

  for (const id of [...allIds].sort()) {
    const cEntry = committedSection[id];
    const dEntry = derivedSection[id];

    if (!cEntry && dEntry) {
      for (const [field, value] of Object.entries(dEntry)) {
        console.error(`  + ${section}["${id}"].${field}  (missing from baseline, expected ${value})`);
        diffCount++;
      }
      continue;
    }

    if (cEntry && !dEntry) {
      for (const [field, value] of Object.entries(cEntry)) {
        console.error(`  - ${section}["${id}"].${field}  (hand-added ${value}, not in registry)`);
        diffCount++;
      }
      continue;
    }

    const allFields = new Set([...Object.keys(cEntry ?? {}), ...Object.keys(dEntry ?? {})]);
    for (const field of [...allFields].sort()) {
      const cv = cEntry?.[field];
      const dv = dEntry?.[field];
      if (cv === dv) continue;
      if (cv === undefined) {
        console.error(`  + ${section}["${id}"].${field}  (missing from baseline, expected ${dv})`);
      } else if (dv === undefined) {
        console.error(`  - ${section}["${id}"].${field}  (hand-added ${cv}, not in registry)`);
      } else {
        console.error(`  ~ ${section}["${id}"].${field}  committed=${cv}  expected=${dv}`);
      }
      diffCount++;
    }
  }
}

console.error(`\n${diffCount} discrepancy(ies) found.`);
console.error('\nTo fix: update shared/provider-config.ts, then run: npm run update-cost-baseline');
process.exit(1);
