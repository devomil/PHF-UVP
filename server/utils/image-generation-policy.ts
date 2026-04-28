export function shouldPreferNanoBanana2(
  visualStyle: string,
  sceneContentType: string
): boolean {
  const nb2StrongStyles = ['lifestyle', 'social'];
  if (nb2StrongStyles.includes(visualStyle)) return true;

  const photorealisticTypes = ['lifestyle', 'nature', 'person'];
  if (photorealisticTypes.includes(sceneContentType)) return true;

  return false;
}

export function shouldPreferRecraft(
  visualStyle: string,
  sceneContentType: string
): boolean {
  const recraftStrongStyles = ['product', 'educational'];
  if (recraftStrongStyles.includes(visualStyle)) return true;

  const textHeavyTypes = ['product', 'cta', 'benefit'];
  if (textHeavyTypes.includes(sceneContentType)) return true;

  return false;
}

export function selectImageProvider(
  visualStyle: string,
  sceneContentType: string,
  preferredProviders: string[]
): string {
  if (preferredProviders.length === 0) return 'flux';

  if (shouldPreferRecraft(visualStyle, sceneContentType)) {
    const recraftProvider = preferredProviders.find(p => p.startsWith('recraft-'));
    if (recraftProvider) return recraftProvider;
  }

  if (shouldPreferNanoBanana2(visualStyle, sceneContentType)) {
    if (preferredProviders.includes('nano-banana-2')) return 'nano-banana-2';
  }

  return preferredProviders[0];
}

/**
 * Phase 21B (Task #106): When the storyboard pipeline calls Nano Banana 2,
 * should we ask it to ground the generation with a web search?
 *
 * This is a POLICY helper only — it returns true when web-search would
 * arguably help (real-world places, branded environments, niche subjects).
 * The actual NB2 wiring is feature-flagged behind the
 * `NB2_WEB_SEARCH_ENABLED=true` env var because PiAPI's web-search support
 * has not yet been verified end-to-end and we don't want to silently break
 * generation for everyone if it's unavailable.
 *
 * Caller pattern:
 *   const enable = process.env.NB2_WEB_SEARCH_ENABLED === 'true'
 *     && shouldEnableWebSearch(visualStyle, contentType);
 */
export function shouldEnableWebSearch(
  visualStyle: string,
  sceneContentType: string
): boolean {
  // Real-world / location-grounded subjects benefit from a web pass.
  const groundedStyles = ['lifestyle', 'educational', 'social'];
  if (groundedStyles.includes(visualStyle)) return true;

  // Place / brand / nature scenes typically reference real entities.
  const groundedTypes = ['nature', 'lifestyle', 'place'];
  if (groundedTypes.includes(sceneContentType)) return true;

  return false;
}
