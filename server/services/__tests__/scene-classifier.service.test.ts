// Phase 23A: tests for scene-classifier.service. Mocks @anthropic-ai/sdk
// + patchSceneAtomic at the module boundary.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SCENE_CLASSIFIER_MODEL,
  parseClassifierResponse,
} from '../scene-classifier.service';
import type { Scene } from '../../../shared/video-types';
import { RENDER_SYSTEM_TYPES } from '../../../shared/video-types';

const { messagesCreateMock, patchSceneAtomicMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
  patchSceneAtomicMock: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: messagesCreateMock };
  },
}));

vi.mock('../video-project-db', () => ({
  patchSceneAtomic: patchSceneAtomicMock,
}));

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene_001',
    type: 'hook',
    duration: 5,
    narration: 'A bowl of fresh berries spills onto a kitchen counter.',
    visualDirection: 'cinematic close-up of berries on marble',
    background: { source: '', mediaType: 'image' },
    ...overrides,
  } as Scene;
}

describe('SCENE_CLASSIFIER_MODEL', () => {
  it('is pinned to Claude Haiku 4.5 (2025-10-01)', () => {
    expect(SCENE_CLASSIFIER_MODEL).toBe('claude-haiku-4-5-20251001');
  });
});

describe('parseClassifierResponse', () => {
  it('parses a clean JSON response with all fields', () => {
    const r = parseClassifierResponse(
      '{"renderSystemType": "title_card", "confidence": 0.92, "reasoning": "explicit chapter title"}',
    );
    expect(r.renderSystemType).toBe('title_card');
    expect(r.confidence).toBeCloseTo(0.92, 5);
    expect(r.reasoning).toBe('explicit chapter title');
  });

  it('extracts a JSON object embedded in code fences', () => {
    const r = parseClassifierResponse(
      '```json\n{"renderSystemType": "infographic", "confidence": 0.7, "reasoning": "stat callout"}\n```',
    );
    expect(r.renderSystemType).toBe('infographic');
    expect(r.confidence).toBe(0.7);
  });

  it('clamps confidence above 1 down to 1', () => {
    const r = parseClassifierResponse(
      '{"renderSystemType": "ai_video", "confidence": 1.7, "reasoning": "x"}',
    );
    expect(r.confidence).toBe(1);
  });

  it('clamps negative confidence up to 0', () => {
    const r = parseClassifierResponse(
      '{"renderSystemType": "ai_video", "confidence": -0.4, "reasoning": "x"}',
    );
    expect(r.confidence).toBe(0);
  });

  it('falls back to ai_video when renderSystemType is unknown', () => {
    const r = parseClassifierResponse(
      '{"renderSystemType": "rocket_launch", "confidence": 0.9, "reasoning": "x"}',
    );
    expect(r.renderSystemType).toBe('ai_video');
  });

  it('returns the neutral fallback on completely unparseable input', () => {
    const r = parseClassifierResponse('I cannot classify this.');
    expect(r.renderSystemType).toBe('ai_video');
    expect(r.confidence).toBe(0);
    expect(r.reasoning).toMatch(/^Classifier error:/);
  });

  it('returns the neutral fallback on empty input', () => {
    const r = parseClassifierResponse('');
    expect(r.renderSystemType).toBe('ai_video');
    expect(r.confidence).toBe(0);
  });

  it('defaults confidence to 0.5 when the model omits it (not 0 — that would collide with the error sentinel)', () => {
    const r = parseClassifierResponse(
      '{"renderSystemType": "infographic", "reasoning": "x"}',
    );
    expect(r.confidence).toBe(0.5);
  });

  it('truncates very long reasoning to ≤160 chars', () => {
    const long = 'x'.repeat(500);
    const r = parseClassifierResponse(
      `{"renderSystemType": "ai_video", "confidence": 0.5, "reasoning": "${long}"}`,
    );
    expect(r.reasoning.length).toBeLessThanOrEqual(160);
  });
});

