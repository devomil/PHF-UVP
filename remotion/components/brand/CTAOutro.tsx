// remotion/components/brand/CTAOutro.tsx
// Phase 18C: CTA outro component with contact info

import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

interface CTAOutroProps {
  logoUrl?: string;
  headline?: string;
  subheadline?: string;
  website?: string;
  phone?: string;
  email?: string;
  backgroundColor: string;
  textColor?: string;
  animation: 'fade' | 'slide-up' | 'build';
  buttonText?: string;
}

export const CTAOutro: React.FC<CTAOutroProps> = ({
  logoUrl,
  headline = 'Start Your Wellness Journey',
  subheadline,
  website,
  phone,
  email,
  backgroundColor,
  textColor = '#ffffff',
  animation,
  buttonText,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Staggered animation delays for 'build' animation
  const logoDelay = 0;
  const headlineDelay = animation === 'build' ? fps * 0.3 : 0;
  const subheadlineDelay = animation === 'build' ? fps * 0.5 : 0;
  const contactDelay = animation === 'build' ? fps * 0.7 : 0;
  const buttonDelay = animation === 'build' ? fps * 0.9 : 0;

  // Animation helper
  const getOpacity = (delay: number) => {
    if (animation === 'fade' || animation === 'build') {
      return interpolate(frame, [delay, delay + fps * 0.3], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }
    return 1;
  };

  const getTranslateY = (delay: number) => {
    if (animation === 'slide-up' || animation === 'build') {
      return interpolate(frame, [delay, delay + fps * 0.4], [50, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }
    return 0;
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 60,
      }}
    >
      {/* Logo */}
      {logoUrl && (
        <div
          style={{
            opacity: getOpacity(logoDelay),
            transform: `translateY(${getTranslateY(logoDelay)}px)`,
            marginBottom: 40,
          }}
        >
          <Img
            src={logoUrl}
            style={{
              maxWidth: 250,
              maxHeight: 120,
              objectFit: 'contain',
            }}
          />
        </div>
      )}

      {/* Headline */}
      <h1
        style={{
          color: textColor,
          fontSize: 64,
          fontWeight: 'bold',
          textAlign: 'center',
          margin: 0,
          marginBottom: 20,
          opacity: getOpacity(headlineDelay),
          transform: `translateY(${getTranslateY(headlineDelay)}px)`,
          fontFamily: 'Poppins, Arial, sans-serif',
        }}
      >
        {headline}
      </h1>

      {/* Subheadline */}
      {subheadline && (
        <p
          style={{
            color: textColor,
            fontSize: 32,
            textAlign: 'center',
            margin: 0,
            marginBottom: 40,
            opacity: getOpacity(subheadlineDelay) * 0.9,
            transform: `translateY(${getTranslateY(subheadlineDelay)}px)`,
            fontFamily: 'Poppins, Arial, sans-serif',
          }}
        >
          {subheadline}
        </p>
      )}

      {/* Contact Info */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          opacity: getOpacity(contactDelay),
          transform: `translateY(${getTranslateY(contactDelay)}px)`,
        }}
      >
        {website && (
          <p style={{ color: textColor, fontSize: 36, margin: 0, fontFamily: 'Poppins, Arial, sans-serif' }}>
            {website}
          </p>
        )}
        {phone && (
          <p style={{ color: textColor, fontSize: 28, margin: 0, opacity: 0.9, fontFamily: 'Poppins, Arial, sans-serif' }}>
            {phone}
          </p>
        )}
        {email && (
          <p style={{ color: textColor, fontSize: 24, margin: 0, opacity: 0.8, fontFamily: 'Poppins, Arial, sans-serif' }}>
            {email}
          </p>
        )}
      </div>

      {/* Optional CTA Button */}
      {buttonText && (
        <div
          style={{
            marginTop: 40,
            opacity: getOpacity(buttonDelay),
            transform: `translateY(${getTranslateY(buttonDelay)}px)`,
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              color: backgroundColor,
              padding: '16px 48px',
              borderRadius: 8,
              fontSize: 24,
              fontWeight: 'bold',
              fontFamily: 'Poppins, Arial, sans-serif',
            }}
          >
            {buttonText}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
