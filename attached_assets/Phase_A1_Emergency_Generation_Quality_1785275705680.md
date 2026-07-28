# Phase A1 — Emergency Generation Quality

**Target repo:** `devomil/PHF-UVP`
**Depends on:** Phase 0 complete
**Blocks:** Phase A2 (RenderIntent)
**Estimated scope:** four bounded edits across three files. No new abstractions, no new files, no schema changes.

---

## Objective

Fix four defects in the generation path that cause the platform to send degraded instructions to providers despite a high-quality upstream script pipeline. Each task is **independently committable and independently verifiable** — commit and verify after each one. If time runs out, stopping after any completed task leaves the system in a better and consistent state.

This phase is deliberately surgical. It does not restructure the pipeline. That is Phase A2.

---

## Context an agent needs

Stage 4 of `script-pipeline-service.ts` authors high-quality per-scene prompts: a still-image `imagePrompt`, a motion-only `motionPrompt`, a `providerHint`, and a per-scene `negativePrompt`. By the time those reach a provider API, four separate mechanisms have degraded them. This phase fixes the four worst.

**Do not "improve" the Stage 4 prompts.** They are not the problem.

---

## Out of scope

Explicitly deferred. Do not attempt any of these, even if the code appears to invite it:

- Introducing a `RenderIntent` type or any unified prompt object (Phase A2)
- Removing `applyStyleToPrompt`, `promptEnhancementService`, or `optimizePrompt` (Phase A2)
- Per-provider cfg tables or a provider capability matrix (Phase A3)
- Batching the provider-selection LLM call (Phase A3)
- Unifying the I2V and T2V prompt contracts (Phase A3)
- Removing `.split('-')[0]` from routing code (Phase A3)
- Collapsing art presets and visual styles into one taxonomy (Phase A4)
- Any change to `script-pipeline-service.ts`
- Any UI change

---

## Task A1-1 — Kling I2V: correct the cfg_scale and animation-style defaults

**File:** `server/services/piapi-video-service.ts`
**Location:** the Kling I2V branch, approximately lines 1762–1792
**Scope note:** This block is **Kling-only**. Seedance 2 I2V uses `omni_reference` / `first_last_frames` and takes no `cfg_scale`. Do not add `cfg_scale` to any non-Kling payload.

### The defect

Two wrong defaults on the pipeline path, where `options.i2vSettings` is `undefined`:

1. `imageControlStrength ?? 1.0` produces `cfgScale = Math.max(0.1, 0.5 - 0.4) = 0.10`. Per the existing comment on line 1777, `0.0` means "preserve source exactly." So the motion prompt is almost entirely suppressed for every Kling-routed scene — human subjects, faces, testimonials, and all ultra/premium tier routing.
2. `animationStyle ?? 'product-hero'` frames every unset scene as *"slow smooth push towards product, steady focus"* — including landscapes, portraits, and abstract scenes that contain no product.

The Asset Library dialog does populate `i2vSettings`, so explicit user choices are unaffected by both bugs. Only the main pipeline is affected.

### The change

Replace lines 1766–1792 with:

