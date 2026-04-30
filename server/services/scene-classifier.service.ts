// Phase 23A: Claude Haiku 4.5 scene render-system classifier.
// Never throws (always returns neutral fallback on error). Atomic per-scene
// writes via patchSceneAtomic. Manual override is sticky (batch skips it).
// Worker-pool concurrency cap (env: SCENE_CLASSIFIER_CONCURRENCY, default 5).

import Anthropic from '@anthropic-ai/sdk';
import { patchSceneAtomic } from './video-project-db';
import {
  RENDER_SYSTEM_TYPES,
  type RenderSystemType,
  type Scene,
} from '../../shared/video-types';

/** Pinned Claude Haiku 4.5 model id (2025-10-01). Exported for tests
 *  (vi.mock asserts the value sent over the wire). */
export const SCENE_CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001' as const;

const MAX_TOKENS = 256;
const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_CONCURRENCY = 5;
/** Approximate cost per scene (Haiku 4.5 in/out at our prompt sizes,
 *  ~Mar 2026 pricing). Used only for batch summary logging. */
const APPROX_COST_PER_SCENE_USD = 0.00025;

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (cachedClient) return cachedClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  cachedClient = new Anthropic({ apiKey: key });
  return cachedClient;
}

/** Test-only escape hatch — vi.resetModules() rebuilds the module so the
 *  cached client is re-evaluated against the current env. Keeping this
 *  documented so future contributors don't accidentally remove the
 *  module-level cache. */
export function __resetClassifierClientForTests(): void {
  cachedClient = null;
}

function readConcurrency(): number {
  const raw = Number(process.env.SCENE_CLASSIFIER_CONCURRENCY);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 20) return Math.floor(raw);
  return DEFAULT_CONCURRENCY;
}

export interface ClassifierInput {
  /** Stable id, used only for log lines. */
  sceneId?: string;
  /** Narrative beat type (hook/cta/etc.) — sent as additional signal. */
  sceneType?: string;
  narration?: string;
  visualDirection?: string;
  /** When present, gives Claude a fuller picture of the rendered scene. */
  imagePrompt?: string;
}

export interface ClassifierResult {
  renderSystemType: RenderSystemType;
  /** 0..1 — model's self-rated confidence. `0` is reserved for the error
   *  fallback so call-sites can detect "never classified" with a single
   *  numeric check. */
  confidence: number;
  /** Short justification (or `Classifier error: ...` on failure). */
  reasoning: string;
}

const SYSTEM_PROMPT = [
  'You are a senior video producer classifying scenes for a multi-pipeline',
  'video renderer. For each scene, pick exactly ONE `renderSystemType` from:',
  '',
  '  ai_video           — live-action / cinematic / lifestyle B-roll. The',
  '                       default for narrative scenes that show people,',
  '                       places, or motion that benefits from a video',
  '                       generator (Seedance / Kling / Veo).',
  '  title_card         — a clean text-forward title screen (chapter title,',
  '                       section break, "Week 1: Foundations", show name,',
  '                       opening credits). Visual direction reads as a',
  '                       typographic still, not a filmed scene.',
  '  infographic        — data visualization: numbered list, comparison,',
  '                       bar/line chart, "X% of people…" stat callout,',
  '                       sugar-vs-protein side-by-side.',
  '  scientific_medical — anatomical / lab / clinical diagrams: blood',
  '                       glucose curves, organ cross-sections, molecular',
  '                       structures, study-result charts.',
  '  brand_environment  — a real-world location prominently featuring the',
  '                       brand: storefront with branded signage, branded',
  '                       packaging on shelf, the clinic/farm/office.',
  '  product_showcase   — the product itself is the hero: hero shot,',
  '                       360-rotation, packaging close-up, ingredient',
  '                       reveal. Different from brand_environment in that',
  '                       the SKU is the subject, not the location.',
  '  ugc_avatar         — talking-head UGC creator looking at camera,',
  '                       phone-recorded testimonial. Use only when the',
  '                       scene explicitly calls for a single person',
  '                       speaking to the camera.',
  '',
  'Reply ONLY with one JSON object on a single line, no prose, no fences:',
  '{"renderSystemType": "<one of the values above>", "confidence": <0..1>,',
  ' "reasoning": "<one short sentence, ≤140 chars>"}',
  '',
  'Scoring guidance:',
  '  confidence ≥ 0.8 — narration AND visual direction unambiguously fit.',
  '  confidence ≈ 0.5 — plausible match with one ambiguity.',
  '  confidence ≤ 0.3 — best guess with weak evidence; editor should review.',
  'When in doubt, prefer ai_video.',
].join('\n');

