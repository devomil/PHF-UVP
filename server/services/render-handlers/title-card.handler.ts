// Phase 24A (Task #175): real Title Card render handler.
//
// Replaces the Phase 23B stub that delegated everything to ai_video. We
// render a Remotion `TitleCard*` composition through the existing Lambda
// renderer (the same path the project-level renders already use) so the
// MP4 lands on S3 with the same URL contract as ai_video.
//
// Inputs:
//   - Title is extracted from `scene.narration` (preferred) or
//     `scene.visualDirection` / `imagePrompt` (fallback). The first
//     sentence becomes the title; remainder becomes the optional
//     subtitle. If we can't find any usable text, we fall back to
//     ai_video so the user still gets *something* on the timeline.
//   - Brand colors / heading font / logo are read from the SceneSnapshot
//     (populated by the worker from project.brand). All optional —
//     defaults render a neutral dark gradient with white text.
//
// Failure modes (all fall back to ai_video and record the reason on the
// SceneRenderRecord so the editor's "Rendered as: AI Video [Fallback]"
// pill explains what happened):
//   - No usable title text on the scene.
//   - Lambda render throws (deploy mismatch, timeout, AWS rate limit).

import { remotionLambdaService } from '../remotion-lambda-service';
import { aiVideoHandler } from './ai-video.handler';
import type {
  RenderHandlerContext,
  RenderHandlerResult,
  RenderOptions,
  SceneRenderHandler,
} from './types';

const DEFAULT_BRAND_PRIMARY = '#1a1f3a';
const DEFAULT_BRAND_SECONDARY = '#5a3fc0';
const DEFAULT_BRAND_TEXT = '#ffffff';

const TITLE_MAX_CHARS = 80;
const SUBTITLE_MAX_CHARS = 160;

function pickCompositionId(aspectRatio?: string): string {
  if (aspectRatio === '9:16') return 'TitleCardVertical';
  if (aspectRatio === '1:1') return 'TitleCardSquare';
  return 'TitleCard';
}

function trimTo(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  // Cut on the last word boundary before max so we don't slice mid-word.
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trim() + '…';
}

/** Splits the source text into (title, subtitle).
 *  - First sentence (terminated by . ! ? : or newline) becomes the title.
 *  - Remaining text becomes the subtitle.
 *  - If the source has no terminator and is short, the whole thing is
 *    the title with no subtitle. */
export function extractTitleAndSubtitle(source: string): {
  title: string;
  subtitle?: string;
} {
  const cleaned = source.replace(/\s+/g, ' ').trim();
  if (!cleaned) return { title: '' };

  const sentenceMatch = cleaned.match(/^(.+?[.!?:])\s+(.*)$/);
  if (sentenceMatch) {
    const head = sentenceMatch[1].replace(/[.:!?]$/, '').trim();
    const rest = sentenceMatch[2].trim();
    return {
      title: trimTo(head, TITLE_MAX_CHARS),
      subtitle: rest ? trimTo(rest, SUBTITLE_MAX_CHARS) : undefined,
    };
  }

  // No sentence boundary — try a newline split, otherwise treat as
  // single-line title.
  const newlineSplit = cleaned.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (newlineSplit.length > 1) {
    return {
      title: trimTo(newlineSplit[0], TITLE_MAX_CHARS),
      subtitle: trimTo(newlineSplit.slice(1).join(' '), SUBTITLE_MAX_CHARS),
    };
  }
  return { title: trimTo(cleaned, TITLE_MAX_CHARS) };
}

export class TitleCardHandler implements SceneRenderHandler {
  readonly type = 'title_card' as const;

  /** Available only when AWS credentials are wired so the Lambda
   *  renderer can actually execute. The `/api/render-router/handlers`
   *  endpoint surfaces this so the editor preview chip can warn that
   *  title_card will degrade to ai_video on unconfigured deploys. */
  isAvailable(): boolean {
    return !!(
      process.env.REMOTION_AWS_ACCESS_KEY_ID &&
      process.env.REMOTION_AWS_SECRET_ACCESS_KEY
    );
  }

  async render(
    options: RenderOptions,
    ctx: RenderHandlerContext,
  ): Promise<RenderHandlerResult> {
    if (!this.isAvailable()) {
      const result = await aiVideoHandler.render(options, ctx);
      return {
        ...result,
        resolvedHandler: 'ai_video',
        fallback: {
          from: this.type,
          to: 'ai_video',
          reason:
            'AWS credentials not configured — cannot run Remotion Lambda render',
        },
      };
    }

    const sourceText =
      ctx.scene.narration?.trim() ||
      ctx.scene.visualDirection?.trim() ||
      ctx.scene.imagePrompt?.trim() ||
      options.prompt?.trim() ||
      '';
    const { title, subtitle } = extractTitleAndSubtitle(sourceText);

    if (!title) {
      const result = await aiVideoHandler.render(options, ctx);
      return {
        ...result,
        resolvedHandler: 'ai_video',
        fallback: {
          from: this.type,
          to: 'ai_video',
          reason:
            'Title card requires narration or visual direction text — none found on scene',
        },
      };
    }

    const compositionId = pickCompositionId(options.aspectRatio);
    const inputProps = {
      title,
      subtitle,
      brandPrimary: ctx.scene.brandPrimaryColor || DEFAULT_BRAND_PRIMARY,
      brandSecondary: ctx.scene.brandSecondaryColor || DEFAULT_BRAND_SECONDARY,
      brandText: ctx.scene.brandTextColor || DEFAULT_BRAND_TEXT,
      fontFamily: ctx.scene.brandHeadingFont,
      logoUrl: ctx.scene.brandLogoUrl,
      durationSeconds: Math.max(1, Math.min(20, options.duration || 4)),
    };

    const startedAt = Date.now();
    try {
      console.log(
        `[TitleCard] job=${ctx.jobId} scene=${ctx.sceneId} composition=${compositionId} title="${title.substring(0, 60)}"${subtitle ? ` subtitle="${subtitle.substring(0, 40)}"` : ''}`,
      );
      const outputUrl = await remotionLambdaService.renderVideo({
        compositionId,
        inputProps,
        codec: 'h264',
      });
      const generationTimeMs = Date.now() - startedAt;
      console.log(
        `[TitleCard] job=${ctx.jobId} scene=${ctx.sceneId} render complete in ${generationTimeMs}ms: ${outputUrl}`,
      );
      return {
        success: true,
        videoUrl: outputUrl,
        s3Url: outputUrl,
        provider: 'remotion-lambda',
        duration: inputProps.durationSeconds,
        generationTimeMs,
        resolvedHandler: this.type,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[TitleCard] job=${ctx.jobId} scene=${ctx.sceneId} Lambda render failed (${msg}) — falling back to ai_video`,
      );
      const result = await aiVideoHandler.render(options, ctx);
      return {
        ...result,
        resolvedHandler: 'ai_video',
        fallback: {
          from: this.type,
          to: 'ai_video',
          reason: `Remotion title-card render failed: ${msg}`,
        },
      };
    }
  }
}

export const titleCardHandler = new TitleCardHandler();
