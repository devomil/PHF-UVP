# Phase 23B: Scene Type → Render System Routing

## Priority: HIGH
## Dependency: Phase 23A (renderSystemType must be stored on scenes)
## Estimated Time: 4-5 hours
## Unlocks: Phase 24A, 24B, 25A (Remotion templates and scientific overlays
##          can now plug into a stable router rather than patching the worker)

---

## What This Phase Builds

A render system router that reads each scene's `renderSystemType` (set by Phase 23A)
and dispatches to the correct rendering pipeline at generation time. This replaces
the implicit "figure it out from keywords" approach with an explicit, extensible
dispatch table.

**Before Phase 23B:**
Every scene flows through the same generation path. `recraft-scene-policy.ts`
keyword matching and Phase 20C's brand reference detection are scattered point
fixes that each patch a specific case.

**After Phase 23B:**
One router reads `renderSystemType` and dispatches to a registered handler.
New render systems (title cards, infographics, scientific overlays) plug in by
registering a handler — the router and worker don't change.

---

## What Is and Isn't Built in This Phase

| renderSystemType | Handler | Status after 23B |
|---|---|---|
| `ai_video` | `AiVideoHandler` | ✅ Fully wired (Phase 20A) |
| `product_showcase` | `ProductShowcaseHandler` | ✅ Fully wired (Phase 20C omni_reference) |
| `brand_environment` | `BrandEnvironmentHandler` | ✅ Fully wired (Phase 22 Recraft V3 → I2V) |
| `title_card` | `TitleCardHandler` (stub) | 🔲 Stub → ai_video fallback (Phase 24A implements) |
| `infographic` | `InfographicHandler` (stub) | 🔲 Stub → ai_video fallback (Phase 24B implements) |
| `scientific_medical` | `ScientificMedicalHandler` (stub) | 🔲 Stub → ai_video fallback (Phase 25A implements) |
| `ugc_avatar` | `UgcAvatarHandler` (stub) | 🔲 Stub → ai_video fallback (Phase 27A implements) |

Stubs log a clear `[RenderRouter] type not yet implemented → falling back to ai_video`
message so unbuilt systems are visible in logs rather than silently routing incorrectly.

---

## Architecture: Registry Pattern

The router uses a handler registry. Each render system registers a handler object
that the router invokes. This means:

- The router never imports individual render services directly
- Future phases add a `registerRenderSystem(handler)` call — nothing else changes
- Handlers are self-describing: they declare `renderSystemType`, `isAvailable()`,
  and `render()`

```
video-generation-worker.ts
        │
        ▼
RenderSystemRouter.route(scene, project)
        │
        ├── scene.renderSystemType = 'ai_video'         → AiVideoHandler
        ├── scene.renderSystemType = 'product_showcase' → ProductShowcaseHandler
        ├── scene.renderSystemType = 'brand_environment'→ BrandEnvironmentHandler
        ├── scene.renderSystemType = 'title_card'       → TitleCardHandler (stub → ai_video)
        ├── scene.renderSystemType = 'infographic'      → InfographicHandler (stub → ai_video)
        ├── scene.renderSystemType = 'scientific_medical'→ ScientificMedicalHandler (stub)
        ├── scene.renderSystemType = 'ugc_avatar'       → UgcAvatarHandler (stub)
        └── scene.renderSystemType = null/undefined     → legacy routing (existing behavior)
```

---

## Task 1: Render System Handler Interface

Create `server/services/render-handlers/types.ts`:

