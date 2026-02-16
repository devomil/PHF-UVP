import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

export interface WordByWordProps {
  text: string;
  position: 'top' | 'center' | 'bottom';
  alignment: 'left' | 'center' | 'right';
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  color: string;
  staggerFrames: number;
  wordDuration: number;
  holdFrames: number;
  entranceStyle: 'fade-up' | 'fade' | 'pop' | 'slide-left' | 'slide-right';
  exitStyle: 'fade' | 'fade-down' | 'shrink';
  showBackground?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  backgroundPadding?: number;
  backgroundRadius?: number;
}

const AnimatedWord: React.FC<{
  word: string;
  index: number;
  frame: number;
  fps: number;
  staggerFrames: number;
  wordDuration: number;
  entranceStyle: string;
}> = ({ word, index, frame, fps, staggerFrames, wordDuration, entranceStyle }) => {
  const wordStartFrame = index * staggerFrames;
  const localFrame = frame - wordStartFrame;
  
  if (localFrame < 0) {
    return <span style={{ opacity: 0 }}>{word}</span>;
  }
  
  const springProgress = spring({
    frame: localFrame,
    fps,
    config: { damping: 15, stiffness: 200 },
  });
  
  const clampedSpring = Math.min(springProgress, 1);
  
  let transform = '';
  const opacity = clampedSpring;
  
  switch (entranceStyle) {
    case 'fade-up':
      transform = `translateY(${(1 - clampedSpring) * 30}px)`;
      break;
    case 'pop':
      transform = `scale(${0.5 + clampedSpring * 0.5})`;
      break;
    case 'slide-left':
      transform = `translateX(${(1 - clampedSpring) * 50}px)`;
      break;
    case 'slide-right':
      transform = `translateX(${(1 - clampedSpring) * -50}px)`;
      break;
    case 'fade':
    default:
      transform = 'none';
      break;
  }
  
  return (
    <span
      style={{
        display: 'inline-block',
        opacity,
        transform,
      }}
    >
      {word}
    </span>
  );
};

export const WordByWord: React.FC<WordByWordProps> = ({
  text,
  position,
  alignment,
  fontSize,
  fontFamily,
  fontWeight,
  color,
  staggerFrames,
  wordDuration,
  holdFrames,
  entranceStyle,
  exitStyle,
  showBackground = false,
  backgroundColor = '#000000',
  backgroundOpacity = 0.8,
  backgroundPadding = 20,
  backgroundRadius = 8,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const words = text.split(' ').filter(w => w.length > 0);
  const totalEntranceFrames = (words.length - 1) * staggerFrames + wordDuration;
  const exitStartFrame = totalEntranceFrames + holdFrames;
  const exitDuration = Math.round(fps * 0.5);
  
  const exitProgress = frame >= exitStartFrame
    ? interpolate(frame, [exitStartFrame, exitStartFrame + exitDuration], [0, 1], { extrapolateRight: 'clamp' })
    : 0;
  
  const getExitTransform = () => {
    switch (exitStyle) {
      case 'fade-down':
        return `translateY(${exitProgress * 30}px)`;
      case 'shrink':
        return `scale(${1 - exitProgress * 0.3})`;
      default:
        return 'none';
    }
  };
  
  const positionStyles: React.CSSProperties = {
    position: 'absolute',
    left: '5%',
    right: '5%',
    display: 'flex',
    justifyContent: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start',
    ...(position === 'top' && { top: '15%' }),
    ...(position === 'center' && { top: '50%', transform: 'translateY(-50%)' }),
    ...(position === 'bottom' && { bottom: '15%' }),
  };
  
  return (
    <AbsoluteFill>
      <div
        style={{
          ...positionStyles,
          opacity: 1 - exitProgress,
          transform: getExitTransform(),
        }}
      >
        {showBackground && (
          <div
            style={{
              position: 'absolute',
              backgroundColor,
              opacity: backgroundOpacity,
              padding: backgroundPadding,
              borderRadius: backgroundRadius,
              inset: -backgroundPadding,
            }}
          />
        )}
        
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start',
            gap: '0.25em',
            fontFamily,
            fontSize,
            fontWeight,
            color,
          }}
        >
          {words.map((word, index) => (
            <AnimatedWord
              key={index}
              word={word}
              index={index}
              frame={frame}
              fps={fps}
              staggerFrames={staggerFrames}
              wordDuration={wordDuration}
              entranceStyle={entranceStyle}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default WordByWord;
