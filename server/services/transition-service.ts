import { Phase8AnalysisResult } from '../../shared/video-types';

export type TransitionType = 
  | 'cut'
  | 'fade'
  | 'dissolve'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'slide-left'
  | 'slide-right'
  | 'blur';

export interface TransitionConfig {
  type: TransitionType;
  duration: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  audioCrossfade: boolean;
  audioCrossfadeDuration: number;
}

export interface SceneTransition {
  fromSceneIndex: number;
  toSceneIndex: number;
  config: TransitionConfig;
  moodFlow: string;
  reason: string;
  confidence: number;
}

export interface TransitionPlan {
  transitions: SceneTransition[];
  summary: {
    totalTransitions: number;
    byType: Record<string, number>;
    averageDuration: number;
  };
}

export interface TransitionDesign {
  fromScene: number;
  toScene: number;
  type: 'cut' | 'fade' | 'dissolve' | 'wipe' | 'zoom' | 'slide';
  duration: number;
  reason: string;
  moodMatch: string;
}

export interface ProjectTransitions {
  transitions: TransitionDesign[];
  summary: {
    cuts: number;
    fades: number;
    dissolves: number;
    wipes: number;
    zooms: number;
    slides: number;
  };
}

type Mood = 'attention' | 'concern' | 'frustration' | 'hope' | 'optimism' | 'interest' | 'learning' | 'trust' | 'engagement' | 'atmosphere' | 'identity' | 'action' | 'closure';

const SCENE_TYPE_MOODS: Record<string, Mood> = {
  hook: 'attention',
  intro: 'attention',
  benefit: 'optimism',
  feature: 'interest',
  explanation: 'learning',
  process: 'learning',
  testimonial: 'trust',
  social_proof: 'trust',
  story: 'engagement',
  problem: 'concern',
  agitation: 'frustration',
  solution: 'hope',
  proof: 'trust',
  product: 'interest',
  broll: 'atmosphere',
  brand: 'identity',
  cta: 'action',
  outro: 'closure',
};