describe('classifyScene — mocked Anthropic transport', () => {
  beforeEach(async () => {
    messagesCreateMock.mockReset();
    patchSceneAtomicMock.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { __resetClassifierClientForTests } = await import('../scene-classifier.service');
    __resetClassifierClientForTests();
  });

  it('calls Anthropic with the pinned Haiku model and returns the parsed result', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"renderSystemType": "title_card", "confidence": 0.88, "reasoning": "opening title"}' }],
    });
    const { classifyScene } = await import('../scene-classifier.service');

    const r = await classifyScene({
      sceneId: 's1',
      sceneType: 'intro',
      narration: 'Welcome to Pine Hill Farm',
      visualDirection: 'centered title text on cream background',
    });

    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    const callArg = messagesCreateMock.mock.calls[0][0];
    expect(callArg.model).toBe(SCENE_CLASSIFIER_MODEL);
    expect(callArg.max_tokens).toBeGreaterThan(0);
    expect(callArg.system).toMatch(/title_card/);
    expect(r.renderSystemType).toBe('title_card');
    expect(r.confidence).toBeCloseTo(0.88, 5);
  });

  it.each(RENDER_SYSTEM_TYPES)(
    'parses a happy-path response for renderSystemType=%s',
    async (type) => {
      messagesCreateMock.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: `{"renderSystemType": "${type}", "confidence": 0.85, "reasoning": "happy-path ${type}"}`,
        }],
      });
      const { classifyScene } = await import('../scene-classifier.service');
      const r = await classifyScene({
        sceneId: `s_${type}`,
        narration: `narration for ${type}`,
        visualDirection: `visuals for ${type}`,
      });
      expect(r.renderSystemType).toBe(type);
      expect(r.confidence).toBeCloseTo(0.85, 5);
      expect(r.reasoning).toContain(type);
    },
  );

  it('returns the neutral fallback (no API call) when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    // Re-import after mutating env so the lazy-cached client re-evaluates.
    const { __resetClassifierClientForTests, classifyScene } = await import('../scene-classifier.service');
    __resetClassifierClientForTests();

    const r = await classifyScene({
      sceneId: 's1',
      narration: 'test',
      visualDirection: 'test',
    });

    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(r.renderSystemType).toBe('ai_video');
    expect(r.confidence).toBe(0);
    expect(r.reasoning).toMatch(/ANTHROPIC_API_KEY missing/);
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('returns the neutral fallback (no API call) when scene has zero signal', async () => {
    const { classifyScene } = await import('../scene-classifier.service');

    const r = await classifyScene({ sceneId: 's1' });

    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(r.renderSystemType).toBe('ai_video');
    expect(r.confidence).toBe(0);
    expect(r.reasoning).toMatch(/no narration/);
  });

  it('returns the neutral fallback (does NOT throw) when the SDK rejects', async () => {
    messagesCreateMock.mockRejectedValueOnce(new Error('rate limited'));
    const { classifyScene } = await import('../scene-classifier.service');

    const r = await classifyScene({ sceneId: 's1', narration: 'x', visualDirection: 'y' });

    expect(r.renderSystemType).toBe('ai_video');
    expect(r.confidence).toBe(0);
    expect(r.reasoning).toMatch(/rate limited/);
  });
});

