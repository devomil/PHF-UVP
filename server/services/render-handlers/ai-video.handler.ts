// Phase 23B (Task #174): default AI-video handler. Wraps
// `aiVideoService.generateVideo` 1:1 — when a scene's `renderSystemType`
// is `ai_video` (or unknown / unclassified), the router dispatches here
// and we forward every option as-is. This is also the fallback target
// for stub handlers.

import { aiVideoService } from '../ai-video-service';
import type {
  RenderHandlerContext,
  RenderHandlerResult,
  RenderOptions,
  SceneRenderHandler,
} from './types';

export class AiVideoHandler implements SceneRenderHandler {
  readonly type = 'ai_video' as const;

  async render(
    options: RenderOptions,
    _ctx: RenderHandlerContext,
  ): Promise<RenderHandlerResult> {
    // motionPromptOverride wins over the supplied prompt — used by
    // brand-environment / product-showcase still-then-i2v re-entry so
    // the I2V leg gets a "subtle camera push" prompt instead of the
    // original visual direction (which was already baked into the still).
    const finalPrompt = options.motionPromptOverride ?? options.prompt;
    const { motionPromptOverride: _omit, ...rest } = options;
    const result = await aiVideoService.generateVideo({
      ...rest,
      prompt: finalPrompt,
    });
    return { ...result, resolvedHandler: this.type };
  }
}

export const aiVideoHandler = new AiVideoHandler();
