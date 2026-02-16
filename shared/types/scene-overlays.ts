export type SceneType = 'hook' | 'problem' | 'solution' | 'benefit' | 'proof' | 'cta' | 'standard';
export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
export type TextPosition = 'top' | 'center' | 'bottom' | 'lower-third';
export type LowerThirdPosition = 'left' | 'center' | 'right';
export type AnimationType = 'fade' | 'zoom' | 'slide' | 'none';
export type TextAnimationType = 'fade' | 'typewriter' | 'slide-up' | 'slide-left' | 'none';

export interface OverlayTiming {
  startTime: number;
  duration: number;
}

export interface LogoOverlayConfig {
  enabled: boolean;
  url: string;
  position: LogoPosition;
  size: number;
  opacity: number;
  animation: AnimationType;
  timing: OverlayTiming;
}

export interface WatermarkConfig {
  enabled: boolean;
  url: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size: number;
  opacity: number;
}

export interface TextOverlayStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
}

export interface TextOverlayAnimation {
  type: TextAnimationType;
  duration: number;
  delay: number;
}

export interface TextOverlayConfig {
  id: string;
  text: string;
  position: TextPosition;
  style: TextOverlayStyle;
  animation: TextOverlayAnimation;
  timing: OverlayTiming;
}

export interface CTAOverlayConfig {
  enabled: boolean;
  headline: string;
  subheadline?: string;
  website?: string;
  phone?: string;
  buttonText?: string;
  backgroundColor: string;
  textColor: string;
  timing: {
    startTime: number;
    fadeInDuration: number;
  };
}

export interface LowerThirdStyle {
  backgroundColor: string;
  accentColor: string;
  textColor: string;
}

export interface LowerThirdConfig {
  enabled: boolean;
  title: string;
  subtitle?: string;
  position: LowerThirdPosition;
  style: LowerThirdStyle;
  timing: OverlayTiming;
}

export interface BadgePosition {
  x: number;
  y: number;
}

export interface BadgeConfig {
  url: string;
  position: BadgePosition;
  size: number;
  timing: OverlayTiming;
}

export interface EndCardConfig {
  enabled: boolean;
  logoUrl: string;
  headline: string;
  website: string;
  socialIcons?: Array<{ platform: string; url: string }>;
  backgroundColor: string;
  duration: number;
}

export interface SceneOverlayConfig {
  sceneId: string;
  sceneType: SceneType;
  logo?: LogoOverlayConfig;
  watermark?: WatermarkConfig;
  textOverlays?: TextOverlayConfig[];
  ctaOverlay?: CTAOverlayConfig;
  lowerThird?: LowerThirdConfig;
  badges?: BadgeConfig[];
  endCard?: EndCardConfig;
}

export interface SceneRenderData {
  id: string;
  mediaUrl: string;
  mediaType: 'video' | 'image';
  durationInFrames: number;
  startFrame: number;
  overlays: SceneOverlayConfig;
  voiceoverUrl?: string;
  soundEffectsUrl?: string;
}

export interface CompositionProps {
  scenes: SceneRenderData[];
  musicUrl?: string;
  musicVolume: number;
  fps: number;
  width: number;
  height: number;
}
