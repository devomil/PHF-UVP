// Phase 24A (Task #175): standalone Remotion composition for title-card
// scenes. Rendered by the `title_card` render handler in place of the
// AI-video pipeline so animated text reveals stay sharp + on-brand.

import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export interface TitleCardInputProps {
  title: string;
  subtitle?: string;
  brandPrimary: string;
  brandSecondary: string;
  brandText: string;
  fontFamily?: string;
  logoUrl?: string;
}

const isAbsoluteHttpUrl = (u?: string): u is string =>
  !!u && (u.startsWith('http://') || u.startsWith('https://'));

export const TitleCardComposition: React.FC<TitleCardInputProps> = ({
  title,
  subtitle,
  brandPrimary,
  brandSecondary,
  brandText,
  fontFamily,
  logoUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const bgAngle = 135 + Math.sin(frame * 0.015) * 10;
  const bgOpacity = interpolate(frame, [0, fps * 0.3], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const titleOpacity = interpolate(
    frame,
    [fps * 0.2, fps * 0.8],
    [0, 1],
    { extrapolateRight: 'clamp' },
  );
  const titleY = interpolate(
    frame,
    [fps * 0.2, fps * 0.8],
    [40, 0],
    { extrapolateRight: 'clamp' },
  );
  const titleLetterSpacing = interpolate(
    frame,
    [fps * 0.2, fps * 0.8],
    [12, 2],
    { extrapolateRight: 'clamp' },
  );

  const subtitleOpacity = interpolate(
    frame,
    [fps * 0.7, fps * 1.2],
    [0, 1],
    { extrapolateRight: 'clamp' },
  );
  const subtitleY = interpolate(
    frame,
    [fps * 0.7, fps * 1.2],
    [20, 0],
    { extrapolateRight: 'clamp' },
  );

  const fadeOut = interpolate(
    frame,
    [durationInFrames - fps * 0.4, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const isPortrait = height > width;
  const titleSize = isPortrait
    ? Math.round(width * 0.085)
    : Math.round(height * 0.11);
  const subtitleSize = Math.round(titleSize * 0.36);

  const accentBarScale = spring({
    frame: Math.max(0, frame - fps * 0.4),
    fps,
    config: { stiffness: 110, damping: 14, mass: 0.8 },
    from: 0,
    to: 1,
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brandPrimary,
        fontFamily: fontFamily || 'Inter, sans-serif',
        opacity: fadeOut,
      }}
    >
      <AbsoluteFill
        style={{
          background: `linear-gradient(${bgAngle}deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
          opacity: bgOpacity,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.35) 100%)',
        }}
      />

      {isAbsoluteHttpUrl(logoUrl) ? (
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            opacity: interpolate(frame, [0, fps * 0.6], [0, 1], {
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <Img
            src={logoUrl}
            style={{
              maxWidth: width * 0.22,
              maxHeight: height * 0.12,
              objectFit: 'contain',
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
            }}
          />
        </div>
      ) : null}

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 8%',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: width * 0.18,
            height: 4,
            backgroundColor: brandText,
            borderRadius: 2,
            marginBottom: titleSize * 0.4,
            transform: `scaleX(${accentBarScale})`,
            transformOrigin: 'center',
            boxShadow: `0 0 18px ${brandText}55`,
          }}
        />
        <div
          style={{
            color: brandText,
            fontSize: titleSize,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: titleLetterSpacing,
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            textShadow: '0 4px 20px rgba(0,0,0,0.45)',
            maxWidth: '92%',
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              color: brandText,
              fontSize: subtitleSize,
              fontWeight: 400,
              opacity: subtitleOpacity * 0.85,
              transform: `translateY(${subtitleY}px)`,
              marginTop: titleSize * 0.35,
              maxWidth: '78%',
              lineHeight: 1.35,
              textShadow: '0 2px 10px rgba(0,0,0,0.4)',
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const DEFAULT_TITLE_CARD_PROPS: TitleCardInputProps = {
  title: 'Title Card',
  subtitle: undefined,
  brandPrimary: '#1a1f3a',
  brandSecondary: '#5a3fc0',
  brandText: '#ffffff',
};
