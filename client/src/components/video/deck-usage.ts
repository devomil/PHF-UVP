// Shared deck-slide usage helpers (Tasks #195, #198).
//
// Usage state for deck slides is DERIVED, not persisted: for each deck image we
// scan every scene's brandReferences[] (canonical field `assetUrl`, with legacy
// `url`/`imageUrl` fallbacks) and match against the deck image URL. Both the
// project-level overview and the per-scene picker share this logic so they stay
// in lockstep.

export const normUrl = (u?: string | null) => (u || '').trim();

export function refMatchesUrl(ref: any, url: string): boolean {
  const target = normUrl(url);
  if (!target) return false;
  return [ref?.assetUrl, ref?.url, ref?.imageUrl].some((v) => normUrl(v) === target);
}

export function sceneUsesUrl(scene: any, url: string): boolean {
  return (
    Array.isArray(scene?.brandReferences) &&
    scene.brandReferences.some((r: any) => refMatchesUrl(r, url))
  );
}

/** Return the 0-based indices of every scene whose brandReferences anchor `url`. */
export function sceneIndicesUsingUrl(scenes: any[], url: string): number[] {
  const list = Array.isArray(scenes) ? scenes : [];
  return list
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => sceneUsesUrl(s, url))
    .map(({ idx }) => idx);
}
