import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  staticFile,
} from "remotion";
import type {
  Scene,
  MicroScene,
  BrandSettings,
  TextOverlay,
  TextLabel,
  OutputFormat,
  SceneSoundDesign,
  AssemblyManifest,
} from "../shared/video-types";

import { EnhancedTextOverlay } from "./components/TextOverlay";
import { LogoOverlay } from "./components/LogoOverlay";
import { WatermarkOverlay } from "./components/WatermarkOverlay";
import { KenBurnsImage } from "./components/KenBurnsImage";
import { CustomImageOverlay } from "./components/CustomImageOverlay";
import { CustomTextOverlay } from "./components/CustomTextOverlay";
import { MicroSceneOverlayCompositor } from "./components/MicroSceneOverlayCompositor";
import { MotionGraphicsScene } from "./compositions/MotionGraphicsScene";
import { AnimatedEndCard } from "./components/endcard/AnimatedEndCard";
import { EndCardConfig, DEFAULT_END_CARD_CONFIG } from "../shared/config/end-card";
import { SoundDesignLayer } from "./components/audio/SoundDesignLayer";
import { DuckedMusic, VolumeKeyframe, type NativeAudioRange } from "./components/audio/DuckedMusic";
import { TransitionConfig, SoundDesignConfig, DEFAULT_SOUND_CONFIG } from "../shared/config/sound-design";
import { SoundDesignConfig as Phase18DSoundDesignConfig, TransitionSound, DEFAULT_SOUND_DESIGN_CONFIG } from "../shared/types/sound-design";
import { FilmTreatment, FilmTreatmentConfig, FILM_TREATMENT_PRESETS } from "./components/post-processing";
import { SyncedCaptions } from "./components/captions/SyncedCaptions";
import type { CaptionStyle } from "../shared/config/caption-styles";
import { TextLabelOverlay } from "./components/overlays/TextLabelOverlay";

// Phase 18B: Scene overlay configurations from overlay-configuration-service
import type { SceneOverlayConfig } from '../shared/types/scene-overlays';

export interface UniversalVideoProps {
  scenes: Scene[];
  voiceoverUrl: string | null;
  musicUrl: string | null;
  musicVolume: number;
  brand: BrandSettings;
  outputFormat: OutputFormat;
  endCardConfig?: EndCardConfig;
  soundDesignConfig?: SoundDesignConfig;
  audioDuckingKeyframes?: VolumeKeyframe[];
  transitions?: TransitionConfig[];
  sceneOverlayConfigs?: Record<string, SceneOverlayConfig>;
  voiceoverRanges?: Array<{ startFrame: number; endFrame: number }>;
  soundEffectsBaseUrl?: string;
  filmTreatmentConfig?: FilmTreatmentConfig;
  captionStyle?: CaptionStyle | null;
}

// ============================================================
// ASSET VALIDATION UTILITIES
// ============================================================

function isValidHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('https://') || url.startsWith('http://');
}

function isDataUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('data:');
}

function getAssetStatus(url: string | null | undefined): 'valid' | 'data-url' | 'local-path' | 'missing' {
  if (!url) return 'missing';
  if (isValidHttpUrl(url)) return 'valid';
  if (isDataUrl(url)) return 'data-url';
  return 'local-path';
}

// ============================================================
// ERROR PLACEHOLDER COMPONENTS
// ============================================================

const AssetErrorPlaceholder: React.FC<{
  type: 'image' | 'audio' | 'video';
  sceneId: string;
  url?: string;
  brand: BrandSettings;
}> = ({ type, sceneId, url, brand }) => {
  const status = getAssetStatus(url);
  
  const errorMessages: Record<string, string> = {
    'missing': `No ${type} URL provided`,
    'data-url': `${type} is base64 (not Lambda-compatible)`,
    'local-path': `${type} uses local path (not Lambda-accessible)`,
  };
  
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${brand.colors.primary} 0%, #1a1a2e 100%)`,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(255, 100, 100, 0.15)',
          border: '2px solid rgba(255, 100, 100, 0.5)',
          borderRadius: 16,
          padding: 40,
          maxWidth: '80%',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 20 }}>⚠️</div>
        <div
          style={{
            color: '#ff6b6b',
            fontSize: 28,
            fontWeight: 700,
            fontFamily: brand.fonts.heading,
            marginBottom: 12,
          }}
        >
          Asset Error: {type.toUpperCase()}
        </div>
        <div
          style={{
            color: '#ffffff',
            fontSize: 20,
            fontFamily: brand.fonts.body,
            opacity: 0.9,
            marginBottom: 16,
          }}
        >
          {errorMessages[status] || 'Unknown error'}
        </div>
        <div
          style={{
            color: '#888',
            fontSize: 14,
            fontFamily: 'monospace',
            wordBreak: 'break-all',
          }}
        >
          Scene: {sceneId}
          {url && (
            <>
              <br />
              URL: {url.substring(0, 80)}...
            </>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Gradient fallback when video/image is missing
// Uses dynamic brand colors for professional branded look
const GradientFallback: React.FC<{ brand: BrandSettings; sceneType: string }> = ({ brand, sceneType }) => {
  const primary = brand?.colors?.primary || '#2d5a27';
  const secondary = brand?.colors?.secondary || '#607e66';
  const accent = brand?.colors?.accent || '#c9a227';
  const dark1 = '#1a1a2e';
  const dark2 = '#16213e';
  const dark3 = '#0f3460';
  
  const gradients: Record<string, string> = {
    hook: `linear-gradient(135deg, ${dark1} 0%, ${primary} 50%, ${secondary} 100%)`,
    intro: `linear-gradient(180deg, ${primary} 0%, ${accent} 30%, ${secondary} 100%)`,
    benefit: `linear-gradient(135deg, ${dark3} 0%, ${primary} 50%, ${secondary} 100%)`,
    feature: `linear-gradient(135deg, ${accent} 0%, ${primary} 50%, ${dark2} 100%)`,
    cta: `linear-gradient(135deg, ${primary} 0%, ${accent} 40%, ${primary} 100%)`,
    testimonial: `linear-gradient(135deg, ${dark2} 0%, ${secondary} 100%)`,
    brand: `linear-gradient(180deg, ${primary} 0%, ${secondary} 50%, ${accent} 100%)`,
    outro: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
    default: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
  };
  
  return (
    <AbsoluteFill
      style={{
        background: gradients[sceneType] || gradients.default,
      }}
    />
  );
};

// ============================================================
// SAFE IMAGE COMPONENT
// ============================================================

const SafeImage: React.FC<{
  src: string | undefined;
  style?: React.CSSProperties;
  fallback: React.ReactNode;
  onError?: () => void;
}> = ({ src, style, fallback, onError }) => {
  const [hasError, setHasError] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  
  // Check URL validity before even trying to load
  if (!src || !isValidHttpUrl(src)) {
    return <>{fallback}</>;
  }
  
  if (hasError) {
    return <>{fallback}</>;
  }
  
  return (
    <Img
      src={src}
      style={style}
      onError={() => {
        console.error(`[Remotion] Image failed to load: ${src}`);
        setHasError(true);
        onError?.();
      }}
    />
  );
};

// ============================================================
// SAFE AUDIO COMPONENT - SUPPORTS STATIC AND DUCKING VOLUMES
// ============================================================

const SafeAudio: React.FC<{
  src: string | null | undefined;
  volume: number;
  label: string;
}> = ({ src, volume, label }) => {
  const status = getAssetStatus(src);
  
  if (status !== 'valid') {
    console.warn(`[Remotion] ${label} audio skipped - ${status}: ${src?.substring(0, 50)}`);
    return null;
  }
  
  return <Audio src={src!} volume={volume} />;
};

// Music with ducking during voiceover
const DuckedMusicAudio: React.FC<{
  src: string | null | undefined;
  baseVolume: number;
  duckedVolume: number;
  hasVoiceover: boolean;
  label: string;
}> = ({ src, baseVolume, duckedVolume, hasVoiceover, label }) => {
  const status = getAssetStatus(src);
  
  if (status !== 'valid') {
    console.warn(`[Remotion] ${label} audio skipped - ${status}: ${src?.substring(0, 50)}`);
    return null;
  }
  
  // If voiceover exists, duck the music for the entire duration
  // Since voiceover plays continuously, use ducked volume
  const volume = hasVoiceover ? duckedVolume : baseVolume;
  
  return <Audio src={src!} volume={volume} />;
};

// ============================================================
// EASING FUNCTIONS FOR SMOOTHER MOTION
// ============================================================

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ============================================================
// TEXT OVERLAY COMPONENT - ENHANCED WITH TV-QUALITY ANIMATIONS
// ============================================================

const TextOverlayComponent: React.FC<{
  overlay: TextOverlay;
  brand: BrandSettings;
  sceneFrame: number;
  fps: number;
}> = ({ overlay, brand, sceneFrame, fps }) => {
  // Safety check
  if (!overlay || !overlay.timing) {
    console.warn('[Remotion] Invalid text overlay config');
    return null;
  }
  
  const startFrame = (overlay.timing.startAt || 0) * fps;
  const durationFrames = (overlay.timing.duration || 3) * fps;
  const endFrame = startFrame + durationFrames;
  const animDuration = (overlay.animation?.duration || 0.5) * fps;

  if (sceneFrame < startFrame || sceneFrame > endFrame) {
    return null;
  }

  const localFrame = sceneFrame - startFrame;

  let opacity = 1;
  let translateY = 0;
  let translateX = 0;
  let scale = 1;
  let blur = 0;

  // ENHANCED ENTER ANIMATIONS with smooth easing
  if (localFrame < animDuration) {
    const progress = localFrame / animDuration;
    const eased = easeOutCubic(progress);
    
    switch (overlay.animation?.enter || 'fade') {
      case 'fade':
        opacity = eased;
        scale = interpolate(eased, [0, 1], [0.95, 1]);
        break;
      case 'slide-up':
        opacity = eased;
        translateY = interpolate(eased, [0, 1], [60, 0]);
        break;
      case 'slide-left':
        opacity = eased;
        translateX = interpolate(eased, [0, 1], [100, 0]);
        break;
      case 'slide-right':
        opacity = eased;
        translateX = interpolate(eased, [0, 1], [-100, 0]);
        break;
      case 'scale':
        opacity = eased;
        scale = interpolate(eased, [0, 1], [0.3, 1]);
        blur = interpolate(eased, [0, 1], [10, 0]);
        break;
      case 'pop':
        opacity = eased;
        scale = spring({
          frame: localFrame,
          fps,
          config: { damping: 10, stiffness: 200 },
        });
        break;
      case 'blur-in':
        opacity = eased;
        blur = interpolate(eased, [0, 1], [20, 0]);
        break;
      case 'typewriter':
        opacity = 1;
        break;
    }
  }

  // ENHANCED EXIT ANIMATIONS with smooth easing
  const exitStart = durationFrames - animDuration;
  if (localFrame > exitStart) {
    const exitProgress = (localFrame - exitStart) / animDuration;
    const eased = easeInCubic(exitProgress);
    
    switch (overlay.animation?.exit || 'fade') {
      case 'fade':
        opacity = 1 - eased;
        break;
      case 'slide-down':
        opacity = 1 - eased;
        translateY = interpolate(eased, [0, 1], [0, 40]);
        break;
      case 'slide-up':
        opacity = 1 - eased;
        translateY = interpolate(eased, [0, 1], [0, -40]);
        break;
      case 'scale':
        opacity = 1 - eased;
        scale = interpolate(eased, [0, 1], [1, 0.9]);
        break;
      case 'blur-out':
        opacity = 1 - eased;
        blur = interpolate(eased, [0, 1], [0, 15]);
        break;
    }
  }

  const getStyleByType = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      fontFamily: brand.fonts.body,
      color: brand.colors.textLight,
      textShadow: '2px 2px 8px rgba(0,0,0,0.8)',
      textAlign: (overlay.position?.horizontal || 'center') as any,
      maxWidth: '80%',
    };

    switch (overlay.style) {
      case 'title':
        return { ...baseStyle, fontSize: 72, fontWeight: brand.fonts.weight.heading, letterSpacing: '-0.02em' };
      case 'headline':
        return { ...baseStyle, fontSize: 56, fontWeight: brand.fonts.weight.heading };
      case 'subtitle':
        return { ...baseStyle, fontSize: 40, fontWeight: 500 };
      case 'body':
        return { ...baseStyle, fontSize: 32, fontWeight: brand.fonts.weight.body, lineHeight: 1.4 };
      case 'bullet':
        return { ...baseStyle, fontSize: 36, fontWeight: 500, paddingLeft: 20 };
      case 'caption':
        return { ...baseStyle, fontSize: 28, fontWeight: 400, opacity: 0.9 };
      case 'cta':
        return { ...baseStyle, fontSize: 48, fontWeight: 700, color: brand.colors.accent, textShadow: '3px 3px 10px rgba(0,0,0,0.9)' };
      case 'quote':
        return { ...baseStyle, fontSize: 44, fontStyle: 'italic', fontWeight: 400 };
      default:
        return baseStyle;
    }
  };

  const getPosition = (): React.CSSProperties => {
    const pos: React.CSSProperties = {
      position: 'absolute',
      padding: overlay.position?.padding || 60,
      display: 'flex',
      justifyContent: overlay.position?.horizontal === 'left' ? 'flex-start' :
                      overlay.position?.horizontal === 'right' ? 'flex-end' : 'center',
      width: '100%',
      boxSizing: 'border-box',
    };

    switch (overlay.position?.vertical || 'center') {
      case 'top': pos.top = 60; break;
      case 'center': pos.top = '50%'; pos.transform = 'translateY(-50%)'; break;
      case 'bottom': pos.bottom = 100; break;
      case 'lower-third': pos.bottom = 180; break;
    }

    return pos;
  };

  return (
    <div
      style={{
        ...getPosition(),
        opacity,
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        willChange: 'transform, opacity, filter',
      }}
    >
      <div style={getStyleByType()}>
        {overlay.text || ''}
      </div>
    </div>
  );
};

