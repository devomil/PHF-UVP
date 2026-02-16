import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, Easing, random } from 'remotion';

export type FilmBurnStyle = 'classic' | 'warm' | 'cool' | 'organic' | 'intense';

interface FilmBurnProps {
  durationInFrames: number;
  style?: FilmBurnStyle;
  intensity?: number;
  seed?: number;
}

const FILM_BURN_COLORS: Record<FilmBurnStyle, {
  primary: string;
  secondary: string;
  highlight: string;
}> = {
  'classic': {
    primary: 'rgba(200, 80, 20, 0.9)',
    secondary: 'rgba(255, 150, 50, 0.7)',
    highlight: 'rgba(255, 255, 200, 0.9)',
  },
  'warm': {
    primary: 'rgba(255, 100, 50, 0.85)',
    secondary: 'rgba(255, 180, 100, 0.6)',
    highlight: 'rgba(255, 240, 180, 0.8)',
  },
  'cool': {
    primary: 'rgba(100, 50, 150, 0.8)',
    secondary: 'rgba(150, 100, 200, 0.6)',
    highlight: 'rgba(200, 180, 255, 0.7)',
  },
  'organic': {
    primary: 'rgba(180, 100, 50, 0.75)',
    secondary: 'rgba(200, 150, 80, 0.55)',
    highlight: 'rgba(240, 220, 180, 0.7)',
  },
  'intense': {
    primary: 'rgba(255, 50, 0, 0.95)',
    secondary: 'rgba(255, 200, 100, 0.8)',
    highlight: 'rgba(255, 255, 255, 1)',
  },
};

export const FilmBurn: React.FC<FilmBurnProps> = ({
  durationInFrames,
  style = 'classic',
  intensity = 1.0,
  seed = 0,
}) => {
  const frame = useCurrentFrame();
  const colors = FILM_BURN_COLORS[style];
  
  const progress = interpolate(
    frame,
    [0, durationInFrames * 0.15, durationInFrames * 0.5, durationInFrames * 0.85, durationInFrames],
    [0, 0.3, 1, 0.3, 0],
    {
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  
  const spreadProgress = interpolate(
    frame,
    [0, durationInFrames * 0.5, durationInFrames],
    [0, 1, 0.3],
    {
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  
  const burnSpots = useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => ({
      x: random(`burn-x-${seed}-${i}`) * 60 + 20,
      y: random(`burn-y-${seed}-${i}`) * 60 + 20,
      size: random(`burn-size-${seed}-${i}`) * 40 + 30,
      delay: random(`burn-delay-${seed}-${i}`) * 0.2,
    }));
  }, [seed]);
  
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {burnSpots.map((spot, i) => {
        const spotProgress = interpolate(
          frame,
          [
            durationInFrames * spot.delay,
            durationInFrames * (0.3 + spot.delay),
            durationInFrames * (0.7 - spot.delay * 0.5),
            durationInFrames * (0.9 - spot.delay * 0.5),
          ],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        
        const spotSize = spot.size * (1 + spreadProgress * 0.5);
        const wobbleX = Math.sin(frame * 0.15 + i) * 3;
        const wobbleY = Math.cos(frame * 0.12 + i * 2) * 3;
        
        return (
          <AbsoluteFill
            key={i}
            style={{
              background: `radial-gradient(
                ellipse ${spotSize}% ${spotSize * 1.2}% at ${spot.x + wobbleX}% ${spot.y + wobbleY}%,
                ${colors.highlight} 0%,
                ${colors.secondary} 30%,
                ${colors.primary} 60%,
                transparent 85%
              )`,
              opacity: spotProgress * intensity * progress,
              mixBlendMode: 'screen',
              filter: `blur(${20 + spreadProgress * 30}px)`,
            }}
          />
        );
      })}
      
      <AbsoluteFill
        style={{
          background: `radial-gradient(
            ellipse 100% 100% at 50% 50%,
            transparent 40%,
            ${colors.primary} 80%,
            ${colors.secondary} 100%
          )`,
          opacity: progress * intensity * 0.3,
          mixBlendMode: 'overlay',
          filter: 'blur(40px)',
        }}
      />
    </AbsoluteFill>
  );
};

export const FilmBurnTransition: React.FC<{
  durationInFrames: number;
  style?: FilmBurnStyle;
  outgoingContent: React.ReactNode;
  incomingContent: React.ReactNode;
}> = ({
  durationInFrames,
  style = 'classic',
  outgoingContent,
  incomingContent,
}) => {
  const frame = useCurrentFrame();
  const midpoint = durationInFrames / 2;
  const colors = FILM_BURN_COLORS[style];
  
  const burnIntensity = interpolate(
    frame,
    [0, midpoint * 0.7, midpoint, midpoint * 1.3, durationInFrames],
    [0, 0.8, 1, 0.8, 0],
    {
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  
  const whiteFlash = interpolate(
    frame,
    [midpoint * 0.85, midpoint, midpoint * 1.15],
    [0, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const outgoingOpacity = interpolate(
    frame,
    [midpoint * 0.7, midpoint],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const incomingOpacity = interpolate(
    frame,
    [midpoint, midpoint * 1.3],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  return (
    <>
      <AbsoluteFill style={{ opacity: outgoingOpacity }}>
        {outgoingContent}
      </AbsoluteFill>
      
      <AbsoluteFill style={{ opacity: incomingOpacity }}>
        {incomingContent}
      </AbsoluteFill>
      
      <FilmBurn 
        durationInFrames={durationInFrames} 
        style={style} 
        intensity={burnIntensity}
      />
      
      <AbsoluteFill
        style={{
          backgroundColor: colors.highlight,
          opacity: whiteFlash * 0.8,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
        }}
      />
    </>
  );
};

export const CigaretteBurn: React.FC<{
  durationInFrames: number;
  position?: 'top-right' | 'top-left' | 'random';
  size?: number;
  seed?: number;
}> = ({
  durationInFrames,
  position = 'top-right',
  size = 40,
  seed = 0,
}) => {
  const frame = useCurrentFrame();
  
  const pos = useMemo(() => {
    const positions = {
      'top-right': { x: 92, y: 8 },
      'top-left': { x: 8, y: 8 },
      'random': { 
        x: 85 + random(`cig-burn-x-${seed}`) * 10, 
        y: 5 + random(`cig-burn-y-${seed}`) * 10 
      },
    };
    return positions[position];
  }, [position, seed]);
  
  const visibility = interpolate(
    frame,
    [0, 3, durationInFrames - 3, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const flicker = 0.8 + Math.sin(frame * 0.8) * 0.2;
  
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          width: size,
          height: size,
          borderRadius: '50%',
          background: `radial-gradient(
            circle,
            rgba(50, 30, 20, 0.95) 0%,
            rgba(80, 50, 30, 0.9) 40%,
            rgba(120, 80, 40, 0.7) 70%,
            transparent 100%
          )`,
          opacity: visibility * flicker,
          boxShadow: '0 0 10px rgba(100, 60, 30, 0.5)',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </AbsoluteFill>
  );
};
