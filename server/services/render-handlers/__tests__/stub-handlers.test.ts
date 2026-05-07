// Task #177: per-stub tests confirming each unimplemented render
// system delegates to ai_video and records a fallback record with the
// expected `from` / `to` / phase-tagged reason shape.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  RenderHandlerContext,
  RenderHandlerResult,
  RenderOptions,
} from '../types';

const { aiVideoRenderMock } = vi.hoisted(() => ({
  aiVideoRenderMock: vi.fn(),
}));

vi.mock('../ai-video.handler', () => ({
  aiVideoHandler: { type: 'ai_video' as const, render: aiVideoRenderMock },
}));

import {
  titleCardStubHandler,
  infographicStubHandler,
  scientificMedicalStubHandler,
  ugcAvatarStubHandler,
} from '../stub-handlers';

const baseOptions: RenderOptions = {
  prompt: 'placeholder',
  duration: 6,
  aspectRatio: '16:9',
  sceneType: 'hook',
};

const baseCtx: RenderHandlerContext = {
  projectId: 'p1',
  sceneId: 's1',
  jobId: 'j1',
  scene: { id: 's1' },
};

const aiVideoSuccess: RenderHandlerResult = {
  success: true,
  videoUrl: 'https://example.com/ai_video.mp4',
  provider: 'kling',
  resolvedHandler: 'ai_video',
};

beforeEach(() => {
  aiVideoRenderMock.mockReset();
  aiVideoRenderMock.mockResolvedValue(aiVideoSuccess);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const cases: Array<{
  name: string;
  handler: { type: string; isAvailable?: () => boolean; render: typeof titleCardStubHandler.render };
  type: string;
  phase: string;
}> = [
  { name: 'title_card', handler: titleCardStubHandler, type: 'title_card', phase: 'Phase 24A' },
  { name: 'infographic', handler: infographicStubHandler, type: 'infographic', phase: 'Phase 24B' },
  { name: 'scientific_medical', handler: scientificMedicalStubHandler, type: 'scientific_medical', phase: 'Phase 25' },
  { name: 'ugc_avatar', handler: ugcAvatarStubHandler, type: 'ugc_avatar', phase: 'Phase 27' },
];

describe('stub handlers', () => {
  for (const { name, handler, type, phase } of cases) {
    describe(name, () => {
      it('reports isAvailable() === false', () => {
        expect(handler.isAvailable!()).toBe(false);
      });

      it('delegates to ai_video and records a fallback with the phase-tagged reason', async () => {
        const result = await handler.render(baseOptions, baseCtx);

        expect(aiVideoRenderMock).toHaveBeenCalledTimes(1);
        expect(result.resolvedHandler).toBe('ai_video');
        expect(result.fallback).toEqual({
          from: type,
          to: 'ai_video',
          reason: `${type} handler not yet implemented (${phase})`,
        });
        // Underlying ai_video success fields propagate.
        expect(result.success).toBe(true);
        expect(result.videoUrl).toBe('https://example.com/ai_video.mp4');
      });
    });
  }
});
