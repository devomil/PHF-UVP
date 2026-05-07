// Phase 23B (Task #174): Render-system router contract.
//
// Each handler implements `SceneRenderHandler` and is registered with the
// router (see `../render-system-router.ts`). The router consults
// `scene.renderSystemType` (set by the Phase 23A classifier or by a
// manual override) and dispatches to the matching handler. Unknown /
// missing types fall back to the `ai_video` handler.

import type { RenderSystemType } from '../../../shared/video-types';
import type { AIVideoOptions, AIVideoResult } from '../ai-video-service';

/** Per-call options passed to a handler. Mirrors `AIVideoOptions` so the
 *  ai-video handler can pass them straight through, plus three extra
 *  fields that brand-environment / product-showcase / future stub
 *  handlers need for "still-then-i2v" re-entry:
 *
 *  - `imageUrl`     — single anchor image (already on AIVideoOptions)
 *  - `imageUrls`    — multi-image references (already on AIVideoOptions)
 *  - `motionPromptOverride` — replaces the prompt for the I2V leg when a
 *    handler has generated a still and just wants subtle motion. The
 *    BrandEnvironmentHandler uses this so the I2V leg doesn't re-bake
 *    the branded text into a regenerated background. */
export interface RenderOptions extends AIVideoOptions {
  imageUrl?: string;
  imageUrls?: string[];
  motionPromptOverride?: string;
}

/** Subset of scene fields handlers actually read. Kept narrow on purpose
 *  so the worker doesn't have to plumb the entire 60-field Scene shape
 *  through dispatch. `brandReferenceUrls` and `productImageUrls` are
 *  flattened on the worker side so handlers don't have to reach back
 *  into the project / brand asset graph. */
export interface SceneSnapshot {
  id: string;
  sceneType?: string;
  narration?: string;
  visualDirection?: string;
  imagePrompt?: string;
  renderSystemType?: RenderSystemType;
  manuallyClassified?: boolean;
  classifierConfidence?: number;
  /** S3 URLs from `scene.brandReferences[]` — used by ProductShowcase
   *  when `options.imageUrls` is empty so omni_reference can still
   *  activate without forcing an upstream prep step. */
  brandReferenceUrls?: string[];
  /** S3 URLs from the project's brand kit product images — used as the
   *  same fallback source for ProductShowcase. */
  productImageUrls?: string[];
  /** Phase 24A (Task #175): brand-kit fields used by the title-card
   *  handler to render an on-brand animated title. All optional —
   *  handler falls back to neutral defaults when any field is absent. */
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  brandTextColor?: string;
  brandHeadingFont?: string;
  brandLogoUrl?: string;
}

export interface RenderHandlerContext {
  projectId: string;
  sceneId: string;
  jobId: string;
  scene: SceneSnapshot;
}

export interface RenderHandlerResult extends AIVideoResult {
  /** Handler that actually produced the result. May differ from the
   *  scene's `renderSystemType` when a handler is a stub or refused. */
  resolvedHandler: RenderSystemType;
  /** Present iff the handler delegated / fell back to a different
   *  render system (e.g. `title_card` → `ai_video`). */
  fallback?: {
    from: RenderSystemType;
    to: RenderSystemType;
    reason: string;
  };
}

export interface SceneRenderHandler {
  readonly type: RenderSystemType;
  /** Self-reported availability. Stub handlers return false; real
   *  handlers default to true. The router consults this both for the
   *  `GET /api/render-router/handlers` editor-preview endpoint and to
   *  decide whether to record a fallback even before invoking the
   *  handler. Defaults to `true` when omitted. */
  isAvailable?(): boolean;
  render(
    options: RenderOptions,
    ctx: RenderHandlerContext,
  ): Promise<RenderHandlerResult>;
}
