import { db } from '../db';
import { brandMediaLibrary } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface BrandAsset {
  id: number;
  name: string;
  description?: string;
  mediaType: 'logo' | 'photo' | 'video' | 'graphic' | 'watermark';
  entityName?: string;
  entityType?: string;
  url: string;
  thumbnailUrl?: string;
  matchKeywords: string[];
  excludeKeywords: string[];
  usageContexts: string[];
  placementSettings?: {
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    scale?: number;
    opacity?: number;
    animation?: 'fade' | 'slide' | 'zoom' | 'none';
  };
  priority: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  background: string;
}

export interface BrandTypography {
  headingFont: string;
  bodyFont: string;
}

export interface BrandCTA {
  text: string;
  subtext?: string;
  buttonText?: string;
  url: string;
}

export interface BrandColorPaletteItem {
  hex: string;
  name: string;
}

export interface BrandBible {
  brandName: string;
  tagline?: string;
  website?: string;
  industry: string;
  colors: BrandColors;
  colorPalette?: BrandColorPaletteItem[];
  typography: BrandTypography;
  logos: {
    main?: BrandAsset;
    watermark?: BrandAsset;
    intro?: BrandAsset;
    outro?: BrandAsset;
    favicon?: BrandAsset;
  };
  assets: BrandAsset[];
  callToAction: BrandCTA;
  promptContext: string;
  negativePrompts: string[];
}

const BRAND_COLOR_PALETTE = [
  { hex: '#5e637a', name: 'Slate Blue' },
  { hex: '#607e66', name: 'Sage Green' },
  { hex: '#5b7c99', name: 'Steel Blue' },
  { hex: '#8c93ad', name: 'Lavender Gray' },
  { hex: '#a9a9a9', name: 'Silver' },
  { hex: '#6c97ab', name: 'Teal' },
  { hex: '#ffffff', name: 'White' },
  { hex: '#f8f8f3', name: 'Cream' },
  { hex: '#2d5a27', name: 'Forest Green' },
  { hex: '#c9a227', name: 'Gold' },
  { hex: '#f5f0e8', name: 'Warm Beige' },
];

const DEFAULT_BRAND_SETTINGS = {
  brandName: 'Pine Hill Farm',
  tagline: 'Natural Wellness, Naturally You',
  website: 'PineHillFarm.com',
  industry: 'wellness and natural health supplements',
  colors: {
    primary: '#2d5a27',
    secondary: '#607e66',
    accent: '#c9a227',
    text: '#ffffff',
    background: '#f5f0e8',
  },
  colorPalette: BRAND_COLOR_PALETTE,
  typography: {
    headingFont: 'Montserrat',
    bodyFont: 'Open Sans',
  },
  callToAction: {
    text: 'Start Your Wellness Journey Today',
    subtext: 'Natural solutions for lasting health',
    buttonText: 'Learn More',
    url: 'PineHillFarm.com',
  },
};

