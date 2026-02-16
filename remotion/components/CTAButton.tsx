import React from 'react';
import { interpolate, useCurrentFrame, spring, useVideoConfig } from 'remotion';

export interface CTAButtonProps {
  text: string;
  subtext?: string;
  position: 'center' | 'bottom-center' | 'custom';
  customPosition?: { x: number; y: number };
  style: {
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    borderRadius: number;
    paddingX: number;
    paddingY: number;
    shadow?: boolean;
    borderColor?: string;
    borderWidth?: number;
  };
  animation: {
    type: 'none' | 'fade' | 'pop' | 'slide-up' | 'pulse';
    duration: number;
    delay: number;
  };
  timing: {
    startFrame: number;
    endFrame: number;
  };
}

export const CTAButton: React.FC<CTAButtonProps> = ({
  text,
  subtext,
  position,
  customPosition,
  style,
  animation,
  timing,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  if (frame < timing.startFrame || frame > timing.endFrame) {
    return null;
  }
  
  const localFrame = frame - timing.startFrame;
  const duration = timing.endFrame - timing.startFrame;
  
  let opacity = 1;
  if (animation.type !== 'none') {
    opacity = interpolate(
      localFrame,
      [animation.delay, animation.delay + animation.duration, duration - fps * 0.5, duration],
      [0, 1, 1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }
  
  let transform = '';
  let scale = 1;
  
  if (animation.type === 'pop') {
    scale = spring({
      frame: localFrame - animation.delay,
      fps,
      config: { damping: 10, stiffness: 200 },
    });
    transform = `scale(${scale})`;
  } else if (animation.type === 'slide-up') {
    const translateY = interpolate(
      localFrame,
      [animation.delay, animation.delay + animation.duration],
      [50, 0],
      { extrapolateRight: 'clamp' }
    );
    transform = `translateY(${translateY}px)`;
  } else if (animation.type === 'pulse') {
    const pulseFrame = (localFrame - animation.delay - animation.duration) % 30;
    if (localFrame > animation.delay + animation.duration) {
      scale = interpolate(pulseFrame, [0, 15, 30], [1, 1.05, 1]);
      transform = `scale(${scale})`;
    }
  }
  
  const getPositionStyles = (): React.CSSProperties => {
    switch (position) {
      case 'center':
        return {
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) ${transform}`,
        };
      case 'bottom-center':
        return {
          bottom: '15%',
          left: '50%',
          transform: `translateX(-50%) ${transform}`,
        };
      case 'custom':
        return customPosition ? {
          top: `${customPosition.y}%`,
          left: `${customPosition.x}%`,
          transform: `translate(-50%, -50%) ${transform}`,
        } : {};
      default:
        return {
          bottom: '15%',
          left: '50%',
          transform: `translateX(-50%) ${transform}`,
        };
    }
  };
  
  return (
    <div
      data-testid="cta-button"
      style={{
        position: 'absolute',
        ...getPositionStyles(),
        opacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          backgroundColor: style.backgroundColor,
          color: style.textColor,
          fontSize: style.fontSize,
          fontWeight: 'bold',
          fontFamily: 'Inter, sans-serif',
          borderRadius: style.borderRadius,
          padding: `${style.paddingY}px ${style.paddingX}px`,
          boxShadow: style.shadow ? '0 4px 15px rgba(0,0,0,0.3)' : 'none',
          border: style.borderColor ? `${style.borderWidth || 2}px solid ${style.borderColor}` : 'none',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
      {subtext && (
        <div
          style={{
            color: style.textColor,
            fontSize: style.fontSize * 0.6,
            fontFamily: 'Inter, sans-serif',
            opacity: 0.8,
            textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
};

export default CTAButton;
