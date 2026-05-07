// Task #179: tests for the default AiVideoHandler.
//
// Verifies the two load-bearing behaviors:
//   (a) `motionPromptOverride` wins over `prompt` (used by brand-environment
//       and product-showcase still-then-i2v re-entry).
//   (b) `motionPromptOverride` is stripped before forwarding to
//       `aiVideoService.generateVideo` so the field never leaks downstream.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  RenderHandlerContext,
  RenderHandlerResult,
  RenderOptions,
} from '../types';

const { generateVideoMock } = vi.hoisted(() => ({
  generateVideoMock: vi.fn(),
}));

vi.mock('../../ai-video-service', () => ({
  aiVideoService: { generateVideo: generateVideoMock },
}));

import { aiVideoHandler } from '../ai-video.handler';

const baseOptions: RenderOptions = {
  prompt: 'Original visual direction prompt',
  duration: 5,
  aspectRatio: '16:9',
  sceneType: 'establishing',
};

const baseCtx: RenderHandlerContext = {
  projectId: 'p1',
  sceneId: 's1',
  jobId: 'j1',
  scene: {
    id: 's1',
    sceneType: 'establishing',
    narration: 'n',
    visualDirection: 'vd',
  },
};

const successResult: RenderHandlerResult = {
  success: true,
  videoUrl: 'https://example.com/video.mp4',
  provider: 'kling',
};

beforeEach(() => {
  generateVideoMock.mockReset();
  generateVideoMock.mockResolvedValue(successResult);
});

describe('AiVideoHandler.render', () => {
  it('forwards the original prompt unchanged when no override is provided', async () => {
    const result = await aiVideoHandler.render(baseOptions, baseCtx);

    expect(generateVideoMock).toHaveBeenCalledTimes(1);
    const passed = generateVideoMock.mock.calls[0][0];
    expect(passed.prompt).toBe('Original visual direction prompt');
    expect(passed).not.toHaveProperty('motionPromptOverride');
    expect(result.resolvedHandler).toBe('ai_video');
  });

  it('uses motionPromptOverride as the forwarded prompt and strips the override field', async () => {
    const result = await aiVideoHandler.render(
      {
        ...baseOptions,
        motionPromptOverride: 'Subtle cinematic motion: slow camera push-in',
      },
      baseCtx,
    );

    expect(generateVideoMock).toHaveBeenCalledTimes(1);
    const passed = generateVideoMock.mock.calls[0][0];
    expect(passed.prompt).toBe('Subtle cinematic motion: slow camera push-in');
    expect(passed).not.toHaveProperty('motionPromptOverride');
    expect(result.resolvedHandler).toBe('ai_video');
  });

  it('preserves other options (imageUrl, duration, aspectRatio) when forwarding', async () => {
    await aiVideoHandler.render(
      {
        ...baseOptions,
        imageUrl: 'https://cdn/anchor.png',
        motionPromptOverride: 'subtle push',
      },
      baseCtx,
    );

    const passed = generateVideoMock.mock.calls[0][0];
    expect(passed).toMatchObject({
      imageUrl: 'https://cdn/anchor.png',
      duration: 5,
      aspectRatio: '16:9',
      sceneType: 'establishing',
      prompt: 'subtle push',
    });
    expect(passed).not.toHaveProperty('motionPromptOverride');
  });
});
