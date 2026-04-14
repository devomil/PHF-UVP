export function requiresTextAccuracy(scene: {
  sceneType?: string;
  visualStyle?: string;
  prompt?: string;
  videoPrompt?: string;
  imagePrompt?: string;
}): boolean {
  const textHeavySceneTypes = ['scientific_medical', 'title_card', 'infographic'];
  if (scene.sceneType && textHeavySceneTypes.includes(scene.sceneType)) return true;

  const textHeavyStyles = ['product', 'premium', 'educational'];
  if (scene.visualStyle && textHeavyStyles.includes(scene.visualStyle)) {
    const prompt = (scene.imagePrompt ?? scene.videoPrompt ?? scene.prompt ?? '').toLowerCase();
    const textIndicators = [
      'sign', 'label', 'logo', 'text', 'clinic', 'store', 'brand', 'banner',
      'poster', 'package', 'bottle', 'container', 'packaging', 'ingredient',
      'menu', 'price', 'title', 'headline',
    ];
    return textIndicators.some(indicator => prompt.includes(indicator));
  }

  return false;
}

export function getRecraftModel(params: {
  needsBrandedText: boolean;
  isPremium: boolean;
}): 'recraftv4' | 'recraftv4_pro' | 'recraftv3' {
  if (params.needsBrandedText) return 'recraftv3';
  if (params.isPremium) return 'recraftv4_pro';
  return 'recraftv4';
}
