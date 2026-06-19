// Integration test: V2V full round-trip from HTTP request to worker provider call.
//
// This test mounts the real Express route handler (via supertest) AND drives
// the real worker processJob (with provider mocks) in sequence. It verifies
// that the URL placed in req.body.replacementImageUrl flows all the way
// through createJob → processJob → provider call unchanged.
//
// Coverage contract:
//   req.body { mode:'video-to-video', replacementImageUrl }
//       ↓ route reads & resolves → createJob({ sourceImageUrl })
//   createJob args captured here
//       ↓ construct job record
//   processJob(job) — real implementation, provider mocks in place
//       ↓
//   piapiVideoService.replaceObjectInVideo({ replacementImageUrl })   ← Kling
//   runwayVideoService.generateVideoToVideo({ videoUrl })             ← Runway
//       ↑ asserted here
//
// This catches regressions where a field is renamed in createJob but not in
// processJob — the unit tests on each layer individually would not notice.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Must set DATABASE_URL before any DB-touching module is loaded.
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------
// Hoist all mock factories before module imports.
// ---------------------------------------------------------------------------
const {
  createJobCaptureMock,
  getActiveJobForSceneMock,
  dbSelectWhereMock,
  bucketFileMock,
  dispatchRenderMock,
  generateVideoToVideoMock,
  replaceObjectInVideoMock,
  updateJobMock,
  getJobMock,
  getProjectFromDbMock,
  recordVideoAttemptMock,
} = vi.hoisted(() => ({
  createJobCaptureMock: vi.fn(),
  getActiveJobForSceneMock: vi.fn(),
  dbSelectWhereMock: vi.fn(),
  bucketFileMock: vi.fn(),
  dispatchRenderMock: vi.fn(),
  generateVideoToVideoMock: vi.fn(),
  replaceObjectInVideoMock: vi.fn(),
  updateJobMock: vi.fn(),
  getJobMock: vi.fn(),
  getProjectFromDbMock: vi.fn(),
  recordVideoAttemptMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Static module mocks (all paths relative to this file: server/services/__tests__/)
// ---------------------------------------------------------------------------

// Database — chainable stub (used by both the route and the worker).
vi.mock('../../db', () => {
  const limitMock = vi.fn().mockResolvedValue([]);
  const whereMock = vi.fn().mockImplementation(() => {
    const obj: any = { limit: limitMock };
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

// Auth — bypass isAuthenticated, inject a test user.
vi.mock('../../auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: 'employee' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

// requireCredits — bypass credit gate.
vi.mock('../../middleware/requireCredits', () => ({
  requireCredits: () => (_req: any, _res: any, next: any) => next(),
}));

// video-project-db — return the test project for any projectId lookup.
vi.mock('../video-project-db', () => ({
  getProjectFromDb: getProjectFromDbMock,
  updateProjectScenes: vi.fn().mockResolvedValue(undefined),
  findSceneIndex: vi.fn().mockReturnValue(0),
}));

// objectStorage — GCS-style bucket stub for brand-asset URL resolution.
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
    bucket: vi.fn().mockImplementation(() => ({
      file: vi.fn().mockImplementation(() => ({
        download: bucketFileMock,
        getSignedUrl: vi.fn().mockResolvedValue(['https://gcs.example.com/signed']),
      })),
    })),
  },
}));

// storage — shared by the route (createJob path) and by processJob.
// createVideoGenerationJob returns a complete job record so the route responds 200.
vi.mock('../../storage', () => ({
  storage: {
    createVideoGenerationJob: vi.fn().mockImplementation(async (data: any) => ({
      ...data,
      status: 'pending',
      progress: 0,
      retryCount: 0,
      maxRetries: 3,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      videoUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    updateVideoGenerationJob: updateJobMock,
    getVideoGenerationJob: getJobMock,
    getPendingVideoGenerationJobs: vi.fn().mockResolvedValue([]),
    recoverStuckVideoGenerationJobs: vi.fn().mockResolvedValue(0),
  },
}));

// credits-service — bypass credit accounting.
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
    recordVideoAttempt: recordVideoAttemptMock,
    recordImageAttempt: vi.fn().mockResolvedValue(undefined),
  },
}));

// render-system-router — used by processJob for non-V2V jobs; must not be called.
vi.mock('../render-system-router', () => ({
  dispatchRender: dispatchRenderMock,
}));

// Runway V2V provider
vi.mock('../runway-video-service', () => ({
  runwayVideoService: { generateVideoToVideo: generateVideoToVideoMock },
}));

// Kling (PiAPI) V2V provider
vi.mock('../piapi-video-service', () => ({
  piapiVideoService: { replaceObjectInVideo: replaceObjectInVideoMock },
}));

// image-generation-service — used for text-heavy scene pre-step inside processJob.
vi.mock('../image-generation-service', () => ({
  isTextHeavyScene: vi.fn().mockReturnValue(false),
  imageGenerationService: {
    generateWithOpenAI: vi.fn().mockResolvedValue({ url: 'https://cdn/stub.png' }),
  },
}));

// ---------------------------------------------------------------------------
// video-generation-worker — partial mock via importOriginal.
//
// We replace createJob and getActiveJobForScene with spies so the route layer
// is controlled, but keep processJob (private) as the real implementation so
// the integration test exercises the actual dispatch logic.
// ---------------------------------------------------------------------------
vi.mock('../video-generation-worker', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../video-generation-worker')>();
  const worker = mod.videoGenerationWorker as any;

  // Replace only the surface methods the route calls.
  worker.createJob = createJobCaptureMock;
  worker.getActiveJobForScene = getActiveJobForSceneMock;
  worker.start = vi.fn();
  worker.stop = vi.fn();

  // processJob remains the real private method — accessed as (worker as any).processJob
  return mod;
});

// Import the worker after mocks are registered.
import { videoGenerationWorker } from '../video-generation-worker';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-v2v-integ';
const SCENE_ID = 'scene-v2v-integ-1';
const REF_VIDEO_URL = 'https://cdn.example.com/reference-clip.mp4';
const REPLACEMENT_IMG_URL = 'https://cdn.example.com/my-product-image.jpg';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProject() {
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
  };
}

/**
 * Build the job record that processJob expects, derived from the args that
 * the route passed to createJob. This mirrors how storage.createVideoGenerationJob
 * constructs the persisted record from the request spec.
 */
function buildJobFromCreateJobArgs(args: any, jobId = 'integ-job-1'): any {
  return {
    jobId,
    projectId: args.projectId ?? PROJECT_ID,
    sceneId: args.sceneId ?? SCENE_ID,
    provider: args.provider ?? 'kling-2.6',
    prompt: args.prompt ?? 'A cinematic V2V shot',
    fallbackPrompt: args.fallbackPrompt ?? null,
    duration: args.duration ?? 6,
    aspectRatio: args.aspectRatio ?? '16:9',
    negativePrompt: args.negativePrompt ?? null,
    style: args.style ?? null,
    triggeredBy: null,         // skip credit accounting in processJob
    sourceImageUrl: args.sourceImageUrl ?? null,
    i2vSettings: args.i2vSettings ?? null,
    motionControl: args.motionControl ?? null,
    sceneType: args.sceneType ?? 'content',
    // maxRetries: 0 prevents the genError catch from re-queuing as 'pending'
    // when a job fails — ensures status goes directly to 'failed'.
    // (The worker-dispatch tests use the same pattern.)
    retryCount: 0,
    maxRetries: 0,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    videoUrl: null,
    progress: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

let universalVideoRouter: any;

beforeEach(async () => {
  vi.clearAllMocks();

  getProjectFromDbMock.mockResolvedValue(makeProject());
  getActiveJobForSceneMock.mockResolvedValue(null);

  // createJobCaptureMock returns a stub job so the route can respond 200.
  createJobCaptureMock.mockImplementation(async (args: any) => ({
    jobId: 'integ-job-capture',
    status: 'pending',
    progress: 0,
    ...args,
  }));

  dbSelectWhereMock.mockResolvedValue([]);
  bucketFileMock.mockResolvedValue([Buffer.from('fake-image-bytes')]);

  // getVideoGenerationJob — cancellation guard returns a non-cancelled job.
  getJobMock.mockResolvedValue({ jobId: 'integ-job-1', status: 'running' });

  // updateVideoGenerationJob — echo the patch.
  updateJobMock.mockImplementation((_jobId: string, patch: any) =>
    Promise.resolve({ jobId: _jobId, ...patch }),
  );

  // Provider success stubs
  generateVideoToVideoMock.mockResolvedValue({
    success: true,
    videoUrl: 'https://cdn.example.com/runway-out.mp4',
    provider: 'runway-gen4-aleph',
  });

  replaceObjectInVideoMock.mockResolvedValue({
    success: true,
    videoUrl: 'https://cdn.example.com/kling-out.mp4',
    provider: 'kling-v2v',
  });

  recordVideoAttemptMock.mockResolvedValue(undefined);
  dispatchRenderMock.mockResolvedValue({
    success: true,
    videoUrl: 'https://cdn.example.com/standard-out.mp4',
    provider: 'kling',
  });

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
// Integration tests
// ---------------------------------------------------------------------------

describe('V2V round-trip: HTTP route → processJob → provider (Kling path)', () => {
  it('replacementImageUrl from req.body arrives at replaceObjectInVideo unchanged', async () => {
    // Phase 1: HTTP layer
    const res = await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        replacementImageUrl: REPLACEMENT_IMG_URL,
        provider: 'kling-2.6',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(createJobCaptureMock).toHaveBeenCalledTimes(1);

    // Verify the route correctly forwarded replacementImageUrl as sourceImageUrl.
    const createJobArgs = createJobCaptureMock.mock.calls[0][0];
    expect(createJobArgs.sourceImageUrl).toBe(REPLACEMENT_IMG_URL);
    expect(createJobArgs.i2vSettings).toMatchObject({
      assetLibraryMode: 'v2v',
      referenceVideoUrl: REF_VIDEO_URL,
    });

    // Phase 2: Worker layer
    // Construct the job record exactly as storage would persist it from createJobArgs.
    const job = buildJobFromCreateJobArgs(createJobArgs, 'integ-job-kling-1');

    await (videoGenerationWorker as any).processJob(job);

    // The URL must arrive at the Kling provider without modification.
    expect(replaceObjectInVideoMock).toHaveBeenCalledTimes(1);
    const klingArgs = replaceObjectInVideoMock.mock.calls[0][0];
    expect(klingArgs.replacementImageUrl).toBe(REPLACEMENT_IMG_URL);
    expect(klingArgs.videoUrl).toBe(REF_VIDEO_URL);

    // Runway and dispatchRender must not have been called.
    expect(generateVideoToVideoMock).not.toHaveBeenCalled();
    expect(dispatchRenderMock).not.toHaveBeenCalled();
  });

  it('job is marked succeeded after the full round-trip completes', async () => {
    await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        replacementImageUrl: REPLACEMENT_IMG_URL,
        provider: 'kling-2.6',
      });

    const createJobArgs = createJobCaptureMock.mock.calls[0][0];
    const job = buildJobFromCreateJobArgs(createJobArgs, 'integ-job-kling-2');

    await (videoGenerationWorker as any).processJob(job);

    const succeededCall = updateJobMock.mock.calls.find(
      ([, patch]: [string, any]) => patch.status === 'succeeded',
    );
    expect(succeededCall).toBeDefined();
    expect(succeededCall[0]).toBe('integ-job-kling-2');
  });

  it('worker fails the job when replacementImageUrl is absent on the Kling path — not a 400', async () => {
    // The HTTP route does NOT return 400 for a missing replacementImageUrl —
    // the failure surfaces later in processJob when Kling has no image to use.
    const res = await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        // replacementImageUrl intentionally absent
        provider: 'kling-2.6',
      });

    // HTTP layer must succeed (no 400).
    expect(res.status).toBe(200);

    const createJobArgs = createJobCaptureMock.mock.calls[0][0];
    // No sourceImageUrl forwarded when replacementImageUrl was absent.
    expect(createJobArgs.sourceImageUrl).toBeFalsy();

    const job = buildJobFromCreateJobArgs(createJobArgs, 'integ-job-kling-noimg');

    await (videoGenerationWorker as any).processJob(job);

    // Worker must fail the job — Kling cannot proceed without a replacement image.
    expect(replaceObjectInVideoMock).not.toHaveBeenCalled();
    const failedCall = updateJobMock.mock.calls.find(
      ([, patch]: [string, any]) => patch.status === 'failed',
    );
    expect(failedCall).toBeDefined();
    expect(failedCall[1].errorMessage).toMatch(/replacement image|sourceImageUrl/i);
  });
});

describe('V2V round-trip: HTTP route → processJob → provider (Runway path)', () => {
  it('referenceVideoUrl from req.body arrives at generateVideoToVideo as videoUrl unchanged', async () => {
    // Phase 1: HTTP layer — Runway does not need replacementImageUrl.
    const res = await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        provider: 'runway-gen4-aleph',
        // replacementImageUrl intentionally omitted — Runway does not require it.
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(createJobCaptureMock).toHaveBeenCalledTimes(1);

    const createJobArgs = createJobCaptureMock.mock.calls[0][0];
    // Route must store the reference video URL in i2vSettings for the worker.
    expect(createJobArgs.i2vSettings).toMatchObject({
      assetLibraryMode: 'v2v',
      referenceVideoUrl: REF_VIDEO_URL,
    });

    // Phase 2: Worker layer
    const job = buildJobFromCreateJobArgs(createJobArgs, 'integ-job-runway-1');

    await (videoGenerationWorker as any).processJob(job);

    // The referenceVideoUrl must arrive at the Runway provider as videoUrl.
    expect(generateVideoToVideoMock).toHaveBeenCalledTimes(1);
    const runwayArgs = generateVideoToVideoMock.mock.calls[0][0];
    expect(runwayArgs.videoUrl).toBe(REF_VIDEO_URL);

    // Kling and dispatchRender must not have been called.
    expect(replaceObjectInVideoMock).not.toHaveBeenCalled();
    expect(dispatchRenderMock).not.toHaveBeenCalled();
  });

  it('Runway job is marked succeeded after the full round-trip', async () => {
    await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        provider: 'runway-gen4-aleph',
      });

    const createJobArgs = createJobCaptureMock.mock.calls[0][0];
    const job = buildJobFromCreateJobArgs(createJobArgs, 'integ-job-runway-2');

    await (videoGenerationWorker as any).processJob(job);

    const succeededCall = updateJobMock.mock.calls.find(
      ([, patch]: [string, any]) => patch.status === 'succeeded',
    );
    expect(succeededCall).toBeDefined();
  });

  it('Runway succeeds even when replacementImageUrl is also provided — it does not interfere', async () => {
    // Users might include a replacementImageUrl in the body even for Runway
    // (e.g. from a shared form).  processJob must route to Runway regardless
    // and must not fail because sourceImageUrl is set.
    const res = await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        replacementImageUrl: REPLACEMENT_IMG_URL,
        provider: 'runway-gen4-aleph',
      });

    expect(res.status).toBe(200);

    const createJobArgs = createJobCaptureMock.mock.calls[0][0];
    const job = buildJobFromCreateJobArgs(createJobArgs, 'integ-job-runway-3');

    await (videoGenerationWorker as any).processJob(job);

    expect(generateVideoToVideoMock).toHaveBeenCalledTimes(1);
    expect(replaceObjectInVideoMock).not.toHaveBeenCalled();
    const succeededCall = updateJobMock.mock.calls.find(
      ([, patch]: [string, any]) => patch.status === 'succeeded',
    );
    expect(succeededCall).toBeDefined();
  });
});

