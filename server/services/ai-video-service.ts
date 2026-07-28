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
import { providerSupportsNativeAudio } from '@shared/provider-catalog';
import { getMotionControl, MotionControlConfig } from '@shared/config/motion-control';
import { optimizePrompt, logPromptOptimization, analyzePrompt } from './video-prompt-optimizer';
import { getBrandContext, getBrandNameOrDefault } from './brand-settings-service';
import { getVisualArtPreset, VisualArtPreset, isStylizedPreset as isStylizedPresetCheck, getProviderHierarchy } from '../../shared/config/visual-art-presets';
import { getSceneContentTag, SceneContentTag } from '../../shared/config/scene-content-tags';

export interface AIVideoResult {
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

export interface AIVideoOptions {
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
  sourceVideoUrl?: string; // V2V: existing video clip to transform
  qualityTier?: 'ultra' | 'premium' | 'standard' | 'draft';
  i2vSettings?: I2VSettingsInput;
  motionOverride?: MotionControlConfig;
  artPresetId?: string;
  contentTag?: string;
  isCharacterReference?: boolean;
  isProviderHint?: boolean;
  // Phase 20D (Task #126): per-scene native-audio opt-in. Only
  // consulted when the resolved provider's catalog entry has
  // `supportsNativeAudio: true` (see shared/provider-catalog.ts —
  // Task #136 made the catalog the single source of truth). Ignored
  // by every other branch in the generation switch. See
  // Scene.generateNativeAudio in shared/video-types.ts for full
  // semantics.
  generateNativeAudio?: boolean;
}

// Maps base provider + quality tier to the appropriate versioned provider
const TIER_PROVIDER_VERSIONS: Record<string, Record<string, string>> = {
  kling: {
    ultra: 'kling-2.6-pro',
    premium: 'kling-2.6-pro',
    standard: 'kling-2.6',
    draft: 'seedance-2.0-fast',
  },
  luma: {
    ultra: 'luma',
    premium: 'luma',
    standard: 'luma',
    draft: 'seedance-2.0-fast',
  },
  hailuo: {
    ultra: 'hailuo',
    premium: 'hailuo',
    standard: 'hailuo',
    draft: 'seedance-2.0-fast',
  },
  veo: {
    ultra: 'veo-3.1',
    premium: 'veo-3.1',
    standard: 'veo-3.1',
    draft: 'seedance-2.0-fast',
  },
  hunyuan: {
    ultra: 'hunyuan',
    premium: 'hunyuan',
    standard: 'hunyuan',
    draft: 'seedance-2.0-fast',
  },
  wan: {
    ultra: 'wan-2.6',
    premium: 'wan-2.6',
    standard: 'wan-2.6',
    draft: 'seedance-2.0-fast',
  },
  sora: {
    ultra: 'sora-2-pro',
    premium: 'sora-2-pro',
    standard: 'sora-2',
    draft: 'seedance-2.0-fast',
  },
  runway: {
    ultra: 'runway-4.5',
    premium: 'runway-4.5',
    standard: 'runway',
    draft: 'seedance-2.0-fast',
  },
  seedance: {
    ultra: 'seedance-2.0',
    premium: 'seedance-2.0',
    standard: 'seedance-2.0-fast',
    draft: 'seedance-2.0-fast',
  },
};

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_WINDOW_MS = 10 * 60 * 1000;

interface ProviderFailureRecord {
  count: number;
  timestamps: number[];
}

class AIVideoService {
  private providerFailures: Map<string, ProviderFailureRecord> = new Map();
  
  constructor() {
    console.log('[AIVideoService] Initializing multi-provider service...');
    const providers = getConfiguredProviders();
    console.log(`[AIVideoService] Configured providers: ${providers.join(', ') || 'none'}`);
  }

  private recordProviderFailure(providerKey: string): void {
    const now = Date.now();
    const record = this.providerFailures.get(providerKey) || { count: 0, timestamps: [] };
    record.timestamps = record.timestamps.filter(t => now - t < CIRCUIT_BREAKER_WINDOW_MS);
    record.timestamps.push(now);
    record.count = record.timestamps.length;
    this.providerFailures.set(providerKey, record);
    if (record.count >= CIRCUIT_BREAKER_THRESHOLD) {
      console.warn(`[AIVideo] Circuit breaker: ${providerKey} has ${record.count} failures in last ${CIRCUIT_BREAKER_WINDOW_MS / 60000}min — will be skipped in fallback chains`);
    }
  }

