// server/services/brand-injection-service.ts

import { db } from '../db';
import { brandMediaLibrary } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { brandBibleService, BrandBible, BrandAsset } from './brand-bible-service';
import { assetUrlResolver } from './asset-url-resolver';

// ============================================
// PHASE 8E TYPES
// ============================================

export interface LogoIntroConfig {
  enabled: boolean;
  asset: BrandAsset | null;
  duration: number;
  animation: 'fade' | 'zoom' | 'slide-up' | 'none';
  backgroundColor?: string;
  position: 'center' | 'lower-third';
  includeTagline: boolean;
  tagline?: string;
}

export interface WatermarkConfig {
  enabled: boolean;
  asset: BrandAsset | null;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number;
  scale: number;
  margin: number;
  showDuring: 'all' | 'middle' | 'custom';
  customStart?: number;
  customEnd?: number;
}

export interface CTAOutroConfig {
  enabled: boolean;
  duration: number;
  backgroundColor: string;
  logo: BrandAsset | null;
  contactInfo: {
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
  };
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    tiktok?: string;
  };
  headline?: string;
  subheadline?: string;
  buttonText?: string;
  buttonUrl?: string;
  animation: 'fade' | 'slide-up' | 'build';
}

export interface BrandInjectionPlan {
  logoIntro: LogoIntroConfig;
  watermark: WatermarkConfig;
  ctaOutro: CTAOutroConfig;
  totalAddedDuration: number;
}

const DEFAULT_LOGO_INTRO: Omit<LogoIntroConfig, 'asset'> = {
  enabled: true,
  duration: 2.5,
  animation: 'fade',
  backgroundColor: '#1a1a1a',
  position: 'center',
  includeTagline: true,
  tagline: 'Cultivating Wellness',
};

const DEFAULT_WATERMARK: Omit<WatermarkConfig, 'asset'> = {
  enabled: true,
  position: 'bottom-right',
  opacity: 0.7,
  scale: 0.08,
  margin: 20,
  showDuring: 'all',
};

const DEFAULT_CTA_OUTRO: Omit<CTAOutroConfig, 'logo'> = {
  enabled: true,
  duration: 5,
  backgroundColor: '#2D5A27',
  contactInfo: {
    website: 'pinehillfarm.co',
    phone: '',
    email: '',
  },
  headline: 'Start Your Wellness Journey',
  subheadline: 'Schedule your consultation today',
  buttonText: 'Learn More',
  animation: 'build',
};

export interface BrandOverlay {
  type: 'logo' | 'watermark' | 'cta' | 'intro' | 'outro';
  assetUrl: string;
  position: {
    x: number;
    y: number;
    anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  };
  size: {
    width: number;
    maxHeight?: number;
  };
  animation: {
    type: 'fade' | 'slide' | 'zoom' | 'none';
    duration: number;
    delay?: number;
  };
  timing: {
    startTime: number;
    duration: number;
  };
  opacity: number;
}

export interface CTAText {
  headline: string;
  subtext?: string;
  url: string;
}

export interface SceneBrandOverlays {
  sceneId: string;
  overlays: BrandOverlay[];
  ctaText?: CTAText;
}

export interface CTAOverlay extends BrandOverlay {
  ctaData: CTAText;
  styling: {
    backgroundColor: string;
    textColor: string;
    buttonColor: string;
  };
}

export interface VideoBrandInstructions {
  introAnimation?: BrandOverlay;
  watermark?: BrandOverlay;
  outroSequence?: BrandOverlay[];
  ctaOverlay?: CTAOverlay;
  sceneOverlays: Record<string, SceneBrandOverlays>;
  colors: BrandBible['colors'];
  typography: BrandBible['typography'];
  callToAction: BrandBible['callToAction'];
}

export interface SceneInfo {
  id: string;
  type: string;
  duration: number;
  isFirst: boolean;
  isLast: boolean;
}

class BrandInjectionService {
  