describe('V2V round-trip: field-rename regression guard', () => {
  it('sourceImageUrl written by createJob arrives at replaceObjectInVideo.replacementImageUrl with the same value', async () => {
    // This is the regression guard: if the field is renamed in createJob (e.g. to
    // "replacementImageUrl") but not updated in processJob's buildV2VRouteDecision
    // (which reads "sourceImageUrl"), the URL would be undefined at the provider.
    // This test catches exactly that class of drift.

    const specificUrl = 'https://cdn.example.com/regression-guard-product.png';

    await request(makeApp())
      .post(`/${PROJECT_ID}/scenes/${SCENE_ID}/regenerate-video`)
      .send({
        mode: 'video-to-video',
        referenceUrl: REF_VIDEO_URL,
        replacementImageUrl: specificUrl,
        provider: 'kling-2.6',
      });

    const createJobArgs = createJobCaptureMock.mock.calls[0][0];
    // Confirm the route stored the URL under the field processJob reads.
    expect(createJobArgs).toHaveProperty('sourceImageUrl', specificUrl);

    const job = buildJobFromCreateJobArgs(createJobArgs, 'integ-job-regression');
    // Confirm the constructed job mirrors what processJob would receive from storage.
    expect(job.sourceImageUrl).toBe(specificUrl);

    await (videoGenerationWorker as any).processJob(job);

    expect(replaceObjectInVideoMock).toHaveBeenCalledTimes(1);
    const klingArgs = replaceObjectInVideoMock.mock.calls[0][0];
    // The URL must be identical end-to-end — no transformation or field mismatch.
    expect(klingArgs.replacementImageUrl).toBe(specificUrl);
  });
});
