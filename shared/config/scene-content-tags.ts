export interface SceneContentTag {
  id: string;
  label: string;
  icon: string;
  description: string;
  color: string;
  promptPrefix: string;
  promptSuffix: string;
  negativePromptAdditions: string[];
  recommendedProviders: {
    image: string[];
    video: string[];
  };
}

export const SCENE_CONTENT_TAGS: Record<string, SceneContentTag> = {
  'scientific-medical': {
    id: 'scientific-medical',
    label: 'Scientific / Medical',
    icon: 'flask',
    description: 'Cellular structures, molecular diagrams, anatomical visualizations, and scientific process animations',
    color: '#06b6d4',
    promptPrefix: 'Professional 3D medical visualization, scientific illustration, bioluminescent glow,',
    promptSuffix: 'detailed cellular structures, molecular diagrams, anatomical cross-section, volumetric lighting, particle effects, glowing organelles, mitochondria detail, DNA helix, laboratory environment, medical-grade 3D rendering, subsurface scattering, depth of field, dark background with illuminated subjects, scientific accuracy',
    negativePromptAdditions: ['cartoon', 'flat 2D', 'sketch', 'hand-drawn', 'watercolor', 'collage', 'clay', 'low detail'],
    recommendedProviders: {
      image: ['flux', 'ideogram'],
      video: ['wan-2.6', 'kling-2.6'],
    },
  },

  'lifestyle': {
    id: 'lifestyle',
    label: 'Lifestyle',
    icon: 'sun',
    description: 'Natural, authentic scenes of everyday life, wellness activities, and human moments',
    color: '#f59e0b',
    promptPrefix: 'Authentic lifestyle scene, natural lighting, warm tones,',
    promptSuffix: 'candid moment, soft bokeh background, golden hour lighting, relatable everyday setting, genuine emotion, editorial photography quality',
    negativePromptAdditions: ['artificial', 'overly staged', 'neon', 'sci-fi', 'clinical'],
    recommendedProviders: {
      image: ['flux', 'ideogram'],
      video: ['runway', 'runway-4.5', 'luma'],
    },
  },

  'testimonial': {
    id: 'testimonial',
    label: 'Testimonial',
    icon: 'user',
    description: 'Human-focused scenes ideal for testimonials, interviews, and personal stories',
    color: '#8b5cf6',
    promptPrefix: 'Cinematic portrait shot, professional interview setup, natural skin tones,',
    promptSuffix: 'shallow depth of field, soft key lighting, warm fill light, professional backdrop, subtle color grading, authentic human expression, eye-level framing',
    negativePromptAdditions: ['cartoon', 'illustration', 'anime', 'distorted face', 'uncanny valley', 'extra fingers'],
    recommendedProviders: {
      image: ['flux', 'ideogram'],
      video: ['runway-4.5', 'runway-act-two', 'kling-2.6'],
    },
  },

  'product-showcase': {
    id: 'product-showcase',
    label: 'Product Showcase',
    icon: 'package',
    description: 'Clean product shots, packaging reveals, and branded product displays',
    color: '#10b981',
    promptPrefix: 'Professional product photography, studio lighting setup, clean background,',
    promptSuffix: 'soft shadows, gradient backdrop, precise focus on product details, high-end commercial photography, product hero shot, pristine condition, elegant presentation',
    negativePromptAdditions: ['cluttered', 'messy background', 'low quality', 'blurry', 'distorted text', 'garbled labels'],
    recommendedProviders: {
      image: ['flux', 'ideogram'],
      video: ['kling-2.6', 'runway', 'runway-gen4'],
    },
  },
};

export type SceneContentTagId = keyof typeof SCENE_CONTENT_TAGS;

export function getSceneContentTag(tagId: string): SceneContentTag | null {
  return SCENE_CONTENT_TAGS[tagId] || null;
}

export function getAllSceneContentTags(): SceneContentTag[] {
  return Object.values(SCENE_CONTENT_TAGS);
}

export function getSceneContentTagIds(): string[] {
  return Object.keys(SCENE_CONTENT_TAGS);
}
