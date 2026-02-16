import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { ColorGrading, ColorGradePreset, getColorGradeForMood } from './effects/ColorGrading';
import { FilmGrain, GrainStyle } from './effects/FilmGrain';
import { Vignette, VignetteStyle, LetterboxVignette } from './effects/Vignette';

export type BroadcastQuality = 'standard' | 'premium' | 'ultra';

export interface FilmTreatmentConfig {
  colorGrade?: {
    preset?: ColorGradePreset;
    intensity?: number;
    fadeIn?: boolean;
  };
  filmGrain?: {
    style?: GrainStyle;
    intensity?: number;
    animated?: boolean;
  };
  vignette?: {
    style?: VignetteStyle;
    intensity?: number;
  };
  letterbox?: {
    enabled?: boolean;
    barHeight?: number;
  };
}

interface BroadcastVideoCompositionProps {
  quality?: BroadcastQuality;
  treatment?: FilmTreatmentConfig;
  mood?: string;
  enableFilmTreatment?: boolean;
  children: React.ReactNode;
}

const QUALITY_PRESETS: Record<BroadcastQuality, FilmTreatmentConfig> = {
  standard: {
    colorGrade: { preset: 'natural', intensity: 0.5 },
    filmGrain: { style: 'subtle', intensity: 0.3, animated: true },
    vignette: { style: 'soft', intensity: 0.4 },
    letterbox: { enabled: false },
  },
  premium: {
    colorGrade: { preset: 'cinematic-warm', intensity: 0.7, fadeIn: true },
    filmGrain: { style: '35mm', intensity: 0.5, animated: true },
    vignette: { style: 'cinematic', intensity: 0.6 },
    letterbox: { enabled: true, barHeight: 6 },
  },
  ultra: {
    colorGrade: { preset: 'cinematic-warm', intensity: 0.85, fadeIn: true },
    filmGrain: { style: '35mm', intensity: 0.6, animated: true },
    vignette: { style: 'cinematic', intensity: 0.7 },
    letterbox: { enabled: true, barHeight: 10 },
  },
};

export const BroadcastVideoComposition: React.FC<BroadcastVideoCompositionProps> = ({
  quality = 'premium',
  treatment,
  mood,
  enableFilmTreatment = true,
  children,
}) => {
  const { fps } = useVideoConfig();
  
  const baseConfig = QUALITY_PRESETS[quality];
  
  const finalConfig: FilmTreatmentConfig = {
    colorGrade: {
      ...baseConfig.colorGrade,
      ...treatment?.colorGrade,
      preset: mood 
        ? getColorGradeForMood(mood) 
        : (treatment?.colorGrade?.preset || baseConfig.colorGrade?.preset),
    },
    filmGrain: {
      ...baseConfig.filmGrain,
      ...treatment?.filmGrain,
    },
    vignette: {
      ...baseConfig.vignette,
      ...treatment?.vignette,
    },
    letterbox: {
      ...baseConfig.letterbox,
      ...treatment?.letterbox,
    },
  };
  
  if (!enableFilmTreatment) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }
  
  return (
    <AbsoluteFill>
      <ColorGrading
        preset={finalConfig.colorGrade?.preset}
        intensity={finalConfig.colorGrade?.intensity}
        fadeIn={finalConfig.colorGrade?.fadeIn}
        fadeInDuration={Math.round(fps * 0.5)}
      >
        {children}
      </ColorGrading>
      
      <FilmGrain
        style={finalConfig.filmGrain?.style}
        intensity={finalConfig.filmGrain?.intensity}
        animated={finalConfig.filmGrain?.animated}
      />
      
      <Vignette
        style={finalConfig.vignette?.style}
        intensity={finalConfig.vignette?.intensity}
      />
      
      {finalConfig.letterbox?.enabled && (
        <LetterboxVignette
          barHeight={finalConfig.letterbox.barHeight}
          feather={20}
        />
      )}
    </AbsoluteFill>
  );
};

export const withBroadcastTreatment = (
  Component: React.ComponentType<any>,
  config?: {
    quality?: BroadcastQuality;
    treatment?: FilmTreatmentConfig;
    mood?: string;
  }
) => {
  return (props: any) => (
    <BroadcastVideoComposition
      quality={config?.quality || 'premium'}
      treatment={config?.treatment}
      mood={config?.mood}
    >
      <Component {...props} />
    </BroadcastVideoComposition>
  );
};

export const useBroadcastConfig = (
  quality: BroadcastQuality,
  overrides?: Partial<FilmTreatmentConfig>
): FilmTreatmentConfig => {
  const base = QUALITY_PRESETS[quality];
  return {
    colorGrade: { ...base.colorGrade, ...overrides?.colorGrade },
    filmGrain: { ...base.filmGrain, ...overrides?.filmGrain },
    vignette: { ...base.vignette, ...overrides?.vignette },
    letterbox: { ...base.letterbox, ...overrides?.letterbox },
  };
};