class BrandBibleService {
  private cachedBible: BrandBible | null = null;
  private cacheTimestamp: number = 0;
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  async getBrandBible(forceRefresh = false): Promise<BrandBible> {
    const now = Date.now();
    
    if (!forceRefresh && this.cachedBible && (now - this.cacheTimestamp) < this.cacheTTL) {
      console.log('[BrandBible] Using cached brand bible');
      return this.cachedBible;
    }

    console.log('[BrandBible] Loading brand assets from database...');

    try {
      const dbAssets = await db
        .select()
        .from(brandMediaLibrary)
        .where(eq(brandMediaLibrary.isActive, true));

      const assets: BrandAsset[] = dbAssets.map(asset => ({
        id: asset.id,
        name: asset.name,
        description: asset.description || undefined,
        mediaType: asset.mediaType as BrandAsset['mediaType'],
        entityName: asset.entityName || undefined,
        entityType: asset.entityType || undefined,
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl || undefined,
        matchKeywords: asset.matchKeywords || [],
        excludeKeywords: asset.excludeKeywords || [],
        usageContexts: asset.usageContexts || [],
        placementSettings: asset.placementSettings as BrandAsset['placementSettings'],
        priority: asset.priority || 0,
        isDefault: asset.isDefault || false,
        isActive: asset.isActive ?? true,
      }));

      console.log(`[BrandBible] Loaded ${assets.length} active brand assets`);
      
      // Debug: Show all assets with their contexts
      assets.forEach(a => {
        console.log(`[BrandBible] Asset: "${a.name}" | type: ${a.mediaType} | contexts: [${a.usageContexts.join(', ')}] | keywords: [${a.matchKeywords.join(', ')}] | url: ${a.url}`);
      });

      // Find logos with flexible mediaType matching (logo, photo, graphic all work)
      const logoTypes = ['logo', 'photo', 'graphic'];
      const logos = {
        main: this.findAssetByContextFlexible(assets, logoTypes, ['main', 'primary'], ['logo']),
        watermark: this.findAssetByContextFlexible(assets, ['watermark', ...logoTypes], ['watermark', 'overlay'], ['watermark']) ||
                   this.findAssetByContextFlexible(assets, logoTypes, ['watermark'], []),
        intro: this.findAssetByContextFlexible(assets, logoTypes, ['intro', 'opening'], ['logo']),
        outro: this.findAssetByContextFlexible(assets, logoTypes, ['outro', 'closing', 'cta'], ['logo']),
        favicon: this.findAssetByContextFlexible(assets, logoTypes, ['favicon', 'icon'], []),
      };
      
      // Debug: Show found logos with their URLs
      console.log(`[BrandBible] Intro logo found: ${logos.intro ? `${logos.intro.name} -> ${logos.intro.url}` : 'NONE'}`);
      console.log(`[BrandBible] Outro logo found: ${logos.outro ? `${logos.outro.name} -> ${logos.outro.url}` : 'NONE'}`);
      console.log(`[BrandBible] Watermark found: ${logos.watermark ? `${logos.watermark.name} -> ${logos.watermark.url}` : 'NONE'}`);

      const bible: BrandBible = {
        ...DEFAULT_BRAND_SETTINGS,
        logos,
        assets,
        promptContext: this.buildPromptContext(),
        negativePrompts: this.buildNegativePrompts(),
      };

      this.cachedBible = bible;
      this.cacheTimestamp = now;

      console.log('[BrandBible] Brand bible loaded successfully');
      console.log(`[BrandBible] Logos found: main=${!!logos.main}, watermark=${!!logos.watermark}, intro=${!!logos.intro}, outro=${!!logos.outro}`);

      return bible;

    } catch (error: any) {
      console.error('[BrandBible] Failed to load from database:', error.message);
      
      return {
        ...DEFAULT_BRAND_SETTINGS,
        logos: {},
        assets: [],
        promptContext: this.buildPromptContext(),
        negativePrompts: this.buildNegativePrompts(),
      };
    }
  }

  private findAssetByContext(
    assets: BrandAsset[],
    mediaType: string,
    contextKeywords: string[]
  ): BrandAsset | undefined {
    let matches = assets.filter(a => 
      a.mediaType === mediaType &&
      a.usageContexts.some(ctx => 
        contextKeywords.some(kw => ctx.toLowerCase().includes(kw.toLowerCase()))
      )
    );

    if (matches.length === 0) {
      matches = assets.filter(a =>
        a.mediaType === mediaType &&
        a.matchKeywords.some(kw =>
          contextKeywords.some(ctx => kw.toLowerCase().includes(ctx.toLowerCase()))
        )
      );
    }

    if (matches.length === 0) {
      matches = assets.filter(a => a.mediaType === mediaType && a.isDefault);
    }

    if (matches.length > 0) {
      matches.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      return matches[0];
    }

    return undefined;
  }

