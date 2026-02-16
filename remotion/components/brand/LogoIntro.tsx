// remotion/components/brand/LogoIntro.tsx
// Phase 18C: Logo intro animation component

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
  const { fps } = useVideoConfig();
  const durationFrames = duration * fps;

  // Animation calculations
  const fadeIn = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const fadeOut = interpolate(
    frame,
    [durationFrames - fps * 0.5, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const opacity = Math.min(fadeIn, fadeOut);

  // Animation-specific transforms
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

  // Position-specific styling
  const isLowerThird = position === 'lower-third';

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isLowerThird ? 'flex-end' : 'center',
        paddingBottom: isLowerThird ? 100 : 0,
        opacity,
      }}
    >
      <Img
        src={logoUrl}
        style={{
          maxWidth: isLowerThird ? '30%' : '40%',
          maxHeight: isLowerThird ? '25%' : '40%',
          objectFit: 'contain',
          transform: `scale(${scale}) translateY(${translateY}px)`,
        }}
      />
      {tagline && (
        <p
          style={{
            color: '#ffffff',
            fontSize: isLowerThird ? 28 : 36,
            fontStyle: 'italic',
            marginTop: 20,
            opacity: interpolate(frame, [fps * 0.3, fps * 0.6], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            transform: `translateY(${interpolate(frame, [fps * 0.3, fps * 0.6], [20, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })}px)`,
          }}
        >
          {tagline}
        </p>
      )}
    </AbsoluteFill>
  );
};
