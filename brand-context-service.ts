import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BrandContextData {
  brand: {
    name: string;
    legalName: string;
    tagline: string;
    website: string;
    founded: number;
    organicCertified: number;
    ownership: string;
    locations: Array<{
      name: string;
      city: string;
      state: string;
      type: string;
      opened?: number;
    }>;
  };
  identity: {
    story: string;
    mission: string;
    founders: string;
    philosophy: string;
  };
  values: Array<{
    value: string;
    description: string;
  }>;
  targetAudience: {
    primary: {
      description: string;
      demographics: string;
      psychographics: string;
    };
    conditions: string[];
    specialGroups: Array<{
      group: string;
      benefit: string;
    }>;
  };
  services: Array<{
    name: string;
    category: string;
    description: string;
  }>;
  products: {
    categories: Array<{
      name: string;
      description: string;
      count?: string;
      url?: string;
    }>;
    sourcing: string;
    quality: string;
  };
  terminology: {
    useTheseTerms: string[];
    avoidTheseTerms: string[];
    brandSpecificPhrases: string[];
  };
  partnerships: string[];
  contentGuidelines: {
    tone: string[];
    messaging: {
      emphasize: string[];
      deemphasize: string[];
    };
  };
  visualIdentity: {
    colors: Record<string, string>;
    aesthetic: string[];
    avoid: string[];
  };
  visualDirectionRules?: {
    explicitBrandingScenes: string[];
    noBrandingScenes: string[];
    aestheticDescriptors: {
      lighting: string[];
      settings: string[];
      textures: string[];
      colors: string[];
      subjects: string[];
    };
    forbiddenPhrases: string[];
    allowedBrandPhrases: string[];
  };
}

class BrandContextService {
  private brandData: BrandContextData | null = null;
  private loadedAt: number = 0;
  private visualGuidelines: string | null = null;

  async loadBrandContext(): Promise<BrandContextData> {
    if (this.brandData && Date.now() - this.loadedAt < 3600000) {
      return this.brandData;
    }

    console.log('[BrandContext] Loading Pine Hill Farm brand context...');

    try {
      const contextPath = path.join(__dirname, '../brand-context/pine-hill-farm.json');
      const rawData = fs.readFileSync(contextPath, 'utf-8');
      this.brandData = JSON.parse(rawData) as BrandContextData;
      this.loadedAt = Date.now();

      const serviceCount = this.brandData.services.length;
      const productCount = this.brandData.products.categories.length;
      const keywordCount = this.brandData.terminology.useTheseTerms.length;

      console.log(`[BrandContext] Loaded: ${serviceCount} services, ${productCount} product categories, ${keywordCount} keywords`);
      console.log('[BrandContext] Context ready for AI injection');

      return this.brandData;
    } catch (error: any) {
      console.error('[BrandContext] Failed to load brand context:', error.message);
      throw error;
    }
  }

  async getScriptParsingContext(): Promise<string> {
    const data = await this.loadBrandContext();

    return `
## Brand Context: ${data.brand.name}

**About:** ${data.identity.story}

**Mission:** ${data.identity.mission}

**Target Audience:** ${data.targetAudience.primary.description}
- Demographics: ${data.targetAudience.primary.demographics}
- Health concerns: ${data.targetAudience.conditions.join(', ')}

**Services Offered:**
${data.services.map(s => `- ${s.name}: ${s.description}`).join('\n')}

**Products:**
${data.products.categories.map(p => `- ${p.name}: ${p.description}`).join('\n')}

**Brand Terminology to Use:**
${data.terminology.useTheseTerms.join(', ')}

**Terms to Avoid:**
${data.terminology.avoidTheseTerms.join(', ')}

**Brand Phrases:**
${data.terminology.brandSpecificPhrases.map(p => `- "${p}"`).join('\n')}

**Content Tone:** ${data.contentGuidelines.tone.join(', ')}

**Emphasize:** ${data.contentGuidelines.messaging.emphasize.join(', ')}
`;
  }

