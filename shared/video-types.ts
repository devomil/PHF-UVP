export interface CharacterProfile {
  id: string;
  name: string;
  role: string;
  physicalDescription: string;
  wardrobe: string;
  personalityNotes: string;
  referenceImageUrl: string | null;
  referencePhotoUrl?: string | null;
  locked: boolean;
  generationStatus?: 'idle' | 'generating' | 'completed' | 'failed';
  generationError?: string;
  sortOrder: number;
  savedToLibrary?: boolean;
}

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
  videoGenerationMode?: 'direct-t2v' | 'image-first-i2v' | 'character-i2v' | 'auto';
  artPresetId?: string;
  characters?: CharacterProfile[];
  visualStyleRationale?: string;
  // Task #111: per-project NB2 storyboard resolution. Drives both the wire
  // request and the per-image price (1K $0.06, 2K $0.08, 4K $0.12). Falls
  // back to the `STORYBOARD_NB2_RESOLUTION` env default when unset so older
  // projects keep their existing tier.
  storyboardResolution?: '1K' | '2K' | '4K';
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

// Phase 20C: structured brand reference entry used by Seedance 2 omni_reference.
// Each entry maps to one @imageN tag in the prompt body. The order of the array
// is the order of the tags (index 0 → @image1, index 1 → @image2, …, capped at 9).
export interface BrandReferenceInput {
  /** FK into brandAssets / brand-media-library. Optional for ad-hoc refs that
   * carry only a URL (e.g. project.assets.productImages entries). */
  assetId?: number;
  /** Public URL of the reference image. Required — this is what's sent to PiAPI. */
  assetUrl: string;
  /** Stable label for this slot, e.g. "image1". The runtime tag is "@" + tag. */
  tag: string;
  /** Display label shown in the UI panel ("Product bottle", "Brand logo"). */
  label?: string;
  /** Optional dimensions used by the aspect-ratio mismatch warning. */
  width?: number;
  height?: number;
}

export interface PromptComplexityAnalysis {
  category: 'simple' | 'moderate' | 'complex' | 'impossible';
  warning?: string;
  simplifiedPrompt?: string;
}

// Phase 11D: Animation settings for brand media/static images
export type VisualFormat = 'ai-video' | 'ai-image-remotion' | 'remotion-motion-graphics';

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

export type EntranceAnimation = 'fade' | 'rise' | 'pop' | 'drift';

export interface MicroSceneOverlayItem {
  id: string;
  url: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  locked: boolean;
  zIndex: number;
  entranceAnimation: EntranceAnimation;
  kind?: 'logo' | 'watermark' | 'decoration' | 'image';
  snapPosition?: 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'custom';
  dropShadow?: boolean;
  timingStart?: number;
  timingDuration?: number;
}

export type TextOverlayEnterAnimation = 'none' | 'fade' | 'rise' | 'drop' | 'wipe-left' | 'wipe-right' | 'scale-pop' | 'typewriter' | 'blur-in';
export type TextOverlayExitAnimation = 'none' | 'fade' | 'slide-out' | 'scale-down';
export type TextOverlayAnimation = TextOverlayEnterAnimation | TextOverlayExitAnimation;
export type TextEmphasisAnimation = 'none' | 'pulse' | 'float' | 'shimmer';
export type TextPresetType = 'headline' | 'script-accent' | 'body' | 'bullet-list' | 'stat-callout' | 'lower-third' | 'cta-badge' | 'caption-bar';
export type SnapPosition = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'custom';

export type ImageOverlayKind = 'logo' | 'watermark' | 'decoration' | 'image';

// Brand-kit binding: an overlay can declare that one or more of its
// visual properties should inherit from the project's BrandSettings,
// so updating the brand kit propagates everywhere automatically.
export type BrandColorKey = 'primary' | 'secondary' | 'accent' | 'text' | 'textLight';
export type BrandFontKey = 'heading' | 'body';

export interface OverlayBrandBinding {
  color?: BrandColorKey;
  backgroundColor?: BrandColorKey;
  fontFamily?: BrandFontKey;
  logo?: boolean;
}

