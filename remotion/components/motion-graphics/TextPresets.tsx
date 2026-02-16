import React from 'react';
import { KineticText, KineticTextProps } from './KineticText';
import { WordByWord, WordByWordProps } from './WordByWord';
import { CharacterAnimation, CharacterAnimationProps } from './CharacterAnimation';

const PHF_COLORS = {
  primary: '#2D5A27',
  secondary: '#D4A574',
  accent: '#8B4513',
  text: '#FFFFFF',
  background: '#F5F5DC',
};

const PHF_FONTS = {
  heading: 'Inter, system-ui, sans-serif',
  body: 'Inter, system-ui, sans-serif',
};

export type TextPresetName = 
  | 'headline-bounce'
  | 'headline-wave'
  | 'subtitle-fade'
  | 'cta-pop'
  | 'stat-reveal'
  | 'quote-typewriter'
  | 'list-slide'
  | 'dramatic-split';

interface TextPresetConfig {
  component: 'kinetic' | 'word-by-word' | 'character';
  props: Partial<KineticTextProps | WordByWordProps | CharacterAnimationProps>;
}

const PRESETS: Record<TextPresetName, TextPresetConfig> = {
  'headline-bounce': {
    component: 'kinetic',
    props: {
      style: 'bounce',
      fontSize: 72,
      fontFamily: PHF_FONTS.heading,
      fontWeight: '700',
      color: PHF_COLORS.primary,
      position: 'center',
      alignment: 'center',
      staggerDelay: 6,
      entranceDuration: 12,
      holdDuration: 60,
      exitDuration: 15,
      easing: 'spring',
      textShadow: true,
      backgroundBox: {
        enabled: true,
        color: '#FFFFFF',
        opacity: 0.95,
        padding: 30,
        borderRadius: 12,
      },
    },
  },
  
  'headline-wave': {
    component: 'character',
    props: {
      effect: 'wave',
      fontSize: 64,
      fontFamily: PHF_FONTS.heading,
      fontWeight: '700',
      color: PHF_COLORS.primary,
      position: 'center',
      alignment: 'center',
      staggerFrames: 2,
      characterDuration: 15,
      loopWave: true,
    },
  },
  
  'subtitle-fade': {
    component: 'word-by-word',
    props: {
      fontSize: 36,
      fontFamily: PHF_FONTS.body,
      fontWeight: '500',
      color: PHF_COLORS.text,
      position: 'bottom',
      alignment: 'center',
      staggerFrames: 8,
      wordDuration: 10,
      holdFrames: 90,
      entranceStyle: 'fade-up',
      exitStyle: 'fade',
      showBackground: true,
      backgroundColor: PHF_COLORS.primary,
      backgroundOpacity: 0.9,
      backgroundPadding: 20,
      backgroundRadius: 8,
    },
  },
  
  'cta-pop': {
    component: 'kinetic',
    props: {
      style: 'scale-in',
      fontSize: 48,
      fontFamily: PHF_FONTS.heading,
      fontWeight: '700',
      color: PHF_COLORS.text,
      position: 'center',
      alignment: 'center',
      staggerDelay: 4,
      entranceDuration: 15,
      holdDuration: 90,
      exitDuration: 10,
      easing: 'bounce',
      backgroundBox: {
        enabled: true,
        color: PHF_COLORS.secondary,
        opacity: 1,
        padding: 24,
        borderRadius: 50,
      },
    },
  },
  
  'stat-reveal': {
    component: 'character',
    props: {
      effect: 'reveal',
      fontSize: 96,
      fontFamily: PHF_FONTS.heading,
      fontWeight: '800',
      color: PHF_COLORS.primary,
      position: 'center',
      alignment: 'center',
      staggerFrames: 3,
      characterDuration: 10,
    },
  },
  
  'quote-typewriter': {
    component: 'character',
    props: {
      effect: 'typewriter',
      fontSize: 32,
      fontFamily: 'Georgia, serif',
      fontWeight: '400',
      color: PHF_COLORS.accent,
      position: 'center',
      alignment: 'center',
      staggerFrames: 2,
      characterDuration: 1,
    },
  },
  
  'list-slide': {
    component: 'word-by-word',
    props: {
      fontSize: 28,
      fontFamily: PHF_FONTS.body,
      fontWeight: '500',
      color: PHF_COLORS.text,
      position: 'center',
      alignment: 'left',
      staggerFrames: 12,
      wordDuration: 8,
      holdFrames: 60,
      entranceStyle: 'slide-left',
      exitStyle: 'fade',
      showBackground: true,
      backgroundColor: PHF_COLORS.primary,
      backgroundOpacity: 0.85,
      backgroundPadding: 16,
      backgroundRadius: 6,
    },
  },
  
  'dramatic-split': {
    component: 'kinetic',
    props: {
      style: 'split',
      fontSize: 84,
      fontFamily: PHF_FONTS.heading,
      fontWeight: '900',
      color: PHF_COLORS.primary,
      position: 'center',
      alignment: 'center',
      staggerDelay: 8,
      entranceDuration: 20,
      holdDuration: 45,
      exitDuration: 15,
      easing: 'ease-out',
      textShadow: true,
      textShadowColor: 'rgba(0,0,0,0.4)',
      textShadowBlur: 8,
    },
  },
};

export function getPreset(name: TextPresetName): TextPresetConfig {
  return PRESETS[name];
}

interface PresetTextProps {
  text: string;
  preset: TextPresetName;
  overrides?: Partial<KineticTextProps | WordByWordProps | CharacterAnimationProps>;
}

export const PresetText: React.FC<PresetTextProps> = ({ text, preset, overrides = {} }) => {
  const config = PRESETS[preset];
  
  if (!config) {
    console.error(`[PresetText] Unknown preset: ${preset}`);
    return null;
  }
  
  const mergedProps = { ...config.props, ...overrides, text };
  
  switch (config.component) {
    case 'kinetic':
      return <KineticText {...(mergedProps as KineticTextProps)} />;
    case 'word-by-word':
      return <WordByWord {...(mergedProps as WordByWordProps)} />;
    case 'character':
      return <CharacterAnimation {...(mergedProps as CharacterAnimationProps)} />;
    default:
      return null;
  }
};

export const PRESET_NAMES = Object.keys(PRESETS) as TextPresetName[];

export function getPresetsByCategory(category: 'headline' | 'subtitle' | 'cta' | 'stat' | 'quote' | 'list'): TextPresetName[] {
  return PRESET_NAMES.filter(name => name.startsWith(category));
}

export default PresetText;
