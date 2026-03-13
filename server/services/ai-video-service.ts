// server/services/ai-video-service.ts

import { piapiVideoService } from './piapi-video-service';
import { runwayVideoService } from './runway-video-service';
import { promptEnhancementService } from './prompt-enhancement-service';
import { intelligentProviderSelector, SceneContent } from './intelligent-provider-selector';
import { 
  AI_VIDEO_PROVIDERS, 
  selectProvidersForScene, 
  getConfiguredProviders,
  getTestedProviders,
  clearProviderCache
} from '../config/ai-video-providers';
import { getVisualStyleConfig, VisualStyleConfig } from '@shared/visual-style-config';
import { getMotionControl, MotionControlConfig } from '@shared/config/motion-control';
import { optimizePrompt, logPromptOptimization, analyzePrompt } from './video-prompt-optimizer';
import { getAnyBrandContext, getBrandNameOrDefault } from './brand-settings-service';
import { getVisualArtPreset, VisualArtPreset, isStylizedPreset as isStylizedPresetCheck } from '../../shared/config/visual-art-presets';
import { getSceneContentTag, SceneContentTag } from '../../shared/config/scene-content-tags';

interface AIVideoResult {
  success: boolean;
  videoUrl?: string;
  s3Url?: string;
  provider?: string;
  duration?: number;
  cost?: number;
  error?: string;
  generationTimeMs?: number;
}

interface I2VSettingsInput {
  imageControlStrength?: number; // 0-1: how much to preserve source image
  animationStyle?: 'product-hero' | 'product-static' | 'subtle-motion' | 'dynamic';
  motionStrength?: number; // 0-1: how much motion/animation
}

interface AIVideoOptions {
  prompt: string;
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  sceneType: string;
  preferredProvider?: string;
  negativePrompt?: string;
  narration?: string;
  mood?: string;
  contentType?: 'person' | 'product' | 'nature' | 'abstract' | 'lifestyle';
  visualStyle?: string;
  imageUrl?: string;
  imageUrls?: string[];
  qualityTier?: 'ultra' | 'premium' | 'standard';
  i2vSettings?: I2VSettingsInput;
  motionOverride?: MotionControlConfig;
  artPresetId?: string;
  contentTag?: string;
  isCharacterReference?: boolean;
}

// Maps base provider + quality tier to the appropriate versioned provider
const TIER_PROVIDER_VERSIONS: Record<string, Record<string, string>> = {
  kling: {
    ultra: 'kling-2.6',
    premium: 'kling-2.6',
    standard: 'kling-2.6',
  },
  luma: {
    ultra: 'luma',
    premium: 'luma',
    standard: 'luma',
  },
  hailuo: {
    ultra: 'hailuo',
    premium: 'hailuo',
    standard: 'hailuo',
  },
  veo: {
    ultra: 'veo-3.1',
    premium: 'veo-3',
    standard: 'veo-3',
  },
  hunyuan: {
    ultra: 'hunyuan',
    premium: 'hunyuan',
    standard: 'hunyuan',
  },
  wan: {
    ultra: 'wan-2.6',
    premium: 'wan-2.6',
    standard: 'wan-2.6',
  },
  runway: {
    ultra: 'runway-4.5',
    premium: 'runway-4.5',
    standard: 'runway',
  },
};

class AIVideoService {
  
  constructor() {
    console.log('[AIVideoService] Initializing multi-provider service...');
    const providers = getConfiguredProviders();
    console.log(`[AIVideoService] Configured providers: ${providers.join(', ') || 'none'}`);
  }
  
  isAvailable(): boolean {
    return getConfiguredProviders().length > 0;
  }

  getAvailableProviders(): string[] {
    return getConfiguredProviders();
  }

  async getTestedAvailableProviders(): Promise<string[]> {
    return getTestedProviders();
  }

