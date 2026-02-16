import type { BrandMedia } from '../schema';

export interface BrandRequirementAnalysis {
  requiresBrandAssets: boolean;
  confidence: number;
  
  requirements: {
    productMentioned: boolean;
    productNames: string[];
    productVisibility: 'featured' | 'prominent' | 'visible' | 'background';
    
    logoRequired: boolean;
    logoType: 'primary' | 'watermark' | 'certification' | null;
    brandingVisibility: 'prominent' | 'visible' | 'subtle';
    
    sceneType: 'product-hero' | 'product-in-context' | 'branded-environment' | 'standard';
    
    outputType: 'image' | 'video';
    motionStyle: 'static' | 'subtle' | 'environmental' | 'reveal' | null;
  };
  
  matchedAssets: {
    products: BrandMedia[];
    logos: BrandMedia[];
    locations: BrandMedia[];
  };
}

export interface BrandDetectionPatterns {
  productKeywords: string[];
  productNames: string[];
  brandingKeywords: string[];
  visibilityModifiers: {
    prominent: string[];
    visible: string[];
    subtle: string[];
  };
  motionIndicators: {
    static: string[];
    subtle: string[];
    environmental: string[];
    reveal: string[];
  };
}

export interface AssetMatchResult {
  asset: BrandMedia;
  score: number;
  matchedKeywords: string[];
  matchType: 'exact' | 'keyword' | 'entity' | 'context';
}

export type AssetPurpose = 'product-hero' | 'logo-overlay' | 'watermark' | 'product-group' | 'location';