  async getVisualAnalysisContext(): Promise<string> {
    const data = await this.loadBrandContext();

    return `
## Visual Guidelines: ${data.brand.name}

**Brand Aesthetic:**
${data.visualIdentity.aesthetic.map(a => `- ${a}`).join('\n')}

**Brand Colors:**
- Primary: ${data.visualIdentity.colors.primary} (${data.visualIdentity.colors.primaryName})
- Secondary: ${data.visualIdentity.colors.secondary} (${data.visualIdentity.colors.secondaryName})
- Accent: ${data.visualIdentity.colors.accent} (${data.visualIdentity.colors.accentName})

**Visual Elements to AVOID:**
${data.visualIdentity.avoid.map(a => `- ${a}`).join('\n')}

**Target Audience Visual Cues:**
- Primary: ${data.targetAudience.primary.demographics}
- Settings: Wellness spaces, natural environments, home settings
- People: Real, relatable, authentic expressions
- Mood: Warm, hopeful, empowering

**Brand Identity:**
- Family farm since 1853
- Women-owned (3 sisters)
- Organic, natural, holistic
- Farm-to-wellness concept
`;
  }

  /**
   * Load visual guidelines markdown file
   */
  async loadVisualGuidelines(): Promise<string> {
    if (this.visualGuidelines) {
      return this.visualGuidelines;
    }

    try {
      const guidelinesPath = path.join(__dirname, '../brand-context/visual-guidelines.md');
      this.visualGuidelines = fs.readFileSync(guidelinesPath, 'utf-8');
      console.log('[BrandContext] Visual guidelines loaded');
      return this.visualGuidelines;
    } catch (error: any) {
      console.error('[BrandContext] Failed to load visual guidelines:', error.message);
      return this.getCondensedVisualGuidelines();
    }
  }

  /**
   * Get condensed visual guidelines for prompts when full guidelines unavailable
   */
  private getCondensedVisualGuidelines(): string {
    return `
## Pine Hill Farm Visual Guidelines (Condensed)

LIGHTING: Warm, golden (NOT cold/clinical)
COLORS: Earth tones - greens, browns, warm golds (NOT blue/gray/sterile)
SETTINGS: Farm, garden, natural home, spa (NOT hospital/office/clinical)
PEOPLE: Real, authentic, women 35-65 (NOT stock-photo perfect)
TEXTURES: Natural wood, plants, organic (NOT plastic/chrome/synthetic)
MOOD: Warm, hopeful, inviting (NOT fear-based/corporate)

Score 85+ = On brand | 70-84 = Minor fixes | Below 70 = Regenerate
`;
  }

  /**
   * Get full visual analysis context for Claude Vision
   */
  async getVisualAnalysisContextFull(): Promise<string> {
    const guidelines = await this.loadVisualGuidelines();
    const brandData = await this.loadBrandContext();

    return `
# Brand Visual Analysis Context

You are evaluating visual content for ${brandData.brand.name}, a ${brandData.brand.tagline}.

${guidelines}

## Evaluation Instructions

1. Score each visual element (Lighting, Colors, Setting, Authenticity) out of 25 points
2. Calculate total Brand Alignment Score out of 100
3. Identify specific issues that don't match PHF aesthetic
4. Provide actionable recommendations for improvement
5. Determine if content should pass, be adjusted, or regenerated
`;
  }

  async getQualityEvaluationContext(): Promise<string> {
    const data = await this.loadBrandContext();

    return `
## Brand Compliance Criteria: ${data.brand.name}

**Visual Alignment Checklist:**
✓ Warm, natural lighting (not cold/clinical)
✓ Earth tones and organic colors
✓ Natural settings or warm interiors
✓ Real people with authentic expressions
✓ Organic textures (wood, plants, natural materials)

**Visual Red Flags:**
✗ Clinical/hospital environments
✗ Cold, blue or harsh lighting
✗ Sterile/corporate settings
✗ Overly polished/artificial appearances
✗ Plastic or synthetic textures
✗ Fear-based or negative imagery

**Brand Tone Compliance:**
- Should feel: Warm, welcoming, empowering, educational
- Should NOT feel: Clinical, corporate, salesy, fear-based

**Target Audience Resonance:**
- Primary: Women 35-65 seeking holistic health solutions
- Should see themselves in the content
- Aspirational but achievable

**${data.brand.name} Values to Reflect:**
${data.values.map(v => `- ${v.value}: ${v.description}`).join('\n')}
`;
  }

