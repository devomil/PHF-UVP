// Phase 21B (Task #106): NB2 storyboard + seed-image pipeline.
//
// Pipeline per scene:
//   1. Build the prompt with shared/image-prompt-builder (motion-stripped,
//      preset-wrapped) so everything generated for the project shares one
//      art direction.
//   2. Generate 3 NB2 candidates in a single PiAPI call (numImages=3).
//   3. Score each with Claude Vision QA (Haiku 4.5) and pick the highest.
//   4. Persist on the scene's JSONB row:
//         thumbnailUrl       — the winner (drives the storyboard card)
//         seedImageUrl       — the SAME url, kept distinct so omni_reference
//                              can prepend it as @image1 without confusing
//                              it with the cheap Flux Task 61 thumbnail.
//         imageGenerationModel  — 'nano-banana-2' / 'recraft-v4-pro' / 'flux'
//         imageGenerationPrompt — the exact final prompt that was sent
//         imageCandidates    — { url, score, selected, reason }[]
//      Stale-write protected via Task 61's fingerprint pattern.
//
// Provider fallback chain when NB2 fails entirely:
//   nano-banana-2 → recraft-v4-pro (single image, no QA pass)
//                 → flux           (single image, no QA pass)
// Each fallback is logged. The first one that returns a URL wins.

import { db } from '../db';
import { universalVideoProjects } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { nanoBanana2Service, NB2AspectRatio } from './nano-banana2.service';
import { imageGenerationService } from './image-generation-service';
import { scoreImages, VisionScoreResult } from './claude-vision-qa.service';
import { buildSceneImagePrompt } from '../../shared/image-prompt-builder';
import { shouldEnableWebSearch } from '../utils/image-generation-policy';
import { getProjectFromDb } from './video-project-db';
import type { Scene } from '../../shared/video-types';

