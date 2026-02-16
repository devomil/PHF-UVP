// shared/visual-style-config.ts - Phase 5B-R: Visual Style System Revision

export interface VisualStyleConfig {
  id: string;
  name: string;
  description: string;
  
  // Provider preferences (order matters - first is most preferred)
  preferredVideoProviders: string[];
  preferredImageProviders: string[];
  
  // Prompt enhancement settings
  promptModifiers: {
    mood: string;
    lighting: string;
    cameraWork: string;
    colorGrade: string;
    pacing: string;
  };
  
  // Content type defaults by scene type
  defaultContentTypes: {
    hook: 'person' | 'product' | 'nature' | 'abstract' | 'lifestyle';
    problem: 'person' | 'product' | 'nature' | 'abstract' | 'lifestyle';
    solution: 'person' | 'product' | 'nature' | 'abstract' | 'lifestyle';
    benefit: 'person' | 'product' | 'nature' | 'abstract' | 'lifestyle';
    cta: 'person' | 'product' | 'nature' | 'abstract' | 'lifestyle';
  };
  
  // Music preferences
  musicStyle: {
    genre: string;
    mood: string;
    tempo: 'slow' | 'medium' | 'fast';
    energy: 'low' | 'medium' | 'high';
  };
  
  // Transition preferences
  transitions: {
    defaultType: 'cut' | 'fade' | 'dissolve' | 'wipe' | 'zoom';
    defaultDuration: number;
  };
  
  // Prompt additions
  stylePromptSuffix: string;
  negativePromptAdditions: string[];
}

