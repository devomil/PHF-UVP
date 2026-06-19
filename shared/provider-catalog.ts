import { VIDEO_PROVIDERS } from './provider-config';

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  family: string;
  description: string;
  capabilities: string[];
  maxDuration: number;
  costTier: 'budget' | 'standard' | 'premium' | 'ultra';
  type: 'video' | 'image';
  supportedModes: ('t2v' | 'i2v' | 'v2v' | 't2i' | 'i2i')[];
  aspectRatios: string[];
  highlight?: string;
  multiImageSupport?: boolean;
  // Phase 20D (Task #136): single source of truth for "this video model
  // accepts the per-scene `generateNativeAudio` toggle". When true, the UI
  // toggle is enabled, the ai-video-service forwards the flag to the
  // provider, and the corresponding piapi branch emits `generate_audio`
  // in its payload. When false/undefined, the toggle is disabled and the
  // flag is dropped before reaching any provider branch.
  //
  // NOTE: This is NOT the same as Veo's always-on baked-in audio (which
  // we surface via the 'Audio' string in `capabilities`). This flag means
  // "supports the *toggleable* per-scene audio opt-in". Adding a new
  // audio-toggleable model is a one-line change here.
  supportsNativeAudio?: boolean;
  // When true, this provider appears in the Quick Create and Asset Creator
  // video provider dropdowns. Set to true for every provider that should
  // surface in the UI without any other code change. The
  // getDropdownVideoProviders() helper reads this flag — it is the single
  // place to control which providers appear in both dropdowns.
  showInDropdown?: boolean;
  // When true, this image provider accepts an input image and transforms it
  // (image-to-image). Used to populate the I2I provider dropdowns and to
  // filter the ProviderSelector for I2I reference modes.
  supportsI2I?: boolean;
  // When true, this image provider supports style-transfer / style-reference
  // mode (the reference image drives aesthetic, not content).
  supportsStyle?: boolean;
  // When true, this provider appears in the ProviderSelector and
  // RegenerationOptions image provider lists. Add a new image provider to
  // IMAGE_PROVIDER_CATALOG with this flag to surface it in those UIs without
  // any other code change.
  showInImageDropdown?: boolean;
  // When true, this provider appears in the Quick Create I2I provider
  // dropdown (QC_I2I_PROVIDERS). getDropdownI2IProviders() reads this flag.
  showInI2IDropdown?: boolean;
  // When true, this provider appears in the Quick Create V2V provider
  // dropdown (QC_V2V_PROVIDERS). getDropdownV2VProviders() reads this flag.
  showInV2VDropdown?: boolean;
}

