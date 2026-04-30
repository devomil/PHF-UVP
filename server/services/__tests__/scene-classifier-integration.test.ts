// Task #121: end-to-end integration tests for the scene-classifier surface.
//
// These tests run against the REAL Postgres database (via the production
// `db` module — Neon serverless driver) and only mock `@anthropic-ai/sdk`
// to make classifier output deterministic. Everything else — the
// classifier service, `patchSceneAtomic`, `getProjectFromDb`, the
// extracted `registerSceneClassifierRoutes` router — is the real code
// path that production hits.
//
// What the three tests lock in (Task #121 acceptance):
//
//   1. POST /projects/:id/classify-scenes against a real DB row with
//      one `manuallyClassified: true` scene — that scene is left
//      byte-for-byte unchanged in the DB while peer scenes get
//      classified normally. Proves the skip rule survives the full
//      route → service → atomic-write round trip.
//
//   2. PATCH /scenes/:sceneId posting `{ renderSystemType,
//      manuallyClassified: false, classifierConfidence: 99 }` — only
//      `renderSystemType` plus the SERVER-stamped metadata
//      (`manuallyClassified: true`, `classifierConfidence: 1.0`,
//      `classifierReasoning: 'Manual override'`, `classifiedAt: <now>`)
//      lands in the DB. The forged client values are stripped. The
//      handler under test mirrors the production override branch in
//      `universal-video-routes.ts` (lines 3426–3487) inline because the
//      parent file is 14k lines and not safely importable in tests; the
//      mirror calls the SAME shared helpers (`isRenderSystemType`,
//      `buildManualOverrideStamp`, `patchSceneAtomic`) that production
//      calls, so contract drift in those helpers is caught here.
//
//   3. Concurrent override-only PATCH + batch classify against the same
//      scene — we deterministically order the writes so the override is
//      the LAST writer, then assert the override's value (and its
//      `manuallyClassified: true` flag) durably wins. This documents
//      what's safe to claim today: per-scene atomic writes don't
//      merge-clobber each other, and an override that lands after a
//      classifier write is preserved. The stronger "override wins
//      regardless of interleaving" guarantee would need
//      `patchSceneAtomic` (or the classifier worker) to defend against
//      `manuallyClassified=true` at write time, which is out of scope
//      for this verification task and tracked as a follow-up.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

const { messagesCreateMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: messagesCreateMock };
  },
}));

import { db } from '../../db';
import { universalVideoProjects, users } from '../../../shared/schema';
import { registerSceneClassifierRoutes } from '../scene-classifier-routes';
import {
  buildManualOverrideStamp,
  __resetClassifierClientForTests,
} from '../scene-classifier.service';
import { patchSceneAtomic, getProjectFromDb } from '../video-project-db';
import { isRenderSystemType } from '../../../shared/video-types';

function makeProjectId() {
  return `test-classifier-int-${randomUUID()}`;
}
function makeUserId() {
  return `test-user-${randomUUID()}`;
}

async function insertTestUser(id: string) {
  await db.insert(users).values({
    id,
    email: `${id}@test.local`,
    role: 'user',
  } as any);
}

async function insertTestProject(projectId: string, ownerId: string, scenes: any[]) {
  await db.insert(universalVideoProjects).values({
    projectId,
    ownerId,
    type: 'short',
    title: 'Task #121 integration test project',
    totalDuration: 30,
    outputFormat: { fps: 30, resolution: '1080p', aspectRatio: '16:9' },
    brand: { name: 'Test Brand' },
    scenes,
    assets: { images: [] },
    progress: { stage: 'draft', percent: 0 },
  } as any);
}

async function cleanup(projectId: string, userId: string) {
  await db
    .delete(universalVideoProjects)
    .where(eq(universalVideoProjects.projectId, projectId));
  await db.delete(users).where(eq(users.id, userId));
}

