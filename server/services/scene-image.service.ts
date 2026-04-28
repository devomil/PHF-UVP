// Phase 21B (Task #106): NB2 storyboard + seed-image pipeline.
// Generates NB2 candidates per scene, picks one via Claude Vision QA, and
// persists thumbnail + seed image. Falls back NB2 → Recraft → Flux.

import { nanoBanana2Service, NB2AspectRatio } from './nano-banana2.service';
import { imageGenerationService } from './image-generation-service';
import { scoreImages, VisionScoreResult } from './claude-vision-qa.service';
import { buildSceneImagePrompt } from '../../shared/image-prompt-builder';
import { shouldEnableWebSearch } from '../utils/image-generation-policy';
import { getProjectFromDb, patchSceneAtomic } from './video-project-db';
import type { Scene, VideoProject, BrandReferenceInput } from '../../shared/video-types';

// Scene fields that exist in the JSONB row but are not yet on the Scene
// interface (legacy free-form prompt + product-image refs). Narrow extension
// avoids `any` while keeping the type surface honest.
type SceneWithLegacyFields = Scene & {
  imagePrompt?: string;
  artPresetId?: string;
};

interface ProductImageRef {
  url?: string;
}

export interface SceneImageGenerationOptions {
  /** Number of NB2 candidates to generate (1..4). Default 3. */
  numCandidates?: number;
  /** Override the prompt entirely instead of building from scene. */
  promptOverride?: string;
  /** Force a particular fallback provider (used by tests / admin tools). */
  forceProvider?: 'nano-banana-2' | 'recraft-v4-pro' | 'flux';
}

export interface BatchEstimate {
  estimatedCost: number;
  budgetCap: number;
  overCap: boolean;
  scenesToGenerate: number;
  scenesSkipped: number;
}

/** Error raised when batch cost would exceed the configured budget cap. */
export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED' as const;
  constructor(message: string, public readonly estimate: BatchEstimate) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export interface SceneImageGenerationResult {
  sceneId: string;
  thumbnailUrl: string;
  seedImageUrl: string;
  model: 'nano-banana-2' | 'recraft-v4-pro' | 'flux';
  prompt: string;
  candidates: Array<{ url: string; score: number; selected: boolean; reason?: string }>;
  cost: number;
  durationMs: number;
  /** True if a fresher request had updated the scene before we wrote — our
   *  result was discarded and the existing thumbnail was kept. */
  stale?: boolean;
  fingerprint?: string;
}

export interface BatchProgressEvent {
  sceneId: string;
  status: 'started' | 'complete' | 'skipped' | 'failed';
  thumbnailUrl?: string;
  error?: string;
}

const NB2_COST_PER_IMAGE = 0.03;
const RECRAFT_PRO_COST = 0.08;
const FLUX_COST = 0.003;

function aspectRatioToNB2(ar: string | undefined): NB2AspectRatio {
  switch (ar) {
    case '9:16': return '9:16';
    case '1:1': return '1:1';
    case '4:3': return '4:3';
    case '3:4': return '3:4';
    case '16:9':
    default:
      return '16:9';
  }
}

// Fingerprint must stay byte-for-byte compatible with Task 61's pattern so
// the client's stale-detection (computeSceneFingerprint in project-detail.tsx)
// keeps treating matching NB2 thumbnails as fresh.
function buildFingerprint(presetId: string | undefined, basePrompt: string): string {
  return `${presetId || 'auto'}::${basePrompt.substring(0, 80)}`;
}

// Centralized atomic per-scene merge — see video-project-db.ts (Task #108).
const patchSceneInJsonb = patchSceneAtomic;

// Visual-art preset record loaded by id; typed via the imported helper's
// return so we never need a synthetic `any` here.
type VisualArtPreset = NonNullable<
  Awaited<ReturnType<typeof import('../../shared/config/visual-art-presets').getVisualArtPreset>>
>;

interface LoadedScene {
  projectData: VideoProject;
  scenes: Scene[];
  scene: SceneWithLegacyFields;
  sceneIndex: number;
  preset: VisualArtPreset | null;
  presetId: string | undefined;
}

