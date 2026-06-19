// Pure cost-drift detection logic.
//
// This module is intentionally free of side-effects (no process.exit, no
// console output, no file I/O) so that tests can import and exercise it
// directly with fixture data.
//
// The main script (check-provider-catalog-sync.ts) is the thin CLI wrapper
// that loads the baseline JSON and calls checkCostDrift() with the live
// registry values.

export interface CostDriftError {
  registry: string;
  id: string;
  field: string;
  baseline: number;
  current: number;
  driftPct: number;
  tolerancePct: number;
}

export interface ProviderCostEntry {
  costPerSecond?: number;
  costPerImage?: number;
  costPerTrack?: number;
  costPerEffect?: number;
}

export type BaselineSection = Record<string, ProviderCostEntry>;

export interface CostDriftParams {
  videoProviders: Record<string, ProviderCostEntry>;
  imageProviders: Record<string, ProviderCostEntry>;
  soundProviders: Record<string, ProviderCostEntry>;
  videoBaseline: BaselineSection;
  imageBaseline: BaselineSection;
  soundBaseline: BaselineSection;
  tolerancePct: number;
}

const COST_FIELDS: Array<keyof ProviderCostEntry> = [
  'costPerSecond',
  'costPerImage',
  'costPerTrack',
  'costPerEffect',
];

function checkSection(
  providers: Record<string, ProviderCostEntry>,
  baseline: BaselineSection,
  registryLabel: string,
  tolerancePct: number,
): CostDriftError[] {
  const errors: CostDriftError[] = [];

  for (const [id, baselineEntry] of Object.entries(baseline)) {
    const liveEntry = providers[id];
    if (!liveEntry) {
      // Provider removed from registry — the zero/missing check handles this.
      continue;
    }

    for (const field of COST_FIELDS) {
      const baselineValue = baselineEntry[field];
      if (typeof baselineValue !== 'number') continue;

      const currentValue = liveEntry[field];
      if (typeof currentValue !== 'number') {
        // Missing field is caught by the existing zero/missing cost check.
        continue;
      }

      const driftPct = Math.abs((currentValue - baselineValue) / baselineValue) * 100;
      if (driftPct > tolerancePct) {
        errors.push({
          registry: registryLabel,
          id,
          field,
          baseline: baselineValue,
          current: currentValue,
          driftPct,
          tolerancePct,
        });
      }
    }
  }

  return errors;
}

export function checkCostDrift(params: CostDriftParams): CostDriftError[] {
  const {
    videoProviders,
    imageProviders,
    soundProviders,
    videoBaseline,
    imageBaseline,
    soundBaseline,
    tolerancePct,
  } = params;

  return [
    ...checkSection(videoProviders, videoBaseline, 'shared/VIDEO_PROVIDERS', tolerancePct),
    ...checkSection(imageProviders, imageBaseline, 'shared/IMAGE_PROVIDERS', tolerancePct),
    ...checkSection(soundProviders, soundBaseline, 'shared/SOUND_PROVIDERS', tolerancePct),
  ];
}