export const VIDEO_PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'kling',
    name: 'Kling 1.0 (Legacy)',
    family: 'Kling',
    description: 'Original Kling model. Superseded by Kling 2.6 — use Kling 2.6 or Auto-select for best results.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'kling-1.6',
    name: 'Kling 1.6',
    family: 'Kling',
    description: 'Improved motion consistency and visual fidelity over the original. Great entry point for Kling-family models at a lower cost.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'budget',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'kling-2.0',
    name: 'Kling 2.0',
    family: 'Kling',
    description: 'Second-generation model with enhanced scene understanding, better camera movements, and improved temporal consistency.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'kling-2.1',
    name: 'Kling 2.1',
    family: 'Kling',
    description: 'Refined character consistency and natural motion. Excellent for product demos and lifestyle content with smooth transitions.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'kling-2.1-master',
    name: 'Kling 2.1 Master',
    family: 'Kling',
    description: 'Premium tier of Kling 2.1 with maximum quality rendering. Best for hero content, cinematic sequences, and high-stakes productions.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'ultra',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Premium Quality',
    showInDropdown: true,
  },
  {
    id: 'kling-2.5',
    name: 'Kling 2.5',
    family: 'Kling',
    description: 'Advanced prompt understanding with cinematic lighting. Produces film-quality footage with natural depth of field and color grading.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'kling-2.5-turbo',
    name: 'Kling 2.5 Turbo',
    family: 'Kling',
    description: 'Faster rendering variant of Kling 2.5. Maintains high quality with significantly reduced generation time — ideal for iterating quickly.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Fast',
  },
  {
    id: 'kling-2.6',
    name: 'Kling 2.6',
    family: 'Kling',
    description: 'Latest standard Kling model. Excellent character consistency, realistic physics, and top-tier prompt adherence for marketing and social content.',
    capabilities: ['T2V', 'I2V', 'V2V'],
    maxDuration: 10,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v', 'v2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Recommended',
    showInDropdown: true,
    showInV2VDropdown: true,
  },
  {
    id: 'kling-2.6-pro',
    name: 'Kling 2.6 Pro',
    family: 'Kling',
    description: 'Professional-grade Kling 2.6 with enhanced detail rendering, superior lighting, and broadcast-ready output quality.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'kling-2.6-motion-control',
    name: 'Kling 2.6 Motion Control',
    family: 'Kling',
    description: 'Adds precise camera path and motion control to Kling 2.6. Direct pan, zoom, orbit, and dolly movements for cinematic storytelling.',
    capabilities: ['T2V', 'I2V', 'V2V'],
    maxDuration: 30,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v', 'v2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Camera Control',
  },
  {
    id: 'kling-2.6-motion-control-pro',
    name: 'Kling 2.6 Motion Control Pro',
    family: 'Kling',
    description: 'Premium motion control with maximum quality. Combines Kling\'s best rendering with advanced camera choreography for professional productions.',
    capabilities: ['T2V', 'I2V', 'V2V'],
    maxDuration: 30,
    costTier: 'ultra',
    type: 'video',
    supportedModes: ['t2v', 'i2v', 'v2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'kling-avatar',
    name: 'Kling AI Avatar',
    family: 'Kling',
    description: 'Specialized for talking-head and avatar videos. Native lip-sync, consistent character identity, and natural expressions — perfect for presenters and spokespersons.',
    capabilities: ['T2V', 'I2V', 'Lip-Sync'],
    maxDuration: 60,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Lip-Sync',
    showInDropdown: true,
  },
  {
    id: 'kling-effects',
    name: 'Kling Effects (VFX)',
    family: 'Kling',
    description: 'Quick special effects and visual transformations. Generate short VFX clips, particle effects, and stylized transitions at low cost.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 5,
    costTier: 'budget',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'luma',
    name: 'Luma Dream Machine',
    family: 'Luma',
    description: 'Luma AI\'s Dream Machine model. Excels at photorealistic scenes with natural lighting, atmospheric depth, and smooth camera motion.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 5,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'luma-dream-machine',
    name: 'Luma Dream Machine',
    family: 'Luma',
    description: 'Full Dream Machine model with enhanced creative control. Beautiful cinematic output with dreamy aesthetics and imaginative scene composition.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 5,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'runway',
    name: 'Runway Gen-3',
    family: 'Runway',
    description: 'RunwayML\'s Gen-3 model via direct API. Industry-leading prompt comprehension, cinematic quality, and reliable multi-subject scenes for professional video production.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Industry Standard',
    showInDropdown: true,
  },
  {
    id: 'runway-4.5',
    name: 'Runway 4.5',
    family: 'Runway',
    description: 'Runway\'s latest and most powerful model. Top-tier photorealistic motion, advanced camera manipulation, and the best creative control available. Direct API.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Latest Runway',
    showInDropdown: true,
  },
  {
    id: 'runway-gen4',
    name: 'Runway Gen-4',
    family: 'Runway',
    description: 'Gen-4 standard model with advanced creative control, motion manipulation, and dramatic storytelling capabilities. Direct API integration.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'runway-gen4-aleph',
    name: 'Runway Gen-4 Aleph',
    family: 'Runway',
    description: 'Gen-4 Aleph variant with enhanced creative control and superior motion quality. Excels at dramatic lighting and advanced cinematic composition. Direct API.',
    capabilities: ['T2V', 'I2V', 'V2V'],
    maxDuration: 10,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v', 'v2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Creative Control',
    showInDropdown: true,
    showInV2VDropdown: true,
  },
  {
    id: 'runway-act-two',
    name: 'Runway Act Two',
    family: 'Runway',
    description: 'Specialized for character performance and acting. Generates expressive body language, emotional facial performance, and natural character interactions. Direct API.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Character Acting',
    showInDropdown: true,
  },
  {
    id: 'hailuo',
    name: 'Hailuo MiniMax',
    family: 'Hailuo',
    description: 'MiniMax\'s Hailuo model with strong motion dynamics and vivid colors. Great value for social media content with eye-catching visual style.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 6,
    costTier: 'budget',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'hailuo-minimax',
    name: 'Hailuo MiniMax',
    family: 'Hailuo',
    description: 'Optimized MiniMax variant with fast generation and consistent output. Budget-friendly choice for high-volume content creation.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 6,
    costTier: 'budget',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Best Value',
  },
  {
    id: 'seedance-1.0',
    name: 'Seedance 1.0',
    family: 'Seedance',
    description: 'Specialized dance and rhythmic motion model. Creates fluid body movements and choreography — ideal for music videos and dance content.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 6,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Dance & Motion',
    showInDropdown: true,
  },
  {
    id: 'seedance-2.0',
    name: 'Seedance 2',
    family: 'Seedance',
    description: 'Next-generation Seedance model with improved quality, 1080p output, multi-image references via @imageN syntax, and morphing effects between images. Supports up to 15s video generation.',
    capabilities: ['T2V', 'I2V', 'Audio'],
    maxDuration: 15,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Primary Provider',
    multiImageSupport: true,
    supportsNativeAudio: true,
    showInDropdown: true,
  },
  {
    id: 'seedance-2.0-fast',
    name: 'Seedance 2 Fast',
    family: 'Seedance',
    description: 'Fast variant of Seedance 2 with quicker generation times and 1080p output. Supports multi-image references and morphing effects. Up to 15s.',
    capabilities: ['T2V', 'I2V', 'Audio'],
    maxDuration: 15,
    costTier: 'budget',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Fast Generation',
    multiImageSupport: true,
    supportsNativeAudio: true,
    showInDropdown: true,
  },
  {
    id: 'pika',
    name: 'Pika',
    family: 'Pika',
    description: 'Pika Labs\' creative video model. Known for artistic stylization, bold visual effects, and creative interpretations of prompts.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 5,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'genmo',
    name: 'Genmo Mochi',
    family: 'Genmo',
    description: 'Genmo\'s Mochi model with smooth, consistent motion and clean aesthetic. Good for explainer videos and product showcases with natural movement.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 8,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'hunyuan',
    name: 'Hunyuan',
    family: 'Hunyuan',
    description: 'Tencent\'s Hunyuan video model. Strong at generating complex scenes with multiple elements, detailed backgrounds, and natural interactions.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 5,
    costTier: 'budget',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'skyreels',
    name: 'SkyReels',
    family: 'SkyReels',
    description: 'Cinematic-focused model with film-like composition and dramatic lighting. Excels at landscape, aerial, and establishing shots.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 5,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'wan-2.1',
    name: 'Wan 2.1',
    family: 'Wan',
    description: 'Alibaba\'s Wan model with excellent text rendering in videos and strong character consistency. Great for branded content with on-screen text.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 5,
    costTier: 'budget',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'wan-2.6',
    name: 'Wan 2.6',
    family: 'Wan',
    description: 'Latest Wan model with improved visual quality and motion. Better physics simulation and more coherent multi-object scenes than 2.1.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 5,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'sora-2',
    name: 'Sora 2',
    family: 'Sora',
    description: 'OpenAI Sora 2 with consistent visual style and strong prompt understanding. Produces smooth cinematic motion with natural physics.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'sora-2-pro',
    name: 'Sora 2 Pro',
    family: 'Sora',
    description: 'Premium OpenAI Sora 2 with enhanced fidelity, extended generation control, and top-tier cinematic output. Best for hero content.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'ultra',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Premium Sora',
    showInDropdown: true,
  },
  {
    id: 'omniavatar',
    name: 'OmniAvatar',
    family: 'OmniAvatar',
    description: 'AI avatar generation with consistent identity and expression. Great for branded spokespersons and consistent presenter content.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 30,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'omni-human-1.5',
    name: 'OmniHuman 1.5 (Talking Photo)',
    family: 'OmniHuman',
    description: 'Animate a portrait with audio — realistic lip-sync and head motion. Perfect for turning a single image into a speaking presenter clip.',
    capabilities: ['I2V', 'Lip-Sync'],
    maxDuration: 30,
    costTier: 'standard',
    type: 'video',
    supportedModes: ['i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Talking Photo',
    showInDropdown: true,
  },
  {
    id: 'veo',
    name: 'Veo',
    family: 'Veo',
    description: 'Google DeepMind\'s Veo model with native audio generation. Creates videos with synchronized sound effects and ambient audio built in.',
    capabilities: ['T2V', 'I2V', 'Audio'],
    maxDuration: 8,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Native Audio',
    // Task #137: native audio is honored only by the Veo I2V branch
    // (piapi-video-service.ts reads `generate_audio` there). The Veo
    // T2V branch hard-codes `generate_audio: false`, so the toggle
    // surface adds an extra `hasImage` gate on top of this flag for
    // Veo specifically.
    supportsNativeAudio: true,
  },
  {
    id: 'veo-2',
    name: 'Veo 2',
    family: 'Veo',
    description: 'Second-generation Veo with improved visual coherence and more realistic physics. Enhanced audio synchronization and environmental sounds.',
    capabilities: ['T2V', 'I2V', 'Audio'],
    maxDuration: 8,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsNativeAudio: true,
  },
  {
    id: 'veo-3',
    name: 'Veo 3',
    family: 'Veo',
    description: 'Google\'s most advanced video model. Cinematic quality with native dialogue, sound effects, and music generation. State-of-the-art realism.',
    capabilities: ['T2V', 'I2V', 'Audio', 'Dialogue'],
    maxDuration: 8,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Top Tier',
    supportsNativeAudio: true,
  },
  {
    id: 'veo-3.1',
    name: 'Veo 3.1',
    family: 'Veo',
    description: 'Latest Veo with the highest fidelity output. Best-in-class for photorealistic scenes with complex lighting, natural dialogue, and immersive soundscapes.',
    capabilities: ['T2V', 'I2V', 'Audio', 'Dialogue'],
    maxDuration: 8,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Latest & Best',
    supportsNativeAudio: true,
    showInDropdown: true,
  },
  {
    id: 'veo2',
    name: 'Veo2 (Alias)',
    family: 'Veo',
    description: 'Alias for Veo 2. Same model — use "veo-2" for consistency.',
    capabilities: ['T2V', 'I2V', 'Audio'],
    maxDuration: 8,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsNativeAudio: true,
  },
  {
    id: 'veo3',
    name: 'Veo3 (Alias)',
    family: 'Veo',
    description: 'Alias for Veo 3. Same model — use "veo-3" for consistency.',
    capabilities: ['T2V', 'I2V', 'Audio', 'Dialogue'],
    maxDuration: 8,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsNativeAudio: true,
  },
  {
    id: 'veo3.1',
    name: 'Veo3.1 (Alias)',
    family: 'Veo',
    description: 'Alias for Veo 3.1. Same model — use "veo-3.1" for consistency.',
    capabilities: ['T2V', 'I2V', 'Audio', 'Dialogue'],
    maxDuration: 8,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsNativeAudio: true,
  },
  {
    id: 'runway-gen3',
    name: 'Runway Gen-3 Alpha',
    family: 'Runway',
    description: 'Runway Gen-3 Alpha via direct API. Industry-standard cinematic quality with reliable camera movement and multi-subject scenes.',
    capabilities: ['T2V', 'I2V'],
    maxDuration: 10,
    costTier: 'premium',
    type: 'video',
    supportedModes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'remotion-motion-graphics',
    name: 'Remotion (Motion Graphics)',
    family: 'Remotion',
    description: 'Programmatic motion graphics via Remotion. Ideal for infographic animations, charts, data visualization, and text overlays with zero AI artifacts.',
    capabilities: ['T2V'],
    maxDuration: 60,
    costTier: 'budget',
    type: 'video',
    supportedModes: ['t2v'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Motion Graphics',
  },
];

export const IMAGE_PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'flux',
    name: 'Flux.1',
    family: 'Flux',
    description: 'Black Forest Labs\' Flux model. Fast, high-quality image generation with excellent prompt adherence and photorealistic output.',
    capabilities: ['T2I', 'I2I'],
    maxDuration: 0,
    costTier: 'standard',
    type: 'image',
    supportedModes: ['t2i', 'i2i'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Recommended',
    showInDropdown: true,
    supportsI2I: true,
    supportsStyle: true,
    showInImageDropdown: true,
  },
  {
    id: 'flux-1-dev',
    name: 'Flux Dev',
    family: 'Flux',
    description: 'Developer variant of Flux with lower cost. Great for rapid prototyping and bulk image generation at a budget-friendly price.',
    capabilities: ['T2I'],
    maxDuration: 0,
    costTier: 'budget',
    type: 'image',
    supportedModes: ['t2i'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInDropdown: true,
  },
  {
    id: 'flux-kontext',
    name: 'Flux Kontext',
    family: 'Flux',
    description: 'Edit images with contextual understanding of existing content. Ideal for targeted modifications that preserve the rest of the scene.',
    capabilities: ['I2I'],
    maxDuration: 0,
    costTier: 'standard',
    type: 'image',
    supportedModes: ['i2i'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Context-Aware',
    supportsI2I: true,
    showInI2IDropdown: true,
  },
  {
    id: 'flux-1.1-pro',
    name: 'Flux 1.1 Pro',
    family: 'Flux',
    description: 'High-fidelity image editing with professional-grade output. Excellent detail preservation and prompt adherence for I2I tasks.',
    capabilities: ['T2I', 'I2I'],
    maxDuration: 0,
    costTier: 'premium',
    type: 'image',
    supportedModes: ['t2i', 'i2i'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsI2I: true,
    showInI2IDropdown: true,
  },
  {
    id: 'stability',
    name: 'Stability AI',
    family: 'Stability',
    description: 'Stability AI\'s latest diffusion model. Exceptional text rendering in images, versatile style range, and consistent compositional quality.',
    capabilities: ['T2I', 'I2I'],
    maxDuration: 0,
    costTier: 'budget',
    type: 'image',
    supportedModes: ['t2i', 'i2i'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsI2I: true,
    supportsStyle: true,
    showInImageDropdown: true,
  },
  {
    id: 'ideogram',
    name: 'Ideogram',
    family: 'Ideogram',
    description: 'Best-in-class text rendering in images. Perfect for marketing materials, social graphics, and any content requiring readable text overlays.',
    capabilities: ['T2I', 'I2I'],
    maxDuration: 0,
    costTier: 'standard',
    type: 'image',
    supportedModes: ['t2i', 'i2i'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Best Text',
    showInDropdown: true,
    supportsI2I: true,
    showInImageDropdown: true,
    showInI2IDropdown: true,
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    family: 'Nano Banana',
    description: 'Advanced style transfer and photorealistic scene integration. Preferred for natural scenes, people, and product shots.',
    capabilities: ['T2I', 'I2I'],
    maxDuration: 0,
    costTier: 'standard',
    type: 'image',
    supportedModes: ['t2i', 'i2i'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Photorealistic',
    showInDropdown: true,
    supportsI2I: true,
    showInI2IDropdown: true,
  },
  {
    id: 'midjourney',
    name: 'Midjourney',
    family: 'Midjourney',
    description: 'Industry-leading aesthetic quality. Produces stunning, artistic images with beautiful composition, lighting, and rich visual detail.',
    capabilities: ['T2I'],
    maxDuration: 0,
    costTier: 'premium',
    type: 'image',
    supportedModes: ['t2i'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Best Aesthetic',
    supportsStyle: true,
    showInImageDropdown: true,
  },
  {
    id: 'dalle3',
    name: 'DALL-E 3',
    family: 'OpenAI',
    description: 'OpenAI\'s latest image model. Strong prompt understanding, creative interpretation, and reliable quality across diverse subjects and styles.',
    capabilities: ['T2I'],
    maxDuration: 0,
    costTier: 'standard',
    type: 'image',
    supportedModes: ['t2i'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    showInImageDropdown: true,
  },
  {
    id: 'falai',
    name: 'fal.ai',
    family: 'Fal',
    description: 'Fast inference image generation. Lifestyle, people, and natural scenes. Optimized for speed with good quality output.',
    capabilities: ['T2I', 'I2I'],
    maxDuration: 0,
    costTier: 'budget',
    type: 'image',
    supportedModes: ['t2i', 'i2i'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    highlight: 'Fastest',
    supportsI2I: true,
    supportsStyle: true,
    showInImageDropdown: true,
  },
  {
    id: 'stable-diffusion-3',
    name: 'Stable Diffusion 3',
    family: 'Stability',
    description: 'Open-weights diffusion model with versatile style range, good text rendering, and fast generation. Budget-friendly for general image tasks.',
    capabilities: ['T2I', 'I2I'],
    maxDuration: 0,
    costTier: 'budget',
    type: 'image',
    supportedModes: ['t2i', 'i2i'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsI2I: true,
  },
];

export const COST_TIER_LABELS: Record<string, { label: string; color: string }> = {
  budget: { label: '$', color: '#22c55e' },
  standard: { label: '$$', color: '#3b82f6' },
  premium: { label: '$$$', color: '#f59e0b' },
  ultra: { label: '$$$$', color: '#ef4444' },
};

export function getVideoProviders(excludeAliases = true): ProviderCatalogEntry[] {
  if (!excludeAliases) return VIDEO_PROVIDER_CATALOG;
  return VIDEO_PROVIDER_CATALOG.filter(p => !p.name.includes('Alias'));
}

export function getImageProviders(): ProviderCatalogEntry[] {
  return IMAGE_PROVIDER_CATALOG;
}

// Returns the list of image providers for the Quick Create and Asset Creator
// dropdowns. The auto-select entry is always prepended. Any provider added to
// IMAGE_PROVIDER_CATALOG with `showInDropdown: true` will automatically appear
// here — no other code change required.
export function getDropdownImageProviders(): Array<{ id: string; name: string; description: string }> {
  const auto = {
    id: 'auto',
    name: 'Auto (Best Match)',
    description: 'Automatically picks the best image provider for your prompt and style',
  };
  const providers = IMAGE_PROVIDER_CATALOG
    .filter(p => p.showInDropdown === true)
    .map(p => ({ id: p.id, name: p.name, description: p.description }));
  return [auto, ...providers];
}

// Returns the list of image-to-image providers for the Quick Create I2I
// dropdown. The auto-select entry is always prepended. Any provider added to
// IMAGE_PROVIDER_CATALOG with `showInI2IDropdown: true` will automatically
// appear here — no other code change required.
export function getDropdownI2IProviders(): Array<{ id: string; name: string; description: string }> {
  const auto = {
    id: 'auto',
    name: 'Auto (Best Match)',
    description: 'Automatically selects the best image-to-image transformation provider',
  };
  const providers = IMAGE_PROVIDER_CATALOG
    .filter(p => p.showInI2IDropdown === true)
    .map(p => ({ id: p.id, name: p.name, description: p.description }));
  return [auto, ...providers];
}

// Returns the list of video-to-video providers for the Quick Create V2V
// dropdown. The auto-select entry is always prepended. Any provider added to
// VIDEO_PROVIDER_CATALOG with `showInV2VDropdown: true` will automatically
// appear here — no other code change required.
export function getDropdownV2VProviders(): Array<{ id: string; name: string; description: string }> {
  const auto = {
    id: 'auto',
    name: 'Auto (Kling Object Replace)',
    description: 'Automatically uses Kling for seamless object replacement',
  };
  const providers = VIDEO_PROVIDER_CATALOG
    .filter(p => p.showInV2VDropdown === true)
    .map(p => ({ id: p.id, name: p.name, description: p.description }));
  return [auto, ...providers];
}

// Returns image providers for the ProviderSelector and RegenerationOptions
// image dropdown. The auto-select entry is always prepended. Any provider
// added to IMAGE_PROVIDER_CATALOG with `showInImageDropdown: true` will
// automatically appear — no other code change required. Each entry exposes
// the capability flags (supportsI2I, supportsStyle) used by the UI to filter
// providers by reference mode. The auto entry advertises both flags as true
// so it is never excluded by reference-mode filters.
export function getImageDropdownProviders(): Array<{
  id: string;
  name: string;
  description: string;
  supportsI2I: boolean;
  supportsStyle: boolean;
}> {
  const auto = {
    id: 'auto',
    name: 'Auto (Best Match)',
    description: 'Automatically picks the best image provider for your prompt and style',
    supportsI2I: true,
    supportsStyle: true,
  };
  const providers = IMAGE_PROVIDER_CATALOG
    .filter(p => p.showInImageDropdown === true)
    .map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      supportsI2I: p.supportsI2I === true,
      supportsStyle: p.supportsStyle === true,
    }));
  return [auto, ...providers];
}

// Returns the list of video providers for the Quick Create and Asset Creator
// dropdowns. The auto-select entry is always prepended. Any provider added to
// VIDEO_PROVIDER_CATALOG with `showInDropdown: true` will automatically appear
// here — no other code change required.
//
// Pass `mode` to restrict the list to providers that support that generation
// mode (e.g. 'i2v' will exclude providers whose supportedModes only includes
// 't2v'). When mode is omitted, all showInDropdown providers are returned.
export function getDropdownVideoProviders(
  mode?: 't2v' | 'i2v' | 'v2v',
): Array<{ id: string; name: string; description: string }> {
  const auto = {
    id: 'auto',
    name: 'Auto (Best Match)',
    description: 'Automatically picks the best provider for your prompt and style',
  };
  const providers = VIDEO_PROVIDER_CATALOG
    .filter(p => p.showInDropdown === true)
    .filter(p => !mode || p.supportedModes.includes(mode))
    .map(p => ({ id: p.id, name: p.name, description: p.description }));
  return [auto, ...providers];
}

// Phase 20D (Task #136): single source of truth for the per-scene
// `generateNativeAudio` toggle. Every consumer (the UI toggle's
// disabled-state, the ai-video-service forwarding gate, and any future
// payload gate) must read this — DO NOT reintroduce a model-string
// allowlist anywhere downstream. Adding a new audio-toggleable model
// is a one-line `supportsNativeAudio: true` in VIDEO_PROVIDER_CATALOG.
export function providerSupportsNativeAudio(providerId: string | undefined | null): boolean {
  if (!providerId) return false;
  const entry = VIDEO_PROVIDER_CATALOG.find(p => p.id === providerId);
  return entry?.supportsNativeAudio === true;
}

// Derives multi-image capability from VIDEO_PROVIDERS in provider-config.ts
// (the authoritative source for provider capabilities). Returns true when the
// provider has a multiImageSupport object configured (i.e. supports @imageN syntax).
// provider-config.ts has zero imports so there is no circular-dependency risk.
export function providerSupportsMultiImage(providerId: string | undefined | null): boolean {
  if (!providerId) return false;
  return !!VIDEO_PROVIDERS[providerId]?.multiImageSupport;
}
