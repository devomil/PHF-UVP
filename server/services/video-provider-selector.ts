// server/services/video-provider-selector.ts - Phase 13: Intelligent Provider Selection with Full Registry

import { VIDEO_PROVIDERS, VideoProvider, getVideoProvidersByFamily } from '../../shared/provider-config';
import { VISUAL_STYLES } from '../../shared/visual-style-config';

export interface ProviderSelection {
  provider: VideoProvider;
  reason: string;
  confidence: number;
  alternatives: string[];
}

export interface SceneForSelection {
  sceneIndex: number;
  sceneType: string;
  contentType: string;
  narration: string;
  visualDirection: string;
  duration: number;
}

class VideoProviderSelectorService {
  
  selectProvider(
    scene: SceneForSelection,
    visualStyle: string,
    qualityTier: 'ultra' | 'premium' | 'standard' = 'premium'
  ): ProviderSelection {
    const styleConfig = VISUAL_STYLES[visualStyle] || VISUAL_STYLES.lifestyle;
    const scores: Record<string, number> = {};
    const reasons: Record<string, string[]> = {};
    
    Object.keys(VIDEO_PROVIDERS).forEach(id => {
      scores[id] = 50;
      reasons[id] = [];
    });
    
    this.scoreByContentType(scene.contentType, scores, reasons);
    this.scoreBySceneType(scene.sceneType, scores, reasons);
    this.scoreByVisualDirection(scene.visualDirection, scores, reasons);
    this.scoreByStylePreferences(styleConfig.preferredVideoProviders || [], scores, reasons);
    this.scoreByDuration(scene.duration, scores, reasons);
    this.scoreByQualityTier(qualityTier, scores, reasons);
    this.scoreBySpecialization(scene, scores, reasons);
    
    const sortedProviders = Object.entries(scores)
      .sort(([, a], [, b]) => b - a);
    
    const bestProviderId = sortedProviders[0][0];
    const bestScore = sortedProviders[0][1];
    const bestProvider = VIDEO_PROVIDERS[bestProviderId];
    
    return {
      provider: bestProvider,
      reason: reasons[bestProviderId].slice(0, 2).join('; ') || 'Default selection',
      confidence: Math.min(100, bestScore),
      alternatives: sortedProviders.slice(1, 3).map(([id]) => id),
    };
  }
  
  selectProvidersForProject(
    scenes: SceneForSelection[],
    visualStyle: string,
    qualityTier: 'ultra' | 'premium' | 'standard' = 'premium'
  ): Map<number, ProviderSelection> {
    const selections = new Map<number, ProviderSelection>();
    
    scenes.forEach(scene => {
      const selection = this.selectProvider(scene, visualStyle, qualityTier);
      selections.set(scene.sceneIndex, selection);
    });
    
    const providerCounts: Record<string, number> = {};
    selections.forEach(sel => {
      providerCounts[sel.provider.id] = (providerCounts[sel.provider.id] || 0) + 1;
    });
    
    console.log('[ProviderSelector] Selection summary:');
    Object.entries(providerCounts).forEach(([id, count]) => {
      console.log(`  ${VIDEO_PROVIDERS[id]?.displayName || id}: ${count} scenes`);
    });
    
    return selections;
  }
  
  private scoreFamily(
    family: string,
    bonus: number,
    reason: string,
    scores: Record<string, number>,
    reasons: Record<string, string[]>
  ): void {
    const providers = getVideoProvidersByFamily(family);
    providers.forEach(p => {
      if (scores[p.id] !== undefined) {
        scores[p.id] += bonus;
        if (reason && !reasons[p.id].includes(reason)) {
          reasons[p.id].push(reason);
        }
      }
    });
  }
  
