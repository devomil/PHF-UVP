import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring } from 'remotion';

export interface TextOverlayStyle {
  fontSize: number;
  fontWeight: 'normal' | 'bold' | 'semibold' | string;
  fontFamily: string;
  color: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  padding?: number;
  borderRadius?: number;
  shadow?: boolean;
  textShadow?: boolean;
}

export interface TextPlacementData {
  overlay: {
    id: string;
    text: string;
    type: 'lower_third' | 'title' | 'subtitle' | 'caption' | 'cta';
  };
  position: {
    x: number;
    y: number;
    anchor: string;
  };
  animation: {
    enter: string;
    exit: string;
    duration: number;
  };
  timing: {
    startFrame: number;
    endFrame: number;
  };
  style: TextOverlayStyle;
  placementReason: string;
}

interface TextOverlayProps {
  placement: TextPlacementData;
  fps: number;
}

export const TextOverlay: React.FC<TextOverlayProps> = ({ placement, fps }) => {
  const frame = useCurrentFrame();
  const { timing, animation, position, style, overlay } = placement;

  if (frame < timing.startFrame || frame > timing.endFrame) {
    return null;
  }

  const animFrames = Math.round(animation.duration * fps);

  const opacity = interpolate(
    frame,
    [timing.startFrame, timing.startFrame + animFrames, timing.endFrame - animFrames, timing.endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  let transform = '';
  if (animation.enter === 'slide-up') {
    const y = interpolate(frame, [timing.startFrame, timing.startFrame + animFrames], [30, 0], { extrapolateRight: 'clamp' });
    transform = `translateY(${y}px)`;
  } else if (animation.enter === 'pop') {
    const scale = interpolate(frame, [timing.startFrame, timing.startFrame + animFrames], [0.8, 1], { extrapolateRight: 'clamp' });
    transform = `scale(${scale})`;
  } else if (animation.enter === 'slide-left') {
    const x = interpolate(frame, [timing.startFrame, timing.startFrame + animFrames], [60, 0], { extrapolateRight: 'clamp' });
    transform = `translateX(${x}px)`;
  }

  const posStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${position.x}%`,
    top: `${position.y}%`,
    transform: `translate(-50%, -50%) ${transform}`,
  };

  const getFontWeight = (weight: string): number | string => {
    switch (weight) {
      case 'bold': return 700;
      case 'semibold': return 600;
      default: return 400;
    }
  };

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        data-testid={`text-overlay-${overlay.id}`}
        style={{
          ...posStyle,
          opacity,
          fontSize: style.fontSize,
          fontWeight: getFontWeight(style.fontWeight),
          fontFamily: style.fontFamily,
          color: style.color,
          backgroundColor: style.backgroundColor 
            ? style.backgroundOpacity !== undefined 
              ? `rgba(${hexToRgb(style.backgroundColor)}, ${style.backgroundOpacity})`
              : style.backgroundColor
            : undefined,
          padding: style.padding,
          borderRadius: style.borderRadius,
          textShadow: (style.shadow || style.textShadow) ? '2px 2px 4px rgba(0,0,0,0.5)' : undefined,
          whiteSpace: 'nowrap',
          maxWidth: '80%',
          textAlign: 'center',
          lineHeight: 1.4,
        }}
      >
        {overlay.text}
      </div>
    </AbsoluteFill>
  );
};

interface MultipleTextOverlaysProps {
  placements: TextPlacementData[];
  fps: number;
}

export const MultipleTextOverlays: React.FC<MultipleTextOverlaysProps> = ({ placements, fps }) => {
  return (
    <>
      {placements.map((placement) => (
        <TextOverlay key={placement.overlay.id} placement={placement} fps={fps} />
      ))}
    </>
  );
};

export interface EnhancedTextOverlayProps {
  text: string;
  position: 'top' | 'center' | 'bottom' | 'custom';
  customPosition?: { x: number; y: number };
  alignment: 'left' | 'center' | 'right';
  style: {
    fontSize: number;
    fontFamily: string;
    fontWeight: string;
    color: string;
    backgroundColor?: string;
    backgroundOpacity?: number;
    padding?: number;
    borderRadius?: number;
    textShadow?: boolean;
  };
  animation: {
    type: 'none' | 'fade' | 'slide-up' | 'slide-left' | 'pop' | 'typewriter';
    duration: number;
    delay: number;
  };
  timing: {
    startFrame: number;
    endFrame: number;
  };
}

export const EnhancedTextOverlay: React.FC<EnhancedTextOverlayProps> = ({
  text,
  position,
  customPosition,
  alignment,
  style,
  animation,
  timing,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  if (frame < timing.startFrame || frame > timing.endFrame) {
    return null;
  }
  
  const localFrame = frame - timing.startFrame;
  const duration = timing.endFrame - timing.startFrame;
  const fadeOutStart = duration - Math.round(fps * 0.3);
  
  let opacity = 1;
  if (animation.type !== 'none') {
    opacity = interpolate(
      localFrame,
      [animation.delay, animation.delay + animation.duration, fadeOutStart, duration],
      [0, 1, 1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }
  
  let transform = '';
  
  if (animation.type === 'slide-up') {
    const translateY = interpolate(
      localFrame,
      [animation.delay, animation.delay + animation.duration],
      [40, 0],
      { extrapolateRight: 'clamp' }
    );
    transform = `translateY(${translateY}px)`;
  } else if (animation.type === 'slide-left') {
    const translateX = interpolate(
      localFrame,
      [animation.delay, animation.delay + animation.duration],
      [60, 0],
      { extrapolateRight: 'clamp' }
    );
    transform = `translateX(${translateX}px)`;
  } else if (animation.type === 'pop') {
    const scale = spring({
      frame: localFrame - animation.delay,
      fps,
      config: { damping: 12, stiffness: 200 },
    });
    transform = `scale(${scale})`;
  }
  
  const getPositionStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      left: alignment === 'left' ? '5%' : alignment === 'right' ? 'auto' : '50%',
      right: alignment === 'right' ? '5%' : 'auto',
      transform: alignment === 'center' ? `translateX(-50%) ${transform}` : transform,
      textAlign: alignment,
    };
    
    if (position === 'custom' && customPosition) {
      return {
        ...base,
        left: `${customPosition.x}%`,
        top: `${customPosition.y}%`,
        transform: `translate(-50%, -50%) ${transform}`,
      };
    }
    
    switch (position) {
      case 'top':
        return { ...base, top: '10%' };
      case 'center':
        return { ...base, top: '50%', transform: `translate(-50%, -50%) ${transform}` };
      case 'bottom':
        return { ...base, bottom: '15%' };
      default:
        return { ...base, bottom: '15%' };
    }
  };
  
  const displayText = animation.type === 'typewriter'
    ? text.substring(0, Math.floor(interpolate(
        localFrame,
        [animation.delay, animation.delay + animation.duration],
        [0, text.length],
        { extrapolateRight: 'clamp' }
      )))
    : text;
  
  return (
    <div
      data-testid="enhanced-text-overlay"
      style={{
        ...getPositionStyles(),
        opacity,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        color: style.color,
        backgroundColor: style.backgroundColor 
          ? `rgba(${hexToRgb(style.backgroundColor)}, ${style.backgroundOpacity || 0.8})`
          : 'transparent',
        padding: style.padding || 16,
        borderRadius: style.borderRadius || 8,
        textShadow: style.textShadow ? '2px 2px 4px rgba(0,0,0,0.5)' : 'none',
        maxWidth: '80%',
        lineHeight: 1.4,
      }}
    >
      {displayText}
    </div>
  );
};

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

export default TextOverlay;
