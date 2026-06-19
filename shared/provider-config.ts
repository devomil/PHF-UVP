// shared/provider-config.ts - Provider Registry for Selection Logic
//
// This file provides simplified provider information for the video-provider-selector.
// It's used by: video-provider-selector.ts, universal-video-routes.ts, image-provider-selector.ts
//
// RELATED FILES:
// - server/config/video-providers.ts: Detailed provider capabilities (modelId, apiProvider, capabilities object)
// - server/config/ai-video-providers.ts: API-level configuration for actual PiAPI calls
//
// When adding new providers, update BOTH this file AND server/config/video-providers.ts
// to keep them in sync.

export interface MultiImageSupport {
  maxImages: number;
  promptSyntax: string | null;
  hint: string;
}

export interface VoiceCloneSupport {
  maxVoices: number;
  promptSyntax: string | null;
  hint: string;
}

export interface ReferenceAudioSupport {
  promptSyntax: string | null;
  hint: string;
}

export interface CfgControlSupport {
  minCfg: number;
  maxCfg: number;
  defaultCfg: number;
  hint: string;
}

export interface IpAdapterSupport {
  maxAdapters: number;
  promptSyntax: string | null;
  hint: string;
}

export interface VideoProvider {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  costPerSecond: number;
  maxDuration: number;
  strengths: string[];
  weaknesses: string[];
  bestFor: string[];
  family?: string;
  tier?: 'premium' | 'standard' | 'budget';
  specialization?: string;
  specialties?: string[];
  limitations?: string[];
  visualCategory?: string[];
  qualityNotes?: string;
  multiImageSupport?: MultiImageSupport;
  cfgControlSupport?: CfgControlSupport;
  ipAdapterSupport?: IpAdapterSupport;
}

