import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, Easing, random } from 'remotion';

export type WhipPanDirection = 'left' | 'right' | 'up' | 'down';

interface WhipPanProps {
  durationInFrames: number;
  direction?: WhipPanDirection;
  blurAmount?: number;
  children: React.ReactNode;
}

interface WhipPanTransitionProps {
  durationInFrames: number;
  direction?: WhipPanDirection;
  outgoingContent: React.ReactNode;
  incomingContent: React.ReactNode;
}

export const WhipPan: React.FC<WhipPanProps> = ({
  durationInFrames,
  direction = 'right',
  blurAmount = 50,
  children,
}) => {
  const frame = useCurrentFrame();
  
  const midpoint = durationInFrames / 2;
  
  const blurProgress = interpolate(
    frame,
    [0, midpoint * 0.5, midpoint, midpoint * 1.5, durationInFrames],
    [0, blurAmount, blurAmount * 1.5, blurAmount, 0],
    {
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  
  const getTranslate = () => {
    const panDistance = 150;
    const translateProgress = interpolate(
      frame,
      [0, midpoint, durationInFrames],
      [0, -panDistance, 0],
      {
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }
    );
    
    switch (direction) {
      case 'left':
        return `translateX(${translateProgress}%)`;
      case 'right':
        return `translateX(${-translateProgress}%)`;
      case 'up':
        return `translateY(${translateProgress}%)`;
      case 'down':
        return `translateY(${-translateProgress}%)`;
    }
  };
  
  return (
    <AbsoluteFill
      style={{
        filter: `blur(${blurProgress}px)`,
        transform: getTranslate(),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const WhipPanTransition: React.FC<WhipPanTransitionProps> = ({
  durationInFrames,
  direction = 'right',
  outgoingContent,
  incomingContent,
}) => {
  const frame = useCurrentFrame();
  const midpoint = durationInFrames / 2;
  
  const isOutgoing = frame < midpoint;
  
  const blurProgress = interpolate(
    frame,
    [0, midpoint * 0.6, midpoint, midpoint * 1.4, durationInFrames],
    [0, 30, 60, 30, 0],
    {
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  
  const getOutgoingTranslate = () => {
    const distance = 100;
    const progress = interpolate(
      frame,
      [0, midpoint],
      [0, -distance],
      {
        easing: Easing.bezier(0.4, 0, 1, 1),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }
    );
    
    switch (direction) {
      case 'left': return `translateX(${-progress}%)`;
      case 'right': return `translateX(${progress}%)`;
      case 'up': return `translateY(${-progress}%)`;
      case 'down': return `translateY(${progress}%)`;
    }
  };
  
  const getIncomingTranslate = () => {
    const distance = 100;
    const progress = interpolate(
      frame,
      [midpoint, durationInFrames],
      [distance, 0],
      {
        easing: Easing.bezier(0, 0, 0.2, 1),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }
    );
    
    switch (direction) {
      case 'left': return `translateX(${-progress}%)`;
      case 'right': return `translateX(${progress}%)`;
      case 'up': return `translateY(${-progress}%)`;
      case 'down': return `translateY(${progress}%)`;
    }
  };
  
  const outgoingOpacity = interpolate(
    frame,
    [midpoint * 0.8, midpoint],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const incomingOpacity = interpolate(
    frame,
    [midpoint, midpoint * 1.2],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  return (
    <>
      <AbsoluteFill
        style={{
          filter: `blur(${blurProgress}px)`,
          transform: getOutgoingTranslate(),
          opacity: outgoingOpacity,
        }}
      >
        {outgoingContent}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          filter: `blur(${blurProgress}px)`,
          transform: getIncomingTranslate(),
          opacity: incomingOpacity,
        }}
      >
        {incomingContent}
      </AbsoluteFill>
    </>
  );
};

export const MotionBlurStreak: React.FC<{
  durationInFrames: number;
  direction?: WhipPanDirection;
  color?: string;
  streakCount?: number;
  seed?: number;
}> = ({
  durationInFrames,
  direction = 'right',
  color = 'rgba(255, 255, 255, 0.3)',
  streakCount = 5,
  seed = 0,
}) => {
  const frame = useCurrentFrame();
  const midpoint = durationInFrames / 2;
  
  const intensity = interpolate(
    frame,
    [0, midpoint * 0.5, midpoint, midpoint * 1.5, durationInFrames],
    [0, 0.8, 1, 0.8, 0],
    {
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  
  const isHorizontal = direction === 'left' || direction === 'right';
  
  const streaks = useMemo(() => {
    return Array.from({ length: streakCount }, (_, i) => {
      const offset = ((i + 1) / (streakCount + 1)) * 100;
      const streakSize = 2 + random(`streak-size-${seed}-${i}`) * 3;
      const streakOpacity = 0.5 + random(`streak-opacity-${seed}-${i}`) * 0.5;
      
      return {
        offset,
        size: streakSize,
        opacity: streakOpacity,
      };
    });
  }, [streakCount, seed]);
  
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {streaks.map((streak, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: isHorizontal ? `${streak.offset}%` : '0',
            left: isHorizontal ? '0' : `${streak.offset}%`,
            width: isHorizontal ? '100%' : `${streak.size}px`,
            height: isHorizontal ? `${streak.size}px` : '100%',
            background: `linear-gradient(${isHorizontal ? '90deg' : '180deg'}, transparent, ${color}, transparent)`,
            opacity: intensity * streak.opacity,
            filter: 'blur(1px)',
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