```typescript
// server/services/render-handlers/types.ts

import { RenderSystemType } from '../../../shared/video-types';

export interface RenderOptions {
  projectId: string;
  userId: number;
  visualStyle: string;
  aspectRatio?: string;
  seamlessTransitions?: boolean;
  previousSceneLastFrameUrl?: string;  // For first_last_frames continuity
}

export interface RenderResult {
  videoUrl: string;
  provider: string;             // e.g. "seedance-2", "recraft-v3+seedance-2", "remotion"
  renderSystemType: RenderSystemType;
  thumbnailUrl?: string;        // If a still was generated as intermediate step
  durationMs?: number;
  fallbackUsed?: boolean;       // true if this handler fell back to ai_video
  fallbackReason?: string;      // why the fallback occurred
}

export interface RenderSystemHandler {
  readonly renderSystemType: RenderSystemType;

  /**
   * Returns true if this handler's required services are available.
   * Stub handlers return false — router falls back to ai_video when false.
   */
  isAvailable(): boolean;

  /**
   * Render the scene and return a video URL.
   * Must never throw — catch errors internally and return a fallback result
   * or re-throw only for unrecoverable errors the caller must know about.
   */
  render(
    scene: SceneForRender,
    project: ProjectForRender,
    options: RenderOptions
  ): Promise<RenderResult>;
}

// Minimal scene/project types for render handlers
// Use the actual Scene and Project interfaces from your codebase
export interface SceneForRender {
  id: string;
  narration?: string;
  visualDirection?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  prompt?: string;
  sceneType?: string;
  renderSystemType?: RenderSystemType;
  classifierConfidence?: number;
  duration?: number;
  generateNativeAudio?: boolean;
  brandReferences?: Array<{ assetId: number; assetUrl: string; tag: string; label?: string }>;
  brandTextElements?: Array<{ text: string; x: number; y: number; width?: number }>;
  seedImageUrl?: string;
  thumbnailUrl?: string;
  continuityFrameUrl?: string;
  provider?: string;
}

export interface ProjectForRender {
  id: string;
  visualStyle?: string;
  aspectRatio?: string;
  brandAssets?: { productImages?: string[]; logoUrl?: string };
}
```

---

## Task 2: Render System Router

Create `server/services/render-system-router.ts`:

