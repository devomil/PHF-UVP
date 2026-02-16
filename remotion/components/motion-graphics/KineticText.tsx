import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';

export type AnimationStyle = 
  | 'word-by-word'
  | 'character'
  | 'line-by-line'
  | 'bounce'
  | 'wave'
  | 'reveal'
  | 'split'
  | 'typewriter'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'scale-in'
  | 'blur-in';

export type EasingType = 
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'spring'
  | 'bounce';

export interface KineticTextProps {
  text: string;
  style: AnimationStyle;
  position: 'top' | 'center' | 'bottom' | 'custom';
  customPosition?: { x: number; y: number };
  alignment: 'left' | 'center' | 'right';
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  color: string;
  lineHeight?: number;
  letterSpacing?: number;
  staggerDelay: number;
  entranceDuration: number;
  holdDuration: number;
  exitDuration: number;
  startFrame?: number;
  easing: EasingType;
  textShadow?: boolean;
  textShadowColor?: string;
  textShadowBlur?: number;
  textStroke?: {
    width: number;
    color: string;
  };
  backgroundBox?: {
    enabled: boolean;
    color: string;
    opacity: number;
    padding: number;
    borderRadius: number;
  };
  gradient?: {
    enabled: boolean;
    colors: string[];
    direction: 'horizontal' | 'vertical' | 'diagonal';
  };
}

const applyEasing = (progress: number, easing: EasingType, fps: number, frame: number): number => {
  switch (easing) {
    case 'linear':
      return progress;
    case 'ease-in':
      return Easing.in(Easing.ease)(progress);
    case 'ease-out':
      return Easing.out(Easing.ease)(progress);
    case 'ease-in-out':
      return Easing.inOut(Easing.ease)(progress);
    case 'spring':
      return spring({
        frame,
        fps,
        config: { damping: 12, stiffness: 200 },
      });
    case 'bounce':
      return spring({
        frame,
        fps,
        config: { damping: 8, stiffness: 150 },
      });
    default:
      return progress;
  }
};

function getTextUnits(text: string, style: AnimationStyle): string[] {
  switch (style) {
    case 'character':
      return text.split('');
    case 'line-by-line':
      return text.split('\n');
    case 'word-by-word':
    case 'bounce':
    case 'wave':
    case 'reveal':
    case 'split':
    case 'slide-up':
    case 'slide-down':
    case 'scale-in':
    case 'blur-in':
    default:
      return text.split(' ').filter(w => w.length > 0);
  }
}

function getPositionStyles(
  position: string,
  customPosition: { x: number; y: number } | undefined,
  alignment: string
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    padding: '5%',
  };
  
  if (position === 'custom' && customPosition) {
    return {
      ...base,
      left: `${customPosition.x}%`,
      top: `${customPosition.y}%`,
      transform: 'translate(-50%, -50%)',
      justifyContent: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start',
    };
  }
  
  switch (position) {
    case 'top':
      return {
        ...base,
        top: '10%',
        left: 0,
        right: 0,
        justifyContent: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start',
      };
    case 'center':
      return {
        ...base,
        top: '50%',
        left: 0,
        right: 0,
        transform: 'translateY(-50%)',
        justifyContent: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start',
      };
    case 'bottom':
    default:
      return {
        ...base,
        bottom: '15%',
        left: 0,
        right: 0,
        justifyContent: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start',
      };
  }
}

function getAnimationTransforms(
  style: AnimationStyle,
  progress: number,
  frame: number,
  _fps: number,
  index: number = 0
): { opacity: number; transform: string } {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  
  switch (style) {
    case 'bounce':
      return {
        opacity: clampedProgress,
        transform: `translateY(${(1 - clampedProgress) * -30}px) scale(${0.5 + clampedProgress * 0.5})`,
      };
      
    case 'wave': {
      const waveOffset = Math.sin(frame * 0.2) * 10 * (1 - clampedProgress);
      return {
        opacity: clampedProgress,
        transform: `translateY(${waveOffset}px)`,
      };
    }
      
    case 'reveal':
      return {
        opacity: clampedProgress,
        transform: `scaleX(${clampedProgress})`,
      };
      
    case 'split': {
      const direction = index % 2 === 0 ? 1 : -1;
      return {
        opacity: clampedProgress,
        transform: `translateX(${(1 - clampedProgress) * 50 * direction}px)`,
      };
    }
      
    case 'slide-up':
      return {
        opacity: clampedProgress,
        transform: `translateY(${(1 - clampedProgress) * 40}px)`,
      };
      
    case 'slide-down':
      return {
        opacity: clampedProgress,
        transform: `translateY(${(1 - clampedProgress) * -40}px)`,
      };
      
    case 'scale-in':
      return {
        opacity: clampedProgress,
        transform: `scale(${0.3 + clampedProgress * 0.7})`,
      };
      
    case 'blur-in':
      return {
        opacity: clampedProgress,
        transform: `scale(${0.9 + clampedProgress * 0.1})`,
      };
      
    case 'typewriter':
      return {
        opacity: clampedProgress >= 1 ? 1 : 0,
        transform: 'none',
      };
      
    case 'fade':
    case 'word-by-word':
    case 'character':
    case 'line-by-line':
    default:
      return {
        opacity: clampedProgress,
        transform: `translateY(${(1 - clampedProgress) * 20}px)`,
      };
  }
}