export function resolveBrandColor(
  brand: BrandSettings | undefined,
  key: BrandColorKey | undefined
): string | undefined {
  if (!brand || !key) return undefined;
  const v = brand.colors?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function resolveBrandFontFamily(
  brand: BrandSettings | undefined,
  key: BrandFontKey | undefined
): string | undefined {
  if (!brand || !key) return undefined;
  const v = brand.fonts?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function resolveBrandLogoUrl(
  brand: BrandSettings | undefined,
  binding: OverlayBrandBinding | undefined
): string | undefined {
  if (!brand || !binding?.logo) return undefined;
  return brand.logoUrl && brand.logoUrl.length > 0 ? brand.logoUrl : undefined;
}

export interface ImageOverlayItem {
  type: 'image';
  id: string;
  url: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  locked: boolean;
  layerOrder?: number;
  kind?: ImageOverlayKind;
  snapPosition?: SnapPosition;
  enterAnimation?: TextOverlayEnterAnimation;
  exitAnimation?: TextOverlayExitAnimation;
  emphasisAnimation?: TextEmphasisAnimation;
  animationDuration?: number;
  timingStart?: number;
  timingDuration?: number;
  dropShadow?: boolean;
  cornerRadius?: number;
  autoBackground?: boolean;
  autoBackgroundOpacity?: number;
  brandBinding?: OverlayBrandBinding;
}

export interface TextOverlayItem {
  type: 'text';
  id: string;
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  locked: boolean;
  textPreset?: TextPresetType;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderRadius?: number;
  letterSpacing?: number;
  lineHeight?: number;
  textShadow?: boolean;
  enterAnimation: TextOverlayEnterAnimation;
  exitAnimation: TextOverlayExitAnimation;
  emphasisAnimation?: TextEmphasisAnimation;
  animationDuration: number;
  timingStart?: number;
  timingDuration?: number;
  snapPosition?: SnapPosition;
  bulletPoints?: string[];
  bulletDelay?: number;
  layerOrder?: number;
  autoBackground?: boolean;
  autoBackgroundOpacity?: number;
  brandBinding?: OverlayBrandBinding;
}

export type SceneOverlayItem = ImageOverlayItem | TextOverlayItem;

export interface MicroScene {
  id: string;
  narration: string;
  visualDirection: string;
  duration: number;
  videoUrl?: string;
  imageUrl?: string;
  originalAudioVolume?: number;
  originalAudioFadeIn?: number;
  originalAudioFadeOut?: number;
  visualFormat?: VisualFormat;
  contentTag?: string;
  artPresetId?: string;
  overlayItems?: MicroSceneOverlayItem[];
  pipelineStage?: number;
}

export interface AssemblyWordMarker {
  word: string;
  startSec: number;
  endSec: number;
  microSceneIndex: number;
}

export interface AssemblyClipTiming {
  microSceneIndex: number;
  microSceneId: string;
  startTimeSec: number;
  endTimeSec: number;
  durationSec: number;
  sourceUrl: string;
  probedDurationSec: number;
}

export interface AssemblyManifest {
  assemblyFailed: boolean;
  assembledClipUrl?: string;
  assembledClipValid?: boolean;
  manifestUrl?: string;
  totalDurationSec: number;
  clips: AssemblyClipTiming[];
  wordMarkers?: AssemblyWordMarker[];
  sceneId: string;
  createdAt: string;
  error?: string;
  sourceVideoHashes?: string[];
  assemblyVersion?: number;
}

export interface Scene {
  id: string;
  order: number;
  type: SceneType;
  duration: number;
  narration: string;
  visualDirection?: string;
  cinematicNotes?: string;
  negativePrompt?: string;
  microScenes?: MicroScene[];
  assemblyManifest?: AssemblyManifest;
  qualityTier?: 'standard' | 'premium' | 'ultra';
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
  overlayItems?: SceneOverlayItem[];
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
  textLabels?: TextLabel[];
  // Phase 15H: Workflow override - allows disabling brand asset matching per scene
  useBrandAssets?: boolean;
  // Phase 20C: structured multi-image brand references for Seedance 2 omni_reference.
  // Each entry has a stable @imageN tag the user (or buildOmniReferencePrompt) places
  // in the prompt body. Coexists with single-ref fields above; reads should fall back
  // to brandAssetId/brandAssetUrl/useBrandAssets when this array is empty.
  brandReferences?: BrandReferenceInput[];
  // Phase 20C: explicit opt-in to omni_reference multi-ref mode for this scene.
  // When true AND brandReferences[] is non-empty AND provider resolves to Seedance 2,
  // the generation path uses the multi-image omni_reference flow.
  useOmniReference?: boolean;
  // Phase 15H: Generation method tracking - what method was used to generate the media
  generationMethod?: 'T2I' | 'I2I' | 'T2V' | 'I2V' | 'V2V' | 'stock';
  visualFormat?: VisualFormat;
  contentTag?: string;
  assignedContentTag?: string;
  artPresetId?: string;
  assignedStyleId?: string;
  // Phase 44: Creative brief fields surfaced in pre-generation review
  onScreenText?: string;
  lowerThird?: string;
  shotType?: string;
  chapterIndex?: number;
  chapterTitle?: string;
  voiceoverUrl?: string;
  voiceoverDuration?: number;
  voiceoverWords?: import('./config/caption-styles').CaptionWord[];
  captions?: import('./config/caption-styles').SceneCaptions;
  // Phase 16: Pipeline intermediate results for step-by-step execution
  pipelineIntermediates?: {
    environmentImage?: string;
    composedImage?: string;
    preLogoVideo?: string;
  };
  brandTextElements?: Array<{
    text: string;
    x: number;
    y: number;
    width?: number;
  }>;
  // Task 61: Cheap still-image preview thumbnail for Creative Brief screen.
  // Generated from imagePrompt (or visualDirection) + assigned art preset
  // before any expensive video generation runs.
  thumbnailUrl?: string;
  thumbnailStatus?: 'idle' | 'generating' | 'complete' | 'failed';
  thumbnailError?: string;
  thumbnailGeneratedFor?: string;
  thumbnailUpdatedAt?: string;
  // Phase 20D (Task #126): per-scene Seedance 2 native-audio opt-in.
  // When `true` AND the scene's resolved video provider is
  // `seedance-2.0` / `seedance-2.0-fast`, the PiAPI request payload
  // emits `generate_audio: true` so Seedance produces ambient audio.
  // The flag is intentionally tri-state via optionality: `undefined`
  // and `false` both mean "no native audio" (default), only `true`
  // opts in. Other providers ignore this flag entirely.
  //
  // Conflict semantics: when the scene also has a non-empty narration
  // (TTS voiceover), the editor surfaces a warning because mixing
  // generated dialogue/ambient audio with the user's voiceover is
  // almost always wrong. The actionable affordance there is "Mute
  // voiceover" — clearing `narration` — not unsetting this flag.
  generateNativeAudio?: boolean;
  // Phase 23A (Task #118): Claude Haiku 4.5 scene classifier output. The
  // narrative `type` (above) describes WHAT story beat this scene serves;
  // `renderSystemType` describes HOW it should be rendered. The two layers
  // are orthogonal — `type='product'` could be rendered as either
  // `product_showcase` (Seedance hero shot) or `infographic` depending on
  // the visual direction.
  //
  // Persistence rules (enforced by scene-classifier.service + the scene
  // PATCH route):
  //   - `manuallyClassified === true` is sticky: the auto-classifier never
  //     overwrites it. Only the per-scene re-classify endpoint clears it.
  //   - When a client PATCHes `renderSystemType` directly, the route also
  //     stamps `manuallyClassified: true`, `classifierConfidence: 1.0`,
  //     `classifierReasoning: 'Manual override'`, and `classifiedAt: now()`
  //     in the same atomic patch.
  //   - Classifier failures (no API key, timeout, parse error) silently
  //     write `renderSystemType: 'ai_video'`, `confidence: 0`, and a
  //     reasoning string starting with `Classifier error:` — generation
  //     never blocks on the classifier.
  renderSystemType?: RenderSystemType;
  classifierConfidence?: number;
  classifierReasoning?: string;
  classifiedAt?: string;
  manuallyClassified?: boolean;
  // Phase 21B (Task #106): NB2 storyboard + seed-image pipeline.
  // `seedImageUrl` is the high-quality, art-direction-locked still that
  // becomes the @image1 anchor for Seedance 2 omni_reference. It is the
  // SAME asset URL as `thumbnailUrl` once an NB2 storyboard run completes,
  // but is kept as a distinct field so:
  //   1. Downstream code (omni-reference assembler) can prepend it BEFORE
  //      brandReferences without conflating it with the cheap Flux preview
  //      thumbnail produced by Task 61.
  //   2. Users can swap the thumbnail (e.g. cropped variant) without losing
  //      the canonical seed reference fed to Seedance 2.
  seedImageUrl?: string;
  /** Which provider produced the current `thumbnailUrl` / `seedImageUrl`.
   *  Drives the small "NB2 / Recraft / Flux" badge on the storyboard card. */
  imageGenerationModel?: 'nano-banana-2' | 'recraft-v4-pro' | 'flux' | 'flux-1.1-pro';
  /** The exact prompt sent to the image model (after preset prefix/suffix
   *  and motion-word stripping). Persisted so users can regenerate from
   *  the same prompt or inspect what was sent. */
  imageGenerationPrompt?: string;
  /** All NB2 candidates considered for this scene plus their Claude Vision
   *  QA scores. The auto-selected winner has `selected: true`. Users can
   *  override the auto-pick from the inspect-candidates UI; the override
   *  rewrites `thumbnailUrl` + `seedImageUrl` and flips the `selected`
   *  flag without re-running NB2. */
  imageCandidates?: Array<{
    url: string;
    score: number;
    selected: boolean;
    reason?: string;
  }>;
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

// Phase 23A (Task #118): Render-system classification.
// Set by `server/services/scene-classifier.service.ts` (Claude Haiku 4.5)
// and consumed at render time by Phases 23B / 24A / 24B / 25 / 28 to pick
// the right pipeline. Adding a new value here is a breaking change for the
// renderer router — keep it in sync with `RENDER_SYSTEM_TYPES` below.
export type RenderSystemType =
  | 'ai_video'              // Seedance / Kling / Veo etc. — default pick
  | 'title_card'            // Remotion title card (chapter/section titles)
  | 'infographic'           // Remotion data viz / numbered list / chart
  | 'scientific_medical'    // Recraft V3 with anatomical / lab overlay
  | 'brand_environment'     // Recraft V3 with branded signage / setting
  | 'product_showcase'      // Seedance hero shot, product as primary subject
  | 'ugc_avatar';           // Phase 27 — talking-head UGC, not yet rendered

/** Source of truth for valid `RenderSystemType` strings. Used by the
 *  classifier's `validateType` and by the PATCH allowlist guard. Keep this
 *  array exhaustive against the union above. */
export const RENDER_SYSTEM_TYPES: readonly RenderSystemType[] = [
  'ai_video',
  'title_card',
  'infographic',
  'scientific_medical',
  'brand_environment',
  'product_showcase',
  'ugc_avatar',
] as const;

/** Type guard — narrows `unknown` (or any string) to `RenderSystemType`
 *  without a cast. Use at the route boundary so a `JSON.parse` result
 *  can be safely passed to functions expecting the narrowed type. */
export function isRenderSystemType(value: unknown): value is RenderSystemType {
  return typeof value === 'string'
    && (RENDER_SYSTEM_TYPES as readonly string[]).includes(value);
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
  | 'outro'
  | 'chapter-title';

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
  imageProvider?: string;
  videoProvider?: string;
  // Task 56: per-scene "pin" for smart-routing. When set, regenerate
  // endpoints honor this provider instead of the auto-selected one. Null
  // / undefined means "auto" (default for all existing scenes).
  imageProviderLock?: string | null;
  videoProviderLock?: string | null;
  lastRegenAt?: string;
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

export type TextLabelVisualTreatment = 'badge' | 'floating-tag' | 'holographic-panel' | 'handwritten' | 'neon-glow' | 'minimal' | 'pill' | 'underline';

export interface TextLabel {
  id: string;
  text: string;
  position: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  visualTreatment: TextLabelVisualTreatment;
  timing: {
    startAt: number;
    duration: number;
  };
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
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
    perScene: { sceneId: string; url: string; duration: number; words?: import('./config/caption-styles').CaptionWord[] }[];
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
  // Phase 20D (Task #126): includes the visual-style ids consumed by
  // `getDefaultDurationForStyle` (hero, lifestyle, product, social,
  // premium) so script generation can pass the project's chosen style
  // through to the parser instead of hard-coding "professional".
  style: 'professional' | 'casual' | 'energetic' | 'calm' | 'cinematic' | 'documentary' | 'luxury' | 'minimal' | 'instructional' | 'educational' | 'training' | 'hero' | 'lifestyle' | 'product' | 'social' | 'premium';
  targetDuration?: number;
  brandSettings?: {
    introLogoUrl?: string;
    watermarkImageUrl?: string;
    ctaText?: string;
    colors?: string[];
  };
  musicEnabled?: boolean;
  musicMood?: string;
  qualityTier?: 'standard' | 'premium' | 'ultra';
  artPresetId?: string;
  artPresetIds?: string[];
  productContext?: {
    productName: string;
    category: string;
    keyFeatures: string[];
    brandTone: string;
    colorPalette: string[];
    targetDemographic: string;
    visualDescription: string;
  } | null;
  scriptPresets?: {
    productName?: string;
    productProblem?: string;
    scriptTone?: string;
    callToAction?: string;
  } | null;
  projectType?: string | null;
  contentStructure?: string | null;
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
  logoUrl: '/uploads/16045ec5-d8e6-4b90-a65f-eb7e39e280ab.png',
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

export function calculateTotalDuration(scenes: Scene[], transitions?: TransitionConfig[]): number {
  const rawTotal = scenes.reduce((total, scene) => total + scene.duration, 0);

  if (!transitions || transitions.length === 0) return rawTotal;

  let transitionOverlap = 0;
  for (let i = 0; i < Math.min(transitions.length, scenes.length - 1); i++) {
    const t = transitions[i];
    if (t && t.duration > 0 && t.type !== 'none') {
      transitionOverlap += t.duration / 2;
    }
  }

  return Math.max(rawTotal - transitionOverlap, 0);
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
