import { type QualityTier } from '@shared/quality-tiers';
import { type BrandMedia } from '@shared/schema';
import { type AssetMatch } from './brand-asset-matcher';

export type MediaType = 
  | 't2v'           
  | 'i2v'           
  | 'image-motion'  
  | 'stock';        

export interface MediaSourceDecision {
  mediaType: MediaType;
  provider: string;
  sourceAsset?: BrandMedia;
  reason: string;
  forcedByTier: boolean;
}

interface Scene {
  id: string;
  visualDirection: string;
  duration: number;
  type?: string;
  useBrandAssets?: boolean;
}

const T2V_PROVIDERS: Record<QualityTier, string[]> = {
  ultra: [
    'veo-3.1',
    'runway-gen3',
    'kling-2.6',
    'veo-2',
  ],
  premium: [
    'kling-2.6',
    'runway-gen3',
    'veo-3.1',
    'kling-2.5',
  ],
  standard: [
    'kling-2.5',
    'kling-2.1',
    'wan-2.6',
    'hailuo-minimax',
  ],
};

const I2V_PROVIDERS: Record<QualityTier, string[]> = {
  ultra: [
    'veo-3.1',
    'runway-gen3',
    'kling-2.6',
    'veo-2',
  ],
  premium: [
    'kling-2.6',
    'runway-gen3',
    'veo-3.1',
    'kling-2.5',
  ],
  standard: [
    'kling-2.5',
    'kling-2.1',
    'luma-dream-machine',
    'hailuo-minimax',
  ],
};

const IMAGE_PROVIDERS: Record<QualityTier, string[]> = {
  ultra: ['flux-1.1-pro', 'midjourney-v6'],
  premium: ['flux-1.1-pro', 'flux-schnell'],
  standard: ['flux-schnell', 'fal-ai'],
};

const MOTION_KEYWORDS = [
  'walking', 'running', 'moving', 'action',
  'speaking', 'talking', 'conversation',
  'pouring', 'flowing', 'cooking',
  'demonstration', 'showing', 'presenting',
  'montage', 'sequence', 'transition',
  'hands', 'gesture', 'interaction',
  'dancing', 'exercising', 'working',
  'typing', 'writing', 'creating',
];

const STATIC_INDICATORS = [
  'still', 'static', 'background', 'environment',
  'product shot', 'display', 'arrangement',
  'landscape', 'exterior', 'interior view',
  'close-up product', 'hero shot', 'flat lay',
];

function findI2VAsset(matchedAssets: AssetMatch[]): AssetMatch | null {
  if (!matchedAssets || matchedAssets.length === 0) {
    return null;
  }
  
  const imageAssets = matchedAssets.filter(m => {
    const mediaType = m.asset.mediaType?.toLowerCase() || '';
    const url = (m.asset.url || '').toLowerCase();
    return mediaType.includes('image') || 
           url.endsWith('.jpg') || 
           url.endsWith('.jpeg') || 
           url.endsWith('.png') || 
           url.endsWith('.webp');
  });
  
  if (imageAssets.length === 0) {
    return null;
  }
  
  return imageAssets.sort((a, b) => b.matchScore - a.matchScore)[0];
}

function isSimpleScene(scene: Scene): boolean {
  const direction = scene.visualDirection.toLowerCase();
  
  for (const keyword of MOTION_KEYWORDS) {
    if (direction.includes(keyword)) {
      return false;
    }
  }
  
  for (const indicator of STATIC_INDICATORS) {
    if (direction.includes(indicator)) {
      return true;
    }
  }
  
  return false;
}

function selectT2VProvider(qualityTier: QualityTier): string {
  const providers = T2V_PROVIDERS[qualityTier] || T2V_PROVIDERS.standard;
  return providers[0];
}

function selectI2VProvider(qualityTier: QualityTier): string {
  const providers = I2V_PROVIDERS[qualityTier] || I2V_PROVIDERS.standard;
  return providers[0];
}

function selectImageProvider(qualityTier: QualityTier): string {
  const providers = IMAGE_PROVIDERS[qualityTier] || IMAGE_PROVIDERS.standard;
  return providers[0];
}

