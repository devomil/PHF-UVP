import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';

export interface StatItem {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  color?: string;
}

export interface StatCounterProps {
  stats: StatItem[];
  layout: 'horizontal' | 'vertical' | 'grid';
  
  animationDuration: number;
  staggerDelay: number;
  holdDuration: number;
  
  numberStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
    color: string;
  };
  
  labelStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
    color: string;
  };
  
  backgroundColor?: string;
  showBackground?: boolean;
  backgroundOpacity?: number;
  backgroundRadius?: number;
  itemSpacing?: number;
  
  countEasing: 'linear' | 'ease-out' | 'ease-in-out' | 'spring';
  entranceAnimation: 'fade' | 'slide-up' | 'scale' | 'none';
}

const StatItemComponent: React.FC<{
  stat: StatItem;
  index: number;
  frame: number;
  fps: number;
  animationDuration: number;
  staggerDelay: number;
  numberStyle: StatCounterProps['numberStyle'];
  labelStyle: StatCounterProps['labelStyle'];
  countEasing: StatCounterProps['countEasing'];
  entranceAnimation: StatCounterProps['entranceAnimation'];
}> = ({ stat, index, frame, fps, animationDuration, staggerDelay, numberStyle, labelStyle, countEasing, entranceAnimation }) => {
  const startFrame = index * staggerDelay;
  const localFrame = frame - startFrame;
  
  if (localFrame < 0) {
    return (
      <div style={{ opacity: 0, textAlign: 'center' }}>
        <div style={{ ...numberStyle }}>0</div>
        <div style={{ ...labelStyle }}>{stat.label}</div>
      </div>
    );
  }
  
  const countProgress = Math.min(localFrame / animationDuration, 1);
  
  let easedProgress: number;
  switch (countEasing) {
    case 'ease-out':
      easedProgress = Easing.out(Easing.cubic)(countProgress);
      break;
    case 'ease-in-out':
      easedProgress = Easing.inOut(Easing.cubic)(countProgress);
      break;
    case 'spring':
      easedProgress = Math.min(spring({ frame: localFrame, fps, config: { damping: 20, stiffness: 100 } }), 1);
      break;
    default:
      easedProgress = countProgress;
  }
  
  const currentValue = stat.value * easedProgress;
  const displayValue = stat.decimals !== undefined
    ? currentValue.toFixed(stat.decimals)
    : Math.round(currentValue).toString();
  
  let entranceOpacity = 1;
  let entranceTransform = '';
  const entranceProgress = Math.min(localFrame / 15, 1);
  
  switch (entranceAnimation) {
    case 'fade':
      entranceOpacity = entranceProgress;
      break;
    case 'slide-up':
      entranceOpacity = entranceProgress;
      entranceTransform = `translateY(${(1 - entranceProgress) * 30}px)`;
      break;
    case 'scale':
      entranceOpacity = entranceProgress;
      entranceTransform = `scale(${0.5 + entranceProgress * 0.5})`;
      break;
  }
  
  return (
    <div style={{ textAlign: 'center', opacity: entranceOpacity, transform: entranceTransform }}>
      <div style={{
        fontSize: numberStyle.fontSize,
        fontWeight: numberStyle.fontWeight,
        fontFamily: numberStyle.fontFamily,
        color: stat.color || numberStyle.color,
        lineHeight: 1.1,
      }}>
        {stat.prefix || ''}{displayValue}{stat.suffix || ''}
      </div>
      <div style={{
        fontSize: labelStyle.fontSize,
        fontWeight: labelStyle.fontWeight,
        fontFamily: labelStyle.fontFamily,
        color: labelStyle.color,
        marginTop: 8,
      }}>
        {stat.label}
      </div>
    </div>
  );
};

export const StatCounter: React.FC<StatCounterProps> = ({
  stats,
  layout,
  animationDuration,
  staggerDelay,
  holdDuration,
  numberStyle,
  labelStyle,
  backgroundColor = '#FFFFFF',
  showBackground = true,
  backgroundOpacity = 0.95,
  backgroundRadius = 16,
  itemSpacing = 60,
  countEasing,
  entranceAnimation,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const totalEntranceTime = animationDuration + (stats.length - 1) * staggerDelay;
  const exitStartFrame = totalEntranceTime + holdDuration;
  const exitDuration = Math.round(fps * 0.5);
  
  const exitOpacity = frame >= exitStartFrame
    ? interpolate(frame, [exitStartFrame, exitStartFrame + exitDuration], [1, 0], { extrapolateRight: 'clamp' })
    : 1;
  
  const layoutStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: layout === 'vertical' ? 'column' : 'row',
    flexWrap: layout === 'grid' ? 'wrap' : 'nowrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: itemSpacing,
    padding: 40,
  };
  
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: exitOpacity }}>
      {showBackground && (
        <div style={{
          position: 'absolute',
          backgroundColor,
          opacity: backgroundOpacity,
          borderRadius: backgroundRadius,
          padding: 60,
        }} />
      )}
      
      <div style={layoutStyles}>
        {stats.map((stat, index) => (
          <StatItemComponent
            key={index}
            stat={stat}
            index={index}
            frame={frame}
            fps={fps}
            animationDuration={animationDuration}
            staggerDelay={staggerDelay}
            numberStyle={numberStyle}
            labelStyle={labelStyle}
            countEasing={countEasing}
            entranceAnimation={entranceAnimation}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

export default StatCounter;
