import { describe, it, expect, beforeEach, vi } from 'vitest';

// Module mocks must be set BEFORE the SUT is dynamically imported.
const updateMock = vi.fn();
const executeMock = vi.fn();
const getProjectFromDbMock = vi.fn();
const generateCandidatesMock = vi.fn();
const scoreImagesMock = vi.fn();
const imageGenerationMock = vi.fn();

vi.mock('../../db', () => ({
  db: {
    update: () => ({ set: () => ({ where: updateMock }) }),
    execute: executeMock,
  },
}));
vi.mock('../../../shared/schema', () => ({ universalVideoProjects: { projectId: 'projectId' } as any }));
vi.mock('drizzle-orm', () => ({
  eq: (a: any, b: any) => ({ a, b }),
  // sql template returns a stable token; we only assert that execute was called.
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({ strings, values }),
}));
// Use the REAL patchSceneAtomic (which routes through the mocked db.execute)
// so the storyboard service still funnels writes through the same atomic
// primitive after Task #108's centralization.
vi.mock('../video-project-db', async () => {
  const actual = await vi.importActual<typeof import('../video-project-db')>(
    '../video-project-db',
  );
  return {
    ...actual,
    getProjectFromDb: getProjectFromDbMock,
  };
});
vi.mock('../nano-banana2.service', () => ({
  nanoBanana2Service: {
    generateCandidates: generateCandidatesMock,
  },
  NB2AspectRatio: {} as any,
  // Task #109: scene-image.service now depends on the resolution-aware
  // pricing helpers exported by nano-banana2.service.
  NB2_DEFAULT_RESOLUTION: '1K',
  NB2_COST_PER_IMAGE_BY_RESOLUTION: { '1K': 0.06, '2K': 0.08, '4K': 0.12 },
  getNB2CostPerImage: (res?: string) =>
    ({ '1K': 0.06, '2K': 0.08, '4K': 0.12 } as Record<string, number>)[res ?? '1K'] ?? 0.06,
}));
vi.mock('../image-generation-service', () => ({
  imageGenerationService: {
    generateImage: imageGenerationMock,
  },
}));
vi.mock('../claude-vision-qa.service', () => ({
  scoreImages: scoreImagesMock,
}));
vi.mock('../../../shared/config/visual-art-presets', () => ({
  getVisualArtPreset: () => ({ imagePromptPrefix: 'cinematic,', imagePromptSuffix: 'film grain' }),
}));

const sceneFactory = (overrides: any = {}) => ({
  id: 'scene-1',
  imagePrompt: 'A serene meadow at sunset with a person walking',
  visualDirection: 'A serene meadow at sunset',
  narration: 'A serene meadow at sunset',
  artPresetId: 'cinematic',
  ...overrides,
});

const projectFactory = (scenes: any[] = [sceneFactory()]) => ({
  projectId: 'p1',
  scenes,
  outputFormat: { aspectRatio: '16:9' },
  settings: { visualStyle: 'professional' },
  progress: { artPresetId: 'cinematic' },
  ownerId: 'u1',
});