  async getPromptEnhancementContext(): Promise<string> {
    const data = await this.loadBrandContext();

    return `For ${data.brand.name}, a ${data.brand.tagline.toLowerCase()}. ` +
      `${data.identity.philosophy}. ` +
      `Visual style: ${data.visualIdentity.aesthetic.slice(0, 3).join(', ')}. ` +
      `Tone: ${data.contentGuidelines.tone.slice(0, 3).join(', ')}.`;
  }

  async getServiceKeywords(): Promise<Map<string, string[]>> {
    const data = await this.loadBrandContext();
    const keywords = new Map<string, string[]>();

    data.services.forEach(service => {
      const serviceKeywords = [
        service.name.toLowerCase(),
        ...service.description.toLowerCase().split(/\s+/).filter(w => w.length > 4),
      ];
      keywords.set(service.name, serviceKeywords);
    });

    keywords.set('conditions', data.targetAudience.conditions.map(c => c.toLowerCase()));

    data.products.categories.forEach(product => {
      keywords.set(product.name, [
        product.name.toLowerCase(),
        ...product.description.toLowerCase().split(/\s+/).filter(w => w.length > 4),
      ]);
    });

    return keywords;
  }

  async matchScriptToServices(scriptText: string): Promise<{
    services: string[];
    products: string[];
    conditions: string[];
  }> {
    const data = await this.loadBrandContext();
    const lowerScript = scriptText.toLowerCase();

    const matchedServices = data.services
      .filter(s => 
        lowerScript.includes(s.name.toLowerCase()) ||
        s.description.toLowerCase().split(/\s+/).some(word => 
          word.length > 5 && lowerScript.includes(word)
        )
      )
      .map(s => s.name);

    const matchedProducts = data.products.categories
      .filter(p => 
        lowerScript.includes(p.name.toLowerCase()) ||
        p.description.toLowerCase().split(/\s+/).some(word => 
          word.length > 5 && lowerScript.includes(word)
        )
      )
      .map(p => p.name);

    const matchedConditions = data.targetAudience.conditions
      .filter(c => {
        const conditionWords = c.toLowerCase().split(/[\s,()]+/);
        return conditionWords.some(word => word.length > 4 && lowerScript.includes(word));
      });

    return {
      services: matchedServices,
      products: matchedProducts,
      conditions: matchedConditions,
    };
  }

  async getBrandData(): Promise<BrandContextData> {
    return this.loadBrandContext();
  }

  async getBrandSummary(): Promise<string> {
    const data = await this.loadBrandContext();
    return `${data.brand.name} - ${data.brand.tagline}. ${data.identity.mission}`;
  }

  /**
   * Get aesthetic-only context for visual directions (no brand location forcing)
   * Use this for non-CTA scenes to apply PHF aesthetic without mentioning Pine Hill Farm
   */
  async getAestheticOnlyContext(): Promise<string> {
    const data = await this.loadBrandContext();
    const rules = data.visualDirectionRules;
    
    return `
VISUAL AESTHETIC GUIDELINES (Apply style, NOT location):

LIGHTING: ${rules?.aestheticDescriptors?.lighting?.join(', ') || 'warm golden light, soft natural light, golden hour lighting'}

SETTINGS: ${rules?.aestheticDescriptors?.settings?.join(', ') || 'sunlit home kitchen, cozy living room, peaceful garden, warm wellness space'}

TEXTURES: ${rules?.aestheticDescriptors?.textures?.join(', ') || 'natural wood surfaces, organic materials, fresh plants'}

COLORS: ${rules?.aestheticDescriptors?.colors?.join(', ') || 'earth tones, warm browns and greens, golden accents'}

SUBJECTS: ${rules?.aestheticDescriptors?.subjects?.join(', ') || 'authentic woman in her 40s, relatable person, real expression'}

CRITICAL RULE: Do NOT write "Pine Hill Farm [location]" in visual directions.
Write generic settings that MATCH the aesthetic instead.

FORBIDDEN PHRASES:
${rules?.forbiddenPhrases?.map(p => `- "${p}"`).join('\n') || '- "Pine Hill Farm kitchen"\n- "Pine Hill Farm consultation room"'}

WRONG: "Pine Hill Farm kitchen"
RIGHT: "Warm, sunlit home kitchen with natural wood counters"

Only mention "Pine Hill Farm" explicitly in CTA or product scenes.
`;
  }

