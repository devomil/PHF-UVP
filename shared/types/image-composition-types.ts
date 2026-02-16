export interface CompositionRequest {
  sceneId: string;
  visualDirection: string;
  
  environment: {
    prompt: string;
    style: 'photorealistic' | 'lifestyle' | 'studio' | 'natural';
    lighting: 'warm' | 'cool' | 'natural' | 'dramatic' | 'soft';
    colorPalette?: string[];
  };
  
  products: ProductPlacement[];
  
  logoOverlay?: {
    assetId: string;
    position: LogoPosition;
    size: 'small' | 'medium' | 'large';
    opacity: number;
  };
  
  output: {
    width: number;
    height: number;
    format: 'png' | 'jpg' | 'webp';
    quality: number;
  };
  
  skipProductComposition?: boolean;
  backgroundImage?: string;
}

export interface ProductPlacement {
  assetId: string;
  assetUrl: string;
  
  position: {
    x: number;
    y: number;
    anchor: 'center' | 'bottom-center' | 'top-center';
  };
  
  scale: number;
  maxWidth?: number;
  maxHeight?: number;
  
  rotation?: number;
  flip?: 'horizontal' | 'vertical' | 'none';
  
  shadow: {
    enabled: boolean;
    angle: number;
    blur: number;
    opacity: number;
  };
  
  zIndex: number;
}

export type LogoPosition = 
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface CompositionResult {
  success: boolean;
  imageUrl: string;
  width: number;
  height: number;
  
  compositionData: {
    productRegions: Array<{
      productId: string;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
    environmentPrompt: string;
  };
  
  error?: string;
}

export interface PreparedProductLayer extends ProductPlacement {
  buffer: Buffer;
  finalBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
