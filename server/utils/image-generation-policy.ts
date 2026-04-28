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
 * When the storyboard pipeline calls Nano Banana 2, should we ask it to
 * ground the generation with a web search?
 *
 * This is a POLICY helper — it returns true when web-search would arguably
 * help (real-world places, branded environments, niche subjects).
 *
 * Phase 21B (Task #107) verification: PiAPI's nano-banana-2 task accepts an
 * `input.enable_web_search` boolean (verified against
 * piapi.ai/docs/gemini-api/nano-banana-2 in March 2026). It defaults to
 * `true` server-side, is part of the documented input schema, and does not
 * carry a separate web-search surcharge — pricing remains the per-image
 * resolution-based rate (1K $0.06, 2K $0.08, 4K $0.12). SLA matches a plain
 * NB2 task (typical completion 10–30s, well within the existing poll loop).
 * The earlier `NB2_WEB_SEARCH_ENABLED` env-var safety gate has been removed;
 * the policy result is now forwarded straight to the NB2 service.
 *
 * Caller pattern (see `scene-image.service.ts`):
 *   enableWebSearch: shouldEnableWebSearch(visualStyle, sceneType)
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
