import React from 'react';
import { interpolate, useCurrentFrame, spring, useVideoConfig } from 'remotion';

export interface BulletListProps {
  items: string[];
  position: 'left' | 'center' | 'right';
  verticalPosition: number;
  style: {
    fontSize: number;
    color: string;
    backgroundColor: string;
    backgroundOpacity: number;
    bulletColor: string;
  };
  animation: {
    staggerDelay: number;
    itemDuration: number;
  };
  timing: {
    startFrame: number;
    endFrame: number;
  };
}

export const BulletList: React.FC<BulletListProps> = ({
  items,
  position,
  verticalPosition,
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
  
  const globalOpacity = interpolate(
    localFrame,
    [duration - fps * 0.5, duration],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const alignItems = position === 'left' ? 'flex-start' : position === 'right' ? 'flex-end' : 'center';
  
  return (
    <div
      data-testid="bullet-list"
      style={{
        position: 'absolute',
        top: `${verticalPosition}%`,
        left: position === 'left' ? '5%' : position === 'right' ? 'auto' : '50%',
        right: position === 'right' ? '5%' : 'auto',
        transform: position === 'center' ? 'translateX(-50%)' : 'none',
        opacity: globalOpacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems,
        gap: 12,
      }}
    >
      {items.map((item, index) => {
        const itemStartFrame = index * animation.staggerDelay;
        const itemProgress = spring({
          frame: localFrame - itemStartFrame,
          fps,
          config: { damping: 12, stiffness: 150 },
        });
        
        const itemOpacity = Math.min(Math.max(itemProgress, 0), 1);
        const translateY = interpolate(itemProgress, [0, 1], [20, 0]);
        
        return (
          <div
            key={index}
            data-testid={`bullet-item-${index}`}
            style={{
              opacity: itemOpacity,
              transform: `translateY(${translateY}px)`,
              backgroundColor: `rgba(${hexToRgb(style.backgroundColor)}, ${style.backgroundOpacity})`,
              padding: '10px 20px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ color: style.bulletColor, fontSize: style.fontSize * 1.2 }}>•</span>
            <span style={{ 
              color: style.color, 
              fontSize: style.fontSize, 
              fontFamily: 'Inter, sans-serif',
            }}>
              {item}
            </span>
          </div>
        );
      })}
    </div>
  );
};

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

export default BulletList;
