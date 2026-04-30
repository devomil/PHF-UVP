// Phase 23A (Task #118): scene-classifier route handlers, extracted into
// their own module so they can be mounted in unit tests with supertest
// (the parent `universal-video-routes.ts` is a 14k-line file with 30+
// heavy imports that's not practical to spin up in a test).
//
// The two routes here are:
//   POST /projects/:projectId/classify-scenes        — batch classify
//   POST /projects/:projectId/scenes/:sceneId/classify — per-scene reclassify
//
// Both keep their auth + ownership + body-validation contracts identical
// to the in-line versions they replaced, and they delegate the actual
// classifier logic to `scene-classifier.service.ts` (which has its own
// unit tests covering skip rules, force, the rowCount=0 logging path,
// the missing-key warning, and the per-scene clear-manuallyClassified
// behavior). The route tests focus on the wiring: status codes, body
// validation, ownership, and the response shape.

import type { Router, Request, Response, RequestHandler } from 'express';
import type { Scene } from '../../shared/video-types';
import {
  classifyProjectScenes,
  reclassifySingleScene,
} from './scene-classifier.service';

/** Minimal project shape this module needs from the DB. We only read
 *  `ownerId` (for ownership) and `scenes` (passed straight through to
 *  the classifier service). Anything else is ignored. */
export interface ClassifierRoutesProject {
  ownerId?: string | null;
  scenes?: Scene[];
}

/** Dependency contract — passed in so tests can stub the DB lookup
 *  without mocking the entire `video-project-db` module. The real
 *  caller (`universal-video-routes.ts`) just hands in the existing
 *  `getProjectFromDb` function. */
export interface ClassifierRoutesDeps {
  isAuthenticated: RequestHandler;
  getProjectFromDb: (projectId: string) => Promise<ClassifierRoutesProject | null | undefined>;
}

/**
 * Register both classify routes on the supplied router. Path prefixes
 * here are RELATIVE to whatever the router is mounted at (the production
 * router is mounted at the universal-video-routes prefix; tests can
 * mount it at `/api/test`).
 */
export function registerSceneClassifierRoutes(
  router: Router,
  deps: ClassifierRoutesDeps,
): void {
  const { isAuthenticated, getProjectFromDb } = deps;

  // POST /projects/:projectId/classify-scenes
  // Batch-classify every scene in a project. Skip rule (handled inside
  // the service): scenes with `manuallyClassified: true` are always
  // skipped; scenes with an existing `renderSystemType` and
  // `classifierConfidence > 0` are skipped unless the request body sets
  // `force: true`.
  router.post(
    '/projects/:projectId/classify-scenes',
    isAuthenticated,
    async (req: Request<{ projectId: string }>, res: Response) => {
      try {
        const userId = (req.user as { id?: string } | undefined)?.id;
        const { projectId } = req.params;

        // Strict request validation — typo'd body field returns 400 so
        // the client can't accidentally send `{ forced: true }` and
        // silently get skip-only behavior.
        const body: Record<string, unknown> =
          req.body && typeof req.body === 'object' ? req.body : {};
        const allowedKeys = new Set(['force']);
        for (const key of Object.keys(body)) {
          if (!allowedKeys.has(key)) {
            return res.status(400).json({
              success: false,
              error: `Unknown field: ${key}. Allowed: ${[...allowedKeys].join(', ')}`,
            });
          }
        }
        const force = body.force === true;

        const projectData = await getProjectFromDb(projectId);
        if (!projectData) {
          return res.status(404).json({ success: false, error: 'Project not found' });
        }
        if (projectData.ownerId !== userId) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const scenes = (projectData.scenes || []) as Scene[];
        const summary = await classifyProjectScenes(projectId, scenes, { force });
        return res.json({ success: true, ...summary });
      } catch (error: unknown) {
        // classifyProjectScenes is documented as never-throw, but guard
        // the route anyway so a programming error in a refactor doesn't
        // surface as a 500 to the user.
        console.error('[ClassifyScenes] Unexpected error:', error);
        const message = error instanceof Error ? error.message : 'Failed to classify scenes';
        return res.status(500).json({ success: false, error: message });
      }
    },
  );

  // POST /projects/:projectId/scenes/:sceneId/classify
  // Per-scene reclassify — always runs, regardless of
  // `manuallyClassified`, and CLEARS the manual flag (the user is
  // explicitly asking the classifier to redo its work).
  router.post(
    '/projects/:projectId/scenes/:sceneId/classify',
    isAuthenticated,
    async (req: Request<{ projectId: string; sceneId: string }>, res: Response) => {
      try {
        const userId = (req.user as { id?: string } | undefined)?.id;
        const { projectId, sceneId } = req.params;

        // Body must be empty or `{}` — same strict-validation pattern
        // Task #111 used. Reject typo'd fields so callers don't think
        // they're passing useful options.
        const body: Record<string, unknown> =
          req.body && typeof req.body === 'object' ? req.body : {};
        if (Object.keys(body).length > 0) {
          return res.status(400).json({
            success: false,
            error: `This endpoint takes no body fields. Got: ${Object.keys(body).join(', ')}`,
          });
        }

        const projectData = await getProjectFromDb(projectId);
        if (!projectData) {
          return res.status(404).json({ success: false, error: 'Project not found' });
        }
        if (projectData.ownerId !== userId) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const scenes = (projectData.scenes || []) as Scene[];
        const scene = scenes.find((s) => s.id === sceneId);
        if (!scene) {
          return res.status(404).json({ success: false, error: 'Scene not found' });
        }

        const result = await reclassifySingleScene(projectId, scene);
        return res.json({
          success: true,
          sceneId,
          renderSystemType: result.renderSystemType,
          classifierConfidence: result.confidence,
          classifierReasoning: result.reasoning,
        });
      } catch (error: unknown) {
        console.error('[ClassifyScene] Unexpected error:', error);
        const message = error instanceof Error ? error.message : 'Failed to classify scene';
        return res.status(500).json({ success: false, error: message });
      }
    },
  );
}
