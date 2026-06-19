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
import { fileURLToPath } from 'url';
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

export interface CatalogSyncResult {
  ok: boolean;
  output: string;
}

export function runCatalogSyncCheck(): CatalogSyncResult {
  const gaps = findCatalogSyncGaps({
    videoCatalog: VIDEO_PROVIDER_CATALOG,
    imageCatalog: IMAGE_PROVIDER_CATALOG,
    sharedVideoProviders: VIDEO_PROVIDERS,
    sharedImageProviders: IMAGE_PROVIDERS,
    aiVideoProviders: AI_VIDEO_PROVIDERS,
    providerTestIdMap: PROVIDER_TEST_ID_MAP,
    serverImageProviders: SERVER_IMAGE_PROVIDERS,
  });

  const costErrors = findCostErrors({
    videoProviders: VIDEO_PROVIDERS as Record<string, Record<string, unknown>>,
    imageProviders: IMAGE_PROVIDERS as Record<string, Record<string, unknown>>,
    soundProviders: SOUND_PROVIDERS as Record<string, Record<string, unknown>>,
  });

  const driftErrors = checkCostDrift({
    videoProviders: VIDEO_PROVIDERS,
    imageProviders: IMAGE_PROVIDERS,
    soundProviders: SOUND_PROVIDERS,
    videoBaseline: costBaseline.video,
    imageBaseline: costBaseline.image,
    soundBaseline: costBaseline.sound,
    tolerancePct: costBaseline._tolerancePct,
  });

  const unbaselinedErrors = checkUnbaselinedProviders({
    videoProviders: VIDEO_PROVIDERS,
    imageProviders: IMAGE_PROVIDERS,
    soundProviders: SOUND_PROVIDERS,
    videoBaseline: costBaseline.video,
    imageBaseline: costBaseline.image,
    soundBaseline: costBaseline.sound,
  });

  if (gaps.length === 0 && costErrors.length === 0 && driftErrors.length === 0 && unbaselinedErrors.length === 0) {
    return { ok: true, output: 'check-provider-catalog-sync: OK — catalog and registry are fully in sync.' };
  }

  const lines: string[] = ['check-provider-catalog-sync: FAIL — provider catalog and registry are out of sync.\n'];

  const catalogMissing = gaps.filter(g => g.direction === 'catalog→registry');
  const registryMissing = gaps.filter(g => g.direction === 'registry→catalog');

  if (catalogMissing.length > 0) {
    lines.push('  [catalog→registry] These catalog entries are visible in a dropdown but missing from the registry.');
    lines.push('  Add them to the registry or remove their showInDropdown flag.\n');
    for (const { catalog, registry, id, reason } of catalogMissing) {
      lines.push(`    ${catalog}["${id}"]  →  missing from  ${registry}  (${reason})`);
    }
    lines.push('');
  }

  if (registryMissing.length > 0) {
    lines.push('  [registry→catalog] These registry entries have no corresponding catalog entry.');
    lines.push('  Add them to the catalog (shared/provider-catalog.ts) so they are documented and UI-surfaceable.\n');
    for (const { registry, catalog, id, reason } of registryMissing) {
      lines.push(`    ${registry}["${id}"]  →  missing from  ${catalog}  (${reason})`);
    }
    lines.push('');
  }

  if (costErrors.length > 0) {
    lines.push('  [cost-validation] These registry entries have a missing or zero cost field.');
    lines.push('  Update shared/provider-config.ts with the correct positive cost value.');
    lines.push('  (Video/image providers: costPerSecond / costPerImage; sound providers: costPerEffect / costPerSecond / costPerTrack)\n');
    for (const { registry, id, field, reason } of costErrors) {
      lines.push(`    ${registry}["${id}"].${field}  →  ${reason}`);
    }
    lines.push('');
  }

  if (driftErrors.length > 0) {
    lines.push('  [cost-drift] These registry entries have a cost value that deviates from the committed baseline');
    lines.push(`  by more than ${costBaseline._tolerancePct}%. If this change is intentional, update`);
    lines.push('  scripts/provider-cost-baseline.json to match the new value.\n');
    for (const { registry, id, field, baseline, current, driftPct } of driftErrors) {
      lines.push(
        `    ${registry}["${id}"].${field}` +
        `  →  baseline=${baseline}, current=${current}` +
        `  (${driftPct.toFixed(1)}% drift, limit ${costBaseline._tolerancePct}%)`,
      );
    }
    lines.push('');
  }

  if (unbaselinedErrors.length > 0) {
    lines.push('  [cost-baseline] These providers are in the registry but have no entry in the cost baseline.');
    lines.push('  Add them to scripts/provider-cost-baseline.json so future cost changes are caught by drift detection.\n');
    for (const { registry, id } of unbaselinedErrors) {
      lines.push(`    ${registry}["${id}"]  →  missing from  scripts/provider-cost-baseline.json`);
    }
    lines.push('');
  }

  const totalIssues = gaps.length + costErrors.length + driftErrors.length + unbaselinedErrors.length;
  lines.push(
    `${totalIssues} issue(s) found` +
    ` (${gaps.length} sync gap(s), ${costErrors.length} cost error(s), ${driftErrors.length} cost drift(s), ${unbaselinedErrors.length} unbaselined provider(s)).`,
  );

  return { ok: false, output: lines.join('\n') };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runCatalogSyncCheck();
  if (result.ok) {
    console.log(result.output);
    process.exit(0);
  } else {
    console.error(result.output);
    process.exit(1);
  }
}
