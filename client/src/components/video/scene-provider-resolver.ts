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

// Task #137: shared "does this scene have an image attached?" predicate.
// Veo I2V's native-audio toggle requires an image to be present (Veo T2V
// hard-codes generate_audio:false in piapi-video-service.ts), and the
// other Veo I2V controls (cost preview, mode badges) all need the same
// answer. Centralizing this here keeps the toggle, the editor, and any
// future cost preview in lockstep.
//
// We accept a structural shape so both shared/video-types `Scene` and
// the compact `Scene` declared in scene-card.tsx satisfy it without
// requiring `as any` casts at the call sites.
export interface SceneImageShape {
  assets?: {
    imageUrl?: string;
    backgroundUrl?: string;
    [k: string]: unknown;
  };
  // BackgroundConfig.source is the image/video URL when type is
  // 'image' or 'video' (see shared/video-types.ts). It's typed as
  // string (required) on the shared shape but the compact card scene
  // doesn't ship it at all — keep it optional here so both fit.
  background?: {
    type?: string;
    source?: string;
    videoUrl?: string;
    [k: string]: unknown;
  };
  brandAssetUrl?: string;
}

export function sceneHasImage(
  scene: SceneImageShape | null | undefined,
): boolean {
  if (!scene) return false;
  if (scene.assets?.imageUrl) return true;
  if (scene.assets?.backgroundUrl) return true;
  if (scene.brandAssetUrl) return true;
  // background.source is the canonical URL on the shared Scene shape.
  // Only treat it as an image when the background type explicitly says
  // so — otherwise an empty string or a video source could give a
  // false positive.
  if (scene.background?.type === 'image' && scene.background?.source) {
    return true;
  }
  return false;
}
