export type LogoType = 
  | 'primary'
  | 'watermark'
  | 'certification'
  | 'partner';

export type LogoPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'lower-third-left' | 'lower-third-right'
  | 'custom';

export type LogoAnimation =
  | 'none'
  | 'fade-in'
  | 'slide-in'
  | 'scale-up'
  | 'fade-out-end'
  | 'pulse';

export interface LogoShadow {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface LogoPlacement {
  logoType: LogoType;
  assetId?: string;
  assetUrl?: string;
  position: LogoPosition;
  customPosition?: { x: number; y: number };
  size: 'small' | 'medium' | 'large' | 'xlarge';
  maxWidthPercent?: number;
  maxHeightPercent?: number;
  opacity: number;
  shadow?: LogoShadow;
  animation: LogoAnimation;
  animationDuration?: number;
  animationDelay?: number;
  startFrame?: number;
  endFrame?: number;
  avoidRegions?: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface LogoCompositionConfig {
  sceneId: string;
  sceneDuration: number;
  fps: number;
  width: number;
  height: number;
  logos: LogoPlacement[];
  safeZoneMargin: number;
  respectProductRegions: boolean;
  productRegions?: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface LogoAssetInfo {
  id: string;
  url: string;
  width: number;
  height: number;
  hasTransparency: boolean;
  type: LogoType;
  name: string;
}

export interface CalculatedLogoPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LogoRemotionProps {
  logoUrl: string;
  placement: CalculatedLogoPosition & { opacity: number };
  animation: LogoAnimation;
  animationDuration: number;
  animationDelay: number;
  startFrame: number;
  endFrame?: number;
  shadow?: LogoShadow;
}
