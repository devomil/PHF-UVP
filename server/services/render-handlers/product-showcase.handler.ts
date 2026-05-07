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
    const hasRef = !!options.imageUrl || (options.imageUrls?.length ?? 0) > 0;

    if (!hasRef) {
      const result = await aiVideoHandler.render(options, ctx);
      return {
        ...result,
        resolvedHandler: 'ai_video',
        fallback: {
          from: this.type,
          to: 'ai_video',
          reason: 'No product reference image — cannot use Seedance omni_reference',
        },
      };
    }

    const seedance = pickSeedanceVariant(options.qualityTier);
    console.log(
      `[ProductShowcase] job=${ctx.jobId} scene=${ctx.sceneId} forcing provider=${seedance} (omni_reference) with ${options.imageUrls?.length ?? 1} reference image(s)`,
    );

    const result = await aiVideoHandler.render(
      {
        ...options,
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
