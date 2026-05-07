// Phase 23B (Task #174): unit tests for the render-system router.
// Mocks `patchSceneAtomic` at the module boundary so persistence side
// effects can be observed without a DB.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  __resetRegistryForTests,
  registerRenderHandler,
  dispatchRender,
  getRegisteredHandlerTypes,
  getMissingHandlerTypes,
  buildLastRender,
} from '../render-system-router';
import type {
  RenderHandlerResult,
  RenderOptions,
  SceneRenderHandler,
} from '../render-handlers/types';
import type { RenderSystemType } from '../../../shared/video-types';

const { patchSceneAtomicMock } = vi.hoisted(() => ({
  patchSceneAtomicMock: vi.fn(),
}));

vi.mock('../video-project-db', () => ({
  patchSceneAtomic: patchSceneAtomicMock,
}));

function makeHandler(
  type: RenderSystemType,
  resultOverride: Partial<RenderHandlerResult> = {},
): SceneRenderHandler & { calls: Array<{ options: RenderOptions }> } {
  const calls: Array<{ options: RenderOptions }> = [];
  return {
    type,
    calls,
    async render(options) {
      calls.push({ options });
      return {
        success: true,
        videoUrl: `https://example.com/${type}.mp4`,
        provider: 'kling',
        resolvedHandler: type,
        ...resultOverride,
      };
    },
  };
}

const baseOptions: RenderOptions = {
  prompt: 'test prompt',
  duration: 6,
  aspectRatio: '16:9',
  sceneType: 'hook',
};

beforeEach(() => {
  __resetRegistryForTests();
  patchSceneAtomicMock.mockReset();
  patchSceneAtomicMock.mockResolvedValue(1);
});

describe('registry', () => {
  it('records registered + missing handler types', () => {
    registerRenderHandler(makeHandler('ai_video'));
    registerRenderHandler(makeHandler('brand_environment'));

    expect(getRegisteredHandlerTypes()).toEqual(['ai_video', 'brand_environment']);
    expect(getMissingHandlerTypes()).toEqual([
      'title_card',
      'infographic',
      'scientific_medical',
      'product_showcase',
      'ugc_avatar',
    ]);
  });

  it('warns on overwrite but accepts the new handler', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerRenderHandler(makeHandler('ai_video'));
    const second = makeHandler('ai_video');
    registerRenderHandler(second);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Overwriting existing handler for type=ai_video'),
    );
    warn.mockRestore();
  });
});

