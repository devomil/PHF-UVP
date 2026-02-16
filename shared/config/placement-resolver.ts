export interface ResolvedPosition {
  x: number;
  y: number;
  anchor: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
}

export interface ResolvedScale {
  value: number;
  maxWidth: number;
  maxHeight: number;
  minWidth: number;
}

export interface I2IConfig {
  strength: number;
  guidanceScale: number;
  preserveComposition: boolean;
  description: string;
}

export interface I2VConfig {
  motionPrompt: string;
  motionIntensity: 'subtle' | 'moderate' | 'dynamic';
  cameraMovement: string;
  duration: number;
  fps: number;
}

export function resolvePosition(
  typicalPosition: string,
  frameWidth: number = 1920,
  frameHeight: number = 1080
): ResolvedPosition {
  
  const positions: Record<string, ResolvedPosition> = {
    'full-frame': { x: 50, y: 50, anchor: 'center' },
    'background': { x: 50, y: 50, anchor: 'center' },
    'center': { x: 50, y: 50, anchor: 'center' },
    'flexible': { x: 50, y: 50, anchor: 'center' },
    
    'top-left': { x: 8, y: 8, anchor: 'top-left' },
    'top-right': { x: 92, y: 8, anchor: 'top-right' },
    'bottom-left': { x: 8, y: 92, anchor: 'bottom-left' },
    'bottom-right': { x: 92, y: 92, anchor: 'bottom-right' },
    'corner': { x: 92, y: 92, anchor: 'bottom-right' },
    
    'top-center': { x: 50, y: 8, anchor: 'top-center' },
    'bottom-center': { x: 50, y: 92, anchor: 'bottom-center' },
    'left-center': { x: 8, y: 50, anchor: 'center' },
    'right-center': { x: 92, y: 50, anchor: 'center' },
    
    'product-hero': { x: 50, y: 65, anchor: 'bottom-center' },
    'product-left': { x: 30, y: 70, anchor: 'bottom-center' },
    'product-right': { x: 70, y: 70, anchor: 'bottom-center' },
    
    'badge-row': { x: 15, y: 88, anchor: 'bottom-left' },
  };
  
  return positions[typicalPosition] || positions['center'];
}

export function resolveScale(
  typicalScale: string,
  frameWidth: number = 1920,
  frameHeight: number = 1080
): ResolvedScale {
  
  const scales: Record<string, ResolvedScale> = {
    'full': {
      value: 1.0,
      maxWidth: frameWidth,
      maxHeight: frameHeight,
      minWidth: Math.round(frameWidth * 0.9),
    },
    'large': {
      value: 0.7,
      maxWidth: Math.round(frameWidth * 0.6),
      maxHeight: Math.round(frameHeight * 0.7),
      minWidth: Math.round(frameWidth * 0.4),
    },
    'medium-large': {
      value: 0.55,
      maxWidth: Math.round(frameWidth * 0.5),
      maxHeight: Math.round(frameHeight * 0.55),
      minWidth: Math.round(frameWidth * 0.35),
    },
    'medium': {
      value: 0.4,
      maxWidth: Math.round(frameWidth * 0.35),
      maxHeight: Math.round(frameHeight * 0.4),
      minWidth: Math.round(frameWidth * 0.2),
    },
    'small': {
      value: 0.15,
      maxWidth: Math.round(frameWidth * 0.15),
      maxHeight: Math.round(frameHeight * 0.15),
      minWidth: Math.round(frameWidth * 0.08),
    },
    'tiny': {
      value: 0.08,
      maxWidth: Math.round(frameWidth * 0.08),
      maxHeight: Math.round(frameHeight * 0.08),
      minWidth: Math.round(frameWidth * 0.05),
    },
  };
  
  return scales[typicalScale] || scales['medium'];
}