  /**
   * Generate brand injection instructions for an entire video
   */
  async generateBrandInstructions(scenes: SceneInfo[]): Promise<VideoBrandInstructions> {
    const bible = await brandBibleService.getBrandBible();
    
    console.log('[BrandInject] Generating brand instructions for video...');
    
    const instructions: VideoBrandInstructions = {
      sceneOverlays: {},
      colors: bible.colors,
      typography: bible.typography,
      callToAction: bible.callToAction,
    };
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 17A: Resolve all asset URLs to public URLs before use
    // ═══════════════════════════════════════════════════════════════
    console.log('[BrandInject] Resolving asset URLs to public URLs...');
    
    const urlsToResolve = [
      bible.logos.intro?.url,
      bible.logos.main?.url,
      bible.logos.watermark?.url,
      bible.logos.outro?.url,
    ].filter(Boolean) as string[];
    
    const resolvedUrls = await assetUrlResolver.resolveAll(urlsToResolve);
    
    const resolveLogoUrl = (logo: BrandAsset | undefined): BrandAsset | undefined => {
      if (!logo) return undefined;
      const resolved = resolvedUrls.get(logo.url);
      if (resolved) {
        return { ...logo, url: resolved };
      }
      console.warn(`[BrandInject] Failed to resolve logo URL: ${logo.url}`);
      return undefined;
    };
    
    const resolvedIntroLogo = resolveLogoUrl(bible.logos.intro) || resolveLogoUrl(bible.logos.main);
    const resolvedWatermarkLogo = resolveLogoUrl(bible.logos.watermark) || resolveLogoUrl(bible.logos.main);
    const resolvedOutroLogo = resolveLogoUrl(bible.logos.outro) || resolveLogoUrl(bible.logos.main);
    
    // 1. Generate intro animation for first scene
    if (resolvedIntroLogo) {
      instructions.introAnimation = this.createIntroAnimation(
        resolvedIntroLogo,
        scenes[0]?.duration || 5
      );
      console.log(`[BrandInject] Intro animation configured (logo: ${resolvedIntroLogo.name}, URL: ${resolvedIntroLogo.url.substring(0, 50)}...)`);
    }
    
    // 2. Generate watermark for middle scenes
    if (resolvedWatermarkLogo) {
      instructions.watermark = this.createWatermarkOverlay(resolvedWatermarkLogo);
      console.log(`[BrandInject] Watermark overlay configured (position: ${instructions.watermark.position.anchor}, opacity: ${instructions.watermark.opacity})`);
    }
    
    // 3. Generate outro sequence for last scene
    if (resolvedOutroLogo) {
      const lastScene = scenes[scenes.length - 1];
      instructions.outroSequence = this.createOutroSequence(
        resolvedOutroLogo,
        bible.callToAction,
        lastScene?.duration || 5
      );
      
      // 3b. Generate CTA overlay for outro
      instructions.ctaOverlay = this.createCTAOverlay(
        bible.callToAction,
        bible.colors,
        lastScene?.duration || 5
      );
      console.log('[BrandInject] Outro sequence configured with CTA overlay');
    }
    
    // 4. Generate per-scene overlay instructions
    for (const scene of scenes) {
      const sceneOverlays = await this.generateSceneOverlays(scene, bible);
      instructions.sceneOverlays[scene.id] = sceneOverlays;
    }
    
    console.log(`[BrandInject] Brand instructions complete for ${scenes.length} scenes`);
    
    return instructions;
  }

  /**
   * Create intro logo animation overlay
   */
  private createIntroAnimation(logo: BrandAsset, sceneDuration: number): BrandOverlay {
    const placement = logo.placementSettings || {};
    
    return {
      type: 'intro',
      assetUrl: logo.url,
      position: {
        x: 50,
        y: 50,
        anchor: 'center',
      },
      size: {
        width: 30,
        maxHeight: 25,
      },
      animation: {
        type: (placement.animation as BrandOverlay['animation']['type']) || 'zoom',
        duration: 1.5,
        delay: 0.3,
      },
      timing: {
        startTime: 0,
        duration: Math.min(3, sceneDuration * 0.5),
      },
      opacity: 1,
    };
  }

