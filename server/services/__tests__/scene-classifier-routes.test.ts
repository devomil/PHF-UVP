// Phase 23A (Task #118) — route-level tests for the scene-classifier
// endpoints. We mount the small extracted router via supertest with the
// classifier service mocked at the module level (the service has its own
// dedicated unit tests covering Anthropic SDK behavior, skip rules,
// fallbacks, etc.). The point of THIS file is to lock the route wiring:
//   - 401 when unauthenticated
//   - 403 / 404 ownership + lookup
//   - body-validation rejects typo'd fields
//   - response shape includes distribution + estimatedCost
//   - per-scene endpoint clears `manuallyClassified` (verified by
//     asserting the service stub was called)
//   - rowCount=0 path returns success and surfaces writeFailures

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Hoisted service mocks — the route module imports these eagerly, so the
// mock has to be in place BEFORE we import the routes.
const { classifyProjectScenesMock, reclassifySingleSceneMock } = vi.hoisted(() => ({
  classifyProjectScenesMock: vi.fn(),
  reclassifySingleSceneMock: vi.fn(),
}));

vi.mock('../scene-classifier.service', () => ({
  classifyProjectScenes: classifyProjectScenesMock,
  reclassifySingleScene: reclassifySingleSceneMock,
  // The PATCH route in universal-video-routes.ts also imports this; it
  // isn't exercised by the routes mounted in this test file, but we
  // re-export a stub so dynamic imports inside the service module don't
  // explode if anything tries to reach for it.
  buildManualOverrideStamp: vi.fn(),
  SCENE_CLASSIFIER_MODEL: 'claude-haiku-4-5-20251001',
}));

import { registerSceneClassifierRoutes } from '../scene-classifier-routes';

// ---------------------------------------------------------------------------
// Test harness — fresh express app per test, configurable auth + DB stubs
// ---------------------------------------------------------------------------

interface TestProject {
  ownerId?: string | null;
  scenes?: any[];
}

function buildApp(opts: {
  authedUserId?: string | null;
  project?: TestProject | null;
}) {
  const app = express();
  app.use(express.json());
  const router = express.Router();

  // Stub auth middleware — sets req.user when a userId is provided.
  const isAuthenticated = (req: any, res: any, next: any) => {
    if (opts.authedUserId == null) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    req.user = { id: opts.authedUserId };
    next();
  };

  registerSceneClassifierRoutes(router, {
    isAuthenticated,
    getProjectFromDb: async (_projectId: string) => opts.project ?? null,
  });

  app.use('/api', router);
  return app;
}

// ---------------------------------------------------------------------------

