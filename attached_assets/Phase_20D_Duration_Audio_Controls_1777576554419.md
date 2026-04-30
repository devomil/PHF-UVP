# Phase 20D: Duration Slider + Native Audio Controls

## Priority: MEDIUM
## Dependency: Phase 20A must be complete
## Estimated Time: 2-3 hours

---

## What This Phase Builds

1. Per-scene duration slider replacing fixed 5/10/15s buttons (4–15s range)
2. Per-scene native audio toggle (default OFF, opt-in for ambient B-roll scenes)
3. Duration validation guard on the Seedance 2 payload (enforces 4–15 integer)

---

## Context on Native Audio

Seedance 2 can generate synchronized audio (music, ambient sound, dialogue) natively in a single generation pass. This is architecturally powerful but creates a conflict in NeuralCut's existing pipeline:

```
NeuralCut audio pipeline (current):
  Script → OpenAI TTS voiceover → Remotion SoundDesignLayer → ducked background music

Seedance 2 native audio:
  Prompt → video + embedded audio (music + ambient) in a single mp4
```

If both are active simultaneously, the Remotion composition will have TWO audio tracks — the embedded Seedance audio AND the OpenAI TTS layer. This produces a muddy mix.

**Decision:** `generate_audio: false` is the correct default for ALL scenes with voiceover. Native audio is only appropriate for:
- B-roll scenes with no voiceover (e.g. a nature/lifestyle scene between voiceover scenes)
- Scenes where ambient sound enhances the experience and no voiceover will play

The UI must make this tradeoff visible. If a scene has `generate_audio: true` AND `hasVoiceover: true`, show a warning.

---

## Task 1: Add Duration and Audio Fields to Scenes

The `duration` field likely already exists on scenes. Confirm it exists and supports arbitrary integers:

```typescript
// Verify in shared/schema.ts — scenes table should have:
duration: integer('duration').default(8).notNull(),
// If duration only supports 5/10/15 (stored as enum or limited integer), update it

// Add native audio field:
generateNativeAudio: boolean('generate_native_audio').default(false).notNull(),
```

Run migration if schema changed:
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## Task 2: Update Seedance 2 Payload to Use Scene-Level Audio Flag

In `piapi-video-service.ts`, update all Seedance 2 payload builders to read the `generate_audio` flag from the options rather than hardcoding `false`:

```typescript
// In buildT2VRequestBody Seedance 2 section:
input: {
  prompt: options.prompt,
  generation_mode: 'text_to_video',
  duration: clampedDuration,
  aspect_ratio: options.aspectRatio ?? '16:9',
  resolution: '1080p',
  // Use the scene-level flag — defaults to false unless explicitly enabled
  generate_audio: options.generateNativeAudio === true ? true : false,
},

// Same change in buildI2VRequestBody, generateSeedance2WithContinuity,
// and generateSeedance2WithBrandReference — all should read this flag.
```

Update `VideoGenerationOptions` type to include the field:

```typescript
interface VideoGenerationOptions {
  // ... existing fields ...
  generateNativeAudio?: boolean;  // Default: false. True = Seedance generates embedded audio.
}
```

---

## Task 3: Duration Validation Helper

Add a shared utility to enforce the 4–15s integer constraint:

```typescript
// server/utils/duration.ts

/**
 * Clamp and round a duration value to Seedance 2's valid range (4–15 integer seconds).
 * Other providers have different constraints — this helper is Seedance-specific.
 */
export function clampSeedance2Duration(input: number | undefined | null): number {
  if (!input || isNaN(input)) return 8; // Default: 8 seconds
  return Math.max(4, Math.min(15, Math.round(input)));
}

/**
 * Validate that a requested duration fits within the 4–15s constraint.
 * Returns an error string if invalid, null if valid.
 */
export function validateSeedance2Duration(duration: number): string | null {
  if (duration < 4) return `Duration must be at least 4 seconds (got ${duration})`;
  if (duration > 15) return `Duration must be at most 15 seconds (got ${duration})`;
  if (!Number.isInteger(duration)) return `Duration must be an integer (got ${duration})`;
  return null;
}
```

---

## Task 4: Duration Slider UI Component

Replace the existing fixed-duration buttons with a slider component. Find the current scene duration control in the scene editor and replace it:

