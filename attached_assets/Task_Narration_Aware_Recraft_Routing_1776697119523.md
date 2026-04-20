# Task: Narration-Aware Recraft Routing + Visual Direction Brand Injection

## What This Fixes

Two related gaps in the current image generation pipeline:

**Gap 1:** Branded text routing only checks the visual direction prompt for keywords.
It misses scenes where the NARRATION mentions a specific named location
("At Origin Holistic at Pine Hill Farm...") but the visual direction never explicitly
describes a sign or text element. Result: a beautiful but anonymous scene with no
environmental branding.

**Gap 2:** The visual direction generation logic does not automatically add environmental
text elements when the narration references a named branded location.
Result: even with Recraft routing, there's nothing to render accurately because
the prompt never asked for a sign.

Both gaps must be fixed together. Gap 1 without Gap 2 = correct routing to Recraft
but Recraft has no text to render. Gap 2 without Gap 1 = text injection added to prompt
but rendered by NB2 which cannot reliably produce accurate text.

---

## Files to Modify

1. `server/utils/recraft-scene-policy.ts`     ← extend requiresTextAccuracy()
2. `server/services/visual-direction.service.ts` (or wherever the visual direction
   prompt is generated — search for the function that calls Claude/OpenAI to produce
   the "VISUAL DIRECTION (AI PROMPT FOR VIDEO GENERATION)" text)
3. `server/services/scene-image.service.ts`   ← wire the new routing order

---

## Task 1: Extend `requiresTextAccuracy()` in recraft-scene-policy.ts

Replace the existing `requiresTextAccuracy` function with this expanded version
that checks BOTH narration and visual direction, in priority order:

```typescript
// server/utils/recraft-scene-policy.ts

export interface SceneTextRoutingResult {
  useRecraft: boolean;
  reason: string;
  needsTextInjection: boolean;   // true = visual direction needs brand text added
  suggestedTextElement?: string; // what to inject if needsTextInjection is true
}

// Brand names and products specific to Pine Hill Farm / Origin.
// Extend this list as new clients are onboarded.
const BRAND_NAMES = [
  'origin', 'pine hill farm', 'pine hill', 'bioscan', 'srt',
  'holistic clinic', 'origin holistic',
];

// Generic location/environment words that imply a branded space
const LOCATION_WORDS = [
  'clinic', 'farm', 'store', 'office', 'practice', 'center', 'centre',
  'studio', 'spa', 'dispensary', 'apothecary',
];

// Visual direction keywords that explicitly describe text in the scene
const VISUAL_TEXT_KEYWORDS = [
  'sign', 'logo', 'label', 'text', 'title', 'packaging', 'bottle label',
  'banner', 'poster', 'nameplate', 'plaque', 'signage', 'brand',
  'reading', 'written', 'inscribed', 'printed',
];

export function evaluateSceneTextRouting(scene: {
  narration?: string;
  visualDirection?: string;
  imagePrompt?: string;
  sceneType?: string;
}): SceneTextRoutingResult {
  const narration = (scene.narration ?? '').toLowerCase();
  const visualDir = (scene.visualDirection ?? scene.imagePrompt ?? '').toLowerCase();
  const sceneType = scene.sceneType ?? '';

  // ── Step 1: Scene type hard-routes to Recraft ──────────────────────────
  if (sceneType === 'cta' || sceneType === 'title_card') {
    return {
      useRecraft: true,
      reason: `scene type "${sceneType}" always uses Recraft`,
      needsTextInjection: false,
    };
  }

  // ── Step 2: Check visual direction for explicit text keywords ──────────
  const visualHasTextKeyword = VISUAL_TEXT_KEYWORDS.some(k => visualDir.includes(k));
  if (visualHasTextKeyword) {
    return {
      useRecraft: true,
      reason: 'visual direction contains text/sign keyword',
      needsTextInjection: false,
    };
  }

  // ── Step 3: Check narration for brand names ────────────────────────────
  const narrationHasBrandName = BRAND_NAMES.some(name => narration.includes(name));

  if (narrationHasBrandName) {
    // Narration references the brand but visual direction has no text element.
    // Route to Recraft AND flag for text injection.
    const detectedBrand = BRAND_NAMES.find(name => narration.includes(name)) ?? '';
    const brandLabel = resolveBrandLabel(detectedBrand);

    return {
      useRecraft: true,
      reason: `narration references brand "${detectedBrand}" — injecting environmental signage`,
      needsTextInjection: true,
      suggestedTextElement: `A handcrafted wooden sign reading "${brandLabel}" is visible on the wall.`,
    };
  }

  // ── Step 4: Check narration for generic location words ────────────────
  const narrationHasLocation = LOCATION_WORDS.some(w => narration.includes(w));
  if (narrationHasLocation) {
    return {
      useRecraft: true,
      reason: 'narration references a named location — may contain environmental text',
      needsTextInjection: false,
    };
  }

  return { useRecraft: false, reason: 'no text indicators found', needsTextInjection: false };
}

// Map detected brand keyword to the correct display label for sign text.
// Add new brand/client mappings here.
function resolveBrandLabel(detectedKeyword: string): string {
  const BRAND_LABELS: Record<string, string> = {
    'origin':           'ORIGIN HOLISTIC CLINIC',
    'origin holistic':  'ORIGIN HOLISTIC CLINIC',
    'holistic clinic':  'ORIGIN HOLISTIC CLINIC',
    'pine hill farm':   'PINE HILL FARM',
    'pine hill':        'PINE HILL FARM',
    'bioscan':          'ORIGIN HOLISTIC CLINIC',  // Bioscan is at Origin
    'srt':              'ORIGIN HOLISTIC CLINIC',
  };
  return BRAND_LABELS[detectedKeyword] ?? detectedKeyword.toUpperCase();
}

// Keep the original function signature for backward compatibility
// (other code may call requiresTextAccuracy directly)
export function requiresTextAccuracy(scene: {
  sceneType?: string;
  visualStyle?: string;
  prompt?: string;
  videoPrompt?: string;
  imagePrompt?: string;
  narration?: string;
  visualDirection?: string;
}): boolean {
  return evaluateSceneTextRouting({
    narration: scene.narration,
    visualDirection: scene.visualDirection ?? scene.imagePrompt ?? scene.prompt,
    sceneType: scene.sceneType,
  }).useRecraft;
}
```