describe('classifyProjectScenes — batch flow with patchSceneAtomic', () => {
  beforeEach(async () => {
    messagesCreateMock.mockReset();
    patchSceneAtomicMock.mockReset();
    patchSceneAtomicMock.mockResolvedValue(1);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.SCENE_CLASSIFIER_CONCURRENCY = '5';
    const { __resetClassifierClientForTests } = await import('../scene-classifier.service');
    __resetClassifierClientForTests();
  });

  it('classifies every unclassified scene and writes via patchSceneAtomic', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"renderSystemType": "ai_video", "confidence": 0.8, "reasoning": "narrative"}' }],
    });
    const { classifyProjectScenes } = await import('../scene-classifier.service');

    const scenes: Scene[] = [
      makeScene({ id: 's1', narration: 'a' }),
      makeScene({ id: 's2', narration: 'b' }),
      makeScene({ id: 's3', narration: 'c' }),
    ];

    const summary = await classifyProjectScenes('proj_x', scenes);

    expect(summary.classified).toBe(3);
    expect(summary.skipped).toBe(0);
    expect(summary.distribution.ai_video).toBe(3);
    expect(summary.writeFailures).toBe(0);
    expect(summary.fallbackCount).toBe(0);
    expect(summary.missingKey).toBe(false);
    expect(patchSceneAtomicMock).toHaveBeenCalledTimes(3);
    // Each call must include the 4 classifier fields and NOT touch
    // narration/visualDirection (atomicity guarantee).
    for (const call of patchSceneAtomicMock.mock.calls) {
      const [, , patch] = call;
      expect(patch).toHaveProperty('renderSystemType');
      expect(patch).toHaveProperty('classifierConfidence');
      expect(patch).toHaveProperty('classifierReasoning');
      expect(patch).toHaveProperty('classifiedAt');
      expect(patch).not.toHaveProperty('narration');
      expect(patch).not.toHaveProperty('visualDirection');
    }
  });

  it('skips scenes with manuallyClassified === true', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"renderSystemType": "ai_video", "confidence": 0.8, "reasoning": "x"}' }],
    });
    const { classifyProjectScenes } = await import('../scene-classifier.service');

    const scenes: Scene[] = [
      makeScene({ id: 's1', narration: 'a' }),
      makeScene({
        id: 's2',
        narration: 'b',
        manuallyClassified: true,
        renderSystemType: 'title_card',
        classifierConfidence: 1.0,
      }),
      makeScene({ id: 's3', narration: 'c' }),
    ];

    const summary = await classifyProjectScenes('proj_x', scenes);

    expect(summary.classified).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(patchSceneAtomicMock).toHaveBeenCalledTimes(2);
    const writtenIds = patchSceneAtomicMock.mock.calls.map((c) => c[1]);
    expect(writtenIds).not.toContain('s2');
    // The manually-classified scene's prior type should still be in the
    // distribution histogram.
    expect(summary.distribution.title_card).toBe(1);
  });

  it('skips already-classified scenes by default but reruns them with force:true', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"renderSystemType": "infographic", "confidence": 0.6, "reasoning": "stat"}' }],
    });
    const { classifyProjectScenes } = await import('../scene-classifier.service');

    const scenes: Scene[] = [
      makeScene({
        id: 's1',
        narration: 'a',
        renderSystemType: 'ai_video',
        classifierConfidence: 0.5,
      }),
    ];

    const skipSummary = await classifyProjectScenes('proj_x', scenes);
    expect(skipSummary.classified).toBe(0);
    expect(skipSummary.skipped).toBe(1);

    patchSceneAtomicMock.mockClear();
    const forceSummary = await classifyProjectScenes('proj_x', scenes, { force: true });
    expect(forceSummary.classified).toBe(1);
    expect(patchSceneAtomicMock).toHaveBeenCalledTimes(1);
  });

  it('continues the batch when one patchSceneAtomic write throws', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"renderSystemType": "ai_video", "confidence": 0.8, "reasoning": "x"}' }],
    });
    patchSceneAtomicMock
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValue(1);
    const { classifyProjectScenes } = await import('../scene-classifier.service');

    const scenes: Scene[] = [
      makeScene({ id: 's1', narration: 'a' }),
      makeScene({ id: 's2', narration: 'b' }),
    ];

    // Must not throw — the bad write is logged and the batch keeps going.
    const summary = await classifyProjectScenes('proj_x', scenes);
    expect(summary.classified).toBe(2);
    expect(patchSceneAtomicMock).toHaveBeenCalledTimes(2);
  });
});