  /**
   * Create persistent watermark overlay
   */
  private createWatermarkOverlay(logo: BrandAsset): BrandOverlay {
    const placement = logo.placementSettings || {};
    const position = (placement.position as string) || 'bottom-right';
    
    const positionMap: Record<string, { x: number; y: number }> = {
      'top-left': { x: 8, y: 8 },
      'top-right': { x: 92, y: 8 },
      'bottom-left': { x: 8, y: 92 },
      'bottom-right': { x: 92, y: 92 },
      'center': { x: 50, y: 50 },
    };
    
    const coords = positionMap[position] || positionMap['bottom-right'];
    
    return {
      type: 'watermark',
      assetUrl: logo.url,
      position: {
        x: coords.x,
        y: coords.y,
        anchor: position as BrandOverlay['position']['anchor'],
      },
      size: {
        width: placement.scale ? (placement.scale as number) * 20 : 12,
        maxHeight: 10,
      },
      animation: {
        type: 'fade',
        duration: 0.5,
        delay: 0,
      },
      timing: {
        startTime: 0,
        duration: -1,
      },
      opacity: (placement.opacity as number) || 0.7,
    };
  }

  /**
   * Create outro CTA sequence
   */
  private createOutroSequence(
    logo: BrandAsset,
    cta: BrandBible['callToAction'],
    sceneDuration: number
  ): BrandOverlay[] {
    const overlays: BrandOverlay[] = [];
    const outroStartTime = Math.max(0, sceneDuration - 4);
    
    overlays.push({
      type: 'outro',
      assetUrl: logo.url,
      position: {
        x: 50,
        y: 30,
        anchor: 'center',
      },
      size: {
        width: 25,
        maxHeight: 20,
      },
      animation: {
        type: 'fade',
        duration: 0.8,
        delay: 0,
      },
      timing: {
        startTime: outroStartTime,
        duration: 4,
      },
      opacity: 1,
    });
    
    return overlays;
  }

  /**
   * Create CTA overlay for outro scene
   */
  private createCTAOverlay(
    cta: BrandBible['callToAction'],
    colors: BrandBible['colors'],
    sceneDuration: number
  ): CTAOverlay {
    const outroStartTime = Math.max(0, sceneDuration - 4);
    
    return {
      type: 'cta',
      assetUrl: '',
      position: {
        x: 50,
        y: 65,
        anchor: 'center',
      },
      size: {
        width: 60,
        maxHeight: 30,
      },
      animation: {
        type: 'fade',
        duration: 0.6,
        delay: 0.8,
      },
      timing: {
        startTime: outroStartTime + 0.8,
        duration: 3.2,
      },
      opacity: 1,
      ctaData: {
        headline: cta.text,
        subtext: cta.subtext,
        url: cta.url,
      },
      styling: {
        backgroundColor: colors.primary,
        textColor: '#FFFFFF',
        buttonColor: colors.accent,
      },
    };
  }

  /**
   * Generate overlays for a specific scene
   */
  private async generateSceneOverlays(
    scene: SceneInfo,
    bible: BrandBible
  ): Promise<SceneBrandOverlays> {
    const overlays: BrandOverlay[] = [];
    
    if (scene.type === 'product') {
      const productAssets = await brandBibleService.getAssetsForContext('product');
      if (productAssets.length > 0) {
        overlays.push({
          type: 'logo',
          assetUrl: productAssets[0].url,
          position: {
            x: 85,
            y: 75,
            anchor: 'bottom-right',
          },
          size: {
            width: 20,
            maxHeight: 25,
          },
          animation: {
            type: 'fade',
            duration: 0.5,
            delay: 1,
          },
          timing: {
            startTime: 1,
            duration: scene.duration - 2,
          },
          opacity: 1,
        });
      }
    }
    
    const result: SceneBrandOverlays = {
      sceneId: scene.id,
      overlays,
    };
    
    if (scene.isLast) {
      result.ctaText = {
        headline: bible.callToAction.text,
        subtext: bible.callToAction.subtext,
        url: bible.callToAction.url,
      };
    }
    
    return result;
  }

  /**
   * Match brand assets to scene based on narration content
   */
  async matchAssetsToScene(
    sceneNarration: string,
    sceneType: string
  ): Promise<BrandAsset[]> {
    const keywords = this.extractKeywords(sceneNarration);
    keywords.push(sceneType);
    
    return brandBibleService.getAssetsForKeywords(keywords);
  }

