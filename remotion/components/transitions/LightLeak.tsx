import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, Easing, random } from 'remotion';

export type LightLeakStyle = 'warm' | 'cool' | 'golden' | 'pink' | 'natural' | 'vintage';

interface LightLeakProps {
  style?: LightLeakStyle;
  durationInFrames: number;
  intensity?: number;
  direction?: 'left' | 'right' | 'top' | 'bottom' | 'corner';
  blur?: number;
}

const LIGHT_LEAK_COLORS: Record<LightLeakStyle, string[]> = {
  'warm': ['rgba(255, 180, 100, 0.8)', 'rgba(255, 120, 50, 0.6)', 'rgba(255, 200, 150, 0.4)'],
  'cool': ['rgba(100, 180, 255, 0.7)', 'rgba(150, 200, 255, 0.5)', 'rgba(200, 220, 255, 0.3)'],
  'golden': ['rgba(255, 215, 0, 0.8)', 'rgba(255, 180, 50, 0.6)', 'rgba(255, 240, 150, 0.4)'],
  'pink': ['rgba(255, 150, 200, 0.7)', 'rgba(255, 100, 180, 0.5)', 'rgba(255, 200, 220, 0.3)'],
  'natural': ['rgba(255, 240, 200, 0.6)', 'rgba(255, 200, 150, 0.4)', 'rgba(255, 180, 120, 0.2)'],
  'vintage': ['rgba(200, 150, 100, 0.7)', 'rgba(180, 120, 80, 0.5)', 'rgba(220, 180, 140, 0.3)'],
};

export const LightLeak: React.FC<LightLeakProps> = ({
  style = 'warm',
  durationInFrames,
  intensity = 1.0,
  direction = 'corner',
  blur = 100,
}) => {
  const frame = useCurrentFrame();
  const colors = LIGHT_LEAK_COLORS[style];
  
  const progress = interpolate(
    frame,
    [0, durationInFrames * 0.3, durationInFrames * 0.7, durationInFrames],
    [0, 1, 1, 0],
    {
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  
  const wobble = Math.sin(frame * 0.1) * 5;
  
  const getPosition = () => {
    switch (direction) {
      case 'left':
        return { x: -20 + wobble, y: 50 };
      case 'right':
        return { x: 120 + wobble, y: 50 };
      case 'top':
        return { x: 50, y: -20 + wobble };
      case 'bottom':
        return { x: 50, y: 120 + wobble };
      case 'corner':
      default:
        return { x: 110 + wobble, y: -10 + wobble * 0.5 };
    }
  };
  
  const pos = getPosition();
  
  const gradient = `radial-gradient(
    ellipse 80% 120% at ${pos.x}% ${pos.y}%,
    ${colors[0]} 0%,
    ${colors[1]} 30%,
    ${colors[2]} 60%,
    transparent 80%
  )`;
  
  return (
    <AbsoluteFill
      style={{
        background: gradient,
        opacity: progress * intensity,
        filter: `blur(${blur}px)`,
        mixBlendMode: 'screen',
        pointerEvents: 'none',
      }}
    />
  );
};

export const AnimatedLightLeak: React.FC<LightLeakProps & { 
  count?: number;
}> = ({
  style = 'warm',
  durationInFrames,
  intensity = 1.0,
  direction = 'corner',
  blur = 80,
  count = 3,
}) => {
  const frame = useCurrentFrame();
  const colors = LIGHT_LEAK_COLORS[style];
  
  const leaks = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const offset = (i / count) * durationInFrames * 0.3;
      const angle = (i / count) * 60 - 30;
      return { offset, angle, scale: 0.8 + random(`leak-scale-${i}`) * 0.4 };
    });
  }, [count, durationInFrames]);
  
  return (
    <>
      {leaks.map((leak, i) => {
        const adjustedFrame = Math.max(0, frame - leak.offset);
        const progress = interpolate(
          adjustedFrame,
          [0, durationInFrames * 0.25, durationInFrames * 0.65, durationInFrames * 0.9],
          [0, 1, 0.8, 0],
          {
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }
        );
        
        const wobble = Math.sin(adjustedFrame * 0.08 + i) * 8;
        
        return (
          <AbsoluteFill
            key={i}
            style={{
              background: `radial-gradient(
                ellipse 60% 90% at ${105 + wobble}% ${-5 + leak.angle + wobble * 0.5}%,
                ${colors[0]} 0%,
                ${colors[1]} 25%,
                ${colors[2]} 50%,
                transparent 75%
              )`,
              opacity: progress * intensity * leak.scale,
              filter: `blur(${blur}px)`,
              mixBlendMode: 'screen',
              pointerEvents: 'none',
              transform: `rotate(${leak.angle}deg) scale(${leak.scale})`,
            }}
          />
        );
      })}
    </>
  );
};