  private scoreByContentType(
    contentType: string,
    scores: Record<string, number>,
    reasons: Record<string, string[]>
  ): void {
    switch (contentType) {
      case 'person':
      case 'human_subjects':
        this.scoreFamily('kling', 30, 'Best for human subjects', scores, reasons);
        this.scoreFamily('runway', 15, '', scores, reasons);
        this.scoreFamily('veo', 10, '', scores, reasons);
        if (scores['runway-act-two'] !== undefined) {
          scores['runway-act-two'] += 20;
          reasons['runway-act-two'].push('Character performance for human subjects');
        }
        break;
        
      case 'product':
      case 'product_reveal':
        this.scoreFamily('luma', 30, 'Excellent product reveals', scores, reasons);
        this.scoreFamily('runway', 20, 'Premium product quality', scores, reasons);
        this.scoreFamily('veo', 15, '', scores, reasons);
        if (scores['runway-4.5'] !== undefined) {
          scores['runway-4.5'] += 10;
          reasons['runway-4.5'].push('Photorealistic product quality');
        }
        break;
        
      case 'nature':
      case 'broll':
        this.scoreFamily('hailuo', 25, 'Cost-effective nature scenes', scores, reasons);
        this.scoreFamily('hunyuan', 20, '', scores, reasons);
        this.scoreFamily('wan', 20, 'Natural landscapes', scores, reasons);
        this.scoreFamily('runway', 20, 'Cinematic landscapes', scores, reasons);
        if (scores['runway-4.5'] !== undefined) {
          scores['runway-4.5'] += 10;
          reasons['runway-4.5'].push('Photorealistic nature rendering');
        }
        break;
      
      case 'cinematic':
        this.scoreFamily('veo', 30, 'Premium cinematic quality', scores, reasons);
        this.scoreFamily('runway', 25, 'Cinematic creative control', scores, reasons);
        if (scores['runway-4.5'] !== undefined) {
          scores['runway-4.5'] += 20;
          reasons['runway-4.5'].push('Top-tier photorealistic cinematic');
        }
        if (scores['runway-gen4-aleph'] !== undefined) {
          scores['runway-gen4-aleph'] += 10;
          reasons['runway-gen4-aleph'].push('Artistic cinematic interpretation');
        }
        this.scoreFamily('kling', 15, '', scores, reasons);
        this.scoreFamily('sora', 15, '', scores, reasons);
        break;
        
      case 'abstract':
        this.scoreFamily('kling', 20, 'Creative motion handling', scores, reasons);
        this.scoreFamily('hunyuan', 15, '', scores, reasons);
        this.scoreFamily('runway', 15, '', scores, reasons);
        this.scoreFamily('seedance', 15, 'Expressive motion', scores, reasons);
        if (scores['runway-gen4-aleph'] !== undefined) {
          scores['runway-gen4-aleph'] += 15;
          reasons['runway-gen4-aleph'].push('Artistic interpretation for abstract content');
        }
        break;
        
      case 'lifestyle':
        this.scoreFamily('kling', 25, 'Natural lifestyle rendering', scores, reasons);
        this.scoreFamily('wan', 20, 'Good lifestyle quality', scores, reasons);
        this.scoreFamily('hailuo', 15, '', scores, reasons);
        if (scores['runway-act-two'] !== undefined) {
          scores['runway-act-two'] += 10;
          reasons['runway-act-two'].push('Character performance for lifestyle');
        }
        break;

      case 'conceptual_explanatory':
        this.scoreFamily('wan', 30, 'Text rendering for conceptual content', scores, reasons);
        this.scoreFamily('hailuo', 15, 'Cost-effective conceptual visuals', scores, reasons);
        this.scoreFamily('runway', -10, '', scores, reasons);
        this.scoreFamily('luma', -10, '', scores, reasons);
        this.scoreFamily('veo', -10, '', scores, reasons);
        if (scores['runway-4.5'] !== undefined) scores['runway-4.5'] -= 15;
        if (scores['runway-gen4'] !== undefined) scores['runway-gen4'] -= 15;
        if (scores['runway-gen4-aleph'] !== undefined) scores['runway-gen4-aleph'] -= 15;
        if (scores['runway-act-two'] !== undefined) scores['runway-act-two'] -= 15;
        break;

      case 'infographic_diagram':
        if (scores['remotion-motion-graphics'] !== undefined) {
          scores['remotion-motion-graphics'] += 50;
          reasons['remotion-motion-graphics'].push('Infographic best rendered as motion graphics');
        }
        this.scoreFamily('runway', -20, '', scores, reasons);
        this.scoreFamily('kling', -20, '', scores, reasons);
        this.scoreFamily('luma', -20, '', scores, reasons);
        this.scoreFamily('hailuo', -15, '', scores, reasons);
        this.scoreFamily('veo', -20, '', scores, reasons);
        if (scores['runway-4.5'] !== undefined) scores['runway-4.5'] -= 25;
        if (scores['runway-gen4'] !== undefined) scores['runway-gen4'] -= 25;
        if (scores['runway-gen4-aleph'] !== undefined) scores['runway-gen4-aleph'] -= 25;
        if (scores['runway-act-two'] !== undefined) scores['runway-act-two'] -= 25;
        break;

      case 'motion_graphics':
        if (scores['remotion-motion-graphics'] !== undefined) {
          scores['remotion-motion-graphics'] += 45;
          reasons['remotion-motion-graphics'].push('Motion graphics specialization');
        }
        this.scoreFamily('runway', -15, '', scores, reasons);
        this.scoreFamily('kling', -15, '', scores, reasons);
        this.scoreFamily('veo', -15, '', scores, reasons);
        if (scores['runway-4.5'] !== undefined) scores['runway-4.5'] -= 20;
        if (scores['runway-gen4'] !== undefined) scores['runway-gen4'] -= 20;
        if (scores['runway-gen4-aleph'] !== undefined) scores['runway-gen4-aleph'] -= 20;
        if (scores['runway-act-two'] !== undefined) scores['runway-act-two'] -= 20;
        break;

      case 'mixed':
      default:
        this.scoreFamily('kling', 10, 'Reliable general-purpose', scores, reasons);
        this.scoreFamily('sora', 10, 'Consistent style for mixed', scores, reasons);
        this.scoreFamily('runway', 5, '', scores, reasons);
        if (scores['runway-gen4'] !== undefined) {
          scores['runway-gen4'] += 5;
          reasons['runway-gen4'].push('Versatile mixed content');
        }
        break;
    }
  }
  