describe('dispatchRender', () => {
  it('routes to the handler matching scene.renderSystemType', async () => {
    registerRenderHandler(makeHandler('ai_video'));
    const brand = makeHandler('brand_environment');
    registerRenderHandler(brand);

    const result = await dispatchRender({
      scene: { id: 's1', renderSystemType: 'brand_environment' },
      projectId: 'p1',
      sceneId: 's1',
      jobId: 'j1',
      options: baseOptions,
    });

    expect(brand.calls.length).toBe(1);
    expect(result.resolvedHandler).toBe('brand_environment');
    expect(result.fallback).toBeUndefined();
  });

  it('falls back to ai_video when scene has no renderSystemType', async () => {
    const ai = makeHandler('ai_video');
    registerRenderHandler(ai);

    const result = await dispatchRender({
      scene: { id: 's1' },
      projectId: 'p1',
      sceneId: 's1',
      jobId: 'j1',
      options: baseOptions,
    });

    expect(ai.calls.length).toBe(1);
    expect(result.resolvedHandler).toBe('ai_video');
    expect(result.fallback).toBeUndefined();
  });

  it('synthesizes a fallback record when a known type has no registered handler', async () => {
    registerRenderHandler(makeHandler('ai_video'));
    // Note: title_card NOT registered.
    const result = await dispatchRender({
      scene: { id: 's1', renderSystemType: 'title_card' },
      projectId: 'p1',
      sceneId: 's1',
      jobId: 'j1',
      options: baseOptions,
    });
    expect(result.resolvedHandler).toBe('ai_video');
    expect(result.fallback).toEqual({
      from: 'title_card',
      to: 'ai_video',
      reason: expect.stringContaining('No handler registered for "title_card"'),
    });
  });

  it('throws when even ai_video is unregistered', async () => {
    await expect(
      dispatchRender({
        scene: { id: 's1', renderSystemType: 'ai_video' },
        projectId: 'p1',
        sceneId: 's1',
        jobId: 'j1',
        options: baseOptions,
      }),
    ).rejects.toThrow(/No handler registered.*ai_video fallback/);
  });

  it('persists lastRender via patchSceneAtomic on success', async () => {
    registerRenderHandler(makeHandler('ai_video', { provider: 'seedance-2.0' }));
    await dispatchRender({
      scene: { id: 's1', renderSystemType: 'ai_video' },
      projectId: 'p1',
      sceneId: 's1',
      jobId: 'j1',
      options: baseOptions,
    });
    expect(patchSceneAtomicMock).toHaveBeenCalledWith(
      'p1',
      's1',
      expect.objectContaining({
        lastRender: expect.objectContaining({
          renderSystemType: 'ai_video',
          resolvedHandler: 'ai_video',
          provider: 'seedance-2.0',
          videoUrl: 'https://example.com/ai_video.mp4',
        }),
      }),
    );
  });

  it('writes lastRender to the parent scene id for micro-scene jobs', async () => {
    registerRenderHandler(makeHandler('ai_video'));
    await dispatchRender({
      scene: { id: 'scene_alpha', renderSystemType: 'ai_video' },
      projectId: 'p1',
      sceneId: 'scene_alpha__micro_2',
      jobId: 'j1',
      options: baseOptions,
    });
    expect(patchSceneAtomicMock).toHaveBeenCalledWith(
      'p1',
      'scene_alpha',
      expect.objectContaining({ lastRender: expect.any(Object) }),
    );
  });

  it('does NOT persist lastRender on handler throw — worker lifecycle owns the failure write', async () => {
    const throwing: SceneRenderHandler = {
      type: 'ai_video',
      render: vi.fn().mockRejectedValue(new Error('provider down')),
    };
    registerRenderHandler(throwing);

    await expect(
      dispatchRender({
        scene: { id: 's1', renderSystemType: 'ai_video' },
        projectId: 'p1',
        sceneId: 's1',
        jobId: 'j1',
        options: baseOptions,
      }),
    ).rejects.toThrow('provider down');

    // Per Phase 23B spec: throws bypass lastRender persistence.
    expect(patchSceneAtomicMock).not.toHaveBeenCalled();
  });

  it('passes through to ai_video when classifierConfidence is 0 (classifier-error sentinel)', async () => {
    const ai = makeHandler('ai_video');
    const product = makeHandler('product_showcase');
    registerRenderHandler(ai);
    registerRenderHandler(product);

    const result = await dispatchRender({
      scene: {
        id: 's1',
        renderSystemType: 'product_showcase',
        classifierConfidence: 0,
        manuallyClassified: false,
      },
      projectId: 'p1',
      sceneId: 's1',
      jobId: 'j1',
      options: baseOptions,
    });

    expect(product.calls.length).toBe(0);
    expect(ai.calls.length).toBe(1);
    expect(result.resolvedHandler).toBe('ai_video');
  });

  it('respects manually-classified scenes even when classifierConfidence is 0', async () => {
    const ai = makeHandler('ai_video');
    const product = makeHandler('product_showcase');
    registerRenderHandler(ai);
    registerRenderHandler(product);

    await dispatchRender({
      scene: {
        id: 's1',
        renderSystemType: 'product_showcase',
        classifierConfidence: 0,
        manuallyClassified: true,
      },
      projectId: 'p1',
      sceneId: 's1',
      jobId: 'j1',
      options: baseOptions,
    });

    expect(product.calls.length).toBe(1);
    expect(ai.calls.length).toBe(0);
  });

  it('lastRender write failure is non-fatal — handler result still returned', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    patchSceneAtomicMock.mockRejectedValueOnce(new Error('db gone'));
    registerRenderHandler(makeHandler('ai_video'));
    const result = await dispatchRender({
      scene: { id: 's1', renderSystemType: 'ai_video' },
      projectId: 'p1',
      sceneId: 's1',
      jobId: 'j1',
      options: baseOptions,
    });
    expect(result.success).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('lastRender write failed (non-fatal)'),
    );
    warn.mockRestore();
  });
});

describe('buildLastRender', () => {
  it('marks manualClassifiedFallback when manually classified scene falls back', () => {
    const rec = buildLastRender({
      requested: 'title_card',
      result: {
        success: true,
        resolvedHandler: 'ai_video',
        provider: 'kling',
        fallback: { from: 'title_card', to: 'ai_video', reason: 'stub' },
      },
      manuallyClassified: true,
      durationMs: 1234,
      unknownFallback: false,
    });
    expect(rec.manualClassifiedFallback).toBe(true);
    expect(rec.fallback?.reason).toBe('stub');
    expect(rec.durationMs).toBe(1234);
  });

  it('omits manualClassifiedFallback when classified by AI even on fallback', () => {
    const rec = buildLastRender({
      requested: 'title_card',
      result: {
        success: true,
        resolvedHandler: 'ai_video',
        fallback: { from: 'title_card', to: 'ai_video', reason: 'stub' },
      },
      manuallyClassified: false,
      durationMs: 100,
      unknownFallback: false,
    });
    expect(rec.manualClassifiedFallback).toBeUndefined();
  });
});