export function selectMediaSource(
  scene: Scene,
  matchedAssets: AssetMatch[],
  qualityTier: QualityTier
): MediaSourceDecision {
  
  console.log(`[MediaSource] Selecting for scene ${scene.id}, tier: ${qualityTier}, useBrandAssets: ${scene.useBrandAssets}`);
  
  if (scene.useBrandAssets === false) {
    console.log(`[MediaSource] Brand assets DISABLED for scene ${scene.id} - using T2V`);
    return {
      mediaType: 't2v',
      provider: selectT2VProvider(qualityTier),
      reason: 'T2V generation (brand assets disabled for this scene)',
      forcedByTier: false,
    };
  }
  
  if (qualityTier === 'ultra' || qualityTier === 'premium') {
    
    const i2vAsset = findI2VAsset(matchedAssets);
    
    if (i2vAsset) {
      console.log(`[MediaSource] ${qualityTier} tier: Using I2V with brand asset "${i2vAsset.asset.name}"`);
      return {
        mediaType: 'i2v',
        provider: selectI2VProvider(qualityTier),
        sourceAsset: i2vAsset.asset,
        reason: `I2V with brand asset "${i2vAsset.asset.name}" (${qualityTier} tier requires video)`,
        forcedByTier: true,
      };
    }
    
    console.log(`[MediaSource] ${qualityTier} tier: Using T2V (no brand asset matched)`);
    return {
      mediaType: 't2v',
      provider: selectT2VProvider(qualityTier),
      reason: `T2V generation (${qualityTier} tier requires video, no brand asset matched)`,
      forcedByTier: true,
    };
  }
  
  if (qualityTier === 'standard') {
    
    const i2vAsset = findI2VAsset(matchedAssets);
    
    if (i2vAsset) {
      console.log(`[MediaSource] Standard tier: Using I2V with brand asset "${i2vAsset.asset.name}"`);
      return {
        mediaType: 'i2v',
        provider: selectI2VProvider(qualityTier),
        sourceAsset: i2vAsset.asset,
        reason: `I2V with brand asset "${i2vAsset.asset.name}"`,
        forcedByTier: false,
      };
    }
    
    if (isSimpleScene(scene)) {
      console.log(`[MediaSource] Standard tier: Using image-motion for simple scene`);
      return {
        mediaType: 'image-motion',
        provider: selectImageProvider(qualityTier),
        reason: 'Image + Ken Burns (standard tier, simple scene)',
        forcedByTier: false,
      };
    }
    
    console.log(`[MediaSource] Standard tier: Using T2V for complex scene`);
    return {
      mediaType: 't2v',
      provider: selectT2VProvider(qualityTier),
      reason: 'T2V generation (complex scene requires video)',
      forcedByTier: false,
    };
  }
  
  return {
    mediaType: 't2v',
    provider: selectT2VProvider(qualityTier),
    reason: 'T2V generation (default)',
    forcedByTier: false,
  };
}

export function getMediaTypeLabel(mediaType: MediaType): string {
  const labels: Record<MediaType, string> = {
    't2v': 'AI Video',
    'i2v': 'Brand Video',
    'image-motion': 'Image + Motion',
    'stock': 'Stock',
  };
  return labels[mediaType] || mediaType;
}

export function getMediaTypeDescription(mediaType: MediaType): string {
  const descriptions: Record<MediaType, string> = {
    't2v': 'Real AI-generated motion',
    'i2v': 'Animated brand photo',
    'image-motion': 'Ken Burns effect',
    'stock': 'Stock footage',
  };
  return descriptions[mediaType] || '';
}

export function predictSceneMediaTypes(
  scenes: Scene[],
  matchedAssetsByScene: Map<string, AssetMatch[]>,
  qualityTier: QualityTier
): Map<string, MediaSourceDecision> {
  const predictions = new Map<string, MediaSourceDecision>();
  
  for (const scene of scenes) {
    const matchedAssets = matchedAssetsByScene.get(scene.id) || [];
    const decision = selectMediaSource(scene, matchedAssets, qualityTier);
    predictions.set(scene.id, decision);
  }
  
  return predictions;
}

export function countMediaTypesByTier(
  scenes: Scene[],
  matchedAssetsByScene: Map<string, AssetMatch[]>,
  qualityTier: QualityTier
): { t2v: number; i2v: number; imageMotion: number; stock: number } {
  const counts = { t2v: 0, i2v: 0, imageMotion: 0, stock: 0 };
  
  for (const scene of scenes) {
    const matchedAssets = matchedAssetsByScene.get(scene.id) || [];
    const decision = selectMediaSource(scene, matchedAssets, qualityTier);
    
    switch (decision.mediaType) {
      case 't2v': counts.t2v++; break;
      case 'i2v': counts.i2v++; break;
      case 'image-motion': counts.imageMotion++; break;
      case 'stock': counts.stock++; break;
    }
  }
  
  return counts;
}
