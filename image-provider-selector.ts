import { IMAGE_PROVIDERS, ImageProvider } from '@shared/provider-config';

export interface ImageProviderSelection {
  provider: ImageProvider;
  reason: string;
  confidence: number;
}

class ImageProviderSelectorService {
  
  selectProvider(
    contentType: string,
    sceneType: string,
    visualDirection: string,
    qualityTier: 'ultra' | 'premium' | 'standard' = 'premium'
  ): ImageProviderSelection {
    const lower = visualDirection.toLowerCase();
    
    // Ultra tier: Use Midjourney for best quality
    // Premium tier: Use Flux Pro
    // Standard tier: Use fal.ai for cost-effectiveness
    const isUltra = qualityTier === 'ultra';
    const isPremium = qualityTier === 'premium';
    
    // For Ultra tier, prefer Midjourney for most scenes
    if (isUltra) {
      if (
        contentType === 'product' ||
        sceneType === 'product' ||
        /product|bottle|package|supplement|food|ingredient|object|item|merchandise/.test(lower)
      ) {
        return {
          provider: IMAGE_PROVIDERS.midjourney,
          reason: 'Ultra quality - Midjourney product excellence',
          confidence: 95,
        };
      }
      
      if (
        contentType === 'person' ||
        contentType === 'lifestyle' ||
        sceneType === 'testimonial' ||
        /person|woman|man|people|lifestyle|authentic|natural|wellness|customer/.test(lower)
      ) {
        return {
          provider: IMAGE_PROVIDERS.midjourney,
          reason: 'Ultra quality - Midjourney lifestyle aesthetics',
          confidence: 92,
        };
      }
      
      // Default Ultra: Midjourney
      return {
        provider: IMAGE_PROVIDERS.midjourney,
        reason: 'Ultra tier - Midjourney premium quality',
        confidence: 90,
      };
    }
    
    // For Premium tier, use Flux
    if (isPremium) {
      if (
        contentType === 'product' ||
        sceneType === 'product' ||
        /product|bottle|package|supplement|food|ingredient|object|item|merchandise/.test(lower)
      ) {
        return {
          provider: IMAGE_PROVIDERS.flux,
          reason: 'Premium quality product rendering - Flux Pro',
          confidence: 90,
        };
      }
      
      if (
        contentType === 'person' ||
        contentType === 'lifestyle' ||
        sceneType === 'testimonial' ||
        /person|woman|man|people|lifestyle|authentic|natural|wellness|customer/.test(lower)
      ) {
        return {
          provider: IMAGE_PROVIDERS.flux,
          reason: 'Premium lifestyle quality - Flux Pro',
          confidence: 88,
        };
      }
      
      return {
        provider: IMAGE_PROVIDERS.flux,
        reason: 'Premium tier default - Flux Pro',
        confidence: 85,
      };
    }
    
    // Standard tier: Use fal.ai for cost-effectiveness
    if (
      contentType === 'product' ||
      sceneType === 'product' ||
      /product|bottle|package|supplement|food|ingredient|object|item|merchandise/.test(lower)
    ) {
      return {
        provider: IMAGE_PROVIDERS.flux,
        reason: 'Product shots - Flux quality at standard pricing',
        confidence: 85,
      };
    }
    
    return {
      provider: IMAGE_PROVIDERS.falai,
      reason: 'Cost-effective rendering - fal.ai',
      confidence: 75,
    };
  }
  
  selectProvidersForScenes(
    scenes: Array<{
      sceneIndex: number;
      contentType: string;
      sceneType: string;
      visualDirection: string;
      needsImage: boolean;
    }>,
    qualityTier: 'ultra' | 'premium' | 'standard' = 'premium'
  ): Map<number, ImageProviderSelection> {
    const selections = new Map<number, ImageProviderSelection>();
    
    scenes
      .filter(s => s.needsImage)
      .forEach(scene => {
        const selection = this.selectProvider(
          scene.contentType,
          scene.sceneType,
          scene.visualDirection,
          qualityTier
        );
        selections.set(scene.sceneIndex, selection);
      });
    
    const midjourneyCount = Array.from(selections.values())
      .filter(s => s.provider.id === 'midjourney').length;
    const fluxCount = Array.from(selections.values())
      .filter(s => s.provider.id === 'flux').length;
    const falaiCount = Array.from(selections.values())
      .filter(s => s.provider.id === 'falai').length;
    
    console.log(`[ImageProvider] Selection: Midjourney: ${midjourneyCount}, Flux.1: ${fluxCount}, fal.ai: ${falaiCount}`);
    
    return selections;
  }
  
  getProviderSummary(selections: Map<number, ImageProviderSelection>): { midjourney: number; flux: number; falai: number } {
    const counts = { midjourney: 0, flux: 0, falai: 0 };
    
    selections.forEach(selection => {
      if (selection.provider.id === 'midjourney') {
        counts.midjourney++;
      } else if (selection.provider.id === 'flux') {
        counts.flux++;
      } else {
        counts.falai++;
      }
    });
    
    return counts;
  }
  
  calculateImageCost(counts: { midjourney?: number; flux: number; falai: number }): number {
    const midjourneyCount = counts.midjourney || 0;
    const midjourneyCost = midjourneyCount * IMAGE_PROVIDERS.midjourney.costPerImage;
    const fluxCost = counts.flux * IMAGE_PROVIDERS.flux.costPerImage;
    const falaiCost = counts.falai * IMAGE_PROVIDERS.falai.costPerImage;
    return midjourneyCost + fluxCost + falaiCost;
  }
}

export const imageProviderSelector = new ImageProviderSelectorService();
