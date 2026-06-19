#!/usr/bin/env tsx
// Internal helper for watch-provider-catalog-sync.ts.
//
// Imports all provider catalogs/registries fresh (no cache from the parent
// process), calls findCatalogSyncGaps(), then writes the Gap[] as a single
// JSON line to stdout. The watch script parses this to compute diffs.
//
// Not intended to be called directly by developers — use:
//   npm run lint:providers   (human-readable report + cost validation)
//   npm run watch:providers  (file watcher with diff output)

import { VIDEO_PROVIDER_CATALOG, IMAGE_PROVIDER_CATALOG } from '../shared/provider-catalog.js';
import { VIDEO_PROVIDERS, IMAGE_PROVIDERS } from '../shared/provider-config.js';
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

process.stdout.write(JSON.stringify(gaps) + '\n');