```typescript
// server/services/render-system-router.ts

import { RenderSystemType } from '../../shared/video-types';
import {
  RenderSystemHandler,
  RenderOptions,
  RenderResult,
  SceneForRender,
  ProjectForRender,
} from './render-handlers/types';

export class RenderSystemRouter {
  private registry = new Map<RenderSystemType, RenderSystemHandler>();
  private aiVideoHandler: RenderSystemHandler | null = null;

  // ─── Register a handler ──────────────────────────────────────────────────

  register(handler: RenderSystemHandler): void {
    this.registry.set(handler.renderSystemType, handler);
    if (handler.renderSystemType === 'ai_video') {
      this.aiVideoHandler = handler;
    }
    console.log(`[RenderRouter] Registered handler: ${handler.renderSystemType}`);
  }

  // ─── Route a scene to its render handler ─────────────────────────────────

  async route(
    scene: SceneForRender,
    project: ProjectForRender,
    options: RenderOptions
  ): Promise<RenderResult> {
    const type = scene.renderSystemType;
    const confidence = scene.classifierConfidence ?? 0;

    // ── Unclassified or very-low-confidence: use legacy routing ───────────
    // This preserves existing behavior for projects that were created before
    // Phase 23A ran, or where the classifier returned confidence 0 (error fallback)
    if (!type || confidence === 0) {
      console.log(
        `[RenderRouter] Scene ${scene.id}: unclassified (type=${type ?? 'none'}, ` +
        `confidence=${confidence}) → legacy routing`
      );
      return this.legacyFallback(scene, project, options);
    }

    // ── Find registered handler ────────────────────────────────────────────
    const handler = this.registry.get(type);

    if (!handler) {
      console.warn(`[RenderRouter] Scene ${scene.id}: no handler for "${type}" → ai_video`);
      return this.fallbackToAiVideo(scene, project, options, `No handler registered for ${type}`);
    }

    // ── Check handler availability (stub handlers return false) ───────────
    if (!handler.isAvailable()) {
      console.log(
        `[RenderRouter] Scene ${scene.id}: "${type}" not yet implemented ` +
        `(Phase for this type is pending) → ai_video fallback`
      );
      return this.fallbackToAiVideo(scene, project, options, `${type} render system not yet built`);
    }

    // ── Dispatch to handler ────────────────────────────────────────────────
    console.log(
      `[RenderRouter] Scene ${scene.id}: dispatching to ${type} ` +
      `(confidence=${confidence.toFixed(2)})`
    );

    const startMs = Date.now();

    try {
      const result = await handler.render(scene, project, options);
      console.log(
        `[RenderRouter] Scene ${scene.id}: ${type} complete in ${Date.now() - startMs}ms ` +
        `via ${result.provider}`
      );
      return result;
    } catch (err: any) {
      console.error(`[RenderRouter] Scene ${scene.id}: ${type} handler failed:`, err.message);
      // Handler errors fall back to ai_video — never block the whole generation
      return this.fallbackToAiVideo(scene, project, options, `Handler error: ${err.message}`);
    }
  }

  // ─── ai_video fallback ────────────────────────────────────────────────────

  private async fallbackToAiVideo(
    scene: SceneForRender,
    project: ProjectForRender,
    options: RenderOptions,
    reason: string
  ): Promise<RenderResult> {
    if (!this.aiVideoHandler) {
      throw new Error('[RenderRouter] ai_video handler not registered — cannot fall back');
    }
    const result = await this.aiVideoHandler.render(scene, project, options);
    return { ...result, fallbackUsed: true, fallbackReason: reason };
  }

  // ─── Legacy routing for unclassified scenes ───────────────────────────────
  // Preserves ALL existing behavior from before Phase 23A/23B.
  // This is the "nothing changed" path for old projects and unclassified scenes.

  private async legacyFallback(
    scene: SceneForRender,
    project: ProjectForRender,
    options: RenderOptions
  ): Promise<RenderResult> {
    if (!this.aiVideoHandler) {
      throw new Error('[RenderRouter] ai_video handler not registered');
    }
    // Legacy path: the ai_video handler will check recraft-scene-policy
    // and Phase 20C brand references internally, preserving all existing logic
    return this.aiVideoHandler.render(scene, project, options);
  }
}

// Singleton router — all handlers register on startup
export const renderSystemRouter = new RenderSystemRouter();
```

---

## Task 3: ai_video Handler (Wraps Existing Pipeline)

Create `server/services/render-handlers/ai-video.handler.ts`:

