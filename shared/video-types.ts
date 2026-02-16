export interface VideoProject {
  id: string;
  type: 'product' | 'script-based';
  title: string;
  description: string;
  targetAudience?: string;
  totalDuration: number;
  fps: 30;
  outputFormat: OutputFormat;
  brand: BrandSettings;
  scenes: Scene[];
  assets: GeneratedAssets;
  status: VideoProjectStatus;
  progress: ProductionProgress;
  createdAt: string;
  updatedAt: string;
  voiceId?: string;
  voiceName?: string;
  regenerationHistory?: RegenerationRecord[];
  history?: ProjectHistory;
  qualityTier?: 'ultra' | 'premium' | 'standard';
  mediaMode?: 'image' | 'video';
}

export type VideoProjectStatus = 'draft' | 'queued' | 'generating' | 'ready' | 'render_queued' | 'rendering' | 'lambda_pending' | 'complete' | 'error';

export interface OutputFormat {
  aspectRatio: '16:9' | '9:16' | '1:1';
  resolution: { width: number; height: number };
  platform: 'youtube' | 'tiktok' | 'instagram' | 'instagram-reels' | 'facebook' | 'website';
}

export interface BrandSettings {
  name: string;
  logoUrl: string;
  watermarkPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  watermarkOpacity: number;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    textLight: string;
  };
  fonts: {
    heading: string;
    body: string;
    weight: {
      heading: 600 | 700 | 800;
      body: 400 | 500;
    };
  };
  // Phase 5A: UI-configurable brand element toggles
  includeIntroLogo?: boolean;
  includeWatermark?: boolean;
  includeCTAOutro?: boolean;
}

// Phase 13: Audio Generation Settings for Kling 2.6+
export interface AudioGenerationSettings {
  enabled: boolean;
  voiceGeneration: boolean;
  soundEffects: boolean;
  ambientSound: boolean;
  language?: string;
}

// Phase 13: Motion Control Settings for Kling 2.6 Motion Control
export interface MotionControlSettings {
  enabled: boolean;
  referenceVideoUrl?: string;
  referenceVideoDuration?: number;
}

// Phase 13: Combined Generation Settings
export interface GenerationSettings {
  audio?: AudioGenerationSettings;
  motionControl?: MotionControlSettings;
  preferredProvider?: string;
}

// Phase 13D: Reference Image Configuration
export type ReferenceMode = 'none' | 'image-to-image' | 'image-to-video' | 'style-reference';
export type ReferenceSourceType = 'upload' | 'current-media' | 'asset-library' | 'brand-media';

export interface ImageToImageSettings {
  strength: number;           // 0-1, how much to change from reference
  preserveComposition: boolean;
  preserveColors: boolean;
}

export interface ImageToVideoSettings {
  motionStrength: number;     // 0-1, amount of motion
  motionType: 'environmental' | 'subtle' | 'dynamic';
  preserveSubject: boolean;
}

export interface StyleReferenceSettings {
  styleStrength: number;      // 0-1, how much to apply style
  applyColors: boolean;
  applyLighting: boolean;
  applyComposition: boolean;
}

export interface ReferenceConfig {
  mode: ReferenceMode;
  sourceUrl?: string;
  sourceType: ReferenceSourceType;
  i2iSettings?: ImageToImageSettings;
  i2vSettings?: ImageToVideoSettings;
  styleSettings?: StyleReferenceSettings;
}

// Phase 13D: Regeneration Options
export type RegenerateMode = 'standard' | 'with-reference' | 'simplified-prompt' | 'different-provider' | 'stock-search';

export interface RegenerateOptions {
  mode: RegenerateMode;
  referenceUrl?: string;
  newPrompt?: string;
  newProvider?: string;
}

export interface PromptComplexityAnalysis {
  category: 'simple' | 'moderate' | 'complex' | 'impossible';
  warning?: string;
  simplifiedPrompt?: string;
}

// Phase 11D: Animation settings for brand media/static images
export type AnimationType = 'ken-burns' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'static';
export type AnimationIntensity = 'subtle' | 'medium' | 'dramatic';

export interface AnimationSettings {
  type: AnimationType;
  intensity: AnimationIntensity;
  focusPoint?: { x: number; y: number }; // 0-100 percentage for Ken Burns focus
}

// Phase 11D: Video settings for brand media videos
export interface VideoSettings {
  trimStart?: number; // Seconds to skip at start
  trimEnd?: number; // Seconds to cut from end
  loop: boolean; // Loop if shorter than scene duration
  playbackRate: number; // 0.5 = slow mo, 1.0 = normal, 2.0 = speed up
}

