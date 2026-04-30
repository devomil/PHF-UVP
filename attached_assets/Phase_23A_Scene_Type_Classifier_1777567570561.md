# Phase 23A: Scene Type Classifier

## Priority: CRITICAL
## Dependency: None (independent of Phases 20-22)
## Estimated Time: 3-4 hours
## Unlocks: Phase 23B, 24A, 24B, 25A, 25B, 28A, 28B, 28C

---

## What This Phase Builds

A Claude-powered classifier that reads each scene's narration and visual direction
and assigns a **render system type** — determining which pipeline renders the scene.

This is the prerequisite for every subsequent phase that routes scenes to
non-video-model systems: Remotion chapter title templates (24A), infographic
templates (24B), scientific overlay compositing (25), and Motion Graphics (28).

---

## The Two-Layer Classification System

NeuralCut already classifies scenes by **narrative content type** — `hook`, `problem`,
`solution`, `benefit`, `cta`. These describe WHAT story beat the scene serves.

Phase 23A adds a second layer: **render system type** — describing HOW to render it.

```
Narrative content type (EXISTING — do not change):
  hook | problem | solution | benefit | cta | product | lifestyle

Render system type (NEW — Phase 23A):
  ai_video          → Seedance 2 / video model (default for most scenes)
  title_card        → Remotion animated chapter title
  infographic       → Remotion data visualization / comparison
  scientific_medical → Recraft V3 text + scientific overlay library
  brand_environment → Recraft V3 text_layout (clinic/store signage scenes)
  product_showcase  → Seedance 2 omni_reference with product anchor
  ugc_avatar        → UGC talking-head pipeline (Phase 27 — future)
```

These two layers are orthogonal. A `solution` scene can be `ai_video`,
`brand_environment`, or `product_showcase` depending on its visual content.
A `hook` scene can be `title_card` if it opens with an animated chapter marker.

---

## Critical Design Principle

**The classifier reads narrative intent, not just keywords.**

The narration-aware Recraft routing (built earlier) does keyword matching — it finds
"clinic" in the narration and routes to Recraft. That is a point fix for one specific
case. Phase 23A is a complete replacement of that logic for new scenes.

The classifier uses Claude to understand context:

- "At Origin Holistic at Pine Hill Farm..." → `brand_environment` (named location)
- "The Sugar Problem: Natural Sugars vs Added Sugars" → `title_card` (chapter marker)
- "Blood glucose spikes, triggering insulin release" → `scientific_medical` (body process)
- "Here's how to read a nutrition label" → `infographic` (step-by-step data)
- "Take the Bioscan SRT device from the shelf" → `product_showcase` (product featured)
- "She walks through the farm at golden hour" → `ai_video` (lifestyle scene)

Keyword matching cannot reliably distinguish these. Claude can.

---

## Task 1: Add `renderSystemType` to Scene Schema

### 1a. Add to `shared/video-types.ts`

Find the `Scene` interface and add:

```typescript
// Add to the Scene interface in shared/video-types.ts

export type RenderSystemType =
  | 'ai_video'           // Default: Seedance 2 / video model
  | 'title_card'         // Remotion animated chapter title (Phase 24A)
  | 'infographic'        // Remotion data visualization (Phase 24B)
  | 'scientific_medical' // Recraft V3 + scientific overlay library (Phase 25)
  | 'brand_environment'  // Recraft V3 text_layout — clinic/store signage
  | 'product_showcase'   // Seedance 2 omni_reference with product anchor
  | 'ugc_avatar';        // UGC talking-head (Phase 27 — not yet active)

export interface Scene {
  // ... existing fields ...

  // Render system classification (Phase 23A)
  renderSystemType?: RenderSystemType;

  // Classifier metadata
  classifierConfidence?: number;    // 0.0–1.0 — Claude's stated confidence
  classifierReasoning?: string;     // One sentence explanation for debugging
  classifiedAt?: string;            // ISO timestamp — to detect stale classifications
}
```

### 1b. Add to PATCH allowlist

