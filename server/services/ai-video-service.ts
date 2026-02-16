// server/services/ai-video-service.ts

import { runwayVideoService } from './runway-video-service';
import { piapiVideoService } from './piapi-video-service';
import { promptEnhancementService } from './prompt-enhancement-service';
import { intelligentProviderSelector, SceneContent } from './intelligent-provider-selector';
import { 
  AI_VIDEO_PROVIDERS, 
  selectProvidersForScene, 
  getConfiguredProviders 
} from '../config/ai-video-providers';
import { getVisualStyleConfig, VisualStyleConfig } from '@shared/visual-style-config';
import { getMotionControl, MotionControlConfig } from '@shared/config/motion-control';
import { optimizePrompt, logPromptOptimization, analyzePrompt } from './video-prompt-optimizer';

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
  qualityTier?: 'ultra' | 'premium' | 'standard';
  i2vSettings?: I2VSettingsInput; // I2V-specific settings from UI
  motionOverride?: MotionControlConfig; // Manual motion control override from UI
}

// Maps base provider + quality tier to the appropriate versioned provider
const TIER_PROVIDER_VERSIONS: Record<string, Record<string, string>> = {
  kling: {
    ultra: 'kling-2.6',
    premium: 'kling-2.6',
    standard: 'kling-2.5',
  },
  runway: {
    ultra: 'runway',
    premium: 'runway',
    standard: 'runway',
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
    premium: 'veo-2',
    standard: 'veo',
  },
  hunyuan: {
    ultra: 'hunyuan',
    premium: 'hunyuan',
    standard: 'hunyuan',
  },
  wan: {
    ultra: 'wan-2.6',
    premium: 'wan-2.6',
    standard: 'wan-2.1',
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

  async generateVideo(options: AIVideoOptions): Promise<AIVideoResult> {
    const configuredProviders = getConfiguredProviders();
    
    if (configuredProviders.length === 0) {
      return { success: false, error: 'No AI video providers configured' };
    }

    // Get visual style configuration (Phase 5B)
    const styleConfig = getVisualStyleConfig(options.visualStyle || 'professional');
    
    // Determine content type from style config if not provided
    const contentType = options.contentType || 
      styleConfig.defaultContentTypes[options.sceneType as keyof typeof styleConfig.defaultContentTypes] ||
      'lifestyle';
    
    // Build enhanced prompt with style modifiers
    const styleEnhancedPrompt = this.applyStyleToPrompt(options.prompt, styleConfig);
    
    console.log(`[AIVideo] Using style: ${styleConfig.name}`);

    // ENHANCE PROMPT WITH BRAND CONTEXT AND SAFETY
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
    
    // PHASE 6R: Optimize prompt - strip jargon, simplify for AI video generation
    const generationMode = options.imageUrl ? 'i2v' : 't2v';
    
    // Normalize provider name (strip version numbers like "kling-2.6" -> "kling")
    const rawProvider = options.preferredProvider || 'piapi';
    const normalizedProvider = rawProvider.split('-')[0];
    
    // Detect if product should be included based on scene type
    const includeProduct = ['product', 'solution', 'cta', 'feature'].includes(options.sceneType?.toLowerCase() || '');
    
    const optimized = optimizePrompt({
      visualDescription: enhanced.prompt,
      sceneType: options.sceneType || 'general',
      includeProduct,
      productName: 'Pine Hill supplement',
      visualStyle: options.visualStyle || 'lifestyle',
      generationMode,
      provider: normalizedProvider,
    });
    
    logPromptOptimization(options.prompt, optimized);
    
    // Analyze prompt quality
    const analysis = analyzePrompt(optimized.prompt);
    if (analysis.score < 70) {
      console.log(`[AIVideo] Prompt quality warning (score: ${analysis.score}): ${analysis.issues.join(', ')}`);
    }
    
    // Create enhanced options with brand context, optimized prompt, and negative prompt
    const enhancedOptions: AIVideoOptions = {
      ...options,
      prompt: optimized.prompt,
      negativePrompt: optimized.negativePrompt || enhanced.negativePrompt,
      contentType,
    };

    // Select providers using intelligent Claude-based analysis when narration available
    let providerOrder: string[];
    const qualityTier = options.qualityTier || 'standard';
    
    if (enhancedOptions.preferredProvider) {
      providerOrder = [enhancedOptions.preferredProvider, ...configuredProviders.filter(p => p !== enhancedOptions.preferredProvider)];
      console.log(`[AIVideo] Using explicit preferred provider: ${enhancedOptions.preferredProvider}`);
    } else if (options.narration && options.prompt) {
      // Use Claude-based intelligent provider selection
      const recommendation = await this.getIntelligentProviderRecommendation(options, configuredProviders);
      providerOrder = recommendation.providerOrder;
      console.log(`[AIVideo] Intelligent selection: ${recommendation.reasoning}`);
    } else {
      // Fallback to rule-based selection
      providerOrder = this.selectProvidersForStyle(styleConfig.preferredVideoProviders, enhancedOptions.sceneType, contentType, configuredProviders);
    }

    // Map base providers to tier-appropriate versions
    const tierAdjustedOrder = providerOrder.map(baseProvider => {
      // Extract base provider name (e.g., 'kling' from 'kling-2.6')
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

    console.log(`[AIVideo] Scene: ${enhancedOptions.sceneType}, Quality: ${qualityTier}`);
    console.log(`[AIVideo] Provider order: ${tierAdjustedOrder.join(' → ')}`);

    for (const providerKey of tierAdjustedOrder) {
      const provider = AI_VIDEO_PROVIDERS[providerKey];
      
      if (!provider) continue;
      
      console.log(`[AIVideo] Trying ${provider.name}...`);
      
      try {
        const result = await this.generateWithProvider(providerKey, provider, enhancedOptions);
        
        if (result.success && result.s3Url) {
          console.log(`[AIVideo] ✓ Success with ${provider.name}`);
          return {
            ...result,
            provider: providerKey,
          };
        }
        
        console.warn(`[AIVideo] ✗ ${provider.name} failed: ${result.error}`);
        
      } catch (error: any) {
        console.warn(`[AIVideo] ✗ ${provider.name} error: ${error.message}`);
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
    
    if (provider.type === 'direct') {
      return this.generateDirect(providerKey, options);
    } else {
      return this.generateViaPiAPI(providerKey, options);
    }
  }

  private async generateDirect(
    providerKey: string,
    options: AIVideoOptions
  ): Promise<AIVideoResult> {
    if (providerKey === 'runway') {
      if (!runwayVideoService.isAvailable()) {
        return { success: false, error: 'Runway not configured' };
      }
      
      if (options.imageUrl && options.i2vSettings) {
        console.log(`[AIVideo] Using Runway I2V with settings: style=${options.i2vSettings.animationStyle}, fidelity=${options.i2vSettings.imageControlStrength}`);
      }
      
      const result = await runwayVideoService.generateVideo({
        prompt: options.prompt,
        duration: options.duration,
        aspectRatio: options.aspectRatio,
        negativePrompt: options.negativePrompt,
        imageUrl: options.imageUrl,
        i2vSettings: options.i2vSettings,
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
    
    return { success: false, error: `Unknown direct provider: ${providerKey}` };
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
        prompt: options.prompt,
        duration: options.duration,
        aspectRatio: options.aspectRatio,
        model: providerKey,
        negativePrompt: options.negativePrompt,
        i2vSettings: options.i2vSettings, // Pass I2V settings to provider
        motionControl, // Pass motion control for I2V
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
      // Runway and Kling handle people well - process in REVERSE order
      // so Runway ends up first (last unshift wins)
      const personProviders = ['kling', 'runway'];
      personProviders.forEach(p => {
        const idx = providers.indexOf(p);
        if (idx > 0) {
          providers.splice(idx, 1);
          providers.unshift(p);
        }
      });
    }
    
    // For CTA scenes, prioritize most reliable provider
    if (sceneType === 'cta') {
      const runwayIdx = providers.indexOf('runway');
      if (runwayIdx > 0) {
        providers.splice(runwayIdx, 1);
        providers.unshift('runway');
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
      
      const recommendedProvider = result.recommendedProvider;
      const fallbackProvider = result.fallbackProvider;
      
      // Build provider order: recommended first, then fallback, then other configured providers
      const providerOrder: string[] = [recommendedProvider];
      if (fallbackProvider && fallbackProvider !== recommendedProvider && configuredProviders.includes(fallbackProvider)) {
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
        providerOrder: ['runway', ...configuredProviders.filter(p => p !== 'runway')],
        reasoning: 'Fallback to Runway (intelligent selection unavailable)',
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
