import React from 'react';
import { Img, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import type { LogoAnimation, LogoShadow } from '../../shared/types/logo-composition-types';

export interface BrandLogoOverlayProps {
  logoUrl: string;
  placement: { 
    x: number; 
    y: number; 
    width: number; 
    height: number; 
    opacity: number;
  };
  animation: LogoAnimation;
  animationDuration: number;
  animationDelay: number;
  startFrame: number;
  endFrame?: number;
  shadow?: LogoShadow;
}

export const BrandLogoOverlay: React.FC<BrandLogoOverlayProps> = ({
  logoUrl,
  placement,
  animation,
  animationDuration,
  animationDelay,
  startFrame,
  endFrame,
  shadow,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  
  const actualStart = startFrame + animationDelay;
  const actualEnd = endFrame || durationInFrames;
  
  if (frame < actualStart || frame > actualEnd) return null;
  
  const localFrame = frame - actualStart;
  const progress = Math.min(localFrame / Math.max(animationDuration, 1), 1);
  
  let opacity = placement.opacity;
  let transform = 'none';
  let scale = 1;
  
  switch (animation) {
    case 'none':
      break;
    case 'fade-in':
      opacity *= interpolate(
        localFrame,
        [0, animationDuration],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
      break;
    case 'slide-in':
      opacity *= progress;
      const slideX = interpolate(
        localFrame,
        [0, animationDuration],
        [100, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
      transform = `translateX(${slideX}px)`;
      break;
    case 'scale-up':
      opacity *= progress;
      scale = spring({
        frame: localFrame,
        fps,
        config: { damping: 15, stiffness: 180 },
      });
      scale = 0.5 + Math.min(scale, 1) * 0.5;
      transform = `scale(${scale})`;
      break;
    case 'fade-out-end':
      const fadeOutStart = actualEnd - actualStart - fps * 0.5;
      if (localFrame > fadeOutStart) {
        opacity *= interpolate(
          localFrame,
          [fadeOutStart, actualEnd - actualStart],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
      }
      break;
    case 'pulse':
      const pulseScale = 1 + Math.sin(frame * 0.1) * 0.02;
      transform = `scale(${pulseScale})`;
      break;
  }
  
  const shadowStyle = shadow?.enabled
    ? `drop-shadow(${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color})`
    : 'none';
  
  return (
    <div
      data-testid="brand-logo-overlay"
      style={{
        position: 'absolute',
        left: placement.x,
        top: placement.y,
        width: placement.width,
        height: placement.height,
        opacity,
        transform,
        filter: shadowStyle,
        transformOrigin: 'center center',
      }}
    >
      <Img
        src={logoUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

export default BrandLogoOverlay;