Find wherever the scenes PATCH endpoint validates/filters request body fields
(likely in `server/services/universal-video-routes.ts` — search for the PATCH
handler for scenes). Add `renderSystemType`, `classifierConfidence`,
`classifierReasoning`, `classifiedAt` to the allowlist.

No database migration needed — scenes are stored as JSONB on
`universal_video_projects.scenes`.

---

## Task 2: Classifier Service

Create `server/services/scene-classifier.service.ts`:

```typescript
// server/services/scene-classifier.service.ts

import Anthropic from '@anthropic-ai/sdk';
import { RenderSystemType, Scene } from '../../shared/video-types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Classification prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a video production classifier for NeuralCut.AI.
Your job is to read a scene's narration and visual direction and classify which
rendering pipeline should produce it.

Return ONLY valid JSON. No explanation outside the JSON object.`;

const CLASSIFICATION_INSTRUCTIONS = `Classify this scene into exactly one render system type.

RENDER SYSTEM TYPES:
- "title_card": Scene is a chapter title, section header, or animated text moment.
  Signals: headline text as the main subject, chapter numbers, "Week X", section titles,
  bold declarative statements meant to appear as on-screen text (e.g. "The Sugar Problem").
  
- "infographic": Scene presents comparative data, lists, statistics, or step-by-step
  information as the primary content. Signals: "X vs Y", numbered steps, statistics,
  charts, labels floating over subjects, side-by-side comparisons.
  
- "scientific_medical": Scene depicts a biological process, anatomy, cellular activity,
  chemical structures, or medical/physiological concepts. Signals: cells, organs, blood,
  metabolism, insulin, inflammation, DNA, molecules, body systems.
  
- "brand_environment": Scene is set in a specific named branded location that should
  display the brand name as readable signage. Signals: named clinic, named store, named
  farm, named practice — where the physical space IS the brand.
  
- "product_showcase": Scene features a specific product as the primary subject, where
  the product's visual appearance (label, packaging, form) must be accurate.
  Signals: product is handled, displayed, or described by name.
  
- "ai_video": Everything else — lifestyle scenes, people in environments, nature,
  emotional moments, B-roll, movement scenes. The default type.
  
- "ugc_avatar": Scene should feature a talking presenter directly addressing camera.
  Signals: "I", "me", direct address, testimonial language. Rare — only classify
  this when the narration is written in first person as a direct testimonial.

RULES:
- When in doubt, classify as "ai_video". It is always a safe fallback.
- "title_card" requires the TEXT ITSELF to be the visual subject — not just a scene
  that mentions a topic.
- "brand_environment" requires a NAMED location (Origin Clinic, Pine Hill Farm) —
  a generic "wellness center" is NOT brand_environment.
- A scene can only have ONE render system type.

Respond with this exact JSON structure:
{
  "renderSystemType": "<type>",
  "confidence": <0.0-1.0>,
  "reasoning": "<one sentence explanation>"
}`;

// ─── Types ────────────────────────────────────────────────────────────────

export interface ClassificationResult {
  renderSystemType: RenderSystemType;
  confidence: number;
  reasoning: string;
}

export interface BatchClassificationResult {
  sceneId: string;
  result: ClassificationResult | null;
  error?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────

export class SceneClassifierService {

  // ─── Classify a single scene ────────────────────────────────────────────

  async classifyScene(scene: {
    id: string;
    narration?: string;
    visualDirection?: string;
    sceneType?: string;   // Existing narrative content type (hook/problem/etc)
  }): Promise<ClassificationResult> {

    const narration = scene.narration?.trim() ?? '';
    const visualDirection = scene.visualDirection?.trim() ?? '';

    if (!narration && !visualDirection) {
      console.log(`[Classifier] Scene ${scene.id}: no content — defaulting to ai_video`);
      return { renderSystemType: 'ai_video', confidence: 0.5, reasoning: 'No content to classify' };
    }

    const userMessage = `SCENE ID: ${scene.id}
NARRATIVE TYPE: ${scene.sceneType ?? 'unknown'}

NARRATION:
${narration || '(none)'}

VISUAL DIRECTION:
${visualDirection || '(none)'}

${CLASSIFICATION_INSTRUCTIONS}`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',  // Haiku: fast + cheap for classification
        max_tokens: 150,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text = response.content[0]?.type === 'text'
        ? response.content[0].text.trim()
        : '';

      // Parse JSON — strip any accidental markdown fences
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);