export const VIDEO_PROVIDERS: Record<string, VideoProvider> = {
  // Runway Family
  runway: {
    id: 'runway',
    name: 'runway',
    displayName: 'Runway Gen-3',
    description: 'Cinematic storytelling with dramatic lighting and smooth motion',
    costPerSecond: 0.05,
    maxDuration: 10,
    family: 'runway',
    tier: 'premium',
    strengths: ['Cinematic quality', 'Dramatic lighting', 'Smooth motion', 'Professional grade'],
    weaknesses: ['Higher cost', 'Slower generation'],
    bestFor: ['cinematic', 'dramatic', 'hero-shots', 'product-premium', 'emotional', 'hook', 'cta'],
    specialties: ['Cinematic storytelling', 'Dramatic lighting', 'Professional-grade motion'],
    limitations: ['Higher cost per second', 'Slower generation times', 'Text rendering in video'],
    visualCategory: ['cinematic', 'dramatic', 'hero-shots'],
    qualityNotes: 'Industry-standard cinematic quality with reliable multi-subject scene handling',
  },

  'runway-4.5': {
    id: 'runway-4.5',
    name: 'runway-4.5',
    displayName: 'Runway 4.5',
    description: 'Top-tier photorealism, advanced camera control, best prompt adherence',
    costPerSecond: 0.08,
    maxDuration: 10,
    family: 'runway',
    tier: 'premium',
    strengths: ['Top-tier creative control', 'Photorealistic motion', 'Advanced camera manipulation', 'Best-in-class prompt adherence'],
    weaknesses: ['Highest cost', 'Requires direct API key'],
    bestFor: ['cinematic', 'hero-shots', 'premium-content', 'photorealistic', 'creative-control'],
    specialties: ['Photorealistic motion', 'Advanced camera manipulation', 'Creative direction control'],
    limitations: ['Premium pricing', 'Direct Runway API required'],
    visualCategory: ['cinematic', 'photorealistic', 'premium'],
    qualityNotes: 'Top-tier creative control with photorealistic motion and advanced camera manipulation for premium productions',
  },

  'runway-gen4': {
    id: 'runway-gen4',
    name: 'runway-gen4',
    displayName: 'Runway Gen-4',
    description: 'Advanced motion manipulation and dramatic storytelling',
    costPerSecond: 0.07,
    maxDuration: 10,
    family: 'runway',
    tier: 'premium',
    strengths: ['Advanced creative control', 'Motion manipulation', 'Dramatic storytelling', 'Scene coherence'],
    weaknesses: ['Premium pricing', 'Requires direct API key'],
    bestFor: ['cinematic', 'dramatic', 'storytelling', 'creative', 'hero-shots'],
    specialties: ['Motion manipulation', 'Dramatic storytelling', 'Advanced scene composition'],
    limitations: ['Premium pricing', 'Direct Runway API required'],
    visualCategory: ['cinematic', 'dramatic', 'storytelling'],
    qualityNotes: 'Advanced creative control with superior motion manipulation for dramatic storytelling scenes',
  },

  'runway-gen4-aleph': {
    id: 'runway-gen4-aleph',
    name: 'runway-gen4-aleph',
    displayName: 'Runway Gen-4 Aleph',
    description: 'Creative visual effects, artistic interpretation, superior transitions',
    costPerSecond: 0.075,
    maxDuration: 10,
    family: 'runway',
    tier: 'premium',
    strengths: ['Enhanced Gen-4 capabilities', 'Creative visual effects', 'Superior scene transitions', 'Artistic interpretation'],
    weaknesses: ['Premium pricing', 'Requires direct API key'],
    bestFor: ['cinematic', 'creative', 'artistic', 'visual-effects', 'dramatic'],
    specialties: ['Creative visual effects', 'Artistic scene interpretation', 'Superior transitions'],
    limitations: ['Premium pricing', 'Direct Runway API required'],
    visualCategory: ['cinematic', 'artistic', 'creative'],
    qualityNotes: 'Enhanced Gen-4 variant with superior creative visual effects and artistic scene interpretation',
  },

  'runway-act-two': {
    id: 'runway-act-two',
    name: 'runway-act-two',
    displayName: 'Runway Act Two',
    description: 'Character performance, acting, facial expression, and emotional control',
    costPerSecond: 0.07,
    maxDuration: 10,
    family: 'runway',
    tier: 'premium',
    specialization: 'character-performance',
    strengths: ['Character performance', 'Acting and emotion', 'Facial expression control', 'Emotional storytelling'],
    weaknesses: ['Specialized for character scenes', 'Requires direct API key'],
    bestFor: ['character', 'acting', 'emotional', 'performance', 'dialogue', 'human-subject'],
    specialties: ['Character performance', 'Acting direction', 'Emotional expression control'],
    limitations: ['Best suited for character/people scenes', 'Direct Runway API required'],
    visualCategory: ['human_subjects', 'emotional', 'character-performance'],
    qualityNotes: 'Specialized for character performance and acting with superior facial expression and emotional control',
  },

  // Kling Family
  kling: {
    id: 'kling',
    name: 'kling',
    displayName: 'Kling AI',
    costPerSecond: 0.03,
    maxDuration: 10,
    family: 'kling',
    tier: 'standard',
    strengths: ['Excellent human rendering', 'Natural expressions', 'Good motion physics', 'Cost effective'],
    weaknesses: ['Less cinematic than Runway'],
    bestFor: ['person', 'human-subject', 'face-closeup', 'conversation', 'testimonial', 'lifestyle', 'story'],
    specialties: ['Human subjects', 'Facial expressions', 'Natural movement'],
    limitations: ['Less cinematic feel than premium providers'],
    visualCategory: ['human_subjects', 'lifestyle', 'testimonial'],
    qualityNotes: 'Excellent human rendering with natural expressions at a cost-effective price point',
    multiImageSupport: {
      maxImages: 4,
      promptSyntax: '@image_N',
      hint: 'Use @image_1, @image_2, etc. in your prompt to reference each image. Example: "use @image_1 as start frame, a woman @image_2 is introducing herself"',
    },
  },

  'kling-1.6': {
    id: 'kling-1.6',
    name: 'kling-1.6',
    displayName: 'Kling 1.6',
    costPerSecond: 0.025,
    maxDuration: 10,
    family: 'kling',
    tier: 'budget',
    strengths: ['Good value', 'Reliable', 'Fast generation'],
    weaknesses: ['Older model', 'Less detail'],
    bestFor: ['general', 'lifestyle', 'simple-motion'],
    specialties: ['Budget-friendly generation', 'Reliable output'],
    limitations: ['Older model with less detail', 'Basic motion quality'],
    visualCategory: ['broll', 'lifestyle'],
    qualityNotes: 'Reliable budget option for simple scenes and quick iteration',
    multiImageSupport: {
      maxImages: 4,
      promptSyntax: '@image_N',
      hint: 'Use @image_1, @image_2, etc. in your prompt to reference each image. Example: "use @image_1 as start frame, a woman @image_2 is introducing herself, and use @image_1 as end frame"',
    },
  },

  'kling-2.0': {
    id: 'kling-2.0',
    name: 'kling-2.0',
    displayName: 'Kling 2.0',
    costPerSecond: 0.03,
    maxDuration: 10,
    family: 'kling',
    tier: 'standard',
    strengths: ['Improved motion', 'Better faces', 'Natural movement'],
    weaknesses: ['Moderate cost'],
    bestFor: ['people', 'lifestyle', 'testimonials'],
    specialties: ['Human subjects', 'Natural movement', 'Lifestyle content'],
    limitations: ['Moderate cost for standard tier'],
    visualCategory: ['human_subjects', 'lifestyle'],
    qualityNotes: 'Good balance of quality and cost for people-focused content',
    multiImageSupport: {
        maxImages: 4,
        promptSyntax: '@image_N',
        hint: 'Use @image_1, @image_2, etc. in your prompt to reference each image. Example: "use @image_1 as start frame, a woman @image_2 is introducing herself"',
      },
  },

  'kling-2.1': {
    id: 'kling-2.1',
    name: 'kling-2.1',
    displayName: 'Kling 2.1',
    costPerSecond: 0.035,
    maxDuration: 10,
    family: 'kling',
    tier: 'standard',
    strengths: ['Enhanced realism', 'Better expressions', 'Smooth motion'],
    weaknesses: ['Higher cost than 2.0'],
    bestFor: ['people', 'emotional', 'close-ups'],
    specialties: ['Enhanced realism', 'Emotional expressions', 'Close-up shots'],
    limitations: ['Higher cost than Kling 2.0'],
    visualCategory: ['human_subjects', 'emotional'],
    qualityNotes: 'Enhanced realism with better facial expressions for emotional content',
    multiImageSupport: {
        maxImages: 4,
        promptSyntax: '@image_N',
        hint: 'Use @image_1, @image_2, etc. in your prompt to reference each image. Example: "use @image_1 as start frame, a woman @image_2 is introducing herself"',
      },
  },

  'kling-2.5-turbo': {
    id: 'kling-2.5-turbo',
    name: 'kling-2.5-turbo',
    displayName: 'Kling 2.5 Turbo',
    costPerSecond: 0.04,
    maxDuration: 10,
    family: 'kling',
    tier: 'premium',
    strengths: ['Fast generation', 'High quality', 'Best-in-class motion'],
    weaknesses: ['Premium pricing'],
    bestFor: ['complex-motion', 'action', 'dynamic-scenes'],
    specialties: ['Fast generation', 'Complex motion', 'Dynamic action scenes'],
    limitations: ['Premium pricing tier'],
    visualCategory: ['cinematic', 'action', 'dynamic'],
    qualityNotes: 'Fastest Kling model with premium motion quality for dynamic content',
    multiImageSupport: {
        maxImages: 4,
        promptSyntax: '@image_N',
        hint: 'Use @image_1, @image_2, etc. in your prompt to reference each image. Example: "use @image_1 as start frame, a woman @image_2 is introducing herself"',
      },
  },

  'omni-human-1.5': {
    id: 'omni-human-1.5',
    name: 'omni-human-1.5',
    displayName: 'OmniHuman 1.5',
    costPerSecond: 0.05,
    maxDuration: 30,
    family: 'omni-human',
    tier: 'premium',
    specialization: 'talking-photo',
    strengths: ['Realistic lip-sync', 'Natural head motion', 'Portrait animation', 'Audio-driven'],
    weaknesses: ['Requires audio input', 'Portrait/head-focused'],
    bestFor: ['talking-photo', 'lip-sync', 'portrait-animation', 'family-video', 'avatar'],
    specialties: ['Talking photo from portrait + audio', 'Realistic lip-sync animation', 'Natural facial expression and head movement'],
    limitations: ['Requires both a portrait image and audio file', 'Optimized for face/head shots'],
    visualCategory: ['human_subjects', 'talking-head'],
    qualityNotes: 'Best for animating a still portrait image to lip-sync with speech audio',
  },

  'kling-avatar': {
    id: 'kling-avatar',
    name: 'kling-avatar',
    displayName: 'Kling Avatar',
    costPerSecond: 0.045,
    maxDuration: 60,
    family: 'kling',
    tier: 'premium',
    specialization: 'talking-head',
    strengths: ['Lip sync', 'Long duration', 'Consistent identity'],
    weaknesses: ['Specialized use', 'Less versatile'],
    bestFor: ['talking-head', 'presenter', 'avatar', 'spokesperson'],
    specialties: ['Lip-sync talking heads', 'Consistent character identity', 'Long-form presenter content'],
    limitations: ['Specialized for talking-head use only', 'Less versatile for general scenes'],
    visualCategory: ['human_subjects', 'talking-head'],
    qualityNotes: 'Best for long-form presenter and spokesperson content with native lip-sync',
  },
  omniavatar: {
    id: 'omniavatar',
    name: 'omniavatar',
    displayName: 'OmniAvatar',
    costPerSecond: 0.05,
    maxDuration: 30,
    family: 'omniavatar',
    tier: 'standard',
    specialization: 'avatar',
    strengths: ['Consistent identity', 'Branded spokesperson', 'Expression variety'],
    weaknesses: ['Avatar-focused', 'Less versatile for general scenes'],
    bestFor: ['avatar', 'spokesperson', 'branded-presenter', 'consistent-character'],
    specialties: ['AI avatar generation with consistent identity', 'Branded spokesperson content', 'Presenter animation'],
    limitations: ['Optimized for avatar/spokesperson use cases'],
    visualCategory: ['human_subjects', 'talking-head', 'avatar'],
    qualityNotes: 'Best for branded spokesperson and consistent presenter avatar content',
  },

  'kling-effects': {
    id: 'kling-effects',
    name: 'kling-effects',
    displayName: 'Kling Effects',
    costPerSecond: 0.02,
    maxDuration: 5,
    family: 'kling',
    tier: 'budget',
    specialization: 'effects',
    strengths: ['VFX overlays', 'Fast rendering', 'Low cost'],
    weaknesses: ['Short duration', 'Effects only'],
    bestFor: ['effects', 'transitions', 'overlays', 'particles'],
    specialties: ['VFX overlays', 'Particle effects', 'Visual transitions'],
    limitations: ['Short duration only', 'Effects-only output'],
    visualCategory: ['effects', 'transitions'],
    qualityNotes: 'Budget-friendly VFX and particle effect generation',
  },

  'kling-2.1-master': {
    id: 'kling-2.1-master',
    name: 'kling-2.1-master',
    displayName: 'Kling 2.1 Master',
    costPerSecond: 0.19,
    maxDuration: 10,
    family: 'kling',
    tier: 'premium',
    strengths: ['Premium quality', 'Best faces', 'Cinematic'],
    weaknesses: ['Highest cost'],
    bestFor: ['hero-shots', 'premium-content', 'cinematic'],
    specialties: ['Premium human rendering', 'Cinematic quality faces', 'Hero-shot content'],
    limitations: ['Highest cost in Kling family'],
    visualCategory: ['cinematic', 'human_subjects', 'premium'],
    qualityNotes: 'Premium tier of Kling with maximum quality rendering for hero content',
    multiImageSupport: {
        maxImages: 4,
        promptSyntax: '@image_N',
        hint: 'Use @image_1, @image_2, etc. in your prompt to reference each image. Example: "use @image_1 as start frame, a woman @image_2 is introducing herself"',
      },
    cfgControlSupport: {
      minCfg: 0,
      maxCfg: 1,
      defaultCfg: 0.5,
      hint: 'Use 0.85–0.95 to tighten source-frame fidelity for products/labels; 0.4–0.6 for more creative departure from the reference image.',
    },
  },

  'kling-2.5': {
    id: 'kling-2.5',
    name: 'kling-2.5',
    displayName: 'Kling 2.5',
    costPerSecond: 0.039,
    maxDuration: 10,
    family: 'kling',
    tier: 'standard',
    strengths: ['Great temporal consistency', 'Smooth motion', 'Good value'],
    weaknesses: ['No native audio'],
    bestFor: ['people', 'lifestyle', 'product-demos'],
    specialties: ['Temporal consistency', 'Smooth motion', 'Product demonstrations'],
    limitations: ['No native audio generation'],
    visualCategory: ['human_subjects', 'lifestyle', 'product_reveal'],
    qualityNotes: 'Strong temporal consistency for lifestyle and product demo content',
    multiImageSupport: {
        maxImages: 4,
        promptSyntax: '@image_N',
        hint: 'Use @image_1, @image_2, etc. in your prompt to reference each image. Example: "use @image_1 as start frame, a woman @image_2 is introducing herself"',
      },
  },

  'kling-2.6': {
    id: 'kling-2.6',
    name: 'kling-2.6',
    displayName: 'Kling 2.6',
    description: 'Cinematic, character-consistent, motion-controlled with native audio',
    costPerSecond: 0.039,
    maxDuration: 10,
    family: 'kling',
    tier: 'premium',
    specialization: 'native-audio',
    strengths: ['Native audio generation', 'Voice/SFX/ambient', 'Audio-visual sync', 'Lip sync'],
    weaknesses: ['Newer model'],
    bestFor: ['speaking', 'dialogue', 'sfx-scenes', 'ambient-scenes', 'audio-visual'],
    specialties: ['Native audio generation', 'Lip-sync dialogue', 'Sound effect integration', 'Facial expressions'],
    limitations: ['Newer model with less community testing'],
    visualCategory: ['human_subjects', 'dialogue', 'audio-visual'],
    qualityNotes: 'Best for human subjects with native audio, lip-sync, and sound effect generation',
    multiImageSupport: {
        maxImages: 4,
        promptSyntax: '@image_N',
        hint: 'Use @image_1, @image_2, etc. in your prompt to reference each image. Example: "use @image_1 as start frame, a woman @image_2 is introducing herself"',
      },
  },

  'kling-2.6-pro': {
    id: 'kling-2.6-pro',
    name: 'kling-2.6-pro',
    displayName: 'Kling 2.6 Pro',
    description: 'Premium audio fidelity with broadcast-ready dialogue and visuals',
    costPerSecond: 0.066,
    maxDuration: 10,
    family: 'kling',
    tier: 'premium',
    specialization: 'native-audio',
    strengths: ['Premium audio quality', 'Enhanced fidelity', 'Full audio suite'],
    weaknesses: ['Higher cost'],
    bestFor: ['premium-audio', 'professional', 'high-quality-dialogue'],
    specialties: ['Premium audio fidelity', 'Professional dialogue', 'Broadcast-ready audio-visual'],
    limitations: ['Higher cost for premium audio tier'],
    visualCategory: ['human_subjects', 'professional', 'dialogue'],
    qualityNotes: 'Professional-grade Kling with enhanced audio fidelity for broadcast-ready content',
    multiImageSupport: {
        maxImages: 4,
        promptSyntax: '@image_N',
        hint: 'Use @image_1, @image_2, etc. in your prompt to reference each image. Example: "use @image_1 as start frame, a woman @image_2 is introducing herself"',
      },
    cfgControlSupport: {
      minCfg: 0,
      maxCfg: 1,
      defaultCfg: 0.5,
      hint: 'Use 0.85–0.95 to tighten source-frame fidelity for products/labels; 0.4–0.6 for more creative departure from the reference image.',
    },
  },

  'kling-2.6-motion-control': {
    id: 'kling-2.6-motion-control',
    name: 'kling-2.6-motion-control',
    displayName: 'Kling 2.6 Motion Control',
    costPerSecond: 0.066,
    maxDuration: 30,
    family: 'kling',
    tier: 'premium',
    specialization: 'motion-transfer',
    strengths: ['Motion transfer', 'Long duration (30s)', 'Dance/gestures', 'Hand actions'],
    weaknesses: ['Requires reference video', 'Specialized use'],
    bestFor: ['dance', 'motion-transfer', 'virtual-influencer', 'choreography'],
    specialties: ['Motion transfer from reference', 'Dance choreography', 'Gesture replication'],
    limitations: ['Requires reference video input', 'Specialized motion-transfer use'],
    visualCategory: ['human_subjects', 'dance', 'motion-transfer'],
    qualityNotes: 'Precise motion transfer with long duration support for dance and choreography',
  },

  'kling-2.6-motion-control-pro': {
    id: 'kling-2.6-motion-control-pro',
    name: 'kling-2.6-motion-control-pro',
    displayName: 'Kling 2.6 Motion Control Pro',
    costPerSecond: 0.08,
    maxDuration: 30,
    family: 'kling',
    tier: 'premium',
    specialization: 'motion-transfer',
    strengths: ['Premium motion transfer', 'Complex choreography', 'Best hand rendering'],
    weaknesses: ['Highest cost', 'Requires reference video'],
    bestFor: ['professional-dance', 'complex-motion', 'premium-choreography'],
    specialties: ['Premium motion transfer', 'Complex choreography', 'Best-in-class hand rendering'],
    limitations: ['Highest cost in motion-control family', 'Requires reference video'],
    visualCategory: ['human_subjects', 'dance', 'premium'],
    qualityNotes: 'Premium motion control with best hand rendering for professional choreography',
  },

  // Luma Family
  luma: {
    id: 'luma',
    name: 'luma',
    displayName: 'Luma Dream Machine',
    description: 'Product reveals, smooth 3D transitions, object-focused shots',
    costPerSecond: 0.04,
    maxDuration: 5,
    family: 'luma',
    tier: 'standard',
    strengths: ['Smooth reveals', 'Product animations', 'Clean transitions', '3D-like quality'],
    weaknesses: ['Shorter max duration', 'Less natural for people'],
    bestFor: ['product-reveal', 'product-shot', 'object-focus', 'reveal-animation', 'tech-demo', 'product', 'brand'],
    specialties: ['Product reveals', 'Smooth 3D transitions', 'Object-focused animations', 'Clean product shots'],
    limitations: ['Short max duration (5s)', 'Less natural for human subjects'],
    visualCategory: ['product_reveal', 'object-focus', '3d-transitions'],
    qualityNotes: 'Best for product reveals and smooth 3D transitions with clean, professional aesthetics',
  },

  'luma-dream-machine': {
    id: 'luma-dream-machine',
    name: 'luma-dream-machine',
    displayName: 'Luma Dream Machine',
    costPerSecond: 0.04,
    maxDuration: 5,
    family: 'luma',
    tier: 'standard',
    strengths: ['Smooth reveals', 'Product animations', 'Clean transitions'],
    weaknesses: ['Shorter max duration', 'Less natural for people'],
    bestFor: ['product-reveal', 'product-shot', 'object-focus', 'reveal-animation'],
    specialties: ['Product reveals', 'Smooth 3D transitions', 'Object-focused animations'],
    limitations: ['Short max duration (5s)', 'Less natural for human subjects'],
    visualCategory: ['product_reveal', 'object-focus'],
    qualityNotes: 'Alias for Luma — best for product reveals and object-focused content',
  },

  'runway-gen3': {
    id: 'runway-gen3',
    name: 'runway-gen3',
    displayName: 'Runway Gen-3 Alpha',
    costPerSecond: 0.06,
    maxDuration: 10,
    family: 'runway',
    tier: 'premium',
    strengths: ['Cinematic quality', 'Camera movement', 'Human faces'],
    weaknesses: ['Higher cost', 'Text in video'],
    bestFor: ['cinematic', 'dramatic', 'hero-shots', 'hook', 'cta'],
    specialties: ['Cinematic storytelling', 'Camera movement control', 'Professional production'],
    limitations: ['Higher cost', 'Poor text rendering in video'],
    visualCategory: ['cinematic', 'dramatic'],
    qualityNotes: 'Gen-3 Alpha with industry-standard cinematic quality and camera control',
  },

  // Hailuo Family
  hailuo: {
    id: 'hailuo',
    name: 'hailuo',
    displayName: 'Hailuo MiniMax',
    description: 'Cost-effective b-roll, nature scenes, fast generation',
    costPerSecond: 0.02,
    maxDuration: 6,
    family: 'hailuo',
    tier: 'budget',
    strengths: ['Cost effective', 'Good for B-roll', 'Nature scenes', 'Fast generation'],
    weaknesses: ['Less detailed than premium', 'Simpler motion'],
    bestFor: ['broll', 'b-roll', 'nature', 'landscape', 'ambient', 'background', 'establishing', 'explanation'],
    specialties: ['Cost-effective b-roll', 'Nature and landscape scenes', 'Fast generation times'],
    limitations: ['Less detail than premium providers', 'Simpler motion dynamics'],
    visualCategory: ['broll', 'nature', 'landscape', 'ambient'],
    qualityNotes: 'Cost-effective choice for b-roll, nature scenes, and fast content generation',
  },

  'hailuo-minimax': {
    id: 'hailuo-minimax',
    name: 'hailuo-minimax',
    displayName: 'Hailuo MiniMax',
    costPerSecond: 0.015,
    maxDuration: 6,
    family: 'hailuo',
    tier: 'budget',
    strengths: ['Cost effective', 'B-roll', 'Nature scenes', 'Fast generation'],
    weaknesses: ['Less detailed than premium', 'Simpler motion'],
    bestFor: ['broll', 'b-roll', 'nature', 'landscape', 'ambient', 'background'],
    specialties: ['Budget b-roll', 'Nature scenes', 'High-volume generation'],
    limitations: ['Less detail than premium', 'Simple motion only'],
    visualCategory: ['broll', 'nature'],
    qualityNotes: 'Budget-friendly alias for Hailuo — best for high-volume b-roll content',
  },

  // Hunyuan
  hunyuan: {
    id: 'hunyuan',
    name: 'hunyuan',
    displayName: 'Hunyuan',
    costPerSecond: 0.025,
    maxDuration: 5,
    family: 'hunyuan',
    tier: 'budget',
    strengths: ['Good for nature', 'Abstract scenes', 'Cost effective'],
    weaknesses: ['Limited duration', 'Less versatile'],
    bestFor: ['broll', 'nature', 'abstract', 'supplementary'],
    specialties: ['Complex nature scenes', 'Abstract visuals', 'Multi-element compositions'],
    limitations: ['Limited duration (5s)', 'Less versatile for general use'],
    visualCategory: ['nature', 'abstract', 'broll'],
    qualityNotes: 'Strong at generating complex nature scenes and abstract visuals at budget pricing',
  },

  // Veo Family (Google)
  veo: {
    id: 'veo',
    name: 'veo',
    displayName: 'Veo',
    costPerSecond: 0.06,
    maxDuration: 8,
    family: 'veo',
    tier: 'premium',
    strengths: ['High quality output', 'Cinematic results', 'Good motion'],
    weaknesses: ['Higher cost'],
    bestFor: ['cinematic', 'high-quality', 'dramatic', 'hook'],
    specialties: ['Cinematic quality', 'Native audio generation', 'Advanced physics simulation'],
    limitations: ['Premium pricing'],
    visualCategory: ['cinematic', 'dramatic', 'premium'],
    qualityNotes: 'Google DeepMind premium model with native audio and cinematic output',
  },

  'veo-2': {
    id: 'veo-2',
    name: 'veo-2',
    displayName: 'Veo 2',
    costPerSecond: 0.055,
    maxDuration: 8,
    family: 'veo',
    tier: 'premium',
    strengths: ['Cinematic quality', 'Good motion', 'Reliable'],
    weaknesses: ['Premium pricing'],
    bestFor: ['cinematic', 'dramatic', 'professional'],
    specialties: ['Cinematic quality', 'Reliable output', 'Environmental audio'],
    limitations: ['Premium pricing'],
    visualCategory: ['cinematic', 'dramatic'],
    qualityNotes: 'Reliable premium model with enhanced visual coherence and realistic physics',
  },

  'veo-3.1': {
    id: 'veo-3.1',
    name: 'veo-3.1',
    displayName: 'Veo 3.1',
    description: '4K cinematic quality with advanced physics and native audio/dialogue',
    costPerSecond: 0.065,
    maxDuration: 8,
    family: 'veo',
    tier: 'premium',
    strengths: ['Latest model', 'Best quality', 'Advanced physics'],
    weaknesses: ['Highest cost'],
    bestFor: ['hero-shots', 'cinematic', 'premium-content'],
    specialties: ['4K cinematic quality', 'Advanced physics simulation', 'Native audio and dialogue', 'Immersive soundscapes'],
    limitations: ['Highest cost per second', 'Premium-only use cases'],
    visualCategory: ['cinematic', 'premium', '4k'],
    qualityNotes: 'Premium cinematic with 4K quality, advanced physics, and native audio/dialogue generation',
  },

  // Wan Family (Alibaba)
  'wan-2.1': {
    id: 'wan-2.1',
    name: 'wan-2.1',
    displayName: 'Wan 2.1',
    costPerSecond: 0.025,
    maxDuration: 5,
    family: 'wan',
    tier: 'budget',
    strengths: ['Fast generation', 'Cost effective', 'Reliable'],
    weaknesses: ['Shorter duration', 'Basic motion'],
    bestFor: ['broll', 'simple-scenes', 'quick-generation'],
    specialties: ['Text rendering in video', 'Character consistency', 'Budget-friendly generation'],
    limitations: ['Short duration (5s)', 'Basic motion quality'],
    visualCategory: ['broll', 'text-content', 'conceptual_explanatory'],
    qualityNotes: 'Budget-friendly with excellent text rendering — good for branded content and conceptual scenes',
  },

  'wan-2.6': {
    id: 'wan-2.6',
    name: 'wan-2.6',
    displayName: 'Wan 2.6',
    description: 'Text rendering, character consistency, conceptual visuals',
    costPerSecond: 0.03,
    maxDuration: 5,
    family: 'wan',
    tier: 'standard',
    strengths: ['Improved quality', 'Better motion', 'Good value'],
    weaknesses: ['Short duration'],
    bestFor: ['lifestyle', 'nature', 'products'],
    specialties: ['Text rendering', 'Character consistency', 'Improved visual quality'],
    limitations: ['Short duration (5s)'],
    visualCategory: ['lifestyle', 'text-content', 'conceptual_explanatory'],
    qualityNotes: 'Improved Wan model with better motion and text rendering for branded and conceptual content',
  },

  // Sora Family (OpenAI)
  'sora-2': {
    id: 'sora-2',
    name: 'sora-2',
    displayName: 'Sora 2',
    description: 'Consistent visual style with strong prompt understanding',
    costPerSecond: 0.06,
    maxDuration: 10,
    family: 'sora',
    tier: 'premium',
    strengths: ['High-quality T2V', 'Consistent style', 'Strong prompt understanding', 'Versatile'],
    weaknesses: ['Premium pricing', 'Limited availability'],
    bestFor: ['cinematic', 'general', 'storytelling', 'consistent-style'],
    specialties: ['High-quality text-to-video', 'Consistent visual style', 'Strong prompt comprehension'],
    limitations: ['Premium pricing', 'May have limited API availability'],
    visualCategory: ['cinematic', 'general', 'storytelling'],
    qualityNotes: 'High-quality general T2V with consistent style and strong prompt understanding',
  },
  'sora-2-pro': {
    id: 'sora-2-pro',
    name: 'sora-2-pro',
    displayName: 'Sora 2 Pro',
    description: 'Premium OpenAI Sora 2 with enhanced fidelity and top-tier cinematic output',
    costPerSecond: 0.10,
    maxDuration: 10,
    family: 'sora',
    tier: 'ultra',
    strengths: ['Ultra-high fidelity', 'Hero content quality', 'Premium cinematic output', 'Strong prompt adherence'],
    weaknesses: ['Highest cost tier', 'Limited availability'],
    bestFor: ['hero-content', 'cinematic', 'premium', 'broadcast'],
    specialties: ['Premium cinematic output', 'Ultra-high fidelity rendering', 'Hero and flagship content'],
    limitations: ['Highest cost tier', 'May have limited API availability'],
    visualCategory: ['cinematic', 'premium', 'hero'],
    qualityNotes: 'Premium Sora 2 tier — maximum fidelity for hero content and flagship productions',
  },

  // Pika
  pika: {
    id: 'pika',
    name: 'pika',
    displayName: 'Pika',
    costPerSecond: 0.035,
    maxDuration: 5,
    family: 'pika',
    tier: 'standard',
    strengths: ['Artistic stylization', 'Bold visual effects', 'Creative interpretation'],
    weaknesses: ['Short duration', 'Less photorealistic'],
    bestFor: ['artistic', 'stylized', 'creative', 'visual-effects'],
    specialties: ['Artistic stylization', 'Bold visual effects', 'Creative prompt interpretation'],
    limitations: ['Short duration (5s)', 'Less photorealistic output'],
    visualCategory: ['artistic', 'creative', 'stylized'],
    qualityNotes: 'Known for artistic stylization and bold visual effects with creative prompt interpretation',
  },

  // Seedance
  'seedance-1.0': {
    id: 'seedance-1.0',
    name: 'seedance-1.0',
    displayName: 'Seedance 1.0',
    costPerSecond: 0.035,
    maxDuration: 5,
    family: 'seedance',
    tier: 'standard',
    specialization: 'dance',
    strengths: ['Dance motion', 'Character animation', 'Expressive'],
    weaknesses: ['Specialized', 'Short duration'],
    bestFor: ['dance', 'character', 'expressive-motion'],
    specialties: ['Dance and rhythmic motion', 'Fluid body movement', 'Choreography generation'],
    limitations: ['Specialized for dance/rhythm only', 'Short duration (5s)'],
    visualCategory: ['dance', 'human_subjects', 'rhythmic'],
    qualityNotes: 'Specialized for dance and rhythmic motion with fluid body movement generation',
  },
  'seedance-2.0': {
    id: 'seedance-2.0',
    name: 'seedance-2.0',
    displayName: 'Seedance 2',
    costPerSecond: 0.035,
    maxDuration: 15,
    family: 'seedance',
    tier: 'standard',
    specialization: 'general',
    strengths: ['Multi-image references', 'Morphing effects', '1080p output', '15s duration', 'Primary provider'],
    weaknesses: [],
    bestFor: ['general', 'character', 'morphing', 'multi-subject', 'cinematic'],
    specialties: ['Multi-image @imageN references', 'Image morphing transitions', 'General video generation'],
    limitations: ['Peak hours (09:00-15:00 GMT) may have longer queue times'],
    visualCategory: ['general', 'human_subjects', 'cinematic'],
    qualityNotes: 'GA Seedance 2 — primary provider with 1080p output, 15s max duration, multi-image references and morphing via @imageN syntax',
    multiImageSupport: {
      maxImages: 4,
      promptSyntax: '@imageN',
      hint: 'Use @image1, @image2, etc. in your prompt to reference each image. Example: "@image1 transforms into @image2" for morphing effects.',
    },
  },
  'seedance-2.0-fast': {
    id: 'seedance-2.0-fast',
    name: 'seedance-2.0-fast',
    displayName: 'Seedance 2 Fast',
    costPerSecond: 0.020,
    maxDuration: 15,
    family: 'seedance',
    tier: 'budget',
    specialization: 'general',
    strengths: ['Fast generation', 'Multi-image references', 'Budget-friendly', '1080p output', '15s duration'],
    weaknesses: ['Lower quality than standard'],
    bestFor: ['general', 'fast-iteration', 'draft', 'social'],
    specialties: ['Quick generation', 'Multi-image @imageN references', 'Image morphing transitions'],
    limitations: ['Fast variant — lower quality than Seedance 2 standard'],
    visualCategory: ['general', 'human_subjects'],
    qualityNotes: 'GA Seedance 2 Fast — budget-friendly with 1080p output, 15s max, multi-image support',
    multiImageSupport: {
      maxImages: 4,
      promptSyntax: '@imageN',
      hint: 'Use @image1, @image2, etc. in your prompt to reference each image. Example: "@image1 transforms into @image2" for morphing effects.',
    },
  },

  // Remotion (Motion Graphics)
  'remotion-motion-graphics': {
    id: 'remotion-motion-graphics',
    name: 'remotion-motion-graphics',
    displayName: 'Remotion (Motion Graphics)',
    costPerSecond: 0.001,
    maxDuration: 60,
    family: 'remotion',
    tier: 'budget',
    specialization: 'motion-graphics',
    strengths: ['Free/cheap', 'Programmatic', 'Consistent', 'No AI artifacts'],
    weaknesses: ['Template-based', 'Less organic'],
    bestFor: ['text-animations', 'charts', 'infographics', 'lower-thirds', 'cta-overlays'],
    specialties: ['Infographic animations', 'Data visualization', 'Text overlays', 'Chart animations', 'Programmatic motion'],
    limitations: ['Template-based output', 'Less organic/natural feel', 'Requires pre-built components'],
    visualCategory: ['infographic_diagram', 'motion_graphics', 'text-animation'],
    qualityNotes: 'Programmatic motion graphics with zero AI artifacts — ideal for infographics, charts, and data visualization',
  },
};

