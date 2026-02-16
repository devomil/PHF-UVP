import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export type ColorGradePreset = 
  | 'cinematic-warm'
  | 'cinematic-cool'
  | 'film-noir'
  | 'vintage'
  | 'natural'
  | 'vibrant'
  | 'desaturated'
  | 'golden-hour'
  | 'moonlight'
  | 'forest-green';

interface ColorGradingProps {
  preset?: ColorGradePreset;
  intensity?: number;
  fadeIn?: boolean;
  fadeInDuration?: number;
  customFilter?: string;
  children: React.ReactNode;
}

const COLOR_GRADE_PRESETS: Record<ColorGradePreset, {
  brightness: number;
  contrast: number;
  saturate: number;
  hueRotate: number;
  sepia: number;
}> = {
  'cinematic-warm': {
    brightness: 1.02,
    contrast: 1.08,
    saturate: 0.92,
    hueRotate: 5,
    sepia: 0.12,
  },
  'cinematic-cool': {
    brightness: 1.0,
    contrast: 1.1,
    saturate: 0.88,
    hueRotate: -8,
    sepia: 0,
  },
  'film-noir': {
    brightness: 0.95,
    contrast: 1.25,
    saturate: 0.2,
    hueRotate: 0,
    sepia: 0.15,
  },
  'vintage': {
    brightness: 1.05,
    contrast: 0.95,
    saturate: 0.75,
    hueRotate: 10,
    sepia: 0.25,
  },
  'natural': {
    brightness: 1.0,
    contrast: 1.02,
    saturate: 1.05,
    hueRotate: 0,
    sepia: 0,
  },
  'vibrant': {
    brightness: 1.05,
    contrast: 1.08,
    saturate: 1.35,
    hueRotate: 0,
    sepia: 0,
  },
  'desaturated': {
    brightness: 1.0,
    contrast: 1.05,
    saturate: 0.6,
    hueRotate: 0,
    sepia: 0.05,
  },
  'golden-hour': {
    brightness: 1.08,
    contrast: 1.05,
    saturate: 1.1,
    hueRotate: 15,
    sepia: 0.18,
  },
  'moonlight': {
    brightness: 0.92,
    contrast: 1.12,
    saturate: 0.65,
    hueRotate: -15,
    sepia: 0.05,
  },
  'forest-green': {
    brightness: 1.0,
    contrast: 1.05,
    saturate: 1.15,
    hueRotate: -5,
    sepia: 0.08,
  },
};

export const ColorGrading: React.FC<ColorGradingProps> = ({
  preset = 'cinematic-warm',
  intensity = 1.0,
  fadeIn = false,
  fadeInDuration = 30,
  customFilter,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const gradeSettings = COLOR_GRADE_PRESETS[preset];
  
  const fadeMultiplier = fadeIn
    ? interpolate(frame, [0, fadeInDuration], [0, 1], { extrapolateRight: 'clamp' })
    : 1;
  
  const effectiveIntensity = intensity * fadeMultiplier;
  
  const filterString = useMemo(() => {
    if (customFilter) {
      return customFilter;
    }
    
    const lerp = (base: number, target: number, t: number) => base + (target - base) * t;
    
    const brightness = lerp(1, gradeSettings.brightness, effectiveIntensity);
    const contrast = lerp(1, gradeSettings.contrast, effectiveIntensity);
    const saturate = lerp(1, gradeSettings.saturate, effectiveIntensity);
    const hueRotate = gradeSettings.hueRotate * effectiveIntensity;
    const sepia = gradeSettings.sepia * effectiveIntensity;
    
    return `
      brightness(${brightness.toFixed(3)})
      contrast(${contrast.toFixed(3)})
      saturate(${saturate.toFixed(3)})
      hue-rotate(${hueRotate.toFixed(1)}deg)
      sepia(${sepia.toFixed(3)})
    `.trim().replace(/\s+/g, ' ');
  }, [customFilter, gradeSettings, effectiveIntensity]);
  
  return (
    <AbsoluteFill
      style={{
        filter: filterString,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const getColorGradeForMood = (mood: string): ColorGradePreset => {
  const moodMap: Record<string, ColorGradePreset> = {
    'warm': 'cinematic-warm',
    'cozy': 'golden-hour',
    'professional': 'natural',
    'dramatic': 'cinematic-cool',
    'nostalgic': 'vintage',
    'energetic': 'vibrant',
    'calm': 'desaturated',
    'mysterious': 'moonlight',
    'healthy': 'forest-green',
    'wellness': 'natural',
    'organic': 'forest-green',
    'modern': 'cinematic-cool',
    'classic': 'vintage',
  };
  
  const lowerMood = mood.toLowerCase();
  for (const [key, value] of Object.entries(moodMap)) {
    if (lowerMood.includes(key)) {
      return value;
    }
  }
  
  return 'cinematic-warm';
};