  private isProviderCircuitOpen(providerKey: string): boolean {
    const record = this.providerFailures.get(providerKey);
    if (!record) return false;
    const now = Date.now();
    record.timestamps = record.timestamps.filter(t => now - t < CIRCUIT_BREAKER_WINDOW_MS);
    record.count = record.timestamps.length;
    return record.count >= CIRCUIT_BREAKER_THRESHOLD;
  }

  private filterByCircuitBreaker(providers: string[], primaryProvider?: string): string[] {
    return providers.filter(p => {
      if (p === primaryProvider) return true;
      if (this.isProviderCircuitOpen(p)) {
        console.log(`[AIVideo] Circuit breaker: skipping ${p} (${this.providerFailures.get(p)?.count} recent failures)`);
        return false;
      }
      return true;
    });
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

  private stripTextInstructionsFromPrompt(prompt: string): string {
    let cleaned = prompt;
    cleaned = cleaned.replace(/\b(The\s+)?[\w\s]*\bbrand\s+name\s+appears?\s+[^.]*\./gi, '');
    cleaned = cleaned.replace(/\b[\w\s]*\btext\s+overlay[^.]*\./gi, '');
    cleaned = cleaned.replace(/\b[\w\s]*\blettering\s+(beneath|above|below|beside|near|on|in|across)[^.]*\./gi, '');
    cleaned = cleaned.replace(/\b[\w\s]*\btext\s+(label|title|caption|heading)[^.]*\./gi, '');
    cleaned = cleaned.replace(/\bClean\s+background\s+surfaces?\s+suitable\s+for\s+text\s+overlay\s+compositing\.?/gi, '');
    cleaned = cleaned.replace(/\bNo\s+text,?\s*no\s+signs?,?\s*no\s+labels?,?\s*no\s+readable\s+words?\s+anywhere[^.]*\.?/gi, '');
    cleaned = cleaned.replace(/\b[\w\s]*readable\s+(text|words?|lettering|typography)[^.]*\./gi, '');
    cleaned = cleaned.replace(/\b[\w\s]*\btypography[^.]*\./gi, '');
    cleaned = cleaned.replace(/\n\s*\n/g, '\n');
    cleaned = cleaned.trim();
    if (cleaned !== prompt) {
      console.log(`[AIVideo] Stripped text/overlay instructions from prompt to prevent garbled AI text rendering`);
    }
    return cleaned;
  }

  async generateVideo(options: AIVideoOptions): Promise<AIVideoResult> {
    const configuredProviders = await getTestedProviders();
    
    if (configuredProviders.length === 0) {
      return { success: false, error: 'No AI video providers configured' };
    }
    
    console.log(`[AIVideo] Using ${configuredProviders.length} tested providers: ${configuredProviders.join(', ')}`);

    options = { ...options, prompt: this.stripTextInstructionsFromPrompt(options.prompt) };

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
        const styleKw = artPreset.styleKeywords || [];
        const pLower = i2vPrompt.toLowerCase();
        const hasMarker = styleKw.length > 0 ? styleKw.some((kw: string) => pLower.includes(kw)) : false;
        if (!hasMarker) {
          const prefix = artPreset.styleMarkerPrefix || artPreset.name;
          i2vPrompt = `${prefix} — ${i2vPrompt}`;
          console.log(`[AIVideo] I2V stylized preset "${artPreset.name}" — prepended style marker: "${prefix}"`);
        }
      }
      if (isStylizedArt && artPreset) {
        const styleLabel = artPreset.styleMarkerPrefix || artPreset.name;
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
        const styleKeywords = artPreset.styleKeywords || [];
        const promptLower = basePrompt.toLowerCase();
        const hasStyleMarker = styleKeywords.length > 0
          ? styleKeywords.some((kw: string) => promptLower.includes(kw))
          : false;
        if (!hasStyleMarker) {
          const prefix = artPreset.styleMarkerPrefix || artPreset.name;
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
      
      const rawProvider = options.preferredProvider && options.preferredProvider !== 'auto' ? options.preferredProvider : 'seedance';
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
      
      const analysis = analyzePrompt(optimized.prompt, options.artPresetId);
      if (analysis.score < 70) {
        console.log(`[AIVideo] Prompt quality warning (score: ${analysis.score}): ${analysis.issues.join(', ')}`);
      }
      
      let negativePrompt = optimized.negativePrompt || enhanced.negativePrompt;
      if (options.negativePrompt) {
        negativePrompt = negativePrompt
          ? `${options.negativePrompt}, ${negativePrompt}`
          : options.negativePrompt;
      }
      if (contentTag && contentTag.negativePromptAdditions.length > 0) {
        negativePrompt = `${negativePrompt}, ${contentTag.negativePromptAdditions.join(', ')}`;
      } else if (artPreset && artPreset.negativePromptAdditions.length > 0) {
        negativePrompt = `${negativePrompt}, ${artPreset.negativePromptAdditions.join(', ')}`;
      }
      
      let finalPrompt = optimized.prompt;
      if (isStylizedArt && artPreset) {
        const styleLabel = artPreset.styleMarkerPrefix || artPreset.name;
        finalPrompt = `[STYLE: ${styleLabel} — NOT photorealistic, NOT live-action] ${finalPrompt}. All environments, characters, and settings must be rendered in ${styleLabel} style — no photorealistic or live-action elements whatsoever.`;
        console.log(`[AIVideo] T2V style reinforcement (prefix+suffix) applied for "${artPreset.name}"`);
      }

      const FINAL_MAX_WORDS = isStylizedArt ? 250 : 200;
      const finalWords = finalPrompt.split(/\s+/);
      console.log(`[AIVideo] Pre-enforcement: ${finalWords.length} words, ${finalPrompt.length} chars (limit: ${FINAL_MAX_WORDS} words, stylized=${isStylizedArt})`);
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
        const allowedMiddleWords = Math.max(isStylizedArt ? 80 : 20, FINAL_MAX_WORDS - protectedWordCount);
        if (middleWords.length > allowedMiddleWords) {
          const sentences = middleContent.match(/[^.!?]+[.!?]+\s*/g) || [];
          let kept = '';
          let keptWords = 0;
          for (const s of sentences) {
            const w = s.trim().split(/\s+/).filter(Boolean).length;
            if (keptWords + w > allowedMiddleWords && kept) break;
            kept += s;
            keptWords += w;
          }
          // Fallback: no sentence boundary fits the budget (e.g. one very long
          // clause). Preserve the old behavior rather than emitting an empty prompt.
          if (!kept.trim()) {
            kept = middleWords.slice(0, allowedMiddleWords).join(' ');
            keptWords = allowedMiddleWords;
          }
          const dropped = middleContent.slice(kept.length).trim();
          if (dropped) {
            console.warn(
              `[AIVideo] PROMPT TRUNCATED: ${middleWords.length} → ${keptWords} words ` +
              `(limit ${FINAL_MAX_WORDS}, stylized=${isStylizedArt}). DROPPED: "${dropped}"`
            );
          }
          middleContent = kept.trim();
        }
        let blockIdx = 0;
        middleContent = middleContent.replace(/__CB__/g, () => charBlocks[blockIdx++] || '');
        finalPrompt = (stylePrefix + middleContent + (styleSuffix ? ' ' + styleSuffix.trim() : '')).replace(/\s{2,}/g, ' ').trim();
        console.log(`[AIVideo] Post-assembly length enforcement: trimmed to ~${finalPrompt.split(/\s+/).length} words, ${finalPrompt.length} chars (limit ${FINAL_MAX_WORDS})`);
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
    
    if (enhancedOptions.preferredProvider && enhancedOptions.preferredProvider !== 'auto' && !options.isProviderHint) {
      providerOrder = [enhancedOptions.preferredProvider];
      console.log(`[AIVideo] Using STRICT user-selected provider: ${enhancedOptions.preferredProvider} (no fallbacks)`);
    } else if (enhancedOptions.preferredProvider && enhancedOptions.preferredProvider !== 'auto' && options.isProviderHint) {
      const hintHierarchy = getProviderHierarchy(options.artPresetId);
      const hintChain = [hintHierarchy.primary, ...hintHierarchy.fallback];
      const hintFallbacks = hintChain.filter(p => p !== enhancedOptions.preferredProvider && configuredProviders.some(cp => cp === p || cp.startsWith(p + '-') || cp.startsWith(p)));
      providerOrder = [enhancedOptions.preferredProvider, ...hintFallbacks];
      console.log(`[AIVideo] Using provider HINT: ${enhancedOptions.preferredProvider} (art preset "${options.artPresetId || 'auto'}" fallbacks: ${hintFallbacks.slice(0, 3).join(', ')})`);
    } else if (options.narration && options.prompt) {
      const recommendation = await this.getIntelligentProviderRecommendation(options, configuredProviders);
      providerOrder = recommendation.providerOrder;
      console.log(`[AIVideo] Intelligent selection: ${recommendation.reasoning}`);
    } else {
      providerOrder = this.selectProvidersForStyle(styleConfig.preferredVideoProviders, enhancedOptions.sceneType, contentType, configuredProviders);
    }
    
    let sceneTypeMappedProviders: Set<string> = new Set();
    if (!enhancedOptions.preferredProvider || enhancedOptions.preferredProvider === 'auto') {
      const hierarchy = artPreset?.providerHierarchy || { primary: 'seedance-2.0', fallback: ['kling-2.6-pro', 'veo-3.1', 'kling-2.6'] };
      const hierarchyChain = [hierarchy.primary, ...hierarchy.fallback];
      const availableHierarchy = hierarchyChain.filter(p => configuredProviders.some(cp => cp === p || cp.startsWith(p + '-') || cp.startsWith(p)));
      
      if (availableHierarchy.length > 0) {
        const remaining = providerOrder.filter(p => !availableHierarchy.includes(p));
        providerOrder = [...availableHierarchy, ...remaining];
        console.log(`[AIVideo] Art style hierarchy (${artPreset?.name || 'auto'}): ${availableHierarchy.join(' → ')}`);
      }

      if (artPreset?.sceneTypeProviderMap) {
        let sceneTypeProviders: string[] | null = null;
        let mappingKey: string | null = null;

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

        if (sceneTypeProviders) {
          const filteredProviders = sceneTypeProviders.filter((p: string) => configuredProviders.some(cp => cp === p || cp.startsWith(p + '-') || cp.startsWith(p)));
          if (filteredProviders.length > 0) {
            const remaining = providerOrder.filter((p: string) => !filteredProviders.includes(p));
            providerOrder = [...filteredProviders, ...remaining];
            filteredProviders.forEach(p => sceneTypeMappedProviders.add(p));
            console.log(`[AIVideo] Art preset '${artPreset.name}' scene-type routed '${mappingKey}' → [${filteredProviders.join(', ')}]`);
          }
        }
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

    const isExplicitSelection = !!enhancedOptions.preferredProvider && enhancedOptions.preferredProvider !== 'auto' && !options.isProviderHint;
    let tierAdjustedOrder: string[];

    if (qualityTier === 'draft') {
      tierAdjustedOrder = ['seedance-2.0-fast'];
      console.log(`[AIVideo] Draft tier: overriding all providers → seedance-2.0-fast`);
    } else if (isExplicitSelection) {
      tierAdjustedOrder = providerOrder;
    } else {
      tierAdjustedOrder = providerOrder.map(baseProvider => {
        const baseName = baseProvider.split('-')[0];
        const tierVersions = TIER_PROVIDER_VERSIONS[baseName];
        if (!tierVersions || !tierVersions[qualityTier]) {
          return baseProvider;
        }
        const versionedProvider = tierVersions[qualityTier];

        if (qualityTier === 'standard') {
          if (sceneTypeMappedProviders.has(baseProvider)) {
            console.log(`[AIVideo] Standard: preserving scene-type-routed provider: ${baseProvider}`);
            return baseProvider;
          }
          const isSpecificVariant = baseProvider.includes('-') && baseProvider !== baseName;
          if (isSpecificVariant && baseProvider !== versionedProvider) {
            console.log(`[AIVideo] Standard: preserving hierarchy-selected variant: ${baseProvider}`);
            return baseProvider;
          }
        }

        if (versionedProvider !== baseProvider) {
          console.log(`[AIVideo] Quality tier ${qualityTier}: ${baseProvider} → ${versionedProvider}`);
        }
        return versionedProvider;
      });
    }

    const validOrder = [...new Set(tierAdjustedOrder)].filter(p => {
      if (!AI_VIDEO_PROVIDERS[p]) {
        console.warn(`[AIVideo] Skipping unknown provider "${p}" from order`);
        return false;
      }
      return true;
    });

    // Safety guard: never silently fall back to the direct Runway API unless the
    // user explicitly chose a Runway provider.  The user may have RUNWAY_API_KEY
    // configured only for intentional Aleph 2 usage; auto-routing to runway-gen4
    // (or any other runway-* variant) would charge Runway credits without the
    // user's knowledge.
    const isExplicitRunwayRequest = isExplicitSelection &&
      (AI_VIDEO_PROVIDERS[enhancedOptions.preferredProvider!]?.apiProvider === 'runway' ||
       runwayVideoService.isRunwayModel(enhancedOptions.preferredProvider!));
    const runwaySafeOrder = isExplicitRunwayRequest
      ? validOrder
      : validOrder.filter(p => {
          const prov = AI_VIDEO_PROVIDERS[p];
          const isRunway = prov?.apiProvider === 'runway' || runwayVideoService.isRunwayModel(p);
          if (isRunway) {
            console.warn(`[AIVideo] ⚡ Runway provider "${p}" blocked from auto-routing — use an explicit Runway provider selection to enable it`);
          }
          return !isRunway;
        });

    const primaryProvider = runwaySafeOrder[0];
    const circuitFilteredOrder = this.filterByCircuitBreaker(runwaySafeOrder, primaryProvider);

    console.log(`[AIVideo] Scene: ${enhancedOptions.sceneType}, Quality: ${qualityTier}`);
    console.log(`[AIVideo] Provider order: ${circuitFilteredOrder.join(' → ')}${circuitFilteredOrder.length < runwaySafeOrder.length ? ` (${runwaySafeOrder.length - circuitFilteredOrder.length} skipped by circuit breaker)` : ''}`);

    const artPresetName = artPreset?.name || 'Auto';
    const artPresetIdentifier = options.artPresetId || 'auto';
    const failedProviders: Array<{ provider: string; error: string }> = [];

    for (const providerKey of circuitFilteredOrder) {
      const provider = AI_VIDEO_PROVIDERS[providerKey];
      
      console.log(`[AIVideo] Trying ${providerKey} (preset: ${artPresetIdentifier})...`);
      
      try {
        const result = await this.generateWithProvider(providerKey, provider, enhancedOptions);
        
        if (result.success && result.s3Url) {
          if (failedProviders.length > 0) {
            console.log(`[AIVideo] ✓ Success with ${providerKey} after ${failedProviders.length} fallback(s): ${failedProviders.map(f => `${f.provider}(${f.error})`).join(' → ')}`);
          } else {
            console.log(`[AIVideo] ✓ Success with ${providerKey}`);
          }
          return {
            ...result,
            provider: providerKey,
          };
        }
        
        const errorMsg = result.error || 'unknown error';
        failedProviders.push({ provider: providerKey, error: errorMsg });
        this.recordProviderFailure(providerKey);
        console.warn(`[AIVideo] ✗ ${providerKey} failed for preset "${artPresetIdentifier}": ${errorMsg}`);
        
      } catch (error: any) {
        failedProviders.push({ provider: providerKey, error: error.message });
        this.recordProviderFailure(providerKey);
        console.warn(`[AIVideo] ✗ ${providerKey} error for preset "${artPresetIdentifier}": ${error.message}`);
      }
    }

    const failureChain = failedProviders.map(f => `${f.provider}(${f.error})`).join(' → ');
    console.error(`[AIVideo] All providers exhausted for preset "${artPresetIdentifier}": ${failureChain}`);
    return { 
      success: false, 
      error: `All providers failed for ${artPresetName} style — please retry` 
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

    // Route V2V through Runway's dedicated video-to-video endpoint.
    // Aleph 2.0 supports an optional frame reference (promptImage) alongside the
    // source video, so allow imageUrl to coexist with sourceVideoUrl for that model.
    const isAleph2 = providerKey === 'runway-aleph-2';
    if (options.sourceVideoUrl && (!options.imageUrl || isAleph2)) {
      console.log(`[AIVideo] Routing V2V to Runway for ${providerKey}`);
      const result = await runwayVideoService.generateVideoToVideo({
        videoUrl: options.sourceVideoUrl,
        prompt: options.prompt,
        model: providerKey,
        duration: options.duration,
        aspectRatio: options.aspectRatio,
        referenceImageUrl: isAleph2 ? options.imageUrl : undefined,
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
    
    // If sourceVideoUrl provided (and no imageUrl), use V2V (video-to-video)
    if (options.sourceVideoUrl && !options.imageUrl) {
      console.log(`[AIVideo] Using V2V for ${providerKey} with source clip: ${options.sourceVideoUrl.substring(0, 60)}...`);
      const result = await piapiVideoService.generateVideoToVideo({
        sourceVideoUrl: options.sourceVideoUrl,
        prompt: options.prompt,
        duration: options.duration,
        aspectRatio: options.aspectRatio,
        model: providerKey,
        negativePrompt: options.negativePrompt,
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
        // Phase 20D (Task #126) + Tasks #136 / #137: forward the
        // scene-level native-audio opt-in. Gated by the shared provider
        // catalog's `supportsNativeAudio` flag (Task #136 — single
        // source of truth). Today that catalog marks Seedance 2 (both
        // variants) and every Veo variant as audio-capable; the piapi
        // I2V branch reads `generate_audio` for both. Other I2V
        // providers (Wan, Runway, Hunyuan, Sora, Kling, Hailuo, Luma,
        // Pika, etc.) keep `supportsNativeAudio: false` and the field
        // is omitted — a stale UI flag can't leak into the wrong
        // payload after a provider switch. Belt-and-suspenders with
        // the disabled toggle in the scene editor.
        //
        // Note: this gate fires only inside the I2V branch
        // (`if (options.imageUrl)`), so the Veo T2V path — which
        // hard-codes `generate_audio: false` in piapi-video-service.ts
        // — is naturally never reached even though Veo's catalog flag
        // is true at the provider level.
        ...(options.generateNativeAudio === true &&
          providerSupportsNativeAudio(providerKey)
          ? { generateAudio: true }
          : {}),
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
      generateNativeAudio: options.generateNativeAudio,
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

    const actionPatterns = [
      /\bexplod(e|es|ed|ing|ion|ions)?\b/,
      /\bburst(s|ed|ing)?\b/,
      /\bshoot(s|ing)?\b/,
      /\blaunch(es|ed|ing)?\b/,
      /\bthrow(s|n|ing)?\b/,
      /\bcrash(es|ed|ing)?\b/,
      /\bsmash(es|ed|ing)?\b/,
      /\bshatter(s|ed|ing)?\b/,
      /\bblast(s|ed|ing)?\b/,
      /\berupt(s|ed|ing|ion|ions)?\b/,
      /\bfl(y|ies|ying|ew)\b/,
      /\bsplash(es|ed|ing)?\b/,
      /\bpour(s|ed|ing)?\b/,
      /\bscatter(s|ed|ing)?\b/,
      /\bspin(s|ning)?\b/,
      /\bwhip(s|ped|ping)?\b/,
      /\bsurg(e|es|ed|ing)?\b/,
      /\brush(es|ed|ing)?\b/,
      /\bstrik(e|es|ing)\b/,
      /\bslam(s|med|ming)?\b/,
      /\btransform(s|ed|ing|ation)?\b/,
      /\bmorph(s|ed|ing)?\b/,
      /\bdissolv(e|es|ed|ing)?\b/,
      /\bmelt(s|ed|ing)?\b/,
      /\bcollaps(e|es|ed|ing)?\b/,
      /\bexpand(s|ed|ing)?\b/,
      /\bgrow(s|ing|n)?\b/,
    ];
    const promptLower = prompt.toLowerCase();
    const hasAction = actionPatterns.some(rx => rx.test(promptLower));

    if (hasAction) {
      return `Dynamic camera following the action. ${prompt}`;
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

      // Reduce configured providers to provider families and exclude Runway:
      // the runwaySafeOrder backstop will strip runway from auto-routing anyway,
      // so telling Claude "runway is available" just wastes the LLM call.
      const selectableProviders = [...new Set(
        configuredProviders
          .map(p => p.split('-')[0])
          .filter(family => family !== 'runway')
      )];
      console.log(`[AIVideo] Intelligent selector constraint: [${selectableProviders.join(', ')}]`);

      const result = await intelligentProviderSelector.recommendProviderForScene(sceneContent, selectableProviders);
      
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
        primaryProvider = configuredProviders[0] || 'seedance-2.0';
        console.log(`[AIVideo] Recommended provider "${recommendedProvider}" not in tested providers, using first available`);
      }
      
      if (fallbackProvider && !isProviderAvailable(fallbackProvider)) {
        fallbackProvider = configuredProviders[1]?.split('-')[0] || configuredProviders[0]?.split('-')[0] || 'seedance';
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
        providerOrder: ['seedance-2.0', ...configuredProviders.filter(p => p !== 'seedance-2.0')],
        reasoning: 'Fallback to Seedance 2 GA (intelligent selection unavailable)',
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