// ============================================================
// INTELLIGENT TEXT OVERLAY - AI-POWERED POSITIONING
// ============================================================

interface TextOverlayInstruction {
  text: string;
  position: {
    x: number;
    y: number;
    anchor: string;
  };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    textShadow?: string;
    backgroundColor?: string;
    padding?: string;
  };
  animation: {
    enter: string;
    exit: string;
    enterDuration: number;
    exitDuration: number;
    enterDelay: number;
  };
}

interface KenBurnsInstruction {
  enabled: boolean;
  startScale: number;
  endScale: number;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

interface TransitionInstruction {
  type: 'fade' | 'crossfade' | 'dissolve' | 'wipe-left' | 'wipe-right' | 'zoom' | 'slide-left' | 'slide-right' | 'none';
  duration: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

interface SceneCompositionInstructions {
  sceneId: string;
  textOverlays: TextOverlayInstruction[];
  productOverlay?: {
    enabled: boolean;
    position: { x: number; y: number; anchor: string };
    scale: number;
    animation: string;
    shadow: boolean;
  };
  kenBurns?: KenBurnsInstruction;
  transitionIn?: TransitionInstruction;
  transitionOut?: TransitionInstruction;
}

const IntelligentTextOverlay: React.FC<{
  instruction: TextOverlayInstruction;
  sceneDuration: number;
  fps: number;
  brand: BrandSettings;
}> = ({ instruction, sceneDuration, fps, brand }) => {
  const frame = useCurrentFrame();
  
  const enterFrames = instruction.animation.enterDuration * fps;
  const exitFrames = instruction.animation.exitDuration * fps;
  const delayFrames = instruction.animation.enterDelay * fps;
  const totalFrames = sceneDuration * fps;
  
  let opacity = 0;
  const adjustedFrame = frame - delayFrames;
  
  if (adjustedFrame < 0) {
    opacity = 0;
  } else if (adjustedFrame < enterFrames) {
    opacity = adjustedFrame / enterFrames;
  } else if (adjustedFrame > totalFrames - exitFrames) {
    opacity = Math.max(0, (totalFrames - adjustedFrame) / exitFrames);
  } else {
    opacity = 1;
  }
  
  const getAnimationTransform = (): string => {
    const transforms: string[] = [];
    
    if (instruction.animation.enter === 'slide-up' && adjustedFrame >= 0 && adjustedFrame < enterFrames) {
      const progress = adjustedFrame / enterFrames;
      const translateY = (1 - easeOutCubic(progress)) * 30;
      transforms.push(`translateY(${translateY}px)`);
    } else if (instruction.animation.enter === 'zoom' && adjustedFrame >= 0 && adjustedFrame < enterFrames) {
      const progress = adjustedFrame / enterFrames;
      const scale = 0.8 + (easeOutCubic(progress) * 0.2);
      transforms.push(`scale(${scale})`);
    }
    
    return transforms.join(' ');
  };
  
  const getPositionStyle = (): { style: React.CSSProperties; anchorTransform: string } => {
    const { x, y, anchor } = instruction.position;
    const style: React.CSSProperties = { position: 'absolute' };
    const anchorTransforms: string[] = [];
    
    if (anchor.includes('left')) {
      style.left = `${x}%`;
    } else if (anchor.includes('right')) {
      style.right = `${100 - x}%`;
    } else {
      style.left = `${x}%`;
      anchorTransforms.push('translateX(-50%)');
    }
    
    if (anchor.includes('top')) {
      style.top = `${y}%`;
    } else if (anchor.includes('bottom')) {
      style.bottom = `${100 - y}%`;
    } else {
      style.top = `${y}%`;
      anchorTransforms.push('translateY(-50%)');
    }
    
    return { style, anchorTransform: anchorTransforms.join(' ') };
  };
  
  if (opacity <= 0) return null;
  
  const { style: positionStyle, anchorTransform } = getPositionStyle();
  const animationTransform = getAnimationTransform();
  const combinedTransform = [anchorTransform, animationTransform].filter(Boolean).join(' ') || undefined;
  
  return (
    <div
      style={{
        ...positionStyle,
        opacity,
        transform: combinedTransform,
        fontSize: instruction.style.fontSize,
        fontWeight: instruction.style.fontWeight as any,
        fontFamily: brand.fonts.body,
        color: instruction.style.color || '#ffffff',
        textShadow: instruction.style.textShadow || '2px 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)',

        maxWidth: '80%',
        textAlign: 'center',
        lineHeight: 1.3,
      }}
    >
      {instruction.text}
    </div>
  );
};

const IntelligentProductOverlay: React.FC<{
  productImage: string;
  instruction: SceneCompositionInstructions['productOverlay'];
  sceneDuration: number;
  fps: number;
}> = ({ productImage, instruction, sceneDuration, fps }) => {
  const frame = useCurrentFrame();
  
  if (!instruction?.enabled || !productImage) {
    return null;
  }
  
  const enterFrames = 0.5 * fps;
  const exitFrames = 0.3 * fps;
  const totalFrames = sceneDuration * fps;
  
  let opacity = 0;
  if (frame < enterFrames) {
    opacity = frame / enterFrames;
  } else if (frame > totalFrames - exitFrames) {
    opacity = Math.max(0, (totalFrames - frame) / exitFrames);
  } else {
    opacity = 1;
  }
  
  let scale = instruction.scale;
  if (instruction.animation === 'zoom' && frame < enterFrames) {
    const progress = frame / enterFrames;
    scale = instruction.scale * (0.8 + (easeOutCubic(progress) * 0.2));
  }
  
  const { x, y, anchor } = instruction.position;
  
  if (opacity <= 0) return null;
  
  const getPositionStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = { position: 'absolute' };
    
    if (anchor.includes('left')) {
      style.left = `${x}%`;
    } else if (anchor.includes('right')) {
      style.right = `${100 - x}%`;
    } else {
      style.left = `${x}%`;
      style.transform = 'translateX(-50%)';
    }
    
    if (anchor.includes('top')) {
      style.top = `${y}%`;
    } else if (anchor.includes('bottom')) {
      style.bottom = `${100 - y}%`;
    } else {
      style.top = `${y}%`;
      style.transform = (style.transform || '') + ' translateY(-50%)';
    }
    
    return style;
  };
  
