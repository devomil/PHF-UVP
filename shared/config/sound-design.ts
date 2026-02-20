export interface SoundEffect {
  file: string;
  volume: number;
  duration?: number;
  category: 'transition' | 'impact' | 'ambient' | 'rise';
  fallbackUrl?: string;
}

export const SOUND_EFFECTS_BASE_URL = process.env.SOUND_EFFECTS_URL ||
  'https://remotionlambda-useast1-refjo5giq5.s3.us-east-1.amazonaws.com/stock-sounds';

export const SOUND_EFFECTS_ASSETS_URL = process.env.REMOTION_AWS_BUCKET
  ? `https://${process.env.REMOTION_AWS_BUCKET}.s3.us-east-1.amazonaws.com/stock-sounds`
  : 'https://remotionlambda-useast1-refjo5giq5.s3.us-east-1.amazonaws.com/stock-sounds';

export function getSoundEffectUrl(filename: string): string {
  return `${SOUND_EFFECTS_BASE_URL}/${filename}`;
}

export function getStockSoundUrl(filename: string): string {
  return `${SOUND_EFFECTS_ASSETS_URL}/${filename}`;
}

export const SOUND_EFFECTS: Record<string, SoundEffect> = {
  'whoosh-light': {
    file: 'whoosh-medium.mp3',
    volume: 0.12,
    duration: 0.5,
    category: 'transition',
  },
  'whoosh-heavy': {
    file: 'whoosh-dramatic.mp3',
    volume: 0.15,
    duration: 0.6,
    category: 'transition',
  },
  'whoosh-soft': {
    file: 'whoosh-soft.mp3',
    volume: 0.1,
    duration: 0.4,
    category: 'transition',
  },
  'impact-deep': {
    file: 'whoosh-dramatic.mp3',
    volume: 0.15,
    duration: 0.3,
    category: 'impact',
  },
  'impact-soft': {
    file: 'whoosh-soft.mp3',
    volume: 0.1,
    duration: 0.25,
    category: 'impact',
  },
  'logo-reveal': {
    file: 'whoosh-dramatic.mp3',
    volume: 0.2,
    duration: 1.5,
    category: 'impact',
  },
  'rise-swell': {
    file: 'ambient-energy.mp3',
    volume: 0.12,
    duration: 3.0,
    category: 'rise',
  },
  'rise-tension': {
    file: 'ambient-energy.mp3',
    volume: 0.1,
    duration: 2.5,
    category: 'rise',
  },
  'room-tone-warm': {
    file: 'room-tone-warm.mp3',
    volume: 0.03,
    category: 'ambient',
  },
  'room-tone-nature': {
    file: 'ambient-nature.mp3',
    volume: 0.04,
    category: 'ambient',
  },
  'shimmer': {
    file: 'whoosh-soft.mp3',
    volume: 0.08,
    duration: 1.0,
    category: 'transition',
  },
  'ambient-nature': {
    file: 'ambient-nature.mp3',
    volume: 0.03,
    category: 'ambient',
  },
  'ambient-wellness': {
    file: 'ambient-wellness.mp3',
    volume: 0.03,
    category: 'ambient',
  },
  'ambient-energy': {
    file: 'ambient-energy.mp3',
    volume: 0.03,
    category: 'ambient',
  },
};

export type TransitionType = 
  | 'cut'
  | 'fade'
  | 'dissolve'
  | 'wipe'
  | 'slide'
  | 'zoom'
  | 'light-leak'
  | 'film-burn'
  | 'whip-pan';

const transitionSoundMap: Record<TransitionType, string | null> = {
  'cut': null,
  'fade': null,
  'dissolve': null,
  'wipe': 'whoosh-soft',
  'slide': 'whoosh-soft',
  'zoom': 'whoosh-light',
  'light-leak': null,
  'film-burn': null,
  'whip-pan': 'whoosh-light',
};

export function getSoundForTransition(transitionType: string): (SoundEffect & { url: string }) | null {
  const soundKey = transitionSoundMap[transitionType as TransitionType];
  if (!soundKey) return null;
  const effect = SOUND_EFFECTS[soundKey];
  if (!effect) return null;
  return {
    ...effect,
    url: getSoundEffectUrl(effect.file),
  };
}

export interface TransitionConfig {
  type: TransitionType;
  duration: number;
  easing?: string;
  direction?: 'left' | 'right' | 'up' | 'down';
}

export interface SoundDesignConfig {
  enabled: boolean;
  transitionSounds: boolean;
  impactSounds: boolean;
  ambientLayer: boolean;
  ambientType: 'warm' | 'nature' | 'none';
  masterVolume: number;
  audioDucking?: {
    enabled: boolean;
    baseVolume: number;
    duckLevel: number;
    fadeFrames: number;
  };
}

export const DEFAULT_SOUND_DESIGN_CONFIG: SoundDesignConfig = {
  enabled: false,
  transitionSounds: false,
  impactSounds: false,
  ambientLayer: false,
  ambientType: 'none',
  masterVolume: 0.5,
};

export const PINE_HILL_FARM_SOUND_CONFIG: SoundDesignConfig = {
  enabled: false,
  transitionSounds: false,
  impactSounds: false,
  ambientLayer: false,
  ambientType: 'none',
  masterVolume: 0.5,
};
