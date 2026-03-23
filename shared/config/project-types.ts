export interface ProjectTypeConfig {
  id: string;
  label: string;
  subtitle: string;
  platform: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  defaultDuration: number;
  durationRange: [number, number];
  qualityTier: 'ultra' | 'premium' | 'standard';
  sceneTypeBiases: string[];
  microSceneCountHint: number;
  promptHints: string;
}

export const PROJECT_TYPES: Record<string, ProjectTypeConfig> = {
  'tiktok-reels': {
    id: 'tiktok-reels',
    label: 'TikTok / Reels',
    subtitle: '9:16 · 15-30s · Vertical',
    platform: 'TikTok',
    aspectRatio: '9:16',
    defaultDuration: 30,
    durationRange: [15, 30],
    qualityTier: 'premium',
    sceneTypeBiases: ['hook', 'benefit', 'cta'],
    microSceneCountHint: 2,
    promptHints: 'Short-form vertical content. Open with a strong hook in the first 2 seconds. Fast-paced cuts. Every scene must deliver value immediately. End with a clear, punchy CTA.',
  },
  'youtube-short': {
    id: 'youtube-short',
    label: 'YouTube Short',
    subtitle: '9:16 · 60s',
    platform: 'YouTube',
    aspectRatio: '9:16',
    defaultDuration: 60,
    durationRange: [30, 60],
    qualityTier: 'premium',
    sceneTypeBiases: ['hook', 'problem', 'solution', 'cta'],
    microSceneCountHint: 2,
    promptHints: 'YouTube Shorts format (60s max). Start with an attention-grabbing hook. Build a mini story arc: problem → solution → payoff. Keep energy high throughout.',
  },
  'youtube-ad': {
    id: 'youtube-ad',
    label: 'YouTube Ad',
    subtitle: '16:9 · 30-60s',
    platform: 'YouTube',
    aspectRatio: '16:9',
    defaultDuration: 30,
    durationRange: [30, 60],
    qualityTier: 'premium',
    sceneTypeBiases: ['hook', 'problem', 'solution', 'benefit', 'cta'],
    microSceneCountHint: 2,
    promptHints: 'YouTube pre-roll/mid-roll ad format. The first 5 seconds are critical — viewer can skip after that. Front-load the hook. Cinematic widescreen framing. Professional production quality.',
  },
  'facebook-feed': {
    id: 'facebook-feed',
    label: 'Facebook Feed',
    subtitle: '1:1 · 15-30s',
    platform: 'Facebook',
    aspectRatio: '1:1',
    defaultDuration: 15,
    durationRange: [15, 30],
    qualityTier: 'premium',
    sceneTypeBiases: ['hook', 'benefit', 'cta'],
    microSceneCountHint: 2,
    promptHints: 'Facebook feed square format. Designed for autoplay with sound off — visual storytelling is paramount. Bold text overlays for key messages. Concise and punchy.',
  },
  'product-launch': {
    id: 'product-launch',
    label: 'Standard Product Launch',
    subtitle: '16:9 · 90s',
    platform: 'YouTube',
    aspectRatio: '16:9',
    defaultDuration: 90,
    durationRange: [60, 120],
    qualityTier: 'premium',
    sceneTypeBiases: ['hook', 'problem', 'solution', 'feature', 'benefit', 'testimonial', 'cta'],
    microSceneCountHint: 3,
    promptHints: 'Product launch video. Build anticipation with a problem/pain scene, reveal the product as the solution, highlight 2-3 key features with benefit framing, include social proof if available, and close with a strong purchase CTA.',
  },
  'educational': {
    id: 'educational',
    label: 'Educational / Training',
    subtitle: '16:9 · 2-5 min · Structured',
    platform: 'YouTube',
    aspectRatio: '16:9',
    defaultDuration: 180,
    durationRange: [120, 300],
    qualityTier: 'premium',
    sceneTypeBiases: ['hook', 'explanation', 'feature', 'benefit', 'proof', 'cta'],
    microSceneCountHint: 4,
    promptHints: 'Educational/training video. Use clear section headers and numbered frameworks. Follow a concept-then-example structure. Include on-screen text overlays for key stats, frameworks, and numbered lists. Vary pacing between dense information and visual breathers.',
  },
  'long-story': {
    id: 'long-story',
    label: 'Long Story / Deep Dive',
    subtitle: '16:9 · 5-10 min',
    platform: 'YouTube',
    aspectRatio: '16:9',
    defaultDuration: 300,
    durationRange: [300, 600],
    qualityTier: 'standard',
    sceneTypeBiases: ['hook', 'story', 'explanation', 'feature', 'benefit', 'proof', 'testimonial', 'cta'],
    microSceneCountHint: 3,
    promptHints: 'Long-form deep dive video. Maintain a consistent narrative voice throughout. Structure content into clear chapters. Each chapter should end with a bridge sentence leading to the next. Vary scene pacing — faster cuts for lists/frameworks, slower for emotional or conceptual moments.',
  },
};

export type ProjectTypeId = keyof typeof PROJECT_TYPES;

export interface ContentStructureConfig {
  id: string;
  label: string;
  defaultArtPreset: string;
}

export const CONTENT_STRUCTURES: ContentStructureConfig[] = [
  { id: 'tutorial', label: 'Tutorial', defaultArtPreset: '3d-illustration' },
  { id: 'explainer', label: 'Explainer', defaultArtPreset: '2d-line-art' },
  { id: 'how-to', label: 'How-To', defaultArtPreset: '3d-illustration' },
  { id: 'product-education', label: 'Product Education', defaultArtPreset: '3d-illustration' },
  { id: 'health-wellness', label: 'Health & Wellness', defaultArtPreset: 'scientific-medical' },
];

export function getProjectType(id: string): ProjectTypeConfig | null {
  return PROJECT_TYPES[id] || null;
}

export function getAllProjectTypes(): ProjectTypeConfig[] {
  return Object.values(PROJECT_TYPES);
}

export function getContentStructure(id: string): ContentStructureConfig | null {
  return CONTENT_STRUCTURES.find(cs => cs.id === id) || null;
}
