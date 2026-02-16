import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';

interface CTAOutroProps {
  enabled: boolean;
  durationInFrames: number;
  backgroundColor: string;
  logoUrl?: string;
  headline?: string;
  subheadline?: string;
  website?: string;
  phone?: string;
  email?: string;
  buttonText?: string;
  animation: 'fade' | 'slide-up' | 'build';
  logoDelay: number;
  headlineDelay: number;
  contactDelay: number;
  buttonDelay: number;
}

export const CTAOutro: React.FC<CTAOutroProps> = ({
  enabled,
  durationInFrames,
  backgroundColor,
  logoUrl,
  headline,
  subheadline,
  website,
  phone,
  buttonText,
  animation,
  logoDelay,
  headlineDelay,
  contactDelay,
  buttonDelay,
}) => {
  const frame = useCurrentFrame();
  
  if (!enabled) return null;
  
  const fadeInDuration = 20;
  const slideUpDuration = 25;
  
  const getOpacity = (delay: number) => {
    if (animation === 'fade') {
      return interpolate(frame, [0, fadeInDuration], [0, 1], { extrapolateRight: 'clamp' });
    }
    if (animation === 'slide-up') {
      return interpolate(frame, [0, slideUpDuration], [0, 1], { extrapolateRight: 'clamp' });
    }
    return interpolate(frame, [delay, delay + fadeInDuration], [0, 1], { extrapolateRight: 'clamp' });
  };
  
  const getTranslateY = (delay: number) => {
    if (animation === 'fade') {
      return 0;
    }
    if (animation === 'slide-up') {
      return interpolate(frame, [0, slideUpDuration], [80, 0], { extrapolateRight: 'clamp' });
    }
    return interpolate(frame, [delay, delay + fadeInDuration], [40, 0], { extrapolateRight: 'clamp' });
  };
  
  const getScale = (delay: number) => {
    if (animation === 'fade') {
      return 1;
    }
    if (animation === 'slide-up') {
      return interpolate(frame, [0, slideUpDuration], [0.95, 1], { extrapolateRight: 'clamp' });
    }
    return interpolate(frame, [delay, delay + 10], [0.9, 1], { extrapolateRight: 'clamp' });
  };
  
  return (
    <AbsoluteFill style={{
      backgroundColor,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 60,
    }}>
      {logoUrl && (
        <div style={{
          opacity: getOpacity(logoDelay),
          transform: `translateY(${getTranslateY(logoDelay)}px)`,
          marginBottom: 40,
        }}>
          <Img src={logoUrl} style={{ height: 80, objectFit: 'contain' }} />
        </div>
      )}
      
      {headline && (
        <div style={{
          opacity: getOpacity(headlineDelay),
          transform: `translateY(${getTranslateY(headlineDelay)}px)`,
          color: 'white',
          fontSize: 48,
          fontWeight: 'bold',
          fontFamily: 'Inter, sans-serif',
          textAlign: 'center',
          marginBottom: 16,
        }}>
          {headline}
        </div>
      )}
      
      {subheadline && (
        <div style={{
          opacity: getOpacity(headlineDelay + 5),
          transform: `translateY(${getTranslateY(headlineDelay + 5)}px)`,
          color: 'rgba(255,255,255,0.9)',
          fontSize: 24,
          fontFamily: 'Inter, sans-serif',
          textAlign: 'center',
          marginBottom: 40,
        }}>
          {subheadline}
        </div>
      )}
      
      <div style={{
        opacity: getOpacity(contactDelay),
        transform: `translateY(${getTranslateY(contactDelay)}px)`,
        display: 'flex',
        gap: 40,
        marginBottom: 40,
      }}>
        {website && (
          <div style={{ color: 'white', fontSize: 20 }}>🌐 {website}</div>
        )}
        {phone && (
          <div style={{ color: 'white', fontSize: 20 }}>📞 {phone}</div>
        )}
      </div>
      
      {buttonText && (
        <div style={{
          opacity: getOpacity(buttonDelay),
          transform: `translateY(${getTranslateY(buttonDelay)}px) scale(${getScale(buttonDelay)})`,
          backgroundColor: '#D4A574',
          color: '#1a1a1a',
          fontSize: 24,
          fontWeight: 'bold',
          padding: '16px 48px',
          borderRadius: 8,
        }}>
          {buttonText}
        </div>
      )}
    </AbsoluteFill>
  );
};