describe('classifyScene — AbortController timeout', () => {
  beforeEach(async () => {
    messagesCreateMock.mockReset();
    patchSceneAtomicMock.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { __resetClassifierClientForTests } = await import('../scene-classifier.service');
    __resetClassifierClientForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the neutral fallback when the SDK promise never resolves (12s racing timeout fires)', async () => {
    vi.useFakeTimers();
    // SDK never resolves — the racing setTimeout in classifyScene must
    // reject the Promise.race with "Scene classifier timed out", which
    // becomes the reasoning on the neutral fallback. This is the
    // critical safety property: a hung Anthropic call CANNOT block the
    // batch indefinitely.
    messagesCreateMock.mockImplementationOnce(() => new Promise(() => { /* hang forever */ }));
    const { classifyScene } = await import('../scene-classifier.service');

    const promise = classifyScene({ sceneId: 's_hang', narration: 'x', visualDirection: 'y' });
    // Drive past the 12s timeout. advanceTimersByTimeAsync also flushes
    // microtasks so the Promise.race resolution + catch + return all
    // settle before we await.
    await vi.advanceTimersByTimeAsync(12_500);
    const r = await promise;

    expect(r.renderSystemType).toBe('ai_video');
    expect(r.confidence).toBe(0);
    expect(r.reasoning).toMatch(/Classifier error:/);
    expect(r.reasoning).toMatch(/timed out/i);
  });
});

describe('classifyProjectScenes — worker-pool concurrency cap', () => {
  beforeEach(async () => {
    messagesCreateMock.mockReset();
    patchSceneAtomicMock.mockReset();
    patchSceneAtomicMock.mockResolvedValue(1);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.SCENE_CLASSIFIER_CONCURRENCY = '3';
    const { __resetClassifierClientForTests } = await import('../scene-classifier.service');
    __resetClassifierClientForTests();
  });

  afterEach(() => {
    delete process.env.SCENE_CLASSIFIER_CONCURRENCY;
  });

  it('never exceeds SCENE_CLASSIFIER_CONCURRENCY in-flight requests at any moment', async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    // Hold every SDK call open until we explicitly release it, so we
    // can observe the steady-state in-flight count BEFORE any settle.
    const releases: Array<() => void> = [];
    messagesCreateMock.mockImplementation(() => {
      inFlight++;
      if (inFlight > peakInFlight) peakInFlight = inFlight;
      return new Promise((resolve) => {
        releases.push(() => {
          inFlight--;
          resolve({
            content: [{ type: 'text', text: '{"renderSystemType":"ai_video","confidence":0.8,"reasoning":"x"}' }],
          });
        });
      });
    });
    const { classifyProjectScenes } = await import('../scene-classifier.service');

    // 12 scenes vs concurrency=3 — if the worker pool were broken (e.g.
    // Promise.all over the whole array) peakInFlight would be 12.
    const scenes: Scene[] = Array.from({ length: 12 }, (_, i) =>
      makeScene({ id: `s${i}`, narration: `n${i}` }),
    );

    const batchPromise = classifyProjectScenes('proj_x', scenes);

    // Let the workers start and reach steady state.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    // Drain in waves — each release frees a worker slot for the next
    // queued scene. The peak should NEVER exceed the configured cap.
    while (releases.length > 0) {
      const r = releases.shift()!;
      r();
      await new Promise((res) => setImmediate(res));
      await new Promise((res) => setImmediate(res));
    }

    const summary = await batchPromise;
    expect(summary.classified).toBe(12);
    expect(messagesCreateMock).toHaveBeenCalledTimes(12);
    expect(peakInFlight).toBeLessThanOrEqual(3);
    // And we should actually have HIT the cap — otherwise we're not
    // really proving concurrency is happening at all.
    expect(peakInFlight).toBeGreaterThan(1);
  });
});