  /**
   * Extract keywords from text for asset matching
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'your', 'you', 'our', 'we', 'they', 'them', 'their', 'this', 'that',
      'it', 'its', 'if', 'then', 'so', 'just', 'only', 'also', 'very',
    ]);
    
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Check if brand assets are configured for video generation
   */
  async hasBrandAssets(): Promise<{
    hasIntro: boolean;
    hasWatermark: boolean;
    hasOutro: boolean;
    hasCTA: boolean;
  }> {
    const bible = await brandBibleService.getBrandBible();
    
    return {
      hasIntro: !!(bible.logos.intro || bible.logos.main),
      hasWatermark: !!(bible.logos.watermark || bible.logos.main),
      hasOutro: !!(bible.logos.outro || bible.logos.main),
      hasCTA: !!bible.callToAction.text,
    };
  }

  // ============================================
  // PHASE 8E: Brand Injection Plan Methods
  // ============================================

  async createInjectionPlan(
    projectId: number | string,
    overrides?: Partial<BrandInjectionPlan>
  ): Promise<BrandInjectionPlan> {
    console.log(`[BrandInjection] Creating injection plan for project ${projectId}`);
    
    const bible = await brandBibleService.getBrandBible();
    
    const primaryLogo = bible.logos.intro || bible.logos.main;
    const watermarkAsset = bible.logos.watermark || bible.logos.main;
    const ctaLogo = bible.logos.outro || bible.logos.main;
    
    const plan: BrandInjectionPlan = {
      logoIntro: {
        ...DEFAULT_LOGO_INTRO,
        asset: primaryLogo || null,
        enabled: !!primaryLogo,
        ...overrides?.logoIntro,
      },
      watermark: {
        ...DEFAULT_WATERMARK,
        asset: watermarkAsset || null,
        enabled: !!watermarkAsset,
        ...overrides?.watermark,
      },
      ctaOutro: {
        ...DEFAULT_CTA_OUTRO,
        logo: ctaLogo || null,
        enabled: true,
        headline: bible.callToAction.text || DEFAULT_CTA_OUTRO.headline,
        subheadline: bible.callToAction.subtext || DEFAULT_CTA_OUTRO.subheadline,
        buttonUrl: bible.callToAction.url,
        ...overrides?.ctaOutro,
      },
      totalAddedDuration: 0,
    };
    
    plan.totalAddedDuration = 
      (plan.logoIntro.enabled ? plan.logoIntro.duration : 0) +
      (plan.ctaOutro.enabled ? plan.ctaOutro.duration : 0);
    
    console.log(`[BrandInjection] Plan created: intro=${plan.logoIntro.enabled}, watermark=${plan.watermark.enabled}, outro=${plan.ctaOutro.enabled}`);
    console.log(`[BrandInjection] Added duration: ${plan.totalAddedDuration}s`);
    
    return plan;
  }

  getLogoIntroProps(config: LogoIntroConfig, fps: number): {
    enabled: boolean;
    durationInFrames?: number;
    logoUrl?: string;
    backgroundColor?: string;
    position?: string;
    animation?: string;
    tagline?: string;
    fadeIn?: number;
    fadeOut?: number;
  } {
    if (!config.enabled || !config.asset) {
      return { enabled: false };
    }
    
    return {
      enabled: true,
      durationInFrames: Math.round(config.duration * fps),
      logoUrl: config.asset.url,
      backgroundColor: config.backgroundColor,
      position: config.position,
      animation: config.animation,
      tagline: config.includeTagline ? config.tagline : undefined,
      fadeIn: Math.round(0.5 * fps),
      fadeOut: Math.round(0.3 * fps),
    };
  }
  