export interface ImageProvider {
  id: string;
  name: string;
  displayName: string;
  costPerImage: number;
  strengths: string[];
  bestFor: string[];
  multiImageSupport?: MultiImageSupport;
  cfgControlSupport?: CfgControlSupport;
  ipAdapterSupport?: IpAdapterSupport;
}

export const IMAGE_PROVIDERS: Record<string, ImageProvider> = {
  flux: {
    id: 'flux',
    name: 'flux',
    displayName: 'Flux.1',
    costPerImage: 0.03,
    strengths: ['Product shots', 'Clean compositions', 'Commercial quality'],
    bestFor: ['product', 'food', 'object', 'still-life'],
    multiImageSupport: {
      maxImages: 4,
      promptSyntax: '@imageN',
      hint: 'Upload up to 4 reference images and tag them as @image1, @image2, … in your prompt. Flux blends their style, composition, and content to guide the generated image.',
    },
    ipAdapterSupport: {
      maxAdapters: 1,
      promptSyntax: '@ipRef',
      hint: 'Upload a style or content reference image and tag it as @ipRef in your prompt to guide the visual style, color palette, and composition of the generated image.',
    },
  },

  'flux-1-dev': {
    id: 'flux-1-dev',
    name: 'flux-1-dev',
    displayName: 'Flux.1 Dev',
    costPerImage: 0.025,
    strengths: ['Development version', 'Experimental features'],
    bestFor: ['testing', 'experimental'],
    multiImageSupport: {
      maxImages: 4,
      promptSyntax: '@imageN',
      hint: 'Upload up to 4 reference images and tag them as @image1, @image2, … in your prompt. Flux Dev uses them as style and content references for image generation.',
    },
    ipAdapterSupport: {
      maxAdapters: 1,
      promptSyntax: '@ipRef',
      hint: 'Upload a style or content reference image and tag it as @ipRef in your prompt to guide the visual style, color palette, and composition of the generated image.',
    },
  },

  falai: {
    id: 'falai',
    name: 'fal.ai',
    displayName: 'fal.ai',
    costPerImage: 0.02,
    strengths: ['Lifestyle images', 'Natural feel', 'People'],
    bestFor: ['lifestyle', 'person', 'scene', 'environment'],
    multiImageSupport: {
      maxImages: 4,
      promptSyntax: '@imageN',
      hint: 'Upload up to 4 reference images and tag them as @image1, @image2, … in your prompt. fal.ai uses them as visual references to guide style, subject, and composition.',
    },
  },

  'stable-diffusion-3': {
    id: 'stable-diffusion-3',
    name: 'stable-diffusion-3',
    displayName: 'Stable Diffusion 3',
    costPerImage: 0.02,
    strengths: ['Versatile', 'Good text rendering', 'Fast'],
    bestFor: ['general', 'text-in-image', 'artistic'],
  },

  midjourney: {
    id: 'midjourney',
    name: 'midjourney',
    displayName: 'Midjourney',
    costPerImage: 0.05,
    strengths: ['Artistic excellence', 'Premium aesthetics', 'Creative compositions', 'Photorealistic'],
    bestFor: ['hero-shots', 'artistic', 'premium-content', 'lifestyle', 'cinematic'],
    multiImageSupport: {
      maxImages: 5,
      promptSyntax: '@imageN',
      hint: 'Upload up to 5 reference images and tag them as @image1, @image2, … in your prompt. Midjourney blends their style, composition, and content to guide the generated image.',
    },
  },

  ideogram: {
    id: 'ideogram',
    name: 'ideogram',
    displayName: 'Ideogram',
    costPerImage: 0.04,
    strengths: ['Best-in-class text rendering', 'Marketing materials', 'Social graphics', 'Readable text overlays'],
    bestFor: ['text-in-image', 'marketing', 'social-graphics', 'product-labels', 'infographic'],
  },

  'nano-banana-pro': {
    id: 'nano-banana-pro',
    name: 'nano-banana-pro',
    displayName: 'Nano Banana Pro',
    costPerImage: 0.04,
    strengths: ['Photorealistic output', 'Natural scenes', 'People and lifestyle', 'Organic quality'],
    bestFor: ['lifestyle', 'person', 'photorealistic', 'product', 'natural-scene'],
  },
};

