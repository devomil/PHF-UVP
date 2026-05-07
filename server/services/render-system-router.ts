// Phase 23B (Task #174): scene-type → render-system router.
//
// The video-generation worker calls `dispatchRender` instead of
// `aiVideoService.generateVideo` directly. The router:
//   1. Resolves the handler from the registry by `scene.renderSystemType`
//      (defaults to `ai_video` for unknown / missing).
//   2. Awaits the handler.
//   3. Persists a `lastRender` record on the scene via `patchSceneAtomic`
//      (NON-FATAL — log + warn on failure; never block the job).
//   4. Returns the handler's result so the worker can proceed with its
//      existing scene-update / credit-debit / job-status logic.

import type {
  RenderSystemType,
  SceneRenderRecord,
} from '../../shared/video-types';
import { RENDER_SYSTEM_TYPES } from '../../shared/video-types';
import type {
  RenderHandlerContext,
  RenderHandlerResult,
  RenderOptions,
  SceneRenderHandler,
  SceneSnapshot,
} from './render-handlers/types';
import { patchSceneAtomic } from './video-project-db';

const registry: Map<RenderSystemType, SceneRenderHandler> = new Map();

/** Register (or replace) a handler. Logs a warn when an existing
 *  registration is overwritten so a stray double-registration doesn't
 *  go silently. */
export function registerRenderHandler(handler: SceneRenderHandler): void {
  if (registry.has(handler.type)) {
    console.warn(
      `[RenderRouter] Overwriting existing handler for type=${handler.type}`,
    );
  }
  registry.set(handler.type, handler);
}

/** Test-only: clear the registry. Used by unit tests so each test
 *  controls exactly which handlers are present. */
export function __resetRegistryForTests(): void {
  registry.clear();
}

/** Diagnostics — returns the list of registered handler types in
 *  insertion order. Surfaced by the admin diagnostics endpoint. */
export function getRegisteredHandlerTypes(): RenderSystemType[] {
  return Array.from(registry.keys());
}

/** Diagnostics — list of declared types that have NO handler yet.
 *  Surfaced by the admin diagnostics endpoint so ops can see at a
 *  glance which Phase 24A / 24B / 25 / 27 work is still pending. */
export function getMissingHandlerTypes(): RenderSystemType[] {
  return RENDER_SYSTEM_TYPES.filter((t) => !registry.has(t));
}

/** Reports availability for the editor preview-chip endpoint. Real
 *  handlers default to true; stub handlers explicitly return false via
 *  their own `isAvailable()` override. */
export function getHandlerAvailability(): Array<{
  type: RenderSystemType;
  registered: boolean;
  available: boolean;
}> {
  return RENDER_SYSTEM_TYPES.map((type) => {
    const h = registry.get(type);
    if (!h) return { type, registered: false, available: false };
    const available = typeof h.isAvailable === 'function' ? h.isAvailable() : true;
    return { type, registered: true, available };
  });
}

// ─── Decision ring buffer ─────────────────────────────────────────────
// Keeps the last N dispatch decisions in memory so the admin diagnostics
// endpoint can show "what happened recently". Bounded so a busy worker
// doesn't grow unbounded heap; ops can rerun the endpoint to refresh.
interface DecisionRecord {
  timestamp: string;
  jobId: string;
  projectId: string;
  sceneId: string;
  requested: RenderSystemType;
  resolved: RenderSystemType;
  fallbackReason?: string;
  durationMs: number;
  success: boolean;
}
const DECISION_BUFFER_CAP = 100;
const decisionBuffer: DecisionRecord[] = [];
function recordDecision(d: DecisionRecord): void {
  decisionBuffer.push(d);
  if (decisionBuffer.length > DECISION_BUFFER_CAP) {
    decisionBuffer.splice(0, decisionBuffer.length - DECISION_BUFFER_CAP);
  }
}
export function getRecentDecisions(): DecisionRecord[] {
  // Return a copy in newest-first order so callers don't accidentally
  // mutate the buffer.
  return decisionBuffer.slice().reverse();
}
export function __resetDecisionsForTests(): void {
  decisionBuffer.length = 0;
}

function resolveHandler(rst: RenderSystemType | undefined): {
  handler: SceneRenderHandler;
  resolvedFrom: RenderSystemType;
  unknownFallback: boolean;
} {
  if (rst && registry.has(rst)) {
    return { handler: registry.get(rst)!, resolvedFrom: rst, unknownFallback: false };
  }
  const fallback = registry.get('ai_video');
  if (!fallback) {
    throw new Error(
      `[RenderRouter] No handler registered for "${rst ?? 'undefined'}" and no ai_video fallback. ` +
        `Did registerAllRenderHandlers() run at boot?`,
    );
  }
  return {
    handler: fallback,
    resolvedFrom: 'ai_video',
    unknownFallback: !!rst, // true only when caller asked for a known-but-unregistered type
  };
}

export interface DispatchRenderArgs {
  scene: SceneSnapshot;
  projectId: string;
  sceneId: string;
  jobId: string;
  options: RenderOptions;
}

/** Main entry — called from the video-generation worker in place of
 *  the direct `aiVideoService.generateVideo` call. */
