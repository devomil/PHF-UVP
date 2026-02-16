export type QualityTier = 'ultra' | 'premium' | 'standard';

export const DEFAULT_QUALITY_TIER: QualityTier = 'premium';

export interface CostBreakdown {
  video: number;
  images: number;
  voiceover: number;
  music: number;
  soundfx: number;
  sceneAnalysis: number;
  qualityAssurance: number;
  
  multiPassGeneration?: number;
  aiUpscaling?: number;
  colorGrading?: number;
  frameInterpolation?: number;
  audioEnhancement?: number;
  
  total: number;
}

export interface TierCostConfig {
  videoPer10s: number;
  imagePer: number;
  voicePer30s: number;
  musicPer30s: number;
  soundfxPer: number;
  sceneAnalysis: number;
  qa: number;
  multiPassMultiplier?: number;
  upscalePer?: number;
  colorGradePer?: number;
  interpolatePer?: number;
  audioEnhancePer?: number;
}

export const TIER_COSTS: Record<QualityTier, TierCostConfig> = {
  ultra: {
    videoPer10s: 0.80,
    imagePer: 0.10,
    voicePer30s: 0.35,
    musicPer30s: 0.15,
    soundfxPer: 0.08,
    sceneAnalysis: 0.02,
    qa: 0.03,
    multiPassMultiplier: 3,
    upscalePer: 0.10,
    colorGradePer: 0.15,
    interpolatePer: 0.10,
    audioEnhancePer: 0.05,
  },
  premium: {
    videoPer10s: 0.65,
    imagePer: 0.05,
    voicePer30s: 0.30,
    musicPer30s: 0.12,
    soundfxPer: 0.06,
    sceneAnalysis: 0.02,
    qa: 0.02,
  },
  standard: {
    videoPer10s: 0.30,
    imagePer: 0.03,
    voicePer30s: 0.20,
    musicPer30s: 0.08,
    soundfxPer: 0.04,
    sceneAnalysis: 0.01,
    qa: 0.01,
  },
};

export function calculateCosts(
  tier: QualityTier,
  scenes: Array<{ duration: number; hasImages?: boolean }>,
  voiceoverDuration: number = 0,
  musicDuration: number = 0,
  imageCount: number = 0
): CostBreakdown {
  const costs = TIER_COSTS[tier] || TIER_COSTS.premium;
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const videoSegments = Math.ceil(totalDuration / 10);
  
  let videoCost = videoSegments * costs.videoPer10s;
  const imageCost = imageCount * costs.imagePer;
  const voiceCost = Math.ceil((voiceoverDuration || totalDuration) / 30) * costs.voicePer30s;
  const musicCost = Math.ceil((musicDuration || totalDuration) / 30) * costs.musicPer30s;
  const soundfxCost = scenes.length * costs.soundfxPer;
  const analysisCost = scenes.length * costs.sceneAnalysis;
  const qaCost = scenes.length * costs.qa;
  
  const breakdown: CostBreakdown = {
    video: videoCost,
    images: imageCost,
    voiceover: voiceCost,
    music: musicCost,
    soundfx: soundfxCost,
    sceneAnalysis: analysisCost,
    qualityAssurance: qaCost,
    total: 0,
  };
  
  if (tier === 'ultra') {
    const ultraCosts = costs as typeof TIER_COSTS.ultra;
    const multiPassMultiplier = ultraCosts.multiPassMultiplier || 3;
    
    breakdown.video = videoCost;
    breakdown.multiPassGeneration = videoCost * (multiPassMultiplier - 1);
    
    breakdown.aiUpscaling = scenes.length * (ultraCosts.upscalePer || 0);
    breakdown.colorGrading = scenes.length * (ultraCosts.colorGradePer || 0);
    breakdown.frameInterpolation = scenes.length * (ultraCosts.interpolatePer || 0);
    breakdown.audioEnhancement = scenes.length * (ultraCosts.audioEnhancePer || 0);
  }
  
  breakdown.total = Object.entries(breakdown)
    .filter(([key]) => key !== 'total')
    .reduce((sum, [, value]) => sum + (value || 0), 0);
  
  return breakdown;
}

export function getTierLabel(tier: QualityTier): string {
  switch (tier) {
    case 'ultra': return 'Ultra Premium';
    case 'premium': return 'Premium';
    case 'standard': return 'Standard';
    default: return 'Premium';
  }
}

export function getTierDescription(tier: QualityTier): string {
  switch (tier) {
    case 'ultra': 
      return 'Cinema-grade quality with multi-pass generation, 4K upscaling, and AI color grading';
    case 'premium': 
      return 'Broadcast quality for TV commercials, streaming ads, professional production';
    case 'standard': 
      return 'Good quality for social media, internal videos, quick turnaround';
    default: 
      return 'Broadcast quality for professional production';
  }
}