export interface SoundProvider {
  id: string;
  name: string;
  displayName: string;
  type: 'voiceover' | 'music' | 'sfx';
  costPerSecond?: number;
  costPerTrack?: number;
  costPerEffect?: number;
  multiImageSupport?: MultiImageSupport;
  voiceCloneSupport?: VoiceCloneSupport;
  referenceAudioSupport?: ReferenceAudioSupport;
}

export const SOUND_PROVIDERS: Record<string, SoundProvider> = {
  elevenlabs: {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    displayName: 'ElevenLabs',
    type: 'voiceover',
    costPerSecond: 0.015,
  },

  udio: {
    id: 'udio',
    name: 'Udio',
    displayName: 'Udio AI (via PiAPI)',
    type: 'music',
    costPerTrack: 0.10,
  },

  kling_sound: {
    id: 'kling_sound',
    name: 'Kling Sound',
    displayName: 'Kling Sound',
    type: 'sfx',
    costPerEffect: 0.01,
  },

  elevenlabs_sfx: {
    id: 'elevenlabs_sfx',
    name: 'ElevenLabs SFX',
    displayName: 'ElevenLabs Sound Effects',
    type: 'sfx',
    costPerEffect: 0.02,
  },

  playht: {
    id: 'playht',
    name: 'PlayHT',
    displayName: 'Play.ht Voice Cloning',
    type: 'voiceover',
    costPerSecond: 0.02,
    voiceCloneSupport: {
      maxVoices: 5,
      promptSyntax: '@voice',
      hint: 'Upload a short audio sample (≥10 s) to clone a voice; reference it with @voice1, @voice2, … in the voiceover prompt.',
    },
    referenceAudioSupport: {
      promptSyntax: '@refAudio',
      hint: 'Attach a reference audio file so Play.ht matches its speaking style, pace, and tone in the generated voiceover.',
    },
  },
};

