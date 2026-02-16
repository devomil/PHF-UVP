import type { BrandRequirementAnalysis, BrandDetectionPatterns } from '../../shared/types/brand-asset-types';

const BRAND_DETECTION_PATTERNS: BrandDetectionPatterns = {
  productKeywords: [
    'product', 'products', 'bottle', 'packaging', 'label',
    'supplement', 'extract', 'gummies', 'lotion', 'oil',
    'testing kit', 'test kit', 'materials', 'capsule', 'capsules',
    'tincture', 'cream', 'serum', 'spray', 'drops'
  ],
  
  productNames: [
    'black cohosh', 'deep sleep', 'wonder lotion', 'b-complex',
    'ultra omega', 'herbal ear oil', 'hemp extract',
    'lab test', 'dutch test', 'gut health test',
    'bioscan', 'bio-scan', 'vitamin d', 'vitamin c',
    'magnesium', 'zinc', 'probiotic', 'digestive enzyme',
    'adrenal support', 'thyroid support', 'hormone balance',
    'detox', 'cleanse', 'immune support'
  ],
  
  brandingKeywords: [
    'pine hill farm', 'phf', 'branding', 'branded',
    'logo', 'watermark', 'label visible', 'packaging visible',
    'brand visible', 'branding clearly', 'brand recognition',
    'our brand', 'our logo', 'company logo', 'brand identity',
    'wellness center', 'wellness facility', 'our facility'
  ],
  
  visibilityModifiers: {
    prominent: ['prominently', 'featured', 'hero', 'showcase', 'highlight', 'focus on', 'close-up', 'closeup', 'front and center'],
    visible: ['visible', 'showing', 'displaying', 'with', 'including', 'featuring'],
    subtle: ['subtle', 'background', 'secondary', 'hint of', 'barely visible', 'in the distance']
  },
  
  motionIndicators: {
    static: ['still', 'static', 'photograph', 'photo', 'image', 'picture'],
    subtle: ['subtle motion', 'slight movement', 'gentle', 'camera drift', 'slow pan', 'soft movement'],
    environmental: ['environmental motion', 'background movement', 'ambient', 'atmospheric', 'living scene'],
    reveal: ['zoom into', 'reveal', 'emerge', 'transition to', 'pull back', 'zoom out', 'dolly']
  }
};

class BrandRequirementAnalyzer {
  
  analyze(visualDirection: string, narration?: string): BrandRequirementAnalysis {
    const lower = visualDirection.toLowerCase();
    const combined = `${visualDirection} ${narration || ''}`.toLowerCase();
    
    const productAnalysis = this.analyzeProductRequirements(lower, combined);
    const brandingAnalysis = this.analyzeBrandingRequirements(lower);
    const sceneType = this.determineSceneType(productAnalysis, brandingAnalysis, lower);
    const outputAnalysis = this.analyzeOutputRequirements(lower);
    const confidence = this.calculateConfidence(productAnalysis, brandingAnalysis);
    
    return {
      requiresBrandAssets: confidence > 0.4,
      confidence,
      requirements: {
        ...productAnalysis,
        ...brandingAnalysis,
        sceneType,
        ...outputAnalysis,
      },
      matchedAssets: {
        products: [],
        logos: [],
        locations: [],
      },
    };
  }
  
  private analyzeProductRequirements(direction: string, combined: string) {
    const productNames: string[] = [];
    let productVisibility: 'featured' | 'prominent' | 'visible' | 'background' = 'visible';
    
    for (const product of BRAND_DETECTION_PATTERNS.productNames) {
      if (combined.includes(product)) {
        productNames.push(product);
      }
    }
    
    const hasProductKeyword = BRAND_DETECTION_PATTERNS.productKeywords.some(k => direction.includes(k));
    
    if (BRAND_DETECTION_PATTERNS.visibilityModifiers.prominent.some(m => direction.includes(m))) {
      productVisibility = 'featured';
    } else if (direction.includes('prominent')) {
      productVisibility = 'prominent';
    } else if (BRAND_DETECTION_PATTERNS.visibilityModifiers.subtle.some(m => direction.includes(m))) {
      productVisibility = 'background';
    }
    
    return {
      productMentioned: hasProductKeyword || productNames.length > 0,
      productNames,
      productVisibility,
    };
  }
  