describe('scene-image.service: generateSceneImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue(undefined);
    executeMock.mockResolvedValue({ rowCount: 1 });
  });

  it('picks the highest-scored NB2 candidate, persists thumbnailUrl + seedImageUrl', async () => {
    getProjectFromDbMock
      .mockResolvedValueOnce(projectFactory()) // initial load
      .mockResolvedValueOnce(projectFactory()); // stale-write check

    generateCandidatesMock.mockResolvedValue([
      { imageUrl: 'https://cdn.test/c1.png' },
      { imageUrl: 'https://cdn.test/c2.png' },
      { imageUrl: 'https://cdn.test/c3.png' },
    ]);
    scoreImagesMock.mockResolvedValue([
      { url: 'https://cdn.test/c1.png', score: 0.4, reason: 'meh' },
      { url: 'https://cdn.test/c2.png', score: 0.9, reason: 'best' },
      { url: 'https://cdn.test/c3.png', score: 0.7, reason: 'good' },
    ]);

    const { generateSceneImage } = await import('../scene-image.service');
    const r = await generateSceneImage('p1', 'scene-1');

    expect(r.thumbnailUrl).toBe('https://cdn.test/c2.png');
    expect(r.seedImageUrl).toBe('https://cdn.test/c2.png');
    expect(r.model).toBe('nano-banana-2');
    expect(r.candidates).toHaveLength(3);
    expect(r.candidates.find(c => c.selected)?.url).toBe('https://cdn.test/c2.png');
    // Task #109: NB2 1K is $0.06 / image — 3 candidates = $0.18.
    expect(r.cost).toBeCloseTo(0.18, 5);
  });

  it('short-circuits without spending when fingerprint matches existing thumbnail+seed', async () => {
    const cachedScene = sceneFactory({
      thumbnailUrl: 'https://cdn.test/cached.png',
      seedImageUrl: 'https://cdn.test/cached.png',
      thumbnailGeneratedFor: 'cinematic::A serene meadow at sunset with a person walking',
      thumbnailStatus: 'complete',
      imageGenerationModel: 'nano-banana-2',
      imageGenerationPrompt: 'cinematic, A serene meadow at sunset with a person walking, film grain',
      imageCandidates: [{ url: 'https://cdn.test/cached.png', score: 0.9, selected: true }],
    });
    getProjectFromDbMock.mockResolvedValueOnce(projectFactory([cachedScene]));

    const { generateSceneImage } = await import('../scene-image.service');
    const r = await generateSceneImage('p1', 'scene-1');

    expect(r.thumbnailUrl).toBe('https://cdn.test/cached.png');
    expect(r.cost).toBe(0);
    expect(r.stale).toBe(false);
    // Critically: NB2 / Recraft / Flux should never have been called.
    expect(generateCandidatesMock).not.toHaveBeenCalled();
    expect(imageGenerationMock).not.toHaveBeenCalled();
    expect(scoreImagesMock).not.toHaveBeenCalled();
  });

  it('passes scene.brandReferences URLs to NB2 as referenceImages', async () => {
    const sceneWithRefs = sceneFactory({
      brandReferences: [
        { assetUrl: 'https://cdn.test/logo.png', tag: 'image1' },
        { assetUrl: 'https://cdn.test/bottle.png', tag: 'image2' },
      ],
    });
    getProjectFromDbMock
      .mockResolvedValueOnce(projectFactory([sceneWithRefs]))
      .mockResolvedValueOnce(projectFactory([sceneWithRefs]));

    generateCandidatesMock.mockResolvedValue([{ imageUrl: 'https://cdn.test/c1.png' }]);
    scoreImagesMock.mockResolvedValue([{ url: 'https://cdn.test/c1.png', score: 0.8 }]);

    const { generateSceneImage } = await import('../scene-image.service');
    await generateSceneImage('p1', 'scene-1');

    expect(generateCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImages: ['https://cdn.test/logo.png', 'https://cdn.test/bottle.png'],
      }),
      expect.any(Number)
    );
  });

  it('falls back to project.assets.productImages when scene has no brand refs', async () => {
    const project = projectFactory();
    (project as any).assets = {
      productImages: [
        { url: 'https://cdn.test/product1.png' },
        { url: 'https://cdn.test/product2.png' },
      ],
    };
    getProjectFromDbMock
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce(project);

    generateCandidatesMock.mockResolvedValue([{ imageUrl: 'https://cdn.test/c1.png' }]);
    scoreImagesMock.mockResolvedValue([{ url: 'https://cdn.test/c1.png', score: 0.8 }]);

    const { generateSceneImage } = await import('../scene-image.service');
    await generateSceneImage('p1', 'scene-1');

    expect(generateCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImages: ['https://cdn.test/product1.png', 'https://cdn.test/product2.png'],
      }),
      expect.any(Number)
    );
  });

  it('falls back to Recraft when NB2 generates zero candidates', async () => {
    getProjectFromDbMock
      .mockResolvedValueOnce(projectFactory())
      .mockResolvedValueOnce(projectFactory());

    generateCandidatesMock.mockResolvedValue([]); // NB2 returns nothing
    imageGenerationMock.mockResolvedValueOnce({ url: 'https://cdn.test/recraft.png' });

    const { generateSceneImage } = await import('../scene-image.service');
    const r = await generateSceneImage('p1', 'scene-1');

    expect(r.model).toBe('recraft-v4-pro');
    expect(r.thumbnailUrl).toBe('https://cdn.test/recraft.png');
    expect(imageGenerationMock).toHaveBeenCalledWith(expect.objectContaining({ provider: 'recraft-v4-pro' }));
  });

  it('falls back to Flux when both NB2 and Recraft fail', async () => {
    getProjectFromDbMock
      .mockResolvedValueOnce(projectFactory())
      .mockResolvedValueOnce(projectFactory());

    generateCandidatesMock.mockRejectedValue(new Error('NB2 down'));
    imageGenerationMock
      .mockRejectedValueOnce(new Error('Recraft down')) // first call: recraft
      .mockResolvedValueOnce({ url: 'https://cdn.test/flux.png' }); // second call: flux

    const { generateSceneImage } = await import('../scene-image.service');
    const r = await generateSceneImage('p1', 'scene-1');

    expect(r.model).toBe('flux');
    expect(r.thumbnailUrl).toBe('https://cdn.test/flux.png');
    // Verify ordering: recraft first, then flux.
    expect(imageGenerationMock.mock.calls[0][0].provider).toBe('recraft-v4-pro');
    expect(imageGenerationMock.mock.calls[1][0].provider).toBe('flux');
  });

  it('discards stale results when the scene prompt/preset changed during generation', async () => {
    const initialProject = projectFactory();
    const changedProject = projectFactory([sceneFactory({
      imagePrompt: 'A completely different prompt about mountains',
      thumbnailUrl: 'https://cdn.test/existing.png',
      imageGenerationModel: 'nano-banana-2',
    })]);
    getProjectFromDbMock
      .mockResolvedValueOnce(initialProject)
      .mockResolvedValueOnce(changedProject);

    generateCandidatesMock.mockResolvedValue([
      { imageUrl: 'https://cdn.test/old.png' },
    ]);
    scoreImagesMock.mockResolvedValue([
      { url: 'https://cdn.test/old.png', score: 0.8 },
    ]);

    const { generateSceneImage } = await import('../scene-image.service');
    const r = await generateSceneImage('p1', 'scene-1');

    expect(r.stale).toBe(true);
    expect(r.thumbnailUrl).toBe('https://cdn.test/existing.png'); // existing kept
  });

  it('renders a grounded lifestyle scene end-to-end with web search ON and persists the result', async () => {
    // Task #107: Higher-level happy-path assertion for a grounded scene.
    // This is the "short test confirming web-grounded scenes render with
    // relevant context" requested by the task. We can't hit live PiAPI in a
    // unit test, but we can drive the full scene-image pipeline for a scene
    // that the policy classifies as grounded and assert the contract holds:
    //   1. The web-search flag is forwarded to NB2 (so PiAPI grounds the
    //      generation against live web context).
    //   2. Brand reference URLs are forwarded alongside it (typical grounded
    //      use case is "real product in real environment").
    //   3. The chosen candidate is persisted to the scene JSONB via the
    //      atomic per-scene patch primitive.
    //   4. The returned result advertises the right model, fingerprint, and
    //      cost — nothing in the grounded path silently swaps providers.
    // For a live-API smoke test, see scripts/manual/verify-nb2-web-search.ts.
    const groundedScene = sceneFactory({
      id: 'scene-grounded',
      artPresetId: 'lifestyle',
      imagePrompt: 'A barista pouring oat-milk latte art at a Tokyo specialty cafe',
      brandReferences: [
        { assetUrl: 'https://cdn.test/brand-cup.png', tag: 'image1' },
      ],
    });
    const groundedProject = projectFactory([groundedScene]);
    getProjectFromDbMock.mockReset();
    getProjectFromDbMock
      .mockResolvedValueOnce(groundedProject)
      .mockResolvedValueOnce(groundedProject);

    generateCandidatesMock.mockResolvedValue([
      { imageUrl: 'https://cdn.test/grounded-1.png' },
      { imageUrl: 'https://cdn.test/grounded-2.png' },
      { imageUrl: 'https://cdn.test/grounded-3.png' },
    ]);
    scoreImagesMock.mockResolvedValue([
      { url: 'https://cdn.test/grounded-1.png', score: 0.6, reason: 'ok' },
      { url: 'https://cdn.test/grounded-2.png', score: 0.95, reason: 'best — sharp brand match' },
      { url: 'https://cdn.test/grounded-3.png', score: 0.7, reason: 'good' },
    ]);
    executeMock.mockResolvedValue({ rowCount: 1 });

    const { generateSceneImage } = await import('../scene-image.service');
    const result = await generateSceneImage('p1', 'scene-grounded');

    // (1) + (2) NB2 received the grounded-scene contract: web search ON,
    // brand references forwarded.
    expect(generateCandidatesMock).toHaveBeenCalledTimes(1);
    const [nb2Opts, nb2Count] = generateCandidatesMock.mock.calls[0];
    expect(nb2Opts).toMatchObject({
      enableWebSearch: true,
      referenceImages: ['https://cdn.test/brand-cup.png'],
      aspectRatio: '16:9',
    });
    expect(nb2Count).toBe(3);

    // (3) The chosen candidate landed in the scene via the atomic per-scene
    // patch (jsonb_agg merge), not a full-array overwrite.
    expect(updateMock).not.toHaveBeenCalled();
    type PatchTag = { strings: TemplateStringsArray; values: unknown[] };
    const persistedPatchCall = executeMock.mock.calls.find((call) => {
      const tag = call[0] as PatchTag | undefined;
      const values = tag?.values ?? [];
      return values.includes('scene-grounded')
        && values.some((v) => typeof v === 'string' && v.includes('https://cdn.test/grounded-2.png'));
    });
    expect(persistedPatchCall).toBeDefined();

    // (4) The returned envelope reflects the grounded happy path.
    expect(result.thumbnailUrl).toBe('https://cdn.test/grounded-2.png');
    expect(result.seedImageUrl).toBe('https://cdn.test/grounded-2.png');
    expect(result.model).toBe('nano-banana-2');
    expect(result.candidates.find((c) => c.selected)?.url).toBe('https://cdn.test/grounded-2.png');
    // Task #109: NB2 1K is $0.06 / image — 3 candidates = $0.18.
    expect(result.cost).toBeCloseTo(0.18, 5);
    expect(result.stale).toBeFalsy();
    expect(result.fingerprint).toContain('lifestyle');
  });

  it('forwards enableWebSearch=false to NB2 for non-grounded scenes', async () => {
    // The default project factory uses a `cinematic` preset with no grounded
    // content type — policy must return false and we must explicitly pass it
    // through so the model skips the search round-trip.
    getProjectFromDbMock.mockReset();
    getProjectFromDbMock
      .mockResolvedValueOnce(projectFactory())
      .mockResolvedValueOnce(projectFactory());

    generateCandidatesMock.mockResolvedValue([{ imageUrl: 'https://cdn.test/n1.png' }]);
    scoreImagesMock.mockResolvedValue([{ url: 'https://cdn.test/n1.png', score: 0.8 }]);

    const { generateSceneImage } = await import('../scene-image.service');
    await generateSceneImage('p1', 'scene-1');

    expect(generateCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({ enableWebSearch: false }),
      expect.any(Number),
    );
  });

  it('throws when all providers fail', async () => {
    getProjectFromDbMock.mockResolvedValueOnce(projectFactory());
    generateCandidatesMock.mockRejectedValue(new Error('NB2 down'));
    imageGenerationMock
      .mockRejectedValueOnce(new Error('Recraft down'))
      .mockRejectedValueOnce(new Error('Flux down'));
    // The error path also re-reads the project to mark it failed.
    getProjectFromDbMock.mockResolvedValueOnce(projectFactory());

    const { generateSceneImage } = await import('../scene-image.service');
    await expect(generateSceneImage('p1', 'scene-1')).rejects.toThrow(/All providers failed/);
  });
});