export async function dispatchRender(
  args: DispatchRenderArgs,
): Promise<RenderHandlerResult> {
  const { scene, projectId, sceneId, jobId, options } = args;

  // Type guard against an arbitrary string slipping through. Also: when
  // the classifier failed and stamped `classifierConfidence === 0`, do
  // NOT trust the type field — fall through to ai_video. The classifier
  // service uses confidence=0 as its documented "I errored, ignore me"
  // sentinel.
  let requested: RenderSystemType =
    scene.renderSystemType && (RENDER_SYSTEM_TYPES as readonly string[]).includes(scene.renderSystemType)
      ? (scene.renderSystemType as RenderSystemType)
      : 'ai_video';
  let classifierErrorPassthrough = false;
  if (scene.classifierConfidence === 0 && !scene.manuallyClassified && requested !== 'ai_video') {
    console.log(
      `[RenderRouter] job=${jobId} scene=${sceneId} classifierConfidence=0 (classifier errored) — passthrough to ai_video`,
    );
    classifierErrorPassthrough = true;
    requested = 'ai_video';
  }

  const { handler, unknownFallback } = resolveHandler(requested);
  const ctx: RenderHandlerContext = { projectId, sceneId, jobId, scene };

  console.log(
    `[RenderRouter] job=${jobId} scene=${sceneId} requested=${requested} handler=${handler.type}${unknownFallback ? ' (unknown-type fallback)' : ''}`,
  );

  const startedAt = Date.now();
  let result: RenderHandlerResult;
  try {
    result = await handler.render(options, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[RenderRouter] job=${jobId} scene=${sceneId} handler=${handler.type} threw: ${msg}`,
    );
    // Per spec: persist `lastRender` only on the success path. On throw
    // we just record the decision in the ring buffer + re-throw so the
    // worker's existing retry/fail-job lifecycle owns the failure write.
    recordDecision({
      timestamp: new Date().toISOString(),
      jobId,
      projectId,
      sceneId,
      requested,
      resolved: handler.type,
      fallbackReason: `handler-throw: ${msg}`,
      durationMs: Date.now() - startedAt,
      success: false,
    });
    throw err;
  }

  // If the registry resolved an unknown type to ai_video, stamp a
  // synthetic fallback record so the UI can flag it.
  if (unknownFallback && !result.fallback) {
    result = {
      ...result,
      fallback: {
        from: requested,
        to: 'ai_video',
        reason: `No handler registered for "${requested}" — used ai_video fallback`,
      },
      resolvedHandler: 'ai_video',
    };
  }

  const record = buildLastRender({
    requested,
    result,
    manuallyClassified: !!scene.manuallyClassified,
    durationMs: Date.now() - startedAt,
    unknownFallback,
  });
  if (result.success !== false) {
    await persistLastRender(projectId, scene.id, record, jobId);
  }
  recordDecision({
    timestamp: record.renderedAt,
    jobId,
    projectId,
    sceneId,
    requested,
    resolved: result.resolvedHandler,
    fallbackReason: classifierErrorPassthrough
      ? 'classifierConfidence=0 passthrough'
      : result.fallback?.reason,
    durationMs: record.durationMs ?? 0,
    success: result.success !== false,
  });

  return result;
}

interface BuildLastRenderArgs {
  requested: RenderSystemType;
  result: Pick<RenderHandlerResult, 'resolvedHandler' | 'success' | 'videoUrl' | 's3Url' | 'provider' | 'cost' | 'error' | 'fallback'>;
  manuallyClassified: boolean;
  durationMs: number;
  unknownFallback: boolean;
}

export function buildLastRender(args: BuildLastRenderArgs): SceneRenderRecord {
  const { requested, result, manuallyClassified, durationMs } = args;
  const fallback = result.fallback;
  const manualClassifiedFallback = manuallyClassified && !!fallback;

  const record: SceneRenderRecord = {
    renderSystemType: requested,
    resolvedHandler: result.resolvedHandler,
    renderedAt: new Date().toISOString(),
    durationMs,
  };
  if (fallback) record.fallback = fallback;
  if (manualClassifiedFallback) record.manualClassifiedFallback = true;
  if (result.provider) record.provider = result.provider;
  const url = result.videoUrl ?? result.s3Url;
  if (url) record.videoUrl = url;
  if (result.error) record.error = result.error;
  return record;
}

async function persistLastRender(
  projectId: string,
  sceneId: string,
  record: SceneRenderRecord,
  jobId: string,
): Promise<void> {
  // The micro-scene id format `<sceneId>__micro_<n>` doesn't have its own
  // top-level row — the router's lastRender lives on the parent scene.
  // Trim the suffix so the atomic patch hits the right scene.
  const realSceneId = sceneId.includes('__micro_')
    ? sceneId.split('__micro_')[0]
    : sceneId;
  try {
    const rowCount = await patchSceneAtomic(projectId, realSceneId, {
      lastRender: record,
    });
    if (rowCount === 0) {
      console.warn(
        `[Worker] lastRender write skipped (project gone): job=${jobId} project=${projectId} scene=${realSceneId}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[Worker] lastRender write failed (non-fatal): job=${jobId} project=${projectId} scene=${realSceneId} (${msg})`,
    );
  }
}
