export type ColorGradePreset = 
  | 'warm-cinematic' 
  | 'cool-corporate' 
  | 'vibrant-lifestyle' 
  | 'moody-dramatic'
  | 'natural-organic'
  | 'luxury-elegant'
  | 'none';

export interface FilmTreatmentConfig {
  enabled: boolean;
  colorGrade: ColorGradePreset;
  colorIntensity: number;
  grainIntensity: number;
  vignetteIntensity: number;
  letterbox: '2.35:1' | '2.39:1' | '1.85:1' | 'none';
}

export const FILM_TREATMENT_PRESETS: Record<string, FilmTreatmentConfig> = {
  'hero-cinematic': {
    enabled: true,
    colorGrade: 'warm-cinematic',
    colorIntensity: 1.0,
    grainIntensity: 0.04,
    vignetteIntensity: 0.25,
    letterbox: 'none',
  },
  'lifestyle': {
    enabled: true,
    colorGrade: 'natural-organic',
    colorIntensity: 1.0,
    grainIntensity: 0.03,
    vignetteIntensity: 0.15,
    letterbox: 'none',
  },
  'product-showcase': {
    enabled: true,
    colorGrade: 'cool-corporate',
    colorIntensity: 0.8,
    grainIntensity: 0.02,
    vignetteIntensity: 0.1,
    letterbox: 'none',
  },
  'educational': {
    enabled: true,
    colorGrade: 'natural-organic',
    colorIntensity: 0.9,
    grainIntensity: 0.02,
    vignetteIntensity: 0.1,
    letterbox: 'none',
  },
  'social-energetic': {
    enabled: true,
    colorGrade: 'vibrant-lifestyle',
    colorIntensity: 1.0,
    grainIntensity: 0.01,
    vignetteIntensity: 0.05,
    letterbox: 'none',
  },
  'premium': {
    enabled: true,
    colorGrade: 'luxury-elegant',
    colorIntensity: 1.0,
    grainIntensity: 0.03,
    vignetteIntensity: 0.3,
    letterbox: '2.35:1',
  },
  'none': {
    enabled: false,
    colorGrade: 'none',
    colorIntensity: 0,
    grainIntensity: 0,
    vignetteIntensity: 0,
    letterbox: 'none',
  },
};
