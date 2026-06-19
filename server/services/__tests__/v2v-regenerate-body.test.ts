// HTTP-layer tests for POST /:projectId/scenes/:sceneId/regenerate-video
//
// These tests exercise the real Express route handler via supertest, verifying
// that `req.body.replacementImageUrl` is actually read and forwarded through
// the route handler as `sourceImageUrl` when `videoGenerationWorker.createJob`
// is called.  They close the gap not covered by the pure-function tests in
// v2v-routing.test.ts and the worker-dispatch tests in v2v-worker-dispatch.test.ts.
//
// Coverage contract:
//   req.body { mode:'video-to-video', referenceUrl, replacementImageUrl }
//       ↓ route reads reqReplacementImageUrl
//       ↓ route calls getPublicUrlForBrandAsset (local fn; https:// URLs pass through unchanged)
//       ↓ route calls videoGenerationWorker.createJob({ sourceImageUrl })
//   ← asserted here ↑
//
// Note: getPublicUrlForBrandAsset (local fn in universal-video-routes.ts line 263)
// returns any `https://` URL unchanged immediately (lines 269-276), so no mock
// is needed for that function when we use plain HTTPS URLs in test bodies.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Must set DATABASE_URL before any module that touches server/db is loaded;
// the real DB is fully replaced by the vi.mock below.
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------
// Hoist mock factories before any module import.
// ---------------------------------------------------------------------------
const {
  getProjectFromDbMock,
  createJobMock,
  getActiveJobForSceneMock,
} = vi.hoisted(() => ({
  getProjectFromDbMock: vi.fn(),
  createJobMock: vi.fn(),
  getActiveJobForSceneMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Static module mocks
// ---------------------------------------------------------------------------

// Database — replaced by a chainable stub so DB calls in the route don't throw.
vi.mock('../../db', () => {
  const limitMock = vi.fn().mockResolvedValue([]);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const orderByMock = vi.fn().mockResolvedValue([]);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock, orderBy: orderByMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const updateWhereMock = vi.fn().mockResolvedValue([]);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  return { db: { select: selectMock, update: updateMock } };
});

// Auth — bypass isAuthenticated by immediately calling next() and injecting a test user.
vi.mock('../../auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: 'employee' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

// requireCredits — bypass the credit gate entirely.
vi.mock('../../middleware/requireCredits', () => ({
  requireCredits: () => (_req: any, _res: any, next: any) => next(),
}));

// video-project-db — return the test project for any projectId lookup.
vi.mock('../video-project-db', () => ({
  getProjectFromDb: getProjectFromDbMock,
  updateProjectScenes: vi.fn().mockResolvedValue(undefined),
  findSceneIndex: vi.fn().mockReturnValue(0),
}));

// video-generation-worker — spy on createJob so we can assert what it received.
// This mock also intercepts the dynamic `await import(...)` call inside the handler.
vi.mock('../video-generation-worker', () => ({
  videoGenerationWorker: {
    getActiveJobForScene: getActiveJobForSceneMock,
    createJob: createJobMock,
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

// objectStorage — ObjectStorageService is instantiated at module load (line 77 of routes file).
vi.mock('../../objectStorage', () => ({
  ObjectStorageService: class {
    getSignedUrl = vi.fn().mockResolvedValue('https://cdn.example.com/signed');
    getObject = vi.fn().mockResolvedValue(null);
    putObject = vi.fn().mockResolvedValue(undefined);
  },
  objectStorageClient: {
    getObject: vi.fn().mockResolvedValue(null),
    putObject: vi.fn().mockResolvedValue(undefined),
    listObjects: vi.fn().mockResolvedValue([]),
  },
}));

// storage — used by the route to cancel stale jobs.
vi.mock('../../storage', () => ({
  storage: {
    updateVideoGenerationJob: vi.fn().mockResolvedValue({}),
    getVideoGenerationJob: vi.fn().mockResolvedValue(null),
    getPendingVideoGenerationJobs: vi.fn().mockResolvedValue([]),
    recoverStuckVideoGenerationJobs: vi.fn().mockResolvedValue(0),
  },
}));

// credits-service — used transitively; mock so it doesn't hit DB.
vi.mock('../credits-service', () => ({
  consumeCredits: vi.fn().mockResolvedValue({}),
  getCreditCost: vi.fn().mockResolvedValue(1),
  canAccessProvider: vi.fn().mockResolvedValue(true),
  canAfford: vi.fn().mockResolvedValue(true),
  refundCredits: vi.fn().mockResolvedValue({}),
}));

// intelligent-regeneration-service
vi.mock('../intelligent-regeneration-service', () => ({
  intelligentRegenerationService: {
    recordVideoAttempt: vi.fn().mockResolvedValue(undefined),
    recordImageAttempt: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-test-v2v';
const SCENE_ID = 'scene-v2v-1';
const REF_VIDEO_URL = 'https://cdn.example.com/reference-clip.mp4';

function makeProject(overrides: Record<string, any> = {}) {
  return {
    projectId: PROJECT_ID,
    ownerId: 'user-1',
    settings: { aspectRatio: '16:9' },
    outputFormat: { aspectRatio: '16:9' },
    progress: {},
    scenes: [
      {
        id: SCENE_ID,
        type: 'content',
        visualDirection: 'Product showcase on white background',
        description: 'A close-up product shot',
        duration: 6,
        assets: {},
        brandAssetUrl: null,
        seedImageUrl: null,
        brandReferences: null,
        motionPrompt: null,
        providerHint: null,
      },
    ],
    ...overrides,
  };
}

// Import the router once; vi.mock intercepts all its static dependencies above.
let universalVideoRouter: any;
beforeEach(async () => {
  vi.clearAllMocks();

  getProjectFromDbMock.mockResolvedValue(makeProject());
  getActiveJobForSceneMock.mockResolvedValue(null);
  createJobMock.mockResolvedValue({
    jobId: 'job-stub-1',
    status: 'pending',
    progress: 0,
  });

  // Lazy-import once; module is already resolved after the first import.
  if (!universalVideoRouter) {
    universalVideoRouter = (await import('../universal-video-routes')).default;
  }
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(universalVideoRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe(`POST /:projectId/scenes/:sceneId/regenerate-video — replacementImageUrl forwarding`, () => {
  it('passes replacementImageUrl through to createJob as sourceImageUrl', async () => {
    const replacementUrl = 'https://cdn.example.com/my-product-image.jpg';

    const res = await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        replacementImageUrl: replacementUrl,
        provider: 'kling-2.6',
      });

    // The route must succeed (200) — no 400/500 from missing/bad replacementImageUrl.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // createJob must have been called exactly once with the replacement image URL
    // stored as sourceImageUrl (the field name the worker reads from the job record).
    expect(createJobMock).toHaveBeenCalledTimes(1);
    const jobArgs = createJobMock.mock.calls[0][0];
    expect(jobArgs.sourceImageUrl).toBe(replacementUrl);
  });

  it('does not return a 400 when replacementImageUrl is absent (it is optional)', async () => {
    // For Runway, replacementImageUrl is not required.  The route must accept
    // the request without this field and still create the job.
    const res = await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        provider: 'runway-gen4-aleph',
        // replacementImageUrl intentionally omitted
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(createJobMock).toHaveBeenCalledTimes(1);
  });

  it('does not return a 400 when replacementImageUrl is an empty string (treated as absent)', async () => {
    const res = await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        replacementImageUrl: '',
        provider: 'runway-gen4-aleph',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(createJobMock).toHaveBeenCalledTimes(1);
    // Empty string → no sourceImageUrl in the job
    const jobArgs = createJobMock.mock.calls[0][0];
    expect(jobArgs.sourceImageUrl).toBeFalsy();
  });

  it('resolves a plain CDN URL (non-brand-asset) without modification', async () => {
    // Plain https:// URLs are returned by getPublicUrlForBrandAsset unchanged
    // (lines 269-275 of universal-video-routes.ts).  Assert the same URL
    // arrives at createJob without transformation.
    const cdnUrl = 'https://storage.theapi.app/assets/product-42.png';

    const res = await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        replacementImageUrl: cdnUrl,
        provider: 'kling-2.6',
      });

    expect(res.status).toBe(200);
    const jobArgs = createJobMock.mock.calls[0][0];
    expect(jobArgs.sourceImageUrl).toBe(cdnUrl);
  });

  it('stores the V2V reference video URL in i2vSettings so the worker routes correctly', async () => {
    const res = await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        replacementImageUrl: 'https://cdn.example.com/product.jpg',
        provider: 'kling-2.6',
      });

    expect(res.status).toBe(200);
    const jobArgs = createJobMock.mock.calls[0][0];
    // The worker uses i2vSettings.assetLibraryMode='v2v' and referenceVideoUrl
    // to route the job to the Kling replaceObjectInVideo provider.
    expect(jobArgs.i2vSettings).toMatchObject({
      assetLibraryMode: 'v2v',
      referenceVideoUrl: REF_VIDEO_URL,
    });
  });
});
