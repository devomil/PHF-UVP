// Per-scene duration control. Renders a 4-15s slider for Seedance 2 and
// discrete preset buttons for every other provider (only durations the
// provider actually accepts). Parent persists via `onChange`.

import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Clock, Loader2 } from "lucide-react";
import {
  clampSeedance2Duration,
  SEEDANCE_2_DEFAULT_DURATION,
} from "./seedance-duration";
import { VIDEO_PROVIDERS } from "@shared/provider-config";

export type ResolvedProvider =
  | "seedance-2.0"
  | "seedance-2.0-fast"
  | "seedance-1.0"
  | "kling"
  | "kling-2.6"
  | "kling-2.6-pro"
  | "luma"
  | "hailuo"
  | "veo-3"
  | "veo-3.1"
  | "wan-2.1"
  | "wan-2.6"
  | "hunyuan"
  | "sora-2"
  | "sora-2-pro"
  | "runway"
  | "runway-4.5"
  | (string & {});

// Per-provider duration buckets. Keep these conservative — every value
// here is one we know the provider accepts. The seedance-2 slider is
// handled separately (continuous slider).
const PROVIDER_RANGES: Record<string, { min: number; max: number; presets: number[] }> = {
  "seedance-1.0": { min: 5, max: 5, presets: [5] },
  kling: { min: 5, max: 10, presets: [5, 10] },
  "kling-2.6": { min: 5, max: 10, presets: [5, 10] },
  "kling-2.6-pro": { min: 5, max: 10, presets: [5, 10] },
  luma: { min: 5, max: 9, presets: [5, 9] },
  hailuo: { min: 6, max: 6, presets: [6] },
  "veo-3": { min: 8, max: 8, presets: [8] },
  "veo-3.1": { min: 8, max: 8, presets: [8] },
  "wan-2.1": { min: 5, max: 5, presets: [5] },
  "wan-2.6": { min: 5, max: 5, presets: [5] },
  hunyuan: { min: 5, max: 5, presets: [5] },
  "sora-2": { min: 4, max: 12, presets: [4, 8, 12] },
  "sora-2-pro": { min: 4, max: 12, presets: [4, 8, 12] },
  runway: { min: 5, max: 10, presets: [5, 10] },
  "runway-4.5": { min: 5, max: 10, presets: [5, 10] },
};

// Cost rate is read from the shared provider catalog so UI/server stay
// in sync. Returns undefined when the provider isn't in the catalog.
function getCostPerSecond(providerKey: string | undefined): number | undefined {
  if (!providerKey) return undefined;
  return VIDEO_PROVIDERS[providerKey]?.costPerSecond;
}

const SEEDANCE_2_PROVIDERS = new Set(["seedance-2.0", "seedance-2.0-fast"]);

function formatUsd(amount: number): string {
  // Sub-cent values are confusing as "$0.00" — show 3 decimals when small.
  if (amount < 0.10) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

interface Props {
  provider: ResolvedProvider | undefined;
  value: number;
  onChange: (next: number) => void | Promise<void>;
  disabled?: boolean;
}

export function SceneDurationControl({ provider, value, onChange, disabled }: Props) {
  const [saving, setSaving] = useState(false);
  const [localValue, setLocalValue] = useState<number>(value);

  // Keep local slider state in sync when the parent value changes from
  // outside (e.g. bulk action from the project header).
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const isSeedance2 = provider ? SEEDANCE_2_PROVIDERS.has(provider) : false;
  const ratePerSecond = getCostPerSecond(provider);

  async function commit(next: number) {
    if (next === value) return;
    setSaving(true);
    try {
      await onChange(next);
    } finally {
      setSaving(false);
    }
  }

  if (isSeedance2) {
    const clamped = clampSeedance2Duration(localValue);
    const sceneCost = ratePerSecond !== undefined ? clamped * ratePerSecond : null;
    return (
      <div className="space-y-2 p-3 bg-muted/50 rounded-lg" data-testid="scene-duration-control-seedance">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          Scene Duration
          {saving && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          )}
        </Label>
        <div className="flex items-center gap-3">
          <Slider
            value={[clamped]}
            min={4}
            max={15}
            step={1}
            disabled={disabled}
            onValueChange={(vals) =>
              setLocalValue(vals[0] ?? SEEDANCE_2_DEFAULT_DURATION)
            }
            onValueCommit={(vals) =>
              commit(
                clampSeedance2Duration(vals[0] ?? SEEDANCE_2_DEFAULT_DURATION),
              )
            }
            className="flex-1"
            data-testid="scene-duration-slider"
          />
          <span
            className="w-12 text-right text-sm tabular-nums font-medium"
            data-testid="scene-duration-readout"
          >
            {clamped}s
          </span>
        </div>
        {sceneCost !== null && ratePerSecond !== undefined && (
          <div
            className="flex items-center justify-between text-xs text-muted-foreground"
            data-testid="scene-duration-cost"
          >
            <span>~{formatUsd(ratePerSecond)} / s</span>
            <span className="tabular-nums font-medium">
              ~{formatUsd(sceneCost)} / scene
            </span>
          </div>
        )}
        <p className="text-xs text-muted-foreground" data-testid="scene-duration-hint">
          {clamped <= 5
            ? "Snappy — best for hooks, social, and CTAs."
            : clamped >= 13
            ? "Long takes cost more credits and take longer to render."
            : "Seedance 2 supports any duration from 4 to 15 seconds."}
        </p>
      </div>
    );
  }

  // Non-Seedance-2 providers: discrete preset buttons.
  const providerKey = provider ?? "";
  const range = PROVIDER_RANGES[providerKey] || { min: 5, max: 10, presets: [5, 8, 10] };
  const presets = range.presets;
  const sceneCost = ratePerSecond !== undefined ? value * ratePerSecond : null;

  return (
    <div className="space-y-2 p-3 bg-muted/50 rounded-lg" data-testid="scene-duration-control-buttons">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Clock className="w-4 h-4 text-muted-foreground" />
        Scene Duration
        {saving && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </span>
        )}
      </Label>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const active = value === preset;
          return (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              disabled={disabled || saving}
              onClick={() => commit(preset)}
              data-testid={`scene-duration-preset-${preset}`}
              aria-pressed={active}
            >
              {preset}s
            </Button>
          );
        })}
      </div>
      {sceneCost !== null && ratePerSecond !== undefined && (
        <div
          className="flex items-center justify-between text-xs text-muted-foreground"
          data-testid="scene-duration-cost"
        >
          <span>~{formatUsd(ratePerSecond)} / s</span>
          <span className="tabular-nums font-medium">
            ~{formatUsd(sceneCost)} / scene
          </span>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {provider
          ? `${provider} supports ${presets.join(", ")} second clips.`
          : "Choose a duration supported by your video model."}
      </p>
    </div>
  );
}
