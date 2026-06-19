#!/usr/bin/env tsx
// Lint check: provider catalog ↔ registry sync validation.
//
// Checks four directions:
//
//  1. CATALOG → REGISTRY (showInDropdown gap — shared registries)
//     Every catalog entry with showInDropdown / showInImageDropdown /
//     showInI2IDropdown / showInV2VDropdown set to true must have a matching
//     capability entry in the corresponding providers registry.
//
//  2. REGISTRY → CATALOG (orphan registry entry)
//     Every registry entry should have a matching entry in the catalog so the
//     catalog remains the authoritative UI surface for all known providers.
//
//  3. CATALOG → SERVER REGISTRY (showInDropdown gap — server AI_VIDEO_PROVIDERS)
//     A showInDropdown video provider missing from AI_VIDEO_PROVIDERS will fail
//     silently at generation time. Catches mismatches with the server-side
//     provider config.
//
//  4. CATALOG → PROVIDER_TEST_ID_MAP and SERVER_IMAGE_PROVIDERS
//     showInDropdown video providers must be in PROVIDER_TEST_ID_MAP;
//     dropdown-visible image providers must be in server/IMAGE_PROVIDERS.
//
// VIDEO_PROVIDER_CATALOG  ↔  VIDEO_PROVIDERS        (shared/provider-config.ts)
// IMAGE_PROVIDER_CATALOG  ↔  IMAGE_PROVIDERS        (shared/provider-config.ts)
// VIDEO_PROVIDER_CATALOG  →  AI_VIDEO_PROVIDERS     (server/config/ai-video-providers-static.ts)
// VIDEO_PROVIDER_CATALOG  →  PROVIDER_TEST_ID_MAP   (server/config/ai-video-providers-static.ts)
// IMAGE_PROVIDER_CATALOG  →  server IMAGE_PROVIDERS (server/config/image-providers.ts)
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
  direction: 'catalog→registry' | 'registry→catalog';
  reason: string;
}

const gaps: Gap[] = [];

// ── 1. CATALOG → REGISTRY (shared) ──────────────────────────────────────────
// Each flag that marks an entry as "visible in a dropdown" requires a
// corresponding registry entry with costPerSecond / bestFor / etc.

const VIDEO_DROPDOWN_FLAGS = [
  'showInDropdown',
  'showInV2VDropdown',
] as const;

const IMAGE_DROPDOWN_FLAGS = [
  'showInDropdown',
  'showInImageDropdown',
  'showInI2IDropdown',
] as const;

for (const entry of VIDEO_PROVIDER_CATALOG) {
  const isVisible = VIDEO_DROPDOWN_FLAGS.some(f => entry[f] === true);
  if (isVisible && !(entry.id in VIDEO_PROVIDERS)) {
    const flags = VIDEO_DROPDOWN_FLAGS.filter(f => entry[f] === true).join(', ');
    gaps.push({
      catalog: 'VIDEO_PROVIDER_CATALOG',
      registry: 'shared/VIDEO_PROVIDERS',
      id: entry.id,
      direction: 'catalog→registry',
      reason: `showInDropdown flag(s): ${flags}`,
    });
  }
}

for (const entry of IMAGE_PROVIDER_CATALOG) {
  const isVisible = IMAGE_DROPDOWN_FLAGS.some(f => entry[f] === true);
  if (isVisible && !(entry.id in IMAGE_PROVIDERS)) {
    const flags = IMAGE_DROPDOWN_FLAGS.filter(f => entry[f] === true).join(', ');
    gaps.push({
      catalog: 'IMAGE_PROVIDER_CATALOG',
      registry: 'shared/IMAGE_PROVIDERS',
      id: entry.id,
      direction: 'catalog→registry',
      reason: `showInDropdown flag(s): ${flags}`,
    });
  }
}

// ── 2. REGISTRY → CATALOG ───────────────────────────────────────────────────
// Every registry entry should have a catalog entry. A registry-only provider
// is reachable by the selector logic but invisible in the UI — almost always
// an oversight.

const videoCatalogIds = new Set(VIDEO_PROVIDER_CATALOG.map(e => e.id));
const imageCatalogIds = new Set(IMAGE_PROVIDER_CATALOG.map(e => e.id));

for (const id of Object.keys(VIDEO_PROVIDERS)) {
  if (!videoCatalogIds.has(id)) {
    gaps.push({
      catalog: 'VIDEO_PROVIDER_CATALOG',
      registry: 'shared/VIDEO_PROVIDERS',
      id,
      direction: 'registry→catalog',
      reason: 'present in registry but has no catalog entry',
    });
  }
}

