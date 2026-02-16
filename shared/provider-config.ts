// shared/provider-config.ts - Provider Registry for Selection Logic
//
// This file provides simplified provider information for the video-provider-selector.
// It's used by: video-provider-selector.ts, universal-video-routes.ts, image-provider-selector.ts
//
// RELATED FILES:
// - server/config/video-providers.ts: Detailed provider capabilities (modelId, apiProvider, capabilities object)
// - server/config/ai-video-providers.ts: API-level configuration for actual PiAPI calls
//
// When adding new providers, update BOTH this file AND server/config/video-providers.ts
// to keep them in sync.

export interface VideoProvider {
  id: string;
  name: string;
  displayName: string;
  costPerSecond: number;
  maxDuration: number;
  strengths: string[];
  weaknesses: string[];
  bestFor: string[];
  family?: string;
  tier?: 'premium' | 'standard' | 'budget';
  specialization?: string;
}

export const VIDEO_PROVIDERS: Record<string, VideoProvider> = {
  // Runway Family
  runway: {
    id: 'runway',
    name: 'runway',
    displayName: 'Runway Gen-3',
    costPerSecond: 0.05,
    maxDuration: 10,
    family: 'runway',
    tier: 'premium',
    strengths: [
      'Cinematic quality',
      'Dramatic lighting',
      'Smooth motion',
      'Professional grade',
    ],
    weaknesses: [
      'Higher cost',
      'Slower generation',
    ],
    bestFor: [
      'cinematic',
      'dramatic',
      'hero-shots',
      'product-premium',
      'emotional',
      'hook',
      'cta',
    ],
  },
  
  // Kling Family (6 variants)
  kling: {
    id: 'kling',
    name: 'kling',
    displayName: 'Kling AI',
    costPerSecond: 0.03,
    maxDuration: 10,
    family: 'kling',
    tier: 'standard',
    strengths: [
      'Excellent human rendering',
      'Natural expressions',
      'Good motion physics',
      'Cost effective',
    ],
    weaknesses: [
      'Less cinematic than Runway',
    ],
    bestFor: [
      'person',
      'human-subject',
      'face-closeup',
      'conversation',
      'testimonial',
      'lifestyle',
      'story',
    ],
  },
  
  'kling-1.6': {
    id: 'kling-1.6',
    name: 'kling-1.6',
    displayName: 'Kling 1.6',
    costPerSecond: 0.025,
    maxDuration: 10,
    family: 'kling',
    tier: 'budget',
    strengths: ['Good value', 'Reliable', 'Fast generation'],
    weaknesses: ['Older model', 'Less detail'],
    bestFor: ['general', 'lifestyle', 'simple-motion'],
  },
  
  'kling-2.0': {
    id: 'kling-2.0',
    name: 'kling-2.0',
    displayName: 'Kling 2.0',
    costPerSecond: 0.03,
    maxDuration: 10,
    family: 'kling',
    tier: 'standard',
    strengths: ['Improved motion', 'Better faces', 'Natural movement'],
    weaknesses: ['Moderate cost'],
    bestFor: ['people', 'lifestyle', 'testimonials'],
  },
  
  'kling-2.1': {
    id: 'kling-2.1',
    name: 'kling-2.1',
    displayName: 'Kling 2.1',
    costPerSecond: 0.035,
    maxDuration: 10,
    family: 'kling',
    tier: 'standard',
    strengths: ['Enhanced realism', 'Better expressions', 'Smooth motion'],
    weaknesses: ['Higher cost than 2.0'],
    bestFor: ['people', 'emotional', 'close-ups'],
  },
  
  'kling-2.5-turbo': {
    id: 'kling-2.5-turbo',
    name: 'kling-2.5-turbo',
    displayName: 'Kling 2.5 Turbo',
    costPerSecond: 0.04,
    maxDuration: 10,
    family: 'kling',
    tier: 'premium',
    strengths: ['Fast generation', 'High quality', 'Best-in-class motion'],
    weaknesses: ['Premium pricing'],
    bestFor: ['complex-motion', 'action', 'dynamic-scenes'],
  },
  
  'kling-avatar': {
    id: 'kling-avatar',
    name: 'kling-avatar',
    displayName: 'Kling Avatar',
    costPerSecond: 0.045,
    maxDuration: 60,
    family: 'kling',
    tier: 'premium',
    specialization: 'talking-head',
    strengths: ['Lip sync', 'Long duration', 'Consistent identity'],
    weaknesses: ['Specialized use', 'Less versatile'],
    bestFor: ['talking-head', 'presenter', 'avatar', 'spokesperson'],
  },
  
  'kling-effects': {
    id: 'kling-effects',
    name: 'kling-effects',
    displayName: 'Kling Effects',
    costPerSecond: 0.02,
    maxDuration: 5,
    family: 'kling',
    tier: 'budget',
    specialization: 'effects',
    strengths: ['VFX overlays', 'Fast rendering', 'Low cost'],
    weaknesses: ['Short duration', 'Effects only'],
    bestFor: ['effects', 'transitions', 'overlays', 'particles'],
  },
  
  'kling-2.1-master': {
    id: 'kling-2.1-master',
    name: 'kling-2.1-master',
    displayName: 'Kling 2.1 Master',
    costPerSecond: 0.19,
    maxDuration: 10,
    family: 'kling',
    tier: 'premium',
    strengths: ['Premium quality', 'Best faces', 'Cinematic'],
    weaknesses: ['Highest cost'],
    bestFor: ['hero-shots', 'premium-content', 'cinematic'],
  },
  
  'kling-2.5': {
    id: 'kling-2.5',
    name: 'kling-2.5',
    displayName: 'Kling 2.5',
    costPerSecond: 0.039,
    maxDuration: 10,
    family: 'kling',
    tier: 'standard',
    strengths: ['Great temporal consistency', 'Smooth motion', 'Good value'],
    weaknesses: ['No native audio'],
    bestFor: ['people', 'lifestyle', 'product-demos'],
  },
  
  'kling-2.6': {
    id: 'kling-2.6',
    name: 'kling-2.6',
    displayName: 'Kling 2.6',
    costPerSecond: 0.039,
    maxDuration: 10,
    family: 'kling',
    tier: 'premium',
    specialization: 'native-audio',
    strengths: ['Native audio generation', 'Voice/SFX/ambient', 'Audio-visual sync', 'Lip sync'],
    weaknesses: ['Newer model'],
    bestFor: ['speaking', 'dialogue', 'sfx-scenes', 'ambient-scenes', 'audio-visual'],
  },
  
  'kling-2.6-pro': {
    id: 'kling-2.6-pro',
    name: 'kling-2.6-pro',
    displayName: 'Kling 2.6 Pro',
    costPerSecond: 0.066,
    maxDuration: 10,
    family: 'kling',
    tier: 'premium',
    specialization: 'native-audio',
    strengths: ['Premium audio quality', 'Enhanced fidelity', 'Full audio suite'],
    weaknesses: ['Higher cost'],
    bestFor: ['premium-audio', 'professional', 'high-quality-dialogue'],
  },
  
  'kling-2.6-motion-control': {
    id: 'kling-2.6-motion-control',
    name: 'kling-2.6-motion-control',
    displayName: 'Kling 2.6 Motion Control',
    costPerSecond: 0.066,
    maxDuration: 30,
    family: 'kling',
    tier: 'premium',
    specialization: 'motion-transfer',
    strengths: ['Motion transfer', 'Long duration (30s)', 'Dance/gestures', 'Hand actions'],
    weaknesses: ['Requires reference video', 'Specialized use'],
    bestFor: ['dance', 'motion-transfer', 'virtual-influencer', 'choreography'],
  },
  
  'kling-2.6-motion-control-pro': {
    id: 'kling-2.6-motion-control-pro',
    name: 'kling-2.6-motion-control-pro',
    displayName: 'Kling 2.6 Motion Control Pro',
    costPerSecond: 0.08,
    maxDuration: 30,
    family: 'kling',
    tier: 'premium',
    specialization: 'motion-transfer',
    strengths: ['Premium motion transfer', 'Complex choreography', 'Best hand rendering'],
    weaknesses: ['Highest cost', 'Requires reference video'],
    bestFor: ['professional-dance', 'complex-motion', 'premium-choreography'],
  },
  
  // Luma Family
  luma: {
    id: 'luma',
    name: 'luma',
    displayName: 'Luma Dream Machine',
    costPerSecond: 0.04,
    maxDuration: 5,
    family: 'luma',
    tier: 'standard',
    strengths: [
      'Smooth reveals',
      'Product animations',
      'Clean transitions',
      '3D-like quality',
    ],
    weaknesses: [
      'Shorter max duration',
      'Less natural for people',
    ],
    bestFor: [
      'product-reveal',
      'product-shot',
      'object-focus',
      'reveal-animation',
      'tech-demo',
      'product',
      'brand',
    ],
  },

  // Alias for server/config compatibility
  'luma-dream-machine': {
    id: 'luma-dream-machine',
    name: 'luma-dream-machine',
    displayName: 'Luma Dream Machine',
    costPerSecond: 0.04,
    maxDuration: 5,
    family: 'luma',
    tier: 'standard',
    strengths: ['Smooth reveals', 'Product animations', 'Clean transitions'],
    weaknesses: ['Shorter max duration', 'Less natural for people'],
    bestFor: ['product-reveal', 'product-shot', 'object-focus', 'reveal-animation'],
  },

  // Runway Gen-3 (alias for compatibility)
  'runway-gen3': {
    id: 'runway-gen3',
    name: 'runway-gen3',
    displayName: 'Runway Gen-3 Alpha',
    costPerSecond: 0.06,
    maxDuration: 10,
    family: 'runway',
    tier: 'premium',
    strengths: ['Cinematic quality', 'Camera movement', 'Human faces'],
    weaknesses: ['Higher cost', 'Text in video'],
    bestFor: ['cinematic', 'dramatic', 'hero-shots', 'hook', 'cta'],
  },

  // Hailuo Family
  hailuo: {
    id: 'hailuo',
    name: 'hailuo',
    displayName: 'Hailuo MiniMax',
    costPerSecond: 0.02,
    maxDuration: 6,
    family: 'hailuo',
    tier: 'budget',
    strengths: [
      'Cost effective',
      'Good for B-roll',
      'Nature scenes',
      'Fast generation',
    ],
    weaknesses: [
      'Less detailed than premium',
      'Simpler motion',
    ],
    bestFor: [
      'broll',
      'b-roll',
      'nature',
      'landscape',
      'ambient',
      'background',
      'establishing',
      'explanation',
    ],
  },

  // Alias for server/config compatibility
  'hailuo-minimax': {
    id: 'hailuo-minimax',
    name: 'hailuo-minimax',
    displayName: 'Hailuo MiniMax',
    costPerSecond: 0.015,
    maxDuration: 6,
    family: 'hailuo',
    tier: 'budget',
    strengths: ['Cost effective', 'B-roll', 'Nature scenes', 'Fast generation'],
    weaknesses: ['Less detailed than premium', 'Simpler motion'],
    bestFor: ['broll', 'b-roll', 'nature', 'landscape', 'ambient', 'background'],
  },
  
  // Hunyuan
  hunyuan: {
    id: 'hunyuan',
    name: 'hunyuan',
    displayName: 'Hunyuan',
    costPerSecond: 0.025,
    maxDuration: 5,
    family: 'hunyuan',
    tier: 'budget',
    strengths: [
      'Good for nature',
      'Abstract scenes',
      'Cost effective',
    ],
    weaknesses: [
      'Limited duration',
      'Less versatile',
    ],
    bestFor: [
      'broll',
      'nature',
      'abstract',
      'supplementary',
    ],
  },
  
  // Veo Family (Google)
  veo: {
    id: 'veo',
    name: 'veo',
    displayName: 'Veo',
    costPerSecond: 0.06,
    maxDuration: 8,
    family: 'veo',
    tier: 'premium',
    strengths: [
      'High quality output',
      'Cinematic results',
      'Good motion',
    ],
    weaknesses: [
      'Higher cost',
    ],
    bestFor: [
      'cinematic',
      'high-quality',
      'dramatic',
      'hook',
    ],
  },
  
  'veo-2': {
    id: 'veo-2',
    name: 'veo-2',
    displayName: 'Veo 2',
    costPerSecond: 0.055,
    maxDuration: 8,
    family: 'veo',
    tier: 'premium',
    strengths: ['Cinematic quality', 'Good motion', 'Reliable'],
    weaknesses: ['Premium pricing'],
    bestFor: ['cinematic', 'dramatic', 'professional'],
  },
  
  'veo-3.1': {
    id: 'veo-3.1',
    name: 'veo-3.1',
    displayName: 'Veo 3.1',
    costPerSecond: 0.065,
    maxDuration: 8,
    family: 'veo',
    tier: 'premium',
    strengths: ['Latest model', 'Best quality', 'Advanced physics'],
    weaknesses: ['Highest cost'],
    bestFor: ['hero-shots', 'cinematic', 'premium-content'],
  },
  
  // Wan Family (Alibaba)
  'wan-2.1': {
    id: 'wan-2.1',
    name: 'wan-2.1',
    displayName: 'Wan 2.1',
    costPerSecond: 0.025,
    maxDuration: 5,
    family: 'wan',
    tier: 'budget',
    strengths: ['Fast generation', 'Cost effective', 'Reliable'],
    weaknesses: ['Shorter duration', 'Basic motion'],
    bestFor: ['broll', 'simple-scenes', 'quick-generation'],
  },
  
  'wan-2.6': {
    id: 'wan-2.6',
    name: 'wan-2.6',
    displayName: 'Wan 2.6',
    costPerSecond: 0.03,
    maxDuration: 5,
    family: 'wan',
    tier: 'standard',
    strengths: ['Improved quality', 'Better motion', 'Good value'],
    weaknesses: ['Short duration'],
    bestFor: ['lifestyle', 'nature', 'products'],
  },
  
  // Seedance
  'seedance-1.0': {
    id: 'seedance-1.0',
    name: 'seedance-1.0',
    displayName: 'Seedance 1.0',
    costPerSecond: 0.035,
    maxDuration: 5,
    family: 'seedance',
    tier: 'standard',
    specialization: 'dance',
    strengths: ['Dance motion', 'Character animation', 'Expressive'],
    weaknesses: ['Specialized', 'Short duration'],
    bestFor: ['dance', 'character', 'expressive-motion'],
  },
  
  // Remotion (Motion Graphics)
  'remotion-motion-graphics': {
    id: 'remotion-motion-graphics',
    name: 'remotion-motion-graphics',
    displayName: 'Remotion (Motion Graphics)',
    costPerSecond: 0.001,
    maxDuration: 60,
    family: 'remotion',
    tier: 'budget',
    specialization: 'motion-graphics',
    strengths: ['Free/cheap', 'Programmatic', 'Consistent', 'No AI artifacts'],
    weaknesses: ['Template-based', 'Less organic'],
    bestFor: ['text-animations', 'charts', 'infographics', 'lower-thirds', 'cta-overlays'],
  },
};