  getWatermarkProps(
    config: WatermarkConfig,
    totalFrames: number,
    fps: number
  ): {
    enabled: boolean;
    logoUrl?: string;
    position?: string;
    opacity?: number;
    scale?: number;
    margin?: number;
    startFrame?: number;
    endFrame?: number;
  } {
    if (!config.enabled || !config.asset) {
      return { enabled: false };
    }
    
    let startFrame = 0;
    let endFrame = totalFrames;
    
    if (config.showDuring === 'middle') {
      startFrame = Math.round(totalFrames * 0.1);
      endFrame = Math.round(totalFrames * 0.9);
    } else if (config.showDuring === 'custom') {
      startFrame = config.customStart || 0;
      endFrame = config.customEnd || totalFrames;
    }
    
    return {
      enabled: true,
      logoUrl: config.asset.url,
      position: config.position,
      opacity: config.opacity,
      scale: config.scale,
      margin: config.margin,
      startFrame,
      endFrame,
    };
  }
  
  getCTAOutroProps(config: CTAOutroConfig, fps: number): {
    enabled: boolean;
    durationInFrames?: number;
    backgroundColor?: string;
    logoUrl?: string;
    headline?: string;
    subheadline?: string;
    website?: string;
    phone?: string;
    email?: string;
    address?: string;
    socialMedia?: CTAOutroConfig['socialMedia'];
    buttonText?: string;
    buttonUrl?: string;
    animation?: string;
    logoDelay?: number;
    headlineDelay?: number;
    contactDelay?: number;
    buttonDelay?: number;
  } {
    if (!config.enabled) {
      return { enabled: false };
    }
    
    return {
      enabled: true,
      durationInFrames: Math.round(config.duration * fps),
      backgroundColor: config.backgroundColor,
      logoUrl: config.logo?.url,
      headline: config.headline,
      subheadline: config.subheadline,
      website: config.contactInfo.website,
      phone: config.contactInfo.phone,
      email: config.contactInfo.email,
      address: config.contactInfo.address,
      socialMedia: config.socialMedia,
      buttonText: config.buttonText,
      buttonUrl: config.buttonUrl,
      animation: config.animation,
      logoDelay: Math.round(0.3 * fps),
      headlineDelay: Math.round(0.8 * fps),
      contactDelay: Math.round(1.5 * fps),
      buttonDelay: Math.round(2.2 * fps),
    };
  }
  
  getRemotionBrandProps(plan: BrandInjectionPlan, totalContentFrames: number, fps: number): {
    logoIntro: { enabled: boolean; durationInFrames?: number; logoUrl?: string; backgroundColor?: string; position?: string; animation?: string; tagline?: string; fadeIn?: number; fadeOut?: number };
    watermark: { enabled: boolean; logoUrl?: string; position?: string; opacity?: number; scale?: number; margin?: number; startFrame?: number; endFrame?: number };
    ctaOutro: { enabled: boolean; durationInFrames?: number; backgroundColor?: string; logoUrl?: string; headline?: string; subheadline?: string; website?: string; phone?: string; email?: string; address?: string; socialMedia?: CTAOutroConfig['socialMedia']; buttonText?: string; buttonUrl?: string; animation?: string; logoDelay?: number; headlineDelay?: number; contactDelay?: number; buttonDelay?: number };
    totalFrames: number;
    introFrames: number;
    outroFrames: number;
  } {
    const introFrames = plan.logoIntro.enabled ? Math.round(plan.logoIntro.duration * fps) : 0;
    const outroFrames = plan.ctaOutro.enabled ? Math.round(plan.ctaOutro.duration * fps) : 0;
    const totalFrames = totalContentFrames + introFrames + outroFrames;
    
    return {
      logoIntro: this.getLogoIntroProps(plan.logoIntro, fps),
      watermark: this.getWatermarkProps(plan.watermark, totalFrames, fps),
      ctaOutro: this.getCTAOutroProps(plan.ctaOutro, fps),
      totalFrames,
      introFrames,
      outroFrames,
    };
  }
  
  getDefaultSettings(): {
    logoIntro: Omit<LogoIntroConfig, 'asset'>;
    watermark: Omit<WatermarkConfig, 'asset'>;
    ctaOutro: Omit<CTAOutroConfig, 'logo'>;
  } {
    return {
      logoIntro: DEFAULT_LOGO_INTRO,
      watermark: DEFAULT_WATERMARK,
      ctaOutro: DEFAULT_CTA_OUTRO,
    };
  }
}

export const brandInjectionService = new BrandInjectionService();
