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
    expect(r.cost).toBeCloseTo(0.09, 5);
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
    expect(e.estimatedCost).toBeCloseTo(0.18, 5); // 2 * 3 * 0.03
  });

  it('flags overCap when estimated cost exceeds the budget cap', async () => {
    const { estimateBatchCost } = await import('../scene-image.service');
    const oldCap = process.env.STORYBOARD_BUDGET_CAP;
    process.env.STORYBOARD_BUDGET_CAP = '0.10';
    try {
      const scenes = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` }));
      const e = estimateBatchCost(scenes as any, { skipExisting: true, numCandidates: 3 });
      // 10 * 3 * 0.03 = 0.90, cap = 0.10
      expect(e.overCap).toBe(true);
    } finally {
      if (oldCap === undefined) delete process.env.STORYBOARD_BUDGET_CAP;
      else process.env.STORYBOARD_BUDGET_CAP = oldCap;
    }
  });
});
