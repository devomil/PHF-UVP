// Phase 21B (Task #106): NB2 storyboard + seed-image pipeline.
// Generates NB2 candidates per scene, picks one via Claude Vision QA, and
// persists thumbnail + seed image. Falls back NB2 → Recraft → Flux.

import {
  nanoBanana2Service,
  NB2AspectRatio,
  NB2Resolution,
  NB2_DEFAULT_RESOLUTION,
  getNB2CostPerImage,
} from './nano-banana2.service';
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
  /**
   * Task #111: per-call NB2 output resolution override. When provided,
   * supersedes the `STORYBOARD_NB2_RESOLUTION` env default for both the
   * wire request and the per-image price used in cost telemetry.
   */
  resolution?: NB2Resolution;
}

export interface BatchEstimate {
  estimatedCost: number;
  budgetCap: number;
  overCap: boolean;
  scenesToGenerate: number;
  scenesSkipped: number;
  /** Task #111: resolution tier the estimate was priced against. */
  resolution: NB2Resolution;
  /** Task #111: per-image price used in the estimate. */
  perImageCost: number;
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
  /** Task #112: NB2 output-tier the scene was billed at. Only populated
   *  when the chosen model is `nano-banana-2`; fallback providers leave it
   *  undefined since they're priced flat. */
  nb2Resolution?: NB2Resolution;
}

export interface BatchProgressEvent {
  sceneId: string;
  status: 'started' | 'complete' | 'skipped' | 'failed';
  thumbnailUrl?: string;
  error?: string;
  /** Task #112: USD spent on this scene (NB2 candidates + Vision QA fallback
   *  amortized to the chosen-model line item). Always present on `complete`,
   *  zero on `skipped`/`failed`/`started`. */
  cost?: number;
  /** Task #112: which NB2 tier billed this scene. Only set when the chosen
   *  model is `nano-banana-2`. */
  nb2Resolution?: NB2Resolution;
  /** Task #112: cumulative USD across the batch through this event. */
  cumulativeCost?: number;
  /** Task #112: how many scenes have terminal status (complete + failed +
   *  skipped) through this event. */
  completedCount?: number;
  /** Task #112: how many scenes the batch will attempt total (after the
   *  skip-existing filter). */
  totalToGenerate?: number;
  /** Task #112: pre-flight cost estimate. */
  estimatedCost?: number;
  /** Task #112: configured budget cap (USD). */
  budgetCap?: number;
  /** Task #112: true once `cumulativeCost` crosses 80% of `budgetCap`. */
  nearCap?: boolean;
  /** Task #112: only set when `status === 'skipped'` — distinguishes a
   *  pre-flight "scene already has an NB2 thumbnail, skipExisting=true"
   *  skip (`'plan'`) from an in-flight stale-write skip (`'stale'`). The
   *  former does NOT advance `completedCount`/`totalToGenerate`; the latter
   *  does. Subscribers persisting per-status counters should split on this
   *  field to keep their own denominators consistent. */
  skipReason?: 'plan' | 'stale';
}

// Task #109: NB2 is billed per image by output resolution (1K $0.06, 2K
// $0.08, 4K $0.12 — see `nano-banana2.service`). Storyboards run at 1K by
// default; override via `STORYBOARD_NB2_RESOLUTION=2K|4K`.
const RECRAFT_PRO_COST = 0.08;
const FLUX_COST = 0.003;

/**
 * Resolve the NB2 storyboard resolution tier.
 *
 * Task #111: callers (per-project / per-batch UI) can now override the env
 * default by passing an explicit value. Resolution priority:
 *   1. explicit `override` arg (per-batch / per-project user choice)
 *   2. `STORYBOARD_NB2_RESOLUTION` env var
 *   3. `NB2_DEFAULT_RESOLUTION` (1K)
 */
