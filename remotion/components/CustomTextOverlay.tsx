import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import type { TextOverlayItem, TextOverlayEnterAnimation, TextOverlayExitAnimation, TextEmphasisAnimation } from '../../shared/video-types';

const SYSTEM_FONTS = new Set(["Inter", "Arial", "Georgia", "Courier New", "Impact", "Verdana", "Trebuchet MS", "Palatino", "Open Sans"]);

const GoogleFontLink: React.FC<{ fontFamily?: string }> = ({ fontFamily }) => {
  const href = useMemo(() => {
    if (!fontFamily || SYSTEM_FONTS.has(fontFamily)) return null;
    const param = `family=${fontFamily.replace(/ /g, '+')}:wght@300;400;500;600;700;800;900`;
    return `https://fonts.googleapis.com/css2?${param}&display=swap`;
  }, [fontFamily]);
  if (!href) return null;
  return <link rel="stylesheet" href={href} />;
};

export interface CustomTextOverlayProps {
  overlay: TextOverlayItem;
  durationInFrames: number;
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
  if (!result) return '0, 0, 0';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

interface AnimResult {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  blur: number;
  clipPath: string | null;
}

function computeEnterAnimation(
  animation: TextOverlayEnterAnimation,
  progress: number,
  frame: number,
  fps: number,
  textLength: number,
): AnimResult {
  const result: AnimResult = { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0, clipPath: null };
  const eased = easeOutCubic(progress);

  switch (animation) {
    case 'none':
      break;
    case 'fade':
      result.opacity = eased;
      break;
    case 'rise':
      result.opacity = eased;
      result.translateY = interpolate(eased, [0, 1], [50, 0]);
      break;
    case 'drop':
      result.opacity = eased;
      result.translateY = interpolate(eased, [0, 1], [-50, 0]);
      break;
    case 'wipe-left':
      result.clipPath = `inset(0 ${100 - eased * 100}% 0 0)`;
      break;
    case 'wipe-right':
      result.clipPath = `inset(0 0 0 ${100 - eased * 100}%)`;
      break;
    case 'scale-pop':
      result.opacity = eased;
      result.scale = spring({
        frame,
        fps,
        config: { damping: 10, stiffness: 200 },
      });
      break;
    case 'typewriter':
      break;
    case 'blur-in':
      result.opacity = eased;
      result.blur = interpolate(eased, [0, 1], [16, 0]);
      break;
  }
  return result;
}

function computeExitAnimation(
  animation: TextOverlayExitAnimation,
  progress: number,
): AnimResult {
  const result: AnimResult = { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0, clipPath: null };
  const eased = easeInCubic(progress);
  const factor = 1 - eased;

  switch (animation) {
    case 'none':
      break;
    case 'fade':
      result.opacity = factor;
      break;
    case 'slide-out':
      result.opacity = factor;
      result.translateY = interpolate(eased, [0, 1], [0, -40]);
      break;
    case 'scale-down':
      result.opacity = factor;
      result.scale = interpolate(eased, [0, 1], [1, 0.7]);
      break;
  }
  return result;
}

function computeEmphasis(
  emphasis: TextEmphasisAnimation,
  frame: number,
  fps: number,
): { scale: number; filterExtra: string } {
  const result = { scale: 1, filterExtra: '' };
  const cycle = (frame % (fps * 2)) / (fps * 2);
  const pulse = Math.sin(cycle * Math.PI * 2) * 0.5 + 0.5;

  switch (emphasis) {
    case 'none':
      break;
    case 'pulse':
      result.scale = 1 + pulse * 0.05;
      break;
    case 'float':
      result.scale = 1 + Math.sin(frame * 0.08) * 0.02;
      break;
    case 'shimmer':
      result.filterExtra = `brightness(${1 + pulse * 0.3})`;
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
  let clipPath: string | null = null;

  const text = overlay.text || '';

  if (localFrame < fadeInEnd && overlay.enterAnimation !== 'none') {
    const progress = localFrame / fadeInEnd;
    const anim = computeEnterAnimation(overlay.enterAnimation, progress, localFrame, fps, text.length);
    opacity = anim.opacity;
    translateX = anim.translateX;
    translateY = anim.translateY;
    scale = anim.scale;
    blur = anim.blur;
    clipPath = anim.clipPath;
  } else if (localFrame > fadeOutStart && overlay.exitAnimation !== 'none') {
    const progress = (localFrame - fadeOutStart) / animDuration;
    const anim = computeExitAnimation(overlay.exitAnimation, progress);
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
  const displayText = overlay.enterAnimation === 'typewriter' && localFrame < fadeInEnd
    ? text.substring(0, Math.floor(interpolate(localFrame, [0, fadeInEnd], [0, text.length], { extrapolateRight: 'clamp' })))
    : text;

  const bgOpacity = overlay.backgroundOpacity ?? 0;
  const hasBg = overlay.backgroundColor && bgOpacity > 0;
  const hasAutoBackground = overlay.autoBackground === true;
  const autoBackgroundOpacity = overlay.autoBackgroundOpacity ?? 50;

  const backgroundStyle: React.CSSProperties = hasBg
    ? {
        backgroundColor: `rgba(${hexToRgb(overlay.backgroundColor!)}, ${bgOpacity / 100})`,
        backdropFilter: bgOpacity > 30 ? 'blur(4px)' : undefined,
      }
    : {};

  const filterParts = [
    blur > 0 ? `blur(${blur}px)` : '',
    emphasis?.filterExtra || '',
  ].filter(Boolean);
  const filterStr = filterParts.length > 0 ? filterParts.join(' ') : undefined;

  return (
    <>
    <GoogleFontLink fontFamily={overlay.fontFamily} />
    <div
      style={{
        position: 'absolute',
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        width: `${overlay.width}%`,
        height: `${overlay.height}%`,
        opacity: (overlay.opacity / 100) * opacity,
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        filter: filterStr,
        clipPath: clipPath || undefined,
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
      {hasAutoBackground && !hasBg && (
        <div
          style={{
            position: 'absolute',
            inset: '-8%',
            backgroundColor: `rgba(0, 0, 0, ${autoBackgroundOpacity / 100})`,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderRadius: (overlay.borderRadius ?? 0) + 4,
            zIndex: -1,
          }}
        />
      )}
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
    </>
  );
};

export default CustomTextOverlay;
