export interface SceneTextRoutingResult {
  useRecraft: boolean;
  reason: string;
  needsTextInjection: boolean;
  suggestedTextElement?: string;
  // True when the prompt asks for a real brand LOGO (image, not typography).
  // Recraft can't reproduce a PNG logo — these scenes should route to a
  // reference-image-aware provider (Nano Banana 2) and have the brand's
  // actual logo PNG attached as a reference.
  needsLogoComposition?: boolean;
}

const BRAND_NAMES = [
  'origin', 'pine hill farm', 'pine hill', 'bioscan', 'srt',
  'holistic clinic', 'origin holistic',
];

const LOCATION_WORDS = [
  'clinic', 'farm', 'store', 'office', 'practice', 'center', 'centre',
  'studio', 'spa', 'dispensary', 'apothecary',
];

// Words that indicate ENVIRONMENTAL TYPOGRAPHY (Recraft V3 territory).
// Note: "logo" was intentionally REMOVED — a real brand logo is a PNG image
// that Recraft cannot reproduce; those go to Nano Banana 2 with the actual
// logo attached as a reference image.
const VISUAL_TEXT_KEYWORDS = [
  'sign', 'label', 'text', 'title', 'packaging', 'bottle label',
  'banner', 'poster', 'nameplate', 'plaque', 'signage', 'brand',
  'reading', 'written', 'inscribed', 'printed',
];

const LOGO_KEYWORDS = ['logo', 'emblem', 'crest', 'wordmark'];

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

  // Pre-compute signals so we can prioritize narration-brand over generic
  // visual-text keywords (which fire on common words like "title", "label",
  // "reading", "brand" that are cinematography vocabulary, not real signage).
  const visualHasTextKeyword = VISUAL_TEXT_KEYWORDS.some(k => visualDir.includes(k));
  const visualHasLogoKeyword = LOGO_KEYWORDS.some(k => visualDir.includes(k));
  const detectedBrand = BRAND_NAMES.find(name => narration.includes(name));
  const visualMentionsBrand = detectedBrand ? visualDir.includes(detectedBrand) : false;
  const isHardRoute = HARD_ROUTE_SCENE_TYPES.has(sceneType);

  // Logo-in-scene takes precedence over ALL other routing: a real logo PNG
  // belongs on Nano Banana 2 (reference-image conditioning), NOT Recraft —
  // even for CTA / title-card hard-route scenes that normally lock to Recraft.
  if (visualHasLogoKeyword) {
    const reasonPrefix = isHardRoute ? `scene type "${sceneType}" + ` : '';
    return {
      useRecraft: false,
      reason: `${reasonPrefix}visual direction asks for a real brand logo — routing to image-conditioned provider (Nano Banana 2) with logo as reference`,
      needsTextInjection: false,
      needsLogoComposition: true,
    };
  }

  // Strongest signal: narration explicitly names a known brand. Inject a
  // concrete signage element unless the visual direction already names that
  // exact brand (in which case Stage 4 has already specified what to render).
  if (detectedBrand && !visualMentionsBrand) {
    const brandLabel = resolveBrandLabel(detectedBrand);
    const reasonPrefix = isHardRoute ? `scene type "${sceneType}" + ` : '';
    return {
      useRecraft: true,
      reason: `${reasonPrefix}narration references brand "${detectedBrand}" — injecting environmental signage`,
      needsTextInjection: true,
      suggestedTextElement: `A handcrafted wooden sign reading "${brandLabel}" is visible on the wall.`,
    };
  }

  // Hard-route scene types (cta, title_card, etc.) always use Recraft even
  // without brand injection (e.g. CTAs that don't name the brand by accident).
  if (isHardRoute) {
    return {
      useRecraft: true,
      reason: `scene type "${sceneType}" always uses Recraft`,
      needsTextInjection: false,
    };
  }

  if (visualHasTextKeyword) {
    return {
      useRecraft: true,
      reason: 'visual direction contains text/sign keyword',
      needsTextInjection: false,
    };
  }

  // Location words alone are too broad ("growing up on a farm" shouldn't
  // force Recraft). Only route on location when a brand name is also present
  // — otherwise the mention is incidental, not environmental signage.
  const narrationHasLocation = LOCATION_WORDS.some(w => narration.includes(w));
  if (narrationHasLocation) {
    return {
      useRecraft: false,
      reason: 'narration has a location word but no brand name — not enough signal',
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