  private scoreBySceneType(
    sceneType: string,
    scores: Record<string, number>,
    reasons: Record<string, string[]>
  ): void {
    switch (sceneType) {
      case 'hook':
        this.scoreFamily('runway', 25, 'Cinematic hook impact', scores, reasons);
        this.scoreFamily('veo', 25, 'High-quality opening', scores, reasons);
        if (scores['veo-3.1']) scores['veo-3.1'] += 5;
        if (scores['runway-4.5'] !== undefined) {
          scores['runway-4.5'] += 15;
          reasons['runway-4.5'].push('Top-tier cinematic hook');
        }
        if (scores['runway-gen4'] !== undefined) {
          scores['runway-gen4'] += 10;
          reasons['runway-gen4'].push('Dramatic hook storytelling');
        }
        break;
        
      case 'problem':
      case 'agitation':
        this.scoreFamily('kling', 20, 'Authentic emotional expressions', scores, reasons);
        if (scores['kling-2.1']) scores['kling-2.1'] += 5;
        if (scores['runway-act-two'] !== undefined) {
          scores['runway-act-two'] += 20;
          reasons['runway-act-two'].push('Emotional character performance');
        }
        if (scores['runway-gen4-aleph'] !== undefined) {
          scores['runway-gen4-aleph'] += 10;
          reasons['runway-gen4-aleph'].push('Creative emotional storytelling');
        }
        break;
        
      case 'solution':
        this.scoreFamily('runway', 15, '', scores, reasons);
        this.scoreFamily('kling', 15, '', scores, reasons);
        this.scoreFamily('veo', 10, '', scores, reasons);
        if (scores['runway-4.5'] !== undefined) {
          scores['runway-4.5'] += 10;
          reasons['runway-4.5'].push('Photorealistic solution reveal');
        }
        break;
        
      case 'benefit':
        this.scoreFamily('kling', 20, 'Lifestyle transformation scenes', scores, reasons);
        this.scoreFamily('wan', 15, '', scores, reasons);
        if (scores['runway-act-two'] !== undefined) {
          scores['runway-act-two'] += 10;
          reasons['runway-act-two'].push('Character transformation performance');
        }
        break;
        
      case 'product':
        this.scoreFamily('luma', 30, 'Product showcase specialty', scores, reasons);
        this.scoreFamily('runway', 15, '', scores, reasons);
        if (scores['runway-4.5'] !== undefined) {
          scores['runway-4.5'] += 10;
          reasons['runway-4.5'].push('Photorealistic product quality');
        }
        break;
        
      case 'testimonial':
        this.scoreFamily('kling', 30, 'Best for talking heads', scores, reasons);
        if (scores['kling-avatar']) scores['kling-avatar'] += 20;
        if (scores['runway-act-two'] !== undefined) {
          scores['runway-act-two'] += 25;
          reasons['runway-act-two'].push('Character acting for testimonials');
        }
        break;
        
      case 'cta':
        this.scoreFamily('runway', 20, 'Premium closing impact', scores, reasons);
        this.scoreFamily('veo', 15, '', scores, reasons);
        if (scores['remotion-motion-graphics']) {
          scores['remotion-motion-graphics'] += 25;
          reasons['remotion-motion-graphics'].push('CTA motion graphics');
        }
        if (scores['runway-4.5'] !== undefined) {
          scores['runway-4.5'] += 10;
          reasons['runway-4.5'].push('Premium CTA impact');
        }
        break;
        
      case 'broll':
      case 'explanation':
        this.scoreFamily('hailuo', 25, 'Cost-effective B-roll', scores, reasons);
        this.scoreFamily('wan', 20, 'Fast B-roll generation', scores, reasons);
        this.scoreFamily('hunyuan', 15, '', scores, reasons);
        break;
    }
  }
  
