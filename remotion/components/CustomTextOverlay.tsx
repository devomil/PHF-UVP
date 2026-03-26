import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import type { TextOverlayItem, TextOverlayAnimation, TextEmphasisAnimation } from '../../shared/video-types';

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

function computeEmphasis(
  emphasis: TextEmphasisAnimation,
  frame: number,
  fps: number,
): { scale: number; filterExtra: string; colorShift: string | null } {
  const result = { scale: 1, filterExtra: '', colorShift: null as string | null };
  const cycle = (frame % (fps * 2)) / (fps * 2);
  const pulse = Math.sin(cycle * Math.PI * 2) * 0.5 + 0.5;

  switch (emphasis) {
    case 'none':
      break;
    case 'pulse':
      result.scale = 1 + pulse * 0.05;
      break;
    case 'glow':
      result.filterExtra = `drop-shadow(0 0 ${4 + pulse * 12}px rgba(255,255,255,${0.3 + pulse * 0.4}))`;
      break;
    case 'shake': {
      const shakeX = Math.sin(frame * 0.8) * 1.5;
      const shakeY = Math.cos(frame * 1.1) * 1;
      result.filterExtra = `translate(${shakeX}px, ${shakeY}px)`;
      break;
    }
    case 'bounce':
      result.scale = 1 + Math.abs(Math.sin(frame * 0.15)) * 0.08;
      break;
    case 'color-cycle':
      result.colorShift = `hue-rotate(${(frame * 3) % 360}deg)`;
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

  const startFrame = overlay.timingStart != null ? Math.round(overlay.timingStart * fps) : 0;
  const overlayDuration = overlay.timingDuration != null
    ? Math.round(overlay.timingDuration * fps)
    : durationInFrames;
  const endFrame = startFrame + overlayDuration;

  if (frame < startFrame || frame >= endFrame) {
    return null;
  }

  const localFrame = frame - startFrame;
  const animDuration = Math.max(1, Math.round((overlay.animationDuration ?? 0.4) * fps));
  const fadeInEnd = animDuration;
  const fadeOutStart = overlayDuration - animDuration;

  let opacity = 1;
  let translateX = 0;
  let translateY = 0;
  let scale = 1;
  let blur = 0;

  if (localFrame < fadeInEnd && overlay.enterAnimation !== 'none') {
    const progress = localFrame / fadeInEnd;
    const anim = computeAnimation(overlay.enterAnimation, progress, 'enter', localFrame, fps);
    opacity = anim.opacity;
    translateX = anim.translateX;
    translateY = anim.translateY;
    scale = anim.scale;
    blur = anim.blur;
  } else if (localFrame > fadeOutStart && overlay.exitAnimation !== 'none') {
    const progress = (localFrame - fadeOutStart) / animDuration;
    const anim = computeAnimation(overlay.exitAnimation, progress, 'exit', localFrame - fadeOutStart, fps);
    opacity = anim.opacity;
    translateX = anim.translateX;
    translateY = anim.translateY;
    scale = anim.scale;
    blur = anim.blur;
  }

  const emphasis = overlay.emphasisAnimation && overlay.emphasisAnimation !== 'none'
    ? computeEmphasis(overlay.emphasisAnimation, localFrame, fps)
    : null;
  if (emphasis) {
    scale *= emphasis.scale;
  }

  const hasBullets = overlay.bulletPoints && overlay.bulletPoints.length > 0;
  const bulletDelay = overlay.bulletDelay ?? 0.3;
  const text = overlay.text || '';
  const displayText = overlay.enterAnimation === 'typewriter' && localFrame < fadeInEnd
    ? text.substring(0, Math.floor(interpolate(localFrame, [0, fadeInEnd], [0, text.length], { extrapolateRight: 'clamp' })))
    : text;

  const bgOpacity = overlay.backgroundOpacity ?? 0;
  const hasBg = overlay.backgroundColor && bgOpacity > 0;

  const backgroundStyle: React.CSSProperties = hasBg
    ? {
        backgroundColor: `rgba(${hexToRgb(overlay.backgroundColor!)}, ${bgOpacity / 100})`,
        backdropFilter: bgOpacity > 30 ? 'blur(4px)' : undefined,
      }
    : {};

  const filterStr = [
    blur > 0 ? `blur(${blur}px)` : '',
    emphasis?.colorShift || '',
  ].filter(Boolean).join(' ') || undefined;

  const emphasisFilter = emphasis?.filterExtra || '';
  const transformStr = `translate(${translateX}px, ${translateY}px) scale(${scale}) ${emphasisFilter}`;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        width: `${overlay.width}%`,
        height: `${overlay.height}%`,
        opacity: (overlay.opacity / 100) * opacity,
        transform: transformStr,
        filter: filterStr,
        zIndex: 55,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: overlay.textAlign === 'left' ? 'flex-start' : overlay.textAlign === 'right' ? 'flex-end' : 'center',
        justifyContent: 'center',
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

      {hasBullets && overlay.bulletPoints!.map((bullet, idx) => {
        const bulletStartFrame = Math.round(idx * bulletDelay * fps);
        if (localFrame < bulletStartFrame) return null;

        const bulletLocalFrame = localFrame - bulletStartFrame;
        const bulletFadeIn = Math.min(Math.round(fps * 0.3), 10);
        const bulletOpacity = interpolate(
          bulletLocalFrame,
          [0, bulletFadeIn],
          [0, 1],
          { extrapolateRight: 'clamp' }
        );
        const bulletSlide = interpolate(
          bulletLocalFrame,
          [0, bulletFadeIn],
          [20, 0],
          { extrapolateRight: 'clamp' }
        );

        return (
          <div
            key={idx}
            style={{
              fontSize: Math.round(overlay.fontSize * 0.8),
              fontFamily: overlay.fontFamily || 'Inter, sans-serif',
              fontWeight: '500',
              color: overlay.color || '#FFFFFF',
              textAlign: overlay.textAlign || 'left',
              textShadow: overlay.textShadow !== false ? '1px 1px 4px rgba(0,0,0,0.6)' : undefined,
              opacity: bulletOpacity,
              transform: `translateY(${bulletSlide}px)`,
              marginTop: '0.5%',
              width: '100%',
            }}
          >
            {bullet}
          </div>
        );
      })}
    </div>
  );
};

export default CustomTextOverlay;
