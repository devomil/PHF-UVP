// Tiny shared cost helpers for the per-scene duration control and the
// "Scene defaults" bulk popover. Both surfaces need the same per-second
// rate lookup and the same USD formatter so the readouts agree.
//
// Reads `costPerSecond` straight from the shared provider catalog
// (shared/provider-config.ts) so UI prices follow the server source of
// truth without a second copy.

import { VIDEO_PROVIDERS } from "@shared/provider-config";

export function getCostPerSecond(
  providerKey: string | undefined,
): number | undefined {
  if (!providerKey) return undefined;
  return VIDEO_PROVIDERS[providerKey]?.costPerSecond;
}

export function formatUsd(amount: number): string {
  // Sub-cent values render as "$0.00" with two decimals which is
  // confusing — show three decimals while the number is small so the
  // per-second rate ($0.020/s, $0.039/s, …) stays legible.
  if (amount < 0.10) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
