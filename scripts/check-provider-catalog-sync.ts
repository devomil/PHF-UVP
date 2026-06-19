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

import { createRequire } from 'module';
import { VIDEO_PROVIDER_CATALOG, IMAGE_PROVIDER_CATALOG } from '../shared/provider-catalog.js';
import { VIDEO_PROVIDERS, IMAGE_PROVIDERS, SOUND_PROVIDERS } from '../shared/provider-config.js';
import { AI_VIDEO_PROVIDERS, PROVIDER_TEST_ID_MAP } from '../server/config/ai-video-providers-static.js';
import { IMAGE_PROVIDERS as SERVER_IMAGE_PROVIDERS } from '../server/config/image-providers.js';
import { findCatalogSyncGaps, findCostErrors } from './provider-catalog-sync-core.js';
import { checkCostDrift, checkUnbaselinedProviders } from './check-cost-drift-core.js';

const _require = createRequire(import.meta.url);
const costBaseline = _require('./provider-cost-baseline.json') as {
  _comment: string;
  _tolerancePct: number;
  video: Record<string, { costPerSecond?: number; costPerImage?: number; costPerTrack?: number; costPerEffect?: number }>;
  image: Record<string, { costPerSecond?: number; costPerImage?: number; costPerTrack?: number; costPerEffect?: number }>;
  sound: Record<string, { costPerSecond?: number; costPerImage?: number; costPerTrack?: number; costPerEffect?: number }>;
};

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
// Logic is shared with the watch script via findCostErrors() in the core module.

const costErrors = findCostErrors({
  videoProviders: VIDEO_PROVIDERS as Record<string, Record<string, unknown>>,
  imageProviders: IMAGE_PROVIDERS as Record<string, Record<string, unknown>>,
  soundProviders: SOUND_PROVIDERS as Record<string, Record<string, unknown>>,
});

// ── 6. COST DRIFT DETECTION ───────────────────────────────────────────────────
// Compare current cost values against the committed baseline snapshot.
// Changes larger than _tolerancePct% from the baseline are flagged so that
// accidental typos (e.g. 0.05 → 0.5, a 10× drift) are caught before billing.

const driftErrors = checkCostDrift({
  videoProviders: VIDEO_PROVIDERS,
  imageProviders: IMAGE_PROVIDERS,
  soundProviders: SOUND_PROVIDERS,
  videoBaseline: costBaseline.video,
  imageBaseline: costBaseline.image,
  soundBaseline: costBaseline.sound,
  tolerancePct: costBaseline._tolerancePct,
});

// ── 7. UNBASELINED PROVIDER DETECTION ────────────────────────────────────────
// Flag providers that exist in the live registry but have no entry in the
// committed baseline snapshot. A new provider without a baseline entry will
// silently pass the drift check, leaving billing estimates unreviewed.

const unbaselinedErrors = checkUnbaselinedProviders({
  videoProviders: VIDEO_PROVIDERS,
  imageProviders: IMAGE_PROVIDERS,
  soundProviders: SOUND_PROVIDERS,
  videoBaseline: costBaseline.video,
  imageBaseline: costBaseline.image,
  soundBaseline: costBaseline.sound,
});

// ── Report ───────────────────────────────────────────────────────────────────

if (gaps.length === 0 && costErrors.length === 0 && driftErrors.length === 0 && unbaselinedErrors.length === 0) {
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

if (driftErrors.length > 0) {
  console.error('  [cost-drift] These registry entries have a cost value that deviates from the committed baseline');
  console.error(`  by more than ${costBaseline._tolerancePct}%. If this change is intentional, update`);
  console.error('  scripts/provider-cost-baseline.json to match the new value.\n');
  for (const { registry, id, field, baseline, current, driftPct } of driftErrors) {
    console.error(
      `    ${registry}["${id}"].${field}` +
      `  →  baseline=${baseline}, current=${current}` +
      `  (${driftPct.toFixed(1)}% drift, limit ${costBaseline._tolerancePct}%)`,
    );
  }
  console.error('');
}

if (unbaselinedErrors.length > 0) {
  console.error('  [cost-baseline] These providers are in the registry but have no entry in the cost baseline.');
  console.error('  Add them to scripts/provider-cost-baseline.json so future cost changes are caught by drift detection.\n');
  for (const { registry, id } of unbaselinedErrors) {
    console.error(`    ${registry}["${id}"]  →  missing from  scripts/provider-cost-baseline.json`);
  }
  console.error('');
}

const totalIssues = gaps.length + costErrors.length + driftErrors.length + unbaselinedErrors.length;
console.error(
  `${totalIssues} issue(s) found` +
  ` (${gaps.length} sync gap(s), ${costErrors.length} cost error(s), ${driftErrors.length} cost drift(s), ${unbaselinedErrors.length} unbaselined provider(s)).`,
);
process.exit(1);
