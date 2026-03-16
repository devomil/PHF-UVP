export interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

export type CaptionPreset = 'karaoke' | 'capcut' | 'hormozi' | 'broadcast' | 'minimal';

export interface CaptionStyle {
  preset: CaptionPreset;
  fontSize?: number;
  fontFamily?: string;
  primaryColor?: string;
  activeColor?: string;
  backgroundColor?: string;
  position?: 'bottom' | 'center' | 'top';
  wordsPerLine?: number;
  bottomMargin?: number;
  animation?: 'pop' | 'fade' | 'slide' | 'none';
}

export interface SceneCaptions {
  words: CaptionWord[];
  style: CaptionStyle;
  enabled: boolean;
}

export interface CaptionPresetConfig {
  label: string;
  description: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  primaryColor: string;
  activeColor: string;
  backgroundColor: string;
  position: 'bottom' | 'center' | 'top';
  wordsPerLine: number;
  bottomMargin: number;
  animation: 'pop' | 'fade' | 'slide' | 'none';
  textTransform: 'none' | 'uppercase';
  textShadow: string;
  letterSpacing: number;
}

export const CAPTION_PRESETS: Record<CaptionPreset, CaptionPresetConfig> = {
  karaoke: {
    label: 'Karaoke Highlight',
    description: 'Words highlight one at a time as spoken',
    fontSize: 42,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 700,
    primaryColor: '#ffffff',
    activeColor: '#facc15',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    position: 'bottom',
    wordsPerLine: 5,
    bottomMargin: 80,
    animation: 'fade',
    textTransform: 'none',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
    letterSpacing: 0,
  },
  capcut: {
    label: 'CapCut / Modern Social',
    description: 'Bold centered text, active word pops',
    fontSize: 52,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 800,
    primaryColor: '#ffffff',
    activeColor: '#facc15',
    backgroundColor: 'transparent',
    position: 'center',
    wordsPerLine: 4,
    bottomMargin: 120,
    animation: 'pop',
    textTransform: 'none',
    textShadow: '0 3px 8px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.6)',
    letterSpacing: 0.5,
  },
  hormozi: {
    label: 'Hormozi / Bold Impact',
    description: 'Large bold words, one at a time',
    fontSize: 72,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 900,
    primaryColor: '#ffffff',
    activeColor: '#ef4444',
    backgroundColor: 'transparent',
    position: 'center',
    wordsPerLine: 1,
    bottomMargin: 0,
    animation: 'pop',
    textTransform: 'uppercase',
    textShadow: '0 4px 12px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.7)',
    letterSpacing: 2,
  },
  broadcast: {
    label: 'Broadcast / News',
    description: 'Professional lower-third caption bar',
    fontSize: 28,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 500,
    primaryColor: '#e2e8f0',
    activeColor: '#60a5fa',
    backgroundColor: 'linear-gradient(90deg, rgba(0,0,0,0.85), rgba(0,0,0,0.6))',
    position: 'bottom',
    wordsPerLine: 8,
    bottomMargin: 40,
    animation: 'fade',
    textTransform: 'none',
    textShadow: 'none',
    letterSpacing: 0.3,
  },
  minimal: {
    label: 'Minimal Subtitle',
    description: 'Clean simple subtitles',
    fontSize: 32,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 500,
    primaryColor: '#ffffff',
    activeColor: '#ffffff',
    backgroundColor: 'transparent',
    position: 'bottom',
    wordsPerLine: 6,
    bottomMargin: 60,
    animation: 'fade',
    textTransform: 'none',
    textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.4)',
    letterSpacing: 0,
  },
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  preset: 'capcut',
  position: 'bottom',
};

export function getPresetConfig(style: CaptionStyle): CaptionPresetConfig {
  const preset = CAPTION_PRESETS[style.preset] || CAPTION_PRESETS.capcut;
  return {
    ...preset,
    ...(style.fontSize !== undefined && { fontSize: style.fontSize }),
    ...(style.fontFamily !== undefined && { fontFamily: style.fontFamily }),
    ...(style.primaryColor !== undefined && { primaryColor: style.primaryColor }),
    ...(style.activeColor !== undefined && { activeColor: style.activeColor }),
    ...(style.backgroundColor !== undefined && { backgroundColor: style.backgroundColor }),
    ...(style.position !== undefined && { position: style.position }),
    ...(style.wordsPerLine !== undefined && { wordsPerLine: style.wordsPerLine }),
    ...(style.bottomMargin !== undefined && { bottomMargin: style.bottomMargin }),
    ...(style.animation !== undefined && { animation: style.animation }),
  };
}
