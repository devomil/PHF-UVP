import { db } from '../db';
import { brandMediaLibrary, BrandMedia, InsertBrandMedia } from '@shared/schema';
import { eq, and, ilike, sql, or } from 'drizzle-orm';

interface BrandAssetMatch {
  asset: BrandMedia;
  matchScore: number;
  matchedKeywords: string[];
  matchType: 'exact' | 'keyword' | 'entity' | 'context';
}

interface ResolvedBrandAssets {
  logo?: BrandMedia;
  photos: BrandMedia[];
  videos: BrandMedia[];
  graphics: BrandMedia[];
  watermark?: BrandMedia;
  hasMatch: boolean;
  matchedKeywords: string[];
}

export class BrandAssetService {
  private static instance: BrandAssetService;

  private constructor() {}

  static getInstance(): BrandAssetService {
    if (!BrandAssetService.instance) {
      BrandAssetService.instance = new BrandAssetService();
    }
    return BrandAssetService.instance;
  }

  private brandKeywords = [
    'pine hill farm',
    'pinehillfarm',
    'phf',
    'logo',
    'branding',
    'brand identity',
    'company logo',
    'our logo',
    'wellness center',
    'wellness facility',
    'healing center',
    'bioscan',
    'bio-scan',
    'bioresonance',
    'functional lab',
    'lab testing',
    'supplement line',
    'product line',
    'our products',
    'our facility',
    'our team',
    'our staff',
    'our equipment',
    'whole body healing',
    'holistic wellness',
    // Store locations
    'lake geneva',
    'watertown',
    'our store',
    'retail location',
    'store interior',
    'storefront',
  ];

  private negativeBrollKeywords = [
    'smoking',
    'cigarette',
    'alcohol',
    'beer',
    'wine',
    'violence',
    'weapon',
    'gun',
    'blood',
    'injury',
    'accident',
    'crash',
    'death',
    'funeral',
    'drugs',
    'needle',
    'syringe',
    'inappropriate',
    'suggestive',
    'provocative',
  ];

  async resolveAssetsFromVisualDirection(
    visualDirection: string,
    sceneType?: string
  ): Promise<ResolvedBrandAssets> {
    console.log('[BrandAssetService] Resolving assets for:', visualDirection.substring(0, 100));
    
    const result: ResolvedBrandAssets = {
      photos: [],
      videos: [],
      graphics: [],
      hasMatch: false,
      matchedKeywords: [],
    };

    if (!visualDirection) {
      return result;
    }

    const direction = visualDirection.toLowerCase();
    
    const matchedBrandKeywords = this.brandKeywords.filter(keyword => 
      direction.includes(keyword.toLowerCase())
    );

    if (matchedBrandKeywords.length === 0) {
      console.log('[BrandAssetService] No brand keywords detected in visual direction');
      return result;
    }

    console.log('[BrandAssetService] Matched brand keywords:', matchedBrandKeywords);
    result.matchedKeywords = matchedBrandKeywords;

    try {
      const allActiveAssets = await db.select()
        .from(brandMediaLibrary)
        .where(eq(brandMediaLibrary.isActive, true));

      if (allActiveAssets.length === 0) {
        console.log('[BrandAssetService] No active brand assets in database');
        return result;
      }

      console.log(`[BrandAssetService] Found ${allActiveAssets.length} active brand assets`);

      const scoredAssets: BrandAssetMatch[] = [];

      for (const asset of allActiveAssets) {
        let score = 0;
        const matchedKeywords: string[] = [];
        let matchType: BrandAssetMatch['matchType'] = 'context';

        if (asset.entityName && direction.includes(asset.entityName.toLowerCase())) {
          score += 50;
          matchedKeywords.push(asset.entityName);
          matchType = 'entity';
        }

        if (asset.matchKeywords && Array.isArray(asset.matchKeywords)) {
          for (const keyword of asset.matchKeywords) {
            if (direction.includes(keyword.toLowerCase())) {
              score += 30;
              matchedKeywords.push(keyword);
              if (matchType === 'context') matchType = 'keyword';
            }
          }
        }

        if (asset.usageContexts && Array.isArray(asset.usageContexts) && sceneType) {
          for (const context of asset.usageContexts) {
            if (context.toLowerCase().includes(sceneType.toLowerCase()) ||
                sceneType.toLowerCase().includes(context.toLowerCase())) {
              score += 20;
              matchedKeywords.push(`context:${context}`);
            }
          }
        }

        for (const brandKeyword of matchedBrandKeywords) {
          if (asset.name?.toLowerCase().includes(brandKeyword) ||
              asset.description?.toLowerCase()?.includes(brandKeyword)) {
            score += 15;
          }
        }

        if (direction.includes('logo') && asset.mediaType === 'logo') {
          score += 40;
          matchType = 'exact';
        }
        if (direction.includes('watermark') && asset.mediaType === 'watermark') {
          score += 40;
          matchType = 'exact';
        }

        if (asset.isDefault) {
          score += 10;
        }

        score += (asset.priority || 0) * 2;

        if (score > 0) {
          scoredAssets.push({
            asset,
            matchScore: score,
            matchedKeywords,
            matchType,
          });
        }
      }

      scoredAssets.sort((a, b) => b.matchScore - a.matchScore);

      for (const match of scoredAssets) {
        const asset = match.asset;
        
        switch (asset.mediaType) {
          case 'logo':
            if (!result.logo || match.matchScore > 0) {
              result.logo = asset;
              result.hasMatch = true;
            }
            break;
          case 'watermark':
            if (!result.watermark) {
              result.watermark = asset;
              result.hasMatch = true;
            }
            break;
          case 'photo':
            if (result.photos.length < 5) {
              result.photos.push(asset);
              result.hasMatch = true;
            }
            break;
          case 'video':
            if (result.videos.length < 3) {
              result.videos.push(asset);
              result.hasMatch = true;
            }
            break;
          case 'graphic':
          case 'lower_third':
          case 'overlay':
            if (result.graphics.length < 3) {
              result.graphics.push(asset);
              result.hasMatch = true;
            }
            break;
        }
      }

      console.log('[BrandAssetService] Resolved assets:', {
        hasLogo: !!result.logo,
        photoCount: result.photos.length,
        videoCount: result.videos.length,
        graphicCount: result.graphics.length,
        hasWatermark: !!result.watermark,
      });

    } catch (error: any) {
      console.error('[BrandAssetService] Error resolving assets:', error.message);
    }

    return result;
  }