function getGradientCSS(colors: string[], direction: string): string {
  const angle = direction === 'horizontal' ? '90deg' 
    : direction === 'vertical' ? '180deg' 
    : '135deg';
  return `linear-gradient(${angle}, ${colors.join(', ')})`;
}

const AnimatedUnit: React.FC<{
  text: string;
  index: number;
  style: AnimationStyle;
  localFrame: number;
  staggerDelay: number;
  entranceDuration: number;
  holdDuration: number;
  exitDuration: number;
  totalUnits: number;
  easing: EasingType;
  fps: number;
  isCharacter: boolean;
}> = ({
  text,
  index,
  style,
  localFrame,
  staggerDelay,
  entranceDuration,
  holdDuration,
  exitDuration,
  totalUnits,
  easing,
  fps,
  isCharacter,
}) => {
  const unitStartFrame = index * staggerDelay;
  const totalEntranceTime = entranceDuration + (totalUnits - 1) * staggerDelay;
  const exitStartFrame = totalEntranceTime + holdDuration;
  const unitFrame = localFrame - unitStartFrame;
  
  if (unitFrame < 0) {
    return <span style={{ opacity: 0 }}>{text}{!isCharacter && ' '}</span>;
  }
  
  const entranceProgress = Math.min(unitFrame / entranceDuration, 1);
  const easedProgress = applyEasing(entranceProgress, easing, fps, unitFrame);
  const transforms = getAnimationTransforms(style, easedProgress, unitFrame, fps, index);
  
  let finalOpacity = transforms.opacity;
  let finalTransform = transforms.transform;
  
  if (localFrame >= exitStartFrame && exitDuration > 0) {
    const exitProgress = Math.min((localFrame - exitStartFrame) / exitDuration, 1);
    finalOpacity = transforms.opacity * (1 - exitProgress);
    finalTransform = `${transforms.transform} translateY(${exitProgress * 20}px)`;
  }
  
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: finalOpacity,
        transform: finalTransform,
        whiteSpace: isCharacter ? 'pre' : 'normal',
      }}
    >
      {text}
    </span>
  );
};

export const KineticText: React.FC<KineticTextProps> = ({
  text,
  style,
  position,
  customPosition,
  alignment,
  fontSize,
  fontFamily,
  fontWeight,
  color,
  lineHeight = 1.4,
  letterSpacing = 0,
  staggerDelay,
  entranceDuration,
  holdDuration,
  exitDuration,
  startFrame = 0,
  easing,
  textShadow = false,
  textShadowColor = 'rgba(0,0,0,0.3)',
  textShadowBlur = 4,
  backgroundBox,
  gradient,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const localFrame = frame - startFrame;
  if (localFrame < 0) return null;
  
  const units = getTextUnits(text, style);
  const totalEntranceTime = entranceDuration + (units.length - 1) * staggerDelay;
  const exitStartFrame = totalEntranceTime + holdDuration;
  const totalDuration = exitStartFrame + exitDuration;
  
  const globalExitOpacity = localFrame >= exitStartFrame
    ? interpolate(
        localFrame,
        [exitStartFrame, totalDuration],
        [1, 0],
        { extrapolateRight: 'clamp' }
      )
    : 1;
  
  const positionStyles = getPositionStyles(position, customPosition, alignment);
  
  const shadowStyle = textShadow
    ? `0 2px ${textShadowBlur}px ${textShadowColor}`
    : 'none';
  
  const gradientStyle = gradient?.enabled
    ? {
        background: getGradientCSS(gradient.colors, gradient.direction),
        WebkitBackgroundClip: 'text' as const,
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text' as const,
      }
    : {};
  
  return (
    <AbsoluteFill
      style={{
        ...positionStyles,
        opacity: globalExitOpacity,
      }}
    >
      {backgroundBox?.enabled && (
        <div
          style={{
            position: 'absolute',
            backgroundColor: backgroundBox.color,
            opacity: backgroundBox.opacity,
            padding: backgroundBox.padding,
            borderRadius: backgroundBox.borderRadius,
            inset: -backgroundBox.padding,
          }}
        />
      )}
      
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start',
          gap: style === 'character' ? 0 : '0.3em',
          fontFamily,
          fontSize,
          fontWeight,
          lineHeight,
          letterSpacing,
          color,
          textShadow: shadowStyle,
          ...gradientStyle,
        }}
      >
        {units.map((unit, index) => (
          <AnimatedUnit
            key={index}
            text={unit}
            index={index}
            style={style}
            localFrame={localFrame}
            staggerDelay={staggerDelay}
            entranceDuration={entranceDuration}
            holdDuration={holdDuration}
            exitDuration={exitDuration}
            totalUnits={units.length}
            easing={easing}
            fps={fps}
            isCharacter={style === 'character'}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

export default KineticText;