```ts
// cfg_scale defaults per animation style.
//
// The 0.25 ceiling on product styles is empirical: above it, Kling
// reimagines the product and returns the wrong bottle or label. That
// finding applies to shots with a product to protect. Non-product
// styles deliberately sit above it, because suppressing the prompt to
// protect a product that isn't in frame is what made general scenes inert.
const CFG_BY_ANIMATION_STYLE: Record<string, number> = {
  'product-static': 0.15,
  'product-hero':   0.20,
  'subtle-motion':  0.40,
  'dynamic':        0.55,
};
const CFG_FALLBACK = 0.40;

const explicitFidelity = options.i2vSettings?.imageControlStrength;
const motionStrength = options.i2vSettings?.motionStrength ?? 0.3;

// Pipeline scenes arrive with no i2vSettings. 'product-hero' was the wrong
// neutral default — it framed every scene as a product push-in.
let animationStyle = options.i2vSettings?.animationStyle ?? 'subtle-motion';
if (!options.i2vSettings?.animationStyle && hasActionPrompt(sanitizedPrompt)) {
  animationStyle = 'dynamic';
  console.log(`[PiAPI I2V] Action prompt detected — animation style → dynamic`);
}

// Precedence: explicit user slider > animation-style default > stylized floor.
let cfgScale: number;
let cfgSource: string;
if (explicitFidelity !== undefined) {
  cfgScale = Math.max(0.1, 0.5 - explicitFidelity * 0.4);
  cfgSource = `user fidelity slider (${explicitFidelity})`;
} else {
  cfgScale = CFG_BY_ANIMATION_STYLE[animationStyle] ?? CFG_FALLBACK;
  cfgSource = `animationStyle default (${animationStyle})`;
}

// Stylized floor — unchanged behavior, raises cfg only, never lowers it.
if (options.artPresetId && isStylizedPreset(options.artPresetId)) {
  const targetCfg = options.isCharacterReference ? STYLIZED_CHARACTER_CFG : STYLIZED_ENVIRONMENT_CFG;
  const stylizedCfg = Math.max(cfgScale, targetCfg);
  if (stylizedCfg !== cfgScale) {
    const tier = options.isCharacterReference ? 'character' : 'environment';
    console.log(`[PiAPI I2V] Stylized preset cfg override (${tier}): ${cfgScale.toFixed(2)} → ${stylizedCfg.toFixed(2)}`);
    cfgScale = stylizedCfg;
    cfgSource = `stylized floor (${tier})`;
  }
}

console.log(`[PiAPI I2V] cfg=${cfgScale.toFixed(2)} via ${cfgSource}, motion=${motionStrength}, style=${animationStyle}`);
```

Leave `motionDirectiveMap` and everything after it unchanged. Remove the now-duplicated `console.log` on the old line 1807 that reported `fidelity=... → cfg=...`, since the new log supersedes it.

### Verification

Generate one **human-subject** I2V scene through the normal pipeline (no Asset Library settings). Server log must show:

```
[PiAPI I2V] cfg=0.40 via animationStyle default (subtle-motion), ...
```

Then generate one Asset Library I2V with the fidelity slider at maximum. Log must show `via user fidelity slider (1)` and `cfg=0.10`. Both paths must work.

---

## Task A1-2 — Stop truncating prompts mid-sentence

**File:** `server/services/ai-video-service.ts`
**Location:** approximately lines 363–386

### The defect

`FINAL_MAX_WORDS` is 120 for non-stylized scenes. By the time the enforcement runs, four layers have appended to Stage 4's 50–80 word prompt. The overflow is then cut with `middleWords.slice(0, allowedMiddleWords).join(' ')` — a mid-sentence guillotine. Style boilerplate is protected; the actual scene description is what gets cut.

### The change

Two edits.

**1. Raise the non-stylized ceiling.** Change:

```ts
const FINAL_MAX_WORDS = isStylizedArt ? 250 : 120;
```

to:

```ts
const FINAL_MAX_WORDS = isStylizedArt ? 250 : 200;
```

**2. Truncate on sentence boundaries and log what was lost.** Replace:

```ts
if (middleWords.length > allowedMiddleWords) {
  middleContent = middleWords.slice(0, allowedMiddleWords).join(' ');
}
```

with:

```ts
if (middleWords.length > allowedMiddleWords) {
  const sentences = middleContent.match(/[^.!?]+[.!?]+\s*/g) || [];
  let kept = '';
  let keptWords = 0;
  for (const s of sentences) {
    const w = s.trim().split(/\s+/).filter(Boolean).length;
    if (keptWords + w > allowedMiddleWords && kept) break;
    kept += s;
    keptWords += w;
  }
  // Fallback: no sentence boundary fits the budget (e.g. one very long
  // clause). Preserve the old behavior rather than emitting an empty prompt.
  if (!kept.trim()) {
    kept = middleWords.slice(0, allowedMiddleWords).join(' ');
    keptWords = allowedMiddleWords;
  }
  const dropped = middleContent.slice(kept.length).trim();
  if (dropped) {
    console.warn(
      `[AIVideo] PROMPT TRUNCATED: ${middleWords.length} → ${keptWords} words ` +
      `(limit ${FINAL_MAX_WORDS}, stylized=${isStylizedArt}). DROPPED: "${dropped}"`
    );
  }
  middleContent = kept.trim();
}
```

The `console.warn` is not decoration. It is the measurement that decides how aggressively Phase A2 deletes the intermediate prompt layers. Do not downgrade it to `console.log` or remove the dropped text from the message.

### Verification

