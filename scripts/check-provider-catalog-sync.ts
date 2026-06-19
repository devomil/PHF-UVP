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
import { VIDEO_PROVIDERS, IMAGE_PROVIDERS, SOUND_PROVIDERS } from '../shared/provider-config.js';
import { AI_VIDEO_PROVIDERS, PROVIDER_TEST_ID_MAP } from '../server/config/ai-video-providers-static.js';
import { IMAGE_PROVIDERS as SERVER_IMAGE_PROVIDERS } from '../server/config/image-providers.js';
import { findCatalogSyncGaps } from './provider-catalog-sync-core.js';

const gaps = findCatalogSyncGaps({
  videoCatalog: VIDEO_PROVIDER_CATALOG,
  imageCatalog: IMAGE_PROVIDER_CATALOG,
  sharedVideoProviders: VIDEO_PROVIDERS,
  sharedImageProviders: IMAGE_PROVIDERS,
  aiVideoProviders: AI_VIDEO_PROVIDERS,
  providerTestIdMap: PROVIDER_TEST_ID_MAP,
  serverImageProviders: SERVER_IMAGE_PROVIDERS,
});

// ── 5. COST FIELD VALIDATION ─────────────────────────────────────────────────
// Every entry in VIDEO_PROVIDERS must have a positive, non-zero costPerSecond.
// Every entry in IMAGE_PROVIDERS must have a positive, non-zero costPerImage.
// A missing or zero value silently produces wrong credit estimates in billing.

interface CostError {
  registry: string;
  id: string;
  field: string;
  value: number | undefined;
  reason: string;
}

const costErrors: CostError[] = [];

for (const [id, entry] of Object.entries(VIDEO_PROVIDERS)) {
  const v = entry.costPerSecond;
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
    costErrors.push({
      registry: 'shared/VIDEO_PROVIDERS',
      id,
      field: 'costPerSecond',
      value: v as number | undefined,
      reason:
        typeof v !== 'number' || !isFinite(v)
          ? `costPerSecond is missing or not a number (got ${JSON.stringify(v)})`
          : `costPerSecond must be > 0, got ${v}`,
    });
  }
}

for (const [id, entry] of Object.entries(IMAGE_PROVIDERS)) {
  const v = entry.costPerImage;
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
    costErrors.push({
      registry: 'shared/IMAGE_PROVIDERS',
      id,
      field: 'costPerImage',
      value: v as number | undefined,
      reason:
        typeof v !== 'number' || !isFinite(v)
          ? `costPerImage is missing or not a number (got ${JSON.stringify(v)})`
          : `costPerImage must be > 0, got ${v}`,
    });
  }
}

// SFX / voiceover / music providers — each type has its own cost field:
//   voiceover → costPerSecond
//   music     → costPerTrack
//   sfx       → costPerEffect
// A missing or zero value silently produces wrong credit estimates.

const SFX_COST_FIELD: Record<string, string> = {
  voiceover: 'costPerSecond',
  music: 'costPerTrack',
  sfx: 'costPerEffect',
};

for (const [id, entry] of Object.entries(SOUND_PROVIDERS)) {
  const field = SFX_COST_FIELD[entry.type];
  if (!field) continue; // unknown type — skip
  const v = (entry as Record<string, unknown>)[field] as number | undefined;
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
    costErrors.push({
      registry: 'shared/SOUND_PROVIDERS',
      id,
      field,
      value: v,
      reason:
        typeof v !== 'number' || !isFinite(v)
          ? `${field} is missing or not a number (got ${JSON.stringify(v)})`
          : `${field} must be > 0, got ${v}`,
    });
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

if (gaps.length === 0 && costErrors.length === 0) {
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

if (costErrors.length > 0) {
  console.error('  [cost-validation] These registry entries have a missing or zero cost field.');
  console.error('  Update shared/provider-config.ts with the correct positive cost value.');
  console.error('  (Video/image providers: costPerSecond / costPerImage; sound providers: costPerEffect / costPerSecond / costPerTrack)\n');
  for (const { registry, id, field, reason } of costErrors) {
    console.error(`    ${registry}["${id}"].${field}  →  ${reason}`);
  }
  console.error('');
}

const totalIssues = gaps.length + costErrors.length;
console.error(`${totalIssues} issue(s) found (${gaps.length} sync gap(s), ${costErrors.length} cost error(s)).`);
process.exit(1);