  shouldUseBrandAssets(visualDirection: string): boolean {
    if (!visualDirection) return false;
    const direction = visualDirection.toLowerCase();
    return this.brandKeywords.some(keyword => direction.includes(keyword.toLowerCase()));
  }

  isBrollContentAppropriate(
    visualDirection: string,
    brollTags?: string,
    brollDescription?: string
  ): boolean {
    const content = `${brollTags || ''} ${brollDescription || ''}`.toLowerCase();
    
    for (const negative of this.negativeBrollKeywords) {
      if (content.includes(negative)) {
        console.log(`[BrandAssetService] Rejected B-roll: contains negative keyword "${negative}"`);
        return false;
      }
    }

    const direction = visualDirection.toLowerCase();
    
    if (direction.includes('scale') || direction.includes('weight')) {
      if (content.includes('smoking') || content.includes('cigarette') || 
          content.includes('nurse smoking') || content.includes('doctor smoking')) {
        console.log('[BrandAssetService] Rejected B-roll: smoking content for weight/scale scene');
        return false;
      }
    }

    if (direction.includes('frustrated') || direction.includes('struggle')) {
      const badPatterns = ['smoking', 'drinking', 'party', 'celebration'];
      for (const pattern of badPatterns) {
        if (content.includes(pattern)) {
          console.log(`[BrandAssetService] Rejected B-roll: ${pattern} for frustration scene`);
          return false;
        }
      }
    }

    return true;
  }