async function loadSceneAndPreset(
  projectId: string,
  sceneId: string,
): Promise<LoadedScene | { error: 'Project not found' | 'Scene not found' }> {
  const projectData = await getProjectFromDb(projectId);
  if (!projectData) return { error: 'Project not found' };

  const scenes = (projectData.scenes || []) as Scene[];
  const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
  if (sceneIndex === -1) return { error: 'Scene not found' };

  const scene = scenes[sceneIndex] as SceneWithLegacyFields;
  const { getVisualArtPreset } = await import('../../shared/config/visual-art-presets');
  const presetId =
    scene.assignedStyleId ||
    scene.artPresetId ||
    projectData.artPresetId;
  const preset: VisualArtPreset | null = presetId ? (getVisualArtPreset(presetId) ?? null) : null;

  return { projectData, scenes, scene, sceneIndex, preset, presetId };
}

/**
 * Generate one storyboard image for a single scene. Stale-write protected
 * via Task 61's fingerprint pattern; idempotent on fingerprint match.
 */
export async function generateSceneImage(
  projectId: string,
  sceneId: string,
  options: SceneImageGenerationOptions = {}
): Promise<SceneImageGenerationResult> {
  const startedAt = Date.now();
  const loaded = await loadSceneAndPreset(projectId, sceneId);
  if ('error' in loaded) throw new Error(loaded.error);
  const { projectData, scene, preset, presetId, scenes } = loaded;

  const basePromptSource =
    options.promptOverride ||
    scene.imagePrompt ||
    scene.visualDirection ||
    scene.narration ||
    '';
  if (!basePromptSource) {
    throw new Error('Scene has no prompt to render an image from');
  }

  const builtPrompt = options.promptOverride
    ? options.promptOverride
    : buildSceneImagePrompt(scene, { preset });

  if (!builtPrompt) {
    throw new Error('Built image prompt is empty after motion-word stripping');
  }

  const aspectRatio = projectData.outputFormat?.aspectRatio || '16:9';
  const nb2Aspect = aspectRatioToNB2(aspectRatio);
  const visualStyle = preset?.id || presetId || 'professional';
  const sceneType = scene.type || scene.contentTag || 'content';

  // Web-search policy is flag-gated; the helper exists so flipping the flag
  // is a one-line change once PiAPI surfaces the NB2 input.
  const wantsWebSearch = shouldEnableWebSearch(visualStyle, sceneType);
  const webSearchEnabled =
    process.env.NB2_WEB_SEARCH_ENABLED === 'true' && wantsWebSearch;
  if (webSearchEnabled) {
    console.log(`[SceneImage] Scene ${sceneId}: web-search policy fired (gated, no-op until PiAPI surfaces input)`);
  }

  const fingerprint = buildFingerprint(presetId, basePromptSource);

  // Idempotency short-circuit: skip provider spend when the existing thumbnail
  // already matches what we'd produce now. Bypassed by explicit overrides.
  if (
    !options.forceProvider &&
    !options.promptOverride &&
    scene.thumbnailGeneratedFor === fingerprint &&
    scene.thumbnailUrl &&
    scene.seedImageUrl &&
    scene.thumbnailStatus !== 'failed'
  ) {
    console.log(`[SceneImage] scene=${sceneId} fingerprint match — returning cached result (no spend)`);
    return {
      sceneId,
      thumbnailUrl: scene.thumbnailUrl,
      seedImageUrl: scene.seedImageUrl,
      model: (scene.imageGenerationModel === 'flux-1.1-pro' ? 'flux' : scene.imageGenerationModel) || 'nano-banana-2',
      prompt: scene.imageGenerationPrompt || builtPrompt,
      candidates: scene.imageCandidates || [],
      cost: 0,
      durationMs: Date.now() - startedAt,
      stale: false,
      fingerprint,
    };
  }

  // Brand refs: scene-level brandReferences[] takes priority; project-level
  // productImages is the fallback so storyboard runs stay brand-aligned even
  // before users attach scene-specific refs.
  const sceneRefs: BrandReferenceInput[] = Array.isArray(scene.brandReferences) ? scene.brandReferences : [];
  const projectProductImages: ProductImageRef[] =
    Array.isArray(projectData.assets?.productImages)
      ? (projectData.assets.productImages as ProductImageRef[])
      : [];
  const referenceImageUrls: string[] = sceneRefs.length > 0
    ? sceneRefs
        .map((r) => (typeof r?.assetUrl === 'string' ? r.assetUrl : ''))
        .filter((u) => u.length > 0)
    : projectProductImages
        .map((p) => (typeof p?.url === 'string' ? p.url : ''))
        .filter((u) => u.length > 0);
  if (referenceImageUrls.length > 0) {
    console.log(`[SceneImage] scene=${sceneId} brand-refs=${referenceImageUrls.length} (source=${sceneRefs.length > 0 ? 'scene' : 'project'})`);
  }

  // Mark generating before the round-trip so the UI shows a spinner.
  await patchSceneInJsonb(projectId, sceneId, {
    thumbnailStatus: 'generating',
    thumbnailError: null,
  });

  let chosenUrl = '';
  let chosenModel: 'nano-banana-2' | 'recraft-v4-pro' | 'flux' = 'nano-banana-2';
  let candidates: Array<{ url: string; score: number; selected: boolean; reason?: string }> = [];
  let cost = 0;
  let qaScores: VisionScoreResult[] = [];

  const numCandidates = Math.max(1, Math.min(options.numCandidates ?? 3, 4));
  const forceProvider = options.forceProvider;

  // Step 1: NB2 candidates
  if (!forceProvider || forceProvider === 'nano-banana-2') {
    try {
      console.log(`[SceneImage] Scene ${sceneId}: NB2 generating ${numCandidates} candidate(s) | ${nb2Aspect}`);
      const nb2Results = await nanoBanana2Service.generateCandidates(
        {
          prompt: builtPrompt,
          aspectRatio: nb2Aspect,
          format: 'jpeg',
          referenceImages: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        },
        numCandidates
      );

      if (nb2Results.length > 0) {
        cost += nb2Results.length * NB2_COST_PER_IMAGE;
        const urls = nb2Results.map(r => r.imageUrl);

        // Single-candidate fast path: nothing to compare, so skip Anthropic
        // QA spend and assign a perfect score by definition.
        if (urls.length === 1) {
          chosenUrl = urls[0];
          chosenModel = 'nano-banana-2';
          candidates = [{ url: urls[0], score: 1.0, selected: true, reason: 'single-candidate-fast-path' }];
        } else {
          qaScores = await scoreImages(urls, { prompt: builtPrompt, sceneLabel: `${projectId}/${sceneId}` });

          // Pick highest score; stable order on tie (first generated wins).
          let bestIdx = 0;
          for (let i = 1; i < qaScores.length; i++) {
            if (qaScores[i].score > qaScores[bestIdx].score) bestIdx = i;
          }
          chosenUrl = urls[bestIdx];
          chosenModel = 'nano-banana-2';
          candidates = qaScores.map((s, i) => ({
            url: s.url,
            score: s.score,
            selected: i === bestIdx,
            reason: s.reason,
          }));
        }
      }
    } catch (nb2Err: any) {
      console.warn(`[SceneImage] Scene ${sceneId}: NB2 generation failed (${nb2Err.message}) — trying Recraft fallback`);
    }
  }

  // Step 2: Recraft fallback
  if (!chosenUrl && (!forceProvider || forceProvider === 'recraft-v4-pro')) {
    try {
      console.log(`[SceneImage] Scene ${sceneId}: Recraft V4 Pro fallback`);
      const result = await imageGenerationService.generateImage({
        prompt: builtPrompt,
        provider: 'recraft-v4-pro',
        aspectRatio,
        qualityTier: 'premium',
      });
      chosenUrl = result.url;
      chosenModel = 'recraft-v4-pro';
      cost += RECRAFT_PRO_COST;
      candidates = [{ url: result.url, score: 0.5, selected: true, reason: 'recraft-fallback' }];
    } catch (rcErr: any) {
      console.warn(`[SceneImage] Scene ${sceneId}: Recraft fallback failed (${rcErr.message}) — trying Flux`);
    }
  }

  // Step 3: Flux fallback
  if (!chosenUrl) {
    try {
      console.log(`[SceneImage] Scene ${sceneId}: Flux fallback`);
      const result = await imageGenerationService.generateImage({
        prompt: builtPrompt,
        provider: 'flux',
        aspectRatio,
        qualityTier: 'standard',
      });
      chosenUrl = result.url;
      chosenModel = 'flux';
      cost += FLUX_COST;
      candidates = [{ url: result.url, score: 0.5, selected: true, reason: 'flux-fallback' }];
    } catch (flErr: any) {
      // Mark failed and surface the error — atomic per-scene patch.
      await patchSceneInJsonb(projectId, sceneId, {
        thumbnailStatus: 'failed',
        thumbnailError: flErr.message || String(flErr),
      });
      // Structured failure telemetry — same schema as the success log so log
      // aggregators can index on `status` to slice failed vs completed runs.
      console.log('[SceneImage]', JSON.stringify({
        sceneId,
        projectId,
        status: 'failed',
        model: 'none',
        candidateCount: 0,
        qaScores: [],
        selectedIndex: -1,
        cost: Number(cost.toFixed(4)),
        durationMs: Date.now() - startedAt,
        error: flErr.message || String(flErr),
      }));
      throw new Error(`All providers failed: ${flErr.message}`);
    }
  }

  // Stale-write protection: re-read scene and bail if prompt/preset changed.
  const fresh = await getProjectFromDb(projectId);
  const freshScenes = (fresh?.scenes || scenes) as Scene[];
  const freshIdx = freshScenes.findIndex((s) => s.id === sceneId);
  if (freshIdx === -1) {
    throw new Error('Scene disappeared during image generation');
  }
  const freshScene = freshScenes[freshIdx] as SceneWithLegacyFields;
  const freshPresetId =
    freshScene.assignedStyleId ||
    freshScene.artPresetId ||
    fresh?.artPresetId;
  const freshBasePrompt =
    freshScene.imagePrompt || freshScene.visualDirection || freshScene.narration || '';
  const freshFingerprint = buildFingerprint(freshPresetId, freshBasePrompt.toString());

  const durationMs = Date.now() - startedAt;

  if (fingerprint !== freshFingerprint) {
    console.log(`[SceneImage] Scene ${sceneId}: stale result discarded (style/prompt changed during ${durationMs}ms generation)`);
    const freshModel = freshScene.imageGenerationModel === 'flux-1.1-pro'
      ? 'flux'
      : freshScene.imageGenerationModel;
    return {
      sceneId,
      thumbnailUrl: freshScene.thumbnailUrl || '',
      seedImageUrl: freshScene.seedImageUrl || '',
      model: freshModel || chosenModel,
      prompt: freshScene.imageGenerationPrompt || builtPrompt,
      candidates: freshScene.imageCandidates || candidates,
      cost,
      durationMs,
      stale: true,
      fingerprint: freshFingerprint,
    };
  }

  await patchSceneInJsonb(projectId, sceneId, {
    thumbnailUrl: chosenUrl,
    seedImageUrl: chosenUrl,
    imageGenerationModel: chosenModel,
    imageGenerationPrompt: builtPrompt,
    imageCandidates: candidates,
    thumbnailStatus: 'complete',
    thumbnailGeneratedFor: fingerprint,
    thumbnailUpdatedAt: new Date().toISOString(),
    thumbnailError: null,
  });

  // Structured telemetry. Keep keys stable for log aggregators.
  console.log('[SceneImage]', JSON.stringify({
    sceneId,
    projectId,
    model: chosenModel,
    candidateCount: candidates.length,
    qaScores: candidates.map(c => Number(c.score.toFixed(3))),
    selectedIndex: candidates.findIndex(c => c.selected),
    cost: Number(cost.toFixed(4)),
    durationMs,
  }));

  return {
    sceneId,
    thumbnailUrl: chosenUrl,
    seedImageUrl: chosenUrl,
    model: chosenModel,
    prompt: builtPrompt,
    candidates,
    cost,
    durationMs,
    fingerprint,
  };
}