      const renderSystemType = this.validateType(parsed.renderSystemType);
      const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.7));
      const reasoning = typeof parsed.reasoning === 'string'
        ? parsed.reasoning.substring(0, 200)
        : '';

      console.log(
        `[Classifier] Scene ${scene.id}: ${renderSystemType} ` +
        `(confidence=${confidence.toFixed(2)}) — ${reasoning}`
      );

      return { renderSystemType, confidence, reasoning };

    } catch (err: any) {
      console.error(`[Classifier] Scene ${scene.id} failed:`, err.message);
      // Safe fallback — never block generation on classifier failure
      return {
        renderSystemType: 'ai_video',
        confidence: 0.0,
        reasoning: `Classifier error: ${err.message}`,
      };
    }
  }

  // ─── Classify all scenes in a project ───────────────────────────────────
  // Runs in parallel with a concurrency cap to avoid rate limiting Haiku.

  async classifyProjectScenes(
    scenes: Array<{ id: string; narration?: string; visualDirection?: string; sceneType?: string }>,
    options: {
      forceReclassify?: boolean;
      onProgress?: (sceneId: string, result: ClassificationResult) => void;
    } = {}
  ): Promise<BatchClassificationResult[]> {
    const CONCURRENCY = 5;  // Haiku rate limit is generous — 5 parallel is safe
    const results: BatchClassificationResult[] = [];

    console.log(`[Classifier] Classifying ${scenes.length} scenes (concurrency=${CONCURRENCY})`);

    // Process in batches of CONCURRENCY
    for (let i = 0; i < scenes.length; i += CONCURRENCY) {
      const batch = scenes.slice(i, i + CONCURRENCY);

      const batchResults = await Promise.all(
        batch.map(async (scene) => {
          try {
            const result = await this.classifyScene(scene);
            options.onProgress?.(scene.id, result);
            return { sceneId: scene.id, result };
          } catch (err: any) {
            return {
              sceneId: scene.id,
              result: { renderSystemType: 'ai_video' as RenderSystemType, confidence: 0, reasoning: 'error' },
              error: err.message,
            };
          }
        })
      );

      results.push(...batchResults);
    }

    const distribution = this.summarizeDistribution(results);
    console.log(`[Classifier] Complete. Distribution: ${JSON.stringify(distribution)}`);

    return results;
  }

  // ─── Validate the returned type string ───────────────────────────────────

  private validateType(raw: unknown): RenderSystemType {
    const VALID_TYPES: RenderSystemType[] = [
      'ai_video', 'title_card', 'infographic',
      'scientific_medical', 'brand_environment',
      'product_showcase', 'ugc_avatar',
    ];

    if (typeof raw === 'string' && VALID_TYPES.includes(raw as RenderSystemType)) {
      return raw as RenderSystemType;
    }

    console.warn(`[Classifier] Invalid type "${raw}" — defaulting to ai_video`);
    return 'ai_video';
  }

  // ─── Distribution summary for logging ────────────────────────────────────

  private summarizeDistribution(results: BatchClassificationResult[]): Record<string, number> {
    return results.reduce((acc, r) => {
      const type = r.result?.renderSystemType ?? 'error';
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}

export const sceneClassifierService = new SceneClassifierService();
```

---

## Task 3: Classification API Routes

Add classification endpoints to the existing routes file
(`server/services/universal-video-routes.ts`):

```typescript
// Add these routes alongside existing project/scene routes

import { sceneClassifierService } from '../services/scene-classifier.service';

// ─── POST /api/projects/:projectId/classify-scenes ───────────────────────
// Classifies all scenes in a project. Idempotent — safe to re-run.

router.post('/projects/:projectId/classify-scenes', async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const projectId = req.params.projectId;
  const forceReclassify = req.body.force === true;

  try {
    const project = await getProject(projectId, userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const scenes = project.scenes ?? [];

    // Skip already-classified scenes unless forced
    const scenesToClassify = forceReclassify
      ? scenes
      : scenes.filter(s => !s.renderSystemType || s.classifierConfidence === 0);

    if (scenesToClassify.length === 0) {
      return res.json({
        success: true,
        message: 'All scenes already classified',
        classified: 0,
        skipped: scenes.length,
      });
    }

    console.log(`[Classifier] Project ${projectId}: classifying ${scenesToClassify.length}/${scenes.length} scenes`);

    const results = await sceneClassifierService.classifyProjectScenes(
      scenesToClassify,
      {
        forceReclassify,
        onProgress: async (sceneId, result) => {
          // Write each classification as it completes
          await updateSceneField(projectId, sceneId, {
            renderSystemType: result.renderSystemType,
            classifierConfidence: result.confidence,
            classifierReasoning: result.reasoning,
            classifiedAt: new Date().toISOString(),
          });
        },
      }
    );

    const distribution = results.reduce((acc, r) => {
      const type = r.result?.renderSystemType ?? 'error';
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      classified: results.length,
      skipped: scenes.length - scenesToClassify.length,
      distribution,
    });

  } catch (err: any) {
    console.error('[Classifier] Route error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/projects/:projectId/scenes/:sceneId/classify ──────────────
// Classify (or re-classify) a single scene.

router.post('/projects/:projectId/scenes/:sceneId/classify', async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const { projectId, sceneId } = req.params;

  try {
    const project = await getProject(projectId, userId);
    const scene = project?.scenes?.find((s: any) => s.id === sceneId);
    if (!scene) return res.status(404).json({ error: 'Scene not found' });

    const result = await sceneClassifierService.classifyScene({
      id: scene.id,
      narration: scene.narration,
      visualDirection: scene.visualDirection,
      sceneType: scene.sceneType,
    });

    await updateSceneField(projectId, sceneId, {
      renderSystemType: result.renderSystemType,
      classifierConfidence: result.confidence,
      classifierReasoning: result.reasoning,
      classifiedAt: new Date().toISOString(),
    });

    res.json({ success: true, ...result });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## Task 4: Auto-Classify on Script Parse

In `server/services/script-parser-service.ts`, after scenes are parsed and
saved, trigger classification automatically:

```typescript
// At the end of the parseScript function, after scenes are written:

import { sceneClassifierService } from './scene-classifier.service';

// Auto-classify after parse — fire and forget (don't block script parse response)
// Classification runs async so the user gets their scenes immediately
sceneClassifierService.classifyProjectScenes(parsedScenes, {
  onProgress: async (sceneId, result) => {
    await updateSceneField(projectId, sceneId, {
      renderSystemType: result.renderSystemType,
      classifierConfidence: result.confidence,
      classifierReasoning: result.reasoning,
      classifiedAt: new Date().toISOString(),
    });
  },
}).then(results => {
  const counts = results.reduce((acc, r) => {
    const t = r.result?.renderSystemType ?? 'error';
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`[ScriptParser] Scene classification complete:`, counts);
}).catch(err => {
  // Non-fatal — classification failure never blocks script parsing
  console.error('[ScriptParser] Background classification failed:', err.message);
});
```

---

## Task 5: Scene Card Classification Badge (UI)

Add a small render system type indicator to the scene card in
`client/src/components/video/enhanced-scene-editor.tsx` and the scene list.
This gives Pine Hill Farm visibility into how each scene will render:

```tsx
// client/src/components/video/render-type-badge.tsx

const RENDER_TYPE_CONFIG = {
  ai_video: {
    label: 'AI Video',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    icon: '🎬',
  },
  title_card: {
    label: 'Title Card',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    icon: '✨',
  },
  infographic: {
    label: 'Infographic',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    icon: '📊',
  },
  scientific_medical: {
    label: 'Scientific',
    color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    icon: '🔬',
  },
  brand_environment: {
    label: 'Brand Scene',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    icon: '🏢',
  },
  product_showcase: {
    label: 'Product',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    icon: '📦',
  },
  ugc_avatar: {
    label: 'UGC Avatar',
    color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
    icon: '🎤',
  },
} as const;

interface RenderTypeBadgeProps {
  renderSystemType?: string;
  confidence?: number;
  reasoning?: string;
  showReclassify?: boolean;
  onReclassify?: () => void;
}

export function RenderTypeBadge({
  renderSystemType,
  confidence,
  reasoning,
  showReclassify,
  onReclassify,
}: RenderTypeBadgeProps) {
  if (!renderSystemType) {
    return (
      <span className="text-xs text-muted-foreground px-2 py-0.5 rounded border border-dashed border-border">
        Not classified
      </span>
    );
  }

  const config = RENDER_TYPE_CONFIG[renderSystemType as keyof typeof RENDER_TYPE_CONFIG]
    ?? RENDER_TYPE_CONFIG.ai_video;

  const isLowConfidence = (confidence ?? 1) < 0.6;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${config.color}`}
        title={reasoning}
      >
        <span>{config.icon}</span>
        {config.label}
        {isLowConfidence && <span className="opacity-60">?</span>}
      </span>
      {showReclassify && onReclassify && (
        <button
          onClick={onReclassify}
          className="text-xs text-muted-foreground hover:text-foreground underline"
          title="Re-run classifier for this scene"
        >
          reclassify
        </button>
      )}
    </div>
  );
}
```

Add `RenderTypeBadge` to the scene card and scene editor. Pass
`scene.renderSystemType`, `scene.classifierConfidence`,
`scene.classifierReasoning`.

---

## Task 6: Classifier Override (User Can Correct Misclassifications)

In the scene editor, let users manually override the classifier result:

```tsx
// Inside EnhancedSceneEditor, near the scene type controls:

<div className="space-y-1.5">
  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
    Render system
  </p>
  <RenderTypeBadge
    renderSystemType={scene.renderSystemType}
    confidence={scene.classifierConfidence}
    reasoning={scene.classifierReasoning}
    showReclassify={true}
    onReclassify={() => handleReclassifyScene(scene.id)}
  />
  {/* Manual override select — collapsed by default */}
  <details className="text-xs">
    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
      Override render system
    </summary>
    <select
      value={scene.renderSystemType ?? 'ai_video'}
      onChange={e => updateScene(scene.id, { renderSystemType: e.target.value })}
      className="mt-1.5 w-full text-xs p-1.5 rounded border border-border bg-background"
    >
      <option value="ai_video">🎬 AI Video (default)</option>
      <option value="title_card">✨ Title Card</option>
      <option value="infographic">📊 Infographic</option>
      <option value="scientific_medical">🔬 Scientific / Medical</option>
      <option value="brand_environment">🏢 Brand Environment</option>
      <option value="product_showcase">📦 Product Showcase</option>
    </select>
  </details>
</div>
```

---

## Task 7: Export from Services Index

```typescript
// server/services/index.ts
export { sceneClassifierService, SceneClassifierService } from './scene-classifier.service';
```

---

## Verification

Test with the Pine Hill Farm Deep Dive script. These classifications should all pass:

```typescript
import { sceneClassifierService } from './server/services/scene-classifier.service';

const testCases = [
  {
    id: 'scene-title',
    narration: 'Week 1 Deep Dive: Processed Foods and Sugars',
    visualDirection: 'Bold animated text "WEEK 1 DEEP DIVE" appears over warm kitchen background',
    expected: 'title_card',
  },
  {
    id: 'scene-sugar',
    narration: 'The Sugar Problem: Natural Sugars versus Added Sugars',
    visualDirection: 'Infographic showing natural sugars on the left, added sugars on the right with lightning bolt icons',
    expected: 'infographic',
  },
  {
    id: 'scene-metabolism',
    narration: 'Blood glucose spikes, triggering insulin release, then energy crashes',
    visualDirection: 'Animation of blood cells, insulin molecules, glucose absorption in the digestive system',
    expected: 'scientific_medical',
  },
  {
    id: 'scene-origin',
    narration: 'At Origin Holistic at Pine Hill Farm, the Bioscan SRT shows what your body is responding to',
    visualDirection: 'Wellness consultation room with wood beams, practitioner at desk, Bioscan device on table',
    expected: 'brand_environment',
  },
  {
    id: 'scene-lifestyle',
    narration: 'She opens the refrigerator and reaches for the bowl of fresh vegetables',
    visualDirection: 'Warm kitchen, natural light, woman selecting produce, authentic and unposed',
    expected: 'ai_video',
  },
];

for (const test of testCases) {
  const result = await sceneClassifierService.classifyScene(test);
  const pass = result.renderSystemType === test.expected;
  console.log(`${pass ? '✅' : '❌'} ${test.id}: got ${result.renderSystemType}, expected ${test.expected}`);
  if (!pass) console.log(`   Reasoning: ${result.reasoning}`);
}
```

Run the full Deep Dive project through `POST /api/projects/:id/classify-scenes`
and confirm:
- At minimum 1 `title_card` scene (the "Week 1 Deep Dive" opening)
- At minimum 1 `infographic` scene (the "Sugar Problem" comparison)
- At minimum 1 `scientific_medical` scene (the blood glucose / metabolism scenes)
- At minimum 1 `brand_environment` scene (the Origin Clinic scene)
- Remaining scenes classified as `ai_video` or `product_showcase`

---

## Important Architectural Notes for the Agent

**Do not modify the existing narration-aware Recraft routing** in
`server/utils/recraft-scene-policy.ts`. That system operates at image
generation time and handles the Recraft routing decision for individual
scenes. Phase 23A operates at script parse time and sets `renderSystemType`
as a persistent field. Phase 23B (next phase) will read `renderSystemType`
and route to the correct render pipeline — at that point the keyword-based
routing in `recraft-scene-policy.ts` becomes a secondary safety net, not
the primary router.

**Classifier must never block generation.** If classification fails for any
reason — API error, timeout, JSON parse failure — the scene defaults to
`ai_video` and generation proceeds normally. Log the error, never throw it
upstream.

**Haiku, not Sonnet.** The classifier prompt is simple enough for Haiku.
At ~$0.00025 per classification call, classifying a 9-scene project costs
less than a cent. Do not use a more expensive model here.

**Classification is idempotent.** Running classify-scenes multiple times
on the same project must produce the same results. Never clear a manually
overridden `renderSystemType` — if the user has set it manually, the
auto-classify route should skip that scene (check for `classifierConfidence`
being `null` or check a `manuallyClassified` flag).

---

## Success Criteria

- [ ] `RenderSystemType` union type added to `shared/video-types.ts`
- [ ] `renderSystemType`, `classifierConfidence`, `classifierReasoning`, `classifiedAt` on Scene interface
- [ ] `SceneClassifierService.classifyScene` returns correct type for all 5 test cases above
- [ ] Batch classification runs 5 scenes concurrently, respects Haiku rate limits
- [ ] `POST /api/projects/:id/classify-scenes` classifies all unclassified scenes
- [ ] Auto-classify fires after script parse (fire-and-forget, non-blocking)
- [ ] Scene card shows `RenderTypeBadge` with correct type and icon
- [ ] User can manually override `renderSystemType` via the details dropdown
- [ ] "Reclassify" triggers a single-scene re-classification
- [ ] Classifier failure always falls back to `ai_video` — never breaks generation
- [ ] All 5 test cases pass (title_card, infographic, scientific_medical, brand_environment, ai_video)
- [ ] No TypeScript errors in new files

---

## Next Phase

**Phase 23B: Scene Type → Render Pipeline Routing**

Once classifications are stored, Phase 23B reads `renderSystemType` and routes
each scene to the correct rendering system at generation time:
- `title_card` → Remotion chapter title template (requires Phase 24A)
- `infographic` → Remotion infographic template (requires Phase 24B)
- `scientific_medical` → Recraft V3 + overlay library (requires Phase 25)
- `brand_environment` → Recraft V3 text_layout (already built in Phase 22)
- `product_showcase` → Seedance 2 omni_reference (already built in Phase 20C)
- `ai_video` → existing Seedance 2 pipeline (already built in Phase 20A)
