#!/usr/bin/env tsx
// Lint check: every catalog entry with showInDropdown:true must have a
// matching capability entry in the corresponding providers registry.
//
// VIDEO_PROVIDER_CATALOG  → VIDEO_PROVIDERS        (shared/provider-config.ts)
// IMAGE_PROVIDER_CATALOG  → IMAGE_PROVIDERS        (shared/provider-config.ts)
// VIDEO_PROVIDER_CATALOG  → AI_VIDEO_PROVIDERS     (server/config/ai-video-providers-static.ts)
// VIDEO_PROVIDER_CATALOG  → server VIDEO_PROVIDERS (server/config/video-providers.ts, derived from AI_VIDEO_PROVIDERS)
//
// Run via:  npm run lint:providers
// Exit 0 = all clear, exit 1 = gaps detected, exit 2 = usage error.

import { VIDEO_PROVIDER_CATALOG, IMAGE_PROVIDER_CATALOG } from '../shared/provider-catalog.js';
import { VIDEO_PROVIDERS, IMAGE_PROVIDERS } from '../shared/provider-config.js';
import { AI_VIDEO_PROVIDERS } from '../server/config/ai-video-providers-static.js';

interface Gap {
  catalog: string;
  registry: string;
  id: string;
}

const gaps: Gap[] = [];

// ── shared/provider-config.ts checks ─────────────────────────────────────────

for (const entry of VIDEO_PROVIDER_CATALOG) {
  if (entry.showInDropdown === true && !(entry.id in VIDEO_PROVIDERS)) {
    gaps.push({ catalog: 'VIDEO_PROVIDER_CATALOG', registry: 'shared/VIDEO_PROVIDERS', id: entry.id });
  }
}

for (const entry of IMAGE_PROVIDER_CATALOG) {
  if (entry.showInDropdown === true && !(entry.id in IMAGE_PROVIDERS)) {
    gaps.push({ catalog: 'IMAGE_PROVIDER_CATALOG', registry: 'shared/IMAGE_PROVIDERS', id: entry.id });
  }
}

// ── server-side registry checks ───────────────────────────────────────────────
// AI_VIDEO_PROVIDERS is the canonical source for both:
//   server/config/ai-video-providers.ts  (the config map itself)
//   server/config/video-providers.ts     (derived — buildVideoProviders() iterates AI_VIDEO_PROVIDERS)
// A showInDropdown provider missing from AI_VIDEO_PROVIDERS will fail silently at generation time.

for (const entry of VIDEO_PROVIDER_CATALOG) {
  if (entry.showInDropdown === true && !(entry.id in AI_VIDEO_PROVIDERS)) {
    gaps.push({ catalog: 'VIDEO_PROVIDER_CATALOG', registry: 'server/AI_VIDEO_PROVIDERS', id: entry.id });
  }
}

// ── report ────────────────────────────────────────────────────────────────────

if (gaps.length === 0) {
  console.log('check-provider-catalog-sync: OK — all showInDropdown catalog entries have a matching capability entry.');
  process.exit(0);
}

console.error('check-provider-catalog-sync: FAIL — the following catalog entries have showInDropdown:true');
console.error('but are missing from their capability registry.');
console.error('Add the missing entries or remove showInDropdown:true from the catalog.\n');

// Group by registry for clearer output
const byRegistry = new Map<string, Gap[]>();
for (const gap of gaps) {
  const list = byRegistry.get(gap.registry) ?? [];
  list.push(gap);
  byRegistry.set(gap.registry, list);
}

for (const [registry, registryGaps] of byRegistry) {
  console.error(`  Missing from ${registry}:`);
  for (const { catalog, id } of registryGaps) {
    console.error(`    ${catalog}["${id}"]`);
  }
  console.error('');
}

console.error(`${gaps.length} gap(s) found.`);
process.exit(1);