export interface SceneImageGenerationOptions {
  /** Number of NB2 candidates to generate (1..4). Default 3. */
  numCandidates?: number;
  /** Override the prompt entirely instead of building from scene. */
  promptOverride?: string;
  /** Force a particular fallback provider (used by tests / admin tools). */
  forceProvider?: 'nano-banana-2' | 'recraft-v4-pro' | 'flux';
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

// Fingerprint MUST stay byte-for-byte compatible with Task 61's pattern (used
// by both the client `computeSceneFingerprint` in `client/src/pages/project-detail.tsx`
// and the existing /generate-thumbnail handler). The chosen model is already
// distinguished by `imageGenerationModel` on the scene — encoding it here
// would cause the client's stale-detection to ALWAYS treat NB2 thumbnails as
// stale and auto-trigger a Flux regen that clobbers the storyboard winner.
function buildFingerprint(presetId: string | undefined, basePrompt: string): string {
  return `${presetId || 'auto'}::${basePrompt.substring(0, 80)}`;
}

/**
 * Atomically patch a single scene inside the JSONB `scenes` array, matched
 * by `id`, by deep-merging the partial `patch` into the matching element.
 *
 * This is the safe-under-parallel write primitive. Two concurrent workers
 * patching DIFFERENT scenes will each see the other's prior committed write
 * because the SQL evaluates `jsonb_agg(...)` against the row's CURRENT value
 * inside a single atomic UPDATE — there is no app-land read-then-write
 * window where a stale array can be written back. Workers patching the
 * SAME scene are serialized by Postgres' row-level lock.
 *
 * Returns the number of rows updated (0 if project not found).
 */
async function patchSceneInJsonb(
  projectId: string,
  sceneId: string,
  patch: Record<string, any>
): Promise<number> {
  const patchJson = JSON.stringify(patch);
  const result: any = await db.execute(sql`
    UPDATE universal_video_projects
    SET scenes = COALESCE(
          (SELECT jsonb_agg(
             CASE WHEN s->>'id' = ${sceneId}
                  THEN s || ${patchJson}::jsonb
                  ELSE s
             END
           )
           FROM jsonb_array_elements(scenes) AS s),
          scenes
        ),
        updated_at = NOW()
    WHERE project_id = ${projectId}
  `);
  return typeof result?.rowCount === 'number' ? result.rowCount : 0;
}

async function loadSceneAndPreset(projectId: string, sceneId: string) {
  const projectData = await getProjectFromDb(projectId);
  if (!projectData) return { error: 'Project not found' as const };

  const scenes = (projectData.scenes || []) as Scene[];
  const sceneIndex = scenes.findIndex((s: any) => s.id === sceneId);
  if (sceneIndex === -1) return { error: 'Scene not found' as const };

  const scene: any = scenes[sceneIndex];
  const { getVisualArtPreset } = await import('../../shared/config/visual-art-presets');
  const presetId =
    scene.assignedStyleId ||
    scene.artPresetId ||
    (projectData as any).progress?.artPresetId ||
    (projectData as any).artPresetId;
  const preset = presetId ? getVisualArtPreset(presetId) : null;

  return { projectData, scenes, scene, sceneIndex, preset, presetId };
}

/**
 * Generate one storyboard image for a single scene.
 * Reads the scene fresh from JSONB before writing back; uses Task 61's
 * fingerprint pattern to discard stale-write results.
 */
export async function generateSceneImage(
  projectId: string,
  sceneId: string,
  options: SceneImageGenerationOptions = {}
): Promise<SceneImageGenerationResult> {
  const startedAt = Date.now();
  const loaded = await loadSceneAndPreset(projectId, sceneId);
  if ('error' in loaded) throw new Error(loaded.error);
  const { projectData, scene, sceneIndex, preset, presetId, scenes } = loaded;

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

  const aspectRatio = (projectData as any).outputFormat?.aspectRatio || '16:9';
  const nb2Aspect = aspectRatioToNB2(aspectRatio);
  const visualStyle =
    (projectData as any).settings?.visualStyle ||
    (projectData as any).style ||
    'professional';
  const sceneType = scene.type || scene.contentTag || 'content';

  // Web-search policy is feature-flagged; helper kept so flipping the flag
  // is a one-line change without re-touching this service.
  const wantsWebSearch = shouldEnableWebSearch(visualStyle, sceneType);
  const webSearchEnabled =
    process.env.NB2_WEB_SEARCH_ENABLED === 'true' && wantsWebSearch;
  if (webSearchEnabled) {
    // PiAPI doesn't yet expose this flag in the NB2 task input. The flag
    // is preserved here so the wiring is one line away once verified.
    console.log(`[SceneImage] Scene ${sceneId}: web-search policy fired (gated, no-op until PiAPI surfaces input)`);
  }

  const fingerprint = buildFingerprint(presetId, basePromptSource);

  // Pre-generation idempotency: if the scene already has a thumbnail + seed
  // whose fingerprint matches what we'd produce now, return existing values
  // without spending a single NB2/Recraft/Flux dollar. Skipped when the
  // caller forces a specific provider (explicit re-pay).
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
      model: scene.imageGenerationModel || 'nano-banana-2',
      prompt: scene.imageGenerationPrompt || builtPrompt,
      candidates: scene.imageCandidates || [],
      cost: 0,
      durationMs: Date.now() - startedAt,
      stale: false,
      fingerprint,
    };
  }

  // Resolve brand-reference URLs to feed NB2 as conditioning. Scene-level
  // brandReferences[] takes priority; if none, fall back to project-level
  // productImages so storyboard candidates stay brand-aligned even before
  // a user attaches scene-specific refs.
  const sceneRefs: any[] = Array.isArray((scene as any).brandReferences) ? (scene as any).brandReferences : [];
  const projectProductImages: any[] =
    Array.isArray((projectData as any)?.assets?.productImages)
      ? (projectData as any).assets.productImages
      : [];
  const referenceImageUrls: string[] = sceneRefs.length > 0
    ? sceneRefs
        .map((r: any) => (typeof r?.assetUrl === 'string' ? r.assetUrl : ''))
        .filter((u: string) => u.length > 0)
    : projectProductImages
        .map((p: any) => (typeof p?.url === 'string' ? p.url : ''))
        .filter((u: string) => u.length > 0);
  if (referenceImageUrls.length > 0) {
    console.log(`[SceneImage] scene=${sceneId} brand-refs=${referenceImageUrls.length} (source=${sceneRefs.length > 0 ? 'scene' : 'project'})`);
  }

  // Mark scene as generating BEFORE the NB2 round-trip so the UI can show a
  // spinner. Atomic per-scene patch — safe under parallel workers because
  // `jsonb_agg(...)` evaluates against the row's CURRENT value inside the
  // same UPDATE statement (no app-land read-then-write window).
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
      throw new Error(`All providers failed: ${flErr.message}`);
    }
  }

  // Stale-write protection: re-read scene and bail if prompt/preset changed.
  const fresh = await getProjectFromDb(projectId);
  const freshScenes = (fresh?.scenes || scenes) as Scene[];
  const freshIdx = freshScenes.findIndex((s: any) => s.id === sceneId);
  if (freshIdx === -1) {
    throw new Error('Scene disappeared during image generation');
  }
  const freshScene: any = freshScenes[freshIdx];
  const freshPresetId =
    freshScene.assignedStyleId ||
    freshScene.artPresetId ||
    (fresh as any)?.progress?.artPresetId ||
    (fresh as any)?.artPresetId;
  const freshBasePrompt =
    freshScene.imagePrompt || freshScene.visualDirection || freshScene.narration || '';
  const freshFingerprint = buildFingerprint(freshPresetId, freshBasePrompt.toString());

  const durationMs = Date.now() - startedAt;

  if (fingerprint !== freshFingerprint) {
    console.log(`[SceneImage] Scene ${sceneId}: stale result discarded (style/prompt changed during ${durationMs}ms generation)`);
    return {
      sceneId,
      thumbnailUrl: freshScene.thumbnailUrl || '',
      seedImageUrl: freshScene.seedImageUrl || '',
      model: freshScene.imageGenerationModel || chosenModel,
      prompt: freshScene.imageGenerationPrompt || builtPrompt,
      candidates: freshScene.imageCandidates || candidates,
      cost,
      durationMs,
      stale: true,
      fingerprint: freshFingerprint,
    };
  }

  // Persist winner via atomic per-scene patch (jsonb_agg merge against the
  // row's CURRENT value). Safe under parallel workers — see patchSceneInJsonb.
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

  console.log(
    `[SceneImage] scene=${sceneId} model=${chosenModel} candidates=${candidates.length} ` +
    `qaScores=[${candidates.map(c => c.score.toFixed(2)).join(',')}] ` +
    `selected=${candidates.findIndex(c => c.selected)} cost=$${cost.toFixed(4)} durationMs=${durationMs}`
  );

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

