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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  dbSelectWhereMock,
  bucketFileMock,
} = vi.hoisted(() => ({
  getProjectFromDbMock: vi.fn(),
  createJobMock: vi.fn(),
  getActiveJobForSceneMock: vi.fn(),
  // Controls what db.select().from().where() resolves to (per test).
  dbSelectWhereMock: vi.fn(),
  // Controls what objectStorageClient.bucket().file().download() resolves to.
  bucketFileMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Static module mocks
// ---------------------------------------------------------------------------

// Database — replaced by a chainable stub so DB calls in the route don't throw.
// whereMock is made thenable so it can be awaited both with and without .limit().
vi.mock('../../db', () => {
  const limitMock = vi.fn().mockResolvedValue([]);

  const whereMock = vi.fn().mockImplementation(() => {
    const obj: any = { limit: limitMock };
    // Thenable — lets callers do `await db.select().from(t).where(c)` without .limit().
    obj.then = (onFulfilled: any, onRejected: any) =>
      dbSelectWhereMock().then(onFulfilled, onRejected);
    return obj;
  });

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
// objectStorageClient.bucket().file().download() is mocked so brand-asset URL resolution works.
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
    // GCS-style interface used by getPublicUrlForBrandAsset:
    //   objectStorageClient.bucket(name).file(path).download()
    bucket: vi.fn().mockImplementation(() => ({
      file: vi.fn().mockImplementation(() => ({
        download: bucketFileMock,
        getSignedUrl: vi.fn().mockResolvedValue(['https://gcs.example.com/signed']),
      })),
    })),
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

  // Default: db.select().from().where() returns an empty array (no brand asset).
  dbSelectWhereMock.mockResolvedValue([]);

  // Default: bucket download returns a stub buffer.
  bucketFileMock.mockResolvedValue([Buffer.from('fake-image-bytes')]);

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

// ---------------------------------------------------------------------------
// Brand-asset path resolution
// ---------------------------------------------------------------------------
//
// When replacementImageUrl is a brand-asset API path (/api/brand-assets/file/<id>),
// the route must NOT forward the raw path to createJob.  Instead it calls
// getPublicUrlForBrandAsset which:
//   1. Parses the asset ID
//   2. Queries the DB for the asset's settings.storagePath
//   3. Downloads from object storage
//   4. Uploads to PiAPI ephemeral storage
//   5. Returns the resulting CDN URL
// createJob must receive that CDN URL as sourceImageUrl, never the raw path.

describe(`POST /:projectId/scenes/:sceneId/regenerate-video — brand-asset path resolution`, () => {
  const PIAPI_CDN_URL = 'https://storage.theapi.app/assets/resolved-brand-123.jpg';
  let originalFetch: typeof global.fetch;
  let originalPiapiKey: string | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalPiapiKey = process.env.PIAPI_API_KEY;

    // Set a dummy API key so uploadImageToPiAPIStorage doesn't short-circuit.
    process.env.PIAPI_API_KEY = 'test-piapi-key';

    // Mock fetch to simulate a successful PiAPI ephemeral storage upload.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ url: PIAPI_CDN_URL }),
    } as any);

    // DB returns a brand asset with a valid storagePath when queried.
    dbSelectWhereMock.mockResolvedValue([
      {
        id: 123,
        settings: {
          storagePath: 'repl-bucket-test|public/brand-media/123_product.jpg',
        },
      },
    ]);

    // Object storage download returns a stub image buffer.
    bucketFileMock.mockResolvedValue([Buffer.from('fake-brand-asset-bytes')]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalPiapiKey === undefined) {
      delete process.env.PIAPI_API_KEY;
    } else {
      process.env.PIAPI_API_KEY = originalPiapiKey;
    }
  });

  it('resolves a brand-asset path to a CDN URL and passes it to createJob — not the raw path', async () => {
    const brandAssetPath = '/api/brand-assets/file/123';

    const res = await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        replacementImageUrl: brandAssetPath,
        provider: 'kling-2.6',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(createJobMock).toHaveBeenCalledTimes(1);

    const jobArgs = createJobMock.mock.calls[0][0];

    // The raw brand-asset path must NOT appear as sourceImageUrl.
    expect(jobArgs.sourceImageUrl).not.toBe(brandAssetPath);

    // The resolved CDN URL from the PiAPI upload must be what reaches the worker.
    expect(jobArgs.sourceImageUrl).toBe(PIAPI_CDN_URL);
  });

  it('does not pass a 400 when the brand-asset path is sent — resolution failure is not a validation error', async () => {
    // When the DB returns no asset (resolution fails), the route falls back to
    // T2V mode rather than returning 400.  A brand-asset path is always accepted
    // at the HTTP level; the error surfaces later in the worker if the image is
    // truly missing.
    dbSelectWhereMock.mockResolvedValue([]); // No asset found

    const res = await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        replacementImageUrl: '/api/brand-assets/file/999',
        provider: 'kling-2.6',
      });

    // Still a 200 — the route treats a failed resolution as a T2V fallback, not an error.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(createJobMock).toHaveBeenCalledTimes(1);

    // sourceImageUrl must not be the raw brand-asset path regardless of resolution outcome.
    // When resolution fails the route falls back to T2V, so sourceImageUrl is undefined —
    // which is the correct behaviour (the raw path must never reach the worker).
    const jobArgs = createJobMock.mock.calls[0][0];
    expect(String(jobArgs.sourceImageUrl ?? '')).not.toMatch(/\/api\/brand-assets\/file\//);
  });
});
