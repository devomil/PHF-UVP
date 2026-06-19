// Worker-level unit tests for the V2V dispatch path inside processJob.
//
// These tests prove that when a job has i2vSettings.assetLibraryMode='v2v':
//   (a) dispatchRender is NEVER called
//   (b) the Runway provider (generateVideoToVideo) is called for runway jobs
//   (c) the Kling provider (replaceObjectInVideo) is called for non-runway jobs
//   (d) a missing referenceVideoUrl throws before any provider is contacted
//
// All paths in vi.mock() are relative to THIS test file
// (server/services/__tests__/), so one extra ".." compared to the worker.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mock factories before any module is imported.
// ---------------------------------------------------------------------------
const {
  dispatchRenderMock,
  generateVideoToVideoMock,
  replaceObjectInVideoMock,
  updateJobMock,
  getJobMock,
  recordVideoAttemptMock,
  getProjectFromDbMock,
} = vi.hoisted(() => ({
  dispatchRenderMock: vi.fn(),
  generateVideoToVideoMock: vi.fn(),
  replaceObjectInVideoMock: vi.fn(),
  updateJobMock: vi.fn(),
  getJobMock: vi.fn(),
  recordVideoAttemptMock: vi.fn(),
  getProjectFromDbMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Static module mocks — paths relative to this test file (server/services/__tests__/)
// ---------------------------------------------------------------------------

// storage is at server/storage (../../storage from here)
vi.mock('../../storage', () => ({
  storage: {
    updateVideoGenerationJob: updateJobMock,
    getVideoGenerationJob: getJobMock,
    recoverStuckVideoGenerationJobs: vi.fn().mockResolvedValue(0),
    getPendingVideoGenerationJobs: vi.fn().mockResolvedValue([]),
  },
}));

// render-system-router is at server/services/render-system-router
vi.mock('../render-system-router', () => ({
  dispatchRender: dispatchRenderMock,
}));

// intelligent-regeneration-service
vi.mock('../intelligent-regeneration-service', () => ({
  intelligentRegenerationService: {
    recordVideoAttempt: recordVideoAttemptMock,
    recordImageAttempt: vi.fn().mockResolvedValue(undefined),
  },
}));

// db is at server/db (../../db from here)
// Chainable mock so updateSceneMedia / findSceneIndex don't throw.
vi.mock('../../db', () => {
  const limitMock = vi.fn().mockResolvedValue([]);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const updateWhereMock = vi.fn().mockResolvedValue([]);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  return { db: { select: selectMock, update: updateMock } };
});

// Dynamic import mocks — vitest intercepts await import() calls globally
// once a module's resolved path is mocked.

vi.mock('../video-project-db', () => ({
  getProjectFromDb: getProjectFromDbMock,
}));

// Runway service
vi.mock('../runway-video-service', () => ({
  runwayVideoService: { generateVideoToVideo: generateVideoToVideoMock },
}));

// PiAPI / Kling service
vi.mock('../piapi-video-service', () => ({
  piapiVideoService: { replaceObjectInVideo: replaceObjectInVideoMock },
}));

// Credits — V2V test jobs have no triggeredBy so the credits path is skipped;
// mock anyway so the import resolves cleanly.
vi.mock('../credits-service', () => ({
  consumeCredits: vi.fn().mockResolvedValue({}),
  getCreditCost: vi.fn().mockResolvedValue(1),
  canAccessProvider: vi.fn().mockResolvedValue(true),
  refundCredits: vi.fn().mockResolvedValue({}),
}));

// Image-generation-service — used for the text-heavy scene pre-step.
// getProjectFromDb returning null bypasses the check, but mock the
// import so the dynamic require resolves without calling real APIs.
vi.mock('../image-generation-service', () => ({
  isTextHeavyScene: vi.fn().mockReturnValue(false),
  imageGenerationService: {
    generateWithOpenAI: vi.fn().mockResolvedValue({ url: 'https://cdn/stub.png' }),
  },
}));

// ---------------------------------------------------------------------------
// Import worker AFTER all mocks are registered.
// ---------------------------------------------------------------------------
import { videoGenerationWorker } from '../video-generation-worker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeV2VJob(
  overrides: {
    provider?: string;
    referenceVideoUrl?: string | null;
    sourceImageUrl?: string | null;
  } = {},
) {
  const {
    provider = 'runway-gen4-aleph',
    referenceVideoUrl = 'https://cdn.example.com/ref.mp4',
    sourceImageUrl = null,
  } = overrides;

  const i2vSettings =
    referenceVideoUrl === null
      ? { assetLibraryMode: 'v2v' }
      : { assetLibraryMode: 'v2v', referenceVideoUrl };

  return {
    jobId: 'test-job-v2v',
    projectId: 'proj-1',
    sceneId: 'scene-1',
    provider,
    prompt: 'A cinematic V2V shot',
    duration: 5,
    aspectRatio: '16:9',
    sourceImageUrl,
    i2vSettings,
    negativePrompt: null,
    style: null,
    triggeredBy: null,   // omit to skip credit accounting
    retryCount: 0,
    maxRetries: 0,
    sceneType: 'hook',
    motionControl: null,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    videoUrl: null,
    progress: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // getVideoGenerationJob — cancellation guard returns a non-cancelled job.
  getJobMock.mockResolvedValue({ jobId: 'test-job-v2v', status: 'running' });

  // updateVideoGenerationJob — echo the patch so notifyJobUpdate gets a job.
  updateJobMock.mockImplementation((_jobId: string, patch: any) =>
    Promise.resolve({ jobId: _jobId, ...patch }),
  );

  // Project lookup returns null → both try-catch blocks exit cleanly.
  getProjectFromDbMock.mockResolvedValue(null);

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
});

// ---------------------------------------------------------------------------
// (a) + (b) Runway V2V path — dispatchRender must NOT be called
// ---------------------------------------------------------------------------

describe('worker processJob — Runway V2V path', () => {
  it('calls generateVideoToVideo for a runway provider and never calls dispatchRender', async () => {
    const job = makeV2VJob({ provider: 'runway-gen4-aleph' });

    await (videoGenerationWorker as any).processJob(job);

    expect(generateVideoToVideoMock).toHaveBeenCalledTimes(1);
    expect(generateVideoToVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        videoUrl: 'https://cdn.example.com/ref.mp4',
        prompt: expect.any(String),
      }),
    );
    expect(dispatchRenderMock).not.toHaveBeenCalled();
  });

  it('passes the referenceVideoUrl from i2vSettings to the Runway provider', async () => {
    const refUrl = 'https://cdn.example.com/specific-ref.mp4';
    const job = makeV2VJob({ provider: 'runway-gen4-aleph', referenceVideoUrl: refUrl });

    await (videoGenerationWorker as any).processJob(job);

    const callArgs = generateVideoToVideoMock.mock.calls[0][0];
    expect(callArgs.videoUrl).toBe(refUrl);
  });

  it('marks the job as succeeded after a successful Runway V2V generation', async () => {
    const job = makeV2VJob({ provider: 'runway-gen4-aleph' });

    await (videoGenerationWorker as any).processJob(job);

    const succeededCall = updateJobMock.mock.calls.find(
      ([, patch]: [string, any]) => patch.status === 'succeeded',
    );
    expect(succeededCall).toBeDefined();
    expect(succeededCall[0]).toBe('test-job-v2v');
  });
});