export const VISUAL_STYLES: Record<string, VisualStyleConfig> = {
  
  // ============================================
  // HERO (CINEMATIC) - Brand anthems, emotional storytelling
  // ============================================
  hero: {
    id: 'hero',
    name: 'Hero (Cinematic)',
    description: 'Dramatic, film-quality visuals for brand anthems and emotional storytelling',
    
    preferredVideoProviders: ['runway', 'kling', 'luma'],
    preferredImageProviders: ['flux', 'ideogram'],
    
    promptModifiers: {
      mood: 'dramatic, emotional, inspiring, epic',
      lighting: 'cinematic lighting, dramatic shadows, golden hour, volumetric light',
      cameraWork: 'sweeping camera movements, depth of field, wide establishing shots, slow motion',
      colorGrade: 'cinematic color grading, teal and orange, rich contrast, film look',
      pacing: 'deliberate pacing, dramatic pauses, building tension, emotional beats',
    },
    
    defaultContentTypes: {
      hook: 'nature',
      problem: 'person',
      solution: 'lifestyle',
      benefit: 'lifestyle',
      cta: 'person',
    },
    
    musicStyle: {
      genre: 'orchestral cinematic',
      mood: 'epic, emotional, inspiring',
      tempo: 'slow',
      energy: 'high',
    },
    
    transitions: {
      defaultType: 'fade',
      defaultDuration: 1.0,
    },
    
    stylePromptSuffix: 'cinematic quality, film grain, anamorphic lens feel, movie-like production value',
    negativePromptAdditions: ['flat lighting', 'static camera', 'boring composition', 'amateur', 'stock footage feel'],
  },

  // ============================================
  // LIFESTYLE - Customer scenarios, testimonials
  // ============================================
  lifestyle: {
    id: 'lifestyle',
    name: 'Lifestyle',
    description: 'Warm, relatable visuals for customer-facing content and testimonials',
    
    preferredVideoProviders: ['kling', 'runway', 'hailuo'],
    preferredImageProviders: ['flux', 'ideogram'],
    
    promptModifiers: {
      mood: 'warm, authentic, relatable, inviting',
      lighting: 'natural soft lighting, warm tones, window light, golden hour',
      cameraWork: 'steady handheld feel, eye-level angles, intimate framing, natural movement',
      colorGrade: 'warm color palette, natural skin tones, soft contrast',
      pacing: 'conversational pacing, natural rhythm, comfortable flow',
    },
    
    defaultContentTypes: {
      hook: 'person',
      problem: 'person',
      solution: 'lifestyle',
      benefit: 'lifestyle',
      cta: 'person',
    },
    
    musicStyle: {
      genre: 'acoustic folk indie',
      mood: 'warm, hopeful, authentic',
      tempo: 'medium',
      energy: 'medium',
    },
    
    transitions: {
      defaultType: 'dissolve',
      defaultDuration: 0.6,
    },
    
    stylePromptSuffix: 'authentic lifestyle photography, real moments, natural and unposed feel',
    negativePromptAdditions: ['staged', 'corporate', 'clinical', 'cold lighting', 'stock photo feel'],
  },

  // ============================================
  // PRODUCT SHOWCASE - Product reveals, features, I2V
  // ============================================
  product: {
    id: 'product',
    name: 'Product Showcase',
    description: 'Clean, focused visuals for product reveals and feature highlights',
    
    preferredVideoProviders: ['luma', 'runway', 'kling'],
    preferredImageProviders: ['flux', 'ideogram'],
    
    promptModifiers: {
      mood: 'clean, premium, focused, confident',
      lighting: 'studio lighting, soft shadows, product lighting, clean highlights',
      cameraWork: 'smooth orbits, slow reveals, macro details, turntable motion',
      colorGrade: 'clean whites, accurate colors, subtle contrast, premium feel',
      pacing: 'measured reveals, deliberate focus, detail moments',
    },
    
    defaultContentTypes: {
      hook: 'product',
      problem: 'lifestyle',
      solution: 'product',
      benefit: 'product',
      cta: 'product',
    },
    
    musicStyle: {
      genre: 'minimal electronic ambient',
      mood: 'modern, clean, sophisticated',
      tempo: 'slow',
      energy: 'low',
    },
    
    transitions: {
      defaultType: 'fade',
      defaultDuration: 0.8,
    },
    
    stylePromptSuffix: 'product photography, studio quality, clean background, professional commercial',
    negativePromptAdditions: ['cluttered', 'busy background', 'poor lighting', 'amateur product shot'],
  },

  // ============================================
  // EDUCATIONAL - How-to, explainers, health benefits
  // ============================================
  educational: {
    id: 'educational',
    name: 'Educational',
    description: 'Clear, informative visuals for tutorials and health benefit content',
    
    preferredVideoProviders: ['kling', 'hailuo', 'runway'],
    preferredImageProviders: ['flux', 'ideogram'],
    
    promptModifiers: {
      mood: 'clear, trustworthy, informative, helpful',
      lighting: 'bright, even lighting, well-lit, clear visibility',
      cameraWork: 'steady shots, clear framing, demonstration angles, step-by-step views',
      colorGrade: 'natural colors, good contrast, clear and readable',
      pacing: 'instructional pacing, clear beats, time for comprehension',
    },
    
    defaultContentTypes: {
      hook: 'person',
      problem: 'lifestyle',
      solution: 'product',
      benefit: 'lifestyle',
      cta: 'person',
    },
    
    musicStyle: {
      genre: 'light corporate ambient',
      mood: 'friendly, supportive, encouraging',
      tempo: 'medium',
      energy: 'medium',
    },
    
    transitions: {
      defaultType: 'dissolve',
      defaultDuration: 0.5,
    },
    
    stylePromptSuffix: 'educational content, clear demonstration, helpful visual guide',
    negativePromptAdditions: ['confusing', 'cluttered', 'dark', 'unclear', 'distracting background'],
  },

  // ============================================
  // SOCIAL (ENERGETIC) - TikTok/Reels, fast-paced promos
  // ============================================
  social: {
    id: 'social',
    name: 'Social (Energetic)',
    description: 'Fast-paced, attention-grabbing visuals for social media and promos',
    
    preferredVideoProviders: ['hailuo', 'kling', 'runway'],
    preferredImageProviders: ['ideogram', 'flux'],
    
    promptModifiers: {
      mood: 'energetic, exciting, bold, attention-grabbing',
      lighting: 'bright, high-key, punchy, vibrant colors',
      cameraWork: 'dynamic angles, quick movements, trendy shots, POV moments',
      colorGrade: 'saturated colors, high vibrance, bold contrast, pop',
      pacing: 'fast cuts, quick rhythm, punchy timing, scroll-stopping',
    },
    
    defaultContentTypes: {
      hook: 'lifestyle',
      problem: 'person',
      solution: 'product',
      benefit: 'lifestyle',
      cta: 'person',
    },
    
    musicStyle: {
      genre: 'upbeat electronic pop',
      mood: 'energetic, fun, trending',
      tempo: 'fast',
      energy: 'high',
    },
    
    transitions: {
      defaultType: 'cut',
      defaultDuration: 0.2,
    },
    
    stylePromptSuffix: 'social media style, trending aesthetic, scroll-stopping, viral potential',
    negativePromptAdditions: ['boring', 'slow', 'static', 'corporate', 'dated'],
  },

  // ============================================
  // PREMIUM - Luxury positioning, high-end retail
  // ============================================
  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Luxurious, sophisticated visuals for high-end positioning',
    
    preferredVideoProviders: ['runway', 'luma', 'kling'],
    preferredImageProviders: ['flux', 'midjourney'],
    
    promptModifiers: {
      mood: 'luxurious, sophisticated, elegant, exclusive',
      lighting: 'dramatic studio lighting, rim lights, elegant shadows, glamour lighting',
      cameraWork: 'slow, deliberate movements, elegant framing, refined composition',
      colorGrade: 'rich deep tones, subtle desaturation, luxury color palette, refined contrast',
      pacing: 'slow, luxurious pacing, breathing room, elegant timing',
    },
    
    defaultContentTypes: {
      hook: 'abstract',
      problem: 'lifestyle',
      solution: 'product',
      benefit: 'lifestyle',
      cta: 'product',
    },
    
    musicStyle: {
      genre: 'elegant orchestral ambient',
      mood: 'sophisticated, refined, aspirational',
      tempo: 'slow',
      energy: 'medium',
    },
    
    transitions: {
      defaultType: 'fade',
      defaultDuration: 1.2,
    },
    
    stylePromptSuffix: 'luxury brand aesthetic, high-end commercial, premium quality, sophisticated',
    negativePromptAdditions: ['cheap', 'budget', 'amateur', 'cluttered', 'busy', 'garish colors'],
  },
};

