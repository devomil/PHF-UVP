export interface SceneTextRoutingResult {
  useRecraft: boolean;
  reason: string;
  needsTextInjection: boolean;
  suggestedTextElement?: string;
}

const BRAND_NAMES = [
  'origin', 'pine hill farm', 'pine hill', 'bioscan', 'srt',
  'holistic clinic', 'origin holistic',
];

const LOCATION_WORDS = [
  'clinic', 'farm', 'store', 'office', 'practice', 'center', 'centre',
  'studio', 'spa', 'dispensary', 'apothecary',
];

const VISUAL_TEXT_KEYWORDS = [
  'sign', 'logo', 'label', 'text', 'title', 'packaging', 'bottle label',
  'banner', 'poster', 'nameplate', 'plaque', 'signage', 'brand',
  'reading', 'written', 'inscribed', 'printed',
];

const HARD_ROUTE_SCENE_TYPES = new Set([
  'cta',
  'title_card',
  'chapter-title',
  'scientific_medical',
  'infographic',
  'infographic_diagram',
]);

function resolveBrandLabel(detectedKeyword: string): string {
  const BRAND_LABELS: Record<string, string> = {
    'origin':           'ORIGIN HOLISTIC CLINIC',
    'origin holistic':  'ORIGIN HOLISTIC CLINIC',
    'holistic clinic':  'ORIGIN HOLISTIC CLINIC',
    'pine hill farm':   'PINE HILL FARM',
    'pine hill':        'PINE HILL FARM',
    'bioscan':          'ORIGIN HOLISTIC CLINIC',
    'srt':              'ORIGIN HOLISTIC CLINIC',
  };
  return BRAND_LABELS[detectedKeyword] ?? detectedKeyword.toUpperCase();
}

export function evaluateSceneTextRouting(scene: {
  narration?: string;
  visualDirection?: string;
  imagePrompt?: string;
  sceneType?: string;
}): SceneTextRoutingResult {
  const narration = (scene.narration ?? '').toLowerCase();
  const visualDir = (scene.visualDirection ?? scene.imagePrompt ?? '').toLowerCase();
  const sceneType = scene.sceneType ?? '';

  if (HARD_ROUTE_SCENE_TYPES.has(sceneType)) {
    return {
      useRecraft: true,
      reason: `scene type "${sceneType}" always uses Recraft`,
      needsTextInjection: false,
    };
  }

  const visualHasTextKeyword = VISUAL_TEXT_KEYWORDS.some(k => visualDir.includes(k));
  if (visualHasTextKeyword) {
    return {
      useRecraft: true,
      reason: 'visual direction contains text/sign keyword',
      needsTextInjection: false,
    };
  }

  const detectedBrand = BRAND_NAMES.find(name => narration.includes(name));
  if (detectedBrand) {
    const brandLabel = resolveBrandLabel(detectedBrand);
    return {
      useRecraft: true,
      reason: `narration references brand "${detectedBrand}" — injecting environmental signage`,
      needsTextInjection: true,
      suggestedTextElement: `A handcrafted wooden sign reading "${brandLabel}" is visible on the wall.`,
    };
  }

  const narrationHasLocation = LOCATION_WORDS.some(w => narration.includes(w));
  if (narrationHasLocation) {
    return {
      useRecraft: true,
      reason: 'narration references a named location — may contain environmental text',
      needsTextInjection: false,
    };
  }

  return { useRecraft: false, reason: 'no text indicators found', needsTextInjection: false };
}

export function requiresTextAccuracy(scene: {
  sceneType?: string;
  visualStyle?: string;
  prompt?: string;
  videoPrompt?: string;
  imagePrompt?: string;
  narration?: string;
  visualDirection?: string;
}): boolean {
  return evaluateSceneTextRouting({
    narration: scene.narration,
    visualDirection: scene.visualDirection ?? scene.imagePrompt ?? scene.videoPrompt ?? scene.prompt,
    sceneType: scene.sceneType,
  }).useRecraft;
}

export function getRecraftModel(params: {
  needsBrandedText: boolean;
  isPremium: boolean;
}): 'recraftv4' | 'recraftv4_pro' | 'recraftv3' {
  if (params.needsBrandedText) return 'recraftv3';
  if (params.isPremium) return 'recraftv4_pro';
  return 'recraftv4';
}