export interface Scene {
  id: string;
  order: number;
  type: SceneType;
  duration: number;
  narration: string;
  visualDirection?: string;
  qualityTier?: 'standard' | 'premium' | 'ultra'; // Per-scene quality tier override
  searchQuery?: string;
  fallbackQuery?: string;
  textOverlays: TextOverlay[];
  background: BackgroundConfig;
  transitionIn: TransitionConfig;
  transitionOut: TransitionConfig;
  assets?: SceneAssets;
  soundDesign?: SceneSoundDesign;
  serviceMatch?: string | null;
  productMatch?: string | null;
  conditionMatch?: string | null;
  audienceResonance?: string | null;
  brandOpportunity?: string | null;
  // Phase 8A: Scene analysis results
  analysisResult?: Phase8AnalysisResult;
  qualityScore?: number;
  // Phase 11A: Extracted overlay information from prompt sanitization
  extractedOverlayText?: string[];
  extractedLogos?: string[];
  overlayConfig?: {
    autoGenerateTextOverlays?: boolean;
    logoPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    logoSize?: number;
    includeWatermark?: boolean;
  };
  // Phase 11D: Brand media source and animation settings
  mediaSource?: 'ai' | 'brand' | 'custom';
  brandAssetId?: number;
  brandAssetUrl?: string;
  brandAssetType?: 'image' | 'video';
  animationSettings?: AnimationSettings;
  videoSettings?: VideoSettings;
  // Phase 13: Audio and motion control settings
  audioSettings?: AudioGenerationSettings;
  motionControlSettings?: MotionControlSettings;
  // Phase 13D: Reference image configuration
  referenceConfig?: ReferenceConfig;
  // Phase 14A: Brand requirement analysis results
  brandAnalysis?: {
    confidence: number;
    sceneType: 'product-hero' | 'product-in-context' | 'branded-environment' | 'standard';
    productVisibility: 'featured' | 'prominent' | 'visible' | 'background';
    logoRequired: boolean;
    matchedProductCount: number;
    matchedLogoCount: number;
  };
  // Phase 15H: Workflow override - allows disabling brand asset matching per scene
  useBrandAssets?: boolean;
  // Phase 15H: Generation method tracking - what method was used to generate the media
  generationMethod?: 'T2I' | 'I2I' | 'T2V' | 'I2V' | 'V2V' | 'stock';
  // Phase 16: Pipeline intermediate results for step-by-step execution
  pipelineIntermediates?: {
    environmentImage?: string;
    composedImage?: string;
    preLogoVideo?: string;
  };
}

// Phase 8A: Scene analysis types
export interface Phase8AnalysisIssue {
  category: 'content_match' | 'ai_artifacts' | 'brand_compliance' | 'technical' | 'composition';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  suggestion: string;
}

export interface Phase8AnalysisResult {
  sceneIndex: number;
  overallScore: number;
  technicalScore: number;
  contentMatchScore: number;
  brandComplianceScore: number;
  compositionScore: number;
  aiArtifactsDetected: boolean;
  aiArtifactDetails: string[];
  contentMatchDetails: string;
  brandComplianceDetails: string;
  frameAnalysis: {
    subjectPosition: 'left' | 'center' | 'right' | 'none';
    faceDetected: boolean;
    faceRegion?: { x: number; y: number; width: number; height: number };
    busyRegions: string[];
    dominantColors: string[];
    lightingType: 'warm' | 'cool' | 'neutral' | 'mixed';
    safeTextZones: Array<{ position: string; confidence: number }>;
  };
  issues: Phase8AnalysisIssue[];
  recommendation: 'approved' | 'needs_review' | 'regenerate' | 'critical_fail';
  improvedPrompt?: string;
  analysisTimestamp: string;
  analysisModel: string;
}

export interface SceneSoundDesign {
  sceneId: string;
  transitionIn?: SoundEffectConfig;
  transitionOut?: SoundEffectConfig;
  ambience?: SoundEffectConfig;
  emphasis?: SoundEffectConfig[];
}

export interface SoundEffectConfig {
  type: 'whoosh' | 'transition' | 'impact' | 'sparkle' | 'ambient' | 'notification' | 'success';
  url: string;
  duration: number;
  volume: number;
}

export type SceneType =
  | 'hook'
  | 'intro'
  | 'benefit'
  | 'feature'
  | 'explanation'
  | 'process'
  | 'testimonial'
  | 'social_proof'
  | 'story'
  | 'problem'
  | 'agitation'
  | 'solution'
  | 'proof'
  | 'product'
  | 'broll'
  | 'brand'
  | 'cta'
  | 'outro';

export interface TextOverlay {
  id: string;
  text: string;
  style: TextOverlayStyle;
  position: TextPosition;
  timing: {
    startAt: number;
    duration: number;
  };
  animation: {
    enter: 'fade' | 'slide-up' | 'slide-left' | 'scale' | 'typewriter';
    exit: 'fade' | 'slide-down' | 'scale';
    duration: number;
  };
}

