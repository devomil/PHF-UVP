// Single source of truth for NB2 (PiAPI nano-banana-2) per-image pricing
// by output resolution. Imported by both the server (cost telemetry,
// estimator, generator) and the client (live cost preview next to the
// storyboard resolution picker) so pre-flight estimates always match
// what PiAPI bills.
//
// Pricing verified against piapi.ai/docs/gemini-api/nano-banana-2 (Apr 2026):
//   1K  $0.06 / image
//   2K  $0.08 / image
//   4K  $0.12 / image

export type NB2Resolution = '1K' | '2K' | '4K';

export const NB2_DEFAULT_RESOLUTION: NB2Resolution = '1K';

export const NB2_COST_PER_IMAGE_BY_RESOLUTION: Record<NB2Resolution, number> = {
  '1K': 0.06,
  '2K': 0.08,
  '4K': 0.12,
};

export function getNB2CostPerImage(
  resolution: NB2Resolution = NB2_DEFAULT_RESOLUTION,
): number {
  return (
    NB2_COST_PER_IMAGE_BY_RESOLUTION[resolution] ??
    NB2_COST_PER_IMAGE_BY_RESOLUTION[NB2_DEFAULT_RESOLUTION]
  );
}