export interface ImageProvider {
  id: string;
  name: string;
  displayName: string;
  costPerImage: number;
  strengths: string[];
  bestFor: string[];
}

export const IMAGE_PROVIDERS: Record<string, ImageProvider> = {
  flux: {
    id: 'flux',
    name: 'flux',
    displayName: 'Flux.1',
    costPerImage: 0.03,
    strengths: ['Product shots', 'Clean compositions', 'Commercial quality'],
    bestFor: ['product', 'food', 'object', 'still-life'],
  },
  
  'flux-1-dev': {
    id: 'flux-1-dev',
    name: 'flux-1-dev',
    displayName: 'Flux.1 Dev',
    costPerImage: 0.025,
    strengths: ['Development version', 'Experimental features'],
    bestFor: ['testing', 'experimental'],
  },
  
  falai: {
    id: 'falai',
    name: 'fal.ai',
    displayName: 'fal.ai',
    costPerImage: 0.02,
    strengths: ['Lifestyle images', 'Natural feel', 'People'],
    bestFor: ['lifestyle', 'person', 'scene', 'environment'],
  },
  
  'stable-diffusion-3': {
    id: 'stable-diffusion-3',
    name: 'stable-diffusion-3',
    displayName: 'Stable Diffusion 3',
    costPerImage: 0.02,
    strengths: ['Versatile', 'Good text rendering', 'Fast'],
    bestFor: ['general', 'text-in-image', 'artistic'],
  },
  
  midjourney: {
    id: 'midjourney',
    name: 'midjourney',
    displayName: 'Midjourney',
    costPerImage: 0.05,
    strengths: ['Artistic excellence', 'Premium aesthetics', 'Creative compositions', 'Photorealistic'],
    bestFor: ['hero-shots', 'artistic', 'premium-content', 'lifestyle', 'cinematic'],
  },
};