export function getVideoProvider(id: string): VideoProvider | undefined {
  return VIDEO_PROVIDERS[id];
}

export function getAllVideoProviders(): VideoProvider[] {
  return Object.values(VIDEO_PROVIDERS);
}

export function getVideoProvidersByFamily(family: string): VideoProvider[] {
  return Object.values(VIDEO_PROVIDERS).filter(p => p.family === family);
}

export function getVideoProviderFamilies(): string[] {
  const families = new Set<string>();
  Object.values(VIDEO_PROVIDERS).forEach(p => {
    if (p.family) families.add(p.family);
  });
  return Array.from(families);
}

export function getImageProvider(id: string): ImageProvider | undefined {
  return IMAGE_PROVIDERS[id];
}

export function getAllImageProviders(): ImageProvider[] {
  return Object.values(IMAGE_PROVIDERS);
}

export function getSoundProvider(id: string): SoundProvider | undefined {
  return SOUND_PROVIDERS[id];
}

export function getVoiceCloneSupport(providerId: string): VoiceCloneSupport | null {
  const provider = SOUND_PROVIDERS[providerId];
  return provider?.voiceCloneSupport || null;
}

export function getReferenceAudioSupport(providerId: string): ReferenceAudioSupport | null {
  const provider = SOUND_PROVIDERS[providerId];
  return provider?.referenceAudioSupport || null;
}