describe('scene-image.service: concurrent writes are atomic per-scene', () => {
  it('persists each scene via per-scene jsonb_agg patches, never full-array writes (no lost updates)', async () => {
    // Two scenes generated back-to-back. The atomicity guarantee lives in the
    // SQL itself (jsonb_agg merge over the row's CURRENT value), so the unit
    // test asserts the CALL PATH: every persistence MUST go through the atomic
    // per-scene primitive (db.execute) and NEVER through the full-array
    // read-modify-write (db.update). If db.update were invoked from inside
    // generateSceneImage, two parallel workers could overwrite each other's
    // committed scenes — the very lost-update race this refactor fixes.
    const sceneA = sceneFactory({ id: 'scene-A' });
    const sceneB = sceneFactory({ id: 'scene-B' });
    // Reset implementation queue so unconsumed mockResolvedValueOnce from prior
    // tests don't bleed into this one — clearAllMocks only resets call history.
    getProjectFromDbMock.mockReset();
    getProjectFromDbMock.mockResolvedValue(projectFactory([sceneA, sceneB]));
    generateCandidatesMock.mockResolvedValue([
      { imageUrl: 'https://cand/1.jpg' },
      { imageUrl: 'https://cand/2.jpg' },
      { imageUrl: 'https://cand/3.jpg' },
    ]);
    scoreImagesMock.mockResolvedValue([
      { url: 'https://cand/1.jpg', score: 0.9, reason: 'best' },
      { url: 'https://cand/2.jpg', score: 0.7, reason: 'good' },
      { url: 'https://cand/3.jpg', score: 0.5, reason: 'ok' },
    ]);

    const { generateSceneImage } = await import('../scene-image.service');
    const resA = await generateSceneImage('p1', 'scene-A');
    const resB = await generateSceneImage('p1', 'scene-B');

    expect(resA.thumbnailUrl).toBe('https://cand/1.jpg');
    expect(resB.thumbnailUrl).toBe('https://cand/1.jpg');

    // CRITICAL: db.update (full-array R-M-W) must NEVER be invoked from the
    // per-scene path — that's what would reintroduce the lost-update race.
    expect(updateMock).not.toHaveBeenCalled();
    expect(executeMock).toHaveBeenCalled();

    // The atomic patch primitive bound BOTH scene ids across the calls,
    // proving each scene's writes flow through their own per-scene patch.
    const calls = executeMock.mock.calls.map(c => c[0]);
    const allBoundValues = calls.flatMap((tag: any) => tag?.values ?? []);
    expect(allBoundValues).toEqual(expect.arrayContaining(['scene-A', 'scene-B']));
  });
});

