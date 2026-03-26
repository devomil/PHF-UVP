import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import type { TextOverlayItem, TextOverlayAnimation } from '../../shared/video-types';

export interface CustomTextOverlayProps {
  overlay: TextOverlayItem;
  durationInFrames: number;
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function computeAnimation(
  animation: TextOverlayAnimation,
  progress: number,
  direction: 'enter' | 'exit',
  frame: number,
  fps: number,
): { opacity: number; translateX: number; translateY: number; scale: number; blur: number } {
  const result = { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0 };
  const eased = direction === 'enter' ? easeOutCubic(progress) : easeInCubic(progress);
  const factor = direction === 'enter' ? eased : 1 - eased;

  switch (animation) {
    case 'none':
      break;
    case 'fade':
      result.opacity = factor;
      break;
    case 'slide-up':
      result.opacity = factor;
      result.translateY = direction === 'enter'
        ? interpolate(eased, [0, 1], [50, 0])
        : interpolate(eased, [0, 1], [0, -40]);
      break;
    case 'slide-down':
      result.opacity = factor;
      result.translateY = direction === 'enter'
        ? interpolate(eased, [0, 1], [-50, 0])
        : interpolate(eased, [0, 1], [0, 40]);
      break;
    case 'slide-left':
      result.opacity = factor;
      result.translateX = direction === 'enter'
        ? interpolate(eased, [0, 1], [80, 0])
        : interpolate(eased, [0, 1], [0, -80]);
      break;
    case 'slide-right':
      result.opacity = factor;
      result.translateX = direction === 'enter'
        ? interpolate(eased, [0, 1], [-80, 0])
        : interpolate(eased, [0, 1], [0, 80]);
      break;
    case 'pop':
      result.opacity = factor;
      if (direction === 'enter') {
        result.scale = spring({
          frame,
          fps,
          config: { damping: 10, stiffness: 200 },
        });
      } else {
        result.scale = interpolate(eased, [0, 1], [1, 0.8]);
      }
      break;
    case 'typewriter':
      break;
    case 'blur-in':
      result.opacity = factor;
      if (direction === 'enter') {
        result.blur = interpolate(eased, [0, 1], [16, 0]);
      } else {
        result.blur = interpolate(eased, [0, 1], [0, 16]);
      }
      break;
  }
  return result;
}

export const CustomTextOverlay: React.FC<CustomTextOverlayProps> = ({
  overlay,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const animDuration = Math.max(1, Math.round((overlay.animationDuration ?? 0.4) * fps));
  const fadeInEnd = animDuration;
  const fadeOutStart = durationInFrames - animDuration;

  let opacity = 1;
  let translateX = 0;
  let translateY = 0;
  let scale = 1;
  let blur = 0;

  if (frame < fadeInEnd && overlay.enterAnimation !== 'none') {
    const progress = frame / fadeInEnd;
    const anim = computeAnimation(overlay.enterAnimation, progress, 'enter', frame, fps);
    opacity = anim.opacity;
    translateX = anim.translateX;
    translateY = anim.translateY;
    scale = anim.scale;
    blur = anim.blur;
  } else if (frame > fadeOutStart && overlay.exitAnimation !== 'none') {
    const progress = (frame - fadeOutStart) / animDuration;
    const anim = computeAnimation(overlay.exitAnimation, progress, 'exit', frame - fadeOutStart, fps);
    opacity = anim.opacity;
    translateX = anim.translateX;
    translateY = anim.translateY;
    scale = anim.scale;
    blur = anim.blur;
  }

  const text = overlay.text || '';
  const displayText = overlay.enterAnimation === 'typewriter' && frame < fadeInEnd
    ? text.substring(0, Math.floor(interpolate(frame, [0, fadeInEnd], [0, text.length], { extrapolateRight: 'clamp' })))
    : text;

  const bgOpacity = overlay.backgroundOpacity ?? 0;
  const hasBg = overlay.backgroundColor && bgOpacity > 0;

  const backgroundStyle: React.CSSProperties = hasBg
    ? {
        backgroundColor: `rgba(${hexToRgb(overlay.backgroundColor!)}, ${bgOpacity / 100})`,
        backdropFilter: bgOpacity > 30 ? 'blur(4px)' : undefined,
      }
    : {};

  return (
    <div
      style={{
        position: 'absolute',
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        width: `${overlay.width}%`,
        height: `${overlay.height}%`,
        opacity: (overlay.opacity / 100) * opacity,
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        zIndex: 55,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: overlay.textAlign === 'left' ? 'flex-start' : overlay.textAlign === 'right' ? 'flex-end' : 'center',
        ...backgroundStyle,
        borderRadius: overlay.borderRadius ?? 0,
        padding: '0.5%',
        boxSizing: 'border-box',
        willChange: 'transform, opacity, filter',
      }}
    >
      <div
        style={{
          fontSize: overlay.fontSize,
          fontFamily: overlay.fontFamily || 'Inter, sans-serif',
          fontWeight: overlay.fontWeight || '600',
          color: overlay.color || '#FFFFFF',
          textAlign: overlay.textAlign || 'center',
          letterSpacing: overlay.letterSpacing != null ? `${overlay.letterSpacing}px` : undefined,
          lineHeight: overlay.lineHeight ?? 1.3,
          textShadow: overlay.textShadow !== false ? '1px 2px 6px rgba(0,0,0,0.7), 0 0 20px rgba(0,0,0,0.3)' : undefined,
          width: '100%',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
      >
        {displayText}
      </div>
    </div>
  );
};

export default CustomTextOverlay;
