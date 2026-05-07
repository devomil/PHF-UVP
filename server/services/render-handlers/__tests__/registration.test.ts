// Task #180: smoke test guarding the boot-time wiring of every render
// handler. If a future refactor accidentally drops one of the
// `registerRenderHandler(...)` calls in `index.ts`, the router would
// silently fall back to ai_video for that scene type — exactly the
// silent regression Task #177 was created to prevent, but at the wiring
// layer instead of the handler-branch layer.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RENDER_SYSTEM_TYPES } from '../../../../shared/video-types';

let consoleLogSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.resetModules();
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const router = await import('../../render-system-router');
  router.__resetRegistryForTests();
});

afterEach(() => {
  consoleLogSpy.mockRestore();
});

describe('render handler registration (boot wiring)', () => {
  it('registers a handler for every RenderSystemType', async () => {
    const router = await import('../../render-system-router');
    const index = await import('../index');
    index.registerAllRenderHandlers();

    const registered = router.getRegisteredHandlerTypes();
    for (const type of RENDER_SYSTEM_TYPES) {
      expect(registered).toContain(type);
    }
    expect(router.getMissingHandlerTypes()).toEqual([]);
  });

  it('is idempotent — calling twice does not duplicate or drop entries', async () => {
    const router = await import('../../render-system-router');
    const index = await import('../index');
    index.registerAllRenderHandlers();
    index.registerAllRenderHandlers();

    const registered = router.getRegisteredHandlerTypes();
    expect(new Set(registered).size).toBe(registered.length);
    for (const type of RENDER_SYSTEM_TYPES) {
      expect(registered).toContain(type);
    }
    expect(router.getMissingHandlerTypes()).toEqual([]);
  });
});
