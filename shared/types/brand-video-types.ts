export type MotionStyle = 
  | 'environmental'
  | 'subtle'
  | 'reveal'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan'
  | 'static';

export interface ImageToVideoRequest {
  sourceImageUrl: string;
  sourceType: 'composed' | 'brand-asset' | 'product-photo';
  assetType?: string;
  
  sceneId: string;
  visualDirection: string;
  qualityTier?: 'ultra' | 'premium' | 'standard';
  provider?: string;
  
  motion: {
    style: MotionStyle;
    intensity: 'minimal' | 'low' | 'medium';
    duration: number;
    
    cameraMovement?: {
      direction: 'left' | 'right' | 'up' | 'down' | 'push' | 'pull';
      distance: 'subtle' | 'moderate';
    };
    
    environmentalEffects?: {
      lightFlicker: boolean;
      plantMovement: boolean;
      particleDust: boolean;
    };
    
    revealDirection?: 'left' | 'right' | 'bottom' | 'top' | 'center';
  };
  
  productRegions?: Array<{
    bounds: { x: number; y: number; width: number; height: number };
    importance: 'critical' | 'high' | 'medium';
  }>;
  
  output: {
    width: number;
    height: number;
    fps: 24 | 30;
    format: 'mp4' | 'webm';
  };
}

export interface ImageToVideoResult {
  success: boolean;
  videoUrl: string;
  duration: number;
  
  quality: {
    motionSmoothness: number;
    productStability: number;
    overallScore: number;
  };
  
  error?: string;
  provider: string;
}

export interface I2VProviderCapabilities {
  name: string;
  supportedMotionStyles: MotionStyle[];
  maxDuration: number;
  motionControl: 'prompt-only' | 'basic' | 'advanced';
  bestFor: string[];
  costPer10Seconds: number;
}

export interface MotionDetectionResult {
  style: MotionStyle;
  intensity: 'minimal' | 'low' | 'medium';
  cameraMovement?: {
    direction: 'left' | 'right' | 'up' | 'down' | 'push' | 'pull';
    distance: 'subtle' | 'moderate';
  };
  environmentalEffects?: {
    lightFlicker: boolean;
    plantMovement: boolean;
    particleDust: boolean;
  };
  revealDirection?: 'left' | 'right' | 'bottom' | 'top' | 'center';
}
