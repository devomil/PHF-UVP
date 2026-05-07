// Phase 23B (Task #174): brand-environment handler.
//
// When the scene was classified `brand_environment`, the visual
// direction calls for branded signage / typography that an unaided AI
// video model garbles. We:
//   1. Run `evaluateSceneTextRouting` to confirm Recraft V3 is the
//      right tool and to extract the suggested signage element.
//   2. Generate a Recraft V3 still with the branded text baked in.
//   3. Re-enter the AI-video pipeline with that still as `imageUrl`
//      plus a subtle-motion `motionPromptOverride` so the I2V leg
//      doesn't regenerate the typography.
//
// We deliberately SKIP step 1-2 and fall straight through to ai_video
// when:
//   - The caller already supplied an imageUrl (text-image pre-step,
//     character ref, or studio-polish upload). The earlier pipeline
//     already chose a high-quality anchor.
//   - `evaluateSceneTextRouting.useRecraft === false` (classifier
//     disagrees with route policy — record fallback reason).
//   - Recraft generation throws (record error reason, fall back).

import { recraftService } from '../recraft.service';
import { evaluateSceneTextRouting } from '../../utils/recraft-scene-policy';
import { aiVideoHandler } from './ai-video.handler';
import type {
  RenderHandlerContext,
  RenderHandlerResult,
  RenderOptions,
  SceneRenderHandler,
} from './types';

const SUBTLE_MOTION_PROMPT =
  'Subtle cinematic motion: gentle camera push-in with soft parallax depth layers. Branded signage and typography remain perfectly sharp and legible throughout. Smooth, professional broadcast-quality motion.';

function asAspect(a?: string): '16:9' | '9:16' | '1:1' {
  if (a === '9:16' || a === '1:1') return a;
  return '16:9';
}

export class BrandEnvironmentHandler implements SceneRenderHandler {
  readonly type = 'brand_environment' as const;

  async render(
    options: RenderOptions,
    ctx: RenderHandlerContext,
  ): Promise<RenderHandlerResult> {
    // Caller already has an anchor — don't double-spend on Recraft. Fall
    // through to ai_video and record a fallback so the UI shows the
    // "Rendered as: AI Video [Fallback]" pill.
    const hasAnchor = !!options.imageUrl || (options.imageUrls?.length ?? 0) > 0;
    if (hasAnchor) {
      const result = await aiVideoHandler.render(options, ctx);
      return {
        ...result,
        resolvedHandler: 'ai_video',
        fallback: {
          from: this.type,
          to: 'ai_video',
          reason: 'Anchor image already supplied — skipped Recraft still',
        },
      };
    }

    const routing = evaluateSceneTextRouting({
      narration: ctx.scene.narration,
      visualDirection: ctx.scene.visualDirection ?? ctx.scene.imagePrompt,
      sceneType: ctx.scene.sceneType,
    });

    if (!routing.useRecraft) {
      const result = await aiVideoHandler.render(options, ctx);
      return {
        ...result,
        resolvedHandler: 'ai_video',
        fallback: {
          from: this.type,
          to: 'ai_video',
          reason: `Recraft routing declined: ${routing.reason}`,
        },
      };
    }

    let stillUrl: string | undefined;
    try {
      const sceneDescription =
        (ctx.scene.visualDirection ?? ctx.scene.imagePrompt ?? options.prompt ?? '').trim() ||
        'A cinematic establishing shot of the branded environment.';
      const textElement = routing.suggestedTextElement
        ? routing.suggestedTextElement
            .replace(/^.*reading\s+"/i, '')
            .replace(/".*$/, '')
            .trim()
        : '';

      const recraftResult = await recraftService.generateWithBrandedText({
        sceneDescription: routing.suggestedTextElement
          ? `${sceneDescription}. ${routing.suggestedTextElement}`
          : sceneDescription,
        textElements: textElement
          ? [{ text: textElement, x: 0.5, y: 0.4, width: 0.4 }]
          : [],
        aspectRatio: asAspect(options.aspectRatio),
        s3KeyPrefix: `render-handlers/brand-env/${ctx.projectId}/${ctx.sceneId}`,
      });
      stillUrl = recraftResult.imageUrl;
      console.log(
        `[BrandEnvironment] job=${ctx.jobId} scene=${ctx.sceneId} Recraft V3 still ready: ${stillUrl?.substring(0, 80)}…`,
      );
    } catch (recraftErr) {
      const msg = recraftErr instanceof Error ? recraftErr.message : String(recraftErr);
      console.warn(
        `[BrandEnvironment] job=${ctx.jobId} scene=${ctx.sceneId} Recraft generation failed (${msg}) — falling back to ai_video`,
      );
      const result = await aiVideoHandler.render(options, ctx);
      return {
        ...result,
        resolvedHandler: 'ai_video',
        fallback: {
          from: this.type,
          to: 'ai_video',
          reason: `Recraft still failed: ${msg}`,
        },
      };
    }

    // Re-enter ai-video with the Recraft still as the I2V anchor and a
    // subtle-motion override so the I2V leg doesn't try to regenerate
    // the typography.
    const result = await aiVideoHandler.render(
      {
        ...options,
        imageUrl: stillUrl,
        motionPromptOverride: SUBTLE_MOTION_PROMPT,
      },
      ctx,
    );

    // Successful brand_environment render — handler resolved to itself
    // (the ai_video sub-call is an implementation detail). The badge
    // should show "Brand Environment" without a fallback pill.
    return {
      ...result,
      resolvedHandler: this.type,
    };
  }
}

export const brandEnvironmentHandler = new BrandEnvironmentHandler();
