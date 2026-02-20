import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

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
  const { width } = useVideoConfig();
  
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
  
  const isCenter = position === 'center';
  const positionStyle: React.CSSProperties = isCenter
    ? { justifyContent: 'center', alignItems: 'center' }
    : { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 100 };

  const glowPulse = 0.35 + Math.sin(frame * 0.04) * 0.1;
  
  return (
    <AbsoluteFill style={{
      background: `radial-gradient(ellipse at center, ${lightenColor(backgroundColor, 0.12)} 0%, ${backgroundColor} 60%, ${darkenColor(backgroundColor, 0.2)} 100%)`,
      ...positionStyle,
      opacity,
    }}>
      <div
        style={{
          position: 'absolute',
          top: isCenter ? '50%' : '55%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: width * 0.35,
          height: width * 0.35,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(255,255,255,${glowPulse}) 0%, rgba(255,255,255,0.08) 40%, transparent 70%)`,
          filter: 'blur(35px)',
          pointerEvents: 'none',
        }}
      />

      <div style={{
        transform: `scale(${scale}) translateY(${translateY}px)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        position: 'relative',
        zIndex: 1,
      }}>
        <Img
          src={logoUrl}
          style={{
            maxWidth: '50%',
            maxHeight: '40%',
            objectFit: 'contain',
            filter: 'drop-shadow(0 0 18px rgba(255,255,255,0.25)) drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
          }}
        />
        {tagline && (
          <div style={{
            color: 'white',
            fontSize: 30,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 300,
            letterSpacing: 3,
            textShadow: '0 2px 8px rgba(0,0,0,0.5), 0 0 16px rgba(255,255,255,0.12)',
            opacity: interpolate(frame, [fadeIn, fadeIn + 15], [0, 1], { extrapolateRight: 'clamp' }),
          }}>
            {tagline}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

function lightenColor(hex: string, amount: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = Math.min(255, parseInt(result[1], 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(result[2], 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(result[3], 16) + Math.round(255 * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function darkenColor(hex: string, amount: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = Math.max(0, parseInt(result[1], 16) - Math.round(255 * amount));
  const g = Math.max(0, parseInt(result[2], 16) - Math.round(255 * amount));
  const b = Math.max(0, parseInt(result[3], 16) - Math.round(255 * amount));
  return `rgb(${r}, ${g}, ${b})`;
}