Run one long-narration non-stylized scene. Either no truncation warning appears (good), or the warning appears and the dropped text is a complete trailing sentence, never a fragment ending mid-word.

---

## Task A1-3 — Stop asking the selector for providers it cannot have

**Files:** `server/services/intelligent-provider-selector.ts`, `server/services/ai-video-service.ts`

### The defect

`buildAnalysisPrompt` tells Claude that Runway 4.5 is the correct choice for cinematic, dramatic, and hero content, and lists it second in the preference order. `ai-video-service.ts` (approximately lines 519–531) then strips every Runway model from the order unless the user explicitly selected one. The cost guard is correct. Its placement is not: a paid LLM call returns an answer that the next function discards, and the highest-value content class silently falls through to whatever was next in the list.

### The change

**1. In `intelligent-provider-selector.ts`,** add an optional parameter to `buildAnalysisPrompt` and to `recommendProviderForScene`:

```ts
private buildAnalysisPrompt(scenes: SceneContent[], availableProviders?: string[]): string {
```

Immediately before the `Respond with ONLY a JSON array` line, insert:

```ts
${availableProviders?.length ? `
AVAILABLE PROVIDERS FOR THIS REQUEST: ${availableProviders.join(', ')}
You MUST choose both recommendedProvider and fallbackProvider from that list only.
Any provider outside that list is unavailable and your recommendation will be discarded.
` : ''}
```

Thread `availableProviders` through `recommendProviderForScene` to `buildAnalysisPrompt`. Do not change the provider descriptions or the classification guide.

**2. In `ai-video-service.ts`,** inside `getIntelligentProviderRecommendation` (approximately line 872), compute the allowed set before calling the selector:

```ts
const isExplicitRunway = !!options.preferredProvider &&
  options.preferredProvider !== 'auto' &&
  (AI_VIDEO_PROVIDERS[options.preferredProvider]?.apiProvider === 'runway' ||
   runwayVideoService.isRunwayModel(options.preferredProvider));

const selectableProviders = Array.from(new Set(
  configuredProviders
    .filter(p => {
      if (isExplicitRunway) return true;
      const prov = AI_VIDEO_PROVIDERS[p];
      return !(prov?.apiProvider === 'runway' || runwayVideoService.isRunwayModel(p));
    })
    .map(p => p.split('-')[0])   // selector reasons in provider families, not versions
));

const result = await intelligentProviderSelector.recommendProviderForScene(
  sceneContent,
  selectableProviders,
);
```

### Behavior contract for this task

**Keep the existing `runwaySafeOrder` filter at lines 519–531.** It is now a backstop rather than the primary guard. Deleting it would let a Runway model reach generation through the art-preset hierarchy or scene-type map, which do not go through the selector. Both layers stay.

### Verification

Generate a cinematic scene with no explicit provider. The selector log line must not name a Runway model, and the `⚡ Runway provider blocked from auto-routing` warning must no longer fire on that path.

---

## Task A1-4 — Resolve the provider before optimizing the prompt for it

**File:** `server/services/ai-video-service.ts`
**Risk:** highest in this phase. Do this last, and commit the previous three first.

### The defect

Line 321:

```ts
const rawProvider = options.preferredProvider && options.preferredProvider !== 'auto' ? options.preferredProvider : 'seedance';
const normalizedProvider = rawProvider.split('-')[0];
```

`normalizedProvider` is passed to `optimizePrompt({ provider })`, which applies provider-specific phrasing. But provider selection does not run until line 396. On the `auto` path — every pipeline-generated scene — the prompt is formatted for **Seedance** and then routed to Kling, Veo, Sora, Wan, or Hailuo.

### The change

Extract the provider-resolution block into a method and call it **before** the prompt build.

**1. Extract.** Move the block currently spanning approximately lines 396–534 (from `let providerOrder: string[];` through the `circuitFilteredOrder` assignment) into a new private method:

```ts
private async resolveProviderOrder(
  options: AIVideoOptions,
  contentType: string,
  artPreset: VisualArtPreset | null,
  contentTag: SceneContentTag | null,
  styleConfig: VisualStyleConfig,
  configuredProviders: string[],
  qualityTier: 'ultra' | 'premium' | 'standard' | 'draft',
): Promise<string[]>
```

It returns `circuitFilteredOrder`.