// ---------------------------------------------------------------------------
// (c) Kling V2V path — dispatchRender must NOT be called
// ---------------------------------------------------------------------------

describe('worker processJob — Kling V2V path', () => {
  it('calls replaceObjectInVideo for a non-runway provider and never calls dispatchRender', async () => {
    const job = makeV2VJob({
      provider: 'kling-2.6',
      sourceImageUrl: 'https://cdn.example.com/product.jpg',
    });

    await (videoGenerationWorker as any).processJob(job);

    expect(replaceObjectInVideoMock).toHaveBeenCalledTimes(1);
    expect(replaceObjectInVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        videoUrl: 'https://cdn.example.com/ref.mp4',
        replacementImageUrl: 'https://cdn.example.com/product.jpg',
      }),
    );
    expect(dispatchRenderMock).not.toHaveBeenCalled();
  });

  it('defaults provider to kling-2.6 when provider is the "auto" sentinel', async () => {
    const job = makeV2VJob({
      provider: 'auto',
      sourceImageUrl: 'https://cdn.example.com/product.jpg',
    });

    await (videoGenerationWorker as any).processJob(job);

    expect(replaceObjectInVideoMock).toHaveBeenCalledTimes(1);
    expect(dispatchRenderMock).not.toHaveBeenCalled();
  });

  it('marks the job failed when Kling is selected but sourceImageUrl is absent', async () => {
    const job = makeV2VJob({
      provider: 'kling-2.6',
      sourceImageUrl: null, // Kling requires a replacement image
    });

    await (videoGenerationWorker as any).processJob(job);

    const failedCall = updateJobMock.mock.calls.find(
      ([, patch]: [string, any]) => patch.status === 'failed',
    );
    expect(failedCall).toBeDefined();
    expect(replaceObjectInVideoMock).not.toHaveBeenCalled();
    expect(dispatchRenderMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (d) Missing referenceVideoUrl guard — no provider should be contacted
// ---------------------------------------------------------------------------

describe('worker processJob — referenceVideoUrl guard', () => {
  it('marks job failed and does not call any provider when referenceVideoUrl is absent', async () => {
    const job = makeV2VJob({ referenceVideoUrl: null });

    await (videoGenerationWorker as any).processJob(job);

    expect(generateVideoToVideoMock).not.toHaveBeenCalled();
    expect(replaceObjectInVideoMock).not.toHaveBeenCalled();
    expect(dispatchRenderMock).not.toHaveBeenCalled();

    const failedCall = updateJobMock.mock.calls.find(
      ([, patch]: [string, any]) => patch.status === 'failed',
    );
    expect(failedCall).toBeDefined();
    // The error message must mention referenceVideoUrl
    expect(failedCall[1].errorMessage).toMatch(/referenceVideoUrl/i);
  });
});

// ---------------------------------------------------------------------------
// (e) replacementImageUrl body field forwarding — job.sourceImageUrl → provider
// ---------------------------------------------------------------------------
//
// The regenerate-video HTTP handler places the (resolved) replacementImageUrl
// from req.body into job.sourceImageUrl when it calls createJob.  The worker
// then reads job.sourceImageUrl inside buildV2VRouteDecision to populate
// decision.replacementImage, which is forwarded to the provider.
//
// These tests cover the worker half of the chain.  The HTTP half
// (req.body → createJob) is covered by v2v-regenerate-body.test.ts.
//
//   req.body.replacementImageUrl          → see v2v-regenerate-body.test.ts
//       ↓ resolved to CDN URL
//   createJob({ sourceImageUrl })         → see v2v-regenerate-body.test.ts
//       ↓
//   job.sourceImageUrl                    ← asserted here ↓
//   buildV2VRouteDecision → replacementImage
//       ↓
//   replaceObjectInVideo({ replacementImageUrl })   ← asserted here

describe('worker processJob — replacementImageUrl body field forwarding', () => {
  it('forwards job.sourceImageUrl as replacementImageUrl to the Kling provider (exact URL, no transformation)', async () => {
    const replacementUrl = 'https://cdn.example.com/product-exact.jpg';
    const job = makeV2VJob({
      provider: 'kling-2.6',
      sourceImageUrl: replacementUrl,
    });

    await (videoGenerationWorker as any).processJob(job);

    expect(replaceObjectInVideoMock).toHaveBeenCalledTimes(1);
    const klingArgs = replaceObjectInVideoMock.mock.calls[0][0];
    // The URL must arrive at the provider unchanged — no re-encoding or path alteration.
    expect(klingArgs.replacementImageUrl).toBe(replacementUrl);
  });

  it('does not call replaceObjectInVideo when job.sourceImageUrl is absent — marks job failed (missing replacementImageUrl is a Kling error, not a 400)', async () => {
    // The HTTP route makes replacementImageUrl optional: a missing body field does
    // not produce a 400.  The failure surfaces later, at the worker level, when Kling
    // discovers it has no replacement image.  This test confirms the worker path
    // (not the route) is responsible for the error and that the job is marked failed.
    const job = makeV2VJob({
      provider: 'kling-2.6',
      sourceImageUrl: null,
    });

    await (videoGenerationWorker as any).processJob(job);

    expect(replaceObjectInVideoMock).not.toHaveBeenCalled();
    const failedCall = updateJobMock.mock.calls.find(
      ([, patch]: [string, any]) => patch.status === 'failed',
    );
    expect(failedCall).toBeDefined();
    // The error message must mention the missing image so operators can diagnose.
    expect(failedCall[1].errorMessage).toMatch(/replacement image|sourceImageUrl/i);
  });

  it('Runway V2V succeeds when job.sourceImageUrl is absent — replacementImageUrl is optional for Runway', async () => {
    // req.body.replacementImageUrl is not required for the Runway V2V path.  An
    // absent or empty field must not cause a 400 (HTTP) or a failed job (worker).
    const job = makeV2VJob({
      provider: 'runway-gen4-aleph',
      sourceImageUrl: null,   // no replacement image body field
    });

    await (videoGenerationWorker as any).processJob(job);

    expect(generateVideoToVideoMock).toHaveBeenCalledTimes(1);
    expect(replaceObjectInVideoMock).not.toHaveBeenCalled();
    const succeededCall = updateJobMock.mock.calls.find(
      ([, patch]: [string, any]) => patch.status === 'succeeded',
    );
    expect(succeededCall).toBeDefined();
  });

  it('Runway V2V also succeeds when job.sourceImageUrl IS present — it is forwarded in the decision but not used by generateVideoToVideo', async () => {
    // The route may still populate sourceImageUrl for Runway (e.g. from scene.brandAssetUrl)
    // even when replacementImageUrl is not the primary intent.  The worker must not fail.
    const job = makeV2VJob({
      provider: 'runway-gen4-aleph',
      sourceImageUrl: 'https://cdn.example.com/brand-ref.jpg',
    });

    await (videoGenerationWorker as any).processJob(job);

    expect(generateVideoToVideoMock).toHaveBeenCalledTimes(1);
    expect(replaceObjectInVideoMock).not.toHaveBeenCalled();
    const succeededCall = updateJobMock.mock.calls.find(
      ([, patch]: [string, any]) => patch.status === 'succeeded',
    );
    expect(succeededCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// (f) Non-V2V jobs still go through dispatchRender
// ---------------------------------------------------------------------------

describe('worker processJob — non-V2V jobs use dispatchRender', () => {
  it('calls dispatchRender for a standard (non-V2V) job and never calls V2V providers', async () => {
    const standardJob = {
      ...makeV2VJob(),
      i2vSettings: { animationStyle: 'dynamic' }, // no assetLibraryMode:'v2v'
      sourceImageUrl: null,
    } as any;

    await (videoGenerationWorker as any).processJob(standardJob);

    expect(dispatchRenderMock).toHaveBeenCalledTimes(1);
    expect(generateVideoToVideoMock).not.toHaveBeenCalled();
    expect(replaceObjectInVideoMock).not.toHaveBeenCalled();
  });
});
