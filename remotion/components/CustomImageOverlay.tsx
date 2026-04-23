import React from 'react';
import { Img, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import type { ImageOverlayItem } from '../../shared/video-types';

export interface CustomImageOverlayProps {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  durationInFrames: number;
  dropShadow?: boolean;
  cornerRadius?: number;
  enterAnimation?: ImageOverlayItem['enterAnimation'];
  exitAnimation?: ImageOverlayItem['exitAnimation'];
  animationDuration?: number;
  timingStart?: number;
  timingDuration?: number;
}

function resolveOverlayUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return url;
}

export const CustomImageOverlay: React.FC<CustomImageOverlayProps> = ({
  url,
  x,
  y,
  width,
  height,
  opacity,
  durationInFrames,
  dropShadow,
  cornerRadius,
  enterAnimation = 'fade',
  exitAnimation = 'fade',
  animationDuration = 0.4,
  timingStart,
  timingDuration,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.max(0, Math.round((timingStart ?? 0) * fps));
  const visibleDuration = timingDuration != null
    ? Math.max(1, Math.round(timingDuration * fps))
    : durationInFrames - startFrame;
  const endFrame = Math.min(durationInFrames, startFrame + visibleDuration);

  if (frame < startFrame || frame > endFrame) return null;

  const localFrame = frame - startFrame;
  const localDuration = Math.max(1, endFrame - startFrame);
  // Guarantee strictly-monotonic interpolation inputs even for very short
  // overlay durations or oversized animationDuration values.
  const requestedAnimFrames = Math.max(1, Math.round(animationDuration * fps));
  const animFrames = Math.max(1, Math.min(requestedAnimFrames, Math.floor(localDuration / 2)));
  const enterEnd = Math.min(animFrames, Math.max(1, localDuration - 1));
  const exitStart = Math.max(enterEnd + 1, localDuration - animFrames);
  const safeExitStart = Math.min(exitStart, localDuration - 1);
  const safeEnterEnd = Math.min(enterEnd, safeExitStart - 1);

  const baseOpacity = opacity / 100;
  let animatedOpacity = baseOpacity;

  if (enterAnimation === 'none' && exitAnimation === 'none') {
    animatedOpacity = baseOpacity;
  } else {
    animatedOpacity = interpolate(
      localFrame,
      [0, safeEnterEnd, safeExitStart, localDuration],
      [
        enterAnimation === 'none' ? baseOpacity : 0,
        baseOpacity,
        baseOpacity,
        exitAnimation === 'none' ? baseOpacity : 0,
      ],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }

  let transform = '';
  const enterRange: [number, number] = [0, Math.max(1, safeEnterEnd)];
  const exitRange: [number, number] = [safeExitStart, Math.max(safeExitStart + 1, localDuration)];
  if (enterAnimation === 'rise') {
    const ty = interpolate(localFrame, enterRange, [24, 0], { extrapolateRight: 'clamp' });
    transform += ` translateY(${ty}px)`;
  } else if (enterAnimation === 'drop') {
    const ty = interpolate(localFrame, enterRange, [-24, 0], { extrapolateRight: 'clamp' });
    transform += ` translateY(${ty}px)`;
  } else if (enterAnimation === 'wipe-left') {
    const tx = interpolate(localFrame, enterRange, [-60, 0], { extrapolateRight: 'clamp' });
    transform += ` translateX(${tx}px)`;
  } else if (enterAnimation === 'wipe-right') {
    const tx = interpolate(localFrame, enterRange, [60, 0], { extrapolateRight: 'clamp' });
    transform += ` translateX(${tx}px)`;
  } else if (enterAnimation === 'scale-pop') {
    const s = spring({ frame: localFrame, fps, config: { damping: 14, stiffness: 180 } });
    transform += ` scale(${Math.min(1, s)})`;
  } else if (enterAnimation === 'blur-in') {
    // blur handled separately
  }

  if (exitAnimation === 'slide-out' && localFrame >= safeExitStart) {
    const tx = interpolate(localFrame, exitRange, [0, 60], { extrapolateRight: 'clamp' });
    transform += ` translateX(${tx}px)`;
  } else if (exitAnimation === 'scale-down' && localFrame >= safeExitStart) {
    const s = interpolate(localFrame, exitRange, [1, 0.7], { extrapolateRight: 'clamp' });
    transform += ` scale(${s})`;
  }

  let filter: string | undefined;
  if (dropShadow) {
    filter = 'drop-shadow(0 4px 12px rgba(0,0,0,0.45))';
  }
  if (enterAnimation === 'blur-in' && localFrame < enterEnd) {
    const b = interpolate(localFrame, [0, enterEnd], [10, 0], { extrapolateRight: 'clamp' });
    filter = `${filter ? filter + ' ' : ''}blur(${b}px)`;
  }

  const resolvedUrl = resolveOverlayUrl(url);
  if (!resolvedUrl) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
        opacity: animatedOpacity,
        zIndex: 50,
        pointerEvents: 'none',
        transform: transform || undefined,
        filter,
      }}
    >
      <Img
        src={resolvedUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          borderRadius: cornerRadius ? `${cornerRadius}px` : undefined,
        }}
      />
    </div>
  );
};

export default CustomImageOverlay;
