// Phase 23B (Task #174): handler registration. Imported once at boot
// from `server/routes.ts` so the router has a populated registry by
// the time the worker pulls its first job.

import { registerRenderHandler } from '../render-system-router';
import { aiVideoHandler } from './ai-video.handler';
import { brandEnvironmentHandler } from './brand-environment.handler';
import { productShowcaseHandler } from './product-showcase.handler';
import { titleCardHandler } from './title-card.handler';
import {
  infographicStubHandler,
  scientificMedicalStubHandler,
  ugcAvatarStubHandler,
} from './stub-handlers';

let registered = false;

/** Idempotent — calling twice is a no-op so dev hot-reload doesn't
 *  warn-spam the registry-overwrite log. */
export function registerAllRenderHandlers(): void {
  if (registered) return;
  registered = true;

  registerRenderHandler(aiVideoHandler);
  registerRenderHandler(brandEnvironmentHandler);
  registerRenderHandler(productShowcaseHandler);
  registerRenderHandler(titleCardHandler);
  registerRenderHandler(infographicStubHandler);
  registerRenderHandler(scientificMedicalStubHandler);
  registerRenderHandler(ugcAvatarStubHandler);

  console.log('[RenderRouter] Registered 7 render handlers (4 real + 3 stubs)');
}

export {
  aiVideoHandler,
  brandEnvironmentHandler,
  productShowcaseHandler,
  titleCardHandler,
  infographicStubHandler,
  scientificMedicalStubHandler,
  ugcAvatarStubHandler,
};
