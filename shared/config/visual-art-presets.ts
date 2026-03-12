export interface VisualArtPreset {
  id: string;
  name: string;
  description: string;
  thumbnailColors: [string, string, string];
  imagePromptPrefix: string;
  imagePromptSuffix: string;
  negativePromptAdditions: string[];
  recommendedProviders: {
    image: string[];
    video: string[];
  };
  sceneTypeProviderMap?: Record<string, string[]>;
  generationStrategy: 'i2v' | 't2v' | 'auto';
  globalStyleNotes?: string;
  cameraMotionHints?: string;
  styleMarkerPrefix?: string;
  styleKeywords?: string[];
}

export const STYLIZED_PRESET_IDS = [
  '3d-illustration', 'claymation', '2d-line-art', 'neon-futuristic',
  'watercolor', 'collage', 'minimalist-flat', 'scientific-medical',
] as const;

export function isStylizedPreset(presetId: string | undefined | null): boolean {
  return !!presetId && (STYLIZED_PRESET_IDS as readonly string[]).includes(presetId);
}

export const VISUAL_ART_PRESETS: Record<string, VisualArtPreset> = {
  '3d-illustration': {
    id: '3d-illustration',
    name: '3D Illustration',
    description: 'Pixar-style 3D render with soft lighting, isometric elements, and vibrant colors',
    thumbnailColors: ['#6366f1', '#a855f7', '#ec4899'],
    imagePromptPrefix: '3D rendered illustration, Pixar style, soft global illumination, isometric perspective,',
    imagePromptSuffix: 'vibrant saturated colors, smooth rounded shapes, soft shadows, stylized 3D characters, clay-like textures, ambient occlusion, octane render quality',
    negativePromptAdditions: ['photorealistic', 'flat 2D', 'sketch', 'hand-drawn', 'photograph', 'noisy', 'grainy'],
    recommendedProviders: {
      image: ['flux', 'ideogram'],
      video: ['kling', 'runway'],
    },
    sceneTypeProviderMap: {
      'hook': ['kling-2.1-master', 'sora-2-pro', 'kling-2.6-pro'],
      'hero': ['kling-2.1-master', 'sora-2-pro', 'kling-2.6-pro'],
      'testimonial': ['kling-2.1-master', 'sora-2-pro', 'kling-2.6-pro'],
      'human_subjects': ['kling-2.1-master', 'sora-2-pro', 'kling-2.6-pro'],
      'intro': ['kling-2.6-pro', 'kling-2.6'],
      'solution': ['kling-2.6-pro', 'kling-2.6'],
      'benefit': ['kling-2.6-pro', 'kling-2.6'],
      'explanation': ['kling-2.6-pro', 'kling-2.6'],
      'standard': ['kling-2.6-pro', 'kling-2.6'],
      'problem': ['kling-2.6-pro', 'kling-2.6'],
      'cta': ['kling-2.6-pro', 'kling-2.6'],
      'product': ['kling-2.6-pro', 'kling-2.6'],
      'proof': ['kling-2.6-pro', 'kling-2.6'],
      'broll': ['runway-gen4-aleph', 'kling-2.6'],
      'b-roll': ['runway-gen4-aleph', 'kling-2.6'],
      'atmosphere': ['runway-gen4-aleph', 'kling-2.6'],
      'transition': ['runway-gen4-aleph', 'kling-2.6'],
      'brand': ['runway-gen4-aleph', 'kling-2.6'],
      'motion-control': ['kling-2.6-motion-control-pro', 'kling-2.6-pro'],
    },
    generationStrategy: 'i2v',
    globalStyleNotes: 'Pixar/Disney 3D CGI animation quality • Subsurface skin scattering • Soft cinematic lighting • Shallow depth of field • 4K render • No text, signs, labels, or readable words in the scene • Clean background surfaces suitable for text overlay compositing • Warm, inviting color grading • Characters have expressive, rounded features',
    cameraMotionHints: 'slow push-in, gentle orbit, subtle zoom out',
    styleMarkerPrefix: 'Pixar-style 3D animated',
    styleKeywords: ['pixar', '3d animated', '3d render', '3d cgi'],
  },

  'cinematic-realism': {
    id: 'cinematic-realism',
    name: 'Cinematic Realism',
    description: 'Photorealistic film-grade imagery with natural lighting and cinematic color grading',
    thumbnailColors: ['#1e3a5f', '#d4a373', '#f5e6cc'],
    imagePromptPrefix: 'Photorealistic cinematic shot, film-grade quality, natural lighting,',
    imagePromptSuffix: 'anamorphic lens, shallow depth of field, cinematic color grading, teal and orange tones, 35mm film look, high dynamic range, professional cinematography',
    negativePromptAdditions: ['cartoon', 'illustration', 'anime', '3D render', 'flat', 'oversaturated', 'digital art'],
    recommendedProviders: {
      image: ['flux', 'ideogram'],
      video: ['runway', 'kling', 'luma'],
    },
    generationStrategy: 'auto',
  },

  '2d-line-art': {
    id: '2d-line-art',
    name: '2D Line Art',
    description: 'Clean vector illustration with crisp line drawing aesthetic and flat fills',
    thumbnailColors: ['#f8fafc', '#334155', '#3b82f6'],
    imagePromptPrefix: 'Clean vector illustration, line art style, minimal design,',
    imagePromptSuffix: 'crisp outlines, flat color fills, white background, geometric simplicity, modern graphic design, SVG-like precision, editorial illustration style',
    negativePromptAdditions: ['photorealistic', '3D', 'photograph', 'texture', 'gradient shading', 'complex shadows', 'noisy'],
    recommendedProviders: {
      image: ['ideogram', 'flux'],
      video: ['hailuo', 'kling'],
    },
    generationStrategy: 'i2v',
    globalStyleNotes: '2D line art animation • Clean vector outlines • Flat color fills • White or minimal backgrounds • No photorealistic elements • Bold graphic shapes • Editorial illustration quality',
    cameraMotionHints: 'gentle pan, smooth slide, subtle parallax',
    styleMarkerPrefix: '2D line art animated',
    styleKeywords: ['2d line art', 'line art', 'vector illustration', 'line drawing'],
  },

  collage: {
    id: 'collage',
    name: 'Collage',
    description: 'Mixed media aesthetic with layered textures, paper cutouts, and scrapbook feel',
    thumbnailColors: ['#fbbf24', '#ef4444', '#8b5cf6'],
    imagePromptPrefix: 'Mixed media collage style, layered paper cutouts, textured surfaces,',
    imagePromptSuffix: 'torn paper edges, overlapping elements, scrapbook aesthetic, vintage magazine cutout, tactile paper texture, washi tape accents, stamp-like graphics, analog craft feel',
    negativePromptAdditions: ['photorealistic', 'smooth digital', '3D render', 'clean vector', 'minimal', 'polished'],
    recommendedProviders: {
      image: ['flux', 'ideogram'],
      video: ['hailuo', 'kling'],
    },
    generationStrategy: 'i2v',
    globalStyleNotes: 'Mixed-media collage animation • Torn paper edges and layered textures • Vintage magazine cutout aesthetic • Overlapping elements with depth • Washi tape and stamp accents • Tactile handmade feel • No clean digital look',
    cameraMotionHints: 'slow zoom with parallax layers, gentle drift, paper-shuffle reveal',
    styleMarkerPrefix: 'Mixed-media collage style',
    styleKeywords: ['collage', 'mixed media', 'paper cutout', 'scrapbook'],
  },

  claymation: {
    id: 'claymation',
    name: 'Claymation',
    description: 'Stop-motion clay figure style with tactile miniature sets and handmade charm',
    thumbnailColors: ['#f97316', '#84cc16', '#06b6d4'],
    imagePromptPrefix: 'Claymation stop-motion style, clay figure characters, miniature set,',
    imagePromptSuffix: 'handcrafted clay textures, fingerprint impressions, miniature diorama, plasticine material, warm studio lighting, shallow depth of field, Wallace and Gromit inspired, tactile handmade quality',
    negativePromptAdditions: ['photorealistic', 'digital', 'smooth', '2D flat', 'vector', 'anime', 'photograph'],
    recommendedProviders: {
      image: ['flux', 'ideogram'],
      video: ['kling', 'runway'],
    },
    generationStrategy: 'i2v',
    globalStyleNotes: 'Claymation stop-motion animation • Plasticine/clay material textures • Visible fingerprint impressions • Miniature diorama sets • Warm studio lighting • Shallow depth of field • Wallace and Gromit inspired charm • No digital smoothness',
    cameraMotionHints: 'stop-motion frame steps, slow pan across miniature set, gentle tilt',
    styleMarkerPrefix: 'Claymation stop-motion style',
    styleKeywords: ['claymation', 'clay', 'stop-motion', 'plasticine'],
  },

  'neon-futuristic': {
    id: 'neon-futuristic',
    name: 'Neon Futuristic',
    description: 'Cyberpunk-inspired visuals with holographic UI panels, neon glows, and sci-fi elements',
    thumbnailColors: ['#0f172a', '#00f0ff', '#f500ff'],
    imagePromptPrefix: 'Futuristic cyberpunk scene, neon-lit holographic interface,',
    imagePromptSuffix: 'glowing neon accents, holographic HUD elements, dark background with vibrant neon colors, sci-fi UI panels, volumetric fog, cyan and magenta lighting, Blade Runner aesthetic, digital matrix, high-tech environment',
    negativePromptAdditions: ['natural', 'organic', 'warm tones', 'pastoral', 'vintage', 'rustic', 'handmade'],
    recommendedProviders: {
      image: ['flux', 'ideogram'],
      video: ['runway', 'kling', 'luma'],
    },
    generationStrategy: 't2v',
    globalStyleNotes: 'Neon cyberpunk aesthetic • Holographic HUD elements • Dark backgrounds with vibrant cyan and magenta neon • Volumetric fog and light rays • Blade Runner inspired atmosphere • Glowing particle effects • No natural or organic tones',
    cameraMotionHints: 'slow dolly through neon corridors, hologram rotation, glitch-cut transitions',
    styleMarkerPrefix: 'Neon futuristic cyberpunk style',
    styleKeywords: ['neon', 'cyberpunk', 'futuristic', 'holographic'],
  },

  watercolor: {
    id: 'watercolor',
    name: 'Watercolor',
    description: 'Soft painterly aesthetic with artistic brush strokes and gentle color bleeds',
    thumbnailColors: ['#bfdbfe', '#fbcfe8', '#d9f99d'],
    imagePromptPrefix: 'Watercolor painting style, soft brush strokes, artistic illustration,',
    imagePromptSuffix: 'delicate color washes, paint bleeding on wet paper, visible brush texture, soft edges, pastel tones, fine art watercolor technique, splatter accents, paper grain visible, dreamy atmosphere',
    negativePromptAdditions: ['photorealistic', 'digital', '3D render', 'sharp edges', 'hard lines', 'neon', 'glossy'],
    recommendedProviders: {
      image: ['flux', 'ideogram'],
      video: ['hailuo', 'kling'],
    },
    generationStrategy: 'i2v',
    globalStyleNotes: 'Watercolor painting animation • Visible brush strokes and paint texture • Soft color bleeds on wet paper • Pastel and muted tones • Paper grain visible • Dreamy soft-focus atmosphere • No sharp digital edges',
    cameraMotionHints: 'gentle dissolve, slow paint-reveal wipe, soft drift',
    styleMarkerPrefix: 'Watercolor painted animation style',
    styleKeywords: ['watercolor', 'watercolour', 'painted', 'brush stroke'],
  },

  'minimalist-flat': {
    id: 'minimalist-flat',
    name: 'Minimalist Flat',
    description: 'Clean flat design with geometric shapes, solid colors, and ample negative space',
    thumbnailColors: ['#f1f5f9', '#0ea5e9', '#f43f5e'],
    imagePromptPrefix: 'Minimalist flat design, clean geometric shapes, solid color blocks,',
    imagePromptSuffix: 'ample white space, modern graphic design, bold simple shapes, limited color palette, sans-serif typography feel, Bauhaus inspired, Scandinavian design aesthetic, no texture, crisp edges',
    negativePromptAdditions: ['photorealistic', 'complex', 'detailed texture', '3D', 'gradient', 'busy', 'cluttered', 'ornate'],
    recommendedProviders: {
      image: ['ideogram', 'flux'],
      video: ['hailuo', 'kling'],
    },
    generationStrategy: 'i2v',
    globalStyleNotes: 'Minimalist flat design animation • Clean geometric shapes • Solid color blocks • Ample white/negative space • Bold simple forms • Limited color palette • Bauhaus/Scandinavian aesthetic • No texture or gradients',
    cameraMotionHints: 'smooth geometric transitions, clean slide, shape morph',
    styleMarkerPrefix: 'Minimalist flat design animated',
    styleKeywords: ['minimalist flat', 'flat design', 'geometric', 'minimalist'],
  },

  'scientific-medical': {
    id: 'scientific-medical',
    name: 'Scientific / Medical',
    description: '3D medical visualization with cellular structures, molecular diagrams, and scientific process animations',
    thumbnailColors: ['#0f766e', '#06b6d4', '#a78bfa'],
    imagePromptPrefix: 'Professional 3D medical visualization, scientific illustration, bioluminescent glow,',
    imagePromptSuffix: 'detailed cellular structures, molecular diagrams, anatomical cross-section, volumetric lighting, particle effects, glowing organelles, mitochondria detail, DNA helix, laboratory environment, medical-grade 3D rendering, subsurface scattering, depth of field, dark background with illuminated subjects, scientific accuracy, clean professional look',
    negativePromptAdditions: ['cartoon', 'flat 2D', 'sketch', 'hand-drawn', 'watercolor', 'collage', 'clay', 'low detail', 'blurry text', 'garbled labels'],
    recommendedProviders: {
      image: ['flux', 'ideogram'],
      video: ['wan-2.6', 'kling-2.6'],
    },
    generationStrategy: 'i2v',
    globalStyleNotes: 'Scientific medical 3D visualization • Bioluminescent glow effects • Dark backgrounds with illuminated subjects • Volumetric lighting and particle effects • Cellular/molecular detail • Subsurface scattering • Professional medical-grade rendering',
    cameraMotionHints: 'slow microscopic zoom, cellular fly-through, orbital rotation around molecule',
    styleMarkerPrefix: 'Scientific medical 3D visualization',
    styleKeywords: ['scientific', 'medical', 'cellular', 'molecular', 'bioluminescent'],
  },
};

export type VisualArtPresetId = keyof typeof VISUAL_ART_PRESETS | 'auto';

export function getVisualArtPreset(presetId: string): VisualArtPreset | null {
  return VISUAL_ART_PRESETS[presetId] || null;
}

export function getAllVisualArtPresets(): VisualArtPreset[] {
  return Object.values(VISUAL_ART_PRESETS);
}

export function getVisualArtPresetIds(): string[] {
  return Object.keys(VISUAL_ART_PRESETS);
}
