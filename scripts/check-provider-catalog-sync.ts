#!/usr/bin/env tsx
// Lint check: every catalog entry with showInDropdown:true must have a
// matching capability entry in the corresponding providers registry.
//
// VIDEO_PROVIDER_CATALOG  → VIDEO_PROVIDERS  (shared/provider-config.ts)
// IMAGE_PROVIDER_CATALOG  → IMAGE_PROVIDERS  (shared/provider-config.ts)
//
// Run via:  npm run lint:providers
// Exit 0 = all clear, exit 1 = gaps detected, exit 2 = usage error.

import { VIDEO_PROVIDER_CATALOG, IMAGE_PROVIDER_CATALOG } from '../shared/provider-catalog.js';
import { VIDEO_PROVIDERS, IMAGE_PROVIDERS } from '../shared/provider-config.js';

interface Gap {
  catalog: string;
  registry: string;
  id: string;
}

const gaps: Gap[] = [];

for (const entry of VIDEO_PROVIDER_CATALOG) {
  if (entry.showInDropdown === true && !(entry.id in VIDEO_PROVIDERS)) {
    gaps.push({ catalog: 'VIDEO_PROVIDER_CATALOG', registry: 'VIDEO_PROVIDERS', id: entry.id });
  }
}

for (const entry of IMAGE_PROVIDER_CATALOG) {
  if (entry.showInDropdown === true && !(entry.id in IMAGE_PROVIDERS)) {
    gaps.push({ catalog: 'IMAGE_PROVIDER_CATALOG', registry: 'IMAGE_PROVIDERS', id: entry.id });
  }
}

if (gaps.length === 0) {
  console.log('check-provider-catalog-sync: OK — all showInDropdown catalog entries have a matching capability entry.');
  process.exit(0);
}

console.error('check-provider-catalog-sync: FAIL — the following catalog entries have showInDropdown:true');
console.error('but are missing from their capability registry (costPerSecond, specialties, bestFor, etc.).');
console.error('Add the missing entries or remove showInDropdown:true from the catalog.\n');

for (const { catalog, registry, id } of gaps) {
  console.error(`  ${catalog}["${id}"]  →  missing from  ${registry}`);
}

console.error(`\n${gaps.length} gap(s) found.`);
process.exit(1);