  async generateVideo(options: AIVideoOptions): Promise<AIVideoResult> {
    const configuredProviders = await getTestedProviders();
    
    if (configuredProviders.length === 0) {
      return { success: false, error: 'No AI video providers configured' };
    }
    
    console.log(`[AIVideo] Using ${configuredProviders.length} tested providers: ${configuredProviders.join(', ')}`);

    // Get visual style configuration (Phase 5B)
    const styleConfig = getVisualStyleConfig(options.visualStyle || 'professional');
    
    // Resolve art preset if provided
    const artPreset = options.artPresetId ? getVisualArtPreset(options.artPresetId) : null;
    if (artPreset) {
      console.log(`[AIVideo] Art preset active: ${artPreset.name} (${artPreset.id})`);
    }
    
    const contentTag = options.contentTag ? getSceneContentTag(options.contentTag) : null;
    if (contentTag) {
      console.log(`[AIVideo] Content tag active: ${contentTag.label} (${contentTag.id}) — overrides prompt engineering for this scene`);
    }
    
    // Determine content type from style config if not provided
    const contentType = options.contentType || 
      styleConfig.defaultContentTypes[options.sceneType as keyof typeof styleConfig.defaultContentTypes] ||
      'lifestyle';
    
    const generationMode = options.imageUrl ? 'i2v' : 't2v';
    
    let enhancedOptions: AIVideoOptions;
    
    const isStylizedArt = artPreset && isStylizedPresetCheck(artPreset.id);

    if (generationMode === 'i2v') {
      let i2vPrompt: string;
      if (options.isCharacterReference) {
        console.log(`[AIVideo] CHARACTER REFERENCE I2V — preserving full scene prompt (no motion simplification)`);
        console.log(`[AIVideo] Character I2V prompt: ${options.prompt.substring(0, 150)}...`);
        i2vPrompt = options.prompt;
      } else {
        console.log(`[AIVideo] I2V mode - using motion-focused prompt (no style bloat)`);
        console.log(`[AIVideo] Original I2V prompt: ${options.prompt.substring(0, 100)}...`);
        i2vPrompt = this.adaptPromptForI2V(options.prompt);
      }
      if (contentTag) {
        i2vPrompt = `${contentTag.promptPrefix} ${i2vPrompt}`;
      } else if (artPreset && !isStylizedArt) {
        i2vPrompt = `${artPreset.imagePromptPrefix} ${i2vPrompt}`;
      } else if (isStylizedArt && artPreset) {
        const styleKw = (artPreset as any).styleKeywords || [];
        const pLower = i2vPrompt.toLowerCase();
        const hasMarker = styleKw.length > 0 ? styleKw.some((kw: string) => pLower.includes(kw)) : false;
        if (!hasMarker) {
          const prefix = (artPreset as any).styleMarkerPrefix || artPreset.name;
          i2vPrompt = `${prefix} — ${i2vPrompt}`;
          console.log(`[AIVideo] I2V stylized preset "${artPreset.name}" — prepended style marker: "${prefix}"`);
        }
      }
      if (isStylizedArt && artPreset) {
        const styleLabel = (artPreset as any).styleMarkerPrefix || artPreset.name;
        i2vPrompt = `${i2vPrompt}. All environments, backgrounds, and settings must be rendered in ${styleLabel} style — no photorealistic elements.`;
        console.log(`[AIVideo] I2V environment style reinforcement appended for "${artPreset.name}"`);
      }
      console.log(`[AIVideo] Adapted I2V prompt: ${i2vPrompt.substring(0, 100)}...`);
      enhancedOptions = {
        ...options,
        prompt: i2vPrompt,
        contentType,
      };
    } else {
      let basePrompt = options.prompt;
      if (contentTag) {
        basePrompt = `${contentTag.promptPrefix} ${basePrompt}, ${contentTag.promptSuffix}`;
        console.log(`[AIVideo] Content tag '${contentTag.label}' applied to prompt: ${basePrompt.substring(0, 120)}...`);
      } else if (artPreset && !isStylizedArt) {
        basePrompt = `${artPreset.imagePromptPrefix} ${basePrompt}, ${artPreset.imagePromptSuffix}`;
        console.log(`[AIVideo] Art preset applied to prompt: ${basePrompt.substring(0, 120)}...`);
      } else if (isStylizedArt && artPreset) {
        const styleKeywords = (artPreset as any).styleKeywords || [];
        const promptLower = basePrompt.toLowerCase();
        const hasStyleMarker = styleKeywords.length > 0
          ? styleKeywords.some((kw: string) => promptLower.includes(kw))
          : false;
        if (!hasStyleMarker) {
          const prefix = (artPreset as any).styleMarkerPrefix || artPreset.name;
          basePrompt = `${prefix} — ${basePrompt}`;
          console.log(`[AIVideo] Stylized preset "${artPreset.name}" — prepended style marker: "${prefix}"`);
        } else {
          console.log(`[AIVideo] Stylized preset "${artPreset.name}" — style keywords already present in prompt`);
        }
      }
      
      // Build enhanced prompt with style modifiers
      const styleEnhancedPrompt = this.applyStyleToPrompt(basePrompt, styleConfig);
      
      console.log(`[AIVideo] Using style: ${styleConfig.name}`);

      console.log(`[PromptEnhance] Enhancing prompt for ${options.sceneType} scene`);
      const enhanced = await promptEnhancementService.enhanceVideoPrompt(
        styleEnhancedPrompt,
        {
          sceneType: options.sceneType,
          narration: options.narration,
          mood: options.mood || styleConfig.promptModifiers.mood,
          contentType,
          excludeElements: styleConfig.negativePromptAdditions,
        }
      );
      
      console.log(`[AIVideo] Enhanced prompt for ${options.sceneType} scene`);
      
      const rawProvider = options.preferredProvider && options.preferredProvider !== 'auto' ? options.preferredProvider : 'kling';
      const normalizedProvider = rawProvider.split('-')[0];
      
      const includeProduct = ['product', 'solution', 'cta', 'feature'].includes(options.sceneType?.toLowerCase() || '');
      
      const optimized = optimizePrompt({
        visualDescription: enhanced.prompt,
        sceneType: options.sceneType || 'general',
        includeProduct,
        productName: 'product',
        visualStyle: options.visualStyle || 'lifestyle',
        generationMode,
        provider: normalizedProvider,
        artPresetId: options.artPresetId,
      });
      
      logPromptOptimization(options.prompt, optimized);
      
      const analysis = analyzePrompt(optimized.prompt);
      if (analysis.score < 70) {
        console.log(`[AIVideo] Prompt quality warning (score: ${analysis.score}): ${analysis.issues.join(', ')}`);
      }
      
      let negativePrompt = optimized.negativePrompt || enhanced.negativePrompt;
      if (contentTag && contentTag.negativePromptAdditions.length > 0) {
        negativePrompt = `${negativePrompt}, ${contentTag.negativePromptAdditions.join(', ')}`;
      } else if (artPreset && artPreset.negativePromptAdditions.length > 0) {
        negativePrompt = `${negativePrompt}, ${artPreset.negativePromptAdditions.join(', ')}`;
      }
      
      let finalPrompt = optimized.prompt;
      if (isStylizedArt && artPreset) {
        const styleLabel = (artPreset as any).styleMarkerPrefix || artPreset.name;
        finalPrompt = `[STYLE: ${styleLabel} — NOT photorealistic, NOT live-action] ${finalPrompt}. All environments, characters, and settings must be rendered in ${styleLabel} style — no photorealistic or live-action elements whatsoever.`;
        console.log(`[AIVideo] T2V style reinforcement (prefix+suffix) applied for "${artPreset.name}"`);
      }

      const FINAL_MAX_WORDS = 150;
      const finalWords = finalPrompt.split(/\s+/);
      if (finalWords.length > FINAL_MAX_WORDS) {
        const charBlockPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\((?:late-\d+s\s+\w+|[^)]*(?:hair|eyes?|skin|build|wearing)[^)]*)[^)]{15,}\)/g;
        const charBlocks: string[] = [];
        finalPrompt.replace(charBlockPattern, (match) => { charBlocks.push(match); return ''; });
        const stylePrefix = finalPrompt.match(/^\[STYLE:[^\]]+\]\s*/)?.[0] || '';
        const styleSuffix = finalPrompt.match(/\.\s*All environments[^.]+whatsoever\.$/)?.[0] || '';
        let middleContent = finalPrompt.slice(stylePrefix.length, styleSuffix ? finalPrompt.length - styleSuffix.length : undefined);
        for (const block of charBlocks) {
          middleContent = middleContent.replace(block, `__CB__`);
        }
        const middleWords = middleContent.split(/\s+/);
        const protectedWordCount = stylePrefix.split(/\s+/).filter(Boolean).length + styleSuffix.split(/\s+/).filter(Boolean).length + charBlocks.reduce((sum, b) => sum + b.split(/\s+/).length, 0);
        const allowedMiddleWords = Math.max(20, FINAL_MAX_WORDS - protectedWordCount);
        if (middleWords.length > allowedMiddleWords) {
          middleContent = middleWords.slice(0, allowedMiddleWords).join(' ');
        }
        let blockIdx = 0;
        middleContent = middleContent.replace(/__CB__/g, () => charBlocks[blockIdx++] || '');
        finalPrompt = (stylePrefix + middleContent + (styleSuffix ? ' ' + styleSuffix.trim() : '')).replace(/\s{2,}/g, ' ').trim();
        console.log(`[AIVideo] Post-assembly length enforcement: trimmed to ~${finalPrompt.split(/\s+/).length} words (limit ${FINAL_MAX_WORDS})`);
      }

      enhancedOptions = {
        ...options,
        prompt: finalPrompt,
        negativePrompt,
        contentType,
      };
    }

    // Select providers using intelligent Claude-based analysis when narration available
    let providerOrder: string[];
    const qualityTier = options.qualityTier || 'standard';
    
    if (enhancedOptions.preferredProvider && enhancedOptions.preferredProvider !== 'auto') {
      providerOrder = [enhancedOptions.preferredProvider];
      console.log(`[AIVideo] Using STRICT user-selected provider: ${enhancedOptions.preferredProvider} (no fallbacks)`);
    } else if (options.narration && options.prompt) {
      const recommendation = await this.getIntelligentProviderRecommendation(options, configuredProviders);
      providerOrder = recommendation.providerOrder;
      console.log(`[AIVideo] Intelligent selection: ${recommendation.reasoning}`);
    } else {
      providerOrder = this.selectProvidersForStyle(styleConfig.preferredVideoProviders, enhancedOptions.sceneType, contentType, configuredProviders);
    }
    
    let sceneTypeMappedProviders: Set<string> = new Set();
    if (artPreset && (!enhancedOptions.preferredProvider || enhancedOptions.preferredProvider === 'auto')) {
      let sceneTypeProviders: string[] | null = null;
      let mappingKey: string | null = null;

      if (artPreset.sceneTypeProviderMap) {
        const motionKeywords = /\b(arc|orbit|pull[- ]?back|push[- ]?in|tracking shot|crane|dolly|motion control|sweeping pan|circular)\b/i;
        if (motionKeywords.test(options.prompt || '')) {
          sceneTypeProviders = artPreset.sceneTypeProviderMap['motion-control'] || null;
          mappingKey = 'motion-control (keyword)';
        }

        if (!sceneTypeProviders && enhancedOptions.sceneType) {
          sceneTypeProviders = artPreset.sceneTypeProviderMap[enhancedOptions.sceneType] || null;
          mappingKey = enhancedOptions.sceneType;
        }

        if (!sceneTypeProviders && contentType) {
          sceneTypeProviders = artPreset.sceneTypeProviderMap[contentType] || null;
          mappingKey = `${contentType} (classification)`;
        }
      }

      const presetProviders = sceneTypeProviders || artPreset.recommendedProviders?.video || [];
      const filteredProviders = presetProviders.filter((p: string) => configuredProviders.some(cp => cp === p || cp.startsWith(p + '-') || cp.startsWith(p)));
      if (filteredProviders.length > 0) {
        const remaining = providerOrder.filter((p: string) => !filteredProviders.includes(p));
        providerOrder = [...filteredProviders, ...remaining];
        if (sceneTypeProviders) {
          filteredProviders.forEach(p => sceneTypeMappedProviders.add(p));
        }
        console.log(`[AIVideo] Art preset '${artPreset.name}' routed ${mappingKey ? `'${mappingKey}'` : 'default'} → [${filteredProviders.join(', ')}]`);
      }
    }

    if (contentTag && contentTag.recommendedProviders.video.length > 0 && (!enhancedOptions.preferredProvider || enhancedOptions.preferredProvider === 'auto')) {
      const tagProviders = contentTag.recommendedProviders.video.filter(p => configuredProviders.some(cp => cp === p || cp.startsWith(p)));
      if (tagProviders.length > 0) {
        const remaining = providerOrder.filter(p => !tagProviders.includes(p));
        providerOrder = [...tagProviders, ...remaining];
        console.log(`[AIVideo] Content tag '${contentTag.label}' boosted providers: ${tagProviders.join(', ')} to front of order`);
      }
    }

    // Map base providers to tier-appropriate versions
    // Skip tier mapping when user explicitly selected a provider or when providers came from sceneTypeProviderMap
    const isExplicitSelection = !!enhancedOptions.preferredProvider && enhancedOptions.preferredProvider !== 'auto';
    const tierAdjustedOrder = isExplicitSelection ? providerOrder : providerOrder.map(baseProvider => {
      if (sceneTypeMappedProviders.has(baseProvider)) {
        return baseProvider;
      }
      const baseName = baseProvider.split('-')[0];
      const tierVersions = TIER_PROVIDER_VERSIONS[baseName];
      if (tierVersions && tierVersions[qualityTier]) {
        const versionedProvider = tierVersions[qualityTier];
        if (versionedProvider !== baseProvider) {
          console.log(`[AIVideo] Quality tier ${qualityTier}: ${baseProvider} → ${versionedProvider}`);
        }
        return versionedProvider;
      }
      return baseProvider;
    });

    const validOrder = [...new Set(tierAdjustedOrder)].filter(p => {
      if (!AI_VIDEO_PROVIDERS[p]) {
        console.warn(`[AIVideo] Skipping unknown provider "${p}" from order`);
        return false;
      }
      return true;
    });

    console.log(`[AIVideo] Scene: ${enhancedOptions.sceneType}, Quality: ${qualityTier}`);
    console.log(`[AIVideo] Provider order: ${validOrder.join(' → ')}`);

    for (const providerKey of validOrder) {
      const provider = AI_VIDEO_PROVIDERS[providerKey];
      
      console.log(`[AIVideo] Trying ${providerKey}...`);
      
      try {
        const result = await this.generateWithProvider(providerKey, provider, enhancedOptions);
        
        if (result.success && result.s3Url) {
          console.log(`[AIVideo] ✓ Success with ${providerKey}`);
          return {
            ...result,
            provider: providerKey,
          };
        }
        
        console.warn(`[AIVideo] ✗ ${providerKey} failed: ${result.error}`);
        
      } catch (error: any) {
        console.warn(`[AIVideo] ✗ ${providerKey} error: ${error.message}`);
      }
    }

    return { 
      success: false, 
      error: `All providers failed for ${enhancedOptions.sceneType} scene` 
    };
  }

  private async generateWithProvider(
    providerKey: string,
    provider: typeof AI_VIDEO_PROVIDERS[string],
    options: AIVideoOptions
  ): Promise<AIVideoResult> {
    if (provider.apiProvider === 'runway' || runwayVideoService.isRunwayModel(providerKey)) {
      return this.generateViaRunway(providerKey, options);
    }
    return this.generateViaPiAPI(providerKey, options);
  }

  private async generateViaRunway(
    providerKey: string,
    options: AIVideoOptions
  ): Promise<AIVideoResult> {
    if (!runwayVideoService.isAvailable()) {
      return { success: false, error: 'RUNWAY_API_KEY not configured' };
    }

    console.log(`[AIVideo] Using direct Runway API for ${providerKey}`);

    const result = await runwayVideoService.generateVideo({
      prompt: options.prompt,
      duration: options.duration,
      aspectRatio: options.aspectRatio,
      model: providerKey,
      imageUrl: options.imageUrl,
      negativePrompt: options.negativePrompt,
      i2vSettings: options.i2vSettings,
    });

    return {
      success: result.success,
      videoUrl: result.videoUrl,
      s3Url: result.s3Url || result.videoUrl,
      duration: result.duration,
      cost: result.cost,
      error: result.error,
      generationTimeMs: result.generationTimeMs,
    };
  }

  private async generateViaPiAPI(
    providerKey: string,
    options: AIVideoOptions
  ): Promise<AIVideoResult> {
    if (!piapiVideoService.isAvailable()) {
      return { success: false, error: 'PiAPI not configured' };
    }
    
    // Calculate intelligent motion control for this scene (Phase 16)
    // getMotionControl(sceneType, visualDirection, overrideConfig)
    const motionControl = options.motionOverride || getMotionControl(
      options.sceneType,
      options.prompt, // Use prompt as visual direction for content analysis
    );
    
    console.log(`[AIVideo] Motion control: ${motionControl.camera_movement} @ ${motionControl.intensity}`);
    console.log(`[AIVideo] Motion rationale: ${motionControl.rationale}`);
    
    // If imageUrl provided, use I2V (image-to-video) instead of T2V (text-to-video)
    if (options.imageUrl) {
      console.log(`[AIVideo] Using I2V for ${providerKey} with source image: ${options.imageUrl.substring(0, 50)}...`);
      if (options.i2vSettings) {
        console.log(`[AIVideo] I2V Settings: fidelity=${options.i2vSettings.imageControlStrength}, style=${options.i2vSettings.animationStyle}, motion=${options.i2vSettings.motionStrength}`);
      }
      const result = await piapiVideoService.generateImageToVideo({
        imageUrl: options.imageUrl,
        imageUrls: options.imageUrls,
        prompt: options.prompt,
        duration: options.duration,
        aspectRatio: options.aspectRatio,
        model: providerKey,
        negativePrompt: options.negativePrompt,
        i2vSettings: options.i2vSettings,
        motionControl,
        isCharacterReference: options.isCharacterReference,
        artPresetId: options.artPresetId,
      });
      
      return {
        success: result.success,
        videoUrl: result.videoUrl,
        s3Url: result.s3Url,
        duration: result.duration,
        cost: result.cost,
        error: result.error,
        generationTimeMs: result.generationTimeMs,
      };
    }
    
    // Standard T2V generation with intelligent motion control
    const result = await piapiVideoService.generateVideo({
      prompt: options.prompt,
      duration: options.duration,
      aspectRatio: options.aspectRatio,
      model: providerKey,
      negativePrompt: options.negativePrompt,
      motionControl, // Pass motion control for T2V
    });
    
    return {
      success: result.success,
      videoUrl: result.videoUrl,
      s3Url: result.s3Url,
      duration: result.duration,
      cost: result.cost,
      error: result.error,
      generationTimeMs: result.generationTimeMs,
    };
  }

  /**
   * Apply visual style modifiers to the prompt (Phase 5B)
   */
  private adaptPromptForI2V(prompt: string): string {
    const motionKeywords = ['slow pan', 'pan', 'zoom', 'dolly', 'orbit', 'track', 'motion', 'moving', 'walking', 'flowing', 'gentle movement', 'subtle movement', 'camera moves', 'parallax', 'drift', 'sway', 'breathe', 'animate'];
    const hasMotionDirection = motionKeywords.some(kw => prompt.toLowerCase().includes(kw));

    if (hasMotionDirection) {
      return prompt;
    }

    const isSceneDescription = /^(a |an |the |warm|inviting|cozy|bright|dark|elegant|modern|rustic|professional|beautiful|stunning)/i.test(prompt.trim());

    if (isSceneDescription) {
      return `Gentle, subtle camera movement. Slow dolly forward with natural ambient motion — lights gently flickering, slight parallax depth. ${prompt.substring(0, 60).trim()}.`;
    }

    return `Subtle, natural motion and gentle camera movement. ${prompt}`;
  }

  private applyStyleToPrompt(prompt: string, style: VisualStyleConfig): string {
    const modifiers = style.promptModifiers;
    const parts = [
      prompt,
      modifiers.mood,
      modifiers.lighting,
      modifiers.cameraWork,
      modifiers.colorGrade,
      style.stylePromptSuffix,
    ];
    return parts.filter(p => p).join(', ');
  }

  /**
   * Select providers based on style preferences and scene requirements (Phase 5B)
   */
  private selectProvidersForStyle(
    preferredProviders: string[],
    sceneType: string,
    contentType: string,
    configuredProviders: string[]
  ): string[] {
    // Start with style-preferred providers, filtered by what's configured
    const providers = preferredProviders.filter(p => configuredProviders.includes(p));
    
    // Add any configured providers not in preferred list as fallbacks
    for (const p of configuredProviders) {
      if (!providers.includes(p)) {
        providers.push(p);
      }
    }
    
    // Adjust for specific scene/content needs
    if (contentType === 'person') {
      const personProviders = ['kling', 'sora-2'];
      personProviders.forEach(p => {
        const idx = providers.indexOf(p);
        if (idx > 0) {
          providers.splice(idx, 1);
          providers.unshift(p);
        }
      });
    }
    
    if (sceneType === 'cta') {
      const klingIdx = providers.indexOf('kling');
      if (klingIdx > 0) {
        providers.splice(klingIdx, 1);
        providers.unshift('kling');
      }
    }
    
    return providers;
  }

  /**
   * Get intelligent provider recommendation using Claude analysis
   */
  private async getIntelligentProviderRecommendation(
    options: AIVideoOptions,
    configuredProviders: string[]
  ): Promise<{ providerOrder: string[]; reasoning: string }> {
    try {
      const sceneContent: SceneContent = {
        sceneId: `scene_${options.sceneType}`,
        sceneIndex: 0,
        sceneType: options.sceneType,
        narration: options.narration || '',
        visualDirection: options.prompt,
        duration: options.duration,
      };

      const result = await intelligentProviderSelector.recommendProviderForScene(sceneContent);
      
      let recommendedProvider = result.recommendedProvider;
      let fallbackProvider = result.fallbackProvider;
      
      const specificProvider = intelligentProviderSelector.resolveSpecificProvider(
        recommendedProvider,
        result.contentClassification,
        options.sceneType
      );
      if (specificProvider !== recommendedProvider) {
        console.log(`[AIVideo] Resolved ${recommendedProvider} → ${specificProvider} for ${result.contentClassification} content`);
      }
      
      const isProviderAvailable = (p: string) => configuredProviders.some(cp => cp === p || cp.startsWith(p + '-') || cp.startsWith(p));
      
      const resolvedAvailable = configuredProviders.includes(specificProvider);
      const baseAvailable = isProviderAvailable(recommendedProvider);
      
      let primaryProvider: string;
      if (resolvedAvailable) {
        primaryProvider = specificProvider;
      } else if (baseAvailable) {
        primaryProvider = recommendedProvider;
        console.log(`[AIVideo] Specific provider "${specificProvider}" not tested, using base "${recommendedProvider}"`);
      } else {
        primaryProvider = configuredProviders[0] || 'kling-2.6';
        console.log(`[AIVideo] Recommended provider "${recommendedProvider}" not in tested providers, using first available`);
      }
      
      if (fallbackProvider && !isProviderAvailable(fallbackProvider)) {
        fallbackProvider = configuredProviders[1]?.split('-')[0] || configuredProviders[0]?.split('-')[0] || 'hailuo';
      }
      
      const providerOrder: string[] = [primaryProvider];
      if (recommendedProvider !== primaryProvider && isProviderAvailable(recommendedProvider)) {
        providerOrder.push(recommendedProvider);
      }
      if (fallbackProvider && !providerOrder.includes(fallbackProvider) && isProviderAvailable(fallbackProvider)) {
        providerOrder.push(fallbackProvider);
      }
      for (const p of configuredProviders) {
        if (!providerOrder.includes(p)) {
          providerOrder.push(p);
        }
      }

      return {
        providerOrder,
        reasoning: `${result.contentClassification} content (${result.confidence}% confidence): ${result.reasoning}`,
      };
    } catch (error: any) {
      console.warn('[AIVideo] Intelligent selection failed, using default order:', error.message);
      return {
        providerOrder: ['kling-2.6', ...configuredProviders.filter(p => p !== 'kling-2.6')],
        reasoning: 'Fallback to Kling (intelligent selection unavailable)',
      };
    }
  }

  estimateCost(duration: number, providerKey?: string): number {
    if (providerKey && AI_VIDEO_PROVIDERS[providerKey]) {
      return duration * AI_VIDEO_PROVIDERS[providerKey].costPerSecond;
    }
    return duration * 0.04;
  }
}

export const aiVideoService = new AIVideoService();