```typescript
// server/services/render-handlers/ai-video.handler.ts

import { RenderSystemHandler, RenderOptions, RenderResult, SceneForRender, ProjectForRender } from './types';
import { piapiVideoService } from '../piapi-video-service';
import { evaluateSceneTextRouting } from '../../utils/recraft-scene-policy';
import { recraftService } from '../recraft.service';

/**
 * Default handler for ai_video scenes AND the legacy fallback for all unclassified scenes.
 * This wraps the existing Seedance 2 pipeline without changing any of its behavior.
 *
 * Also handles brand_references detection (Phase 20C) for scenes that have
 * references attached but weren't classified as product_showcase —
 * omni_reference is used whenever references are present, regardless of type.
 */
export class AiVideoHandler implements RenderSystemHandler {
  readonly renderSystemType = 'ai_video' as const;

  isAvailable(): boolean { return true; }

  async render(
    scene: SceneForRender,
    project: ProjectForRender,
    options: RenderOptions
  ): Promise<RenderResult> {
    const prompt = scene.videoPrompt ?? scene.visualDirection ?? scene.prompt ?? '';
    const duration = scene.duration ?? 8;
    const model = this.resolveModel(project.visualStyle);

    // ── Phase 20C omni_reference: brand references present ────────────────
    if (scene.brandReferences?.length && model.startsWith('seedance')) {
      console.log(`[AiVideoHandler] Scene ${scene.id}: omni_reference (${scene.brandReferences.length} refs)`);
      const result = await piapiVideoService.generateSeedance2WithBrandReference({
        prompt,
        references: scene.brandReferences,
        duration,
        model: model as 'seedance-2' | 'seedance-2-fast',
      });
      return {
        videoUrl: result.videoUrl,
        provider: model,
        renderSystemType: 'ai_video',
      };
    }

    // ── Phase 20B first_last_frames continuity ────────────────────────────
    if (options.seamlessTransitions && options.previousSceneLastFrameUrl) {
      console.log(`[AiVideoHandler] Scene ${scene.id}: first_last_frames continuity`);
      const result = await piapiVideoService.generateSeedance2WithContinuity({
        prompt,
        firstFrameUrl: options.previousSceneLastFrameUrl,
        duration,
        model: model as 'seedance-2' | 'seedance-2-fast',
      });
      return {
        videoUrl: result.videoUrl,
        provider: model,
        renderSystemType: 'ai_video',
      };
    }

    // ── Phase 21B seed image I2V ───────────────────────────────────────────
    if (scene.seedImageUrl) {
      console.log(`[AiVideoHandler] Scene ${scene.id}: I2V from seed image`);
      const result = await piapiVideoService.generateSeedance2Video({
        prompt: buildI2VMotionPrompt(scene),
        imageUrl: scene.seedImageUrl,
        duration,
        model,
        generateNativeAudio: scene.generateNativeAudio ?? false,
      });
      return { videoUrl: result.videoUrl, provider: model, renderSystemType: 'ai_video' };
    }

    // ── Standard T2V ──────────────────────────────────────────────────────
    const result = await piapiVideoService.generateSeedance2Video({
      prompt,
      duration,
      model,
      generateNativeAudio: scene.generateNativeAudio ?? false,
    });
    return { videoUrl: result.videoUrl, provider: model, renderSystemType: 'ai_video' };
  }

  private resolveModel(visualStyle?: string): string {
    const premiumStyles = ['hero', 'premium', 'product'];
    return premiumStyles.includes(visualStyle ?? '') ? 'seedance-2' : 'seedance-2-fast';
  }
}

function buildI2VMotionPrompt(scene: SceneForRender): string {
  const motionByType: Record<string, string> = {
    hook:     'Gentle camera pull back, soft focus, natural movement',
    problem:  'Slow camera drift, contemplative stillness, subtle motion',
    solution: 'Smooth camera push toward subject, warm reveal',
    benefit:  'Steady camera, subject moves naturally, authentic motion',
    cta:      'Slow zoom in, confident stillness',
  };
  return motionByType[scene.sceneType ?? '']
    ?? 'Natural gentle camera movement, authentic motion';
}
```

---

## Task 4: brand_environment Handler (Recraft V3 → Seedance 2 I2V)

Create `server/services/render-handlers/brand-environment.handler.ts`:

