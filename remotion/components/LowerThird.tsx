import React from 'react';
import { interpolate, useCurrentFrame, spring, useVideoConfig } from 'remotion';

export interface LowerThirdProps {
  name: string;
  title?: string;
  style: {
    primaryColor: string;
    secondaryColor: string;
    textColor: string;
    fontSize: number;
  };
  position: 'left' | 'right';
  timing: {
    startFrame: number;
    endFrame: number;
  };
}

export const LowerThird: React.FC<LowerThirdProps> = ({
  name,
  title,
  style,
  position,
  timing,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  if (frame < timing.startFrame || frame > timing.endFrame) {
    return null;
  }
  
  const localFrame = frame - timing.startFrame;
  const duration = timing.endFrame - timing.startFrame;
  
  const slideProgress = spring({
    frame: localFrame,
    fps,
    config: { damping: 15, stiffness: 120 },
  });
  
  const opacity = interpolate(
    localFrame,
    [duration - fps * 0.5, duration],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const translateX = position === 'left'
    ? interpolate(slideProgress, [0, 1], [-300, 0])
    : interpolate(slideProgress, [0, 1], [300, 0]);
  
  return (
    <div
      data-testid="lower-third"
      style={{
        position: 'absolute',
        bottom: '15%',
        [position]: 40,
        transform: `translateX(${translateX}px)`,
        opacity,
        display: 'flex',
        alignItems: 'stretch',
        flexDirection: position === 'left' ? 'row' : 'row-reverse',
      }}
    >
      <div
        style={{
          width: 6,
          backgroundColor: style.secondaryColor,
          borderRadius: position === 'left' ? '4px 0 0 4px' : '0 4px 4px 0',
        }}
      />
      
      <div
        style={{
          backgroundColor: style.primaryColor,
          padding: '12px 24px',
          borderRadius: position === 'left' ? '0 4px 4px 0' : '4px 0 0 4px',
        }}
      >
        <div
          style={{
            fontSize: style.fontSize,
            fontWeight: 'bold',
            color: style.textColor,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {name}
        </div>
        {title && (
          <div
            style={{
              fontSize: style.fontSize * 0.75,
              color: style.textColor,
              opacity: 0.8,
              fontFamily: 'Inter, sans-serif',
              marginTop: 4,
            }}
          >
            {title}
          </div>
        )}
      </div>
    </div>
  );
};

export default LowerThird;