export type TextOverlayStyle = 'title' | 'subtitle' | 'headline' | 'body' | 'bullet' | 'caption' | 'cta' | 'quote';

export interface TextPosition {
  vertical: 'top' | 'center' | 'bottom' | 'lower-third';
  horizontal: 'left' | 'center' | 'right';
  padding: number;
}

export interface BackgroundConfig {
  type: 'image' | 'video' | 'gradient' | 'solid';
  source: string;
  videoUrl?: string;
  effect?: {
    type: 'ken-burns' | 'parallax' | 'zoom' | 'pan' | 'none';
    intensity: 'subtle' | 'medium' | 'dramatic';
    direction?: 'in' | 'out' | 'left' | 'right';
  };
  overlay?: {
    type: 'gradient' | 'solid' | 'vignette';
    color: string;
    opacity: number;
  };
}

export interface TransitionConfig {
  type: 'none' | 'fade' | 'crossfade' | 'slide' | 'zoom' | 'wipe';
  duration: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface SceneAssets {
  imageUrl?: string;
  videoUrl?: string;
  videoSource?: string;
  voiceoverUrl?: string;
  useAIImage?: boolean;
  assignedProductImageId?: string;
  enhanceWithAIBackground?: boolean;
  backgroundUrl?: string;
  productOverlayUrl?: string;
  productOverlayPosition?: ProductOverlayPosition;
  useProductOverlay?: boolean;
  alternativeImages?: { url: string; prompt: string; source: string }[];
  alternativeVideos?: { url: string; query: string; source: string }[];
  preferVideo?: boolean;
  preferImage?: boolean;
  logoUrl?: string;
  logoPosition?: { position: string; size: number; opacity: number };
}

export interface RegenerationRecord {
  id: string;
  sceneId: string;
  assetType: 'image' | 'video' | 'voiceover';
  previousUrl?: string;
  newUrl?: string;
  prompt?: string;
  timestamp: string;
  success: boolean;
}

export interface ProjectHistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  previousState: Partial<VideoProject>;
}

export interface ProjectHistory {
  entries: ProjectHistoryEntry[];
  currentIndex: number;
  maxEntries: number;
}

export const SCENE_OVERLAY_DEFAULTS: Record<string, boolean> = {
  hook: false,
  intro: true,
  benefit: false,
  feature: true,
  explanation: false,
  process: false,
  testimonial: false,
  social_proof: false,
  story: false,
  problem: false,
  brand: true,
  cta: true,
  outro: false,
};

export interface ProductOverlayPosition {
  x: 'left' | 'center' | 'right';
  y: 'top' | 'center' | 'bottom';
  scale: number;
  animation?: 'fade' | 'zoom' | 'slide' | 'none';
}

export interface GeneratedAssets {
  voiceover: {
    fullTrackUrl: string;
    duration: number;
    perScene: { sceneId: string; url: string; duration: number }[];
  };
  music: {
    url: string;
    duration: number;
    volume: number;
  };
  images: { sceneId: string; url: string; prompt: string; source: 'ai' | 'uploaded' | 'stock' }[];
  videos: { sceneId: string; url: string; source: 'pexels' | 'pixabay' | 'generated' | 'runway' | 'kling' | 'luma' | 'hailuo' | 'hunyuan' | 'veo' }[];
  productImages: ProductImage[];
}

export interface ProductionProgress {
  currentStep: ProductionStep;
  steps: {
    script: StepStatus;
    voiceover: StepStatus;
    images: StepStatus;
    videos: StepStatus;
    music: StepStatus;
    assembly: StepStatus;
    rendering: StepStatus;
  };
  overallPercent: number;
  errors: string[];
  serviceFailures: ServiceFailure[];
}

export type ProductionStep = 'idle' | 'script' | 'voiceover' | 'images' | 'videos' | 'music' | 'assembly' | 'rendering';

export interface StepStatus {
  status: 'pending' | 'in-progress' | 'complete' | 'error' | 'skipped';
  progress: number;
  message?: string;
}

export interface ServiceFailure {
  service: 'fal.ai' | 'elevenlabs' | 'pexels' | 'huggingface' | 'remotion-lambda' | 'chunked-render' | 'runway' | 'piapi' | 'kling' | 'luma' | 'hailuo' | 'hunyuan' | 'veo';
  timestamp: string;
  error: string;
  fallbackUsed?: string;
}

export interface ProductImage {
  id: string;
  url: string;
  name: string;
  description?: string;
  isPrimary?: boolean;
  _blobUrl?: string;
}

export interface VoiceOption {
  voice_id: string;
  name: string;
  category: 'premade' | 'cloned' | 'generated' | 'professional';
  description: string;
  preview_url: string;
  labels: {
    accent?: string;
    age?: string;
    gender?: string;
    use_case?: string;
  };
}

