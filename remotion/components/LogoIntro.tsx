import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';

interface LogoIntroProps {
  enabled: boolean;
  durationInFrames: number;
  logoUrl: string;
  backgroundColor: string;
  position: 'center' | 'lower-third';
  animation: 'fade' | 'zoom' | 'slide-up' | 'none';
  tagline?: string;
  fadeIn: number;
  fadeOut: number;
}

export const LogoIntro: React.FC<LogoIntroProps> = ({
  enabled,
  durationInFrames,
  logoUrl,
  backgroundColor,
  position,
  animation,
  tagline,
  fadeIn,
  fadeOut,
}) => {
  const frame = useCurrentFrame();
  
  if (!enabled) return null;
  
  const opacity = interpolate(
    frame,
    [0, fadeIn, durationInFrames - fadeOut, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp' }
  );
  
  const scale = animation === 'zoom'
    ? interpolate(frame, [0, fadeIn], [0.8, 1], { extrapolateRight: 'clamp' })
    : 1;
  
  const translateY = animation === 'slide-up'
    ? interpolate(frame, [0, fadeIn], [50, 0], { extrapolateRight: 'clamp' })
    : 0;
  
  const positionStyle: React.CSSProperties = position === 'center'
    ? { justifyContent: 'center', alignItems: 'center' }
    : { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 100 };
  
  return (
    <AbsoluteFill style={{ backgroundColor, ...positionStyle, opacity }}>
      <div style={{
        transform: `scale(${scale}) translateY(${translateY}px)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}>
        <Img
          src={logoUrl}
          style={{ maxWidth: '40%', maxHeight: '30%', objectFit: 'contain' }}
        />
        {tagline && (
          <div style={{
            color: 'white',
            fontSize: 28,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 300,
            letterSpacing: 2,
            opacity: interpolate(frame, [fadeIn, fadeIn + 15], [0, 1], { extrapolateRight: 'clamp' }),
          }}>
            {tagline}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
