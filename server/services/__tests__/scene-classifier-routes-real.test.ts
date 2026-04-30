// Phase 23A: route-level test that runs the REAL classifier service
// (not mocked) so the rowCount=0 logging path through patchSceneAtomic
// gets exercised end-to-end via the route — covers the validator's
// "real rowCount=0 logging path" requirement.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

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
  getProjectFromDb: vi.fn(),
}));

import { registerSceneClassifierRoutes } from '../scene-classifier-routes';

function buildApp(scenes: any[]) {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  const isAuthenticated = (req: any, _res: any, next: any) => {
    req.user = { id: 'u1' };
    next();
  };
  registerSceneClassifierRoutes(router, {
    isAuthenticated,
    getProjectFromDb: async () => ({ ownerId: 'u1', scenes }),
  });
  app.use('/api', router);
  return app;
}

describe('scene-classifier route + REAL service — rowCount=0 logging path', () => {
  beforeEach(async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    messagesCreateMock.mockReset();
    patchSceneAtomicMock.mockReset();
    const { __resetClassifierClientForTests } = await import('../scene-classifier.service');
    __resetClassifierClientForTests();
  });

  it('surfaces writeFailures>0 in the route response when patchSceneAtomic returns rowCount=0', async () => {
    // Two scenes, both classify successfully via Anthropic; both writes
    // return rowCount=0 (project row was deleted between read-and-write).
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"renderSystemType": "ai_video", "confidence": 0.7, "reasoning": "ok"}' }],
    });
    patchSceneAtomicMock.mockResolvedValue(0);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = buildApp([
      { id: 's1', narration: 'one', visualDirection: 'one' },
      { id: 's2', narration: 'two', visualDirection: 'two' },
    ]);

    const res = await request(app).post('/api/projects/p1/classify-scenes').send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.classified).toBe(2);
    expect(res.body.writeFailures).toBe(2);
    expect(patchSceneAtomicMock).toHaveBeenCalledTimes(2);
    // Real service emits a warn line for each rowCount=0 write.
    const warnCalls = warnSpy.mock.calls.map((c) => String(c[0] ?? ''));
    expect(warnCalls.some((m) => /write missed/i.test(m) || /rowCount=0/i.test(m))).toBe(true);
    warnSpy.mockRestore();
  });

  it('surfaces writeFailures>0 when patchSceneAtomic THROWS (separate from rowCount=0 path)', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"renderSystemType": "title_card", "confidence": 0.9, "reasoning": "ok"}' }],
    });
    patchSceneAtomicMock.mockRejectedValue(new Error('db down'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = buildApp([{ id: 's1', narration: 'x', visualDirection: 'y' }]);
    const res = await request(app).post('/api/projects/p1/classify-scenes').send({});

    expect(res.status).toBe(200);
    expect(res.body.writeFailures).toBe(1);
    warnSpy.mockRestore();
  });

  it('rowCount=1 path: writeFailures stays 0 and distribution reflects results', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"renderSystemType": "infographic", "confidence": 0.8, "reasoning": "stat"}' }],
    });
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"renderSystemType": "title_card", "confidence": 0.9, "reasoning": "title"}' }],
    });
    patchSceneAtomicMock.mockResolvedValue(1);

    const app = buildApp([
      { id: 's1', narration: 'stat scene', visualDirection: 'chart' },
      { id: 's2', narration: 'title scene', visualDirection: 'centered text' },
    ]);
    const res = await request(app).post('/api/projects/p1/classify-scenes').send({});

    expect(res.status).toBe(200);
    expect(res.body.classified).toBe(2);
    expect(res.body.writeFailures).toBe(0);
    expect(res.body.distribution).toMatchObject({ infographic: 1, title_card: 1 });
    expect(res.body.estimatedCost).toBeGreaterThan(0);
  });
});