---

## Task 2: Inject Brand Text into Visual Direction

Find the function that generates the visual direction prompt (the "VISUAL DIRECTION
(AI PROMPT FOR VIDEO GENERATION)" text shown in the UI). It likely calls Claude or
OpenAI with a system prompt. Add this injection step AFTER the visual direction
is generated, before it is saved to the database:

```typescript
// After visual direction is generated, check if text injection is needed:

import { evaluateSceneTextRouting } from '../utils/recraft-scene-policy';

// ... inside your visual direction generation function ...

const generatedVisualDirection = await generateVisualDirectionWithAI(scene);

// Check if we need to inject brand environmental text
const routingResult = evaluateSceneTextRouting({
  narration: scene.narration,
  visualDirection: generatedVisualDirection,
  sceneType: scene.sceneType,
});

let finalVisualDirection = generatedVisualDirection;

if (routingResult.needsTextInjection && routingResult.suggestedTextElement) {
  // Append the brand text element to the visual direction
  finalVisualDirection = `${generatedVisualDirection.trimEnd()} ${routingResult.suggestedTextElement}`;
  
  console.log(`[VisualDirection] Brand text injected for scene ${scene.id}: "${routingResult.suggestedTextElement}"`);
}

// Save finalVisualDirection (not the original generatedVisualDirection)
await db.update(scenes).set({
  visualDirection: finalVisualDirection,
}).where(eq(scenes.id, scene.id));
```

---

## Task 3: Wire New Routing into generateSceneImage

In `server/services/scene-image.service.ts`, find the routing decision at the top
of `generateSceneImage`. Replace any existing `requiresTextAccuracy` call with
the new `evaluateSceneTextRouting`:

```typescript
import { evaluateSceneTextRouting } from '../utils/recraft-scene-policy';

// At the start of generateSceneImage, before provider selection:

const routingResult = evaluateSceneTextRouting({
  narration: scene.narration,
  visualDirection: scene.visualDirection ?? scene.imagePrompt,
  sceneType: scene.sceneType,
});

if (routingResult.useRecraft) {
  console.log(`[SceneImage] Scene ${sceneId} → Recraft | reason: ${routingResult.reason}`);
  
  // ... existing Recraft generation code ...
  // (no change needed here — just ensure this block runs when useRecraft is true)
}
```

---

## Verification

Test with Scene 3 from the Deep Dive video:

```
Narration:  "At Origin Holistic at Pine Hill Farm, the Bioscan SRT shows you 
             what your body is actually responding to..."

Visual Direction (as currently generated — no sign mentioned):
            "Pixar-style 3D animated — Medium shot of sun-drenched wellness
             consultation room..."
```

Expected results after this task:

1. `evaluateSceneTextRouting` returns:
   ```
   { useRecraft: true, reason: "narration references brand 'origin holistic'...",
     needsTextInjection: true,
     suggestedTextElement: "A handcrafted wooden sign reading 'ORIGIN HOLISTIC CLINIC' is visible on the wall." }
   ```

2. Visual direction saved to DB ends with:
   ```
   "...octane render quality. A handcrafted wooden sign reading 'ORIGIN HOLISTIC CLINIC' is visible on the wall."
   ```

3. Scene image routes to Recraft V3 (not NB2)

4. Generated image shows "ORIGIN HOLISTIC CLINIC" legibly on a sign in the background

5. Logs show:
   ```
   [VisualDirection] Brand text injected for scene 3: "A handcrafted wooden sign..."
   [SceneImage] Scene 3 → Recraft | reason: narration references brand "origin holistic"...
   ```

---

## Success Criteria

- [ ] Scene 3 (Bioscan narration) routes to Recraft without any visual direction keyword
- [ ] "ORIGIN HOLISTIC CLINIC" sign appears legibly in Scene 3's generated image
- [ ] Visual direction for Scene 3 in the DB ends with the injected text element
- [ ] CTA and title_card scene types still hard-route to Recraft (unchanged)
- [ ] Scenes with no brand indicators still route to NB2 (unchanged)
- [ ] `requiresTextAccuracy()` still works for any code calling the old signature
- [ ] No TypeScript errors