// Cost guardrail: default cap covers ~16 scenes at NB2 3-candidate price.
function getBudgetCap(): number {
  const raw = process.env.STORYBOARD_BUDGET_CAP;
  if (!raw) return 1.5;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1.5;
}

export interface BatchEstimate {
  estimatedCost: number;
  budgetCap: number;
  overCap: boolean;
  scenesToGenerate: number;
  scenesSkipped: number;
}

export function estimateBatchCost(scenes: Scene[], opts: { skipExisting: boolean; numCandidates: number }): BatchEstimate {
  const cap = getBudgetCap();
  let toGen = 0;
  let skipped = 0;
  for (const s of scenes as any[]) {
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
    const err = new Error(
      `Storyboard estimate $${estimate.estimatedCost.toFixed(2)} exceeds cap $${estimate.budgetCap.toFixed(2)}. Pass confirmOverCap=true to proceed.`
    );
    (err as any).code = 'BUDGET_EXCEEDED';
    (err as any).estimate = estimate;
    throw err;
  }

  // Soft warning when within 20% of cap.
  if (estimate.estimatedCost > estimate.budgetCap * 0.8) {
    console.warn(
      `[SceneImage:budget] Estimated cost $${estimate.estimatedCost.toFixed(2)} is within 20% of cap $${estimate.budgetCap.toFixed(2)} (${estimate.scenesToGenerate} scenes × ${numCandidates} candidates)`
    );
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let totalCost = 0;

  // Partition scenes into "skip-now" (no API call) vs "needs-generate".
  const toGenerate: any[] = [];
  for (const scene of scenes as any[]) {
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

  // Concurrency 4 by default. Safe under parallel workers because every
  // scene write goes through `patchSceneInJsonb()`, which uses an atomic
  // `jsonb_agg(...)` UPDATE — there is no app-land read-then-write window
  // where a stale array can be persisted, and Postgres' row lock serializes
  // workers patching the SAME scene. Different scenes can be patched in
  // parallel without losing each other's updates. Bounded so we don't open
  // dozens of NB2 sockets at once or DOS Claude Vision (env override clamped 1..8).
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
      } catch (err: any) {
        failed++;
        console.error(`[SceneImage:batch] Scene ${scene.id} failed: ${err.message}`);
        onProgress?.({ sceneId: scene.id, status: 'failed', error: err.message });
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
