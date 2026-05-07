// Phase 23B (Task #174): product-showcase handler.
//
// Forces Seedance 2 (omni_reference mode) for the I2V leg when at least
// one product reference image is supplied. Verified against
// `piapi-video-service.ts:1395-1497`: omni_reference activates by
// default when:
//   - `provider === 'seedance-2.0' || 'seedance-2.0-fast'`
//   - `imageUrls[]` is non-empty (or `imageUrl` falls back to `[imageUrl]`)
//   - `i2vSettings.useFirstLastFrames !== true`
// There is no dedicated `i2vSettings` field to set — just the provider
// and the image references.
//
// When NO reference image is available we cannot run omni_reference, so
// we fall back to ai_video and record the reason.

import { aiVideoHandler } from './ai-video.handler';
import type {
  RenderHandlerContext,
  RenderHandlerResult,
  RenderOptions,
  SceneRenderHandler,
} from './types';

function pickSeedanceVariant(qualityTier?: string): 'seedance-2.0' | 'seedance-2.0-fast' {
  return qualityTier === 'draft' ? 'seedance-2.0-fast' : 'seedance-2.0';
}

export class ProductShowcaseHandler implements SceneRenderHandler {
  readonly type = 'product_showcase' as const;

  async render(
    options: RenderOptions,
    ctx: RenderHandlerContext,
  ): Promise<RenderHandlerResult> {
    // Resolve a reference image set in priority order:
    //   1. options.imageUrls / imageUrl supplied by the worker (text-image,
    //      char-ref, or studio-polish anchor).
    //   2. scene.brandReferences[] flattened by the worker into
    //      ctx.scene.brandReferenceUrls — the canonical source for
    //      product-showcase scenes that have brand-kit references attached.
    //   3. project brand kit's product images (ctx.scene.productImageUrls).
    // Without ANY of those we cannot use Seedance omni_reference and fall
    // back to ai_video with a recorded reason.
    let resolvedRefs: string[] | undefined =
      options.imageUrls && options.imageUrls.length > 0
        ? options.imageUrls
        : options.imageUrl
        ? [options.imageUrl]
        : undefined;
    let refSource = 'options';
    if (!resolvedRefs && ctx.scene.brandReferenceUrls?.length) {
      resolvedRefs = ctx.scene.brandReferenceUrls;
      refSource = 'scene.brandReferences';
    }
    if (!resolvedRefs && ctx.scene.productImageUrls?.length) {
      resolvedRefs = ctx.scene.productImageUrls;
      refSource = 'project.brandAssets.productImages';
    }

    if (!resolvedRefs || resolvedRefs.length === 0) {
      const result = await aiVideoHandler.render(options, ctx);
      return {
        ...result,
        resolvedHandler: 'ai_video',
        fallback: {
          from: this.type,
          to: 'ai_video',
          reason:
            'No product reference image (options, scene.brandReferences, or project.productImages) — cannot use Seedance omni_reference',
        },
      };
    }

    const seedance = pickSeedanceVariant(options.qualityTier);
    console.log(
      `[ProductShowcase] job=${ctx.jobId} scene=${ctx.sceneId} forcing provider=${seedance} (omni_reference) with ${resolvedRefs.length} reference image(s) [source=${refSource}]`,
    );

    const result = await aiVideoHandler.render(
      {
        ...options,
        imageUrls: resolvedRefs,
        imageUrl: resolvedRefs[0],
        preferredProvider: seedance,
        // Explicit hint=false so the orchestrator treats it as a hard
        // pick rather than a soft preference (we WANT Seedance 2 for
        // omni_reference; falling back to Kling defeats the purpose).
        isProviderHint: false,
      },
      ctx,
    );

    return { ...result, resolvedHandler: this.type };
  }
}

export const productShowcaseHandler = new ProductShowcaseHandler();