```typescript
// server/services/render-handlers/brand-environment.handler.ts

import { RenderSystemHandler, RenderOptions, RenderResult, SceneForRender, ProjectForRender } from './types';
import { recraftService } from '../recraft.service';
import { piapiVideoService } from '../piapi-video-service';
import { evaluateSceneTextRouting } from '../../utils/recraft-scene-policy';

/**
 * Brand environment scenes: named branded locations (Origin Holistic Clinic,
 * Pine Hill Farm) where a readable sign must appear in the background.
 *
 * Pipeline:
 *   1. Recraft V3 text_layout → still image with accurate sign text
 *   2. Store as scene thumbnail / seed image
 *   3. Seedance 2 I2V → animate the Recraft still → video
 *
 * This produces higher fidelity than ai_video because the starting frame
 * has a precisely rendered sign, and I2V preserves it throughout the clip.
 */
export class BrandEnvironmentHandler implements RenderSystemHandler {
  readonly renderSystemType = 'brand_environment' as const;

  isAvailable(): boolean {
    return !!process.env.RECRAFT_API_KEY;
  }

  async render(
    scene: SceneForRender,
    project: ProjectForRender,
    options: RenderOptions
  ): Promise<RenderResult> {
    const sceneDescription = scene.imagePrompt ?? scene.visualDirection ?? scene.prompt ?? '';
    const s3KeyPrefix = `projects/${project.id}/scenes/${scene.id}`;

    // ── Step 1: Determine text elements ───────────────────────────────────
    let textElements = scene.brandTextElements ?? [];

    if (textElements.length === 0) {
      // Fall back to the narration-aware routing to generate text elements
      const routing = evaluateSceneTextRouting({
        narration: scene.narration,
        visualDirection: scene.visualDirection,
        sceneType: scene.sceneType,
      });
      if (routing.suggestedTextElement) {
        // Parse the suggested text element into the structured format
        // Default position: upper-left, typical sign placement
        textElements = [{
          text: extractTextFromSuggestion(routing.suggestedTextElement),
          x: 0.06,
          y: 0.32,
          width: 0.30,
        }];
      }
    }

    if (textElements.length === 0) {
      // No brand text to render — fall through to ai_video handler
      console.warn(
        `[BrandEnvironmentHandler] Scene ${scene.id}: no text elements found — ` +
        `routing to ai_video`
      );
      // Import and delegate to ai_video handler
      const { AiVideoHandler } = await import('./ai-video.handler');
      return new AiVideoHandler().render(scene, project, options);
    }

    // ── Step 2: Recraft V3 → still image with brand text ─────────────────
    console.log(
      `[BrandEnvironmentHandler] Scene ${scene.id}: generating branded environment ` +
      `(${textElements.length} text elements)`
    );

    let stillImageUrl: string;
    try {
      const recraftResult = await recraftService.generateWithBrandedText({
        sceneDescription,
        textElements,
        style: 'Photorealism',
        aspectRatio: '16:9',
        s3KeyPrefix,
      });
      stillImageUrl = recraftResult.imageUrl;
      console.log(`[BrandEnvironmentHandler] Scene ${scene.id}: still generated → ${stillImageUrl.substring(0, 60)}`);
    } catch (err: any) {
      console.error(`[BrandEnvironmentHandler] Recraft failed:`, err.message);
      // Recraft failure → fall back to ai_video (still worth generating something)
      const { AiVideoHandler } = await import('./ai-video.handler');
      const result = await new AiVideoHandler().render(scene, project, options);
      return { ...result, fallbackUsed: true, fallbackReason: `Recraft error: ${err.message}` };
    }

    // ── Step 3: Seedance 2 I2V → animate the branded still ───────────────
    const motionPrompt = 'Natural gentle movement, subtle ambient motion, camera holds steady';
    const duration = scene.duration ?? 8;
    const model = 'seedance-2'; // Always use quality model for brand scenes

    try {
      const videoResult = await piapiVideoService.generateSeedance2Video({
        prompt: motionPrompt,
        imageUrl: stillImageUrl,
        duration,
        model,
        generateNativeAudio: scene.generateNativeAudio ?? false,
      });

      return {
        videoUrl: videoResult.videoUrl,
        provider: `recraft-v3+${model}`,
        renderSystemType: 'brand_environment',
        thumbnailUrl: stillImageUrl,
      };
    } catch (err: any) {
      console.error(`[BrandEnvironmentHandler] I2V failed:`, err.message);
      // I2V failure — return the Recraft still as a static video if possible,
      // or fall back to ai_video
      const { AiVideoHandler } = await import('./ai-video.handler');
      const result = await new AiVideoHandler().render(scene, project, options);
      return { ...result, fallbackUsed: true, fallbackReason: `I2V error: ${err.message}` };
    }
  }
}

function extractTextFromSuggestion(suggestion: string): string {
  // Parse: 'A handcrafted wooden sign reading "ORIGIN HOLISTIC CLINIC" is visible...'
  const match = suggestion.match(/reading\s+"([^"]+)"/i)
    ?? suggestion.match(/reading\s+'([^']+)'/i)
    ?? suggestion.match(/"([^"]+)"/);
  return match?.[1] ?? suggestion.replace(/[^A-Z0-9 ]/gi, '').trim().substring(0, 40);
}
```

