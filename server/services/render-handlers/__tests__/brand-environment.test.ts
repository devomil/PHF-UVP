// Task #177: per-branch tests for the BrandEnvironmentHandler.
//
// Mocks `recraftService`, `evaluateSceneTextRouting`, and `aiVideoHandler`
// at the module boundary so each branch (no-key, anchor-skip, routing-
// declined, recraft-throw, success) can be exercised without touching
// network / DB.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  RenderHandlerContext,
  RenderHandlerResult,
  RenderOptions,
} from '../types';

const { recraftMock, routingMock, aiVideoRenderMock } = vi.hoisted(() => ({
  recraftMock: { generateWithBrandedText: vi.fn() },
  routingMock: vi.fn(),
  aiVideoRenderMock: vi.fn(),
}));

vi.mock('../../recraft.service', () => ({
  recraftService: recraftMock,
}));

vi.mock('../../../utils/recraft-scene-policy', () => ({
  evaluateSceneTextRouting: routingMock,
}));

vi.mock('../ai-video.handler', () => ({
  aiVideoHandler: { type: 'ai_video' as const, render: aiVideoRenderMock },
}));

import { brandEnvironmentHandler } from '../brand-environment.handler';

const baseOptions: RenderOptions = {
  prompt: 'Branded clinic exterior at golden hour',
  duration: 6,
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
    narration: 'Welcome to Origin Holistic Clinic.',
    visualDirection: 'Storefront with sign reading "Origin Holistic"',
  },
};

const aiVideoSuccess: RenderHandlerResult = {
  success: true,
  videoUrl: 'https://example.com/ai_video.mp4',
  provider: 'kling',
  resolvedHandler: 'ai_video',
};

const ORIGINAL_KEY = process.env.RECRAFT_API_KEY;

beforeEach(() => {
  recraftMock.generateWithBrandedText.mockReset();
  routingMock.mockReset();
  aiVideoRenderMock.mockReset();
  aiVideoRenderMock.mockResolvedValue(aiVideoSuccess);
  process.env.RECRAFT_API_KEY = 'test-key';
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.RECRAFT_API_KEY;
  else process.env.RECRAFT_API_KEY = ORIGINAL_KEY;
});

describe('BrandEnvironmentHandler.isAvailable', () => {
  it('returns true when RECRAFT_API_KEY is set', () => {
    process.env.RECRAFT_API_KEY = 'k';
    expect(brandEnvironmentHandler.isAvailable!()).toBe(true);
  });

  it('returns false when RECRAFT_API_KEY is missing', () => {
    delete process.env.RECRAFT_API_KEY;
    expect(brandEnvironmentHandler.isAvailable!()).toBe(false);
  });
});

