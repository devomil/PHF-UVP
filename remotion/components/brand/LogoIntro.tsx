import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

interface LogoIntroProps {
  logoUrl: string;
  backgroundColor: string;
  animation: 'fade' | 'zoom' | 'slide-up' | 'none';
  duration: number;
  tagline?: string;
  position?: 'center' | 'lower-third';
}

export const LogoIntro: React.FC<LogoIntroProps> = ({
  logoUrl,
  backgroundColor,
  animation,
  duration,
  tagline,
  position = 'center',
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const durationFrames = duration * fps;

  const fadeIn = interpolate(frame, [0, fps * 0.8], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const fadeOut = interpolate(
    frame,
    [durationFrames - fps * 0.6, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const opacity = Math.min(fadeIn, fadeOut);

  let scale = 1;
  let translateY = 0;

  if (animation === 'zoom') {
    scale = spring({
      frame,
      fps,
      config: { damping: 12, stiffness: 100 },
    });
  } else if (animation === 'slide-up') {
    translateY = interpolate(frame, [0, fps * 0.5], [100, 0], {
      extrapolateRight: 'clamp',
    });
  }

  const isLowerThird = position === 'lower-third';

  const glowPulse = 0.4 + Math.sin(frame * 0.04) * 0.1;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, ${lightenColor(backgroundColor, 0.15)} 0%, ${backgroundColor} 60%, ${darkenColor(backgroundColor, 0.3)} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isLowerThird ? 'flex-end' : 'center',
        paddingBottom: isLowerThird ? 100 : 0,
        opacity,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: isLowerThird ? '45%' : '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: width * 0.4,
          height: width * 0.4,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(255,255,255,${glowPulse}) 0%, rgba(255,255,255,0.1) 40%, transparent 70%)`,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Img
          src={logoUrl}
          style={{
            maxWidth: isLowerThird ? '35%' : '50%',
            maxHeight: isLowerThird ? '30%' : '45%',
            objectFit: 'contain',
            transform: `scale(${scale}) translateY(${translateY}px)`,
            filter: `drop-shadow(0 0 20px rgba(255,255,255,0.3)) drop-shadow(0 4px 12px rgba(0,0,0,0.4))`,
          }}
        />
      </div>

      {tagline && (
        <p
          style={{
            color: '#ffffff',
            fontSize: isLowerThird ? 30 : 38,
            fontStyle: 'italic',
            fontWeight: 300,
            letterSpacing: 3,
            marginTop: 28,
            textShadow: '0 2px 8px rgba(0,0,0,0.5), 0 0 20px rgba(255,255,255,0.15)',
            opacity: interpolate(frame, [fps * 0.4, fps * 0.8], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            transform: `translateY(${interpolate(frame, [fps * 0.4, fps * 0.8], [15, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })}px)`,
            position: 'relative',
            zIndex: 1,
          }}
        >
          {tagline}
        </p>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '30%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />
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