  private scoreByVisualDirection(
    visualDirection: string,
    scores: Record<string, number>,
    reasons: Record<string, string[]>
  ): void {
    if (!visualDirection) return;
    
    const lower = visualDirection.toLowerCase();
    
    if (/cinematic|dramatic|epic|film|movie|golden hour|sweeping/.test(lower)) {
      this.scoreFamily('runway', 20, 'Cinematic visual direction', scores, reasons);
      this.scoreFamily('veo', 20, 'Cinematic quality', scores, reasons);
      if (scores['veo-3.1']) scores['veo-3.1'] += 5;
      if (scores['runway-4.5'] !== undefined) {
        scores['runway-4.5'] += 15;
        reasons['runway-4.5'].push('Top-tier cinematic quality');
      }
      if (scores['runway-gen4'] !== undefined) {
        scores['runway-gen4'] += 10;
        reasons['runway-gen4'].push('Dramatic storytelling');
      }
    }
    
    if (/person|woman|man|face|expression|people|customer|talking|smiling/.test(lower)) {
      this.scoreFamily('kling', 25, 'Human subject in visual', scores, reasons);
      if (scores['kling-2.5-turbo']) scores['kling-2.5-turbo'] += 5;
      if (scores['runway-act-two'] !== undefined) {
        scores['runway-act-two'] += 20;
        reasons['runway-act-two'].push('Character performance for people');
      }
    }
    
    if (/avatar|talking head|presenter|spokesperson/.test(lower)) {
      if (scores['kling-avatar']) {
        scores['kling-avatar'] += 30;
        reasons['kling-avatar'].push('Avatar specialization');
      }
    }
    
    if (/product|bottle|package|reveal|showcase|display|object/.test(lower)) {
      this.scoreFamily('luma', 20, 'Product focus in visual', scores, reasons);
    }
    
    if (/nature|landscape|outdoor|garden|field|ambient|background|farm|natural/.test(lower)) {
      this.scoreFamily('hailuo', 15, 'Nature/ambient scene', scores, reasons);
      this.scoreFamily('wan', 15, 'Natural scenes', scores, reasons);
      this.scoreFamily('hunyuan', 10, '', scores, reasons);
    }
    
    if (/wellness|spa|calm|peaceful|serene|relaxing/.test(lower)) {
      this.scoreFamily('kling', 15, 'Wellness atmosphere', scores, reasons);
      this.scoreFamily('wan', 10, '', scores, reasons);
    }
    
    if (/effects|particles|transition|overlay|vfx/.test(lower)) {
      if (scores['kling-effects']) {
        scores['kling-effects'] += 25;
        reasons['kling-effects'].push('Effects specialization');
      }
    }
    
    if (/dance|dancing|movement|expressive|character/.test(lower)) {
      if (scores['seedance-1.0']) {
        scores['seedance-1.0'] += 25;
        reasons['seedance-1.0'].push('Dance motion specialty');
      }
    }

    if (/acting|performance|emotion|feeling|react|cry|laugh|anger|joy|sorrow/.test(lower)) {
      if (scores['runway-act-two'] !== undefined) {
        scores['runway-act-two'] += 25;
        reasons['runway-act-two'].push('Acting and emotional performance');
      }
    }

    if (/artistic|creative|stylized|surreal|visual.?effect|abstract.?motion/.test(lower)) {
      if (scores['runway-gen4-aleph'] !== undefined) {
        scores['runway-gen4-aleph'] += 20;
        reasons['runway-gen4-aleph'].push('Creative artistic interpretation');
      }
    }

    if (/photorealistic|hyper.?real|photo.?real|ultra.?real/.test(lower)) {
      if (scores['runway-4.5'] !== undefined) {
        scores['runway-4.5'] += 20;
        reasons['runway-4.5'].push('Photorealistic rendering');
      }
    }
    
    if (/text|infographic|chart|graph|motion graphic|lower.?third/.test(lower)) {
      if (scores['remotion-motion-graphics']) {
        scores['remotion-motion-graphics'] += 30;
        reasons['remotion-motion-graphics'].push('Motion graphics specialty');
      }
    }
    
    if (/fast|action|dynamic|quick|speed/.test(lower)) {
      if (scores['kling-2.5-turbo']) {
        scores['kling-2.5-turbo'] += 15;
        reasons['kling-2.5-turbo'].push('Fast turbo generation');
      }
    }

    if (/root cause|how it works|mechanism|process|compare|versus|vs\b|metaphor|analogy|concept|cause and effect/.test(lower)) {
      this.scoreFamily('wan', 20, 'Conceptual content - text rendering', scores, reasons);
      this.scoreFamily('runway', -10, '', scores, reasons);
    }

    if (/diagram|step.?by.?step|flowchart|timeline|statistics|percentage|data viz/.test(lower)) {
      if (scores['remotion-motion-graphics'] !== undefined) {
        scores['remotion-motion-graphics'] += 35;
        reasons['remotion-motion-graphics'].push('Diagram/infographic content');
      }
    }
  }
  
