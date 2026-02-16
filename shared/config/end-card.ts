export interface EndCardConfig {
  enabled?: boolean;  // Phase 18E: Optional enabled flag (defaults to true)
  duration: number;
  background: {
    type: 'solid' | 'gradient' | 'animated-gradient' | 'image';
    color?: string;
    gradient?: {
      colors: string[];
      angle: number;
    };
    imageUrl?: string;
  };
  logo: {
    url: string;
    size: number;
    position: { x: number; y: number };
    animation: 'scale-bounce' | 'fade' | 'slide-up' | 'none';
  };
  tagline?: {
    text: string;
    delay: number;
    animation: 'typewriter' | 'fade' | 'slide-up';
    style: {
      fontSize: number;
      fontFamily: string;
      color: string;
    };
  };
  contact: {
    website?: string;
    phone?: string;
    email?: string;
    delay: number;
    animation: 'stagger' | 'fade' | 'slide-up';
    style: {
      fontSize: number;
      color: string;
    };
  };
  social?: {
    icons: Array<{ platform: string; url: string }>;
    size: number;
    delay: number;
    animation: 'pop' | 'fade' | 'stagger';
  };
  ambientEffect?: {
    type: 'particles' | 'bokeh' | 'none';
    color: string;
    intensity: number;
  };
}

export const DEFAULT_END_CARD_CONFIG: EndCardConfig = {
  enabled: true,
  duration: 5,
  background: {
    type: 'gradient',
    gradient: {
      colors: ['#1a1a2e', '#16213e'],
      angle: 135,
    },
  },
  logo: {
    url: '',
    size: 25,
    position: { x: 50, y: 35 },
    animation: 'scale-bounce',
  },
  contact: {
    delay: 1.5,
    animation: 'stagger',
    style: {
      fontSize: 24,
      color: '#FFFFFF',
    },
  },
  ambientEffect: {
    type: 'particles',
    color: 'rgba(255, 255, 255, 0.5)',
    intensity: 30,
  },
};

export const PINE_HILL_FARM_END_CARD: EndCardConfig = {
  enabled: true,
  duration: 5,
  background: {
    type: 'animated-gradient',
    gradient: {
      colors: ['#1a3a2a', '#0d2818', '#0a1f12'],
      angle: 145,
    },
  },
  logo: {
    url: '',
    size: 28,
    position: { x: 50, y: 32 },
    animation: 'scale-bounce',
  },
  tagline: {
    text: 'Rooted in Nature, Grown with Care',
    delay: 0.8,
    animation: 'typewriter',
    style: {
      fontSize: 28,
      fontFamily: "'Great Vibes', cursive",
      color: '#E8D5B7',
    },
  },
  contact: {
    website: 'www.pinehillfarm.co',
    phone: '(555) 123-4567',
    delay: 1.8,
    animation: 'stagger',
    style: {
      fontSize: 22,
      color: '#FFFFFF',
    },
  },
  social: {
    icons: [
      { platform: 'facebook', url: 'facebook.com/pinehillfarm' },
      { platform: 'instagram', url: 'instagram.com/pinehillfarm' },
    ],
    size: 36,
    delay: 2.5,
    animation: 'pop',
  },
  ambientEffect: {
    type: 'bokeh',
    color: 'rgba(232, 213, 183, 0.3)',
    intensity: 15,
  },
};

export function mergeEndCardConfig(
  base: EndCardConfig,
  overrides: Partial<EndCardConfig>
): EndCardConfig {
  return {
    ...base,
    ...overrides,
    enabled: overrides.enabled ?? base.enabled ?? true,  // Phase 18E: Include enabled
    background: {
      ...base.background,
      ...overrides.background,
    },
    logo: {
      ...base.logo,
      ...overrides.logo,
    },
    contact: {
      ...base.contact,
      ...overrides.contact,
      style: {
        ...base.contact.style,
        ...overrides.contact?.style,
      },
    },
    tagline: overrides.tagline ? {
      ...base.tagline,
      ...overrides.tagline,
      style: {
        ...base.tagline?.style,
        ...overrides.tagline?.style,
      },
    } : base.tagline,
    social: overrides.social ? {
      ...base.social,
      ...overrides.social,
    } : base.social,
    ambientEffect: overrides.ambientEffect ? {
      ...base.ambientEffect,
      ...overrides.ambientEffect,
    } : base.ambientEffect,
  };
}