describe('scene-image.service: generateAllSceneImages — Task #112 progress events', () => {
  it('emits per-scene cost, nb2Resolution, and a running cumulativeCost on each tick', async () => {
    // Three scenes, all needing fresh generation. Each NB2 call returns one
    // candidate (single-candidate fast path keeps Vision QA out of the math),
    // so the per-scene cost is exactly 1 × $0.06 at 1K.
    const sceneA = sceneFactory({ id: 'A', imagePrompt: 'a' });
    const sceneB = sceneFactory({ id: 'B', imagePrompt: 'b' });
    const sceneC = sceneFactory({ id: 'C', imagePrompt: 'c' });
    getProjectFromDbMock.mockReset();
    getProjectFromDbMock.mockResolvedValue(projectFactory([sceneA, sceneB, sceneC]));
    generateCandidatesMock.mockResolvedValue([{ imageUrl: 'https://cdn.test/x.png' }]);

    // Force serial execution so the cumulative tally we assert against is
    // deterministic regardless of how the worker pool happens to interleave.
    const oldConc = process.env.STORYBOARD_BATCH_CONCURRENCY;
    process.env.STORYBOARD_BATCH_CONCURRENCY = '1';
    try {
      const { generateAllSceneImages } = await import('../scene-image.service');
      const events: any[] = [];
      const result = await generateAllSceneImages(
        'p1',
        { skipExisting: false, numCandidates: 1 },
        (e) => events.push(e),
      );

      // Every event carries the budget snapshot.
      for (const e of events) {
        expect(e.totalToGenerate).toBe(3);
        expect(typeof e.budgetCap).toBe('number');
        expect(typeof e.estimatedCost).toBe('number');
        expect(typeof e.cumulativeCost).toBe('number');
      }

      const completes = events.filter((e) => e.status === 'complete');
      expect(completes).toHaveLength(3);
      // Per-scene cost is the 1K price for one candidate.
      expect(completes.map((e) => e.cost)).toEqual([0.06, 0.06, 0.06].map((c) => c));
      // Cumulative climbs monotonically: 0.06, 0.12, 0.18.
      expect(completes.map((e) => Number(e.cumulativeCost.toFixed(4)))).toEqual([0.06, 0.12, 0.18]);
      // Resolution tier rides on each complete event.
      expect(completes.every((e) => e.nb2Resolution === '1K')).toBe(true);
      // completedCount monotonically counts terminal events.
      expect(completes.map((e) => e.completedCount)).toEqual([1, 2, 3]);
      expect(result.totalCost).toBeCloseTo(0.18, 5);
    } finally {
      if (oldConc === undefined) delete process.env.STORYBOARD_BATCH_CONCURRENCY;
      else process.env.STORYBOARD_BATCH_CONCURRENCY = oldConc;
    }
  });

  it('Task #112: tags plan-skips with skipReason="plan" and excludes them from completedCount/totalToGenerate', async () => {
    // 4 scenes total: scenes 0 and 1 already have NB2 thumbnails (plan-skip
    // when skipExisting=true), scenes 2 and 3 need fresh generation. The
    // batch denominator must reflect ONLY the two scenes the worker pool
    // will run, and the plan-skip events must arrive tagged so the route
    // layer can split its persisted counters cleanly.
    const presentScenes = [
      sceneFactory({ id: 'cached-A', thumbnailUrl: 'https://cdn.test/cached-a.png', imageGenerationModel: 'nano-banana-2', imagePrompt: 'a' }),
      sceneFactory({ id: 'cached-B', thumbnailUrl: 'https://cdn.test/cached-b.png', imageGenerationModel: 'nano-banana-2', imagePrompt: 'b' }),
      sceneFactory({ id: 'fresh-C', imagePrompt: 'c' }),
      sceneFactory({ id: 'fresh-D', imagePrompt: 'd' }),
    ];
    getProjectFromDbMock.mockReset();
    getProjectFromDbMock.mockResolvedValue(projectFactory(presentScenes));
    generateCandidatesMock.mockResolvedValue([{ imageUrl: 'https://cdn.test/x.png' }]);

    const oldConc = process.env.STORYBOARD_BATCH_CONCURRENCY;
    process.env.STORYBOARD_BATCH_CONCURRENCY = '1';
    try {
      const { generateAllSceneImages } = await import('../scene-image.service');
      const events: any[] = [];
      await generateAllSceneImages(
        'p1',
        { skipExisting: true, numCandidates: 1 },
        (e) => events.push(e),
      );

      // Plan-skip events fire first, before any worker started.
      const planSkips = events.filter((e) => e.status === 'skipped' && e.skipReason === 'plan');
      const staleSkips = events.filter((e) => e.status === 'skipped' && e.skipReason === 'stale');
      const completes = events.filter((e) => e.status === 'complete');

      expect(planSkips.map((e) => e.sceneId).sort()).toEqual(['cached-A', 'cached-B']);
      expect(staleSkips).toHaveLength(0);
      expect(completes).toHaveLength(2);

      // Crucial: plan-skips must NOT bump completedCount and must report
      // totalToGenerate=2 (only the worker-pool scenes), so the persisted
      // route counters can split cleanly into (completedCount/totalToGenerate)
      // for the in-pool denominator and `scenesSkippedByPlan` for the rest.
      for (const e of planSkips) {
        expect(e.completedCount).toBe(0);
        expect(e.totalToGenerate).toBe(2);
      }
      expect(completes.map((e) => e.completedCount)).toEqual([1, 2]);
      for (const e of completes) {
        expect(e.totalToGenerate).toBe(2);
        expect(e.skipReason).toBeUndefined();
      }

      // The return value also splits cleanly: callers persisting terminal
      // counters in jsonb (e.g. `/generate-storyboard`) must use these
      // separate fields rather than the legacy `skipped` sum.
      const { generateAllSceneImages: _g } = await import('../scene-image.service');
      const r = await _g(
        'p1',
        { skipExisting: true, numCandidates: 1 },
        () => {},
      );
      expect(r.planSkipped).toBe(2);
      expect(r.runtimeSkipped).toBe(0);
      expect(r.generated).toBe(2);
      expect(r.failed).toBe(0);
      // Backwards-compat: `skipped` is the sum of plan + runtime.
      expect(r.skipped).toBe(2);
      // Denominator math the route layer relies on for `completedCount`:
      expect(r.generated + r.failed + r.runtimeSkipped).toBe(r.estimate.scenesToGenerate);
    } finally {
      if (oldConc === undefined) delete process.env.STORYBOARD_BATCH_CONCURRENCY;
      else process.env.STORYBOARD_BATCH_CONCURRENCY = oldConc;
    }
  });

  it('flips nearCap=true once cumulative spend crosses 80% of the budget cap', async () => {
    // Cap = $0.20 → 80% threshold = $0.16. Each NB2 call here costs $0.06,
    // so after the 3rd scene cumulative=$0.18 ≥ $0.16 → nearCap should fire.
    const scenes = Array.from({ length: 3 }, (_, i) => sceneFactory({ id: `s${i}`, imagePrompt: `p${i}` }));
    getProjectFromDbMock.mockReset();
    getProjectFromDbMock.mockResolvedValue(projectFactory(scenes));
    generateCandidatesMock.mockResolvedValue([{ imageUrl: 'https://cdn.test/x.png' }]);

    const oldCap = process.env.STORYBOARD_BUDGET_CAP;
    const oldConc = process.env.STORYBOARD_BATCH_CONCURRENCY;
    process.env.STORYBOARD_BUDGET_CAP = '0.20';
    process.env.STORYBOARD_BATCH_CONCURRENCY = '1';
    try {
      const { generateAllSceneImages } = await import('../scene-image.service');
      const events: any[] = [];
      await generateAllSceneImages(
        'p1',
        { skipExisting: false, numCandidates: 1, confirmOverCap: true },
        (e) => events.push(e),
      );

      const completes = events.filter((e) => e.status === 'complete');
      expect(completes[0].nearCap).toBe(false);  // 0.06 < 0.16
      expect(completes[1].nearCap).toBe(false);  // 0.12 < 0.16
      expect(completes[2].nearCap).toBe(true);   // 0.18 ≥ 0.16
    } finally {
      if (oldCap === undefined) delete process.env.STORYBOARD_BUDGET_CAP;
      else process.env.STORYBOARD_BUDGET_CAP = oldCap;
      if (oldConc === undefined) delete process.env.STORYBOARD_BATCH_CONCURRENCY;
      else process.env.STORYBOARD_BATCH_CONCURRENCY = oldConc;
    }
  });
});

