// Allowlist + clearable-fields contract for the PATCH
// /projects/:projectId/scenes/:sceneId route. Extracted into its own
// module so the constants can be unit-tested in isolation and so any
// future field addition is visible in one place rather than buried in
// a 14k-line route file.
//
// Server-owned classifier metadata fields (classifierConfidence,
// classifierReasoning, classifiedAt, manuallyClassified) are
// intentionally NOT in this allowlist — they're handled by the
// dedicated override branch and stamped server-side.
//
// `generateNativeAudio` is in the allowlist but NOT in
// clearableFields: only `true` opts in; `false` and `undefined` both
// mean "no native audio", so explicit-null clearing has no semantic
// value beyond setting it to false.

export const SCENE_PATCH_ALLOWED_FIELDS = [
  'narration',
  'visualDirection',
  'duration',
  'type',
  'name',
  'title',
  'searchQuery',
  'keyPoints',
  'overlayItems',
  'microScenes',
  'contentTag',
  'artPresetId',
  'assignedStyleId',
  'textImageEnabled',
  'onScreenText',
  'lowerThird',
  'shotType',
  'cinematicNotes',
  'thumbnailUrl',
  'thumbnailStatus',
  'thumbnailError',
  'thumbnailGeneratedFor',
  'thumbnailUpdatedAt',
  'brandReferences',
  'useOmniReference',
  'seedImageUrl',
  'imageGenerationModel',
  'imageGenerationPrompt',
  'imageCandidates',
  'generateNativeAudio',
  'imageFidelity',
] as const;

export const SCENE_PATCH_CLEARABLE_FIELDS: ReadonlySet<string> = new Set([
  'artPresetId',
  'assignedStyleId',
  'onScreenText',
  'lowerThird',
  'shotType',
  'cinematicNotes',
  'contentTag',
  'thumbnailUrl',
  'thumbnailStatus',
  'thumbnailError',
  'thumbnailGeneratedFor',
  'thumbnailUpdatedAt',
  'brandReferences',
  'seedImageUrl',
  'imageGenerationModel',
  'imageGenerationPrompt',
  'imageCandidates',
  'imageFidelity',
]);

export interface ApplyScenePatchResult {
  /** Field names the patch actually wrote to the scene. */
  applied: string[];
  /** Field names from the patch that the allowlist dropped. */
  ignored: string[];
}

/**
 * Apply the PATCH allowlist + clearable-field rules to a scene in
 * place and report which keys were applied vs ignored. Mirrors the
 * loop in `universal-video-routes.ts` so the route can call this and
 * the contract can be unit-tested without booting the express app.
 */
export function applyScenePatchAllowlist(
  scene: Record<string, unknown>,
  updates: Record<string, unknown>,
): ApplyScenePatchResult {
  const applied: string[] = [];
  const ignored: string[] = [];

  for (const field of SCENE_PATCH_ALLOWED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;

    const value = updates[field];
    if (value === null && SCENE_PATCH_CLEARABLE_FIELDS.has(field)) {
      delete scene[field];
      applied.push(field);
      continue;
    }
    if (value !== undefined) {
      scene[field] = value;
      applied.push(field);
    }
  }

  for (const key of Object.keys(updates)) {
    if (!applied.includes(key)) ignored.push(key);
  }

  return { applied, ignored };
}