  /**
   * Check if scene type should have explicit branding (can mention Pine Hill Farm)
   */
  shouldIncludeExplicitBranding(sceneType: string): boolean {
    const explicitBrandingScenes = ['cta', 'outro', 'product', 'testimonial'];
    return explicitBrandingScenes.includes(sceneType.toLowerCase());
  }

  /**
   * Get forbidden phrases that should never appear in visual directions
   */
  async getForbiddenPhrases(): Promise<string[]> {
    const data = await this.loadBrandContext();
    return data.visualDirectionRules?.forbiddenPhrases || [
      'Pine Hill Farm kitchen',
      'Pine Hill Farm living room',
      'Pine Hill Farm garden',
      'Pine Hill Farm consultation room',
      'Pine Hill Farm office',
      'at Pine Hill Farm'
    ];
  }

  clearCache(): void {
    this.brandData = null;
    this.loadedAt = 0;
    console.log('[BrandContext] Cache cleared');
  }

  /**
   * Get comprehensive context for "Ask Suzzie" visual direction generation
   * This creates more detailed, brand-aligned visual directions from the start
   */
  async getVisualDirectionGenerationContext(): Promise<string> {
    const data = await this.loadBrandContext();
    const rules = data.visualDirectionRules;

    return `# Pine Hill Farm Visual Direction Guidelines

## Brand Identity
${data.brand.name} is ${data.brand.tagline}. Founded ${data.brand.founded}, women-owned by 3 sisters.

## Visual Aesthetic (MUST FOLLOW)
**LIGHTING:** ${rules?.aestheticDescriptors?.lighting?.join(', ') || 'Warm, golden, natural, diffused sunlight, soft studio lighting, dappled light through leaves'}
**SETTINGS:** ${rules?.aestheticDescriptors?.settings?.join(', ') || 'Organic farms, herb gardens, wellness spaces, rustic kitchens, natural outdoor settings'}
**COLORS:** ${rules?.aestheticDescriptors?.colors?.join(', ') || 'Earth tones, forest greens, warm golds, cream, natural wood tones, sage'}
**TEXTURES:** ${rules?.aestheticDescriptors?.textures?.join(', ') || 'Natural wood, woven baskets, ceramic, linen, fresh produce, terracotta'}
**SUBJECTS:** ${rules?.aestheticDescriptors?.subjects?.join(', ') || 'Real women 35-65, farm scenes, organic produce, wellness activities, cooking, gardening'}

## CRITICAL: What to AVOID
${data.visualIdentity.avoid.map(a => `- ${a}`).join('\n')}
- Stock photo perfect people
- Cold, clinical lighting
- Blue/gray sterile environments
- Corporate office settings
- Fake or plastic appearance

## Scene Type Considerations
- **intro/hook**: Cinematic establishing shot, peaceful farm morning, golden hour
- **problem**: Subtle visual metaphor (NOT dark/scary), relatable everyday scene
- **solution**: Bright, hopeful transformation, organic ingredients, natural wellness
- **benefit**: Active lifestyle, garden scenes, healthy cooking, wellness practices
- **testimonial**: Authentic person in natural setting, genuine expressions
- **product**: Professional product photography, natural backgrounds, lifestyle context
- **cta**: Brand-aligned closing, inviting atmosphere, clear call to action

## Content Tone
${data.contentGuidelines.tone.join(', ')}

## Target Audience Resonance
${data.targetAudience.primary.description}
- Demographics: ${data.targetAudience.primary.demographics}
- Health concerns: ${data.targetAudience.conditions.slice(0, 5).join(', ')}

## Brand Phrases to Use
${data.terminology.brandSpecificPhrases.slice(0, 5).map(p => `- "${p}"`).join('\n')}

## DO NOT include these phrases in visual directions:
${rules?.forbiddenPhrases?.slice(0, 5)?.map(p => `- "${p}"`).join('\n') || '- "Pine Hill Farm kitchen"\n- "Pine Hill Farm garden"'}

Only reference "Pine Hill Farm" explicitly in CTA/outro scenes.`;
  }
}

export const brandContextService = new BrandContextService();