---

## Task 5: product_showcase Handler

Create `server/services/render-handlers/product-showcase.handler.ts`:

```typescript
// server/services/render-handlers/product-showcase.handler.ts

import { RenderSystemHandler, RenderOptions, RenderResult, SceneForRender, ProjectForRender } from './types';
import { piapiVideoService } from '../piapi-video-service';

/**
 * Product showcase scenes: scenes where the actual product (supplement bottle,
 * packaging) must appear visually accurate via Seedance 2 omni_reference.
 *
 * If brand references are attached → use omni_reference.
 * If no brand references → fall back to ai_video (can't anchor without a reference).
 */
export class ProductShowcaseHandler implements RenderSystemHandler {
  readonly renderSystemType = 'product_showcase' as const;

  isAvailable(): boolean { return true; }

  async render(
    scene: SceneForRender,
    project: ProjectForRender,
    options: RenderOptions
  ): Promise<RenderResult> {
    const prompt = scene.videoPrompt ?? scene.visualDirection ?? scene.prompt ?? '';
    const duration = scene.duration ?? 8;

    // Collect brand references from scene or project brand assets
    const references = await this.resolveBrandReferences(scene, project);

    if (references.length === 0) {
      console.warn(
        `[ProductShowcaseHandler] Scene ${scene.id}: no brand references available → ` +
        `ai_video fallback (omni_reference requires at least one reference)`
      );
      const { AiVideoHandler } = await import('./ai-video.handler');
      const result = await new AiVideoHandler().render(scene, project, options);
      return { ...result, fallbackUsed: true, fallbackReason: 'No brand references for omni_reference' };
    }

    console.log(
      `[ProductShowcaseHandler] Scene ${scene.id}: omni_reference ` +
      `(${references.length} product refs)`
    );

    const result = await piapiVideoService.generateSeedance2WithBrandReference({
      prompt,
      references,
      duration,
      model: 'seedance-2',
    });

    return {
      videoUrl: result.videoUrl,
      provider: 'seedance-2-omni_reference',
      renderSystemType: 'product_showcase',
    };
  }

  private async resolveBrandReferences(
    scene: SceneForRender,
    project: ProjectForRender
  ): Promise<Array<{ assetId: number; assetUrl: string; tag: string }>> {
    // Scene-level references take priority (Phase 20C)
    if (scene.brandReferences?.length) {
      return scene.brandReferences;
    }

    // Fall back to project product images
    const productImages = project.brandAssets?.productImages ?? [];
    return productImages.slice(0, 9).map((url, i) => ({
      assetId: i,
      assetUrl: url,
      tag: `image${i + 1}`,
    }));
  }
}
```

---

## Task 6: Stub Handlers for Future Render Systems

Create `server/services/render-handlers/stub-handlers.ts`:

```typescript
// server/services/render-handlers/stub-handlers.ts
// Stub implementations for render systems not yet built.
// Each stub: isAvailable() returns false → router falls back to ai_video.
// Future phases replace these with real implementations.

import { RenderSystemHandler, RenderOptions, RenderResult, SceneForRender, ProjectForRender } from './types';

function makeStub(
  type: 'title_card' | 'infographic' | 'scientific_medical' | 'ugc_avatar',
  futurePhase: string
): RenderSystemHandler {
  return {
    renderSystemType: type,
    isAvailable: () => false,
    render: async () => {
      // This is never called because isAvailable() returns false
      // The router falls back to ai_video before calling render()
      throw new Error(`${type} stub should never be called directly`);
    },
  };
}

export const TitleCardHandler = makeStub('title_card', 'Phase 24A');
export const InfographicHandler = makeStub('infographic', 'Phase 24B');
export const ScientificMedicalHandler = makeStub('scientific_medical', 'Phase 25A');
export const UgcAvatarHandler = makeStub('ugc_avatar', 'Phase 27A');
```

