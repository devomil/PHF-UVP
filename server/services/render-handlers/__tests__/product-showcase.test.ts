// Task #177: per-branch tests for the ProductShowcaseHandler.
//
// Mocks `aiVideoHandler` at the module boundary so we can assert the
// reference-resolution priority chain, the Seedance variant choice
// driven by qualityTier, the >9-references cap, and the no-image
// ai_video fallback — all without invoking the real video pipeline.

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

import { productShowcaseHandler } from '../product-showcase.handler';

const baseOptions: RenderOptions = {
  prompt: 'Hero product shot of the bottle on marble',
  duration: 6,
  aspectRatio: '16:9',
  sceneType: 'product',
};

const baseCtx: RenderHandlerContext = {
  projectId: 'p1',
  sceneId: 's1',
  jobId: 'j1',
  scene: {
    id: 's1',
    sceneType: 'product',
    narration: 'Crafted with care.',
    visualDirection: 'Bottle rotates slowly on marble surface',
  },
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
});

describe('ProductShowcaseHandler.render', () => {
  it('falls back to ai_video when no reference image is available', async () => {
    const result = await productShowcaseHandler.render(baseOptions, baseCtx);

    expect(aiVideoRenderMock).toHaveBeenCalledTimes(1);
    // Must NOT inject a Seedance preferred provider on the fallback call.
    expect(aiVideoRenderMock.mock.calls[0][0].preferredProvider).toBeUndefined();
    expect(aiVideoRenderMock.mock.calls[0][0].imageUrls).toBeUndefined();

    expect(result.resolvedHandler).toBe('ai_video');
    expect(result.fallback).toEqual({
      from: 'product_showcase',
      to: 'ai_video',
      reason: expect.stringContaining('No product reference image'),
    });
  });

  it('uses options.imageUrls in priority over scene refs and picks seedance-2.0 for non-draft tiers', async () => {
    const result = await productShowcaseHandler.render(
      {
        ...baseOptions,
        imageUrls: ['https://cdn/opt-a.png', 'https://cdn/opt-b.png'],
        qualityTier: 'standard',
      },
      {
        ...baseCtx,
        scene: {
          ...baseCtx.scene,
          brandReferenceUrls: ['https://cdn/brand-ref.png'],
          productImageUrls: ['https://cdn/product.png'],
        },
      },
    );

    expect(aiVideoRenderMock).toHaveBeenCalledTimes(1);
    const passed = aiVideoRenderMock.mock.calls[0][0];
    expect(passed.imageUrls).toEqual(['https://cdn/opt-a.png', 'https://cdn/opt-b.png']);
    expect(passed.imageUrl).toBe('https://cdn/opt-a.png');
    expect(passed.preferredProvider).toBe('seedance-2.0');
    expect(passed.isProviderHint).toBe(false);
    expect(result.resolvedHandler).toBe('product_showcase');
    expect(result.fallback).toBeUndefined();
  });

  it('promotes options.imageUrl (single) into the imageUrls array for omni_reference', async () => {
    await productShowcaseHandler.render(
      { ...baseOptions, imageUrl: 'https://cdn/single.png' },
      baseCtx,
    );

    const passed = aiVideoRenderMock.mock.calls[0][0];
    expect(passed.imageUrls).toEqual(['https://cdn/single.png']);
    expect(passed.imageUrl).toBe('https://cdn/single.png');
    expect(passed.preferredProvider).toBe('seedance-2.0');
  });

  it('falls back to scene.brandReferenceUrls when options has no anchor', async () => {
    await productShowcaseHandler.render(baseOptions, {
      ...baseCtx,
      scene: {
        ...baseCtx.scene,
        brandReferenceUrls: ['https://cdn/brand-1.png', 'https://cdn/brand-2.png'],
        productImageUrls: ['https://cdn/should-not-use.png'],
      },
    });

    const passed = aiVideoRenderMock.mock.calls[0][0];
    expect(passed.imageUrls).toEqual([
      'https://cdn/brand-1.png',
      'https://cdn/brand-2.png',
    ]);
  });

  it('falls back to scene.productImageUrls when neither options nor brandReferenceUrls supply refs', async () => {
    await productShowcaseHandler.render(baseOptions, {
      ...baseCtx,
      scene: {
        ...baseCtx.scene,
        productImageUrls: ['https://cdn/product-1.png'],
      },
    });

    const passed = aiVideoRenderMock.mock.calls[0][0];
    expect(passed.imageUrls).toEqual(['https://cdn/product-1.png']);
  });

  it('chooses seedance-2.0-fast when qualityTier is "draft"', async () => {
    await productShowcaseHandler.render(
      {
        ...baseOptions,
        imageUrls: ['https://cdn/a.png'],
        qualityTier: 'draft',
      },
      baseCtx,
    );

    expect(aiVideoRenderMock.mock.calls[0][0].preferredProvider).toBe('seedance-2.0-fast');
  });

  it('caps reference images to 9 and warns when more are supplied', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refs = Array.from({ length: 12 }, (_, i) => `https://cdn/r${i}.png`);

    await productShowcaseHandler.render(
      { ...baseOptions, imageUrls: refs },
      baseCtx,
    );

    const passed = aiVideoRenderMock.mock.calls[0][0];
    expect(passed.imageUrls).toHaveLength(9);
    expect(passed.imageUrls?.[0]).toBe('https://cdn/r0.png');
    expect(passed.imageUrls?.[8]).toBe('https://cdn/r8.png');
    expect(passed.imageUrl).toBe('https://cdn/r0.png');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('capping to first 9'),
    );
    warn.mockRestore();
  });
});