export function getI2IConfig(
  assetCategory: string,
  assetType: string,
  useCase: 'background-generation' | 'style-transfer' | 'scene-integration' | 'product-placement'
): I2IConfig {
  
  const categoryDefaults: Record<string, I2IConfig> = {
    'location': {
      strength: 0.35,
      guidanceScale: 7.5,
      preserveComposition: true,
      description: 'Keep location recognizable, enhance lighting/atmosphere',
    },
    'products': {
      strength: 0.25,
      guidanceScale: 8.0,
      preserveComposition: true,
      description: 'Product must remain clearly visible and accurate',
    },
    'people': {
      strength: 0.30,
      guidanceScale: 7.0,
      preserveComposition: true,
      description: 'Person likeness must be preserved',
    },
    'logos': {
      strength: 0.15,
      guidanceScale: 9.0,
      preserveComposition: true,
      description: 'Logo must remain exact - minimal alterations',
    },
    'trust': {
      strength: 0.10,
      guidanceScale: 9.0,
      preserveComposition: true,
      description: 'Certifications must remain exact and readable',
    },
    'services': {
      strength: 0.40,
      guidanceScale: 7.0,
      preserveComposition: true,
      description: 'Equipment recognizable, environment can be enhanced',
    },
    'creative': {
      strength: 0.60,
      guidanceScale: 6.0,
      preserveComposition: false,
      description: 'Creative assets can be significantly adapted',
    },
    'documents': {
      strength: 0.20,
      guidanceScale: 8.0,
      preserveComposition: true,
      description: 'Document content must remain readable',
    },
    'social-proof': {
      strength: 0.25,
      guidanceScale: 7.5,
      preserveComposition: true,
      description: 'Maintain authenticity of testimonials and reviews',
    },
    'educational': {
      strength: 0.30,
      guidanceScale: 7.0,
      preserveComposition: true,
      description: 'Keep educational content clear and readable',
    },
    'seasonal': {
      strength: 0.50,
      guidanceScale: 6.5,
      preserveComposition: false,
      description: 'Seasonal themes can be creatively enhanced',
    },
    'lifestyle': {
      strength: 0.45,
      guidanceScale: 7.0,
      preserveComposition: true,
      description: 'Lifestyle imagery can be enhanced while maintaining authenticity',
    },
    'process': {
      strength: 0.35,
      guidanceScale: 7.5,
      preserveComposition: true,
      description: 'Manufacturing and process imagery should remain authentic',
    },
  };
  
  const useCaseAdjustments: Record<string, number> = {
    'background-generation': 0.15,
    'style-transfer': 0.10,
    'scene-integration': 0.05,
    'product-placement': -0.05,
  };
  
  const baseConfig = categoryDefaults[assetCategory] || categoryDefaults['creative'];
  const adjustment = useCaseAdjustments[useCase] || 0;
  
  return {
    ...baseConfig,
    strength: Math.min(0.9, Math.max(0.1, baseConfig.strength + adjustment)),
  };
}

export function getI2VConfig(
  animationStyle: string,
  assetCategory: string,
  sceneDuration: number = 5
): I2VConfig {
  
  const motionConfigs: Record<string, I2VConfig> = {
    'ken-burns': {
      motionPrompt: 'slow cinematic push in, subtle parallax movement, gentle lighting shifts',
      motionIntensity: 'subtle',
      cameraMovement: 'slow zoom in with slight pan',
      duration: sceneDuration,
      fps: 24,
    },
    'fade-in': {
      motionPrompt: 'gentle fade from dark, soft ambient motion, natural breathing movement',
      motionIntensity: 'subtle',
      cameraMovement: 'static with subtle drift',
      duration: sceneDuration,
      fps: 24,
    },
    'slide-in': {
      motionPrompt: 'smooth lateral movement, element slides into frame, graceful entrance',
      motionIntensity: 'moderate',
      cameraMovement: 'horizontal pan',
      duration: sceneDuration,
      fps: 30,
    },
    'zoom': {
      motionPrompt: 'dramatic zoom revealing detail, cinematic push, focus pull effect',
      motionIntensity: 'moderate',
      cameraMovement: 'push in zoom',
      duration: sceneDuration,
      fps: 30,
    },
    'none': {
      motionPrompt: 'static shot, no camera movement, subtle ambient motion only',
      motionIntensity: 'subtle',
      cameraMovement: 'locked off',
      duration: sceneDuration,
      fps: 24,
    },
    'dynamic': {
      motionPrompt: 'energetic movement, orbiting camera, reveal and explore',
      motionIntensity: 'dynamic',
      cameraMovement: 'orbit or tracking shot',
      duration: sceneDuration,
      fps: 30,
    },
    'parallax': {
      motionPrompt: 'multi-layer depth movement, foreground and background separation',
      motionIntensity: 'subtle',
      cameraMovement: 'lateral parallax shift',
      duration: sceneDuration,
      fps: 24,
    },
    'reveal': {
      motionPrompt: 'slow reveal from partial to full view, dramatic unveiling',
      motionIntensity: 'moderate',
      cameraMovement: 'pull back reveal',
      duration: sceneDuration,
      fps: 30,
    },
  };
  
  const categoryMotion: Record<string, string> = {
    'location': ', environment feels alive, natural light movement',
    'products': ', product remains stable and prominent, background has subtle motion',
    'people': ', natural human movement, breathing, subtle gestures',
    'services': ', equipment in use, professional demonstration feel',
    'lifestyle': ', authentic daily movement, natural activity',
    'process': ', working environment activity, machinery in motion',
  };
  
  const baseConfig = motionConfigs[animationStyle] || motionConfigs['ken-burns'];
  const categoryEnhancement = categoryMotion[assetCategory] || '';
  
  return {
    ...baseConfig,
    motionPrompt: baseConfig.motionPrompt + categoryEnhancement,
  };
}