---

## Task 7: Register All Handlers on Startup

Create `server/services/render-handlers/index.ts`:

```typescript
// server/services/render-handlers/index.ts
// Import this file once at server startup to register all handlers.

import { renderSystemRouter } from '../render-system-router';
import { AiVideoHandler } from './ai-video.handler';
import { BrandEnvironmentHandler } from './brand-environment.handler';
import { ProductShowcaseHandler } from './product-showcase.handler';
import {
  TitleCardHandler,
  InfographicHandler,
  ScientificMedicalHandler,
  UgcAvatarHandler,
} from './stub-handlers';

export function registerAllRenderHandlers(): void {
  renderSystemRouter.register(new AiVideoHandler());
  renderSystemRouter.register(new BrandEnvironmentHandler());
  renderSystemRouter.register(new ProductShowcaseHandler());
  renderSystemRouter.register(TitleCardHandler);
  renderSystemRouter.register(InfographicHandler);
  renderSystemRouter.register(ScientificMedicalHandler);
  renderSystemRouter.register(UgcAvatarHandler);

  console.log('[RenderRouter] All handlers registered');
}
```

Call `registerAllRenderHandlers()` in the server startup file (wherever
`piapiVideoService`, `sceneClassifierService`, etc. are initialized on boot).

---

## Task 8: Wire Router into Video Generation Worker

Find the function in `server/services/video-generation-worker.ts` that generates
video for a single scene (likely called `generateSceneVideo`,
`processSceneGeneration`, or similar — search for where `piapiVideoService` is
called per-scene).

**Replace** the direct `piapiVideoService` call with a `renderSystemRouter.route()`
call:

```typescript
// BEFORE (existing pattern):
const videoUrl = await piapiVideoService.generateVideo({
  prompt: scene.videoPrompt,
  // ... various options ...
});

// AFTER — insert at the top of the scene generation function:
import { renderSystemRouter } from '../render-system-router';
import { registerAllRenderHandlers } from './render-handlers';

// Ensure handlers are registered (idempotent — safe to call multiple times)
registerAllRenderHandlers();

// Route based on renderSystemType
const renderResult = await renderSystemRouter.route(scene, project, {
  projectId: project.id,
  userId: options.userId,
  visualStyle: project.visualStyle ?? 'lifestyle',
  aspectRatio: project.aspectRatio,
  seamlessTransitions: project.seamlessTransitions ?? false,
  previousSceneLastFrameUrl: options.previousSceneLastFrameUrl,
});

const videoUrl = renderResult.videoUrl;

// Optionally store which provider/system was used on the scene record
if (renderResult.fallbackUsed) {
  console.warn(
    `[Worker] Scene ${scene.id}: fallback used — ` +
    `originally ${scene.renderSystemType}, fell back because: ${renderResult.fallbackReason}`
  );
}
```

Also wire into `server/services/cinematic-flow-service.ts` at the equivalent
scene generation call site — cinematic flow (Phase 20B) generates scenes
sequentially and passes `previousSceneLastFrameUrl` between them.

---

## Task 9: Retire Inline Routing Logic from Worker

After wiring the router, remove any inline routing logic that now duplicates
what the router handles. Specifically:

- Any direct `if (scene.brandReferences?.length) { ... omni_reference ... }` block
  in the worker → now handled by `ProductShowcaseHandler` and `AiVideoHandler`
- Any direct `if (requiresTextAccuracy(scene)) { ... recraft ... }` call in the
  worker → now handled by `BrandEnvironmentHandler`

**Do NOT remove `recraft-scene-policy.ts` itself.** It remains as a secondary
safety net called from within `BrandEnvironmentHandler`. Only remove duplicated
inline routing from the worker.

