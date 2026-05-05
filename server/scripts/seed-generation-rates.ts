// Phase NC-01 — Seed `generation_rates` from the canonical tables in
// `attached_assets/NC_Credit_Architecture_1777998073976.md`. Run on boot
// via routes.ts (idempotent — uses INSERT ... ON CONFLICT DO UPDATE).

import { db } from "../db";
import { generationRates } from "../../shared/schema";
import { sql } from "drizzle-orm";

interface RateRow {
  provider: string;
  quality: string | null;
  durationS: number | null;
  gcCost: number;
  apiCostUSD: number;
  tier: "standard" | "premium" | "top";
}

const RATES: RateRow[] = [
  // Standard tier
  { provider: "kling-2.5", quality: "std", durationS: 5, gcCost: 3, apiCostUSD: 0.20, tier: "standard" },
  { provider: "kling-2.5", quality: "std", durationS: 10, gcCost: 5, apiCostUSD: 0.40, tier: "standard" },
  { provider: "kling-2.6", quality: "std", durationS: 5, gcCost: 3, apiCostUSD: 0.20, tier: "standard" },
  { provider: "kling-2.6", quality: "std", durationS: 10, gcCost: 5, apiCostUSD: 0.40, tier: "standard" },
  { provider: "hailuo", quality: "768p", durationS: 6, gcCost: 3, apiCostUSD: 0.23, tier: "standard" },
  { provider: "hailuo", quality: "768p", durationS: 10, gcCost: 5, apiCostUSD: 0.45, tier: "standard" },
  { provider: "hunyuan", quality: "fast-480p", durationS: 5, gcCost: 1, apiCostUSD: 0.03, tier: "standard" },
  { provider: "frame-pack", quality: "any", durationS: 5, gcCost: 2, apiCostUSD: 0.15, tier: "standard" },
  { provider: "wan-2.6", quality: "720p", durationS: 5, gcCost: 4, apiCostUSD: 0.40, tier: "standard" },
  { provider: "ltx-video", quality: "std", durationS: 5, gcCost: 2, apiCostUSD: 0.18, tier: "standard" },
  { provider: "i2v-skyreels", quality: "std", durationS: 5, gcCost: 2, apiCostUSD: 0.15, tier: "standard" },
  { provider: "wan-2.1", quality: "std", durationS: 5, gcCost: 3, apiCostUSD: 0.28, tier: "standard" },
  { provider: "wan-2.2", quality: "std", durationS: 5, gcCost: 3, apiCostUSD: 0.28, tier: "standard" },

  // Premium tier
  { provider: "kling-2.5", quality: "pro", durationS: 5, gcCost: 4, apiCostUSD: 0.33, tier: "premium" },
  { provider: "kling-2.5", quality: "pro", durationS: 10, gcCost: 7, apiCostUSD: 0.46, tier: "premium" },
  { provider: "kling-2.6", quality: "pro", durationS: 5, gcCost: 4, apiCostUSD: 0.33, tier: "premium" },
  { provider: "kling-2.6", quality: "pro", durationS: 10, gcCost: 7, apiCostUSD: 0.46, tier: "premium" },
  { provider: "kling-3.0-omni", quality: "1080p-audio", durationS: 5, gcCost: 12, apiCostUSD: 1.00, tier: "premium" },
  { provider: "veo-3", quality: "fast-no-audio", durationS: 5, gcCost: 4, apiCostUSD: 0.30, tier: "premium" },
  { provider: "veo-3", quality: "fast-audio", durationS: 5, gcCost: 6, apiCostUSD: 0.45, tier: "premium" },
  { provider: "veo-3.1", quality: "fast-no-audio", durationS: 5, gcCost: 4, apiCostUSD: 0.30, tier: "premium" },
  { provider: "veo-3.1", quality: "fast-audio", durationS: 5, gcCost: 6, apiCostUSD: 0.45, tier: "premium" },
  { provider: "wan-2.6", quality: "1080p", durationS: 5, gcCost: 7, apiCostUSD: 0.60, tier: "premium" },
  { provider: "seedance-2", quality: "480p", durationS: 5, gcCost: 6, apiCostUSD: 0.50, tier: "premium" },
  { provider: "seedance-2-fast", quality: "480p", durationS: 5, gcCost: 5, apiCostUSD: 0.40, tier: "premium" },
  { provider: "seedance-2-fast", quality: "720p", durationS: 5, gcCost: 9, apiCostUSD: 0.80, tier: "premium" },
  { provider: "i2v-seedance-2-fast", quality: "720p", durationS: 5, gcCost: 9, apiCostUSD: 0.80, tier: "premium" },
  { provider: "i2v-seedance-2-first-last-frames", quality: "720p", durationS: 5, gcCost: 9, apiCostUSD: 0.80, tier: "premium" },
  { provider: "sora-2", quality: "720p", durationS: 5, gcCost: 5, apiCostUSD: 0.40, tier: "premium" },
  { provider: "hailuo", quality: "1080p", durationS: 6, gcCost: 5, apiCostUSD: 0.40, tier: "premium" },

  // Top tier
  { provider: "veo-3-full", quality: "no-audio", durationS: 5, gcCost: 7, apiCostUSD: 0.60, tier: "top" },
  { provider: "veo-3-full", quality: "audio", durationS: 5, gcCost: 14, apiCostUSD: 1.20, tier: "top" },
  { provider: "seedance-2", quality: "720p", durationS: 5, gcCost: 12, apiCostUSD: 1.00, tier: "top" },
  { provider: "seedance-2", quality: "1080p", durationS: 5, gcCost: 30, apiCostUSD: 2.50, tier: "top" },
  { provider: "i2v-seedance-2", quality: "720p", durationS: 5, gcCost: 12, apiCostUSD: 1.00, tier: "top" },
  { provider: "i2v-seedance-2", quality: "1080p", durationS: 5, gcCost: 30, apiCostUSD: 2.50, tier: "top" },
  { provider: "sora-2-pro", quality: "1080p", durationS: 5, gcCost: 18, apiCostUSD: 1.50, tier: "top" },
  { provider: "kling-effects", quality: "std", durationS: 5, gcCost: 3, apiCostUSD: 0.26, tier: "top" },
  { provider: "kling-avatar", quality: "std", durationS: 5, gcCost: 4, apiCostUSD: 0.30, tier: "top" },
  { provider: "i2v-kling-avatar", quality: "std", durationS: 5, gcCost: 4, apiCostUSD: 0.30, tier: "top" },
  { provider: "omnihuman-1.5", quality: "per-sec", durationS: 1, gcCost: 2, apiCostUSD: 0.13, tier: "top" },
  { provider: "runway-4.5", quality: "std", durationS: 5, gcCost: 7, apiCostUSD: 0.35, tier: "top" },
  { provider: "runway-gen4", quality: "std", durationS: 5, gcCost: 6, apiCostUSD: 0.25, tier: "top" },
  { provider: "runway-gen4-aleph", quality: "std", durationS: 5, gcCost: 6, apiCostUSD: 0.30, tier: "top" },
  { provider: "runway-act-two", quality: "std", durationS: 5, gcCost: 6, apiCostUSD: 0.30, tier: "top" },

  // Non-video utility services
  { provider: "image-flux", quality: "std", durationS: null, gcCost: 2, apiCostUSD: 0.015, tier: "standard" },
  { provider: "image-recraft", quality: "std", durationS: null, gcCost: 2, apiCostUSD: 0.04, tier: "standard" },
  { provider: "image-nano-banana-2", quality: "4k", durationS: null, gcCost: 2, apiCostUSD: 0.12, tier: "standard" },
  { provider: "i2i", quality: "std", durationS: null, gcCost: 2, apiCostUSD: 0.025, tier: "standard" },
  { provider: "elevenlabs-tts", quality: "per-min", durationS: 60, gcCost: 2, apiCostUSD: 0.05, tier: "standard" },
  { provider: "openai-tts", quality: "per-1k", durationS: null, gcCost: 1, apiCostUSD: 0.015, tier: "standard" },
  { provider: "ai-music", quality: "per-track", durationS: null, gcCost: 1, apiCostUSD: 0.02, tier: "standard" },
  { provider: "remotion-render", quality: "per-min", durationS: 60, gcCost: 2, apiCostUSD: 0.10, tier: "standard" },
];

