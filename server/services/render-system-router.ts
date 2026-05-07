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

  const requested: RenderSystemType =
    scene.renderSystemType && (RENDER_SYSTEM_TYPES as readonly string[]).includes(scene.renderSystemType)
      ? scene.renderSystemType
      : 'ai_video';

  const { handler, resolvedFrom, unknownFallback } = resolveHandler(requested);
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
    // Build a failure result + persist `lastRender` for the badge before
    // re-throwing so the worker's existing retry/fail-job logic still
    // owns the lifecycle.
    const failureRecord = buildLastRender({
      requested,
      result: { resolvedHandler: handler.type, success: false, error: msg },
      manuallyClassified: !!scene.manuallyClassified,
      durationMs: Date.now() - startedAt,
      unknownFallback,
    });
    await persistLastRender(projectId, scene.id, failureRecord, jobId);
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
  await persistLastRender(projectId, scene.id, record, jobId);

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
