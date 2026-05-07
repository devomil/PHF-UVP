// Phase 23B (Task #174): stub handlers for render systems that aren't
// shipped yet. Each delegates to the ai-video handler and records a
// fallback so the UI shows the "Rendered as: AI Video [Fallback]" pill.
// When the real handler ships (Phases 24A / 24B / 25 / 27), swap the
// stub for the real implementation in `index.ts`.

import { aiVideoHandler } from './ai-video.handler';
import type { RenderSystemType } from '../../../shared/video-types';
import type {
  RenderHandlerContext,
  RenderHandlerResult,
  RenderOptions,
  SceneRenderHandler,
} from './types';

class StubHandler implements SceneRenderHandler {
  constructor(
    public readonly type: RenderSystemType,
    private readonly futurePhase: string,
  ) {}

  /** Stubs are explicitly NOT available — surfaces a stable signal to
   *  the editor preview chip and the diagnostics endpoint. */
  isAvailable(): boolean {
    return false;
  }

  async render(
    options: RenderOptions,
    ctx: RenderHandlerContext,
  ): Promise<RenderHandlerResult> {
    console.log(
      `[RenderRouter:stub] job=${ctx.jobId} scene=${ctx.sceneId} type=${this.type} not yet implemented (${this.futurePhase}) — delegating to ai_video`,
    );
    const result = await aiVideoHandler.render(options, ctx);
    return {
      ...result,
      resolvedHandler: 'ai_video',
      fallback: {
        from: this.type,
        to: 'ai_video',
        reason: `${this.type} handler not yet implemented (${this.futurePhase})`,
      },
    };
  }
}

export const titleCardStubHandler = new StubHandler('title_card', 'Phase 24A');
export const infographicStubHandler = new StubHandler('infographic', 'Phase 24B');
export const scientificMedicalStubHandler = new StubHandler('scientific_medical', 'Phase 25');
export const ugcAvatarStubHandler = new StubHandler('ugc_avatar', 'Phase 27');
