#!/usr/bin/env tsx
// Lint check: every catalog entry with showInDropdown:true must have a
// matching capability entry in the corresponding providers registry.
//
// VIDEO_PROVIDER_CATALOG  → VIDEO_PROVIDERS        (shared/provider-config.ts)
// IMAGE_PROVIDER_CATALOG  → IMAGE_PROVIDERS        (shared/provider-config.ts)
// VIDEO_PROVIDER_CATALOG  → AI_VIDEO_PROVIDERS     (server/config/ai-video-providers-static.ts)
// VIDEO_PROVIDER_CATALOG  → server VIDEO_PROVIDERS (server/config/video-providers.ts, derived from AI_VIDEO_PROVIDERS)
// VIDEO_PROVIDER_CATALOG  → PROVIDER_TEST_ID_MAP   (server/config/ai-video-providers-static.ts)
// IMAGE_PROVIDER_CATALOG  → server IMAGE_PROVIDERS (server/config/image-providers.ts)
//   Flags checked: showInDropdown, showInImageDropdown, showInI2IDropdown
//
// Run via:  npm run lint:providers
// Exit 0 = all clear, exit 1 = gaps detected, exit 2 = usage error.

import { VIDEO_PROVIDER_CATALOG, IMAGE_PROVIDER_CATALOG } from '../shared/provider-catalog.js';
import { VIDEO_PROVIDERS, IMAGE_PROVIDERS } from '../shared/provider-config.js';
import { AI_VIDEO_PROVIDERS, PROVIDER_TEST_ID_MAP } from '../server/config/ai-video-providers-static.js';
import { IMAGE_PROVIDERS as SERVER_IMAGE_PROVIDERS } from '../server/config/image-providers.js';

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

// PROVIDER_TEST_ID_MAP gates which providers the live tested-providers filter
// activates. A showInDropdown provider absent from this map will never be
// surfaced through the test-results path (it silently falls through or gets
// excluded). Every showInDropdown:true video catalog entry that also exists in
// AI_VIDEO_PROVIDERS must have a PROVIDER_TEST_ID_MAP entry.

for (const entry of VIDEO_PROVIDER_CATALOG) {
  if (entry.showInDropdown === true && entry.id in AI_VIDEO_PROVIDERS && !(entry.id in PROVIDER_TEST_ID_MAP)) {
    gaps.push({ catalog: 'VIDEO_PROVIDER_CATALOG', registry: 'server/PROVIDER_TEST_ID_MAP', id: entry.id });
  }
}

// SERVER_IMAGE_PROVIDERS (server/config/image-providers.ts) is the canonical
// map that routes image-generation requests to their API provider and model.
// Any catalog entry exposed in a UI dropdown (showInDropdown, showInImageDropdown,
// showInI2IDropdown) must have a matching entry here or generation will fall
// through to the 'flux' fallback silently.
//
// A single provider may carry multiple dropdown flags; we push at most one gap
// per (catalog, registry, id) triple to keep the output readable.

for (const entry of IMAGE_PROVIDER_CATALOG) {
  const isDropdownVisible =
    entry.showInDropdown === true ||
    entry.showInImageDropdown === true ||
    entry.showInI2IDropdown === true;
  if (isDropdownVisible && !(entry.id in SERVER_IMAGE_PROVIDERS)) {
    gaps.push({ catalog: 'IMAGE_PROVIDER_CATALOG', registry: 'server/IMAGE_PROVIDERS', id: entry.id });
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
