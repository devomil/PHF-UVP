import React from 'react';
import { Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export interface KenBurnsProps {
  src: string;
  animation: 'ken-burns' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'static';
  intensity: 'subtle' | 'medium' | 'dramatic';
  focusPoint?: { x: number; y: number };
}

export const KenBurnsImage: React.FC<KenBurnsProps> = ({
  src,
  animation,
  intensity,
  focusPoint = { x: 50, y: 50 },
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  
  const intensityMultiplier = {
    subtle: 0.5,
    medium: 1,
    dramatic: 1.5,
  }[intensity];
  
  let transform = '';
  let transformOrigin = 'center center';
  
  switch (animation) {
    case 'ken-burns': {
      const scale = interpolate(
        frame,
        [0, durationInFrames],
        [1, 1 + 0.1 * intensityMultiplier]
      );
      const translateX = interpolate(
        frame,
        [0, durationInFrames],
        [0, (focusPoint.x - 50) * 0.2 * intensityMultiplier]
      );
      const translateY = interpolate(
        frame,
        [0, durationInFrames],
        [0, (focusPoint.y - 50) * 0.2 * intensityMultiplier]
      );
      transform = `scale(${scale}) translate(${translateX}%, ${translateY}%)`;
      break;
    }
    
    case 'zoom-in': {
      const scale = interpolate(
        frame,
        [0, durationInFrames],
        [1, 1 + 0.15 * intensityMultiplier]
      );
      transform = `scale(${scale})`;
      transformOrigin = `${focusPoint.x}% ${focusPoint.y}%`;
      break;
    }
    
    case 'zoom-out': {
      const scale = interpolate(
        frame,
        [0, durationInFrames],
        [1 + 0.15 * intensityMultiplier, 1]
      );
      transform = `scale(${scale})`;
      transformOrigin = `${focusPoint.x}% ${focusPoint.y}%`;
      break;
    }
    
    case 'pan-left': {
      const translateX = interpolate(
        frame,
        [0, durationInFrames],
        [5 * intensityMultiplier, -5 * intensityMultiplier]
      );
      transform = `translateX(${translateX}%) scale(1.1)`;
      break;
    }
    
    case 'pan-right': {
      const translateX = interpolate(
        frame,
        [0, durationInFrames],
        [-5 * intensityMultiplier, 5 * intensityMultiplier]
      );
      transform = `translateX(${translateX}%) scale(1.1)`;
      break;
    }
    
    case 'static':
    default:
      transform = 'scale(1)';
      break;
  }
  
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform,
          transformOrigin,
        }}
      />
    </div>
  );
};
