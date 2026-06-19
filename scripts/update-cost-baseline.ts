#!/usr/bin/env tsx
// update-cost-baseline.ts
//
// Re-snapshots the live provider cost registry values into
// scripts/provider-cost-baseline.json so that lint:providers passes after an
// intentional cost change.
//
// Usage:
//   npm run update-cost-baseline
//
// The script prints a diff of every value that changed, was added, or was
// removed so you can review before committing.  Exit codes:
//   0  — file written (or already up-to-date)
//   1  — unexpected error

import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { VIDEO_PROVIDERS, IMAGE_PROVIDERS, SOUND_PROVIDERS } from '../shared/provider-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(__dirname, 'provider-cost-baseline.json');

const _require = createRequire(import.meta.url);

interface BaselineFile {
  _comment: string;
  _tolerancePct: number;
  video: Record<string, Record<string, number>>;
  image: Record<string, Record<string, number>>;
  sound: Record<string, Record<string, number>>;
}

const existing = _require('./provider-cost-baseline.json') as BaselineFile;

// ── Build new sections from the live registry ─────────────────────────────────

const COST_FIELDS = ['costPerSecond', 'costPerImage', 'costPerTrack', 'costPerEffect'] as const;

function extractCosts(
  providers: Record<string, Record<string, unknown>>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
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

const newVideo = extractCosts(VIDEO_PROVIDERS as unknown as Record<string, Record<string, unknown>>);
const newImage = extractCosts(IMAGE_PROVIDERS as unknown as Record<string, Record<string, unknown>>);
const newSound = extractCosts(SOUND_PROVIDERS as unknown as Record<string, Record<string, unknown>>);

// ── Diff helpers ──────────────────────────────────────────────────────────────

interface DiffLine {
  tag: 'changed' | 'added' | 'removed';
  section: string;
  id: string;
  field: string;
  before?: number;
  after?: number;
}

function diffSection(
  section: string,
  before: Record<string, Record<string, number>>,
  after: Record<string, Record<string, number>>,
): DiffLine[] {
  const lines: DiffLine[] = [];
  const allIds = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const id of [...allIds].sort()) {
    const bEntry = before[id];
    const aEntry = after[id];

    if (!bEntry) {
      // Entirely new provider
      for (const [field, value] of Object.entries(aEntry)) {
        lines.push({ tag: 'added', section, id, field, after: value });
      }
      continue;
    }

    if (!aEntry) {
      // Provider removed from registry (baseline entry becomes stale)
      for (const [field, value] of Object.entries(bEntry)) {
        lines.push({ tag: 'removed', section, id, field, before: value });
      }
      continue;
    }

    const allFields = new Set([...Object.keys(bEntry), ...Object.keys(aEntry)]);
    for (const field of [...allFields].sort()) {
      const bv = bEntry[field];
      const av = aEntry[field];
      if (bv === undefined && av !== undefined) {
        lines.push({ tag: 'added', section, id, field, after: av });
      } else if (bv !== undefined && av === undefined) {
        lines.push({ tag: 'removed', section, id, field, before: bv });
      } else if (bv !== av) {
        lines.push({ tag: 'changed', section, id, field, before: bv, after: av });
      }
    }
  }

  return lines;
}

const diffs: DiffLine[] = [
  ...diffSection('video', existing.video, newVideo),
  ...diffSection('image', existing.image, newImage),
  ...diffSection('sound', existing.sound, newSound),
];

// ── Print diff ────────────────────────────────────────────────────────────────

if (diffs.length === 0) {
  console.log('update-cost-baseline: No changes — baseline is already up-to-date.');
} else {
  console.log(`update-cost-baseline: ${diffs.length} change(s) detected:\n`);

  const PAD = 45;
  for (const d of diffs) {
    const key = `${d.section}["${d.id}"].${d.field}`.padEnd(PAD);
    if (d.tag === 'changed') {
      console.log(`  ~ ${key}  ${d.before} → ${d.after}`);
    } else if (d.tag === 'added') {
      console.log(`  + ${key}  (new) ${d.after}`);
    } else {
      console.log(`  - ${key}  (removed) ${d.before}`);
    }
  }
  console.log('');
}

// ── Write updated baseline ────────────────────────────────────────────────────

const updated: BaselineFile = {
  _comment: existing._comment,
  _tolerancePct: existing._tolerancePct,
  video: newVideo,
  image: newImage,
  sound: newSound,
};

writeFileSync(BASELINE_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf8');
console.log(`update-cost-baseline: Written → ${BASELINE_PATH}`);