  private analyzeBrandingRequirements(direction: string) {
    const hasBrandingKeyword = BRAND_DETECTION_PATTERNS.brandingKeywords.some(k => direction.includes(k));
    
    let logoType: 'primary' | 'watermark' | 'certification' | null = null;
    if (direction.includes('logo')) {
      logoType = 'primary';
    } else if (direction.includes('watermark')) {
      logoType = 'watermark';
    } else if (direction.includes('usda') || direction.includes('organic') || direction.includes('certification')) {
      logoType = 'certification';
    }
    
    let brandingVisibility: 'prominent' | 'visible' | 'subtle' = 'visible';
    if (direction.includes('prominently') || direction.includes('clearly visible')) {
      brandingVisibility = 'prominent';
    } else if (direction.includes('subtle') || direction.includes('hint')) {
      brandingVisibility = 'subtle';
    }
    
    return {
      logoRequired: hasBrandingKeyword || logoType !== null,
      logoType,
      brandingVisibility,
    };
  }
  
  private determineSceneType(
    productAnalysis: ReturnType<typeof this.analyzeProductRequirements>,
    brandingAnalysis: ReturnType<typeof this.analyzeBrandingRequirements>,
    direction: string
  ): 'product-hero' | 'product-in-context' | 'branded-environment' | 'standard' {
    
    if (productAnalysis.productVisibility === 'featured' || 
        direction.includes('close-up') || 
        direction.includes('closeup') ||
        direction.includes('hero shot')) {
      return 'product-hero';
    }
    
    if (productAnalysis.productMentioned && 
        (direction.includes('room') || direction.includes('desk') || 
         direction.includes('table') || direction.includes('shelf') ||
         direction.includes('counter') || direction.includes('display'))) {
      return 'product-in-context';
    }
    
    if (brandingAnalysis.logoRequired && !productAnalysis.productMentioned) {
      return 'branded-environment';
    }
    
    return 'standard';
  }
  
  private analyzeOutputRequirements(direction: string) {
    const isImageOnly = BRAND_DETECTION_PATTERNS.motionIndicators.static.some(k => direction.includes(k));
    
    let motionStyle: 'static' | 'subtle' | 'environmental' | 'reveal' | null = null;
    
    if (BRAND_DETECTION_PATTERNS.motionIndicators.reveal.some(k => direction.includes(k))) {
      motionStyle = 'reveal';
    } else if (BRAND_DETECTION_PATTERNS.motionIndicators.environmental.some(k => direction.includes(k))) {
      motionStyle = 'environmental';
    } else if (BRAND_DETECTION_PATTERNS.motionIndicators.subtle.some(k => direction.includes(k))) {
      motionStyle = 'subtle';
    } else {
      motionStyle = 'subtle';
    }
    
    return {
      outputType: isImageOnly ? 'image' as const : 'video' as const,
      motionStyle,
    };
  }
  
  private calculateConfidence(
    productAnalysis: ReturnType<typeof this.analyzeProductRequirements>,
    brandingAnalysis: ReturnType<typeof this.analyzeBrandingRequirements>
  ): number {
    let confidence = 0;
    
    if (productAnalysis.productNames.length > 0) confidence += 0.4;
    if (productAnalysis.productMentioned) confidence += 0.2;
    if (productAnalysis.productVisibility === 'featured') confidence += 0.2;
    
    if (brandingAnalysis.logoRequired) confidence += 0.5;
    if (brandingAnalysis.brandingVisibility === 'prominent') confidence += 0.2;
    
    return Math.min(confidence, 1);
  }
  
  getPatterns(): BrandDetectionPatterns {
    return BRAND_DETECTION_PATTERNS;
  }
}

export const brandRequirementAnalyzer = new BrandRequirementAnalyzer();