export function getStoryboardResolution(override?: NB2Resolution | null): NB2Resolution {
  if (override === '1K' || override === '2K' || override === '4K') return override;
  const raw = (process.env.STORYBOARD_NB2_RESOLUTION || '').toUpperCase();
  if (raw === '1K' || raw === '2K' || raw === '4K') return raw;
  return NB2_DEFAULT_RESOLUTION;
}

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

  // Phase 21B (Task #107): PiAPI's nano-banana-2 task accepts an
  // `enable_web_search` boolean (verified against piapi.ai docs Mar 2026 —
  // see `NB2GenerateOptions.enableWebSearch` for pricing/SLA notes). The
  // earlier env-var gate was removed once verification confirmed that the
  // flag is part of the documented input schema with no surcharge. The
  // policy helper now drives behavior directly: grounded scenes get
  // web-grounding ON (matches PiAPI's server-side default), non-grounded
  // scenes get it explicitly OFF to skip an unnecessary search round-trip.
  const enableWebSearch = shouldEnableWebSearch(visualStyle, sceneType);
  if (enableWebSearch) {
    console.log(`[SceneImage] Scene ${sceneId}: web-search ON (style=${visualStyle}, type=${sceneType})`);
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
    const cachedModel =
      (scene.imageGenerationModel === 'flux-1.1-pro' ? 'flux' : scene.imageGenerationModel) || 'nano-banana-2';
    return {
      sceneId,
      thumbnailUrl: scene.thumbnailUrl,
      seedImageUrl: scene.seedImageUrl,
      model: cachedModel,
      prompt: scene.imageGenerationPrompt || builtPrompt,
      candidates: scene.imageCandidates || [],
      cost: 0,
      durationMs: Date.now() - startedAt,
      stale: false,
      fingerprint,
      // Task #112: surface the previously billed NB2 tier (persisted by an
      // earlier successful run) so the UI keeps showing the resolution badge
      // when the cache short-circuit path runs.
      nb2Resolution:
        cachedModel === 'nano-banana-2'
          ? ((scene as Scene & { nb2Resolution?: NB2Resolution }).nb2Resolution)
          : undefined,
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
  // Task #111: resolution priority — per-call override > project setting > env default.
  const nb2Resolution = getStoryboardResolution(
    options.resolution ?? (projectData as any).storyboardResolution ?? null,
  );
  const nb2CostPerImage = getNB2CostPerImage(nb2Resolution);

  // Step 1: NB2 candidates
  if (!forceProvider || forceProvider === 'nano-banana-2') {
    try {
      console.log(`[SceneImage] Scene ${sceneId}: NB2 generating ${numCandidates} candidate(s) | ${nb2Aspect} | ${nb2Resolution}`);
      const nb2Results = await nanoBanana2Service.generateCandidates(
        {
          prompt: builtPrompt,
          aspectRatio: nb2Aspect,
          format: 'jpeg',
          resolution: nb2Resolution,
          referenceImages: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
          enableWebSearch,
        },
        numCandidates
      );

      if (nb2Results.length > 0) {
        cost += nb2Results.length * nb2CostPerImage;
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
      // Task #112: even on stale-discard the spend was real, so the batch
      // total still needs the tier we billed at to label the line item.
      nb2Resolution: chosenModel === 'nano-banana-2' ? nb2Resolution : undefined,
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
    // Task #112: persist the NB2 tier so the UI can show which resolution
    // billed each scene without re-deriving it from the env. Cleared on
    // fallback so a Recraft/Flux run doesn't keep a stale NB2 badge.
    nb2Resolution: chosenModel === 'nano-banana-2' ? nb2Resolution : null,
  });

  // Structured telemetry. Keep keys stable for log aggregators.
  // Task #109: include `nb2Resolution` so spend analytics can join the
  // logged cost back to the resolution-tier price actually invoiced.
  console.log('[SceneImage]', JSON.stringify({
    sceneId,
    projectId,
    model: chosenModel,
    nb2Resolution: chosenModel === 'nano-banana-2' ? nb2Resolution : undefined,
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
    // Task #112: surface the billed NB2 tier on the result envelope so the
    // batch driver can stream it through `BatchProgressEvent.nb2Resolution`.
    nb2Resolution: chosenModel === 'nano-banana-2' ? nb2Resolution : undefined,
  };
}

// Task #109: Default cap covers ~16 scenes × 3 candidates at NB2's 1K
// price ($0.06 / image) = $2.88. We round up to $3.00 so the cap keeps
// representing roughly a 16-scene storyboard run after fixing the
// previously under-counted per-image cost. Callers running 2K/4K
// storyboards should override `STORYBOARD_BUDGET_CAP` accordingly
// (e.g. 2K: ~$3.84, 4K: ~$5.76 for the same 16×3 budget).
const DEFAULT_BUDGET_CAP_USD = 3.0;

function getBudgetCap(): number {
  const raw = process.env.STORYBOARD_BUDGET_CAP;
  if (!raw) return DEFAULT_BUDGET_CAP_USD;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BUDGET_CAP_USD;
}

export function estimateBatchCost(
  scenes: Scene[],
  opts: { skipExisting: boolean; numCandidates: number; resolution?: NB2Resolution | null },
): BatchEstimate {
  const cap = getBudgetCap();
  const resolution = getStoryboardResolution(opts.resolution ?? null);
  const perImageCost = getNB2CostPerImage(resolution);
  let toGen = 0;
  let skipped = 0;
  for (const s of scenes) {
    if (opts.skipExisting && s.thumbnailUrl && s.imageGenerationModel === 'nano-banana-2') {
      skipped++;
    } else {
      toGen++;
    }
  }
  const estimatedCost = toGen * (opts.numCandidates * perImageCost);
  return {
    estimatedCost,
    budgetCap: cap,
    overCap: estimatedCost > cap,
    scenesToGenerate: toGen,
    scenesSkipped: skipped,
    resolution,
    perImageCost,
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
): Promise<{
  generated: number;
  /** Total skip count (planSkipped + runtimeSkipped). Kept for backwards
   *  compatibility — new callers should split on the two fields below
   *  because they answer different questions:
   *    - `planSkipped`    — pre-flight skip (already had an NB2 thumbnail)
   *    - `runtimeSkipped` — in-flight stale-write skip from the worker pool */
  skipped: number;
  /** Task #112: pre-flight plan skips. Equal to `estimate.scenesSkipped`.
   *  Excluded from `completedCount`/`totalToGenerate`. */
  planSkipped: number;
  /** Task #112: runtime stale-write skips emitted by the worker pool.
   *  Counted INTO `completedCount` because the pool started the scene. */
  runtimeSkipped: number;
  failed: number;
  totalCost: number;
  estimate: BatchEstimate;
}> {
  const projectData = await getProjectFromDb(projectId);
  if (!projectData) throw new Error('Project not found');

  const scenes = (projectData.scenes || []) as Scene[];
  const numCandidates = Math.max(1, Math.min(options.numCandidates ?? 3, 4));
  const skipExisting = options.skipExisting !== false;
  // Task #111: per-batch override > project-persisted choice > env default.
  const resolution = getStoryboardResolution(
    options.resolution ?? (projectData as any).storyboardResolution ?? null,
  );
  const estimate = estimateBatchCost(scenes, { skipExisting, numCandidates, resolution });

  if (estimate.overCap && !options.confirmOverCap) {
    throw new BudgetExceededError(
      `Storyboard estimate $${estimate.estimatedCost.toFixed(2)} at ${resolution} exceeds cap $${estimate.budgetCap.toFixed(2)}. Pass confirmOverCap=true to proceed.`,
      estimate,
    );
  }

  // Soft warning within 20% of cap. Task #111: include the chosen tier so
  // operators can see why a 4K run hit the cap faster than the 1K default.
  if (estimate.estimatedCost > estimate.budgetCap * 0.8) {
    console.warn(
      `[SceneImage:budget] Estimated cost $${estimate.estimatedCost.toFixed(2)} at ${resolution} is within 20% of cap $${estimate.budgetCap.toFixed(2)} (${estimate.scenesToGenerate} scenes × ${numCandidates} candidates × $${estimate.perImageCost.toFixed(2)}/image)`
    );
  }

  let generated = 0;
  // Task #112: split skip accounting so the route layer can persist
  // denominator-consistent counters. `planSkipped` mirrors `estimate.scenesSkipped`
  // (pre-flight skip-existing); `runtimeSkipped` only counts stale-write
  // bailouts from inside the worker pool and shares the `totalToGenerate`
  // denominator with `generated`/`failed`.
  let planSkipped = 0;
  let runtimeSkipped = 0;
  let failed = 0;
  let totalCost = 0;

  const toGenerate: Scene[] = [];
  const skippedAtPlan: string[] = [];
  for (const scene of scenes) {
    if (
      skipExisting &&
      scene.thumbnailUrl &&
      scene.imageGenerationModel === 'nano-banana-2'
    ) {
      planSkipped++;
      skippedAtPlan.push(scene.id);
    } else {
      toGenerate.push(scene);
    }
  }

  // Task #112: snapshot the budget context once so every progress event the
  // batch emits can be self-describing (UI doesn't need to reach for the
  // estimate separately).
  const totalToGenerate = toGenerate.length;
  const budgetCap = estimate.budgetCap;
  const estimatedCost = estimate.estimatedCost;
  const nearCapAt = budgetCap * 0.8;
  let nearCapEmitted = false;
  let completedCount = 0;
  // Emit the queued skips AFTER capturing total counts so the receiver sees
  // accurate `totalToGenerate` / `cumulativeCost` from the very first event.
  // Plan-skips intentionally do not advance `completedCount` — the worker
  // pool denominator is `totalToGenerate`, which already excludes them.
  for (const id of skippedAtPlan) {
    onProgress?.({
      sceneId: id,
      status: 'skipped',
      skipReason: 'plan',
      cost: 0,
      cumulativeCost: totalCost,
      completedCount,
      totalToGenerate,
      estimatedCost,
      budgetCap,
      nearCap: false,
    });
  }

  // Concurrency is bounded so we don't open dozens of NB2 sockets or hammer
  // Claude Vision. Env override is clamped 1..8.
  const CONCURRENCY = Math.max(1, Math.min(
    parseInt(process.env.STORYBOARD_BATCH_CONCURRENCY || '4', 10) || 4,
    8,
  ));

  // Helper that decorates every per-scene event with the running batch-level
  // counters so subscribers get a self-contained snapshot per tick.
  const emit = (e: Pick<BatchProgressEvent, 'sceneId' | 'status' | 'thumbnailUrl' | 'error' | 'cost' | 'nb2Resolution' | 'skipReason'>) => {
    const nearCap = budgetCap > 0 && totalCost >= nearCapAt;
    if (nearCap && !nearCapEmitted) {
      nearCapEmitted = true;
      console.warn(
        `[SceneImage:budget] Live spend $${totalCost.toFixed(2)} crossed 80% of cap $${budgetCap.toFixed(2)} (${completedCount}/${totalToGenerate} scenes done)`,
      );
    }
    onProgress?.({
      ...e,
      cumulativeCost: totalCost,
      completedCount,
      totalToGenerate,
      estimatedCost,
      budgetCap,
      nearCap,
    });
  };

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= toGenerate.length) return;
      const scene = toGenerate[idx];
      emit({ sceneId: scene.id, status: 'started', cost: 0 });
      try {
        const r = await generateSceneImage(projectId, scene.id, { numCandidates, resolution });
        totalCost += r.cost;
        completedCount++;
        if (r.stale) {
          runtimeSkipped++;
          emit({
            sceneId: scene.id,
            status: 'skipped',
            skipReason: 'stale',
            cost: r.cost,
            nb2Resolution: r.nb2Resolution,
          });
        } else {
          generated++;
          emit({
            sceneId: scene.id,
            status: 'complete',
            thumbnailUrl: r.thumbnailUrl,
            cost: r.cost,
            nb2Resolution: r.nb2Resolution,
          });
        }
      } catch (err) {
        failed++;
        completedCount++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[SceneImage:batch] Scene ${scene.id} failed: ${msg}`);
        emit({ sceneId: scene.id, status: 'failed', error: msg, cost: 0 });
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, toGenerate.length) },
    () => worker(),
  );
  await Promise.all(workers);

  console.log(`[SceneImage:batch] project=${projectId} resolution=${resolution} concurrency=${CONCURRENCY} generated=${generated} planSkipped=${planSkipped} runtimeSkipped=${runtimeSkipped} failed=${failed} totalCost=$${totalCost.toFixed(4)}`);

  return {
    generated,
    skipped: planSkipped + runtimeSkipped,
    planSkipped,
    runtimeSkipped,
    failed,
    totalCost,
    estimate,
  };
}
