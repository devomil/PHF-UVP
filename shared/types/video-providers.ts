// Audio capabilities for providers with native audio generation (e.g., Kling 2.6)
export interface AudioCapabilities {
  voiceGeneration: boolean;     // Natural voice in Chinese/English
  soundEffects: boolean;        // Action sound effects
  ambientSound: boolean;        // Environmental ambience
  audioVisualSync: boolean;     // Frame-level audio-visual alignment
  supportedLanguages?: string[];
}

// Motion control capabilities for motion transfer (e.g., Kling 2.6 Motion Control)
export interface MotionControlCapabilities {
  motionTransfer: boolean;
  referenceVideoDuration: { min: number; max: number };
  maxAnimatedElements: number;
  audioPreservation: boolean;
  orientationModes: ('video' | 'image')[];
  supportedActions: string[];
}

export interface VideoProvider {
  id: string;
  name: string;
  version: string;
  
  capabilities: {
    // Generation modes
    imageToVideo: boolean;
    textToVideo: boolean;
    imageToImage: boolean;
    videoToVideo?: boolean;  // For motion control/transfer
    
    // Quality specs
    maxResolution: '720p' | '1080p' | '4k';
    maxFps: number;
    maxDuration: number;
    
    // Strengths/weaknesses
    strengths: ProviderStrength[];
    weaknesses: ProviderWeakness[];
    
    // Motion quality
    motionQuality: 'basic' | 'good' | 'excellent' | 'cinematic';
    temporalConsistency: 'low' | 'medium' | 'high';
    
    // Audio capabilities
    nativeAudio: boolean;
    lipSync: boolean;
    audioCapabilities?: AudioCapabilities;
    
    // Effects
    effectsPresets: string[];
    
    // Motion control
    motionControlCapabilities?: MotionControlCapabilities;
  };
  
  costPer10Seconds: number;
  
  apiProvider: 'piapi' | 'runway' | 'direct' | 'remotion';
  modelId: string;
  notes?: string;
}

export type ProviderStrength = 
  | 'human-faces'
  | 'human-motion'
  | 'hand-actions'
  | 'food-content'
  | 'product-shots'
  | 'nature-scenes'
  | 'cinematic'
  | 'stylized'
  | 'animated'
  | 'b-roll'
  | 'talking-heads'
  | 'text-rendering'
  | 'fast-motion'
  | 'slow-motion'
  | 'camera-movement'
  | 'motion-transfer'
  | 'native-audio';

export type ProviderWeakness =
  | 'specific-actions'
  | 'text-in-video'
  | 'complex-motion'
  | 'multiple-subjects'
  | 'fine-details'
  | 'translucent-materials'
  | 'physics-accuracy'
  | 'fast-motion'
  | 'cinematic'
  | 'product-shots'
  | 'nature-scenes';

export interface ComplexityAnalysis {
  score: number;
  category: 'simple' | 'moderate' | 'complex' | 'impossible';
  
  factors: {
    specificAction: {
      detected: boolean;
      description: string;
      difficulty: 'easy' | 'hard' | 'very-hard';
    };
    
    materialProperties: {
      detected: boolean;
      properties: string[];
      difficulty: 'easy' | 'hard' | 'very-hard';
    };
    
    motionRequirements: {
      detected: boolean;
      type: string;
      difficulty: 'easy' | 'hard' | 'very-hard';
    };
    
    elementCount: number;
    temporalSequence: boolean;
  };
  
  recommendations: {
    simplifiedPrompt?: string;
    alternativeApproach?: 'reference-image' | 'stock-footage' | 'motion-graphics';
    bestProviders: string[];
    avoidProviders: string[];
  };
  
  userWarning?: string;
}

export interface RoutingDecision {
  recommendedProvider: string;
  confidence: number;
  reasoning: string[];
  
  alternatives: Array<{
    provider: string;
    reason: string;
  }>;
  
  warnings: string[];
  complexity: ComplexityAnalysis;
}