// Legacy style mapping for backward compatibility
const LEGACY_STYLE_MAP: Record<string, string> = {
  'professional': 'lifestyle',
  'cinematic': 'hero',
  'energetic': 'social',
  'calm': 'lifestyle',
  'casual': 'lifestyle',
  'documentary': 'educational',
  'luxury': 'premium',
  'minimal': 'product',
  'instructional': 'educational',
  'training': 'educational',
  'warm': 'lifestyle',
};

/**
 * Get visual style configuration by ID
 * Handles legacy style IDs by mapping to new system
 */
export function getVisualStyleConfig(styleId: string): VisualStyleConfig {
  // Check if it's a new style ID
  if (VISUAL_STYLES[styleId]) {
    return VISUAL_STYLES[styleId];
  }
  
  // Check legacy mapping
  const mappedId = LEGACY_STYLE_MAP[styleId.toLowerCase()];
  if (mappedId && VISUAL_STYLES[mappedId]) {
    console.log(`[VisualStyle] Mapped legacy style "${styleId}" to "${mappedId}"`);
    return VISUAL_STYLES[mappedId];
  }
  
  // Default to lifestyle
  console.log(`[VisualStyle] Unknown style "${styleId}", defaulting to "lifestyle"`);
  return VISUAL_STYLES.lifestyle;
}

/**
 * Get all available styles for UI dropdown
 */
export function getAvailableStyles(): Array<{ id: string; name: string; description: string }> {
  return Object.values(VISUAL_STYLES).map(style => ({
    id: style.id,
    name: style.name,
    description: style.description,
  }));
}

/**
 * Apply style modifiers to a base prompt
 */
export function applyStyleToPrompt(basePrompt: string, styleId: string): string {
  const style = getVisualStyleConfig(styleId);
  const modifiers = style.promptModifiers;
  
  const enhancedParts = [
    basePrompt,
    modifiers.mood,
    modifiers.lighting,
    modifiers.cameraWork,
    modifiers.colorGrade,
    style.stylePromptSuffix,
  ].filter(Boolean);
  
  return enhancedParts.join(', ');
}