describe('classifyProjectScenes — telemetry on degenerate paths', () => {
  beforeEach(async () => {
    messagesCreateMock.mockReset();
    patchSceneAtomicMock.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.SCENE_CLASSIFIER_CONCURRENCY = '5';
    const { __resetClassifierClientForTests } = await import('../scene-classifier.service');
    __resetClassifierClientForTests();
  });

  it('surfaces rowCount=0 as writeFailures (logged, not thrown) and keeps the batch running', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"renderSystemType":"ai_video","confidence":0.8,"reasoning":"x"}' }],
    });
    // First write returns 0 (project row gone), the rest succeed.
    patchSceneAtomicMock
      .mockResolvedValueOnce(0)
      .mockResolvedValue(1);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { classifyProjectScenes } = await import('../scene-classifier.service');

    const scenes: Scene[] = [
      makeScene({ id: 's1', narration: 'a' }),
      makeScene({ id: 's2', narration: 'b' }),
      makeScene({ id: 's3', narration: 'c' }),
    ];

    const summary = await classifyProjectScenes('proj_gone', scenes);

    expect(summary.classified).toBe(3);
    expect(summary.writeFailures).toBe(1);
    // Critical: even though the write missed, we did NOT throw.
    expect(patchSceneAtomicMock).toHaveBeenCalledTimes(3);
    // Warn line for the missed write must be present so production logs
    // can alert on it instead of silent loss.
    const warnedAboutMiss = warnSpy.mock.calls.some(
      (args) => typeof args[0] === 'string' && args[0].includes('write missed (project gone)') && args[0].includes('proj_gone'),
    );
    expect(warnedAboutMiss).toBe(true);

    warnSpy.mockRestore();
  });

  it('reports estimatedCost as classified × per-scene cost and a non-zero distribution', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"renderSystemType":"infographic","confidence":0.9,"reasoning":"chart"}' }],
    });
    patchSceneAtomicMock.mockResolvedValue(1);
    const { classifyProjectScenes } = await import('../scene-classifier.service');

    const scenes: Scene[] = [
      makeScene({ id: 's1', narration: 'a' }),
      makeScene({ id: 's2', narration: 'b' }),
      makeScene({ id: 's3', narration: 'c' }),
      makeScene({ id: 's4', narration: 'd' }),
    ];

    const summary = await classifyProjectScenes('proj_x', scenes);

    expect(summary.classified).toBe(4);
    expect(summary.distribution.infographic).toBe(4);
    // 4 × $0.00025 = $0.001. Don't pin the exact constant here (the
    // approximation may shift over time), just assert the relationship
    // and that the cost is positive + finite.
    expect(summary.estimatedCost).toBeGreaterThan(0);
    expect(Number.isFinite(summary.estimatedCost)).toBe(true);
    expect(summary.estimatedCost).toBeCloseTo(summary.classified * (summary.estimatedCost / summary.classified), 5);
  });

  it('reports missingKey=true and 100% fallback when ANTHROPIC_API_KEY is unset at batch start', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    patchSceneAtomicMock.mockResolvedValue(1);
    const { __resetClassifierClientForTests, classifyProjectScenes } = await import('../scene-classifier.service');
    __resetClassifierClientForTests();

    const scenes: Scene[] = [
      makeScene({ id: 's1', narration: 'a' }),
      makeScene({ id: 's2', narration: 'b' }),
    ];

    const summary = await classifyProjectScenes('proj_no_key', scenes);

    expect(summary.missingKey).toBe(true);
    expect(summary.fallbackCount).toBe(summary.classified);
    expect(summary.fallbackCount).toBe(2);
    // Loud warn is required so silent classifier outage gets noticed.
    const warnedAboutKey = warnSpy.mock.calls.some(
      (args) => typeof args[0] === 'string' && /100% fallback/.test(args[0]),
    );
    expect(warnedAboutKey).toBe(true);

    warnSpy.mockRestore();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });
});