let seeded = false;
export async function seedGenerationRatesIfNeeded(): Promise<void> {
  if (seeded) return;
  try {
    // Ensure a unique constraint on the natural key so we can UPSERT.
    // `quality` and `duration_s` are nullable (utility rows), and
    // Postgres treats NULL as distinct in plain UNIQUE indexes — using
    // COALESCE expressions yields a stable upsert key in all cases.
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_gen_rates_natkey
      ON generation_rates (provider, COALESCE(quality, ''), COALESCE(duration_s, -1))
    `);

    // Reconcile every canonical row on every boot — keeps prices in
    // lockstep with the architecture doc when we add or reprice a row.
    for (const r of RATES) {
      await db.execute(sql`
        INSERT INTO generation_rates (provider, quality, duration_s, gc_cost, api_cost_usd, tier, is_active, updated_at)
        VALUES (${r.provider}, ${r.quality}, ${r.durationS}, ${r.gcCost}, ${r.apiCostUSD}, ${r.tier}, true, NOW())
        ON CONFLICT (provider, COALESCE(quality, ''), COALESCE(duration_s, -1))
        DO UPDATE SET
          gc_cost = EXCLUDED.gc_cost,
          api_cost_usd = EXCLUDED.api_cost_usd,
          tier = EXCLUDED.tier,
          is_active = true,
          updated_at = NOW()
      `);
    }
    console.log(`[Seed] Generation rates reconciled: ${RATES.length} rows`);
    seeded = true;
  } catch (err: any) {
    console.warn("[Seed] generation_rates seeding skipped:", err?.message);
  }
}
