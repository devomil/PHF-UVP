import React, { useMemo } from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';

export type GrainStyle = 'subtle' | 'medium' | 'heavy' | '35mm' | '16mm' | 'super8';

interface FilmGrainProps {
  style?: GrainStyle;
  intensity?: number;
  animated?: boolean;
  seed?: number;
  monochrome?: boolean;
}

const GRAIN_SETTINGS: Record<GrainStyle, {
  opacity: number;
  size: number;
  frequency: number;
}> = {
  'subtle': {
    opacity: 0.03,
    size: 1,
    frequency: 0.65,
  },
  'medium': {
    opacity: 0.06,
    size: 1.5,
    frequency: 0.55,
  },
  'heavy': {
    opacity: 0.12,
    size: 2,
    frequency: 0.45,
  },
  '35mm': {
    opacity: 0.04,
    size: 1.2,
    frequency: 0.6,
  },
  '16mm': {
    opacity: 0.08,
    size: 1.8,
    frequency: 0.5,
  },
  'super8': {
    opacity: 0.15,
    size: 2.5,
    frequency: 0.4,
  },
};

export const FilmGrain: React.FC<FilmGrainProps> = ({
  style = 'subtle',
  intensity = 1.0,
  animated = true,
  seed = 0,
  monochrome = true,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  
  const settings = GRAIN_SETTINGS[style];
  const effectiveOpacity = settings.opacity * intensity;
  
  const grainSeed = animated ? seed + frame : seed;
  
  const svgFilter = useMemo(() => {
    const baseFrequency = settings.frequency;
    const numOctaves = 4;
    
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs>
          <filter id="grain-${grainSeed}" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence 
              type="fractalNoise" 
              baseFrequency="${baseFrequency}" 
              numOctaves="${numOctaves}" 
              seed="${grainSeed}"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="${monochrome ? 0 : 1}" />
            <feComponentTransfer>
              <feFuncR type="linear" slope="2" intercept="-0.5"/>
              <feFuncG type="linear" slope="2" intercept="-0.5"/>
              <feFuncB type="linear" slope="2" intercept="-0.5"/>
            </feComponentTransfer>
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#grain-${grainSeed})" opacity="1"/>
      </svg>
    `;
  }, [width, height, grainSeed, settings.frequency, monochrome]);
  
  const dataUri = useMemo(() => {
    return `data:image/svg+xml,${encodeURIComponent(svgFilter)}`;
  }, [svgFilter]);
  
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url("${dataUri}")`,
        backgroundSize: `${settings.size * 100}% ${settings.size * 100}%`,
        opacity: effectiveOpacity,
        mixBlendMode: 'overlay',
        pointerEvents: 'none',
      }}
    />
  );
};

