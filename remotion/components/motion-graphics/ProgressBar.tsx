import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export interface ProgressBarItem {
  label: string;
  value: number;
  color?: string;
}

export interface ProgressBarProps {
  items: ProgressBarItem[];
  layout: 'horizontal' | 'vertical';
  barHeight: number;
  barWidth: number | 'full';
  barRadius: number;
  backgroundColor: string;
  fillColor: string;
  labelStyle: { fontSize: number; fontWeight: string | number; fontFamily: string; color: string };
  showValue: boolean;
  valuePosition: 'inside' | 'outside' | 'end';
  valueStyle: { fontSize: number; fontWeight: string | number; color: string };
  animationDuration: number;
  staggerDelay: number;
  animationStyle: 'linear' | 'spring' | 'ease-out';
  itemSpacing: number;
  holdDuration?: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  items,
  layout,
  barHeight,
  barWidth,
  barRadius,
  backgroundColor,
  fillColor,
  labelStyle,
  showValue,
  valuePosition,
  valueStyle,
  animationDuration,
  staggerDelay,
  animationStyle,
  itemSpacing,
  holdDuration = 60,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  
  const totalAnimationTime = animationDuration + (items.length - 1) * staggerDelay;
  const exitStartFrame = totalAnimationTime + holdDuration;
  const exitDuration = Math.round(fps * 0.5);
  
  const exitOpacity = frame >= exitStartFrame
    ? interpolate(frame, [exitStartFrame, exitStartFrame + exitDuration], [1, 0], { extrapolateRight: 'clamp' })
    : 1;
  
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '10%', opacity: exitOpacity }}>
      <div style={{
        display: 'flex',
        flexDirection: layout === 'vertical' ? 'column' : 'row',
        gap: itemSpacing,
        width: '100%',
        maxWidth: 1200,
      }}>
        {items.map((item, index) => {
          const startFrame = index * staggerDelay;
          const localFrame = frame - startFrame;
          
          let fillProgress = 0;
          if (localFrame >= 0) {
            const rawProgress = Math.min(localFrame / animationDuration, 1);
            switch (animationStyle) {
              case 'spring':
                fillProgress = Math.min(spring({ frame: localFrame, fps, config: { damping: 15, stiffness: 100 } }), 1);
                break;
              case 'ease-out':
                fillProgress = 1 - Math.pow(1 - rawProgress, 3);
                break;
              default:
                fillProgress = rawProgress;
            }
          }
          
          const currentValue = Math.round(item.value * fillProgress);
          const entranceOpacity = localFrame < 0 ? 0 : Math.min(localFrame / 10, 1);
          
          return (
            <div key={index} style={{ flex: layout === 'horizontal' ? 1 : 'none', opacity: entranceOpacity }}>
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ ...labelStyle }}>{item.label}</span>
                {showValue && valuePosition === 'outside' && (
                  <span style={{ ...valueStyle }}>{currentValue}%</span>
                )}
              </div>
              <div style={{
                height: barHeight,
                width: barWidth === 'full' ? '100%' : barWidth,
                backgroundColor,
                borderRadius: barRadius,
                overflow: 'hidden',
                position: 'relative',
              }}>
                <div style={{
                  height: '100%',
                  width: `${item.value * fillProgress}%`,
                  backgroundColor: item.color || fillColor,
                  borderRadius: barRadius,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: valuePosition === 'inside' ? 8 : 0,
                  transition: 'none',
                }}>
                  {showValue && valuePosition === 'inside' && fillProgress > 0.15 && (
                    <span style={{ ...valueStyle, color: '#FFFFFF' }}>{currentValue}%</span>
                  )}
                </div>
                {showValue && valuePosition === 'end' && (
                  <span style={{
                    ...valueStyle,
                    position: 'absolute',
                    right: -50,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}>
                    {currentValue}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export default ProgressBar;