// Default cap covers ~16 scenes at NB2 3-candidate price.
function getBudgetCap(): number {
  const raw = process.env.STORYBOARD_BUDGET_CAP;
  if (!raw) return 1.5;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1.5;
}

export function estimateBatchCost(
  scenes: Scene[],
  opts: { skipExisting: boolean; numCandidates: number },
): BatchEstimate {
  const cap = getBudgetCap();
  let toGen = 0;
  let skipped = 0;
  for (const s of scenes) {
    if (opts.skipExisting && s.thumbnailUrl && s.imageGenerationModel === 'nano-banana-2') {
      skipped++;
    } else {
      toGen++;
    }
  }
  const estimatedCost = toGen * (opts.numCandidates * NB2_COST_PER_IMAGE);
  return {
    estimatedCost,
    budgetCap: cap,
    overCap: estimatedCost > cap,
    scenesToGenerate: toGen,
    scenesSkipped: skipped,
  };
}

export interface BatchOptions extends SceneImageGenerationOptions {
  skipExisting?: boolean;
  confirmOverCap?: boolean;
}

export async function generateAllSceneImages(
  projectId: string,
  options: BatchOptions = {},
  onProgress?: (e: BatchProgressEvent) => void
): Promise<{ generated: number; skipped: number; failed: number; totalCost: number; estimate: BatchEstimate }> {
  const projectData = await getProjectFromDb(projectId);
  if (!projectData) throw new Error('Project not found');

  const scenes = (projectData.scenes || []) as Scene[];
  const numCandidates = Math.max(1, Math.min(options.numCandidates ?? 3, 4));
  const skipExisting = options.skipExisting !== false;
  const estimate = estimateBatchCost(scenes, { skipExisting, numCandidates });

  if (estimate.overCap && !options.confirmOverCap) {
    throw new BudgetExceededError(
      `Storyboard estimate $${estimate.estimatedCost.toFixed(2)} exceeds cap $${estimate.budgetCap.toFixed(2)}. Pass confirmOverCap=true to proceed.`,
      estimate,
    );
  }

  // Soft warning within 20% of cap.
  if (estimate.estimatedCost > estimate.budgetCap * 0.8) {
    console.warn(
      `[SceneImage:budget] Estimated cost $${estimate.estimatedCost.toFixed(2)} is within 20% of cap $${estimate.budgetCap.toFixed(2)} (${estimate.scenesToGenerate} scenes × ${numCandidates} candidates)`
    );
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let totalCost = 0;

  const toGenerate: Scene[] = [];
  for (const scene of scenes) {
    if (
      skipExisting &&
      scene.thumbnailUrl &&
      scene.imageGenerationModel === 'nano-banana-2'
    ) {
      skipped++;
      onProgress?.({ sceneId: scene.id, status: 'skipped' });
    } else {
      toGenerate.push(scene);
    }
  }

  // Concurrency is bounded so we don't open dozens of NB2 sockets or hammer
  // Claude Vision. Env override is clamped 1..8.
  const CONCURRENCY = Math.max(1, Math.min(
    parseInt(process.env.STORYBOARD_BATCH_CONCURRENCY || '4', 10) || 4,
    8,
  ));

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= toGenerate.length) return;
      const scene = toGenerate[idx];
      onProgress?.({ sceneId: scene.id, status: 'started' });
      try {
        const r = await generateSceneImage(projectId, scene.id, { numCandidates });
        totalCost += r.cost;
        if (r.stale) {
          skipped++;
          onProgress?.({ sceneId: scene.id, status: 'skipped' });
        } else {
          generated++;
          onProgress?.({ sceneId: scene.id, status: 'complete', thumbnailUrl: r.thumbnailUrl });
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[SceneImage:batch] Scene ${scene.id} failed: ${msg}`);
        onProgress?.({ sceneId: scene.id, status: 'failed', error: msg });
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, toGenerate.length) },
    () => worker(),
  );
  await Promise.all(workers);

  console.log(`[SceneImage:batch] project=${projectId} concurrency=${CONCURRENCY} generated=${generated} skipped=${skipped} failed=${failed} totalCost=$${totalCost.toFixed(4)}`);

  return { generated, skipped, failed, totalCost, estimate };
}