---

## Verification

### Test 1: Route distribution on the Deep Dive project

After Phase 23A classifies all scenes, trigger generation and confirm in logs:

```
[RenderRouter] Registered handler: ai_video
[RenderRouter] Registered handler: brand_environment
[RenderRouter] Registered handler: product_showcase
[RenderRouter] Registered handler: title_card       ← stub, isAvailable=false
[RenderRouter] Registered handler: infographic      ← stub, isAvailable=false
[RenderRouter] Registered handler: scientific_medical ← stub, isAvailable=false
[RenderRouter] All handlers registered

[RenderRouter] Scene scene-1: dispatching to title_card (confidence=0.92)
[RenderRouter] Scene scene-1: "title_card" not yet implemented → ai_video fallback

[RenderRouter] Scene scene-3: dispatching to brand_environment (confidence=0.88)
[BrandEnvironmentHandler] Scene scene-3: generating branded environment (1 text elements)
[BrandEnvironmentHandler] Scene scene-3: still generated → https://s3...
[RenderRouter] Scene scene-3: brand_environment complete in 14203ms via recraft-v3+seedance-2

[RenderRouter] Scene scene-5: dispatching to ai_video (confidence=0.95)
[AiVideoHandler] Scene scene-5: I2V from seed image
```

### Test 2: Unclassified scene uses legacy routing unchanged

Set `scene.renderSystemType = undefined` on a test scene and confirm:
```
[RenderRouter] Scene X: unclassified → legacy routing
```
Generation should complete identically to pre-Phase 23B behavior.

### Test 3: Brand environment produces readable sign

Generate Scene 3 (Origin Holistic Clinic narration) via the brand_environment handler.
The rendered video's first frame should contain a readable "ORIGIN HOLISTIC CLINIC"
sign in the background. Compare against a pre-23B generation of the same scene —
the sign text should be noticeably more legible.

---

## Success Criteria

- [ ] `RenderSystemRouter` registry accepts and dispatches to handlers
- [ ] All seven handlers registered on startup (3 real, 4 stubs)
- [ ] Stub handlers log `not yet implemented → ai_video fallback` and never error
- [ ] Unclassified scenes (no `renderSystemType`) route to legacy path unchanged
- [ ] Low-confidence scenes (confidence=0) route to legacy path unchanged
- [ ] `BrandEnvironmentHandler` generates Recraft still → Seedance I2V for Scene 3
- [ ] `ProductShowcaseHandler` uses omni_reference when brand references present
- [ ] `AiVideoHandler` handles all existing sub-cases: omni_reference, continuity, I2V, T2V
- [ ] `registerAllRenderHandlers()` is idempotent (safe to call on every request)
- [ ] Handler errors fall back to ai_video — never bubble up to break generation
- [ ] `fallbackUsed: true` is logged with reason when any fallback occurs
- [ ] No duplicate routing logic remains in the worker after Task 9 cleanup
- [ ] No TypeScript errors in new files

---

## How Future Phases Plug In

Phase 24A (chapter title template) adds ONE file and ONE registration call:

```typescript
// server/services/render-handlers/title-card.handler.ts (Phase 24A)
export class TitleCardHandler implements RenderSystemHandler {
  readonly renderSystemType = 'title_card' as const;
  isAvailable() { return true; }  // ← changes from false to true
  async render(scene, project, options) {
    // Call Remotion Lambda to render the chapter title template
    const videoUrl = await renderTitleCardTemplate({ title: scene.narration, ... });
    return { videoUrl, provider: 'remotion', renderSystemType: 'title_card' };
  }
}

// server/services/render-handlers/index.ts (Phase 24A update)
// Replace: renderSystemRouter.register(TitleCardHandler);  ← was a stub
// With:    renderSystemRouter.register(new TitleCardHandler());
```

The router, worker, and all other handlers remain unchanged.