export function getMultiImageSupport(providerId: string): MultiImageSupport | null {
  const vprovider = VIDEO_PROVIDERS[providerId];
  if (vprovider?.multiImageSupport) return vprovider.multiImageSupport;
  const iprovider = IMAGE_PROVIDERS[providerId];
  return iprovider?.multiImageSupport ?? null;
}

export function getCfgControlSupport(providerId: string): CfgControlSupport | null {
  const vprovider = VIDEO_PROVIDERS[providerId];
  if (vprovider?.cfgControlSupport) return vprovider.cfgControlSupport;
  const iprovider = IMAGE_PROVIDERS[providerId];
  return iprovider?.cfgControlSupport ?? null;
}

export function getIpAdapterSupport(providerId: string): IpAdapterSupport | null {
  const iprovider = IMAGE_PROVIDERS[providerId];
  if (iprovider?.ipAdapterSupport) return iprovider.ipAdapterSupport;
  const vprovider = VIDEO_PROVIDERS[providerId];
  return vprovider?.ipAdapterSupport ?? null;
}

export function getMultiImageHint(providerId: string, imageCount: number): string {
  const support = getMultiImageSupport(providerId);
  if (!support) {
    if (imageCount > 0) {
      return 'This provider uses image #1 as the starting frame for animation. Additional images are ignored.';
    }
    return '';
  }
  return support.hint;
}