function buildMoodTransitions(): Map<string, TransitionConfig> {
  const transitions = new Map<string, TransitionConfig>();
  
  const add = (from: Mood, to: Mood, config: TransitionConfig) => {
    transitions.set(`${from}→${to}`, config);
  };
  
  add('attention', 'attention', { type: 'fade', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.3 });
  add('attention', 'concern', { type: 'dissolve', duration: 0.8, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.6 });
  add('attention', 'engagement', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('attention', 'interest', { type: 'dissolve', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.3 });
  add('attention', 'learning', { type: 'fade', duration: 0.6, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('attention', 'hope', { type: 'dissolve', duration: 0.7, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('attention', 'identity', { type: 'fade', duration: 0.6, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('attention', 'atmosphere', { type: 'dissolve', duration: 0.6, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('attention', 'trust', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('attention', 'optimism', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('attention', 'action', { type: 'zoom-in', duration: 0.5, easing: 'ease-in', audioCrossfade: true, audioCrossfadeDuration: 0.3 });
  add('attention', 'closure', { type: 'fade', duration: 0.8, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.6 });
  add('attention', 'frustration', { type: 'dissolve', duration: 0.7, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  
  add('concern', 'concern', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('concern', 'frustration', { type: 'cut', duration: 0.2, easing: 'linear', audioCrossfade: false, audioCrossfadeDuration: 0 });
  add('concern', 'hope', { type: 'dissolve', duration: 1.2, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 1.0 });
  add('concern', 'learning', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('concern', 'trust', { type: 'dissolve', duration: 0.7, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('concern', 'engagement', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('concern', 'atmosphere', { type: 'dissolve', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('concern', 'attention', { type: 'fade', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('concern', 'interest', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('concern', 'optimism', { type: 'dissolve', duration: 0.8, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.6 });
  add('concern', 'identity', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('concern', 'action', { type: 'zoom-in', duration: 0.5, easing: 'ease-in', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('concern', 'closure', { type: 'fade', duration: 0.7, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  
  add('frustration', 'frustration', { type: 'cut', duration: 0.2, easing: 'linear', audioCrossfade: false, audioCrossfadeDuration: 0 });
  add('frustration', 'hope', { type: 'dissolve', duration: 1.0, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.8 });
  add('frustration', 'concern', { type: 'dissolve', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('frustration', 'trust', { type: 'dissolve', duration: 0.8, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.6 });
  add('frustration', 'action', { type: 'cut', duration: 0.25, easing: 'linear', audioCrossfade: false, audioCrossfadeDuration: 0 });
  add('frustration', 'attention', { type: 'fade', duration: 0.6, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('frustration', 'engagement', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('frustration', 'learning', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('frustration', 'interest', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('frustration', 'optimism', { type: 'dissolve', duration: 0.9, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.7 });
  add('frustration', 'atmosphere', { type: 'fade', duration: 0.6, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('frustration', 'identity', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('frustration', 'closure', { type: 'fade', duration: 0.7, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  
  add('hope', 'hope', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('hope', 'optimism', { type: 'dissolve', duration: 0.8, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.6 });
  add('hope', 'interest', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('hope', 'trust', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('hope', 'engagement', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('hope', 'action', { type: 'zoom-in', duration: 0.6, easing: 'ease-in', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('hope', 'attention', { type: 'fade', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('hope', 'concern', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('hope', 'frustration', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('hope', 'learning', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('hope', 'atmosphere', { type: 'dissolve', duration: 0.6, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('hope', 'identity', { type: 'fade', duration: 0.6, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('hope', 'closure', { type: 'fade', duration: 0.8, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.6 });
  
  add('optimism', 'optimism', { type: 'dissolve', duration: 0.4, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.3 });
  add('optimism', 'interest', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('optimism', 'learning', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('optimism', 'trust', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('optimism', 'action', { type: 'zoom-in', duration: 0.6, easing: 'ease-in', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('optimism', 'attention', { type: 'fade', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('optimism', 'hope', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('optimism', 'concern', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('optimism', 'frustration', { type: 'dissolve', duration: 0.7, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('optimism', 'engagement', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('optimism', 'atmosphere', { type: 'dissolve', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('optimism', 'identity', { type: 'fade', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('optimism', 'closure', { type: 'fade', duration: 0.7, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  
  add('interest', 'interest', { type: 'dissolve', duration: 0.4, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.3 });
  add('interest', 'learning', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('interest', 'trust', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('interest', 'identity', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('interest', 'action', { type: 'zoom-in', duration: 0.6, easing: 'ease-in', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('interest', 'optimism', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('interest', 'atmosphere', { type: 'dissolve', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('interest', 'engagement', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('interest', 'closure', { type: 'fade', duration: 0.6, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('interest', 'attention', { type: 'fade', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('interest', 'hope', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('interest', 'concern', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('interest', 'frustration', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  
  add('learning', 'learning', { type: 'dissolve', duration: 0.4, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.3 });
  add('learning', 'hope', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('learning', 'interest', { type: 'dissolve', duration: 0.4, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.3 });
  add('learning', 'trust', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('learning', 'action', { type: 'zoom-in', duration: 0.5, easing: 'ease-in', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('learning', 'atmosphere', { type: 'dissolve', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('learning', 'attention', { type: 'fade', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('learning', 'optimism', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('learning', 'concern', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('learning', 'frustration', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('learning', 'engagement', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('learning', 'identity', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('learning', 'closure', { type: 'fade', duration: 0.6, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  
  add('trust', 'trust', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('trust', 'engagement', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('trust', 'interest', { type: 'dissolve', duration: 0.4, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.3 });
  add('trust', 'identity', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('trust', 'action', { type: 'zoom-in', duration: 0.6, easing: 'ease-in', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('trust', 'optimism', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('trust', 'closure', { type: 'fade', duration: 0.7, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('trust', 'attention', { type: 'fade', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('trust', 'hope', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('trust', 'concern', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('trust', 'frustration', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('trust', 'learning', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('trust', 'atmosphere', { type: 'dissolve', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  
  add('engagement', 'engagement', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('engagement', 'interest', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('engagement', 'trust', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('engagement', 'hope', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('engagement', 'identity', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('engagement', 'action', { type: 'fade', duration: 0.6, easing: 'ease-in', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('engagement', 'closure', { type: 'fade', duration: 0.7, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('engagement', 'optimism', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('engagement', 'attention', { type: 'fade', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('engagement', 'concern', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('engagement', 'frustration', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('engagement', 'learning', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('engagement', 'atmosphere', { type: 'dissolve', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  
  add('atmosphere', 'atmosphere', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('atmosphere', 'attention', { type: 'fade', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('atmosphere', 'interest', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('atmosphere', 'learning', { type: 'dissolve', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('atmosphere', 'trust', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('atmosphere', 'optimism', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('atmosphere', 'hope', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('atmosphere', 'identity', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('atmosphere', 'action', { type: 'zoom-in', duration: 0.5, easing: 'ease-in', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('atmosphere', 'engagement', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('atmosphere', 'closure', { type: 'fade', duration: 0.7, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('atmosphere', 'concern', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('atmosphere', 'frustration', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  
  add('identity', 'identity', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('identity', 'action', { type: 'zoom-in', duration: 0.6, easing: 'ease-in', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('identity', 'closure', { type: 'fade', duration: 0.8, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.6 });
  add('identity', 'attention', { type: 'fade', duration: 0.6, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('identity', 'trust', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('identity', 'interest', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('identity', 'optimism', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('identity', 'engagement', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('identity', 'learning', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('identity', 'hope', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('identity', 'concern', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('identity', 'frustration', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('identity', 'atmosphere', { type: 'dissolve', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  
  add('action', 'action', { type: 'cut', duration: 0.2, easing: 'linear', audioCrossfade: false, audioCrossfadeDuration: 0 });
  add('action', 'closure', { type: 'fade', duration: 0.8, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.6 });
  add('action', 'identity', { type: 'fade', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('action', 'trust', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('action', 'attention', { type: 'fade', duration: 0.4, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.3 });
  add('action', 'hope', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('action', 'optimism', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('action', 'interest', { type: 'dissolve', duration: 0.4, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.3 });
  add('action', 'concern', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('action', 'frustration', { type: 'cut', duration: 0.2, easing: 'linear', audioCrossfade: false, audioCrossfadeDuration: 0 });
  add('action', 'engagement', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('action', 'learning', { type: 'dissolve', duration: 0.5, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('action', 'atmosphere', { type: 'dissolve', duration: 0.5, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  
  add('closure', 'closure', { type: 'fade', duration: 0.8, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.6 });
  add('closure', 'identity', { type: 'fade', duration: 0.8, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.6 });
  add('closure', 'attention', { type: 'fade', duration: 0.8, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.6 });
  add('closure', 'action', { type: 'fade', duration: 0.6, easing: 'ease-in', audioCrossfade: true, audioCrossfadeDuration: 0.4 });
  add('closure', 'trust', { type: 'fade', duration: 0.6, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('closure', 'hope', { type: 'dissolve', duration: 0.7, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('closure', 'optimism', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('closure', 'interest', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('closure', 'concern', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('closure', 'frustration', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('closure', 'engagement', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('closure', 'learning', { type: 'dissolve', duration: 0.6, easing: 'ease-in-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  add('closure', 'atmosphere', { type: 'fade', duration: 0.7, easing: 'ease-out', audioCrossfade: true, audioCrossfadeDuration: 0.5 });
  
  return transitions;
}

const MOOD_TRANSITIONS = buildMoodTransitions();

const DEFAULT_TRANSITION: TransitionConfig = {
  type: 'dissolve',
  duration: 0.5,
  easing: 'ease-in-out',
  audioCrossfade: true,
  audioCrossfadeDuration: 0.3,
};

const STYLE_PREFERENCES: Record<string, Partial<TransitionConfig>> = {
  hero: {
    type: 'fade',
    duration: 1.0,
    easing: 'ease-out',
  },
  lifestyle: {
    type: 'dissolve',
    duration: 0.6,
    easing: 'ease-in-out',
  },
  product: {
    type: 'fade',
    duration: 0.8,
    easing: 'ease-in-out',
  },
  educational: {
    type: 'dissolve',
    duration: 0.5,
    easing: 'ease-in-out',
  },
  social: {
    type: 'cut',
    duration: 0.2,
    easing: 'linear',
  },
  premium: {
    type: 'fade',
    duration: 1.2,
    easing: 'ease-out',
  },
  // Legacy mappings for backward compatibility
  professional: {
    type: 'dissolve',
    duration: 0.6,
    easing: 'ease-in-out',
  },
  cinematic: {
    type: 'fade',
    duration: 1.0,
    easing: 'ease-out',
  },
  energetic: {
    type: 'cut',
    duration: 0.2,
    easing: 'linear',
  },
};

class TransitionService {
  planTransitions(
    scenes: Array<{
      sceneIndex: number;
      sceneType: string;
      duration: number;
      analysisResult?: Phase8AnalysisResult;
    }>,
    visualStyle: string
  ): TransitionPlan {
    const transitions: SceneTransition[] = [];
    const typeCount: Record<string, number> = {};
    let totalDuration = 0;
    
    for (let i = 0; i < scenes.length - 1; i++) {
      const transition = this.selectTransitionWithMood(scenes[i], scenes[i + 1], visualStyle);
      transitions.push(transition);
      
      typeCount[transition.config.type] = (typeCount[transition.config.type] || 0) + 1;
      totalDuration += transition.config.duration;
    }
    
    return {
      transitions,
      summary: {
        totalTransitions: transitions.length,
        byType: typeCount,
        averageDuration: transitions.length > 0 ? totalDuration / transitions.length : 0,
      },
    };
  }
  
  private selectTransitionWithMood(
    fromScene: {
      sceneIndex: number;
      sceneType: string;
      duration: number;
      analysisResult?: Phase8AnalysisResult;
    },
    toScene: {
      sceneIndex: number;
      sceneType: string;
      duration: number;
      analysisResult?: Phase8AnalysisResult;
    },
    visualStyle: string
  ): SceneTransition {
    const fromMood = SCENE_TYPE_MOODS[fromScene.sceneType] || 'attention';
    const toMood = SCENE_TYPE_MOODS[toScene.sceneType] || 'attention';
    const moodFlow = `${fromMood}→${toMood}`;
    
    let config = MOOD_TRANSITIONS.get(moodFlow);
    let reason: string;
    let confidence: number;
    
    if (config) {
      reason = `Mood-matched transition from ${fromMood} to ${toMood}`;
      confidence = 0.9;
    } else {
      const stylePrefs = STYLE_PREFERENCES[visualStyle] || STYLE_PREFERENCES['lifestyle'];
      config = { ...DEFAULT_TRANSITION, ...stylePrefs };
      reason = `Style-based transition (${visualStyle}) - no specific mood mapping`;
      confidence = 0.6;
    }
    
    config = this.adjustForContent(config, fromScene, toScene);
    
    const maxTransitionDuration = Math.min(fromScene.duration, toScene.duration) * 0.3;
    if (config.duration > maxTransitionDuration) {
      config = { ...config, duration: maxTransitionDuration };
    }
    
    return {
      fromSceneIndex: fromScene.sceneIndex,
      toSceneIndex: toScene.sceneIndex,
      config,
      moodFlow,
      reason,
      confidence: this.calculateConfidence(config, fromScene, toScene),
    };
  }
  
  private adjustForContent(
    baseConfig: TransitionConfig,
    fromScene: { analysisResult?: Phase8AnalysisResult },
    toScene: { analysisResult?: Phase8AnalysisResult }
  ): TransitionConfig {
    const config = { ...baseConfig };
    
    if (fromScene.analysisResult && toScene.analysisResult) {
      const fromColors = fromScene.analysisResult.frameAnalysis?.dominantColors || [];
      const toColors = toScene.analysisResult.frameAnalysis?.dominantColors || [];
      
      const similarColors = fromColors.some(fc => 
        toColors.some(tc => this.colorsAreSimilar(fc, tc))
      );
      
      if (similarColors && config.type === 'cut') {
        config.type = 'dissolve';
        config.duration = 0.4;
      }
    }
    
    if (fromScene.analysisResult && toScene.analysisResult) {
      const fromLighting = fromScene.analysisResult.frameAnalysis?.lightingType;
      const toLighting = toScene.analysisResult.frameAnalysis?.lightingType;
      
      if (fromLighting !== toLighting) {
        config.duration = Math.max(config.duration, 0.8);
      }
    }
    
    return config;
  }
  
  private colorsAreSimilar(color1: string, color2: string): boolean {
    return color1.toLowerCase() === color2.toLowerCase();
  }
  
  private calculateConfidence(
    config: TransitionConfig,
    fromScene: { analysisResult?: Phase8AnalysisResult },
    toScene: { analysisResult?: Phase8AnalysisResult }
  ): number {
    let confidence = 0.7;
    
    if (fromScene.analysisResult && toScene.analysisResult) {
      confidence += 0.2;
    }
    
    if (config.type === 'dissolve' || config.type === 'fade') {
      confidence += 0.05;
    }
    
    return Math.min(confidence, 1.0);
  }
  
  getRemotionTransitionProps(transition: SceneTransition, fps: number = 30): {
    type: string;
    durationFrames: number;
    easing: string;
  } {
    return {
      type: transition.config.type,
      durationFrames: Math.round(transition.config.duration * fps),
      easing: transition.config.easing,
    };
  }
  
  exportForRemotionProps(plan: TransitionPlan): Array<{
    fromScene: number;
    toScene: number;
    type: string;
    durationFrames: number;
    easing: string;
    audioCrossfade: boolean;
    audioCrossfadeDuration: number;
  }> {
    const fps = 30;
    return plan.transitions.map(t => ({
      fromScene: t.fromSceneIndex,
      toScene: t.toSceneIndex,
      type: t.config.type,
      durationFrames: Math.round(t.config.duration * fps),
      easing: t.config.easing,
      audioCrossfade: t.config.audioCrossfade,
      audioCrossfadeDuration: t.config.audioCrossfadeDuration,
    }));
  }
  
  getMoodCoverage(): { covered: number; total: number; missing: string[] } {
    const moods: Mood[] = ['attention', 'concern', 'frustration', 'hope', 'optimism', 'interest', 'learning', 'trust', 'engagement', 'atmosphere', 'identity', 'action', 'closure'];
    const totalPairs = moods.length * moods.length;
    let covered = 0;
    const missing: string[] = [];
    
    for (const from of moods) {
      for (const to of moods) {
        const key = `${from}→${to}`;
        if (MOOD_TRANSITIONS.has(key)) {
          covered++;
        } else {
          missing.push(key);
        }
      }
    }
    
    return { covered, total: totalPairs, missing };
  }
  
  getRemotionTransition(transitionType: TransitionType): string {
    const remotionMap: Record<TransitionType, string> = {
      'cut': 'none',
      'fade': 'fade',
      'dissolve': 'dissolve',
      'wipe-left': 'wipe',
      'wipe-right': 'wipe',
      'wipe-up': 'wipe',
      'wipe-down': 'wipe',
      'zoom-in': 'scale',
      'zoom-out': 'scale',
      'slide-left': 'slide',
      'slide-right': 'slide',
      'blur': 'blur',
    };
    return remotionMap[transitionType] || 'fade';
  }
  
  getAudioCrossfadeConfig(transition: SceneTransition): {
    enabled: boolean;
    duration: number;
    curve: 'linear' | 'exponential' | 'logarithmic';
  } {
    return {
      enabled: transition.config.audioCrossfade,
      duration: transition.config.audioCrossfadeDuration,
      curve: 'exponential',
    };
  }

  /**
   * Get the mood mapping for transitions
   */
  getMoodMapping(): Record<string, TransitionConfig> {
    const moodMapping: Record<string, TransitionConfig> = {};
    MOOD_TRANSITIONS.forEach((value, key) => {
      moodMapping[key] = value;
    });
    return moodMapping;
  }

  /**
   * Get available transition types
   */
  getAvailableTransitionTypes(): TransitionType[] {
    return ['cut', 'fade', 'dissolve', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'zoom-in', 'zoom-out', 'slide-left', 'slide-right', 'blur'];
  }

  /**
   * Get style preferences
   */
  getStylePreferences(): Record<string, Partial<TransitionConfig>> {
    return STYLE_PREFERENCES;
  }
}

export const transitionService = new TransitionService();
