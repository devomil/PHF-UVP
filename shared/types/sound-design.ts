// shared/types/sound-design.ts

export interface SoundDesignConfig {
  enabled: boolean;
  
  transitions: {
    enabled: boolean;
    defaultSound: 'whoosh-soft' | 'whoosh-medium' | 'swipe' | 'none';
    volume: number;
  };
  
  logoReveal: {
    enabled: boolean;
    sound: 'logo-impact' | 'shimmer' | 'none';
    volume: number;
  };
  
  riseSwell: {
    enabled: boolean;
    durationBeforeCTA: number;
    volume: number;
  };
  
  audioDucking: {
    enabled: boolean;
    baseVolume: number;
    duckLevel: number;
    fadeFrames: number;
  };
  
  ambient: {
    enabled: boolean;
    sound: 'room-tone-warm' | 'subtle-air' | 'none';
    volume: number;
  };
}

export interface TransitionSound {
  sceneIndex: number;
  startFrame: number;
  sound: string;
  volume: number;
}

export interface VoiceoverRange {
  startFrame: number;
  endFrame: number;
}

export const DEFAULT_SOUND_DESIGN_CONFIG: SoundDesignConfig = {
  enabled: true,
  transitions: {
    enabled: true,
    defaultSound: 'whoosh-soft',
    volume: 0.4,
  },
  logoReveal: {
    enabled: true,
    sound: 'logo-impact',
    volume: 0.5,
  },
  riseSwell: {
    enabled: true,
    durationBeforeCTA: 3,
    volume: 0.3,
  },
  audioDucking: {
    enabled: true,
    baseVolume: 0.35,
    duckLevel: 0.1,
    fadeFrames: 15,
  },
  ambient: {
    enabled: false,
    sound: 'room-tone-warm',
    volume: 0.05,
  },
};