  extractBrollSearchTerms(visualDirection: string): {
    positiveTerms: string[];
    negativeTerms: string[];
    primaryConcept: string;
  } {
    const direction = visualDirection.toLowerCase();
    
    const positiveTerms: string[] = [];
    const negativeTerms = [...this.negativeBrollKeywords];
    
    const conceptPatterns = [
      { pattern: /frustrated\s+(person|woman|man)/i, terms: ['frustrated', 'stressed', 'worried'] },
      { pattern: /scale|weight|weighing/i, terms: ['weight loss', 'scale', 'fitness'] },
      { pattern: /happy|joy|smiling/i, terms: ['happy', 'joyful', 'smiling', 'positive'] },
      { pattern: /healthy|wellness/i, terms: ['wellness', 'healthy lifestyle', 'vitality'] },
      { pattern: /transform|before.*after/i, terms: ['transformation', 'progress', 'change'] },
      { pattern: /medical|doctor|clinic/i, terms: ['medical', 'healthcare', 'professional'] },
      { pattern: /natural|organic|herb/i, terms: ['natural', 'organic', 'botanical'] },
      { pattern: /energy|vibrant|active/i, terms: ['energetic', 'active', 'vitality'] },
      { pattern: /sleep|rest|relax/i, terms: ['relaxation', 'peaceful', 'calm'] },
      { pattern: /yoga|meditation/i, terms: ['yoga', 'meditation', 'mindfulness'] },
    ];

    let primaryConcept = 'wellness lifestyle';
    
    for (const { pattern, terms } of conceptPatterns) {
      if (pattern.test(direction)) {
        positiveTerms.push(...terms);
        primaryConcept = terms[0];
        break;
      }
    }

    const agePatterns = [
      { pattern: /40s|40-year|forty/i, term: 'middle-aged' },
      { pattern: /50s|50-year|fifty/i, term: 'mature' },
      { pattern: /60s|senior|elderly/i, term: 'senior' },
    ];
    
    for (const { pattern, term } of agePatterns) {
      if (pattern.test(direction)) {
        positiveTerms.push(term);
        break;
      }
    }

    if (/woman|female|her|she/i.test(direction)) {
      positiveTerms.push('woman');
      negativeTerms.push('man', 'male', 'boy', 'guy');
    } else if (/man|male|his|he\b/i.test(direction)) {
      positiveTerms.push('man');
      negativeTerms.push('woman', 'female', 'girl');
    }

    return {
      positiveTerms: Array.from(new Set(positiveTerms)),
      negativeTerms: Array.from(new Set(negativeTerms)),
      primaryConcept,
    };
  }

  async getDefaultLogo(): Promise<BrandMedia | null> {
    try {
      const logos = await db.select()
        .from(brandMediaLibrary)
        .where(and(
          eq(brandMediaLibrary.mediaType, 'logo'),
          eq(brandMediaLibrary.isActive, true),
          eq(brandMediaLibrary.isDefault, true)
        ))
        .limit(1);
      
      return logos[0] || null;
    } catch (error: any) {
      console.error('[BrandAssetService] Error getting default logo:', error.message);
      return null;
    }
  }

  async getDefaultWatermark(): Promise<BrandMedia | null> {
    try {
      const watermarks = await db.select()
        .from(brandMediaLibrary)
        .where(and(
          eq(brandMediaLibrary.mediaType, 'watermark'),
          eq(brandMediaLibrary.isActive, true),
          eq(brandMediaLibrary.isDefault, true)
        ))
        .limit(1);
      
      return watermarks[0] || null;
    } catch (error: any) {
      console.error('[BrandAssetService] Error getting default watermark:', error.message);
      return null;
    }
  }

  async getAllBrandAssets(): Promise<BrandMedia[]> {
    try {
      return await db.select()
        .from(brandMediaLibrary)
        .where(eq(brandMediaLibrary.isActive, true));
    } catch (error: any) {
      console.error('[BrandAssetService] Error getting all assets:', error.message);
      return [];
    }
  }

  async createBrandAsset(asset: InsertBrandMedia): Promise<BrandMedia | null> {
    try {
      const [created] = await db.insert(brandMediaLibrary)
        .values(asset)
        .returning();
      console.log('[BrandAssetService] Created brand asset:', created.name);
      return created;
    } catch (error: any) {
      console.error('[BrandAssetService] Error creating asset:', error.message);
      return null;
    }
  }

  async updateBrandAsset(id: number, updates: Partial<InsertBrandMedia>): Promise<BrandMedia | null> {
    try {
      const [updated] = await db.update(brandMediaLibrary)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(brandMediaLibrary.id, id))
        .returning();
      return updated;
    } catch (error: any) {
      console.error('[BrandAssetService] Error updating asset:', error.message);
      return null;
    }
  }

  async deleteBrandAsset(id: number): Promise<boolean> {
    try {
      await db.update(brandMediaLibrary)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(brandMediaLibrary.id, id));
      return true;
    } catch (error: any) {
      console.error('[BrandAssetService] Error deleting asset:', error.message);
      return false;
    }
  }
}

export const brandAssetService = BrandAssetService.getInstance();