describe('scene-image.service: estimateBatchCost', () => {
  it('skips scenes whose existing thumbnail was generated by NB2', async () => {
    const { estimateBatchCost } = await import('../scene-image.service');
    const scenes = [
      { id: 's1', thumbnailUrl: 'x', imageGenerationModel: 'nano-banana-2' },
      { id: 's2', thumbnailUrl: 'x', imageGenerationModel: 'flux' },
      { id: 's3' },
    ] as any;
    const e = estimateBatchCost(scenes, { skipExisting: true, numCandidates: 3 });
    expect(e.scenesSkipped).toBe(1);
    expect(e.scenesToGenerate).toBe(2);
    // Task #109: NB2 1K = $0.06 / image → 2 * 3 * 0.06 = $0.36.
    expect(e.estimatedCost).toBeCloseTo(0.36, 5);
  });

  it('flags overCap when estimated cost exceeds the budget cap', async () => {
    const { estimateBatchCost } = await import('../scene-image.service');
    const oldCap = process.env.STORYBOARD_BUDGET_CAP;
    process.env.STORYBOARD_BUDGET_CAP = '0.10';
    try {
      const scenes = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` }));
      const e = estimateBatchCost(scenes as any, { skipExisting: true, numCandidates: 3 });
      // Task #109: 10 * 3 * 0.06 = 1.80 ≫ cap 0.10.
      expect(e.overCap).toBe(true);
      expect(e.estimatedCost).toBeCloseTo(1.80, 5);
    } finally {
      if (oldCap === undefined) delete process.env.STORYBOARD_BUDGET_CAP;
      else process.env.STORYBOARD_BUDGET_CAP = oldCap;
    }
  });

  it('Task #112: surfaces nb2Resolution on the result envelope so batch UI can label spend', async () => {
    getProjectFromDbMock.mockReset();
    getProjectFromDbMock
      .mockResolvedValueOnce(projectFactory())
      .mockResolvedValueOnce(projectFactory());
    generateCandidatesMock.mockResolvedValue([{ imageUrl: 'https://cdn.test/n1.png' }]);
    scoreImagesMock.mockResolvedValue([{ url: 'https://cdn.test/n1.png', score: 0.8 }]);

    const oldRes = process.env.STORYBOARD_NB2_RESOLUTION;
    process.env.STORYBOARD_NB2_RESOLUTION = '2K';
    try {
      const { generateSceneImage } = await import('../scene-image.service');
      const r = await generateSceneImage('p1', 'scene-1');
      expect(r.model).toBe('nano-banana-2');
      expect(r.nb2Resolution).toBe('2K');
    } finally {
      if (oldRes === undefined) delete process.env.STORYBOARD_NB2_RESOLUTION;
      else process.env.STORYBOARD_NB2_RESOLUTION = oldRes;
    }
  });

  it('Task #112: leaves nb2Resolution undefined for non-NB2 fallbacks', async () => {
    getProjectFromDbMock.mockReset();
    getProjectFromDbMock
      .mockResolvedValueOnce(projectFactory())
      .mockResolvedValueOnce(projectFactory());
    generateCandidatesMock.mockResolvedValue([]); // NB2 returns nothing → Recraft
    imageGenerationMock.mockResolvedValueOnce({ url: 'https://cdn.test/recraft.png' });

    const { generateSceneImage } = await import('../scene-image.service');
    const r = await generateSceneImage('p1', 'scene-1');
    expect(r.model).toBe('recraft-v4-pro');
    expect(r.nb2Resolution).toBeUndefined();
  });

  it('prices each NB2 image at the configured resolution tier', async () => {
    // Task #109: NB2 is billed by resolution. The estimator must follow
    // STORYBOARD_NB2_RESOLUTION (1K $0.06, 2K $0.08, 4K $0.12) so the
    // pre-flight cost shown to the user matches the PiAPI invoice.
    const { estimateBatchCost } = await import('../scene-image.service');
    const scenes = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}` })) as any;
    const oldRes = process.env.STORYBOARD_NB2_RESOLUTION;
    try {
      process.env.STORYBOARD_NB2_RESOLUTION = '1K';
      expect(
        estimateBatchCost(scenes, { skipExisting: true, numCandidates: 3 }).estimatedCost,
      ).toBeCloseTo(4 * 3 * 0.06, 5);

      process.env.STORYBOARD_NB2_RESOLUTION = '2K';
      expect(
        estimateBatchCost(scenes, { skipExisting: true, numCandidates: 3 }).estimatedCost,
      ).toBeCloseTo(4 * 3 * 0.08, 5);

      process.env.STORYBOARD_NB2_RESOLUTION = '4K';
      expect(
        estimateBatchCost(scenes, { skipExisting: true, numCandidates: 3 }).estimatedCost,
      ).toBeCloseTo(4 * 3 * 0.12, 5);
    } finally {
      if (oldRes === undefined) delete process.env.STORYBOARD_NB2_RESOLUTION;
      else process.env.STORYBOARD_NB2_RESOLUTION = oldRes;
    }
  });

  it('Task #111: per-call resolution override beats the env default and surfaces in the estimate', async () => {
    // The UI's pre-flight estimate passes the user's tier choice so the
    // displayed cost reflects the chosen 1K/2K/4K rather than whatever
    // STORYBOARD_NB2_RESOLUTION happens to be set to in the environment.
    const { estimateBatchCost } = await import('../scene-image.service');
    const scenes = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}` })) as any;
    const oldRes = process.env.STORYBOARD_NB2_RESOLUTION;
    try {
      process.env.STORYBOARD_NB2_RESOLUTION = '1K';

      const e2k = estimateBatchCost(scenes, { skipExisting: true, numCandidates: 3, resolution: '2K' });
      expect(e2k.resolution).toBe('2K');
      expect(e2k.perImageCost).toBeCloseTo(0.08, 5);
      expect(e2k.estimatedCost).toBeCloseTo(5 * 3 * 0.08, 5);

      const e4k = estimateBatchCost(scenes, { skipExisting: true, numCandidates: 3, resolution: '4K' });
      expect(e4k.resolution).toBe('4K');
      expect(e4k.perImageCost).toBeCloseTo(0.12, 5);
      expect(e4k.estimatedCost).toBeCloseTo(5 * 3 * 0.12, 5);

      // Null/undefined override must not poison the env-derived default.
      const eDefault = estimateBatchCost(scenes, { skipExisting: true, numCandidates: 3, resolution: null });
      expect(eDefault.resolution).toBe('1K');
      expect(eDefault.perImageCost).toBeCloseTo(0.06, 5);
    } finally {
      if (oldRes === undefined) delete process.env.STORYBOARD_NB2_RESOLUTION;
      else process.env.STORYBOARD_NB2_RESOLUTION = oldRes;
    }
  });
});

describe('scene-image.service: getStoryboardResolution', () => {
  it('Task #111: explicit override > env > default', async () => {
    const { getStoryboardResolution } = await import('../scene-image.service');
    const oldRes = process.env.STORYBOARD_NB2_RESOLUTION;
    try {
      // No env, no override → default (1K)
      delete process.env.STORYBOARD_NB2_RESOLUTION;
      expect(getStoryboardResolution()).toBe('1K');

      // Env set, no override → env wins
      process.env.STORYBOARD_NB2_RESOLUTION = '2K';
      expect(getStoryboardResolution()).toBe('2K');
      expect(getStoryboardResolution(null)).toBe('2K');

      // Override beats env
      expect(getStoryboardResolution('4K')).toBe('4K');
      expect(getStoryboardResolution('1K')).toBe('1K');
    } finally {
      if (oldRes === undefined) delete process.env.STORYBOARD_NB2_RESOLUTION;
      else process.env.STORYBOARD_NB2_RESOLUTION = oldRes;
    }
  });
});

describe('scene-image.service: per-scene resolution plumbing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue(undefined);
    executeMock.mockResolvedValue({ rowCount: 1 });
  });

  it('Task #111: forwards options.resolution into the NB2 request and prices candidates at that tier', async () => {
    getProjectFromDbMock
      .mockResolvedValueOnce(projectFactory())
      .mockResolvedValueOnce(projectFactory());

    generateCandidatesMock.mockResolvedValue([
      { imageUrl: 'https://cdn.test/c1.png' },
      { imageUrl: 'https://cdn.test/c2.png' },
    ]);
    scoreImagesMock.mockResolvedValue([
      { url: 'https://cdn.test/c1.png', score: 0.5 },
      { url: 'https://cdn.test/c2.png', score: 0.9 },
    ]);

    const { generateSceneImage } = await import('../scene-image.service');
    const r = await generateSceneImage('p1', 'scene-1', { numCandidates: 2, resolution: '4K' });

    // The override must reach the NB2 service so the wire request matches
    // what the user is being billed for in the UI.
    expect(generateCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: '4K' }),
      2,
    );
    // Cost reflects the 4K tier (2 × $0.12), not the 1K default.
    expect(r.cost).toBeCloseTo(2 * 0.12, 5);
  });

  it('Task #111: project.storyboardResolution is honored when no explicit override is passed', async () => {
    const project = projectFactory();
    (project as any).storyboardResolution = '2K';
    getProjectFromDbMock
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce(project);

    generateCandidatesMock.mockResolvedValue([{ imageUrl: 'https://cdn.test/c1.png' }]);
    scoreImagesMock.mockResolvedValue([{ url: 'https://cdn.test/c1.png', score: 0.9 }]);

    const { generateSceneImage } = await import('../scene-image.service');
    const r = await generateSceneImage('p1', 'scene-1');

    expect(generateCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: '2K' }),
      expect.any(Number),
    );
    expect(r.cost).toBeCloseTo(0.08, 5);
  });
});
