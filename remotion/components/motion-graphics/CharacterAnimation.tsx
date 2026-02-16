import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from 'remotion';

export type CharacterEffect = 
  | 'wave'
  | 'bounce'
  | 'typewriter'
  | 'reveal'
  | 'scramble'
  | 'glow'
  | 'rainbow';

export interface CharacterAnimationProps {
  text: string;
  effect: CharacterEffect;
  position: 'top' | 'center' | 'bottom';
  alignment: 'left' | 'center' | 'right';
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  color: string;
  staggerFrames: number;
  characterDuration: number;
  loopWave?: boolean;
  glowColor?: string;
  rainbowColors?: string[];
}

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const AnimatedCharacter: React.FC<{
  char: string;
  index: number;
  frame: number;
  fps: number;
  effect: CharacterEffect;
  staggerFrames: number;
  characterDuration: number;
  loopWave: boolean;
  glowColor: string;
  rainbowColors: string[];
}> = ({
  char,
  index,
  frame,
  fps,
  effect,
  staggerFrames,
  characterDuration,
  loopWave,
  glowColor,
  rainbowColors,
}) => {
  const charStartFrame = index * staggerFrames;
  const localFrame = frame - charStartFrame;
  
  if (char === ' ') {
    return <span style={{ width: '0.3em' }}>&nbsp;</span>;
  }
  
  let style: React.CSSProperties = {
    display: 'inline-block',
    whiteSpace: 'pre',
  };
  
  switch (effect) {
    case 'wave': {
      const waveProgress = loopWave
        ? (frame + index * 5) % 60 / 60
        : localFrame / characterDuration;
      const yOffset = Math.sin(waveProgress * Math.PI * 2) * 10;
      style = {
        ...style,
        transform: `translateY(${yOffset}px)`,
        opacity: localFrame < 0 ? 0 : 1,
      };
      break;
    }
    
    case 'bounce': {
      if (localFrame < 0) {
        style = { ...style, opacity: 0 };
      } else {
        const bounceSpring = spring({
          frame: localFrame,
          fps,
          config: { damping: 8, stiffness: 200 },
        });
        style = {
          ...style,
          transform: `translateY(${(1 - Math.min(bounceSpring, 1)) * -50}px)`,
          opacity: Math.min(bounceSpring, 1),
        };
      }
      break;
    }
    
    case 'typewriter': {
      style = {
        ...style,
        opacity: localFrame >= 0 ? 1 : 0,
      };
      break;
    }
    
    case 'reveal': {
      if (localFrame < 0) {
        style = { ...style, opacity: 0, transform: 'scaleY(0)' };
      } else {
        const progress = Math.min(localFrame / characterDuration, 1);
        style = {
          ...style,
          opacity: progress,
          transform: `scaleY(${progress})`,
          transformOrigin: 'bottom',
        };
      }
      break;
    }
    
    case 'scramble': {
      if (localFrame < 0) {
        style = { ...style, opacity: 0 };
        break;
      } else if (localFrame < characterDuration) {
        const randomIndex = Math.floor((frame * 7 + index * 13) % SCRAMBLE_CHARS.length);
        return (
          <span style={{ ...style, opacity: 0.7 }}>
            {SCRAMBLE_CHARS[randomIndex]}
          </span>
        );
      } else {
        style = { ...style, opacity: 1 };
      }
      break;
    }
    
    case 'glow': {
      if (localFrame < 0) {
        style = { ...style, opacity: 0 };
      } else {
        const glowProgress = Math.min(localFrame / characterDuration, 1);
        const glowIntensity = Math.sin(glowProgress * Math.PI) * 20;
        style = {
          ...style,
          opacity: glowProgress,
          textShadow: `0 0 ${glowIntensity}px ${glowColor}, 0 0 ${glowIntensity * 2}px ${glowColor}`,
        };
      }
      break;
    }
    
    case 'rainbow': {
      if (localFrame < 0) {
        style = { ...style, opacity: 0 };
      } else {
        const colorIndex = (index + Math.floor(frame / 10)) % rainbowColors.length;
        const progress = Math.min(localFrame / characterDuration, 1);
        style = {
          ...style,
          opacity: progress,
          color: rainbowColors[colorIndex],
        };
      }
      break;
    }
  }
  
  return <span style={style}>{char}</span>;
};

export const CharacterAnimation: React.FC<CharacterAnimationProps> = ({
  text,
  effect,
  position,
  alignment,
  fontSize,
  fontFamily,
  fontWeight,
  color,
  staggerFrames,
  characterDuration,
  loopWave = false,
  glowColor = '#FFD700',
  rainbowColors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'],
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const characters = text.split('');
  
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
      <div style={positionStyles}>
        <div
          style={{
            display: 'flex',
            fontFamily,
            fontSize,
            fontWeight,
            color,
          }}
        >
          {characters.map((char, index) => (
            <AnimatedCharacter
              key={index}
              char={char}
              index={index}
              frame={frame}
              fps={fps}
              effect={effect}
              staggerFrames={staggerFrames}
              characterDuration={characterDuration}
              loopWave={loopWave}
              glowColor={glowColor}
              rainbowColors={rainbowColors}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default CharacterAnimation;
