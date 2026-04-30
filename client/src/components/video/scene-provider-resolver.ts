// Single source of truth for resolving "which video provider should
// drive the per-scene controls (duration slider, native-audio toggle,
// cost preview)?" Every scene editor / card / producer surface routes
// its provider lookup through here so the UI can never disagree about
// what model the scene will actually run on.
//
// Resolution order (most specific → most general):
//   1. scene.assets.videoProviderLock — explicit per-scene pin set by
//      the "Pin provider" affordance.
//   2. scene.videoProvider — legacy compact-card alias for the same
//      concept (kept while scene-card still ships its own Scene type).
//   3. projectPreferredProvider — the project-level fallback used when
//      the scene hasn't pinned anything.

export interface SceneProviderShape {
  videoProvider?: string;
  assets?: {
    videoProviderLock?: string | null;
    [k: string]: unknown;
  };
}

export function resolveSceneVideoProvider(
  scene: SceneProviderShape | null | undefined,
  projectPreferredProvider?: string,
): string | undefined {
  return (
    scene?.assets?.videoProviderLock ||
    scene?.videoProvider ||
    projectPreferredProvider ||
    undefined
  );
}