  private scoreByStylePreferences(
    preferredProviders: string[],
    scores: Record<string, number>,
    reasons: Record<string, string[]>
  ): void {
    preferredProviders.forEach((provider, index) => {
      const bonus = 15 - (index * 5);
      if (scores[provider] !== undefined && bonus > 0) {
        scores[provider] += bonus;
        reasons[provider].push('Style preference');
      }
      const family = VIDEO_PROVIDERS[provider]?.family;
      if (family && bonus > 0) {
        this.scoreFamily(family, Math.floor(bonus / 2), '', scores, reasons);
      }
    });
  }
  
  private scoreByDuration(
    duration: number,
    scores: Record<string, number>,
    reasons: Record<string, string[]>
  ): void {
    Object.entries(VIDEO_PROVIDERS).forEach(([id, provider]) => {
      if (duration > provider.maxDuration) {
        scores[id] -= 30;
        reasons[id].push(`Duration exceeds ${provider.maxDuration}s max`);
      }
      if (provider.maxDuration >= 60 && duration > 30) {
        scores[id] += 10;
        reasons[id].push('Supports long-form content');
      }
    });
  }
  
  private scoreByQualityTier(
    qualityTier: 'ultra' | 'premium' | 'standard',
    scores: Record<string, number>,
    reasons: Record<string, string[]>
  ): void {
    const ultraProviders = ['veo-3.1', 'veo-2', 'kling-2.6-pro', 'kling-2.6-motion-control-pro', 'kling-2.6', 'runway', 'luma', 'runway-4.5', 'runway-gen4', 'runway-gen4-aleph', 'runway-act-two'];
    const premiumProviders = ['kling-2.6', 'kling-2.6-pro', 'kling-2.5-turbo', 'kling-2.5', 'veo-2', 'veo-3.1', 'runway', 'kling-2.1', 'runway-4.5', 'runway-gen4', 'runway-gen4-aleph', 'runway-act-two'];
    const standardProviders = ['kling-1.6', 'kling-2.0', 'wan-2.1', 'wan-2.6', 'seedance-1.0'];
    
    if (qualityTier === 'ultra') {
      if (scores['veo-3.1'] !== undefined) {
        scores['veo-3.1'] += 80;
        if (!reasons['veo-3.1'].includes('Top Ultra tier - Veo 3.1')) {
          reasons['veo-3.1'].push('Top Ultra tier - Veo 3.1');
        }
      }
      if (scores['veo-2'] !== undefined) {
        scores['veo-2'] += 60;
        if (!reasons['veo-2'].includes('Ultra tier - Veo 2')) {
          reasons['veo-2'].push('Ultra tier - Veo 2');
        }
      }
      if (scores['runway-4.5'] !== undefined) {
        scores['runway-4.5'] += 70;
        if (!reasons['runway-4.5'].includes('Ultra tier - Runway 4.5 top cinematic')) {
          reasons['runway-4.5'].push('Ultra tier - Runway 4.5 top cinematic');
        }
      }
      ultraProviders.forEach(id => {
        if (scores[id] !== undefined && id !== 'veo-3.1' && id !== 'veo-2' && id !== 'runway-4.5') {
          scores[id] += 40;
          if (!reasons[id].includes('Ultra tier provider')) {
            reasons[id].push('Ultra tier provider');
          }
        }
      });
      standardProviders.forEach(id => {
        if (scores[id] !== undefined) {
          scores[id] -= 30;
        }
      });
    } else if (qualityTier === 'premium') {
      premiumProviders.forEach(id => {
        if (scores[id] !== undefined) {
          scores[id] += 30;
          if (!reasons[id].includes('Premium tier provider')) {
            reasons[id].push('Premium tier provider');
          }
        }
      });
      standardProviders.forEach(id => {
        if (scores[id] !== undefined) {
          scores[id] -= 15;
        }
      });
    } else {
      standardProviders.forEach(id => {
        if (scores[id] !== undefined) {
          scores[id] += 40;
          if (!reasons[id].includes('Cost-effective option')) {
            reasons[id].push('Cost-effective option');
          }
        }
      });
      ultraProviders.forEach(id => {
        if (scores[id] !== undefined) {
          scores[id] -= 25;
        }
      });
    }
  }
  
