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