function buildUserPrompt(input: ClassifierInput): string {
  const lines: string[] = [];
  lines.push('Classify this scene.');
  lines.push('');
  if (input.sceneType) lines.push(`Narrative scene type: ${input.sceneType}`);
  if (input.narration) lines.push(`Narration: ${input.narration.trim()}`);
  if (input.visualDirection) {
    lines.push(`Visual direction: ${input.visualDirection.trim()}`);
  }
  if (input.imagePrompt) {
    lines.push(`Image prompt (already-built): ${input.imagePrompt.trim()}`);
  }
  return lines.join('\n');
}

function neutralFallback(reason: string): ClassifierResult {
  return {
    renderSystemType: 'ai_video',
    confidence: 0,
    reasoning: `Classifier error: ${reason}`.slice(0, 160),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function validateType(raw: unknown, sceneId?: string): RenderSystemType {
  if (typeof raw === 'string' && (RENDER_SYSTEM_TYPES as readonly string[]).includes(raw)) {
    return raw as RenderSystemType;
  }
  console.warn(
    `[Classifier] Unknown renderSystemType "${String(raw)}" for scene ${sceneId || '?'} — falling back to ai_video`,
  );
  return 'ai_video';
}

/**
 * Strip code fences then extract the first balanced `{…}` block before
 * `JSON.parse`. Mirrors the tolerance pattern used in
 * `claude-vision-qa.service.ts` so models that wrap responses in
 * ```json fences``` or trailing prose still parse cleanly.
 */
export function parseClassifierResponse(
  raw: string,
  sceneId?: string,
): ClassifierResult {
  if (typeof raw !== 'string' || !raw.trim()) {
    return neutralFallback('empty model response');
  }
  const stripped = raw
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  // Non-greedy: capture only the FIRST balanced-looking JSON object so a
  // trailing JSON-shaped log line in the model output can't poison the parse.
  const match = stripped.match(/\{[\s\S]*?\}/);
  if (!match) return neutralFallback('no JSON object in response');
  let parsed: { renderSystemType?: unknown; confidence?: unknown; reasoning?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    return neutralFallback(`JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const renderSystemType = validateType(parsed.renderSystemType, sceneId);
  const rawConf = typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence);
  // If the model didn't include confidence at all, default to 0.5 (best
  // guess) rather than 0 — `0` is reserved for the error fallback so
  // call-sites can use it as a "never classified" sentinel.
  const confidence = Number.isFinite(rawConf) ? clamp01(rawConf) : 0.5;
  const reasoning = typeof parsed.reasoning === 'string'
    ? parsed.reasoning.trim().slice(0, 160)
    : 'no reasoning provided';
  return { renderSystemType, confidence, reasoning };
}

/**
 * Classify a single scene. Never throws — returns the neutral fallback
 * on missing key, timeout, parse error, or any SDK error.
 */
export async function classifyScene(
  input: ClassifierInput,
): Promise<ClassifierResult> {
  const startedAt = Date.now();
  const client = getClient();
  if (!client) {
    return neutralFallback('ANTHROPIC_API_KEY missing');
  }

  // Avoid spending on essentially-empty scenes — they always fall back.
  const hasSignal = (input.narration && input.narration.trim().length > 0)
    || (input.visualDirection && input.visualDirection.trim().length > 0)
    || (input.imagePrompt && input.imagePrompt.trim().length > 0);
  if (!hasSignal) {
    return neutralFallback('no narration, visual direction, or image prompt');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await Promise.race([
      client.messages.create(
        {
          model: SCENE_CLASSIFIER_MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserPrompt(input) }],
        },
        { signal: controller.signal },
      ),
      // Belt-and-suspenders: if the AbortController hand-off doesn't
      // resolve the SDK's promise (older SDK versions buffered before
      // honoring abort), the racing timeout still rejects. Same shape as
      // claude-vision-qa.service.ts.
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Scene classifier timed out')), REQUEST_TIMEOUT_MS),
      ),
    ]);

    const block = (response as Anthropic.Messages.Message).content[0];
    const text = block && block.type === 'text' ? block.text : '';
    const result = parseClassifierResponse(text, input.sceneId);
    console.log(
      `[Classifier] ${JSON.stringify({
        sceneId: input.sceneId || '?',
        renderSystemType: result.renderSystemType,
        confidence: Number(result.confidence.toFixed(2)),
        durationMs: Date.now() - startedAt,
      })}`,
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[Classifier] scene=${input.sceneId || '?'} call failed (${msg}) — neutral fallback`,
    );
    return neutralFallback(msg);
  } finally {
    clearTimeout(timer);
  }
}

export interface ClassifyBatchOptions {
  /** When true, classify every scene including those with an existing
   *  classification. `manuallyClassified === true` scenes are STILL
   *  skipped — only the explicit per-scene reclassify endpoint clears
   *  that flag. */
  force?: boolean;
}

export interface ClassifyBatchSummary {
  classified: number;
  skipped: number;
  /** Histogram of `renderSystemType` across all scenes (after this
   *  batch) so the UI can show "5 ai_video, 2 title_card, ..." without
   *  re-fetching the project. */
  distribution: Record<RenderSystemType, number>;
  /** Approximate USD spend for THIS batch (skipped scenes excluded). */
  estimatedCost: number;
  /** Per-scene `patchSceneAtomic` calls that threw or returned rowCount=0.
   *  These scenes are still counted in `classified` (we got a result) but
   *  the result didn't make it to the DB. Surfaced so production
   *  monitoring can alert on systemic write failure instead of silent
   *  loss. */
  writeFailures: number;
  /** Number of scenes whose result is the documented neutral fallback
   *  (`confidence === 0` with reasoning starting `Classifier error:`).
   *  A run where this equals `classified` means EVERY classify call
   *  failed — almost always a missing/expired API key, not "the model
   *  thought the answer was ai_video". */
  fallbackCount: number;
  /** True iff `ANTHROPIC_API_KEY` was unset when the batch started — in
   *  that case `fallbackCount === classified` and zero real classifier
   *  work happened. The route layer can use this to return 200-with-
   *  warning instead of misleading "looks fine" responses. */
  missingKey: boolean;
}

function emptyDistribution(): Record<RenderSystemType, number> {
  const d = {} as Record<RenderSystemType, number>;
  for (const t of RENDER_SYSTEM_TYPES) d[t] = 0;
  return d;
}

function shouldSkip(
  scene: Pick<Scene, 'manuallyClassified' | 'renderSystemType' | 'classifierConfidence'>,
  force: boolean,
): boolean {
  if (scene.manuallyClassified === true) return true;
  if (force) return false;
  // Already classified by a prior batch with non-zero confidence — leave
  // it alone unless the caller explicitly asked to re-do everything.
  if (scene.renderSystemType && (scene.classifierConfidence ?? 0) > 0) {
    return true;
  }
  return false;
}

/**
 * Classify every scene in a project. Writes results atomically per-scene
 * via `patchSceneAtomic` so concurrent edits to other scenes don't lose
 * data. Returns a summary the caller can hand straight back to the
 * client.
 *
 * NEVER throws — all per-scene errors are caught, logged, and replaced
 * with the neutral fallback (still written so the UI shows a confidence
 * of 0 + the reasoning).
 */
export async function classifyProjectScenes(
  projectId: string,
  scenes: Scene[],
  opts: ClassifyBatchOptions = {},
): Promise<ClassifyBatchSummary> {
  const force = !!opts.force;
  const concurrency = readConcurrency();
  const distribution = emptyDistribution();
  let classified = 0;
  let skipped = 0;
  let writeFailures = 0;
  let fallbackCount = 0;
  // Captured at batch start so a key set mid-batch (or unset mid-batch)
  // doesn't lie about what actually happened.
  const missingKey = !process.env.ANTHROPIC_API_KEY;

  // Pre-populate distribution with already-classified scenes so the
  // returned histogram reflects the WHOLE project, not just what this
  // batch touched.
  for (const s of scenes) {
    if (s.renderSystemType && (RENDER_SYSTEM_TYPES as readonly string[]).includes(s.renderSystemType)) {
      distribution[s.renderSystemType] = (distribution[s.renderSystemType] || 0) + 1;
    }
  }

  // Build the work queue: scene + index pairs that need classification.
  const work: Array<{ scene: Scene; idx: number }> = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (shouldSkip(s, force)) {
      skipped++;
      continue;
    }
    work.push({ scene: s, idx: i });
  }

  if (work.length === 0) {
    console.log(
      `[Classifier] project=${projectId} batch=skipped (all ${scenes.length} scenes already classified or manually locked)`,
    );
    return { classified: 0, skipped, distribution, estimatedCost: 0, writeFailures: 0, fallbackCount: 0, missingKey };
  }

  // Rolling worker pool — keeps `concurrency` requests in flight at all
  // times. Same shape as scene-image.service so a slow Haiku call doesn't
  // stall the others in its slice.
  let cursor = 0;
  const workerCount = Math.min(concurrency, work.length);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push((async () => {
      while (true) {
        const myIdx = cursor++;
        if (myIdx >= work.length) return;
        const { scene } = work[myIdx];

        // If the scene already has a prior classification, decrement the
        // distribution for its old type before we overwrite it; we'll add
        // the new type below.
        if (scene.renderSystemType && (RENDER_SYSTEM_TYPES as readonly string[]).includes(scene.renderSystemType)) {
          distribution[scene.renderSystemType] = Math.max(0, (distribution[scene.renderSystemType] || 0) - 1);
        }

        const result = await classifyScene({
          sceneId: scene.id,
          sceneType: scene.type,
          narration: scene.narration,
          visualDirection: scene.visualDirection,
          imagePrompt: (scene as Scene & { imagePrompt?: string }).imagePrompt,
        });

        const patch: Record<string, unknown> = {
          renderSystemType: result.renderSystemType,
          classifierConfidence: result.confidence,
          classifierReasoning: result.reasoning,
          classifiedAt: new Date().toISOString(),
        };

        try {
          const rowCount = await patchSceneAtomic(projectId, scene.id, patch);
          if (rowCount === 0) {
            console.warn(
              `[Classifier] write missed (project gone): projectId=${projectId} sceneId=${scene.id}`,
            );
            writeFailures++;
            // Still count it locally so distribution stays consistent
            // with what the caller asked us to do.
          }
        } catch (err) {
          // patchSceneAtomic in production wraps `db.execute` and could
          // throw on transient connection issues. Log + keep going so
          // a flaky DB doesn't crash the background batch.
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[Classifier] write failed: projectId=${projectId} sceneId=${scene.id} (${msg})`,
          );
          writeFailures++;
        }

        distribution[result.renderSystemType] = (distribution[result.renderSystemType] || 0) + 1;
        classified++;
        if (result.confidence === 0 && result.reasoning.startsWith('Classifier error:')) {
          fallbackCount++;
        }
      }
    })());
  }
  await Promise.all(workers);

  const estimatedCost = Number((classified * APPROX_COST_PER_SCENE_USD).toFixed(5));
  console.log(
    `[Classifier] project=${projectId} batch=complete ${JSON.stringify({
      classified,
      skipped,
      distribution,
      estimatedCost,
      concurrency,
      writeFailures,
      fallbackCount,
      missingKey,
    })}`,
  );
  if (missingKey || (classified > 0 && fallbackCount === classified)) {
    console.warn(
      `[Classifier] project=${projectId} batch produced 100% fallback results (missingKey=${missingKey}, fallbackCount=${fallbackCount}/${classified}) — check ANTHROPIC_API_KEY`,
    );
  }
  if (writeFailures > 0) {
    console.warn(
      `[Classifier] project=${projectId} batch had ${writeFailures} DB write failure(s) — results in memory but not persisted`,
    );
  }
  return { classified, skipped, distribution, estimatedCost, writeFailures, fallbackCount, missingKey };
}

/**
 * Pure helper: build the JSONB patch that the PATCH /scenes/:id route
 * stamps when the client supplies `renderSystemType` (i.e. user clicked
 * the override Select). Kept here — alongside the rest of the classifier
 * field semantics — so the route handler and the unit test for the
 * "manual override" PATCH contract reference the same source of truth.
 *
 * Contract (Phase 23A spec):
 *   manuallyClassified  = true            (sticky; only the per-scene
 *                                          reclassify endpoint clears it)
 *   classifierConfidence = 1.0            (user is certain by definition)
 *   classifierReasoning  = 'Manual override'
 *   classifiedAt         = now (ISO)
 */
export function buildManualOverrideStamp(
  renderSystemType: RenderSystemType,
  now: Date = new Date(),
): {
  renderSystemType: RenderSystemType;
  manuallyClassified: true;
  classifierConfidence: 1.0;
  classifierReasoning: 'Manual override';
  classifiedAt: string;
} {
  return {
    renderSystemType,
    manuallyClassified: true,
    classifierConfidence: 1.0,
    classifierReasoning: 'Manual override',
    classifiedAt: now.toISOString(),
  };
}

/**
 * Re-classify a single scene by id. Always runs (regardless of
 * `manuallyClassified`) and clears the manual-override flag so subsequent
 * batch runs treat it normally again. This is the user explicitly asking
 * the classifier to redo its work.
 */
export async function reclassifySingleScene(
  projectId: string,
  scene: Scene,
): Promise<ClassifierResult> {
  const result = await classifyScene({
    sceneId: scene.id,
    sceneType: scene.type,
    narration: scene.narration,
    visualDirection: scene.visualDirection,
    imagePrompt: (scene as Scene & { imagePrompt?: string }).imagePrompt,
  });

  const patch: Record<string, unknown> = {
    renderSystemType: result.renderSystemType,
    classifierConfidence: result.confidence,
    classifierReasoning: result.reasoning,
    classifiedAt: new Date().toISOString(),
    manuallyClassified: false,
  };

  try {
    const rowCount = await patchSceneAtomic(projectId, scene.id, patch);
    if (rowCount === 0) {
      console.warn(
        `[Classifier] reclassify write missed (project gone): projectId=${projectId} sceneId=${scene.id}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[Classifier] reclassify write failed: projectId=${projectId} sceneId=${scene.id} (${msg})`,
    );
  }
  return result;
}

/**
 * Fire-and-forget hook called from the script-parse / project-create paths.
 * Skips silently when the project has zero narrated scenes (Quick Create
 * / image-only flows share the same writer and shouldn't pay for a
 * useless classify pass).
 *
 * Returns `void`, never rejects — by design.
 */
export function autoClassifyAfterParse(
  projectId: string,
  scenes: Scene[],
): void {
  const hasNarration = scenes.some(
    (s) => typeof s.narration === 'string' && s.narration.trim().length > 0,
  );
  if (!hasNarration) {
    console.log(
      `[Classifier] project=${projectId} auto-classify skipped (no narrated scenes)`,
    );
    return;
  }
  // Wrap in a microtask so the caller's response can flush BEFORE the
  // first Haiku request goes out.
  Promise.resolve()
    .then(() => classifyProjectScenes(projectId, scenes))
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      // classifyProjectScenes catches its own per-scene errors and never
      // throws under normal conditions; this catch is the last line of
      // defence against a programming error escaping into an unhandled
      // promise rejection.
      console.warn(
        `[Classifier] auto-classify hook crashed for project=${projectId}: ${msg}`,
      );
    });
}