export interface SoundProvider {
  id: string;
  name: string;
  displayName: string;
  type: 'voiceover' | 'music' | 'sfx';
  costPerSecond?: number;
  costPerTrack?: number;
  costPerEffect?: number;
}

export const SOUND_PROVIDERS: Record<string, SoundProvider> = {
  elevenlabs: {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    displayName: 'ElevenLabs',
    type: 'voiceover',
    costPerSecond: 0.015,
  },
  
  udio: {
    id: 'udio',
    name: 'Udio',
    displayName: 'Udio AI (via PiAPI)',
    type: 'music',
    costPerTrack: 0.10,
  },
  
  kling_sound: {
    id: 'kling_sound',
    name: 'Kling Sound',
    displayName: 'Kling Sound',
    type: 'sfx',
    costPerEffect: 0.01,
  },
};

export function getVideoProvider(id: string): VideoProvider | undefined {
  return VIDEO_PROVIDERS[id];
}

export function getAllVideoProviders(): VideoProvider[] {
  return Object.values(VIDEO_PROVIDERS);
}

export function getVideoProvidersByFamily(family: string): VideoProvider[] {
  return Object.values(VIDEO_PROVIDERS).filter(p => p.family === family);
}

export function getVideoProviderFamilies(): string[] {
  const families = new Set<string>();
  Object.values(VIDEO_PROVIDERS).forEach(p => {
    if (p.family) families.add(p.family);
  });
  return Array.from(families);
}

export function getImageProvider(id: string): ImageProvider | undefined {
  return IMAGE_PROVIDERS[id];
}

export function getAllImageProviders(): ImageProvider[] {
  return Object.values(IMAGE_PROVIDERS);
}

export function getSoundProvider(id: string): SoundProvider | undefined {
  return SOUND_PROVIDERS[id];
}