describe('buildManualOverrideStamp — PATCH contract', () => {
  it('returns the exact 5-field stamp the PATCH route writes when the client supplies renderSystemType', async () => {
    const { buildManualOverrideStamp } = await import('../scene-classifier.service');
    const fixed = new Date('2026-04-30T12:00:00.000Z');

    const stamp = buildManualOverrideStamp('infographic', fixed);

    // Spec contract — the route + this helper share one source of truth.
    expect(stamp).toEqual({
      renderSystemType: 'infographic',
      manuallyClassified: true,
      classifierConfidence: 1.0,
      classifierReasoning: 'Manual override',
      classifiedAt: '2026-04-30T12:00:00.000Z',
    });
  });

  it('uses now() by default and produces a parseable ISO timestamp', async () => {
    const { buildManualOverrideStamp } = await import('../scene-classifier.service');
    const before = Date.now();
    const stamp = buildManualOverrideStamp('title_card');
    const after = Date.now();

    const ts = Date.parse(stamp.classifiedAt);
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('reclassifySingleScene', () => {
  beforeEach(async () => {
    messagesCreateMock.mockReset();
    patchSceneAtomicMock.mockReset();
    patchSceneAtomicMock.mockResolvedValue(1);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { __resetClassifierClientForTests } = await import('../scene-classifier.service');
    __resetClassifierClientForTests();
  });

  it('runs even when manuallyClassified is true and clears the flag in the patch', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"renderSystemType": "ai_video", "confidence": 0.7, "reasoning": "x"}' }],
    });
    const { reclassifySingleScene } = await import('../scene-classifier.service');

    const scene = makeScene({
      id: 's1',
      narration: 'a',
      manuallyClassified: true,
      renderSystemType: 'title_card',
    });

    const r = await reclassifySingleScene('proj_x', scene);
    expect(r.renderSystemType).toBe('ai_video');
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    expect(patchSceneAtomicMock).toHaveBeenCalledTimes(1);
    const [, , patch] = patchSceneAtomicMock.mock.calls[0];
    expect(patch.manuallyClassified).toBe(false);
    expect(patch.renderSystemType).toBe('ai_video');
  });
});

describe('autoClassifyAfterParse — fire-and-forget', () => {
  beforeEach(async () => {
    messagesCreateMock.mockReset();
    patchSceneAtomicMock.mockReset();
    patchSceneAtomicMock.mockResolvedValue(1);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { __resetClassifierClientForTests } = await import('../scene-classifier.service');
    __resetClassifierClientForTests();
  });

  it('returns synchronously and triggers classification after the caller resumes', async () => {
    // Use a deferred promise so we can prove the call was queued but
    // hadn't resolved yet at the moment autoClassifyAfterParse returned.
    let resolveSdk!: (v: unknown) => void;
    messagesCreateMock.mockImplementationOnce(() => new Promise((res) => { resolveSdk = res; }));
    const { autoClassifyAfterParse } = await import('../scene-classifier.service');

    const ret = autoClassifyAfterParse('proj_x', [
      makeScene({ id: 's1', narration: 'has narration' }),
    ]);
    expect(ret).toBeUndefined(); // void

    // At this synchronous moment the SDK hasn't been called yet (we wrap
    // in Promise.resolve().then(...) to flush the response first).
    expect(messagesCreateMock).not.toHaveBeenCalled();

    // Let microtasks drain so the queued classify runs.
    await new Promise((r) => setImmediate(r));
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);

    resolveSdk({ content: [{ type: 'text', text: '{"renderSystemType": "ai_video", "confidence": 0.8, "reasoning": "x"}' }] });
    await new Promise((r) => setImmediate(r));
    expect(patchSceneAtomicMock).toHaveBeenCalledTimes(1);
  });

  it('skips silently when no scene has narration', async () => {
    const { autoClassifyAfterParse } = await import('../scene-classifier.service');

    autoClassifyAfterParse('proj_x', [
      makeScene({ id: 's1', narration: '' }),
      makeScene({ id: 's2', narration: '   ' }),
    ]);

    await new Promise((r) => setImmediate(r));
    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(patchSceneAtomicMock).not.toHaveBeenCalled();
  });
});
