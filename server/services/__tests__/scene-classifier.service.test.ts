// Phase 23A (Task #118): tests for scene-classifier.service.
//
// We mock the Anthropic SDK at the transport boundary (the same pattern
// the Claude Vision QA tests use) so each test can hand back a canned
// response without burning API credits, AND we mock the patchSceneAtomic
// writer so we can assert the exact JSONB patch shape.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SCENE_CLASSIFIER_MODEL,
  parseClassifierResponse,
} from '../scene-classifier.service';
import type { Scene } from '../../../shared/video-types';

// vi.mock factories are hoisted above all top-level code, so any captured
// references must be hoisted too via vi.hoisted (otherwise the closure
// runs before the const initializer).
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