  const positionStyle = getPositionStyle();
  const existingTransform = positionStyle.transform || '';
  const scaleTransform = `scale(${scale})`;
  const combinedTransform = [existingTransform, scaleTransform].filter(Boolean).join(' ');
  
  return (
    <div
      style={{
        ...positionStyle,
        opacity,
        transform: combinedTransform,
        filter: instruction.shadow ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' : undefined,
      }}
    >
      <Img
        src={productImage}
        style={{
          maxWidth: 200,
          maxHeight: 200,
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

// ============================================================
// KEN BURNS BACKGROUND - AI-POWERED FOCAL POINT MOTION
// ============================================================

function applyKenBurnsEasing(t: number, easing: KenBurnsInstruction['easing']): number {
  switch (easing) {
    case 'ease-in': return t * t;
    case 'ease-out': return t * (2 - t);
    case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t;
  }
}

const KenBurnsBackground: React.FC<{
  src: string;
  isVideo: boolean;
  instruction: KenBurnsInstruction;
  sceneDuration: number;
  fps: number;
  fallback: React.ReactNode;
}> = ({ src, isVideo, instruction, sceneDuration, fps, fallback }) => {
  const frame = useCurrentFrame();
  const totalFrames = sceneDuration * fps;
  
  if (!instruction.enabled) {
    if (isVideo) {
      return (
        <OffthreadVideo
          src={src}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          muted
          startFrom={3}
        />
      );
    }
    return (
      <SafeImage
        src={src}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        fallback={fallback}
      />
    );
  }
  
  let progress = frame / totalFrames;
  progress = Math.min(1, Math.max(0, progress));
  progress = applyKenBurnsEasing(progress, instruction.easing);
  
  const scale = interpolate(
    progress, 
    [0, 1], 
    [instruction.startScale, instruction.endScale], 
    { extrapolateRight: 'clamp' }
  );
  
  const startOffsetX = (instruction.startPosition.x - 50) * 0.5;
  const endOffsetX = (instruction.endPosition.x - 50) * 0.5;
  const startOffsetY = (instruction.startPosition.y - 50) * 0.5;
  const endOffsetY = (instruction.endPosition.y - 50) * 0.5;
  
  const translateX = interpolate(
    progress, 
    [0, 1], 
    [startOffsetX, endOffsetX], 
    { extrapolateRight: 'clamp' }
  );
  
  const translateY = interpolate(
    progress, 
    [0, 1], 
    [startOffsetY, endOffsetY], 
    { extrapolateRight: 'clamp' }
  );
  
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `translate(${-translateX}%, ${-translateY}%) scale(${scale})`,
    transformOrigin: 'center center',
  };
  
  if (isVideo) {
    return (
      <OffthreadVideo
        src={src}
        style={style}
        muted
        startFrom={3}
      />
    );
  }
  
  return (
    <SafeImage
      src={src}
      style={style}
      fallback={fallback}
    />
  );
};

// ============================================================
// SCENE TRANSITION WRAPPER - MOOD-BASED TRANSITIONS
// ============================================================

const SceneTransitionWrapper: React.FC<{
  children: React.ReactNode;
  transitionIn?: TransitionInstruction;
  transitionOut?: TransitionInstruction;
  sceneDuration: number;
  fps: number;
  isFirst: boolean;
  isLast: boolean;
}> = ({ children, transitionIn, transitionOut, sceneDuration, fps, isFirst, isLast }) => {
  const frame = useCurrentFrame();
  const totalFrames = sceneDuration * fps;
  
  const defaultIn: TransitionInstruction = { type: 'fade', duration: 0.5, easing: 'ease-out' };
  const defaultOut: TransitionInstruction = { type: 'fade', duration: 0.5, easing: 'ease-in' };
  
  const inTransition = transitionIn || defaultIn;
  const outTransition = transitionOut || defaultOut;
  
  const inFrames = inTransition.duration * fps;
  const outFrames = outTransition.duration * fps;
  
  let opacity = 1;
  let transform = '';
  
  const applyTransitionEasing = (t: number, easing: TransitionInstruction['easing']): number => {
    switch (easing) {
      case 'ease-in': return t * t;
      case 'ease-out': return t * (2 - t);
      case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default: return t;
    }
  };
  
  if (!isFirst && frame < inFrames) {
    const rawProgress = frame / inFrames;
    const p = applyTransitionEasing(rawProgress, inTransition.easing);
    
    switch (inTransition.type) {
      case 'fade':
      case 'crossfade':
      case 'dissolve':
        opacity = p;
        break;
      case 'zoom':
        opacity = p;
        const zoomScale = 1.2 - p * 0.2;
        transform = `scale(${zoomScale})`;
        break;
      case 'slide-left':
        opacity = p;
        const slideL = (1 - p) * 100;
        transform = `translateX(${slideL}%)`;
        break;
      case 'slide-right':
        opacity = p;
        const slideR = (1 - p) * -100;
        transform = `translateX(${slideR}%)`;
        break;
      case 'wipe-left':
      case 'wipe-right':
        opacity = p;
        break;
      case 'none':
        opacity = 1;
        break;
    }
  }
  
  if (!isLast && frame > totalFrames - outFrames) {
    const rawProgress = (frame - (totalFrames - outFrames)) / outFrames;
    const p = applyTransitionEasing(rawProgress, outTransition.easing);
    
    switch (outTransition.type) {
      case 'fade':
      case 'crossfade':
      case 'dissolve':
        opacity = Math.min(opacity, 1 - p);
        break;
      case 'zoom':
        opacity = Math.min(opacity, 1 - p);
        const zoomOutScale = 1 - p * 0.1;
        transform = `scale(${zoomOutScale})`;
        break;
      case 'slide-left':
        opacity = Math.min(opacity, 1 - p);
        const slideOutL = p * -100;
        transform = `translateX(${slideOutL}%)`;
        break;
      case 'slide-right':
        opacity = Math.min(opacity, 1 - p);
        const slideOutR = p * 100;
        transform = `translateX(${slideOutR}%)`;
        break;
      case 'none':
        break;
    }
  }
  
  return (
    <AbsoluteFill style={{ opacity, transform: transform || undefined }}>
      {children}
    </AbsoluteFill>
  );
};

// ============================================================
// LOWER THIRD COMPONENT - PROFESSIONAL TV-STYLE SCENE TITLES
// ============================================================

interface LowerThirdProps {
  title: string;
  subtitle?: string;
  brand: BrandSettings;
  fps: number;
  durationInFrames: number;
}

const LowerThird: React.FC<LowerThirdProps> = ({ 
  title, 
  subtitle, 
  brand, 
  fps, 
  durationInFrames 
}) => {
  const frame = useCurrentFrame();
  const enterDuration = fps * 0.6;
  const exitStart = durationInFrames - fps * 0.4;
  
  let lineWidth = 0;
  let textOpacity = 0;
  let translateX = -20;
  let barScale = 0;
  
  if (frame < enterDuration) {
    const progress = frame / enterDuration;
    const eased = easeOutCubic(progress);
    lineWidth = interpolate(eased, [0, 1], [0, 100]);
    textOpacity = interpolate(progress, [0.3, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    translateX = interpolate(eased, [0, 1], [-20, 0]);
    barScale = spring({ frame, fps, config: { damping: 15, stiffness: 180 } });
  } else if (frame > exitStart) {
    const exitProgress = (frame - exitStart) / (durationInFrames - exitStart);
    const eased = easeInCubic(exitProgress);
    lineWidth = 100;
    textOpacity = 1 - eased;
    translateX = interpolate(eased, [0, 1], [0, 20]);
    barScale = 1;
  } else {
    lineWidth = 100;
    textOpacity = 1;
    translateX = 0;
    barScale = 1;
  }
  
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        bottom: 120,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          width: `${lineWidth}%`,
          height: 4,
          backgroundColor: brand.colors.accent,
          transform: `scaleX(${barScale})`,
          transformOrigin: 'left',
          borderRadius: 2,
        }}
      />
      <div
        style={{
          opacity: textOpacity,
          transform: `translateX(${translateX}px)`,
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: brand.fonts.weight.heading,
            fontFamily: brand.fonts.heading,
            color: brand.colors.textLight,
            textShadow: '2px 2px 8px rgba(0,0,0,0.9)',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 22,
              fontWeight: 400,
              fontFamily: brand.fonts.body,
              color: brand.colors.textLight,
              opacity: 0.8,
              textShadow: '1px 1px 4px rgba(0,0,0,0.8)',
              marginTop: 4,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// PRODUCT OVERLAY COMPONENT
// ============================================================

const ProductOverlay: React.FC<{
  productUrl: string;
  position: { x: 'left' | 'center' | 'right'; y: 'top' | 'center' | 'bottom'; scale: number; animation?: string };
  fps: number;
  width: number;
  height: number;
}> = ({ productUrl, position, fps, width, height }) => {
  const frame = useCurrentFrame();
  
  // Validate URL
  if (!isValidHttpUrl(productUrl)) {
    console.warn(`[Remotion] Product overlay skipped - invalid URL: ${productUrl?.substring(0, 50)}`);
    return null;
  }
  
  const animDuration = fps * 0.8;
  const productSize = Math.min(width, height) * (position.scale || 0.4);

  let posX = width * 0.5;
  let posY = height * 0.5;

  switch (position.x) {
    case 'left': posX = width * 0.15; break;
    case 'center': posX = width * 0.5; break;
    case 'right': posX = width * 0.85; break;
  }
  switch (position.y) {
    case 'top': posY = height * 0.25; break;
    case 'center': posY = height * 0.5; break;
    case 'bottom': posY = height * 0.75; break;
  }

  let opacity = 1;
  let scale = 1;
  let translateX = 0;

  if (frame < animDuration) {
    const progress = frame / animDuration;
    switch (position.animation) {
      case 'fade':
        opacity = interpolate(progress, [0, 1], [0, 1]);
        break;
      case 'zoom':
        opacity = interpolate(progress, [0, 1], [0, 1]);
        scale = interpolate(progress, [0, 1], [0.7, 1]);
        break;
      case 'slide':
        opacity = interpolate(progress, [0, 1], [0, 1]);
        translateX = interpolate(progress, [0, 1], [position.x === 'left' ? -200 : 200, 0]);
        break;
      default:
        opacity = interpolate(progress, [0, 1], [0, 1]);
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: posX - productSize / 2,
        top: posY - productSize / 2,
        width: productSize,
        height: productSize,
        opacity,
        transform: `scale(${scale}) translateX(${translateX}px)`,
        filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Img
        src={productUrl}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

// ============================================================
// PRODUCT REVEAL COMPONENT - TV-QUALITY DRAMATIC ANIMATION
// ============================================================

const ProductReveal: React.FC<{
  productUrl: string;
  brand: BrandSettings;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
}> = ({ productUrl, brand, fps, width, height, durationInFrames }) => {
  const frame = useCurrentFrame();
  
  if (!isValidHttpUrl(productUrl)) {
    return null;
  }
  
  const revealDuration = fps * 1.5; // 1.5 seconds for dramatic reveal
  const productSize = Math.min(width, height) * 0.5;
  
  let scale = 0.3;
  let opacity = 0;
  let glowIntensity = 0;
  let blur = 20;
  let floatY = 0;
  
  if (frame < revealDuration) {
    // Dramatic entrance with easeOutBack for overshoot effect
    const progress = frame / revealDuration;
    const eased = progress < 1 
      ? 1 - Math.pow(1 - progress, 3) * (1 - progress * 0.3 * Math.sin(progress * Math.PI))
      : 1;
    
    scale = interpolate(eased, [0, 1], [0.3, 1]);
    opacity = interpolate(progress, [0, 0.3, 1], [0, 1, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    glowIntensity = interpolate(progress, [0, 0.5, 1], [0, 30, 15]);
    blur = interpolate(progress, [0, 0.5, 1], [20, 0, 0]);
  } else {
    scale = 1;
    opacity = 1;
    glowIntensity = 15;
    blur = 0;
    
    // Subtle floating animation after reveal
    const floatFrame = frame - revealDuration;
    floatY = Math.sin(floatFrame / 30) * 5;
  }
  
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: `translate(-50%, calc(-50% + ${floatY}px)) scale(${scale})`,
        opacity,
        filter: `blur(${blur}px) drop-shadow(0 0 ${glowIntensity}px ${brand.colors.accent})`,
        width: productSize,
        height: productSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Img
        src={productUrl}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

// ============================================================
// SCENE RENDERER - WITH FULL ERROR HANDLING
// ============================================================

const MicroSceneAudioVideo: React.FC<{
  src: string;
  volume: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  durationInFrames: number;
}> = ({ src, volume, fadeInFrames, fadeOutFrames, durationInFrames }) => {
  const frame = useCurrentFrame();
  const computedVolume = useMemo(() => {
    if (volume <= 0 || durationInFrames <= 0) return 0;
    const maxFadeTotal = Math.max(1, durationInFrames - 1);
    const clampedFadeIn = Math.min(fadeInFrames, Math.floor(maxFadeTotal * 0.4));
    const clampedFadeOut = Math.min(fadeOutFrames, Math.floor(maxFadeTotal * 0.4));
    if (clampedFadeIn > 0 && frame < clampedFadeIn) {
      return interpolate(frame, [0, clampedFadeIn], [0, volume], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    }
    if (clampedFadeOut > 0 && frame > durationInFrames - clampedFadeOut) {
      return interpolate(frame, [durationInFrames - clampedFadeOut, durationInFrames], [volume, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    }
    return volume;
  }, [frame, volume, fadeInFrames, fadeOutFrames, durationInFrames]);

  return (
    <OffthreadVideo
      src={src}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      volume={computedVolume}
    />
  );
};

const SafeVideo: React.FC<{
  src: string;
  style?: React.CSSProperties;
  muted?: boolean;
  loopDurationInFrames?: number;
  fallback: React.ReactNode;
}> = ({ src, style, muted, loopDurationInFrames, fallback }) => {
  const [error, setError] = React.useState(false);

  if (error || !src) {
    return <AbsoluteFill>{fallback}</AbsoluteFill>;
  }

  const video = (
    <OffthreadVideo
      src={src}
      style={style}
      muted={muted}
      onError={() => {
        console.warn(`[SafeVideo] Failed to load: ${src.substring(0, 80)}`);
        setError(true);
      }}
    />
  );

  if (loopDurationInFrames && loopDurationInFrames > 0) {
    return <Loop durationInFrames={loopDurationInFrames}>{video}</Loop>;
  }

  return video;
};

const MicroSceneBackground: React.FC<{
  microScenes: MicroScene[];
  sceneDuration: number;
  fps: number;
  fallback: React.ReactNode;
  sceneVideoUrl?: string;
  assemblyManifest?: AssemblyManifest;
}> = ({ microScenes, sceneDuration, fps, fallback, sceneVideoUrl, assemblyManifest }) => {
  const hasAssembledClip = assemblyManifest && !assemblyManifest.assemblyFailed && assemblyManifest.assembledClipValid !== false && assemblyManifest.assembledClipUrl;

  const totalMsDuration = microScenes.reduce((sum, ms) => sum + (ms.duration || 0), 0);
  const totalDuration = totalMsDuration > 0 ? totalMsDuration : sceneDuration;
  const totalSceneFrames = Math.round(sceneDuration * fps);

  React.useEffect(() => {
    if (hasAssembledClip) {
      console.log(`[MicroSceneBackground] Using assembled clip: ${assemblyManifest!.assembledClipUrl!.substring(0, 80)}`);
      console.log(`  Assembled duration: ${assemblyManifest!.totalDurationSec.toFixed(2)}s, ${assemblyManifest!.clips.length} clips`);
    } else {
      console.log(`[MicroSceneBackground] ${microScenes.length} micro-scenes (fallback mode), sceneDuration=${sceneDuration}s, totalMsDuration=${totalMsDuration}s`);
      if (assemblyManifest?.assemblyFailed) {
        console.log(`  Assembly failed: ${assemblyManifest.error}`);
      }
    }
    let offset = 0;
    microScenes.forEach((ms, idx) => {
      const msDur = ms.duration || (sceneDuration / microScenes.length);
      const msFrames = Math.round((msDur / totalDuration) * totalSceneFrames);
      console.log(`  MS[${idx}]: dur=${msDur}s, frames=${msFrames}, from=${offset}, video=${ms.videoUrl?.substring(0, 60) || 'none'}`);
      offset += msFrames;
    });
    console.log(`  Total allocated frames: ${offset} / ${totalSceneFrames}`);
  }, []);

  const anyMsHasOverlays = microScenes.some(ms => ms.overlayItems && ms.overlayItems.length > 0);

  if (hasAssembledClip) {
    const assemblyDurationSec = assemblyManifest!.totalDurationSec || totalDuration;
    const assemblyFrames = Math.round(assemblyDurationSec * fps);
    const needsLoop = assemblyFrames < totalSceneFrames - 2;
    return (
      <AbsoluteFill>
        <SafeVideo
          src={assemblyManifest!.assembledClipUrl!}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          muted
          loopDurationInFrames={needsLoop ? assemblyFrames : undefined}
          fallback={fallback}
        />
        {anyMsHasOverlays && (() => {
          let overlayOffset = 0;
          return microScenes.map((ms, idx) => {
            const msDuration = ms.duration || (sceneDuration / microScenes.length);
            const isLast = idx === microScenes.length - 1;
            const msFrames = isLast
              ? totalSceneFrames - overlayOffset
              : Math.round((msDuration / totalDuration) * totalSceneFrames);
            const from = overlayOffset;
            overlayOffset += msFrames;

            if (!ms.overlayItems || ms.overlayItems.length === 0) return null;
            return (
              <Sequence key={`ms-overlay-${ms.id || idx}`} from={from} durationInFrames={msFrames}>
                <MicroSceneOverlayCompositor
                  overlayItems={ms.overlayItems}
                  durationInFrames={msFrames}
                />
              </Sequence>
            );
          });
        })()}
      </AbsoluteFill>
    );
  }

  let frameOffset = 0;

  return (
    <AbsoluteFill>
      {microScenes.map((ms, idx) => {
        const msDuration = ms.duration || (sceneDuration / microScenes.length);
        const isLast = idx === microScenes.length - 1;
        const msFrames = isLast
          ? totalSceneFrames - frameOffset
          : Math.round((msDuration / totalDuration) * totalSceneFrames);
        const from = frameOffset;
        frameOffset += msFrames;

        const crossfadeFrames = Math.min(Math.round(fps * 0.3), Math.round(msFrames * 0.15));
        const audioVolume = ms.originalAudioVolume || 0;
        const fadeInFrames = Math.round((ms.originalAudioFadeIn ?? 0.3) * fps);
        const fadeOutFrames = Math.round((ms.originalAudioFadeOut ?? 0.5) * fps);

        const videoSrc = ms.videoUrl || sceneVideoUrl;

        const msOverlays = ms.overlayItems && ms.overlayItems.length > 0 ? ms.overlayItems : null;
        const seqDuration = msFrames + (isLast ? 0 : crossfadeFrames);

        if (videoSrc) {
          return (
            <Sequence key={ms.id || `ms-${idx}`} from={from} durationInFrames={seqDuration}>
              <AbsoluteFill style={{ opacity: 1 }}>
                <MicroSceneCrossfade
                  frameInSequence={0}
                  durationInFrames={seqDuration}
                  crossfadeFrames={crossfadeFrames}
                  isFirst={idx === 0}
                  isLast={isLast}
                >
                  {audioVolume > 0 && ms.videoUrl ? (
                    <MicroSceneAudioVideo
                      src={ms.videoUrl}
                      volume={audioVolume}
                      fadeInFrames={fadeInFrames}
                      fadeOutFrames={fadeOutFrames}
                      durationInFrames={msFrames}
                    />
                  ) : (
                    <SafeVideo
                      src={videoSrc}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      muted
                      fallback={fallback}
                    />
                  )}
                </MicroSceneCrossfade>
                {msOverlays && (
                  <MicroSceneOverlayCompositor
                    overlayItems={msOverlays}
                    durationInFrames={seqDuration}
                  />
                )}
              </AbsoluteFill>
            </Sequence>
          );
        }
        if (ms.imageUrl) {
          return (
            <Sequence key={ms.id || `ms-${idx}`} from={from} durationInFrames={seqDuration}>
              <AbsoluteFill>
                <MicroSceneCrossfade
                  frameInSequence={0}
                  durationInFrames={seqDuration}
                  crossfadeFrames={crossfadeFrames}
                  isFirst={idx === 0}
                  isLast={isLast}
                >
                  <SafeImage
                    src={ms.imageUrl}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    fallback={fallback}
                  />
                </MicroSceneCrossfade>
                {msOverlays && (
                  <MicroSceneOverlayCompositor
                    overlayItems={msOverlays}
                    durationInFrames={seqDuration}
                  />
                )}
              </AbsoluteFill>
            </Sequence>
          );
        }
        return (
          <Sequence key={ms.id || `ms-${idx}`} from={from} durationInFrames={msFrames}>
            <AbsoluteFill>{fallback}</AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const MicroSceneCrossfade: React.FC<{
  children: React.ReactNode;
  frameInSequence: number;
  durationInFrames: number;
  crossfadeFrames: number;
  isFirst: boolean;
  isLast: boolean;
}> = ({ children, durationInFrames, crossfadeFrames, isFirst, isLast }) => {
  const frame = useCurrentFrame();
  let opacity = 1;
  if (!isFirst && frame < crossfadeFrames) {
    opacity = frame / crossfadeFrames;
  }
  if (!isLast && frame > durationInFrames - crossfadeFrames) {
    opacity = Math.max(0, (durationInFrames - frame) / crossfadeFrames);
  }
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

const SceneRenderer: React.FC<{
  scene: Scene;
  brand: BrandSettings;
  isFirst: boolean;
  isLast: boolean;
  showDebugInfo: boolean;
}> = ({ scene, brand, isFirst, isLast, showDebugInfo }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const durationInFrames = (scene.duration || 5) * fps;

  const instructions = (scene as any).compositionInstructions as SceneCompositionInstructions | undefined;
  const hasAIInstructions = !!instructions?.kenBurns;

  const defaultKenBurns: KenBurnsInstruction = {
    enabled: true,
    startScale: 1.0,
    endScale: 1.08,
    startPosition: { x: 50, y: 50 },
    endPosition: { x: 50, y: 50 },
    easing: 'ease-in-out',
  };

  const kenBurnsInstruction = instructions?.kenBurns || defaultKenBurns;

  // Phase 11D: Check for brand media assets first
  const brandAssetUrl = (scene as any).brandAssetUrl;
  const brandAssetType = (scene as any).brandAssetType;
  const animationSettings = (scene as any).animationSettings;
  const useBrandMedia = (scene as any).mediaSource === 'brand' && brandAssetUrl;
  
  const imageUrl = scene.assets?.backgroundUrl || scene.assets?.imageUrl;
  const videoUrl = scene.assets?.videoUrl;
  const productOverlayUrl = scene.assets?.productOverlayImage || 
                            scene.assets?.generatedProductImage ||
                            scene.assets?.productOverlayUrl ||
                            scene.assets?.productImage;
  const productPosition = scene.assets?.productOverlayPosition || { x: 'center', y: 'center', scale: 0.4, animation: 'fade' };
  // FIXED: Only show product overlay if EXPLICITLY enabled (user selected a product)
  // Previously defaulted to true which caused unwanted product overlays
  const useProductOverlay = scene.assets?.useProductOverlay === true;

  const imageStatus = getAssetStatus(imageUrl);
  const videoStatus = getAssetStatus(videoUrl);
  const brandStatus = getAssetStatus(brandAssetUrl);
  const hasValidImage = imageStatus === 'valid';
  const hasValidVideo = videoStatus === 'valid' && scene.background?.type === 'video';
  const hasValidBrandAsset = useBrandMedia && brandStatus === 'valid';
  
  const motionGraphicsData = (scene.assets as any)?.motionGraphics;
  const hasMotionGraphics = motionGraphicsData?.enabled && motionGraphicsData?.config;
  const isMotionGraphicScene = scene.background?.type === 'motion-graphic' as any || hasMotionGraphics;
  
  const microScenes = scene.microScenes || [];
  const hasMicroScenes = microScenes.length > 0 && microScenes.some(ms => ms.videoUrl || ms.imageUrl);
  
  React.useEffect(() => {
    console.log(`[SceneRenderer] Scene ${scene.id} (${scene.type}):`);
    console.log(`  - videoUrl: ${videoUrl?.substring(0, 60) || 'none'}`);
    if (hasMicroScenes) {
      console.log(`  - microScenes: ${microScenes.length} (${microScenes.filter(ms => ms.videoUrl).length} with video)`);
    }
    console.log(`  - hasAIInstructions: ${hasAIInstructions}`);
    if (hasAIInstructions && instructions?.kenBurns) {
      console.log(`  - kenBurns: ${instructions.kenBurns.startScale.toFixed(2)} → ${instructions.kenBurns.endScale.toFixed(2)}`);
      console.log(`  - transitionIn: ${instructions.transitionIn?.type || 'default'}`);
    }
  }, [scene.id]);

  const gradientFallback = <GradientFallback brand={brand} sceneType={scene.type} />;

  return (
    <SceneTransitionWrapper
      transitionIn={instructions?.transitionIn}
      transitionOut={instructions?.transitionOut}
      sceneDuration={scene.duration || 5}
      fps={fps}
      isFirst={isFirst}
      isLast={isLast}
    >
      {/* Background Layer - Brand Media, Motion Graphics, Video or Image with AI-powered Ken Burns */}
      <AbsoluteFill>
        {/* Phase 12: Priority 0 - Motion Graphics rendering */}
        {isMotionGraphicScene && hasMotionGraphics ? (
          <MotionGraphicsScene
            configs={[{
              type: motionGraphicsData.config.type,
              startFrame: 0,
              durationInFrames: durationInFrames,
              props: motionGraphicsData.renderInstructions || motionGraphicsData.config,
            }]}
            backgroundColor="transparent"
          />
        ) : hasMicroScenes ? (
          <MicroSceneBackground
            microScenes={microScenes}
            sceneDuration={scene.duration || 5}
            fps={fps}
            fallback={gradientFallback}
            sceneVideoUrl={scene.assets?.videoUrl}
            assemblyManifest={scene.assemblyManifest}
          />
        ) : hasValidBrandAsset && brandAssetType === 'video' ? (
          <OffthreadVideo
            src={brandAssetUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            muted
            startFrom={3}
          />
        ) : hasValidBrandAsset && brandAssetType === 'image' ? (
          <KenBurnsImage
            src={brandAssetUrl}
            animation={animationSettings?.type || 'ken-burns'}
            intensity={animationSettings?.intensity || 'subtle'}
            focusPoint={animationSettings?.focusPoint || { x: 50, y: 50 }}
          />
        ) : hasValidVideo ? (
          <KenBurnsBackground
            src={videoUrl!}
            isVideo={true}
            instruction={kenBurnsInstruction}
            sceneDuration={scene.duration || 5}
            fps={fps}
            fallback={gradientFallback}
          />
        ) : hasValidImage ? (
          <KenBurnsBackground
            src={imageUrl!}
            isVideo={false}
            instruction={kenBurnsInstruction}
            sceneDuration={scene.duration || 5}
            fps={fps}
            fallback={gradientFallback}
          />
        ) : (
          <>
            {gradientFallback}
            {showDebugInfo && imageStatus !== 'missing' && (
              <div
                style={{
                  position: 'absolute',
                  top: 20,
                  left: 20,
                  backgroundColor: 'rgba(255,0,0,0.8)',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: 4,
                  fontSize: 14,
                  fontFamily: 'monospace',
                }}
              >
                ⚠️ Image: {imageStatus}
              </div>
            )}
          </>
        )}
      </AbsoluteFill>

      {/* Overlay for text readability */}
      {scene.background?.overlay && (
        <AbsoluteFill
          style={{
            background: scene.background.overlay.type === 'gradient'
              ? `linear-gradient(to top, ${scene.background.overlay.color} 0%, transparent 60%)`
              : scene.background.overlay.type === 'vignette'
              ? 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)'
              : scene.background.overlay.color,
            opacity: scene.background.overlay.opacity,
          }}
        />
      )}

      {/* Product Overlay - Use ProductReveal for intro/cta scenes, regular overlay for others */}
      {productOverlayUrl && useProductOverlay && isValidHttpUrl(productOverlayUrl) && (
        scene.type === 'intro' || scene.type === 'cta' ? (
          <ProductReveal
            productUrl={productOverlayUrl}
            brand={brand}
            fps={fps}
            width={width}
            height={height}
            durationInFrames={durationInFrames}
          />
        ) : (
          <ProductOverlay
            productUrl={productOverlayUrl}
            position={productPosition}
            fps={fps}
            width={width}
            height={height}
          />
        )
      )}

      {/* Text Overlays - Use ONLY ONE source to prevent duplicates */}
      {(() => {
        if (scene.type === 'cta' || scene.type === 'outro' || scene.type === 'intro' || scene.id === 'intro-scene-auto') {
          return null;
        }
        
        const instructions = (scene as any).compositionInstructions as SceneCompositionInstructions | undefined;
        const hasIntelligentOverlays = instructions?.textOverlays && instructions.textOverlays.length > 0;
        const hasTraditionalOverlays = scene.textOverlays && scene.textOverlays.length > 0;
        
        // PRIORITY 1: If we have AI-generated composition instructions, use ONLY intelligent overlays
        // Do NOT fall through to traditional overlays - this prevents duplication
        if (hasIntelligentOverlays) {
          return (
            <>
              {instructions!.textOverlays.map((textInstruction, idx) => (
                <IntelligentTextOverlay
                  key={`intelligent-text-${scene.id}-${idx}`}
                  instruction={textInstruction}
                  sceneDuration={scene.duration}
                  fps={fps}
                  brand={brand}
                />
              ))}
              {/* Intelligent product overlay - ONLY if user explicitly enabled it */}
              {instructions!.productOverlay?.enabled && useProductOverlay && productOverlayUrl && isValidHttpUrl(productOverlayUrl) && (
                <IntelligentProductOverlay
                  productImage={productOverlayUrl}
                  instruction={instructions!.productOverlay}
                  sceneDuration={scene.duration}
                  fps={fps}
                />
              )}
            </>
          );
        }
        
        // PRIORITY 2: Use traditional overlays ONLY if no intelligent overlays exist
        if (!hasTraditionalOverlays) {
          return null;  // Let extracted overlays handle it (if any)
        }
        
        const useLowerThirdStyle = ['hook', 'benefit', 'feature', 'intro'].includes(scene.type);
        const primaryText = scene.textOverlays?.[0];
        
        if (!primaryText?.text) {
          return null;
        }
        
        if (useLowerThirdStyle) {
          return (
            <LowerThird
              title={primaryText.text.length > 50 ? primaryText.text.substring(0, 47) + '...' : primaryText.text}
              subtitle={scene.textOverlays?.[1]?.text}
              brand={brand}
              fps={fps}
              durationInFrames={durationInFrames}
            />
          );
        }
        
        return (
          <>
            {(scene.textOverlays || []).map((overlay) => (
              <TextOverlayComponent
                key={overlay.id}
                overlay={overlay}
                brand={brand}
                sceneFrame={frame}
                fps={fps}
              />
            ))}
          </>
        );
      })()}


      {/* Text Labels - auto-extracted key terms rendered as crisp overlays */}
      {scene.textLabels && scene.textLabels.length > 0 && scene.type !== 'intro' && scene.id !== 'intro-scene-auto' && (
        <TextLabelOverlay labels={scene.textLabels} brand={brand} />
      )}

      {/* Debug overlay showing scene info */}
      {showDebugInfo && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
          }}
        >
          Scene: {scene.id} | Type: {scene.type} | Duration: {scene.duration}s
          {hasAIInstructions && ` | KB: ${kenBurnsInstruction.startScale.toFixed(2)}→${kenBurnsInstruction.endScale.toFixed(2)}`}
        </div>
      )}
    </SceneTransitionWrapper>
  );
};





// ============================================================
// INTRO SLATE (shown when no scenes)
// ============================================================

const IntroSlate: React.FC<{ brand: BrandSettings }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({
    frame,
    fps,
    config: { damping: 100, stiffness: 200, mass: 0.5 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          opacity,
          color: brand.colors.textLight,
          fontSize: 48,
          fontFamily: brand.fonts.heading,
          fontWeight: brand.fonts.weight.heading,
        }}
      >
        {brand.name}
      </div>
    </AbsoluteFill>
  );
};

// ============================================================
// ASSET VALIDATION SUMMARY (for debugging)
// ============================================================

const AssetValidationSummary: React.FC<{
  scenes: Scene[];
  voiceoverUrl: string | null;
  musicUrl: string | null;
}> = ({ scenes, voiceoverUrl, musicUrl }) => {
  // This component logs validation info but doesn't render anything
  React.useEffect(() => {
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log('=== REMOTION ASSET VALIDATION (Lambda Compatibility Check) ===');

    // Check voiceover
    const voiceoverStatus = getAssetStatus(voiceoverUrl);
    console.log(`Voiceover: ${voiceoverStatus} - ${voiceoverUrl?.substring(0, 60) || 'null'}`);
    if (voiceoverStatus === 'data-url') {
      errors.push('AUDIO SRC ERROR: Voiceover is base64 encoded - must be uploaded to S3 first');
    } else if (voiceoverStatus === 'local-path') {
      errors.push('AUDIO SRC ERROR: Voiceover uses local path - not accessible from Lambda');
    } else if (voiceoverStatus === 'missing') {
      warnings.push('Voiceover URL is missing - video will render without voiceover');
    }

    // Check music
    const musicStatus = getAssetStatus(musicUrl);
    console.log(`Music: ${musicStatus} - ${musicUrl?.substring(0, 60) || 'null'}`);
    if (musicStatus === 'data-url') {
      errors.push('AUDIO SRC ERROR: Music is base64 encoded - must be uploaded to S3 first');
    } else if (musicStatus === 'local-path') {
      errors.push('AUDIO SRC ERROR: Music uses local path - not accessible from Lambda');
    } else if (musicStatus === 'missing') {
      warnings.push('Music URL is missing - video will render without background music');
    }

    const videoScenes = scenes.filter(s => s.background?.type === 'video');
    console.log(`Total scenes: ${scenes.length}, Scenes with video B-roll: ${videoScenes.length}`);

    scenes.forEach((scene, i) => {
      const imgUrl = scene.assets?.backgroundUrl || scene.assets?.imageUrl;
      const videoUrl = scene.assets?.videoUrl;
      const prodUrl = scene.assets?.productOverlayUrl;
      const bgType = scene.background?.type;

      console.log(`Scene ${i} (${scene.type}):`);
      console.log(`  Background type: ${bgType || 'undefined'}`);

      const imgStatus = getAssetStatus(imgUrl);
      console.log(`  Image: ${imgStatus}`);
      if (imgStatus === 'data-url') {
        errors.push(`Scene ${i}: Image is base64 - must upload to S3`);
      }

      const vidStatus = getAssetStatus(videoUrl);
      console.log(`  Video: ${vidStatus} - ${videoUrl?.substring(0, 60) || 'none'}`);
      if (bgType === 'video' && vidStatus !== 'valid') {
        errors.push(`Scene ${i}: Video B-roll expected but URL is ${vidStatus}`);
      }

      if (prodUrl) {
        const prodStatus = getAssetStatus(prodUrl);
        console.log(`  Product: ${prodStatus}`);
        if (prodStatus !== 'valid') {
          warnings.push(`Scene ${i}: Product overlay URL is ${prodStatus}`);
        }
      }

      const willRenderVideo = vidStatus === 'valid' && bgType === 'video';
      console.log(`  >>> WILL RENDER VIDEO: ${willRenderVideo}`);
    });

    console.log('=================================');

    // Log errors prominently
    if (errors.length > 0) {
      console.error('=== REMOTION LAMBDA RENDER ERRORS ===');
      errors.forEach(e => console.error(`  ❌ ${e}`));
      console.error('====================================');
      console.error('FIX: Ensure all audio/video/image URLs are public HTTPS URLs (e.g., S3, CDN)');
      console.error('     Base64 data URLs and local paths are NOT accessible from Lambda!');
    }

    if (warnings.length > 0) {
      console.warn('=== REMOTION RENDER WARNINGS ===');
      warnings.forEach(w => console.warn(`  ⚠️ ${w}`));
      console.warn('================================');
    }
  }, []);

  return null;
};

// ============================================================
// SOUND EFFECTS COMPONENT
// ============================================================

const SceneSoundEffects: React.FC<{
  soundDesign: SceneSoundDesign | undefined;
  sceneStartFrame: number;
  sceneDuration: number;
  fps: number;
}> = ({ soundDesign, sceneStartFrame, sceneDuration, fps }) => {
  if (!soundDesign) return null;

  const sceneFrames = Math.ceil(sceneDuration * fps);

  return (
    <>
      {/* Transition In Sound */}
      {soundDesign.transitionIn && isValidHttpUrl(soundDesign.transitionIn.url) && (
        <Sequence from={sceneStartFrame} durationInFrames={Math.ceil(soundDesign.transitionIn.duration * fps)}>
          <Audio
            src={soundDesign.transitionIn.url}
            volume={soundDesign.transitionIn.volume}
          />
        </Sequence>
      )}

      {/* Ambient Sound (loops through scene) */}
      {soundDesign.ambience && isValidHttpUrl(soundDesign.ambience.url) && (
        <Sequence from={sceneStartFrame} durationInFrames={sceneFrames}>
          <Audio
            src={soundDesign.ambience.url}
            volume={soundDesign.ambience.volume}
            loop
          />
        </Sequence>
      )}

      {/* Transition Out Sound */}
      {soundDesign.transitionOut && isValidHttpUrl(soundDesign.transitionOut.url) && (
        <Sequence 
          from={sceneStartFrame + sceneFrames - Math.ceil(soundDesign.transitionOut.duration * fps)} 
          durationInFrames={Math.ceil(soundDesign.transitionOut.duration * fps)}
        >
          <Audio
            src={soundDesign.transitionOut.url}
            volume={soundDesign.transitionOut.volume}
          />
        </Sequence>
      )}

      {/* Emphasis Sounds (sparkles, success chimes, etc.) */}
      {soundDesign.emphasis?.map((effect, index) => {
        if (!isValidHttpUrl(effect.url)) return null;
        const emphasisFrame = sceneStartFrame + Math.floor(sceneDuration * 0.5 * fps);
        return (
          <Sequence 
            key={`emphasis-${index}`}
            from={emphasisFrame} 
            durationInFrames={Math.ceil(effect.duration * fps)}
          >
            <Audio
              src={effect.url}
              volume={effect.volume}
            />
          </Sequence>
        );
      })}
    </>
  );
};

// ============================================================
// MAIN COMPOSITION
// ============================================================

export const UniversalVideoComposition: React.FC<UniversalVideoProps> = ({
  scenes,
  voiceoverUrl,
  musicUrl,
  musicVolume = 0.18,
  brand,
  outputFormat,
  endCardConfig,
  soundDesignConfig,
  audioDuckingKeyframes,
  transitions,
  sceneOverlayConfigs,
  voiceoverRanges,
  soundEffectsBaseUrl,
  filmTreatmentConfig,
  captionStyle,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  
  const showDebugInfo = false;
  
  React.useEffect(() => {
    const videoCount = scenes.filter(s => s.assets?.videoUrl && s.background?.type === 'video').length;
    let microSceneCount = 0;
    for (const s of scenes) {
      if (s.microScenes && s.microScenes.length > 0) {
        for (const ms of s.microScenes) {
          if (ms.videoUrl) microSceneCount++;
        }
      }
    }
    console.log(`[Asset Loader] ${videoCount} scene videos + ${microSceneCount} micro-scene videos — loading on demand (no bulk prefetch)`);
  }, []);

  const effectiveEndCardConfig = endCardConfig ?? DEFAULT_END_CARD_CONFIG;
  const effectiveSoundConfig = soundDesignConfig ?? DEFAULT_SOUND_CONFIG;
  
  // Phase 18E: Check enabled flag on end card config
  // Render end card unless explicitly disabled (enabled defaults to true if not specified)
  const hasEndCard = effectiveEndCardConfig.enabled !== false;
  
  // Phase 18F: Film treatment config with defaults
  // If config is provided (even with enabled:false), use it; otherwise use lifestyle defaults
  const effectiveFilmTreatment: FilmTreatmentConfig = filmTreatmentConfig?.enabled !== undefined 
    ? filmTreatmentConfig as FilmTreatmentConfig
    : { ...FILM_TREATMENT_PRESETS['lifestyle'], enabled: true };
  const endCardDuration = Math.round((effectiveEndCardConfig.duration || 5) * fps);
  const endCardStartFrame = durationInFrames - endCardDuration;

  const sceneStartFrames: number[] = [];
  {
    let f = 0;
    scenes.forEach((scene, index) => {
      sceneStartFrames.push(f);
      const dur = Math.ceil((scene.duration || 5) * fps);
      const t = transitions?.[index];
      if (index < scenes.length - 1 && t && t.duration > 0 && t.type !== 'none' && t.type !== 'cut') {
        f += dur - Math.round((t.duration / 2) * fps);
      } else {
        f += dur;
      }
    });
  }

  const sceneSequences = scenes.map((scene, index) => {
    const durationInFrames = (scene.duration || 5) * fps;
    const isFirstScene = index === 0;
    const isLastScene = index === scenes.length - 1;
    const sceneStartFrame = sceneStartFrames[index];
    
    const sceneOverlayConfig = sceneOverlayConfigs?.[scene.id];
    
    const isIntroScene = scene.id === 'intro-scene-auto';
    
    if (isIntroScene) {
      const introConfig = (scene as any).introCardConfig || {};
      const introBg = scene.assets?.backgroundUrl || scene.assets?.imageUrl || scene.background?.imageUrl;
      const introLogoUrl = sceneOverlayConfig?.logo?.url || '';
      const introEndCardConfig: any = {
        enabled: true,
        duration: scene.duration || 4,
        background: introBg ? { type: 'image', imageUrl: introBg } : (scene.background?.gradient ? { type: 'animated-gradient', gradient: scene.background.gradient } : { type: 'animated-gradient', gradient: { colors: ['#1a1a2e', '#16213e', '#0d1b2a'], angle: 180 } }),
        logo: {
          url: introLogoUrl,
          size: introConfig.logoSize || 30,
          position: { x: 50, y: introConfig.logoPositionY || 32 },
          animation: introConfig.logoAnimation || 'scale-bounce',
        },
        tagline: {
          text: introConfig.taglineText || '',
          delay: 0.8,
          animation: introConfig.taglineAnimation || 'fade',
          positionY: introConfig.taglinePositionY || 50,
          style: {
            fontSize: introConfig.taglineFontSize || 28,
            fontFamily: `'${introConfig.taglineFontFamily || 'Great Vibes'}', cursive`,
            color: introConfig.taglineColor || '#E8D5B7',
            fontWeight: introConfig.taglineFontWeight ?? 400,
          },
        },
        contact: {
          website: introConfig.contactWebsite || '',
          phone: introConfig.contactPhone || '',
          email: introConfig.contactEmail || '',
          delay: 1.8,
          animation: introConfig.contactAnimation || 'stagger',
          positionY: introConfig.websitePositionY || 75,
          style: {
            fontSize: introConfig.websiteFontSize || 22,
            fontFamily: `'${introConfig.websiteFontFamily || 'Inter'}', sans-serif`,
            color: introConfig.websiteColor || '#FFFFFF',
            fontWeight: introConfig.websiteFontWeight ?? 500,
          },
        },
        ambientEffect: {
          type: introConfig.ambientEffect || 'bokeh',
          color: 'rgba(232, 213, 183, 0.3)',
          intensity: 40,
        },
      };
      return (
        <Sequence
          key={scene.id || `scene-${index}`}
          from={sceneStartFrame}
          durationInFrames={durationInFrames}
        >
          <AnimatedEndCard config={introEndCardConfig} />
        </Sequence>
      );
    }
    
    const sequence = (
      <Sequence
        key={scene.id || `scene-${index}`}
        from={sceneStartFrame}
        durationInFrames={durationInFrames}
      >
        <AbsoluteFill>
          <SceneRenderer
            scene={scene}
            brand={brand}
            isFirst={isFirstScene}
            isLast={isLastScene}
            showDebugInfo={showDebugInfo}
          />
          
          {/* Scene logo overlay (Phase 18B) */}
          {isFirstScene && sceneOverlayConfig?.logo?.enabled && sceneOverlayConfig.logo.url && (
            (() => {
              const logoStartTime = sceneOverlayConfig.logo.timing?.startTime || 0.5;
              const logoDuration = sceneOverlayConfig.logo.timing?.duration || 2.5;
              const logoStartFrame = Math.round(logoStartTime * fps);
              const logoDurationFrames = Math.round(logoDuration * fps);
              
              return (
                <Sequence from={logoStartFrame} durationInFrames={logoDurationFrames}>
                  <LogoOverlay
                    logoUrl={sceneOverlayConfig.logo.url}
                    position={sceneOverlayConfig.logo.position || 'center'}
                    size={sceneOverlayConfig.logo.size || 25}
                    opacity={sceneOverlayConfig.logo.opacity || 1}
                    animation={{
                      type: (sceneOverlayConfig.logo.animation as any) || 'fade-in',
                      duration: Math.round(fps * 0.8),
                      delay: 0,
                    }}
                    timing={{
                      startFrame: 0,
                      endFrame: logoDurationFrames,
                    }}
                  />
                </Sequence>
              );
            })()
          )}
          
          {/* Scene watermark overlay (Phase 18B) */}
          {!isFirstScene && !isLastScene && sceneOverlayConfig?.watermark?.enabled && sceneOverlayConfig.watermark.url && (
            <WatermarkOverlay
              logoUrl={sceneOverlayConfig.watermark.url}
              position={sceneOverlayConfig.watermark.position || 'bottom-right'}
              size={sceneOverlayConfig.watermark.size || 8}
              opacity={sceneOverlayConfig.watermark.opacity || 0.6}
              margin={20}
              showDuring="all"
            />
          )}
          
          {/* Custom user-positioned overlays (drag-and-drop via SceneOverlayEditor) */}
          {/* Skip scene-level overlays when micro-scenes handle their own overlays
              to prevent carryover (scene-level renders for full duration, micro-scene
              overlays are scoped to their time window by MicroSceneOverlayCompositor) */}
          {(() => {
            const hasMicroScenes = scene.microScenes && scene.microScenes.length > 0;
            const msHaveOverlays = hasMicroScenes && scene.microScenes!.some((ms: any) => ms.overlayItems && ms.overlayItems.length > 0);
            if (msHaveOverlays) return null;
            return scene.overlayItems?.map((overlay: any, overlayIdx: number) => {
              if (overlay.type === 'text') {
                return (
                  <CustomTextOverlay
                    key={`custom-text-overlay-${scene.id}-${overlayIdx}`}
                    overlay={overlay}
                    durationInFrames={durationInFrames}
                  />
                );
              }
              return (
                <CustomImageOverlay
                  key={`custom-overlay-${scene.id}-${overlayIdx}`}
                  url={overlay.url}
                  x={overlay.x}
                  y={overlay.y}
                  width={overlay.width}
                  height={overlay.height}
                  opacity={overlay.opacity}
                  durationInFrames={durationInFrames}
                />
              );
            });
          })()}
        </AbsoluteFill>
      </Sequence>
    );
    return sequence;
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AssetValidationSummary 
        scenes={scenes} 
        voiceoverUrl={voiceoverUrl} 
        musicUrl={musicUrl} 
      />
      
      <FilmTreatment config={effectiveFilmTreatment}>
      
      {scenes.length === 0 ? (
        <IntroSlate brand={brand} />
      ) : (
        sceneSequences
      )}

      {/* Background Music - legacy ducking (only when no keyframes provided) */}
      {(!audioDuckingKeyframes || audioDuckingKeyframes.length === 0) && (
        <DuckedMusicAudio 
          src={musicUrl} 
          baseVolume={musicVolume}
          duckedVolume={musicVolume * 0.5}
          hasVoiceover={!!voiceoverUrl && isValidHttpUrl(voiceoverUrl)}
          label="Background music"
        />
      )}

      {/* Voiceover - per-scene or full track */}
      {(() => {
        const introSceneIndex = scenes.findIndex(s => s.id === 'intro-scene-auto' || s.type === 'intro');
        const introEndFrame = introSceneIndex >= 0
          ? sceneStartFrames[introSceneIndex] + Math.ceil((scenes[introSceneIndex].duration || 5) * fps)
          : 0;
        const contentStartFrame = introEndFrame;
        const contentEndFrame = hasEndCard ? endCardStartFrame : durationInFrames;
        const contentDurationFrames = Math.max(1, contentEndFrame - contentStartFrame);

        const hasPerSceneAudio = scenes.some(s => s.voiceoverUrl && isValidHttpUrl(s.voiceoverUrl));
        if (hasPerSceneAudio) {
          return scenes.map((scene, index) => {
            if (scene.id === 'intro-scene-auto') return null;
            const sceneStartFrame = sceneStartFrames[index];
            const sceneDuration = scene.duration || 5;
            const sceneDurationFrames = Math.ceil(sceneDuration * fps);
            
            if (!scene.voiceoverUrl || !isValidHttpUrl(scene.voiceoverUrl)) return null;
            
            return (
              <React.Fragment key={`vo-${scene.id || index}`}>
                <Sequence from={sceneStartFrame} durationInFrames={sceneDurationFrames}>
                  <SafeAudio
                    src={scene.voiceoverUrl}
                    volume={1.0}
                    label={`Voiceover scene ${index}`}
                  />
                </Sequence>
                {scene.captions?.enabled && scene.captions.words?.length > 0 && (
                  <Sequence from={sceneStartFrame} durationInFrames={sceneDurationFrames}>
                    <SyncedCaptions
                      words={
                        scene.assemblyManifest?.wordMarkers && scene.assemblyManifest.assembledClipValid
                          ? scene.assemblyManifest.wordMarkers.map(wm => ({
                              word: wm.word,
                              start: wm.startSec,
                              end: wm.endSec,
                            }))
                          : scene.captions.words
                      }
                      style={captionStyle || scene.captions.style || { preset: 'capcut' }}
                      sceneStartFrame={0}
                    />
                  </Sequence>
                )}
              </React.Fragment>
            );
          });
        }
        const fullTrackCaptionScene = scenes.find(s => s.captions?.enabled && s.captions?.words?.length > 0);
        return (
          <>
            <Sequence from={contentStartFrame} durationInFrames={contentDurationFrames}>
              <SafeAudio 
                src={voiceoverUrl} 
                volume={1.0} 
                label="Voiceover"
              />
            </Sequence>
            {fullTrackCaptionScene?.captions && (
              <Sequence from={contentStartFrame} durationInFrames={contentDurationFrames}>
                <SyncedCaptions
                  words={fullTrackCaptionScene.captions.words}
                  style={captionStyle || fullTrackCaptionScene.captions.style || { preset: 'capcut' }}
                  sceneStartFrame={0}
                />
              </Sequence>
            )}
          </>
        );
      })()}

      {/* Sound Effects (whooshes, ambient, emphasis) */}
      {(() => {
        return scenes.map((scene, index) => {
          const sceneStartFrame = sceneStartFrames[index];
          const sceneDuration = scene.duration || 5;
          
          return (
            <SceneSoundEffects
              key={`sfx-${scene.id || index}`}
              soundDesign={scene.soundDesign}
              sceneStartFrame={sceneStartFrame}
              sceneDuration={sceneDuration}
              fps={fps}
            />
          );
        });
      })()}
      
      {hasEndCard && (
        <Sequence from={endCardStartFrame} durationInFrames={endCardDuration}>
          <AnimatedEndCard config={effectiveEndCardConfig} />
        </Sequence>
      )}
      
      </FilmTreatment>
      {/* End Phase 18F: Film Treatment */}
      
      {/* Phase 18D: Sound Design Layer with S3/GCS URLs (preferred when soundEffectsBaseUrl available) */}
      {soundEffectsBaseUrl && effectiveSoundConfig.enabled && (
        <SoundDesignLayer
          config={{
            enabled: true,
            transitions: {
              enabled: effectiveSoundConfig.transitionSounds,
              defaultSound: 'whoosh-soft',
              volume: 0.04,
            },
            logoReveal: {
              enabled: effectiveSoundConfig.impactSounds,
              sound: 'logo-impact',
              volume: 0.06,
            },
            riseSwell: {
              enabled: effectiveSoundConfig.impactSounds,
              durationBeforeCTA: 3,
              volume: 0.04,
            },
            audioDucking: soundDesignConfig?.audioDucking || {
              enabled: true,
              baseVolume: 0.35,
              duckLevel: 0.1,
              fadeFrames: 15,
            },
            ambient: {
              enabled: effectiveSoundConfig.ambientLayer,
              sound: effectiveSoundConfig.ambientType === 'nature' ? 'room-tone-nature' : 'room-tone-warm',
              volume: 0.02,
            },
          }}
          transitions={(() => {
            const transitionSounds: TransitionSound[] = [];
            scenes.forEach((scene, index) => {
              if (index > 0) {
                transitionSounds.push({
                  sceneIndex: index,
                  startFrame: sceneStartFrames[index] - Math.round(fps * 0.3),
                  sound: 'whoosh-soft',
                  volume: 0.04,
                });
              }
            });
            return transitionSounds;
          })()}
          logoRevealFrame={hasEndCard ? endCardStartFrame + Math.round(0.3 * fps) : 0}
          ctaStartFrame={hasEndCard ? endCardStartFrame : 0}
          soundEffectsBaseUrl={soundEffectsBaseUrl}
        />
      )}
      
      {/* Legacy: Enhanced Sound Design Layer (Phase 16) - fallback when no soundEffectsBaseUrl */}
      {!soundEffectsBaseUrl && effectiveSoundConfig.enabled && effectiveSoundConfig.transitionSounds && transitions && transitions.length > 0 && (
        <SoundDesignLayer
          transitions={transitions.map((t, i) => {
            const nextSceneStart = sceneStartFrames[i + 1] || 0;
            const transitionDurationFrames = Math.round(t.duration * fps);
            return {
              config: t,
              startFrame: nextSceneStart - Math.floor(transitionDurationFrames / 2),
            };
          })}
          logoRevealFrame={effectiveSoundConfig.impactSounds && hasEndCard ? endCardStartFrame + Math.round(0.3 * fps) : undefined}
          ctaStartFrame={effectiveSoundConfig.impactSounds && hasEndCard ? endCardStartFrame : undefined}
          enableAmbient={effectiveSoundConfig.ambientLayer && effectiveSoundConfig.ambientType !== 'none'}
          ambientType={effectiveSoundConfig.ambientType === 'nature' ? 'nature' : 'warm'}
          masterVolume={effectiveSoundConfig.masterVolume}
        />
      )}
      
      {/* Phase 18D: Ducked Music with VoiceoverRanges (preferred) - uses soundDesignConfig values */}
      {musicUrl && voiceoverRanges && voiceoverRanges.length > 0 && (() => {
        const nativeAudioRanges: NativeAudioRange[] = [];
        for (let si = 0; si < scenes.length; si++) {
          const scene = scenes[si];
          const sceneFramePos = sceneStartFrames[si];
          const sceneDurationSec = scene.duration || 5;
          const sceneFrames = sceneDurationSec * fps;
          const microScenes = scene.microScenes || [];
          const manifest = scene.assemblyManifest;
          const useManifestTiming = manifest && !manifest.assemblyFailed && manifest.assembledClipValid !== false && manifest.clips.length > 0;

          if (microScenes.length > 0) {
            if (useManifestTiming) {
              for (const clip of manifest!.clips) {
                const ms = microScenes[clip.microSceneIndex];
                if (ms && (ms.originalAudioVolume || 0) > 0 && ms.videoUrl) {
                  nativeAudioRanges.push({
                    startFrame: sceneFramePos + Math.round(clip.startTimeSec * fps),
                    endFrame: sceneFramePos + Math.round(clip.endTimeSec * fps),
                    volume: ms.originalAudioVolume,
                  });
                }
              }
            } else {
              const totalMsDuration = microScenes.reduce((sum: number, ms: any) => sum + (ms.duration || 0), 0) || sceneDurationSec;
              let msFrameOffset = 0;
              for (const ms of microScenes) {
                const msDur = ms.duration || (sceneDurationSec / microScenes.length);
                const msFrameCount = Math.round((msDur / totalMsDuration) * sceneFrames);
                if ((ms.originalAudioVolume || 0) > 0 && ms.videoUrl) {
                  nativeAudioRanges.push({
                    startFrame: sceneFramePos + msFrameOffset,
                    endFrame: sceneFramePos + msFrameOffset + msFrameCount,
                    volume: ms.originalAudioVolume,
                  });
                }
                msFrameOffset += msFrameCount;
              }
            }
          }
        }
        return (
          <DuckedMusic
            musicUrl={musicUrl}
            baseVolume={soundDesignConfig?.audioDucking?.baseVolume ?? musicVolume}
            duckLevel={soundDesignConfig?.audioDucking?.duckLevel ?? 0.1}
            voiceoverRanges={voiceoverRanges}
            nativeAudioRanges={nativeAudioRanges.length > 0 ? nativeAudioRanges : undefined}
            fadeFrames={soundDesignConfig?.audioDucking?.fadeFrames ?? 15}
          />
        );
      })()}
      
      {/* Legacy: Enhanced Ducked Music with Keyframes (Phase 16) - fallback if no voiceoverRanges */}
      {musicUrl && (!voiceoverRanges || voiceoverRanges.length === 0) && audioDuckingKeyframes && audioDuckingKeyframes.length > 0 && (
        <DuckedMusic
          musicUrl={musicUrl}
          baseVolume={musicVolume}
          volumeKeyframes={audioDuckingKeyframes}
          fps={fps}
        />
      )}
    </AbsoluteFill>
  );
};

export default UniversalVideoComposition;