Inside the extracted method, every reference to `enhancedOptions` becomes `options`. This is safe and must not change semantics: the extracted block only reads `enhancedOptions.preferredProvider` and `enhancedOptions.sceneType`, and the prompt build assigns only `prompt`, `negativePrompt`, and `contentType` — it never touches those two fields.

**2. Call it early.** In `generateVideo`, immediately after `isStylizedArt` is computed (approximately line 241) and **before** the `if (generationMode === 'i2v')` branch:

```ts
const qualityTier = options.qualityTier || 'standard';
const providerOrder = await this.resolveProviderOrder(
  options, contentType, artPreset, contentTag, styleConfig, configuredProviders, qualityTier,
);
```

Delete the now-duplicated `const qualityTier = ...` from its old position.

**3. Use the real provider.** Replace lines 321–322 with:

```ts
// The provider is already resolved. optimizePrompt formats for a provider
// FAMILY, so reducing the version here is intentional — unlike the routing
// code, where .split('-') discards a deliberate model choice.
const normalizedProvider = (providerOrder[0] ?? 'seedance').split('-')[0];
```

**4. Use the resolved order in the generation loop.** The `for (const providerKey of circuitFilteredOrder)` loop becomes `for (const providerKey of providerOrder)`. Remove the now-dead local declarations that the extraction consumed.

### Behavior contract for this task

1. **This is a pure move.** Do not change any logic inside the extracted block — not the precedence order, not the tier remapping, not the `.split('-')` calls at lines 480 and 917, not the circuit breaker, not the Runway guard. All of that is Phase A3. The only permitted edit inside the moved code is `enhancedOptions` → `options`.
2. **Do not reorder the layers.** The current precedence is: explicit selection → provider hint → intelligent selection → style defaults, then reordered by art-preset hierarchy, then scene-type map, then content tag. That precedence is undocumented and probably wrong, but changing it here would make it impossible to tell whether a quality change came from A1-4 or from a reordering. A3 documents and fixes it.
3. **The intelligent-selection LLM call now happens earlier in the function.** That is expected. It reads `options.prompt`, the raw Stage 4 output, exactly as it did before.
4. **Do not memoize or cache the call.** Phase A3.

### Verification

Generate one auto-routed scene. The log must show the resolved provider **before** `[AIVideo] Original prompt` / `[PromptEnhance]`, and the provider named in `[AIVideo] Trying <provider>` must match the family the prompt was optimized for. Add a temporary log line if needed to confirm, then remove it.

---

## Success criteria

- [ ] A1-1: pipeline Kling I2V logs `cfg=0.40 via animationStyle default (subtle-motion)`
- [ ] A1-1: Asset Library fidelity slider still logs `via user fidelity slider` and reaches `cfg=0.10` at max
- [ ] A1-1: stylized presets still reach 0.75 / 0.85 via the floor
- [ ] A1-1: no `cfg_scale` added to any non-Kling payload
- [ ] A1-2: truncation, when it occurs, ends on a sentence boundary
- [ ] A1-2: `PROMPT TRUNCATED` warning includes the dropped text
- [ ] A1-3: selector no longer recommends Runway on auto-routed scenes
- [ ] A1-3: `runwaySafeOrder` backstop still present in the file
- [ ] A1-4: provider resolution logs precede prompt-optimization logs
- [ ] A1-4: prompt is optimized for the provider that actually generates
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` succeeds
- [ ] One full multi-scene project generates end to end with no regression

---

## Operational warning — read before demoing

A1-1 and A1-4 change the character of generated output. **Scenes rendered before this phase and scenes rendered after it will not match.** Regenerating a single scene inside an existing project will produce a visibly different look from its neighbours.

After this phase ships: regenerate **whole projects**, not individual scenes, before showing anything to a client.

---

## Suggested A/B evidence

Worth capturing while verifying A1-1, both as proof the fix worked and as a before/after demo asset:

Take one human-subject I2V scene. Generate it twice through Kling with an identical source image and identical motion prompt — once at `cfg_scale 0.10`, once at `0.40`. If the 0.40 version follows the motion direction and the 0.10 version sits nearly static, S2 is confirmed and the magnitude is visible in a single side-by-side.

---

## Completion report

Reply with, per task:

- Files and line ranges touched
- The verification log lines, pasted verbatim
- Any place the real code diverged from what this document describes — line numbers here are approximate and the file may have moved
- Anything encountered that this document did not anticipate