```tsx
// client/src/components/scene/SceneDurationControl.tsx

interface SceneDurationControlProps {
  value: number;
  onChange: (seconds: number) => void;
  provider?: string;   // Passed to show provider-specific range info
}

const PROVIDER_RANGES = {
  'seedance-2': { min: 4, max: 15, step: 1 },
  'seedance-2-fast': { min: 4, max: 15, step: 1 },
  'kling': { min: 5, max: 10, step: 5 },
  'runway': { min: 5, max: 10, step: 5 },
  'default': { min: 5, max: 15, step: 5 },
} as const;

export function SceneDurationControl({ value, onChange, provider = 'default' }: SceneDurationControlProps) {
  const isSeedance = provider?.startsWith('seedance-2');
  const range = PROVIDER_RANGES[provider as keyof typeof PROVIDER_RANGES]
    ?? PROVIDER_RANGES.default;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Scene duration
        </label>
        <span className="text-sm font-medium tabular-nums">
          {value}s
        </span>
      </div>

      {isSeedance ? (
        // Seedance: continuous slider, 4-15s
        <div className="space-y-1">
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={range.step}
            value={value}
            onChange={e => onChange(parseInt(e.target.value, 10))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{range.min}s</span>
            <span>8s</span>
            <span>{range.max}s</span>
          </div>
        </div>
      ) : (
        // Other providers: fixed option buttons
        <div className="flex gap-2">
          {[5, 10, 15].filter(d => d >= range.min && d <= range.max).map(d => (
            <button
              key={d}
              onClick={() => onChange(d)}
              className={`
                flex-1 py-1.5 text-sm rounded border transition-colors
                ${value === d
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted'}
              `}
            >
              {d}s
            </button>
          ))}
        </div>
      )}

      {isSeedance && value <= 5 && (
        <p className="text-xs text-muted-foreground">
          Short clips work well for fast-cut social content.
        </p>
      )}
      {isSeedance && value >= 13 && (
        <p className="text-xs text-muted-foreground">
          Longer scenes suit hero/cinematic storytelling moments.
        </p>
      )}
    </div>
  );
}
```

---

## Task 5: Native Audio Toggle UI Component

```tsx
// client/src/components/scene/NativeAudioToggle.tsx

interface NativeAudioToggleProps {
  enabled: boolean;
  hasVoiceover: boolean;
  onChange: (enabled: boolean) => void;
}

export function NativeAudioToggle({ enabled, hasVoiceover, onChange }: NativeAudioToggleProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium">Native audio</p>
          <p className="text-xs text-muted-foreground">
            Seedance generates ambient sound for this scene
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => onChange(!enabled)}
          className={`
            relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors
            ${enabled ? 'bg-blue-500 border-blue-500' : 'bg-muted border-border'}
          `}
        >
          <span
            className={`
              pointer-events-none block h-4 w-4 rounded-full bg-white shadow
              transition-transform mt-0.5
              ${enabled ? 'translate-x-4' : 'translate-x-0.5'}
            `}
          />
        </button>
      </div>

      {/* Conflict warning: native audio + voiceover active simultaneously */}
      {enabled && hasVoiceover && (
        <div className="flex items-start gap-2 p-2.5 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <span className="text-amber-600 dark:text-amber-400 mt-0.5" style={{ fontSize: 14 }}>⚠</span>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            This scene has voiceover enabled. Native audio may conflict with the voiceover
            in the final mix. Consider disabling native audio for scenes with spoken content.
          </p>
        </div>
      )}

      {enabled && !hasVoiceover && (
        <p className="text-xs text-muted-foreground">
          Audio will be embedded in the scene video. No separate sound design layer will apply.
        </p>
      )}
    </div>
  );
}
```

---

## Task 6: Update Scene Editor to Use New Controls

Find the scene editor component (likely `SceneEditor.tsx` or similar). Replace the existing duration control and add the native audio toggle:

```tsx
// In your scene editor component, find the duration control and replace/update:

import { SceneDurationControl } from './SceneDurationControl';
import { NativeAudioToggle } from './NativeAudioToggle';

// Determine the provider from the project's visual style
const style = getVisualStyleConfig(project.visualStyle);
const primaryProvider = style.preferredVideoProviders[0];

// Replace existing duration control:
<SceneDurationControl
  value={scene.duration}
  onChange={(seconds) => updateScene(scene.id, { duration: seconds })}
  provider={primaryProvider}
/>

// Add after duration control:
<NativeAudioToggle
  enabled={scene.generateNativeAudio ?? false}
  hasVoiceover={!!scene.voiceoverText}
  onChange={(enabled) => updateScene(scene.id, { generateNativeAudio: enabled })}
/>
```

---

## Task 7: Duration Defaults by Visual Style

When a new scene is created, set a sensible default duration based on the visual style:

```typescript
// server/services/scene-creation.service.ts

const STYLE_DEFAULT_DURATIONS: Record<string, number> = {
  'hero': 12,       // Hero/Cinematic — longer for emotional impact
  'lifestyle': 8,   // Lifestyle — conversational pacing
  'product': 8,     // Product Showcase — measured reveals
  'educational': 10, // Educational — time to explain
  'social': 5,      // Social/Energetic — fast cuts
  'premium': 12,    // Premium — deliberate, unhurried
};

function getDefaultDuration(visualStyle: string): number {
  return STYLE_DEFAULT_DURATIONS[visualStyle] ?? 8;
}
```

---

## Success Criteria

- [ ] `generate_native_audio` column on scenes table
- [ ] All Seedance 2 payload builders read `options.generateNativeAudio` (not hardcoded `false`)
- [ ] `clampSeedance2Duration` applied in all Seedance 2 payload builders
- [ ] Duration slider renders for Seedance 2 provider (4–15s, step 1)
- [ ] Fixed 5/10/15s buttons still render for non-Seedance providers
- [ ] Native audio toggle renders in scene editor
- [ ] Conflict warning appears when native audio ON + voiceover present
- [ ] Default durations set by visual style on scene creation
- [ ] No TypeScript errors

---

## Phase 20 Complete

With 20A + 20B + 20C + 20D complete:

```
NeuralCut video generation:
  Seedance 2 as primary provider across all 6 visual styles
  → Watermark-free outputs
  → Flexible 4-15s per-scene duration
  → Optional seamless transitions (first_last_frames)
  → Brand product as visual anchor (omni_reference)
  → Optional native ambient audio per scene
```

Phase 21 (Nano Banana 2) can begin immediately — it is independent of Phase 20.