describe('BrandEnvironmentHandler.render', () => {
  it('falls back to ai_video with a clear reason when RECRAFT_API_KEY is unset', async () => {
    delete process.env.RECRAFT_API_KEY;

    const result = await brandEnvironmentHandler.render(baseOptions, baseCtx);

    expect(aiVideoRenderMock).toHaveBeenCalledTimes(1);
    expect(recraftMock.generateWithBrandedText).not.toHaveBeenCalled();
    expect(routingMock).not.toHaveBeenCalled();
    expect(result.resolvedHandler).toBe('ai_video');
    expect(result.fallback).toEqual({
      from: 'brand_environment',
      to: 'ai_video',
      reason: expect.stringContaining('RECRAFT_API_KEY not configured'),
    });
  });

  it('skips Recraft when caller already supplied an imageUrl anchor', async () => {
    const result = await brandEnvironmentHandler.render(
      { ...baseOptions, imageUrl: 'https://cdn/anchor.png' },
      baseCtx,
    );

    expect(recraftMock.generateWithBrandedText).not.toHaveBeenCalled();
    expect(routingMock).not.toHaveBeenCalled();
    expect(aiVideoRenderMock).toHaveBeenCalledTimes(1);
    // Anchor should pass through unchanged — handler must not overwrite it.
    expect(aiVideoRenderMock.mock.calls[0][0]).toMatchObject({
      imageUrl: 'https://cdn/anchor.png',
    });
    expect(result.resolvedHandler).toBe('ai_video');
    expect(result.fallback).toEqual({
      from: 'brand_environment',
      to: 'ai_video',
      reason: 'Anchor image already supplied — skipped Recraft still',
    });
  });

  it('skips Recraft when caller supplied a non-empty imageUrls array', async () => {
    const result = await brandEnvironmentHandler.render(
      { ...baseOptions, imageUrls: ['https://cdn/a.png', 'https://cdn/b.png'] },
      baseCtx,
    );

    expect(recraftMock.generateWithBrandedText).not.toHaveBeenCalled();
    expect(result.resolvedHandler).toBe('ai_video');
    expect(result.fallback?.reason).toMatch(/Anchor image already supplied/);
  });

  it('falls back to ai_video when evaluateSceneTextRouting.useRecraft is false', async () => {
    routingMock.mockReturnValue({
      useRecraft: false,
      reason: 'no branded text detected',
      needsTextInjection: false,
    });

    const result = await brandEnvironmentHandler.render(baseOptions, baseCtx);

    expect(routingMock).toHaveBeenCalledTimes(1);
    expect(recraftMock.generateWithBrandedText).not.toHaveBeenCalled();
    expect(aiVideoRenderMock).toHaveBeenCalledTimes(1);
    expect(result.resolvedHandler).toBe('ai_video');
    expect(result.fallback).toEqual({
      from: 'brand_environment',
      to: 'ai_video',
      reason: 'Recraft routing declined: no branded text detected',
    });
  });

  it('falls back to ai_video when Recraft generation throws', async () => {
    routingMock.mockReturnValue({
      useRecraft: true,
      reason: 'branded signage detected',
      needsTextInjection: true,
      suggestedTextElement: 'sign reading "Origin Holistic"',
    });
    recraftMock.generateWithBrandedText.mockRejectedValue(new Error('recraft 503'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await brandEnvironmentHandler.render(baseOptions, baseCtx);

    expect(recraftMock.generateWithBrandedText).toHaveBeenCalledTimes(1);
    expect(aiVideoRenderMock).toHaveBeenCalledTimes(1);
    // Fallback ai_video call must NOT have a Recraft still injected.
    expect(aiVideoRenderMock.mock.calls[0][0].imageUrl).toBeUndefined();
    expect(result.resolvedHandler).toBe('ai_video');
    expect(result.fallback).toEqual({
      from: 'brand_environment',
      to: 'ai_video',
      reason: 'Recraft still failed: recraft 503',
    });
    warn.mockRestore();
  });

  it('on success: generates Recraft still, re-enters ai_video with subtle motion override, resolves to brand_environment', async () => {
    routingMock.mockReturnValue({
      useRecraft: true,
      reason: 'branded signage detected',
      needsTextInjection: true,
      suggestedTextElement: 'sign reading "Origin Holistic"',
    });
    recraftMock.generateWithBrandedText.mockResolvedValue({
      imageUrl: 'https://cdn/recraft-still.png',
      s3Key: 'render-handlers/brand-env/p1/s1/abc.png',
      model: 'recraftv3',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await brandEnvironmentHandler.render(baseOptions, baseCtx);

    expect(recraftMock.generateWithBrandedText).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '16:9',
        s3KeyPrefix: 'render-handlers/brand-env/p1/s1',
        textElements: [
          expect.objectContaining({ text: 'Origin Holistic' }),
        ],
      }),
    );

    expect(aiVideoRenderMock).toHaveBeenCalledTimes(1);
    const passed = aiVideoRenderMock.mock.calls[0][0];
    expect(passed.imageUrl).toBe('https://cdn/recraft-still.png');
    expect(passed.motionPromptOverride).toMatch(/Subtle cinematic motion/);

    expect(result.resolvedHandler).toBe('brand_environment');
    expect(result.fallback).toBeUndefined();
    log.mockRestore();
  });

  it('coerces unsupported aspect ratios to 16:9 when calling Recraft', async () => {
    routingMock.mockReturnValue({
      useRecraft: true,
      reason: 'branded signage detected',
      needsTextInjection: false,
    });
    recraftMock.generateWithBrandedText.mockResolvedValue({
      imageUrl: 'https://cdn/still.png',
      s3Key: 'k',
      model: 'recraftv3',
    });

    await brandEnvironmentHandler.render(
      { ...baseOptions, aspectRatio: '4:3' as never },
      baseCtx,
    );

    expect(recraftMock.generateWithBrandedText.mock.calls[0][0].aspectRatio).toBe('16:9');
  });
});
