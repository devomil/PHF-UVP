import { db } from '../db';
import { brandMediaLibrary, BrandMedia } from '@shared/schema';
import { eq, and, ilike, sql, or, inArray } from 'drizzle-orm';
import type { BrandRequirementAnalysis, AssetPurpose, AssetMatchResult } from '../../shared/types/brand-asset-types';
import { 
  PRODUCT_ASSET_TYPES, 
  LOGO_ASSET_TYPES, 
  LOCATION_ASSET_TYPES, 
  PEOPLE_ASSET_TYPES,
  TRUST_ASSET_TYPES,
  SERVICES_ASSET_TYPES,
  CREATIVE_ASSET_TYPES,
  AssetType,
  AssetCategory,
  getAssetTypeById,
  getAssetTypesByCategory,
  findMatchingAssetTypes,
  ASSET_CATEGORIES,
  BRAND_ASSET_TYPES,
} from '../../shared/brand-asset-types';

export interface AssetMatch {
  asset: BrandMedia;
  assetTypeDefinition: AssetType | null;
  matchScore: number;
  matchedKeywords: string[];
  matchReason: string;
}

export interface GroupedAssetMatches {
  category: string;
  categoryLabel: string;
  assets: AssetMatch[];
}

export interface VisualDirectionMatchResult {
  totalMatches: number;
  hasBrandAssets: boolean;
  hasLocationAsset: boolean;
  hasProductAsset: boolean;
  hasLogoAsset: boolean;
  groupedMatches: GroupedAssetMatches[];
  matches: AssetMatch[];
}

class BrandAssetMatcher {
  
  async matchAssets(analysis: BrandRequirementAnalysis): Promise<BrandRequirementAnalysis> {
    const matchedAssets = {
      products: [] as BrandMedia[],
      logos: [] as BrandMedia[],
      locations: [] as BrandMedia[],
    };
    
    try {
      if (analysis.requirements.productMentioned) {
        matchedAssets.products = await this.findProductAssets(
          analysis.requirements.productNames,
          analysis.requirements.productVisibility
        );
      }
      
      if (analysis.requirements.logoRequired) {
        matchedAssets.logos = await this.findLogoAssets(
          analysis.requirements.logoType,
          analysis.requirements.brandingVisibility
        );
      }
      
      if (analysis.requirements.sceneType === 'branded-environment') {
        matchedAssets.locations = await this.findLocationAssets();
      }
      
      console.log('[BrandAssetMatcher] Matched assets:', {
        products: matchedAssets.products.length,
        logos: matchedAssets.logos.length,
        locations: matchedAssets.locations.length,
      });
    } catch (error) {
      console.error('[BrandAssetMatcher] Error matching assets:', error);
    }
    
    return {
      ...analysis,
      matchedAssets,
    };
  }
  