/**
 * Get negative prompt additions for a style
 */
export function getStyleNegativePrompt(styleId: string): string {
  const style = getVisualStyleConfig(styleId);
  const baseNegatives = [
    'blurry', 'low quality', 'distorted', 'ugly', 'deformed',
    'text overlay', 'watermark', 'logo', 'border', 'frame',
  ];
  
  return [...baseNegatives, ...style.negativePromptAdditions].join(', ');
}

// ============================================
// MUSIC STYLE HELPERS (Phase 5B-R2)
// ============================================

export interface MusicStyleConfig {
  genre: string;
  mood: string;
  tempo: 'slow' | 'medium' | 'fast';
  energy: 'low' | 'medium' | 'high';
  preferredProvider: string;
  promptKeywords: string[];
}

/**
 * Extended music configuration with prompt keywords for each style
 */
export const MUSIC_STYLE_KEYWORDS: Record<string, string[]> = {
  hero: ['cinematic', 'orchestral', 'epic', 'dramatic', 'inspiring', 'film score', 'emotional crescendo'],
  lifestyle: ['acoustic guitar', 'warm', 'organic', 'folk', 'indie', 'hopeful', 'authentic'],
  product: ['minimal', 'electronic', 'ambient', 'clean', 'modern', 'subtle', 'sophisticated'],
  educational: ['friendly', 'light', 'positive', 'background', 'non-distracting', 'supportive'],
  social: ['upbeat', 'energetic', 'pop', 'electronic', 'trending', 'TikTok', 'catchy', 'dynamic'],
  premium: ['elegant', 'sophisticated', 'luxury', 'refined', 'orchestral', 'premium', 'tasteful'],
};

/**
 * Preferred music provider for each visual style
 */
export const MUSIC_PREFERRED_PROVIDERS: Record<string, string> = {
  hero: 'udio',
  lifestyle: 'udio',
  product: 'udio',
  educational: 'udio',
  social: 'suno',
  premium: 'udio',
};

/**
 * Get music style config for a visual style
 */
export function getMusicStyleForVisual(visualStyleId: string): MusicStyleConfig {
  const style = getVisualStyleConfig(visualStyleId);
  const keywords = MUSIC_STYLE_KEYWORDS[style.id] || MUSIC_STYLE_KEYWORDS.lifestyle;
  const preferredProvider = MUSIC_PREFERRED_PROVIDERS[style.id] || 'udio';
  
  return {
    genre: style.musicStyle.genre,
    mood: style.musicStyle.mood,
    tempo: style.musicStyle.tempo,
    energy: style.musicStyle.energy,
    preferredProvider,
    promptKeywords: keywords,
  };
}

/**
 * Mood modifiers that adjust the base music style
 */
export const MOOD_MODIFIERS: Record<string, string[]> = {
  uplifting: ['hopeful', 'positive', 'bright', 'optimistic'],
  calm: ['peaceful', 'relaxed', 'gentle', 'soothing'],
  intense: ['dramatic', 'powerful', 'bold', 'impactful'],
  playful: ['fun', 'lighthearted', 'bouncy', 'cheerful'],
};

/**
 * Apply mood modifier to base prompt
 */
export function applyMoodModifier(basePrompt: string, modifier: string): string {
  const keywords = MOOD_MODIFIERS[modifier];
  if (keywords && keywords.length > 0) {
    return `${basePrompt}, ${keywords.join(', ')}`;
  }
  return basePrompt;
}

/**
 * Build music generation prompt from style config
 */
export function buildMusicPrompt(styleId: string, durationSeconds: number, moodModifier?: string): string {
  const config = getMusicStyleForVisual(styleId);
  
  let prompt = [
    config.genre,
    config.mood,
    `${config.tempo} tempo`,
    `${config.energy} energy`,
    `${durationSeconds} seconds`,
    'instrumental only',
    'no vocals',
    'broadcast quality',
    ...config.promptKeywords.slice(0, 3),
  ].join(', ');
  
  if (moodModifier && moodModifier !== 'default') {
    prompt = applyMoodModifier(prompt, moodModifier);
  }
  
  return prompt;
}
