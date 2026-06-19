// Pure gap-finding logic for the provider catalog ↔ registry sync check.
//
// This module is intentionally free of side-effects (no process.exit, no console
// output) so that tests can import and exercise it directly with fixture data.
//
// The main script (check-provider-catalog-sync.ts) is the thin CLI wrapper that
// calls findCatalogSyncGaps() with the real production catalogs.

export interface CatalogEntry {
  id: string;
  showInDropdown?: boolean;
  showInV2VDropdown?: boolean;
  showInImageDropdown?: boolean;
  showInI2IDropdown?: boolean;
}

export interface Gap {
  catalog: string;
  registry: string;
  id: string;
  direction: 'catalog→registry' | 'registry→catalog';
  reason: string;
}

export interface SyncCheckParams {
  videoCatalog: CatalogEntry[];
  imageCatalog: CatalogEntry[];
  sharedVideoProviders: Record<string, unknown>;
  sharedImageProviders: Record<string, unknown>;
  aiVideoProviders: Record<string, unknown>;
  providerTestIdMap: Record<string, unknown>;
  serverImageProviders: Record<string, unknown>;
}

const VIDEO_DROPDOWN_FLAGS: Array<keyof CatalogEntry> = [
  'showInDropdown',
  'showInV2VDropdown',
];

const IMAGE_DROPDOWN_FLAGS: Array<keyof CatalogEntry> = [
  'showInDropdown',
  'showInImageDropdown',
  'showInI2IDropdown',
];

export function findCatalogSyncGaps(params: SyncCheckParams): Gap[] {
  const {
    videoCatalog,
    imageCatalog,
    sharedVideoProviders,
    sharedImageProviders,
    aiVideoProviders,
    providerTestIdMap,
    serverImageProviders,
  } = params;

  const gaps: Gap[] = [];

  // ── 1. CATALOG → REGISTRY (shared) ─────────────────────────────────────────
  for (const entry of videoCatalog) {
    const isVisible = VIDEO_DROPDOWN_FLAGS.some(f => entry[f] === true);
    if (isVisible && !(entry.id in sharedVideoProviders)) {
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

  for (const entry of imageCatalog) {
    const isVisible = IMAGE_DROPDOWN_FLAGS.some(f => entry[f] === true);
    if (isVisible && !(entry.id in sharedImageProviders)) {
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

  // ── 2. REGISTRY → CATALOG ──────────────────────────────────────────────────
  const videoCatalogIds = new Set(videoCatalog.map(e => e.id));
  const imageCatalogIds = new Set(imageCatalog.map(e => e.id));

  for (const id of Object.keys(sharedVideoProviders)) {
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

  for (const id of Object.keys(sharedImageProviders)) {
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

  // ── 3. CATALOG → SERVER REGISTRY (AI_VIDEO_PROVIDERS) ──────────────────────
  for (const entry of videoCatalog) {
    if (entry.showInDropdown === true && !(entry.id in aiVideoProviders)) {
      gaps.push({
        catalog: 'VIDEO_PROVIDER_CATALOG',
        registry: 'server/AI_VIDEO_PROVIDERS',
        id: entry.id,
        direction: 'catalog→registry',
        reason:
          'showInDropdown:true but missing from server AI_VIDEO_PROVIDERS — will fail silently at generation time',
      });
    }
  }

  // ── 4a. CATALOG → PROVIDER_TEST_ID_MAP ─────────────────────────────────────
  for (const entry of videoCatalog) {
    if (
      entry.showInDropdown === true &&
      entry.id in aiVideoProviders &&
      !(entry.id in providerTestIdMap)
    ) {
      gaps.push({
        catalog: 'VIDEO_PROVIDER_CATALOG',
        registry: 'server/PROVIDER_TEST_ID_MAP',
        id: entry.id,
        direction: 'catalog→registry',
        reason:
          'showInDropdown:true and in AI_VIDEO_PROVIDERS but missing from PROVIDER_TEST_ID_MAP',
      });
    }
  }

  // ── 4b. CATALOG → SERVER_IMAGE_PROVIDERS ───────────────────────────────────
  for (const entry of imageCatalog) {
    const isDropdownVisible =
      entry.showInDropdown === true ||
      entry.showInImageDropdown === true ||
      entry.showInI2IDropdown === true;
    if (isDropdownVisible && !(entry.id in serverImageProviders)) {
      gaps.push({
        catalog: 'IMAGE_PROVIDER_CATALOG',
        registry: 'server/IMAGE_PROVIDERS',
        id: entry.id,
        direction: 'catalog→registry',
        reason:
          'dropdown-visible but missing from server/config/image-providers.ts — generation will fall through to flux fallback',
      });
    }
  }

  return gaps;
}