for (const id of Object.keys(IMAGE_PROVIDERS)) {
  if (!imageCatalogIds.has(id)) {
    gaps.push({
      catalog: 'IMAGE_PROVIDER_CATALOG',
      registry: 'shared/IMAGE_PROVIDERS',
      id,
      direction: 'registry→catalog',
      reason: 'present in registry but has no catalog entry',
    });
  }
}

// ── 3. CATALOG → SERVER REGISTRY (AI_VIDEO_PROVIDERS) ───────────────────────
// AI_VIDEO_PROVIDERS is the canonical source for:
//   server/config/ai-video-providers.ts  (the config map itself)
//   server/config/video-providers.ts     (derived — buildVideoProviders() iterates AI_VIDEO_PROVIDERS)
// A showInDropdown provider missing from AI_VIDEO_PROVIDERS will fail silently
// at generation time.

for (const entry of VIDEO_PROVIDER_CATALOG) {
  if (entry.showInDropdown === true && !(entry.id in AI_VIDEO_PROVIDERS)) {
    gaps.push({
      catalog: 'VIDEO_PROVIDER_CATALOG',
      registry: 'server/AI_VIDEO_PROVIDERS',
      id: entry.id,
      direction: 'catalog→registry',
      reason: 'showInDropdown:true but missing from server AI_VIDEO_PROVIDERS — will fail silently at generation time',
    });
  }
}

// ── 4a. CATALOG → PROVIDER_TEST_ID_MAP ──────────────────────────────────────
// PROVIDER_TEST_ID_MAP gates which providers the live tested-providers filter
// activates. A showInDropdown provider absent from this map will never be
// surfaced through the test-results path (it silently falls through or gets
// excluded). Every showInDropdown:true video catalog entry that also exists in
// AI_VIDEO_PROVIDERS must have a PROVIDER_TEST_ID_MAP entry.

for (const entry of VIDEO_PROVIDER_CATALOG) {
  if (entry.showInDropdown === true && entry.id in AI_VIDEO_PROVIDERS && !(entry.id in PROVIDER_TEST_ID_MAP)) {
    gaps.push({
      catalog: 'VIDEO_PROVIDER_CATALOG',
      registry: 'server/PROVIDER_TEST_ID_MAP',
      id: entry.id,
      direction: 'catalog→registry',
      reason: 'showInDropdown:true and in AI_VIDEO_PROVIDERS but missing from PROVIDER_TEST_ID_MAP',
    });
  }
}

// ── 4b. CATALOG → SERVER_IMAGE_PROVIDERS ────────────────────────────────────
// SERVER_IMAGE_PROVIDERS (server/config/image-providers.ts) is the canonical
// map that routes image-generation requests to their API provider and model.
// Any catalog entry exposed in a UI dropdown (showInDropdown, showInImageDropdown,
// showInI2IDropdown) must have a matching entry here or generation will fall
// through to the 'flux' fallback silently.

for (const entry of IMAGE_PROVIDER_CATALOG) {
  const isDropdownVisible =
    entry.showInDropdown === true ||
    entry.showInImageDropdown === true ||
    entry.showInI2IDropdown === true;
  if (isDropdownVisible && !(entry.id in SERVER_IMAGE_PROVIDERS)) {
    gaps.push({
      catalog: 'IMAGE_PROVIDER_CATALOG',
      registry: 'server/IMAGE_PROVIDERS',
      id: entry.id,
      direction: 'catalog→registry',
      reason: 'dropdown-visible but missing from server/config/image-providers.ts — generation will fall through to flux fallback',
    });
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

if (gaps.length === 0) {
  console.log('check-provider-catalog-sync: OK — catalog and registry are fully in sync.');
  process.exit(0);
}

const catalogMissing = gaps.filter(g => g.direction === 'catalog→registry');
const registryMissing = gaps.filter(g => g.direction === 'registry→catalog');

console.error('check-provider-catalog-sync: FAIL — provider catalog and registry are out of sync.\n');

if (catalogMissing.length > 0) {
  console.error('  [catalog→registry] These catalog entries are visible in a dropdown but missing from the registry.');
  console.error('  Add them to the registry or remove their showInDropdown flag.\n');
  for (const { catalog, registry, id, reason } of catalogMissing) {
    console.error(`    ${catalog}["${id}"]  →  missing from  ${registry}  (${reason})`);
  }
  console.error('');
}

if (registryMissing.length > 0) {
  console.error('  [registry→catalog] These registry entries have no corresponding catalog entry.');
  console.error('  Add them to the catalog (shared/provider-catalog.ts) so they are documented and UI-surfaceable.\n');
  for (const { registry, catalog, id, reason } of registryMissing) {
    console.error(`    ${registry}["${id}"]  →  missing from  ${catalog}  (${reason})`);
  }
  console.error('');
}

console.error(`${gaps.length} gap(s) found.`);
process.exit(1);