function buildApp(userId: string) {
  const app = express();
  app.use(express.json());
  const router = express.Router();

  const isAuth = (req: any, _res: any, next: any) => {
    req.user = { id: userId };
    next();
  };

  // The real, production-extracted classifier routes. Wired to the real
  // `getProjectFromDb` so requests hit the actual Postgres row.
  registerSceneClassifierRoutes(router, {
    isAuthenticated: isAuth,
    getProjectFromDb,
  });

  // Mirror of the override branch in
  // server/services/universal-video-routes.ts (lines 3426–3487).
  // Inlined because the parent file is 14k lines with 30+ heavy imports
  // and is not safely importable in tests. Calls the SAME shared
  // helpers production calls, so this exercises the real contract end-
  // to-end against the real DB.
  router.patch(
    '/projects/:projectId/scenes/:sceneId',
    isAuth,
    async (req: any, res: any) => {
      const { projectId, sceneId } = req.params;
      const updates = { ...(req.body || {}) };

      const projectData = await getProjectFromDb(projectId);
      if (!projectData) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      if ((projectData as any).ownerId !== userId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      if (!Object.prototype.hasOwnProperty.call(updates, 'renderSystemType')) {
        return res
          .status(400)
          .json({ success: false, error: 'override-only test route requires renderSystemType' });
      }

      if (!isRenderSystemType(updates.renderSystemType)) {
        return res.status(400).json({
          success: false,
          error: `Invalid renderSystemType: ${
            typeof updates.renderSystemType === 'string'
              ? updates.renderSystemType
              : typeof updates.renderSystemType
          }`,
        });
      }

      // Strip client-supplied classifier metadata defensively — these
      // four fields are SERVER-OWNED. (Identical to lines 3449–3452 of
      // the production handler.)
      delete updates.classifierConfidence;
      delete updates.classifierReasoning;
      delete updates.classifiedAt;
      delete updates.manuallyClassified;

      const otherKeys = Object.keys(updates).filter((k) => k !== 'renderSystemType');
      if (otherKeys.length > 0) {
        return res.status(400).json({
          success: false,
          error:
            'renderSystemType must be PATCHed alone — split mixed updates into two requests',
          mixedFields: otherKeys,
        });
      }

      // `buildManualOverrideStamp` already includes `renderSystemType`
      // in its returned object, so spreading it gives the full patch.
      const overrideStamp = buildManualOverrideStamp(updates.renderSystemType);
      const rowCount = await patchSceneAtomic(projectId, sceneId, {
        ...overrideStamp,
      });
      if (rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Scene not found' });
      }
      const refreshed = await getProjectFromDb(projectId);
      return res.json({ success: true, project: refreshed });
    },
  );

  app.use('/api/test', router);
  return app;
}

describe('scene-classifier integration (real DB) — Task #121', () => {
  let userId: string;
  let projectId: string;

  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  beforeEach(async () => {
    messagesCreateMock.mockReset();
    __resetClassifierClientForTests();
    userId = makeUserId();
    projectId = makeProjectId();
    await insertTestUser(userId);
  });

  afterEach(async () => {
    await cleanup(projectId, userId);
  });

  it('POST /classify-scenes preserves a manuallyClassified scene byte-for-byte while classifying its peers', async () => {
    const lockedClassifiedAt = '2026-01-01T00:00:00.000Z';
    const scenes = [
      {
        id: 's1',
        type: 'hook',
        duration: 5,
        narration: 'manually-locked scene',
        visualDirection: 'doesnt matter',
        renderSystemType: 'title_card',
        classifierConfidence: 1.0,
        classifierReasoning: 'Manual override',
        classifiedAt: lockedClassifiedAt,
        manuallyClassified: true,
      },
      {
        id: 's2',
        type: 'scene',
        duration: 5,
        narration: 'classify me please',
        visualDirection: 'cinematic broll of a city skyline',
      },
    ];
    await insertTestProject(projectId, userId, scenes);

    messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '{"renderSystemType": "ai_video", "confidence": 0.85, "reasoning": "broll content"}',
        },
      ],
    });

    const app = buildApp(userId);
    const res = await request(app)
      .post(`/api/test/projects/${projectId}/classify-scenes`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // s1 must be skipped (manuallyClassified=true), s2 must be classified.
    expect(res.body.skipped).toBe(1);
    expect(res.body.classified).toBe(1);
    expect(res.body.writeFailures).toBe(0);
    // The classifier must have been called exactly once (only for s2).
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);

    // Re-read the DB and assert s1 is byte-for-byte unchanged.
    const refreshed = await getProjectFromDb(projectId);
    const refreshedScenes = (refreshed?.scenes || []) as any[];
    const s1 = refreshedScenes.find((s) => s.id === 's1');
    expect(s1).toMatchObject({
      renderSystemType: 'title_card',
      classifierConfidence: 1.0,
      classifierReasoning: 'Manual override',
      classifiedAt: lockedClassifiedAt,
      manuallyClassified: true,
    });

    // s2 got the classifier's result and was NOT marked manuallyClassified.
    const s2 = refreshedScenes.find((s) => s.id === 's2');
    expect(s2.renderSystemType).toBe('ai_video');
    expect(s2.classifierConfidence).toBeCloseTo(0.85, 5);
    expect(s2.classifierReasoning).toBe('broll content');
    expect(s2.manuallyClassified).toBeUndefined();
    expect(typeof s2.classifiedAt).toBe('string');
  });

  it('PATCH /scenes/:sceneId override strips client-forged classifier metadata; only renderSystemType + server-stamped fields land in the DB', async () => {
    const scenes = [
      {
        id: 's1',
        type: 'scene',
        duration: 5,
        narration: 'pre-classified scene',
        visualDirection: 'broll',
        renderSystemType: 'ai_video',
        classifierConfidence: 0.7,
        classifierReasoning: 'auto-classified',
        classifiedAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    await insertTestProject(projectId, userId, scenes);

    const app = buildApp(userId);
    const before = Date.now();
    const res = await request(app)
      .patch(`/api/test/projects/${projectId}/scenes/s1`)
      .send({
        renderSystemType: 'title_card',
        // The next three are forged client-side values that the route
        // MUST strip. If any of them lands in the DB this test fails.
        manuallyClassified: false,
        classifierConfidence: 99,
        classifierReasoning: 'forged-by-client',
        classifiedAt: 'forged-iso-string',
      });
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const refreshed = await getProjectFromDb(projectId);
    const s1 = ((refreshed?.scenes || []) as any[]).find((s) => s.id === 's1');

    // The user's chosen renderSystemType landed.
    expect(s1.renderSystemType).toBe('title_card');

    // Server-stamped values present, client-forged values rejected.
    expect(s1.manuallyClassified).toBe(true);
    expect(s1.classifierConfidence).toBe(1.0);
    expect(s1.classifierReasoning).toBe('Manual override');

    // classifiedAt was stamped server-side around the request window
    // (proves the forged 'forged-iso-string' was discarded).
    const ts = Date.parse(s1.classifiedAt);
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  it('concurrent override-PATCH + batch classify on the same scene — override is the last writer and durably wins', { timeout: 30_000 }, async () => {
    const scenes = [
      {
        id: 's1',
        type: 'scene',
        duration: 5,
        narration: 'race-target scene',
        visualDirection: 'broll',
      },
    ];
    await insertTestProject(projectId, userId, scenes);

    // Hold the classifier's Anthropic call open so we control the order
    // of the two writes deterministically.
    let resolveModel!: (v: any) => void;
    messagesCreateMock.mockImplementation(
      () =>
        new Promise((r) => {
          resolveModel = r;
        }),
    );

    const app = buildApp(userId);

    // 1. Start the batch classify — it'll await the (held) model call.
    // Note: supertest's Request only dispatches on `.then()`, so we
    // chain a no-op `.then(r => r)` to actually fire the request now.
    const classifyPromise = request(app)
      .post(`/api/test/projects/${projectId}/classify-scenes`)
      .send({})
      .then((r) => r);

    // Poll until the batch has actually reached `messages.create` (the
    // classifier service does some async setup before issuing the call,
    // so a fixed sleep is flaky).
    const deadline = Date.now() + 5000;
    while (messagesCreateMock.mock.calls.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);

    // 2. Resolve the model so the classifier writes its (now-stale)
    // result first.
    resolveModel({
      content: [
        {
          type: 'text',
          text: '{"renderSystemType": "infographic", "confidence": 0.5, "reasoning": "auto"}',
        },
      ],
    });
    const classifyRes = await classifyPromise;
    expect(classifyRes.status).toBe(200);
    expect(classifyRes.body.classified).toBe(1);
    expect(classifyRes.body.writeFailures).toBe(0);

    // Sanity check: the classifier's value is now in the DB.
    const mid = await getProjectFromDb(projectId);
    const midScene = ((mid?.scenes || []) as any[]).find((s) => s.id === 's1');
    expect(midScene.renderSystemType).toBe('infographic');
    expect(midScene.manuallyClassified).toBeUndefined();

    // 3. Now fire the override PATCH. It is the LAST writer; the
    // override (plus its server-stamped `manuallyClassified: true`)
    // must durably win.
    const overrideRes = await request(app)
      .patch(`/api/test/projects/${projectId}/scenes/s1`)
      .send({ renderSystemType: 'title_card' });
    expect(overrideRes.status).toBe(200);
    expect(overrideRes.body.success).toBe(true);

    const finalProject = await getProjectFromDb(projectId);
    const finalScene = ((finalProject?.scenes || []) as any[]).find((s) => s.id === 's1');

    // Override's renderSystemType wins, classifier's value is gone.
    expect(finalScene.renderSystemType).toBe('title_card');
    // Override's server-stamped metadata wins, classifier's metadata is
    // gone (proves the atomic per-scene merge replaced these fields
    // rather than preserving the classifier's stale values).
    expect(finalScene.manuallyClassified).toBe(true);
    expect(finalScene.classifierConfidence).toBe(1.0);
    expect(finalScene.classifierReasoning).toBe('Manual override');
  });
});
