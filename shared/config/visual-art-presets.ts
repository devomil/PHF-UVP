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
  generationStrategy: 'i2v' | 't2v' | 'auto';
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
    generationStrategy: 'i2v',
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