describe('scene-classifier route handlers', () => {
  beforeEach(() => {
    classifyProjectScenesMock.mockReset();
    reclassifySingleSceneMock.mockReset();
  });

  // ─── POST /api/projects/:projectId/classify-scenes ──────────────────────

  describe('POST /classify-scenes', () => {
    it('returns 401 when unauthenticated', async () => {
      const app = buildApp({ authedUserId: null });
      const res = await request(app).post('/api/projects/p1/classify-scenes').send({});
      expect(res.status).toBe(401);
      expect(classifyProjectScenesMock).not.toHaveBeenCalled();
    });

    it('returns 404 when project missing', async () => {
      const app = buildApp({ authedUserId: 'u1', project: null });
      const res = await request(app).post('/api/projects/p1/classify-scenes').send({});
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 403 when user is not owner', async () => {
      const app = buildApp({
        authedUserId: 'u1',
        project: { ownerId: 'someone-else', scenes: [] },
      });
      const res = await request(app).post('/api/projects/p1/classify-scenes').send({});
      expect(res.status).toBe(403);
      expect(classifyProjectScenesMock).not.toHaveBeenCalled();
    });

    it('rejects typo\u2019d body fields with 400 (e.g. `forced` instead of `force`)', async () => {
      const app = buildApp({
        authedUserId: 'u1',
        project: { ownerId: 'u1', scenes: [] },
      });
      const res = await request(app)
        .post('/api/projects/p1/classify-scenes')
        .send({ forced: true });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Unknown field: forced/);
      expect(classifyProjectScenesMock).not.toHaveBeenCalled();
    });

    it('passes `force: true` through to the service when supplied', async () => {
      classifyProjectScenesMock.mockResolvedValue({
        classified: 0, skipped: 2, writeFailures: 0, fallbackCount: 0,
        distribution: {}, estimatedCost: 0, durationMs: 5,
      });
      const app = buildApp({
        authedUserId: 'u1',
        project: { ownerId: 'u1', scenes: [{ id: 's1' }, { id: 's2' }] },
      });
      const res = await request(app)
        .post('/api/projects/p1/classify-scenes')
        .send({ force: true });
      expect(res.status).toBe(200);
      expect(classifyProjectScenesMock).toHaveBeenCalledWith(
        'p1',
        [{ id: 's1' }, { id: 's2' }],
        { force: true },
      );
    });

    it('omitting `force` defaults to skip behavior (force=false at service)', async () => {
      classifyProjectScenesMock.mockResolvedValue({
        classified: 1, skipped: 1, writeFailures: 0, fallbackCount: 0,
        distribution: { ai_video: 1 }, estimatedCost: 0.0001, durationMs: 8,
      });
      const app = buildApp({
        authedUserId: 'u1',
        project: { ownerId: 'u1', scenes: [{ id: 's1' }, { id: 's2' }] },
      });
      const res = await request(app).post('/api/projects/p1/classify-scenes').send({});
      expect(res.status).toBe(200);
      expect(classifyProjectScenesMock).toHaveBeenCalledWith(
        'p1', expect.any(Array), { force: false },
      );
    });

    it('returns success with full distribution + estimatedCost in response shape', async () => {
      classifyProjectScenesMock.mockResolvedValue({
        classified: 4,
        skipped: 1,
        writeFailures: 0,
        fallbackCount: 0,
        distribution: {
          ai_video: 2,
          title_card: 1,
          infographic: 1,
        },
        estimatedCost: 0.00125,
        durationMs: 234,
      });
      const app = buildApp({
        authedUserId: 'u1',
        project: { ownerId: 'u1', scenes: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }, { id: 's5' }] },
      });
      const res = await request(app).post('/api/projects/p1/classify-scenes').send({});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        classified: 4,
        skipped: 1,
        writeFailures: 0,
        fallbackCount: 0,
        distribution: { ai_video: 2, title_card: 1, infographic: 1 },
        estimatedCost: 0.00125,
        durationMs: 234,
      });
    });

    it('rowCount=0 / write-failure path: service returns writeFailures>0; route still 200 with telemetry surfaced', async () => {
      // Simulates the documented service behavior: when patchSceneAtomic
      // can't find the row (rowCount=0), the service warns and increments
      // writeFailures. The route must still return success (it's a partial
      // failure, not a request failure) with the writeFailures count
      // visible to the client so the UI can surface it.
      classifyProjectScenesMock.mockResolvedValue({
        classified: 2,
        skipped: 0,
        writeFailures: 1,
        fallbackCount: 0,
        distribution: { ai_video: 2 },
        estimatedCost: 0.0002,
        durationMs: 50,
      });
      const app = buildApp({
        authedUserId: 'u1',
        project: { ownerId: 'u1', scenes: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] },
      });
      const res = await request(app).post('/api/projects/p1/classify-scenes').send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.writeFailures).toBe(1);
    });

    it('catches unexpected service throw and returns 500', async () => {
      classifyProjectScenesMock.mockRejectedValue(new Error('boom'));
      const app = buildApp({
        authedUserId: 'u1',
        project: { ownerId: 'u1', scenes: [] },
      });
      const res = await request(app).post('/api/projects/p1/classify-scenes').send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('boom');
    });
  });

  // ─── POST /api/projects/:projectId/scenes/:sceneId/classify ─────────────

  describe('POST /scenes/:sceneId/classify', () => {
    it('returns 401 when unauthenticated', async () => {
      const app = buildApp({ authedUserId: null });
      const res = await request(app)
        .post('/api/projects/p1/scenes/s1/classify')
        .send({});
      expect(res.status).toBe(401);
      expect(reclassifySingleSceneMock).not.toHaveBeenCalled();
    });

    it('returns 404 when scene id is not in project', async () => {
      const app = buildApp({
        authedUserId: 'u1',
        project: { ownerId: 'u1', scenes: [{ id: 'other-scene' }] },
      });
      const res = await request(app)
        .post('/api/projects/p1/scenes/missing/classify')
        .send({});
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Scene not found/);
      expect(reclassifySingleSceneMock).not.toHaveBeenCalled();
    });

    it('rejects any body fields (endpoint takes none)', async () => {
      const app = buildApp({
        authedUserId: 'u1',
        project: { ownerId: 'u1', scenes: [{ id: 's1' }] },
      });
      const res = await request(app)
        .post('/api/projects/p1/scenes/s1/classify')
        .send({ force: true });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no body fields/);
      expect(reclassifySingleSceneMock).not.toHaveBeenCalled();
    });

    it('clears manuallyClassified by ALWAYS calling reclassifySingleScene (no skip-on-manual at route)', async () => {
      // The route hands the scene straight to the service with no skip
      // check, even when the scene is currently manuallyClassified=true.
      // The service is responsible for clearing the flag — this test just
      // proves the route doesn't gate the call.
      reclassifySingleSceneMock.mockResolvedValue({
        renderSystemType: 'title_card',
        confidence: 0.92,
        reasoning: 'Detected a section title overlay',
      });
      const sceneRow = {
        id: 's-manual',
        renderSystemType: 'product_showcase',
        manuallyClassified: true,
        classifierConfidence: 1.0,
      };
      const app = buildApp({
        authedUserId: 'u1',
        project: { ownerId: 'u1', scenes: [sceneRow] },
      });
      const res = await request(app)
        .post('/api/projects/p1/scenes/s-manual/classify')
        .send({});
      expect(res.status).toBe(200);
      expect(reclassifySingleSceneMock).toHaveBeenCalledTimes(1);
      // The service was called with the SAME scene object pulled from
      // the project — it doesn't matter that the scene was previously
      // manuallyClassified; the route always dispatches.
      expect(reclassifySingleSceneMock).toHaveBeenCalledWith('p1', sceneRow);
      expect(res.body).toMatchObject({
        success: true,
        sceneId: 's-manual',
        renderSystemType: 'title_card',
        classifierConfidence: 0.92,
        classifierReasoning: 'Detected a section title overlay',
      });
    });

    it('catches unexpected service throw and returns 500', async () => {
      reclassifySingleSceneMock.mockRejectedValue(new Error('claude down'));
      const app = buildApp({
        authedUserId: 'u1',
        project: { ownerId: 'u1', scenes: [{ id: 's1' }] },
      });
      const res = await request(app)
        .post('/api/projects/p1/scenes/s1/classify')
        .send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('claude down');
    });
  });
});