export interface ProductVideoInput {
  productName: string;
  productDescription: string;
  targetAudience: string;
  benefits?: string[];
  duration: 15 | 20 | 30 | 60 | 90;
  platform: 'youtube' | 'tiktok' | 'instagram' | 'instagram-reels' | 'facebook' | 'website';
  style: 'professional' | 'friendly' | 'energetic' | 'calm';
  callToAction: string;
  productImages?: ProductImage[];
  voiceId?: string;
  voiceName?: string;
  qualityTier?: 'standard' | 'premium' | 'ultra';
}

export interface ScriptVideoInput {
  title: string;
  script: string;
  platform: 'youtube' | 'tiktok' | 'instagram' | 'instagram-reels' | 'facebook' | 'website';
  style: 'professional' | 'casual' | 'energetic' | 'calm' | 'cinematic' | 'documentary' | 'luxury' | 'minimal' | 'instructional' | 'educational' | 'training';
  targetDuration?: number;
  brandSettings?: {
    introLogoUrl?: string;
    watermarkImageUrl?: string;
    ctaText?: string;
  };
  musicEnabled?: boolean;
  musicMood?: string;
  qualityTier?: 'standard' | 'premium' | 'ultra';
}

// Pine Hill Farm Official Brand Colors
// Primary: Forest Green #2d5a27 (main brand color)
// Secondary: Sage Green #607e66 (softer green)
// Accent: Gold #c9a227 (CTAs, highlights)
// Blues: Slate #5e637a, Steel #5b7c99, Periwinkle #8c93ad, Teal #6c97ab
// Neutrals: Gray #a9a9a9, White #ffffff, Dark text #5e637a
// Backgrounds: Cream #f5f0e8, Off-white #f8f8f3
export const PINE_HILL_FARM_BRAND: BrandSettings = {
  name: 'Pine Hill Farm',
  logoUrl: '/uploads/pinehillfarm-logo.png',
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 0.3,
  colors: {
    primary: '#2d5a27',      // Forest green (main brand color)
    secondary: '#607e66',    // Sage green (softer green)
    accent: '#c9a227',       // Gold (CTAs, highlights)
    text: '#5e637a',         // Slate blue (dark text on light backgrounds)
    textLight: '#ffffff',    // White text on dark backgrounds
  },
  fonts: {
    heading: 'Playfair Display, Georgia, serif',
    body: 'Open Sans, Helvetica, sans-serif',
    weight: {
      heading: 700,
      body: 400,
    },
  },
};

export const OUTPUT_FORMATS: Record<string, OutputFormat> = {
  youtube: {
    aspectRatio: '16:9',
    resolution: { width: 1920, height: 1080 },
    platform: 'youtube',
  },
  tiktok: {
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    platform: 'tiktok',
  },
  instagram: {
    aspectRatio: '1:1',
    resolution: { width: 1080, height: 1080 },
    platform: 'instagram',
  },
  'instagram-reels': {
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    platform: 'instagram-reels',
  },
  facebook: {
    aspectRatio: '16:9',
    resolution: { width: 1920, height: 1080 },
    platform: 'facebook',
  },
  website: {
    aspectRatio: '16:9',
    resolution: { width: 1920, height: 1080 },
    platform: 'website',
  },
};

export function createEmptyVideoProject(
  type: 'product' | 'script-based',
  title: string,
  platform: string = 'youtube'
): VideoProject {
  const now = new Date().toISOString();
  return {
    id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    title,
    description: '',
    fps: 30,
    totalDuration: 0,
    outputFormat: OUTPUT_FORMATS[platform] || OUTPUT_FORMATS.youtube,
    brand: PINE_HILL_FARM_BRAND,
    scenes: [],
    assets: {
      voiceover: { fullTrackUrl: '', duration: 0, perScene: [] },
      music: { url: '', duration: 0, volume: 0.18 },
      images: [],
      videos: [],
      productImages: [],
    },
    status: 'draft',
    progress: {
      currentStep: 'idle',
      steps: {
        script: { status: 'pending', progress: 0 },
        voiceover: { status: 'pending', progress: 0 },
        images: { status: 'pending', progress: 0 },
        videos: { status: 'pending', progress: 0 },
        music: { status: 'pending', progress: 0 },
        assembly: { status: 'pending', progress: 0 },
        rendering: { status: 'pending', progress: 0 },
      },
      overallPercent: 0,
      errors: [],
      serviceFailures: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function calculateTotalDuration(scenes: Scene[]): number {
  return scenes.reduce((total, scene) => total + scene.duration, 0);
}

export function getCompositionId(aspectRatio: '16:9' | '9:16' | '1:1'): string {
  switch (aspectRatio) {
    case '9:16':
      return 'UniversalVideoVertical';
    case '1:1':
      return 'UniversalVideoSquare';
    default:
      return 'UniversalVideo';
  }
}