  private scoreBySpecialization(
    scene: SceneForSelection,
    scores: Record<string, number>,
    reasons: Record<string, string[]>
  ): void {
    Object.entries(VIDEO_PROVIDERS).forEach(([id, provider]) => {
      if (!provider.specialization) return;
      
      const visual = scene.visualDirection?.toLowerCase() || '';
      const narration = scene.narration?.toLowerCase() || '';
      const combined = visual + ' ' + narration;
      
      switch (provider.specialization) {
        case 'talking-head':
          if (scene.sceneType === 'testimonial' || /talking|speaking|presenter/.test(combined)) {
            scores[id] += 20;
            reasons[id].push('Talking head specialization');
          }
          break;
        case 'effects':
          if (/effect|particle|transition|overlay/.test(combined)) {
            scores[id] += 15;
          }
          break;
        case 'dance':
          if (/dance|dancing|move|groove/.test(combined)) {
            scores[id] += 20;
          }
          break;
        case 'motion-graphics':
          if (/text|chart|info|graphic|animation/.test(combined) || scene.sceneType === 'cta') {
            scores[id] += 15;
          }
          break;
        case 'character-performance':
          if (/acting|performance|emotion|character|feeling|react|testimonial|dialogue/.test(combined) ||
              scene.sceneType === 'testimonial' || scene.sceneType === 'problem' || scene.sceneType === 'agitation') {
            scores[id] += 25;
            reasons[id].push('Character performance specialization');
          }
          break;
      }
    });
  }
  
  calculateTotalCost(
    selections: Map<number, ProviderSelection>,
    scenes: SceneForSelection[]
  ): { total: number; breakdown: Record<string, number> } {
    const breakdown: Record<string, number> = {};
    let total = 0;
    
    selections.forEach((selection, sceneIndex) => {
      const scene = scenes.find(s => s.sceneIndex === sceneIndex);
      if (scene) {
        const cost = scene.duration * selection.provider.costPerSecond;
        breakdown[selection.provider.id] = (breakdown[selection.provider.id] || 0) + cost;
        total += cost;
      }
    });
    
    return { total, breakdown };
  }
  
  getProviderSummary(
    selections: Map<number, ProviderSelection>
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    selections.forEach(sel => {
      counts[sel.provider.id] = (counts[sel.provider.id] || 0) + 1;
    });
    return counts;
  }
}

export const videoProviderSelector = new VideoProviderSelectorService();