  /**
   * Flexible asset matching that accepts multiple mediaTypes and checks:
   * 1. usageContexts containing any context keyword
   * 2. matchKeywords containing any context keyword
   * 3. name/entityName containing any name keyword
   * 4. Falls back to isDefault
   */
  private findAssetByContextFlexible(
    assets: BrandAsset[],
    mediaTypes: string[],
    contextKeywords: string[],
    nameKeywords: string[]
  ): BrandAsset | undefined {
    // First: Match by usageContexts
    let matches = assets.filter(a => 
      mediaTypes.includes(a.mediaType) &&
      a.usageContexts.some(ctx => 
        contextKeywords.some(kw => ctx.toLowerCase().includes(kw.toLowerCase()))
      )
    );

    // Second: Match by matchKeywords
    if (matches.length === 0) {
      matches = assets.filter(a =>
        mediaTypes.includes(a.mediaType) &&
        a.matchKeywords.some(kw =>
          contextKeywords.some(ctx => kw.toLowerCase().includes(ctx.toLowerCase()))
        )
      );
    }

    // Third: Match by name/entityName containing name keywords
    if (matches.length === 0 && nameKeywords.length > 0) {
      matches = assets.filter(a =>
        mediaTypes.includes(a.mediaType) &&
        nameKeywords.some(nk => 
          a.name.toLowerCase().includes(nk.toLowerCase()) ||
          (a.entityName || '').toLowerCase().includes(nk.toLowerCase())
        )
      );
    }

    // Fourth: Fall back to isDefault
    if (matches.length === 0) {
      matches = assets.filter(a => mediaTypes.includes(a.mediaType) && a.isDefault);
    }

    if (matches.length > 0) {
      // Sort by priority (higher first)
      matches.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      return matches[0];
    }

    return undefined;
  }

  private buildPromptContext(): string {
    return `For ${DEFAULT_BRAND_SETTINGS.brandName}, a ${DEFAULT_BRAND_SETTINGS.industry} brand. ` +
           `Style: professional, warm, natural, wellness-focused, trustworthy. ` +
           `Aesthetic: soft natural lighting, earth tones, clean compositions, human connection.`;
  }

  private buildNegativePrompts(): string[] {
    return [
      'no text', 'no words', 'no letters', 'no writing', 'no captions',
      'no subtitles', 'no titles', 'no labels', 'no signs', 'no typography',
      
      'no user interface', 'no UI elements', 'no buttons', 'no menus',
      'no calendars', 'no charts', 'no graphs', 'no infographics',
      'no data visualizations', 'no spreadsheets', 'no tables', 'no icons', 'no emojis',
      
      'no watermarks', 'no logos', 'no brand marks', 'no stock photo watermarks',
      
      'no blur', 'no artifacts', 'no distortion', 'no low quality', 'no pixelation',
    ];
  }

  async getAssetsForKeywords(keywords: string[]): Promise<BrandAsset[]> {
    const bible = await this.getBrandBible();
    
    return bible.assets.filter(asset =>
      keywords.some(keyword =>
        asset.matchKeywords.some(mk => 
          mk.toLowerCase().includes(keyword.toLowerCase())
        ) ||
        asset.name.toLowerCase().includes(keyword.toLowerCase()) ||
        (asset.description || '').toLowerCase().includes(keyword.toLowerCase())
      ) &&
      !keywords.some(keyword =>
        asset.excludeKeywords.some(ek =>
          ek.toLowerCase().includes(keyword.toLowerCase())
        )
      )
    );
  }

  async getAssetsForContext(context: string): Promise<BrandAsset[]> {
    const bible = await this.getBrandBible();
    
    return bible.assets
      .filter(asset => 
        asset.usageContexts.some(ctx => 
          ctx.toLowerCase() === context.toLowerCase()
        )
      )
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  clearCache(): void {
    this.cachedBible = null;
    this.cacheTimestamp = 0;
    console.log('[BrandBible] Cache cleared');
  }

  async hasMinimumAssets(): Promise<boolean> {
    const bible = await this.getBrandBible();
    return bible.assets.length > 0 && (!!bible.logos.main || !!bible.logos.watermark);
  }
}

export const brandBibleService = new BrandBibleService();
