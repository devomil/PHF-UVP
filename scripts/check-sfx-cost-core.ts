// Pure SFX / sound-provider cost-field validation logic.
//
// Intentionally free of side-effects (no process.exit, no console output,
// no file I/O) so that tests can import and exercise it with fixture data.
//
// The main script (check-provider-catalog-sync.ts) is the thin CLI wrapper
// that loads SOUND_PROVIDERS from shared/provider-config and calls
// checkSoundProviderCosts() with the live registry.

export interface SoundCostError {
  registry: string;
  id: string;
  field: string;
  value: number | undefined;
  reason: string;
}

export interface SoundProviderEntry {
  type: string;
  [key: string]: unknown;
}

export const SFX_COST_FIELD: Record<string, string> = {
  voiceover: 'costPerSecond',
  music:     'costPerTrack',
  sfx:       'costPerEffect',
};

export function checkSoundProviderCosts(
  soundProviders: Record<string, SoundProviderEntry>,
  registryLabel = 'shared/SOUND_PROVIDERS',
): SoundCostError[] {
  const errors: SoundCostError[] = [];

  for (const [id, entry] of Object.entries(soundProviders)) {
    const field = SFX_COST_FIELD[entry.type];
    if (!field) continue;

    const v = entry[field] as number | undefined;
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
      errors.push({
        registry: registryLabel,
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

  return errors;
}