  private async findProductAssets(
    productNames: string[],
    visibility: string
  ): Promise<BrandMedia[]> {
    const productAssetTypeIds = Object.keys(PRODUCT_ASSET_TYPES);
    
    const allProductAssets = await db.select()
      .from(brandMediaLibrary)
      .where(
        and(
          eq(brandMediaLibrary.isActive, true),
          or(
            inArray(brandMediaLibrary.assetType, productAssetTypeIds),
            eq(brandMediaLibrary.entityType, 'product'),
            ilike(brandMediaLibrary.mediaType, '%product%'),
            sql`'product' = ANY(${brandMediaLibrary.matchKeywords})`
          )
        )
      );
    
    const scored = allProductAssets.map(asset => {
      let score = 0;
      const assetText = `${asset.name || ''} ${asset.description || ''} ${(asset.matchKeywords || []).join(' ')} ${asset.entityName || ''}`.toLowerCase();
      
      if (asset.assetType && productAssetTypeIds.includes(asset.assetType)) {
        score += 20;
        
        const assetTypeDef = getAssetTypeById(asset.assetType);
        if (assetTypeDef) {
          if (visibility === 'featured' && asset.assetType.includes('hero')) {
            score += 15;
          }
          if (visibility === 'background' && asset.assetType.includes('lifestyle')) {
            score += 10;
          }
        }
      }
      
      for (const productName of productNames) {
        if (assetText.includes(productName.toLowerCase())) {
          score += 10;
        }
        
        const productInfo = asset.productInfo as { productName?: string; sku?: string } | null;
        if (productInfo?.productName?.toLowerCase().includes(productName.toLowerCase())) {
          score += 15;
        }
      }
      
      if (visibility === 'featured' && (asset.name?.toLowerCase().includes('hero') || asset.priority && asset.priority > 5)) {
        score += 5;
      }
      
      if (asset.mimeType?.includes('png')) {
        score += 2;
      }
      
      if (asset.priority) {
        score += asset.priority;
      }
      
      if (asset.isDefault) {
        score += 3;
      }
      
      const matchedKeywords = productNames.filter(name => assetText.includes(name.toLowerCase()));
      
      return { 
        asset, 
        score, 
        matchedKeywords,
        matchType: asset.assetType ? 'declared' as const : (score >= 10 ? 'exact' as const : 'keyword' as const)
      };
    });
    
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.asset);
  }
  
  private async findLogoAssets(
    logoType: 'primary' | 'watermark' | 'certification' | null,
    visibility: string
  ): Promise<BrandMedia[]> {
    const logoAssetTypeIds = Object.keys(LOGO_ASSET_TYPES);
    
    const logoAssets = await db.select()
      .from(brandMediaLibrary)
      .where(
        and(
          eq(brandMediaLibrary.isActive, true),
          or(
            inArray(brandMediaLibrary.assetType, logoAssetTypeIds),
            eq(brandMediaLibrary.mediaType, 'logo'),
            ilike(brandMediaLibrary.name, '%logo%'),
            sql`'logo' = ANY(${brandMediaLibrary.matchKeywords})`
          )
        )
      );
    
    const scored = logoAssets.map(asset => {
      let score = 0;
      const assetText = `${asset.name || ''} ${asset.description || ''} ${asset.entityName || ''}`.toLowerCase();
      
      if (asset.assetType && logoAssetTypeIds.includes(asset.assetType)) {
        score += 20;
        
        if (logoType === 'primary' && asset.assetType.includes('primary')) {
          score += 25;
        }
        if (logoType === 'watermark' && asset.assetType.includes('watermark')) {
          score += 25;
        }
        if (logoType === 'certification' && (
          asset.assetType.includes('certification') || 
          asset.assetType.includes('badge') ||
          asset.assetType.includes('trust')
        )) {
          score += 25;
        }
      }
      
      if (logoType === 'primary' && (assetText.includes('primary') || asset.isDefault)) score += 10;
      if (logoType === 'watermark' && assetText.includes('watermark')) score += 10;
      if (logoType === 'certification') {
        if (assetText.includes('usda') || assetText.includes('organic')) score += 10;
        if (assetText.includes('certification')) score += 5;
      }
      
      if (assetText.includes('pine hill farm') || assetText.includes('phf')) score += 5;
      
      if (asset.mimeType?.includes('png')) score += 3;
      
      if (visibility === 'prominent' && assetText.includes('large')) score += 2;
      
      if (asset.priority) score += asset.priority;
      if (asset.isDefault) score += 3;
      
      return { 
        asset, 
        score,
        matchType: asset.assetType ? 'declared' as const : 'keyword' as const
      };
    });
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.asset);
  }
  
  private async findLocationAssets(): Promise<BrandMedia[]> {
    const locationAssetTypeIds = Object.keys(LOCATION_ASSET_TYPES);
    
    return db.select()
      .from(brandMediaLibrary)
      .where(
        and(
          eq(brandMediaLibrary.isActive, true),
          or(
            inArray(brandMediaLibrary.assetType, locationAssetTypeIds),
            eq(brandMediaLibrary.entityType, 'location'),
            eq(brandMediaLibrary.mediaType, 'location'),
            sql`'store' = ANY(${brandMediaLibrary.matchKeywords})`,
            sql`'location' = ANY(${brandMediaLibrary.matchKeywords})`,
            sql`'facility' = ANY(${brandMediaLibrary.matchKeywords})`
          )
        )
      )
      .limit(3);
  }
  
  async findAssetsByType(assetTypeId: string): Promise<BrandMedia[]> {
    return db.select()
      .from(brandMediaLibrary)
      .where(
        and(
          eq(brandMediaLibrary.isActive, true),
          eq(brandMediaLibrary.assetType, assetTypeId)
        )
      )
      .orderBy(sql`priority DESC NULLS LAST`);
  }
  
  async findAssetsByCategory(category: string): Promise<BrandMedia[]> {
    const assetTypes = getAssetTypesByCategory(category);
    const assetTypeIds = assetTypes.map(t => t.id);
    
    if (assetTypeIds.length === 0) {
      return [];
    }
    
    return db.select()
      .from(brandMediaLibrary)
      .where(
        and(
          eq(brandMediaLibrary.isActive, true),
          inArray(brandMediaLibrary.assetType, assetTypeIds)
        )
      )
      .orderBy(sql`priority DESC NULLS LAST`);
  }
  
  async getBestAsset(
    purpose: AssetPurpose,
    productName?: string
  ): Promise<BrandMedia | null> {
    
    switch (purpose) {
      case 'product-hero':
        const heroAssets = await this.findAssetsByType('product-hero-single');
        if (heroAssets.length > 0) {
          if (productName) {
            const matching = heroAssets.find(a => {
              const productInfo = a.productInfo as { productName?: string } | null;
              return productInfo?.productName?.toLowerCase().includes(productName.toLowerCase()) ||
                     a.name?.toLowerCase().includes(productName.toLowerCase());
            });
            if (matching) return matching;
          }
          return heroAssets[0];
        }
        
        if (productName) {
          const products = await this.findProductAssets([productName], 'featured');
          return products[0] || null;
        }
        break;
        
      case 'logo-overlay':
        const primaryLogos = await this.findAssetsByType('logo-primary-color');
        if (primaryLogos.length > 0) return primaryLogos[0];
        
        const logos = await this.findLogoAssets('primary', 'prominent');
        return logos[0] || null;
        
      case 'watermark':
        const watermarkLogos = await this.findAssetsByType('logo-watermark-subtle');
        if (watermarkLogos.length > 0) return watermarkLogos[0];
        
        const watermarks = await this.findLogoAssets('watermark', 'subtle');
        return watermarks[0] || null;
        
      case 'product-group':
        const groupAssets = await this.findAssetsByType('product-hero-group');
        if (groupAssets.length > 0) return groupAssets[0];
        
        const legacyGroupAssets = await db.select()
          .from(brandMediaLibrary)
          .where(
            and(
              eq(brandMediaLibrary.isActive, true),
              or(
                ilike(brandMediaLibrary.name, '%group%'),
                ilike(brandMediaLibrary.name, '%products%'),
                ilike(brandMediaLibrary.description, '%collection%')
              )
            )
          )
          .limit(1);
        return legacyGroupAssets[0] || null;
        
      case 'location':
        const locationAssets = await this.findAssetsByCategory('location');
        if (locationAssets.length > 0) return locationAssets[0];
        
        const locations = await this.findLocationAssets();
        return locations[0] || null;
    }
    
    return null;
  }
  
  async searchByKeywords(keywords: string[]): Promise<AssetMatchResult[]> {
    const allAssets = await db.select()
      .from(brandMediaLibrary)
      .where(eq(brandMediaLibrary.isActive, true));
    
    const results: AssetMatchResult[] = [];
    
    for (const asset of allAssets) {
      const assetText = `${asset.name || ''} ${asset.description || ''} ${(asset.matchKeywords || []).join(' ')} ${asset.entityName || ''}`.toLowerCase();
      
      const matchedKeywords: string[] = [];
      
      keywords.forEach(kw => {
        if (assetText.includes(kw.toLowerCase())) {
          matchedKeywords.push(kw);
        }
      });
      
      if (asset.assetType) {
        const assetTypeDef = getAssetTypeById(asset.assetType);
        if (assetTypeDef) {
          keywords.forEach(kw => {
            if (assetTypeDef.promptKeywords.some(pk => pk.toLowerCase().includes(kw.toLowerCase()))) {
              if (!matchedKeywords.includes(kw)) {
                matchedKeywords.push(kw);
              }
            }
          });
        }
      }
      
      if (matchedKeywords.length > 0) {
        const declaredBonus = asset.assetType ? 15 : 0;
        results.push({
          asset,
          score: matchedKeywords.length * 10 + (asset.priority || 0) + declaredBonus,
          matchedKeywords,
          matchType: asset.assetType ? 'exact' : (matchedKeywords.length > 2 ? 'exact' : 'keyword'),
        });
      }
    }
    
    return results.sort((a, b) => b.score - a.score);
  }
  
  async getAssetTypeStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};
    
    const result = await db.select({
      assetType: brandMediaLibrary.assetType,
      count: sql<number>`COUNT(*)::int`
    })
    .from(brandMediaLibrary)
    .where(
      and(
        eq(brandMediaLibrary.isActive, true),
        sql`${brandMediaLibrary.assetType} IS NOT NULL`
      )
    )
    .groupBy(brandMediaLibrary.assetType);
    
    for (const row of result) {
      if (row.assetType) {
        stats[row.assetType] = row.count;
      }
    }
    
    return stats;
  }

  /**
   * Phase 15D: Taxonomy-based asset matching
   * Find brand assets that match a visual direction using promptKeywords from asset type definitions
   * Supports both classified and unclassified assets via direct keyword matching
   */
  async findMatchingBrandAssets(visualDirection: string): Promise<VisualDirectionMatchResult> {
    const trimmedDirection = (visualDirection || '').trim();
    if (!trimmedDirection || trimmedDirection.length < 3) {
      console.log('[AssetMatcher] Visual direction too short, returning empty result');
      return this.emptyMatchResult();
    }
    
    const lowerDirection = trimmedDirection.toLowerCase();
    
    // Step 1: Find which asset TYPES match the visual direction using taxonomy
    // This returns a prioritized, deterministic list ordered by match strength
    const matchingTypeIds = findMatchingAssetTypes(trimmedDirection);
    
    console.log(`[AssetMatcher] Visual direction: "${trimmedDirection.substring(0, 60)}..."`);
    console.log(`[AssetMatcher] Matching asset types from taxonomy: ${matchingTypeIds.slice(0, 5).join(', ')}`);
    
    // Step 2: Fetch assets - filter by matching types if any, otherwise fetch all
    let assetsToScore: BrandMedia[];
    
    if (matchingTypeIds.length > 0) {
      // Optimized: Fetch only assets that match taxonomy OR have no type assigned
      assetsToScore = await db.select()
        .from(brandMediaLibrary)
        .where(
          and(
            eq(brandMediaLibrary.isActive, true),
            or(
              inArray(brandMediaLibrary.assetType, matchingTypeIds),
              sql`${brandMediaLibrary.assetType} IS NULL`
            )
          )
        );
    } else {
      // Fallback: Fetch all active assets for keyword matching
      assetsToScore = await db.select()
        .from(brandMediaLibrary)
        .where(eq(brandMediaLibrary.isActive, true));
    }
    
    if (assetsToScore.length === 0) {
      console.log('[AssetMatcher] No assets to score in library');
      return this.emptyMatchResult();
    }
    
    // Step 3: Collect all promptKeywords from matching types for unclassified assets
    const allMatchingKeywords: string[] = [];
    for (const typeId of matchingTypeIds.slice(0, 20)) {
      const typeDef = getAssetTypeById(typeId);
      if (typeDef) {
        allMatchingKeywords.push(...typeDef.promptKeywords);
      }
    }
    
    // Step 4: Score each asset based on taxonomy matching
    const matches: AssetMatch[] = [];
    
    for (const asset of assetsToScore) {
      let score = 0;
      const matchedKeywords: string[] = [];
      let matchReason = '';
      
      // Case A: Asset has a declared assetType that matches taxonomy
      if (asset.assetType && matchingTypeIds.includes(asset.assetType)) {
        const typeDef = getAssetTypeById(asset.assetType);
        if (typeDef) {
          // Score based on promptKeywords that match the visual direction
          for (const keyword of typeDef.promptKeywords) {
            if (lowerDirection.includes(keyword.toLowerCase())) {
              score += keyword.length; // Longer keywords = more specific = higher score
              matchedKeywords.push(keyword);
            }
          }
          
          // Bonus for type position in match order (first match = highest priority)
          // Uses formula: max(0, 20 - index * 2) per Phase 15D spec
          const typeIndex = matchingTypeIds.indexOf(asset.assetType);
          if (typeIndex >= 0) {
            score += Math.max(0, 20 - typeIndex * 2);
          }
          
          // Base bonus for having a declared type that matches
          if (matchedKeywords.length > 0 || typeIndex < 5) {
            score += 25;
          }
          
          matchReason = `Taxonomy match: ${typeDef.label}`;
        }
      }
      // Case B: Asset has no type - use keyword matching from all matched types
      else if (!asset.assetType && allMatchingKeywords.length > 0) {
        const assetText = `${asset.name || ''} ${asset.description || ''} ${(asset.matchKeywords || []).join(' ')}`.toLowerCase();
        
        for (const keyword of allMatchingKeywords) {
          if (assetText.includes(keyword.toLowerCase()) || lowerDirection.includes(keyword.toLowerCase())) {
            if (!matchedKeywords.includes(keyword)) {
              score += keyword.length;
              matchedKeywords.push(keyword);
            }
          }
        }
        
        if (matchedKeywords.length > 0) {
          matchReason = `Keyword match (${matchedKeywords.length} keywords)`;
        }
      }
      
      // Additional scoring: Check asset name/description for direct matches
      
      // Check for direct asset name match in visual direction
      if (asset.name && lowerDirection.includes(asset.name.toLowerCase())) {
        score += 50;
        if (!matchedKeywords.includes(`name: ${asset.name}`)) {
          matchedKeywords.push(`name: ${asset.name}`);
        }
        matchReason = matchReason ? `${matchReason} + name match` : `Name match: ${asset.name}`;
      }
      
      // Check for entity name match (e.g., "Pine Hill Farm")
      if (asset.entityName && lowerDirection.includes(asset.entityName.toLowerCase())) {
        score += 40;
        if (!matchedKeywords.includes(`entity: ${asset.entityName}`)) {
          matchedKeywords.push(`entity: ${asset.entityName}`);
        }
        matchReason = matchReason ? `${matchReason} + entity match` : `Entity match: ${asset.entityName}`;
      }
      
      // Priority and default bonuses
      if (asset.priority) {
        score += asset.priority;
      }
      if (asset.isDefault) {
        score += 5;
      }
      
      // Only include assets with positive scores
      if (score > 0) {
        const typeDef = asset.assetType ? getAssetTypeById(asset.assetType) : null;
        matches.push({
          asset,
          assetTypeDefinition: typeDef,
          matchScore: score,
          matchedKeywords,
          matchReason: matchReason || 'Keyword match',
        });
      }
    }
    
    // Step 4: Sort by score descending
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    console.log(`[AssetMatcher] Found ${matches.length} matching assets`);
    matches.slice(0, 3).forEach(m => {
      console.log(`  - ${m.asset.name} (${m.asset.assetType || 'no type'}): score ${m.matchScore}, reason: ${m.matchReason}`);
    });
    
    // Step 5: Group by category
    const groupedMatches = this.groupMatchesByCategory(matches);
    
    // Step 6: Build result
    const hasLocationAsset = matches.some(m => m.assetTypeDefinition?.category === 'location');
    const hasProductAsset = matches.some(m => m.assetTypeDefinition?.category === 'products');
    const hasLogoAsset = matches.some(m => m.assetTypeDefinition?.category === 'logos');
    
    return {
      totalMatches: matches.length,
      hasBrandAssets: matches.length > 0,
      hasLocationAsset,
      hasProductAsset,
      hasLogoAsset,
      groupedMatches,
      matches,
    };
  }

  /**
   * Group matched assets by category for UI display
   */
  groupMatchesByCategory(matches: AssetMatch[]): GroupedAssetMatches[] {
    const groups: Record<string, AssetMatch[]> = {};
    
    for (const match of matches) {
      const category = match.assetTypeDefinition?.category || 'uncategorized';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(match);
    }
    
    // Convert to array with labels
    const result: GroupedAssetMatches[] = [];
    
    for (const categoryId of Object.keys(groups)) {
      const categoryMatches = groups[categoryId];
      const categoryDef = ASSET_CATEGORIES.find(c => c.id === categoryId);
      result.push({
        category: categoryId,
        categoryLabel: categoryDef?.label || categoryId,
        assets: categoryMatches,
      });
    }
    
    // Sort categories by total match score
    result.sort((a, b) => {
      const scoreA = a.assets.reduce((sum, m) => sum + m.matchScore, 0);
      const scoreB = b.assets.reduce((sum, m) => sum + m.matchScore, 0);
      return scoreB - scoreA;
    });
    
    return result;
  }

  private emptyMatchResult(): VisualDirectionMatchResult {
    return {
      totalMatches: 0,
      hasBrandAssets: false,
      hasLocationAsset: false,
      hasProductAsset: false,
      hasLogoAsset: false,
      groupedMatches: [],
      matches: [],
    };
  }
}

export const brandAssetMatcher = new BrandAssetMatcher();
