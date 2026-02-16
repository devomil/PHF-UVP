import Anthropic from '@anthropic-ai/sdk';
import { brandContextService } from './brand-context-service';
import { projectInstructionsService } from './project-instructions-service';
import type { Phase8AnalysisResult, Phase8AnalysisIssue } from '../../shared/video-types';
import { createLogger } from '../utils/logger';

const log = createLogger('SceneAnalysis');

// Re-export the shared type for backwards compatibility
export type { Phase8AnalysisResult, Phase8AnalysisIssue };

export interface SceneContext {
  sceneIndex: number;
  sceneType: string;
  narration: string;
  visualDirection: string;
  expectedContentType: string;
  totalScenes: number;
  selectedBrandAsset?: {
    name: string;
    type: 'product' | 'logo' | 'location' | 'photo';
    url?: string;
  };
  workflowPath?: string;
}

// Internal alias for the shared type
type AnalysisIssue = Phase8AnalysisIssue;

export interface FaceDetection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SafeZones {
  topLeft: boolean;
  topCenter: boolean;
  topRight: boolean;
  middleLeft: boolean;
  middleCenter: boolean;
  middleRight: boolean;
  bottomLeft: boolean;
  bottomCenter: boolean;
  bottomRight: boolean;
}

export interface SceneAnalysis {
  faces: {
    detected: boolean;
    count: number;
    positions: FaceDetection[];
  };
  
  composition: {
    focalPoint: { x: number; y: number };
    brightness: 'dark' | 'normal' | 'bright';
    dominantColors: string[];
  };
  
  safeZones: SafeZones;
  
  recommendations: {
    textPosition: {
      vertical: 'top' | 'center' | 'lower-third';
      horizontal: 'left' | 'center' | 'right';
    };
    textColor: string;
    needsTextShadow: boolean;
    needsTextBackground: boolean;
    productOverlayPosition: {
      x: 'left' | 'center' | 'right';
      y: 'top' | 'center' | 'bottom';
    };
    productOverlaySafe: boolean;
  };
  
  contentType: 'person' | 'product' | 'nature' | 'abstract' | 'mixed';
  mood: 'positive' | 'neutral' | 'serious' | 'dramatic';
}

export interface BrandAlignmentScore {
  lighting: {
    score: number;
    assessment: 'warm' | 'neutral' | 'cold';
    issue?: string;
  };
  colorPalette: {
    score: number;
    assessment: 'earth tones' | 'neutral' | 'cold tones';
    issue?: string;
  };
  setting: {
    score: number;
    assessment: 'natural' | 'neutral' | 'clinical';
    issue?: string;
  };
  authenticity: {
    score: number;
    assessment: 'authentic' | 'generic' | 'artificial';
    issue?: string;
  };
  totalScore: number;
  overallAssessment: 'on-brand' | 'needs-adjustment' | 'off-brand';
}

export interface BrandAwareSceneAnalysis extends SceneAnalysis {
  brandAlignment: BrandAlignmentScore;
  sceneTypeMatch: {
    appropriate: boolean;
    notes: string;
  };
  recommendation: 'pass' | 'adjust' | 'regenerate';
  suggestedImprovements: string[];
  overallScore: number;
}

class SceneAnalysisService {
  private anthropic: Anthropic | null = null;

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && !this.anthropic) {
      const keyPrefix = apiKey.substring(0, 15);
      const keyLength = apiKey.length;
      const hasWhitespace = /\s/.test(apiKey);
      log.debug(` Initializing Anthropic client`);
      log.debug(` API Key prefix: ${keyPrefix}...`);
      log.debug(` API Key length: ${keyLength} chars`);
      log.debug(` API Key has whitespace: ${hasWhitespace}`);
      
      const cleanedKey = apiKey.trim();
      this.anthropic = new Anthropic({
        apiKey: cleanedKey,
      });
    }
  }

  isAvailable(): boolean {
    // Re-check at runtime in case the secret was loaded after construction
    if (!this.anthropic && process.env.ANTHROPIC_API_KEY) {
      this.initializeClient();
    }
    const available = !!this.anthropic;
    log.debug(` isAvailable() = ${available}, ANTHROPIC_API_KEY present: ${!!process.env.ANTHROPIC_API_KEY}`);
    return available;
  }

  async analyzeScene(
    imageUrl: string,
    context: {
      sceneType: string;
      narration: string;
      hasTextOverlays: boolean;
      hasProductOverlay: boolean;
    }
  ): Promise<SceneAnalysis> {
    log.debug(` Analyzing scene: ${context.sceneType}`);
    
    if (!this.anthropic) {
      log.warn(` Anthropic not configured, using defaults`);
      return this.getDefaultAnalysis();
    }

    try {
      const imageData = await this.fetchAndEncodeImage(imageUrl);
      
      if (!imageData) {
        log.warn(` Could not fetch image, using defaults`);
        return this.getDefaultAnalysis();
      }

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imageData.mediaType,
                  data: imageData.base64,
                },
              },
              {
                type: 'text',
                text: this.buildAnalysisPrompt(context),
              },
            ],
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const analysis = this.parseAnalysisResponse(content.text);
      
      log.debug(` Complete:`, {
        faces: analysis.faces.count,
        focalPoint: analysis.composition.focalPoint,
        recommendedTextPos: analysis.recommendations.textPosition,
        contentType: analysis.contentType,
      });

      return analysis;

    } catch (error: any) {
      log.error(` Failed:`, error.message);
      return this.getDefaultAnalysis();
    }
  }

  async analyzeScenes(
    scenes: Array<{
      id: string;
      imageUrl: string;
      sceneType: string;
      narration: string;
      hasTextOverlays: boolean;
      hasProductOverlay: boolean;
    }>
  ): Promise<Map<string, SceneAnalysis>> {
    const results = new Map<string, SceneAnalysis>();
    
    log.debug(` Analyzing ${scenes.length} scenes...`);
    
    for (const scene of scenes) {
      const analysis = await this.analyzeScene(scene.imageUrl, {
        sceneType: scene.sceneType,
        narration: scene.narration,
        hasTextOverlays: scene.hasTextOverlays,
        hasProductOverlay: scene.hasProductOverlay,
      });
      
      results.set(scene.id, analysis);
      
      await this.sleep(500);
    }
    
    return results;
  }

  /**
   * Brand-aware scene analysis with Pine Hill Farm aesthetic scoring
   */
  async analyzeSceneWithBrandContext(
    imageUrl: string,
    context: {
      sceneType: string;
      narration: string;
      sceneIndex: number;
      expectedContentType: string;
    }
  ): Promise<BrandAwareSceneAnalysis> {
    log.debug(` Analyzing scene ${context.sceneIndex + 1} with brand context...`);
    
    if (!this.anthropic) {
      log.warn(` Anthropic not configured, using defaults`);
      return this.getDefaultBrandAwareAnalysis();
    }

    try {
      const imageData = await this.fetchAndEncodeImage(imageUrl);
      
      if (!imageData) {
        log.warn(` Could not fetch image, using defaults`);
        return this.getDefaultBrandAwareAnalysis();
      }

      const visualContext = await brandContextService.getVisualAnalysisContextFull();
      const roleContext = await projectInstructionsService.getCondensedRoleContext();

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imageData.mediaType,
                  data: imageData.base64,
                },
              },
              {
                type: 'text',
                text: this.buildBrandAwareAnalysisPrompt(context, visualContext, roleContext),
              },
            ],
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const analysis = this.parseBrandAwareAnalysisResponse(content.text);
      
      log.debug(` Brand alignment: ${analysis.brandAlignment.totalScore}/100 - ${analysis.brandAlignment.overallAssessment}`);
      
      if (analysis.brandAlignment.totalScore < 70) {
        log.debug(` Brand issues:`);
        if (analysis.brandAlignment.lighting.score < 20) {
          log.debug(`  - Lighting: ${analysis.brandAlignment.lighting.issue}`);
        }
        if (analysis.brandAlignment.colorPalette.score < 20) {
          log.debug(`  - Colors: ${analysis.brandAlignment.colorPalette.issue}`);
        }
        if (analysis.brandAlignment.setting.score < 20) {
          log.debug(`  - Setting: ${analysis.brandAlignment.setting.issue}`);
        }
        if (analysis.brandAlignment.authenticity.score < 20) {
          log.debug(`  - Feel: ${analysis.brandAlignment.authenticity.issue}`);
        }
      }

      return analysis;

    } catch (error: any) {
      log.error(` Brand-aware analysis failed:`, error.message);
      return this.getDefaultBrandAwareAnalysis();
    }
  }

  private buildBrandAwareAnalysisPrompt(
    context: {
      sceneType: string;
      narration: string;
      sceneIndex: number;
      expectedContentType: string;
    },
    visualContext: string,
    roleContext: string
  ): string {
    return `${roleContext}

Analyze this video frame for Pine Hill Farm brand alignment.

${visualContext}

SCENE CONTEXT:
- Scene Type: ${context.sceneType}
- Scene Number: ${context.sceneIndex + 1}
- Expected Content: ${context.expectedContentType}
- Narration: "${context.narration.substring(0, 200)}..."

ANALYSIS REQUIRED:

1. **Technical Quality**
   - Resolution and sharpness
   - Exposure and contrast
   - Focus accuracy

2. **Composition**
   - Framing and rule of thirds
   - Subject placement
   - Visual balance

3. **Brand Aesthetic Alignment** (CRITICAL)
   Score each element 0-25:
   
   a) LIGHTING (0-25):
      - Is it warm and golden? Or cold and clinical?
      - Natural or artificial feeling?
   
   b) COLOR PALETTE (0-25):
      - Earth tones (green, brown, gold)? Or cold blues/grays?
      - Brand color alignment?
   
   c) SETTING/ENVIRONMENT (0-25):
      - Natural, farm, home, wellness? Or clinical, corporate?
      - Organic textures present?
   
   d) AUTHENTICITY/FEEL (0-25):
      - Real and warm? Or stock-photo/corporate?
      - Would target audience (women 35-65) connect?

4. **Scene Type Appropriateness**
   - Does this visual match a "${context.sceneType}" scene?
   - Does it support the narration?

5. **Face Detection & Composition** (for overlay positioning)
   - Detect any faces and their positions
   - Identify safe zones for text/product overlays

Return JSON:
{
  "faces": {
    "detected": true/false,
    "count": number,
    "positions": [{"x": 0-100, "y": 0-100, "width": 0-100, "height": 0-100}]
  },
  "composition": {
    "focalPoint": {"x": 0-100, "y": 0-100},
    "brightness": "dark" | "normal" | "bright",
    "dominantColors": ["#hex1", "#hex2", "#hex3"]
  },
  "safeZones": {
    "topLeft": true/false,
    "topCenter": true/false,
    "topRight": true/false,
    "middleLeft": true/false,
    "middleCenter": true/false,
    "middleRight": true/false,
    "bottomLeft": true/false,
    "bottomCenter": true/false,
    "bottomRight": true/false
  },
  "recommendations": {
    "textPosition": {
      "vertical": "top" | "center" | "lower-third",
      "horizontal": "left" | "center" | "right"
    },
    "textColor": "#ffffff" or "#000000",
    "needsTextShadow": true/false,
    "needsTextBackground": true/false,
    "productOverlayPosition": {
      "x": "left" | "center" | "right",
      "y": "top" | "center" | "bottom"
    },
    "productOverlaySafe": true/false
  },
  "contentType": "person" | "product" | "nature" | "abstract" | "mixed",
  "mood": "positive" | "neutral" | "serious" | "dramatic",
  "brandAlignment": {
    "lighting": {
      "score": 0-25,
      "assessment": "warm" | "neutral" | "cold",
      "issue": "description if score < 20"
    },
    "colorPalette": {
      "score": 0-25,
      "assessment": "earth tones" | "neutral" | "cold tones",
      "issue": "description if score < 20"
    },
    "setting": {
      "score": 0-25,
      "assessment": "natural" | "neutral" | "clinical",
      "issue": "description if score < 20"
    },
    "authenticity": {
      "score": 0-25,
      "assessment": "authentic" | "generic" | "artificial",
      "issue": "description if score < 20"
    },
    "totalScore": 0-100,
    "overallAssessment": "on-brand" | "needs-adjustment" | "off-brand"
  },
  "sceneTypeMatch": {
    "appropriate": true/false,
    "notes": ""
  },
  "recommendation": "pass" | "adjust" | "regenerate",
  "suggestedImprovements": [
    "specific actionable improvement"
  ]
}

IMPORTANT RULES:
- Be strict on brand alignment - Pine Hill Farm has a specific warm, natural aesthetic
- Score 85+ = pass, 70-84 = adjust recommended, below 70 = regenerate
- Provide specific, actionable improvement suggestions
- Lower-third is usually safest for text if faces are present`;
  }

  private parseBrandAwareAnalysisResponse(text: string): BrandAwareSceneAnalysis {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      const brandAlignment: BrandAlignmentScore = {
        lighting: {
          score: parsed.brandAlignment?.lighting?.score || 15,
          assessment: parsed.brandAlignment?.lighting?.assessment || 'neutral',
          issue: parsed.brandAlignment?.lighting?.issue,
        },
        colorPalette: {
          score: parsed.brandAlignment?.colorPalette?.score || 15,
          assessment: parsed.brandAlignment?.colorPalette?.assessment || 'neutral',
          issue: parsed.brandAlignment?.colorPalette?.issue,
        },
        setting: {
          score: parsed.brandAlignment?.setting?.score || 15,
          assessment: parsed.brandAlignment?.setting?.assessment || 'neutral',
          issue: parsed.brandAlignment?.setting?.issue,
        },
        authenticity: {
          score: parsed.brandAlignment?.authenticity?.score || 15,
          assessment: parsed.brandAlignment?.authenticity?.assessment || 'generic',
          issue: parsed.brandAlignment?.authenticity?.issue,
        },
        totalScore: parsed.brandAlignment?.totalScore || 60,
        overallAssessment: parsed.brandAlignment?.overallAssessment || 'needs-adjustment',
      };

      const overallScore = this.calculateOverallScore(parsed, brandAlignment);

      const computedRecommendation = this.computeRecommendation(brandAlignment.totalScore);
      const modelRecommendation = parsed.recommendation;
      
      if (modelRecommendation && modelRecommendation !== computedRecommendation) {
        log.debug(` Overriding model recommendation "${modelRecommendation}" with computed "${computedRecommendation}" based on brand score ${brandAlignment.totalScore}`);
      }

      return {
        faces: {
          detected: parsed.faces?.detected || false,
          count: parsed.faces?.count || 0,
          positions: parsed.faces?.positions || [],
        },
        composition: {
          focalPoint: parsed.composition?.focalPoint || { x: 50, y: 50 },
          brightness: parsed.composition?.brightness || 'normal',
          dominantColors: parsed.composition?.dominantColors || ['#808080'],
        },
        safeZones: {
          topLeft: parsed.safeZones?.topLeft ?? true,
          topCenter: parsed.safeZones?.topCenter ?? true,
          topRight: parsed.safeZones?.topRight ?? true,
          middleLeft: parsed.safeZones?.middleLeft ?? true,
          middleCenter: parsed.safeZones?.middleCenter ?? false,
          middleRight: parsed.safeZones?.middleRight ?? true,
          bottomLeft: parsed.safeZones?.bottomLeft ?? true,
          bottomCenter: parsed.safeZones?.bottomCenter ?? true,
          bottomRight: parsed.safeZones?.bottomRight ?? true,
        },
        recommendations: {
          textPosition: {
            vertical: parsed.recommendations?.textPosition?.vertical || 'lower-third',
            horizontal: parsed.recommendations?.textPosition?.horizontal || 'center',
          },
          textColor: parsed.recommendations?.textColor || '#FFFFFF',
          needsTextShadow: parsed.recommendations?.needsTextShadow ?? true,
          needsTextBackground: parsed.recommendations?.needsTextBackground ?? false,
          productOverlayPosition: {
            x: parsed.recommendations?.productOverlayPosition?.x || 'right',
            y: parsed.recommendations?.productOverlayPosition?.y || 'bottom',
          },
          productOverlaySafe: parsed.recommendations?.productOverlaySafe ?? true,
        },
        contentType: parsed.contentType || 'mixed',
        mood: parsed.mood || 'neutral',
        brandAlignment,
        sceneTypeMatch: {
          appropriate: parsed.sceneTypeMatch?.appropriate ?? true,
          notes: parsed.sceneTypeMatch?.notes || '',
        },
        recommendation: computedRecommendation,
        suggestedImprovements: parsed.suggestedImprovements || [],
        overallScore,
      };

    } catch (error: any) {
      log.error(` Parse error:`, error.message);
      return this.getDefaultBrandAwareAnalysis();
    }
  }

  private calculateOverallScore(parsed: any, brandAlignment: BrandAlignmentScore): number {
    const technicalWeight = 0.25;
    const compositionWeight = 0.25;
    const brandWeight = 0.50;

    const technicalScore = 80;
    const compositionScore = parsed.composition?.focalPoint ? 80 : 70;
    const brandScore = brandAlignment.totalScore;

    return Math.round(
      technicalScore * technicalWeight +
      compositionScore * compositionWeight +
      brandScore * brandWeight
    );
  }

  private computeRecommendation(brandScore: number): 'pass' | 'adjust' | 'regenerate' {
    if (brandScore >= 85) {
      return 'pass';
    } else if (brandScore >= 70) {
      return 'adjust';
    } else {
      return 'regenerate';
    }
  }

  private getDefaultBrandAwareAnalysis(): BrandAwareSceneAnalysis {
    const defaultBase = this.getDefaultAnalysis();
    return {
      ...defaultBase,
      brandAlignment: {
        lighting: { score: 20, assessment: 'warm' },
        colorPalette: { score: 20, assessment: 'earth tones' },
        setting: { score: 20, assessment: 'natural' },
        authenticity: { score: 20, assessment: 'authentic' },
        totalScore: 80,
        overallAssessment: 'needs-adjustment',
      },
      sceneTypeMatch: {
        appropriate: true,
        notes: 'Default analysis - no brand evaluation performed',
      },
      recommendation: 'adjust',
      suggestedImprovements: ['Manual review recommended - automated analysis unavailable'],
      overallScore: 80,
    };
  }

  async fetchAndEncodeImage(
    imageUrl: string
  ): Promise<{ base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' } | null> {
    try {
      if (imageUrl.includes('.mp4') || imageUrl.includes('.webm') || imageUrl.includes('video')) {
        log.debug(` Video URL detected, attempting frame extraction...`);
        
        const { videoFrameExtractor } = await import('./video-frame-extractor');
        const frameData = await videoFrameExtractor.extractFrameAsBase64(imageUrl, 2);
        
        if (frameData) {
          return frameData;
        }
        
        log.warn(` Frame extraction failed, skipping analysis`);
        return null;
      }

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const base64 = buffer.toString('base64');
      
      let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg';
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('png')) mediaType = 'image/png';
      else if (contentType?.includes('webp')) mediaType = 'image/webp';
      else if (contentType?.includes('gif')) mediaType = 'image/gif';
      else if (imageUrl.includes('.png')) mediaType = 'image/png';
      else if (imageUrl.includes('.webp')) mediaType = 'image/webp';

      return { base64, mediaType };

    } catch (error: any) {
      log.error(` Image fetch failed:`, error.message);
      return null;
    }
  }

  private buildAnalysisPrompt(context: {
    sceneType: string;
    narration: string;
    hasTextOverlays: boolean;
    hasProductOverlay: boolean;
  }): string {
    return `Analyze this image for professional video composition.

CONTEXT:
- Scene type: ${context.sceneType}
- Has text overlays: ${context.hasTextOverlays}
- Has product overlay: ${context.hasProductOverlay}
- Narration: "${context.narration.substring(0, 150)}..."

Respond with a JSON object in this EXACT format:
{
  "faces": {
    "detected": true/false,
    "count": number,
    "positions": [
      {"x": 0-100, "y": 0-100, "width": 0-100, "height": 0-100}
    ]
  },
  "composition": {
    "focalPoint": {"x": 0-100, "y": 0-100},
    "brightness": "dark" | "normal" | "bright",
    "dominantColors": ["#hex1", "#hex2", "#hex3"]
  },
  "safeZones": {
    "topLeft": true/false,
    "topCenter": true/false,
    "topRight": true/false,
    "middleLeft": true/false,
    "middleCenter": true/false,
    "middleRight": true/false,
    "bottomLeft": true/false,
    "bottomCenter": true/false,
    "bottomRight": true/false
  },
  "recommendations": {
    "textPosition": {
      "vertical": "top" | "center" | "lower-third",
      "horizontal": "left" | "center" | "right"
    },
    "textColor": "#ffffff" or "#000000",
    "needsTextShadow": true/false,
    "needsTextBackground": true/false,
    "productOverlayPosition": {
      "x": "left" | "center" | "right",
      "y": "top" | "center" | "bottom"
    },
    "productOverlaySafe": true/false
  },
  "contentType": "person" | "product" | "nature" | "abstract" | "mixed",
  "mood": "positive" | "neutral" | "serious" | "dramatic"
}

RULES:
1. A zone is NOT safe if a face or important subject occupies it
2. Text should NEVER overlap faces
3. Product overlays should not block faces or focal points
4. Use white text (#ffffff) on dark backgrounds, black (#000000) on light
5. Add text shadow if background has mixed brightness
6. Lower-third is usually safest for text if faces are present
7. Positions are percentages (0=left/top, 100=right/bottom)

Return ONLY the JSON object.`;
  }

  private parseAnalysisResponse(text: string): SceneAnalysis {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        faces: {
          detected: parsed.faces?.detected || false,
          count: parsed.faces?.count || 0,
          positions: parsed.faces?.positions || [],
        },
        composition: {
          focalPoint: parsed.composition?.focalPoint || { x: 50, y: 50 },
          brightness: parsed.composition?.brightness || 'normal',
          dominantColors: parsed.composition?.dominantColors || ['#808080'],
        },
        safeZones: {
          topLeft: parsed.safeZones?.topLeft ?? true,
          topCenter: parsed.safeZones?.topCenter ?? true,
          topRight: parsed.safeZones?.topRight ?? true,
          middleLeft: parsed.safeZones?.middleLeft ?? true,
          middleCenter: parsed.safeZones?.middleCenter ?? false,
          middleRight: parsed.safeZones?.middleRight ?? true,
          bottomLeft: parsed.safeZones?.bottomLeft ?? true,
          bottomCenter: parsed.safeZones?.bottomCenter ?? true,
          bottomRight: parsed.safeZones?.bottomRight ?? true,
        },
        recommendations: {
          textPosition: {
            vertical: parsed.recommendations?.textPosition?.vertical || 'lower-third',
            horizontal: parsed.recommendations?.textPosition?.horizontal || 'center',
          },
          textColor: parsed.recommendations?.textColor || '#FFFFFF',
          needsTextShadow: parsed.recommendations?.needsTextShadow ?? true,
          needsTextBackground: parsed.recommendations?.needsTextBackground ?? false,
          productOverlayPosition: {
            x: parsed.recommendations?.productOverlayPosition?.x || 'right',
            y: parsed.recommendations?.productOverlayPosition?.y || 'bottom',
          },
          productOverlaySafe: parsed.recommendations?.productOverlaySafe ?? true,
        },
        contentType: parsed.contentType || 'mixed',
        mood: parsed.mood || 'neutral',
      };

    } catch (error: any) {
      log.error(` Parse error:`, error.message);
      return this.getDefaultAnalysis();
    }
  }

  getDefaultAnalysis(): SceneAnalysis {
    return {
      faces: {
        detected: false,
        count: 0,
        positions: [],
      },
      composition: {
        focalPoint: { x: 50, y: 50 },
        brightness: 'normal',
        dominantColors: ['#2D5A27', '#F5F5DC'],
      },
      safeZones: {
        topLeft: true,
        topCenter: true,
        topRight: true,
        middleLeft: true,
        middleCenter: false,
        middleRight: true,
        bottomLeft: true,
        bottomCenter: true,
        bottomRight: true,
      },
      recommendations: {
        textPosition: {
          vertical: 'lower-third',
          horizontal: 'center',
        },
        textColor: '#FFFFFF',
        needsTextShadow: true,
        needsTextBackground: false,
        productOverlayPosition: {
          x: 'right',
          y: 'bottom',
        },
        productOverlaySafe: true,
      },
      contentType: 'mixed',
      mood: 'positive',
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Detect media type from base64 encoded image data by checking magic bytes
   * Handles both raw base64 and data URI format (data:image/png;base64,...)
   * Case-insensitive matching for MIME types and handles optional parameters
   */
  private detectMediaTypeFromBase64(base64Data: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
    // First, check if this is a data URI and extract both the declared type and raw base64
    // Pattern handles: data:image/png;base64,xxx OR data:image/PNG;charset=utf-8;base64,xxx
    const dataUriMatch = base64Data.match(/^data:(image\/[a-zA-Z]+)[^,]*;base64,(.+)$/i);
    let rawBase64 = base64Data;
    let declaredType: string | null = null;
    
    if (dataUriMatch) {
      declaredType = dataUriMatch[1].toLowerCase();
      rawBase64 = dataUriMatch[2];
      log.debug(` Data URI detected, declared type: ${declaredType}`);
    }
    
    // Check the first few characters of base64 which represent the magic bytes
    // Base64 encoding is case-sensitive, so these magic bytes are always the same
    // PNG starts with iVBORw0KGgo (base64 of 89 50 4E 47 0D 0A 1A 0A)
    if (rawBase64.startsWith('iVBORw0KGgo') || rawBase64.startsWith('iVBORw0K')) {
      log.debug('[SceneAnalysis] Detected PNG from magic bytes');
      return 'image/png';
    }
    // JPEG starts with /9j/ (base64 of FF D8 FF)
    if (rawBase64.startsWith('/9j/')) {
      log.debug('[SceneAnalysis] Detected JPEG from magic bytes');
      return 'image/jpeg';
    }
    // WebP starts with UklGR (base64 of RIFF header)
    if (rawBase64.startsWith('UklGR')) {
      log.debug('[SceneAnalysis] Detected WebP from magic bytes');
      return 'image/webp';
    }
    // GIF starts with R0lGOD (base64 of GIF89a or GIF87a)
    if (rawBase64.startsWith('R0lGOD')) {
      log.debug('[SceneAnalysis] Detected GIF from magic bytes');
      return 'image/gif';
    }
    
    // If magic bytes don't match but we have a declared type from data URI, use that
    // Normalize jpg -> jpeg for consistency
    if (declaredType) {
      const normalizedType = declaredType === 'image/jpg' ? 'image/jpeg' : declaredType;
      if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(normalizedType)) {
        log.debug(` Using declared type from data URI: ${normalizedType}`);
        return normalizedType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
      }
    }
    
    // Default to JPEG if unknown
    log.warn('Could not detect media type from base64, defaulting to image/jpeg');
    return 'image/jpeg';
  }

  /**
   * Phase 8A: Comprehensive scene analysis with AI artifact detection
   * Phase 10A: Added diagnostic logging
   */
  async analyzeScenePhase8(
    imageBase64: string,
    context: SceneContext
  ): Promise<Phase8AnalysisResult> {
    log.debug('═══════════════════════════════════════════════════════════════════════════════');
    log.debug('[Phase10A] SCENE ANALYSIS STARTED');
    log.debug('═══════════════════════════════════════════════════════════════════════════════');
    log.debug(`[Phase10A] Scene: ${context.sceneIndex + 1}/${context.totalScenes}`);
    log.debug(`[Phase10A] Scene Type: ${context.sceneType}`);
    log.debug(`[Phase10A] Visual Direction: "${context.visualDirection?.substring(0, 120)}..."`);
    log.debug(`[Phase10A] Narration: "${context.narration?.substring(0, 100)}..."`);
    log.debug(`[Phase10A] Image data size: ${imageBase64.length} chars`);
    log.debug(`[Phase10A] Anthropic client available: ${!!this.anthropic}`);
    log.debug(`[Phase10A] ANTHROPIC_API_KEY env: ${!!process.env.ANTHROPIC_API_KEY}`);
    
    // Re-check in case the key was loaded after construction
    if (!this.anthropic && process.env.ANTHROPIC_API_KEY) {
      log.debug('[Phase10A] Re-initializing Anthropic client...');
      this.initializeClient();
    }
    
    if (!this.anthropic) {
      log.warn('═══════════════════════════════════════════════════════════════════════════════');
      log.warn('[Phase10A] WARNING: ANTHROPIC NOT CONFIGURED');
      log.warn('[Phase10A] Returning SIMULATED result with FAKE scores (75-90 range)');
      log.warn('[Phase10A] This is why quality scores appear incorrect!');
      log.warn('═══════════════════════════════════════════════════════════════════════════════');
      return this.createSimulatedPhase8Result(context);
    }
    
    const brandContext = await brandContextService.getVisualAnalysisContext();
    const analysisPrompt = this.buildPhase8AnalysisPrompt(context, brandContext);
    
    // Detect the actual media type from the base64 data
    const detectedMediaType = this.detectMediaTypeFromBase64(imageBase64);
    log.debug(`[Phase10A] Detected media type: ${detectedMediaType}`);
    
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: detectedMediaType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: analysisPrompt,
              },
            ],
          },
        ],
      });
      
      const analysisText = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '';
      
      log.debug('[Phase10A] Claude Vision API call SUCCESSFUL');
      log.debug('[Phase10A] Raw response length:', analysisText.length, 'chars');
      
      const result = this.parsePhase8AnalysisResponse(analysisText, context);
      
      log.debug('═══════════════════════════════════════════════════════════════════════════════');
      log.debug('[Phase10A] REAL ANALYSIS RESULT (from Claude Vision)');
      log.debug('═══════════════════════════════════════════════════════════════════════════════');
      log.debug(`[Phase10A] Scene ${context.sceneIndex + 1} Overall Score: ${result.overallScore}/100`);
      log.debug(`[Phase10A] Technical: ${result.technicalScore}, Content Match: ${result.contentMatchScore}`);
      log.debug(`[Phase10A] Brand: ${result.brandComplianceScore}, Composition: ${result.compositionScore}`);
      log.debug(`[Phase10A] Recommendation: ${result.recommendation}`);
      log.debug(`[Phase10A] Content Match Details: ${result.contentMatchDetails}`);
      log.debug(`[Phase10A] Issues: ${result.issues.length > 0 ? result.issues.map(i => i.description).join('; ') : 'None'}`);
      if (result.aiArtifactsDetected) {
        log.debug(`[Phase10A] AI Artifacts: ${result.aiArtifactDetails.join(', ')}`);
      }
      log.debug(`[Phase10A] Analysis Model: ${result.analysisModel}`);
      log.debug('═══════════════════════════════════════════════════════════════════════════════');
      
      return result;
      
    } catch (error: any) {
      log.error('═══════════════════════════════════════════════════════════════════════════════');
      log.error('[Phase10A] CLAUDE VISION API CALL FAILED');
      log.error('[Phase10A] Error:', error.message);
      log.error('[Phase10A] Returning FAILED result with score 0');
      log.error('═══════════════════════════════════════════════════════════════════════════════');
      return this.createFailedPhase8Result(context, error.message);
    }
  }

  /**
   * Phase 8A: Quick check for blank/gradient images
   */
  async isBlankOrGradient(imageBase64: string): Promise<boolean> {
    if (!this.anthropic) {
      return false;
    }
    
    // Detect the actual media type from the base64 data
    const detectedMediaType = this.detectMediaTypeFromBase64(imageBase64);
    
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: detectedMediaType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: 'Is this image blank, a solid color, or just a gradient with no meaningful content? Answer only "yes" or "no".',
              },
            ],
          },
        ],
      });
      
      const answer = response.content[0].type === 'text' 
        ? response.content[0].text.toLowerCase().trim()
        : '';
      
      return answer.includes('yes');
      
    } catch {
      return false;
    }
  }

  /**
   * Phase 10B: Strict content matching prompt
   * This prompt enforces rigorous validation that generated images ACTUALLY match visual directions
   */
  private buildPhase8AnalysisPrompt(context: SceneContext, brandContext: string): string {
    const requiredElements = this.extractRequiredElements(context.visualDirection);
    
    // Build I2V context if a brand asset is selected
    let i2vContext = '';
    if (context.selectedBrandAsset) {
      const isProductWorkflow = context.workflowPath?.includes('product') || 
                                 context.selectedBrandAsset.type === 'product';
      if (isProductWorkflow) {
        i2vContext = `
## I2V WORKFLOW CONTEXT (CRITICAL FOR IMPROVED PROMPT)
A product brand asset has been selected: "${context.selectedBrandAsset.name}" (${context.selectedBrandAsset.type})
Workflow: ${context.workflowPath || 'product-hero'}

This scene will use Image-to-Video (I2V) generation where the product image will be animated.
When generating the "improvedPrompt", you MUST follow these I2V best practices:

1. DO NOT describe the product appearance in the prompt (the product image is the source)
2. DO describe the ENVIRONMENT and SCENE around the product:
   - Camera angle and movement (slow zoom, gentle pan, static with atmospheric motion)
   - Lighting style (soft morning light, golden hour, studio lighting)
   - Background elements (wooden table, marble counter, natural setting)
   - Atmospheric effects (gentle steam, floating particles, light rays)
   - Mood and tone (peaceful, energetic, professional)

3. Example I2V-appropriate prompt:
   "Medium close-up shot with soft morning light streaming through a window. Natural wooden surface with fresh herbs and ceramic bowls in soft focus background. Gentle atmospheric particles floating in golden light rays. Camera holds steady with subtle environmental motion. Warm earth tones and peaceful wellness atmosphere."

4. DO NOT say things like "Black Cohosh bottle" or describe product labels - the actual product photo provides this.
`;
      }
    }
    
    return `You are a STRICT quality assurance analyst for video production. Your job is to determine if this generated image ACTUALLY matches what was requested.

## CRITICAL INSTRUCTION
You must be STRICT about content matching. If the visual direction asks for specific elements and they are missing or wrong, the score MUST be low. Do NOT give high scores to technically good images that don't match what was requested.
${i2vContext}
## SCENE CONTEXT
- Scene ${context.sceneIndex + 1} of ${context.totalScenes}
- Scene Type: ${context.sceneType}
- Expected Content: ${context.expectedContentType}
- Narration: "${context.narration}"
- Visual Direction: "${context.visualDirection}"
${context.selectedBrandAsset ? `- Selected Brand Asset: "${context.selectedBrandAsset.name}" (${context.selectedBrandAsset.type})` : ''}
${context.workflowPath ? `- Workflow Path: ${context.workflowPath}` : ''}

## BRAND GUIDELINES
${brandContext}

## YOUR ANALYSIS TASK

### 1. CONTENT MATCH CHECK (Most Important - 40 points max)
Go through EACH element mentioned in the visual direction and verify it exists:

${requiredElements}

For EACH element:
- Present and correct: Full points
- Present but wrong: Half points  
- Missing entirely: Zero points
- CRITICAL: If visual direction mentions "text overlay" or "text with [content]" and there is NO text visible, this is an AUTOMATIC FAILURE (contentMatch.score = 0)

### 2. FRAMING/COMPOSITION CHECK (15 points max)
- If direction says "wide shot" but image is close-up: FAIL
- If direction says "close-up" but image is wide: FAIL
- If direction mentions "full body" or "upper body" but only face/partial: FAIL
- If direction says "surrounded by X" but X is not visible: FAIL
- If direction mentions person "in [location]" but location is not visible: FAIL

### 3. TECHNICAL QUALITY (20 points max)
- Resolution and clarity
- No AI artifacts (distorted hands, garbled text, impossible geometry)
- Proper lighting

### 4. BRAND COMPLIANCE (15 points max)
**CONTEXT-AWARE RULE**: If the VISUAL DIRECTION explicitly requests clinical/cold/sterile settings 
(e.g., "sterile doctor's office", "cold waiting room", "clinical environment"), these are INTENTIONAL 
for storytelling purposes (showing the "problem" before the wellness solution). In such cases:
- Score HIGH if the image MATCHES the requested clinical/cold aesthetic
- Do NOT penalize clinical/cold elements when they are EXPLICITLY REQUESTED in the visual direction

For scenes WITHOUT explicit clinical/cold direction:
- Warm, natural lighting (not clinical/cold)
- Earth tones, greens, natural colors
- Welcoming, health-focused aesthetic

### 5. AI ARTIFACTS (10 points max)
- Check for distorted hands, extra fingers
- Garbled or unreadable text
- Unnatural faces or expressions
- Impossible geometry

## SCORING RULES

**AUTOMATIC FAILURES (contentMatch.score must be < 30):**
- Visual direction mentions "text overlay/text with X" but NO text is visible in image
- Visual direction describes specific scene (e.g., "woman in kitchen") but scene is completely different
- Visual direction says "wide shot" but image is extreme close-up (or vice versa)
- Visual direction says "surrounded by X" but X is not visible at all
- Major element from visual direction is completely missing

**NEEDS REVIEW (contentMatch.score 30-59):**
- Most elements present but one significant element missing
- Correct scene but wrong framing
- Person visible but environment not shown when required

**ACCEPTABLE (contentMatch.score 60-79):**
- All major elements present
- Minor deviations from direction
- Good technical quality

**EXCELLENT (contentMatch.score 80-100):**
- Perfectly matches visual direction
- All elements present and correct
- Excellent technical quality

## RESPONSE FORMAT
Respond ONLY with JSON:
\`\`\`json
{
  "technicalQuality": {
    "score": <0-100>,
    "resolution": "<good|acceptable|poor>",
    "focus": "<sharp|soft|blurry>",
    "exposure": "<good|overexposed|underexposed>",
    "issues": ["<issue1>", "<issue2>"]
  },
  "contentMatch": {
    "score": <0-100>,
    "matchesNarration": <true|false>,
    "matchesVisualDirection": <true|false>,
    "appropriateForSceneType": <true|false>,
    "explanation": "<detailed explanation of why it matches or doesn't>",
    "detectedFraming": "<wide-shot|medium-shot|close-up|extreme-close-up>",
    "requestedElements": ["<element1>", "<element2>"],
    "presentElements": ["<element1>"],
    "missingElements": ["<element2>"],
    "textOverlayRequired": <true|false>,
    "textOverlayPresent": <true|false>
  },
  "aiArtifacts": {
    "detected": <true|false>,
    "artifacts": [
      {
        "type": "<garbled_text|fake_ui|distorted_hands|unnatural_face|duplicate_elements|other>",
        "description": "<description>",
        "severity": "<critical|major|minor>"
      }
    ]
  },
  "brandCompliance": {
    "score": <0-100 - if visual direction requests clinical/cold settings and image matches, score HIGH>,
    "lightingMatch": <true if matches visual direction (clinical = cool is CORRECT if requested)>,
    "lightingType": "<warm|cool|neutral|mixed>",
    "colorPaletteMatch": <true if matches visual direction intent>,
    "dominantColors": ["<color1>", "<color2>"],
    "settingAppropriate": <true if matches visual direction - clinical IS appropriate when requested>,
    "authenticFeel": <true|false>,
    "visualDirectionRequestsClinical": <true|false - detect if visual direction asks for clinical/cold/sterile settings>,
    "issues": ["<issue1>", "<issue2> - only flag if clinical/cold was NOT requested in visual direction"]
  },
  "composition": {
    "score": <0-100>,
    "subjectPosition": "<left|center|right|none>",
    "faceDetected": <true|false>,
    "faceRegion": {"x": <0-1>, "y": <0-1>, "width": <0-1>, "height": <0-1>},
    "busyRegions": ["<top|bottom|left|right|center>"],
    "safeTextZones": [
      {"position": "<lower-third|top|bottom-left|bottom-right>", "confidence": <0-100>}
    ],
    "environmentVisible": <true|false>
  },
  "overallAssessment": {
    "recommendation": "<approved|needs_review|regenerate|critical_fail>",
    "primaryIssues": ["<issue1>", "<issue2>"],
    "improvedPrompt": "<if regenerate needed, provide improved visual direction>"
  }
}
\`\`\`

## SCORING WEIGHTS FOR OVERALL SCORE
- Content Match: 40% of total (most important!)
- Technical Quality: 20% of total
- Brand Compliance: 20% of total
- Composition/Framing: 20% of total

REMEMBER: A technically perfect image that doesn't match the visual direction should score LOW. Content match is the MOST important factor.

**CONTEXT-AWARE BRAND COMPLIANCE**: If the visual direction explicitly mentions clinical, sterile, cold, waiting room, 
fluorescent lighting, or similar elements - these are INTENTIONAL storytelling choices. When the image MATCHES 
these requested elements, brand compliance should be HIGH, not low. Only penalize clinical/cold aesthetics when 
they appear in scenes where they were NOT requested.

Respond ONLY with the JSON, no other text.`;
  }

  /**
   * Phase 10B: Extract required elements from visual direction for strict checking
   */
  private extractRequiredElements(visualDirection: string): string {
    const elements: string[] = [];
    const direction = visualDirection?.toLowerCase() || '';
    
    // Check for text overlay requirements
    if (direction.includes('text overlay') || 
        direction.includes('text with') ||
        direction.includes('overlay with') ||
        direction.includes('actionable steps') ||
        direction.includes('bullet points') ||
        direction.includes('list of') ||
        direction.includes('showing text') ||
        direction.includes('display text')) {
      elements.push('- TEXT OVERLAY: Visual direction requires text to be visible in the image. If no text is visible, this is an AUTOMATIC FAILURE.');
    }
    
    // Check for person requirements
    if (direction.includes('woman') || direction.includes('man') || direction.includes('person')) {
      elements.push('- PERSON: A person matching the description must be visible');
      
      // Check if environment context is also required
      if (direction.includes(' in ') || direction.includes('surrounded by')) {
        elements.push('- PERSON + ENVIRONMENT: The person must be shown WITH their environment visible (not just face close-up)');
      }
    }
    
    // Check for setting requirements
    if (direction.includes('kitchen')) {
      elements.push('- SETTING: Kitchen environment must be clearly visible (counters, cabinets, appliances, etc.)');
    }
    if (direction.includes('wellness center') || direction.includes('entrance')) {
      elements.push('- SETTING: Wellness center/entrance must be visible');
    }
    if (direction.includes('nature') || direction.includes('outdoor') || direction.includes('garden')) {
      elements.push('- SETTING: Natural/outdoor environment must be visible');
    }
    
    // Check for "surrounded by" requirements
    const surroundedMatch = visualDirection?.match(/surrounded by ([^,\.]+)/i);
    if (surroundedMatch) {
      elements.push(`- SURROUNDINGS: "${surroundedMatch[1]}" must be visible around the subject. If person is shown in close-up without surroundings, this FAILS.`);
    }
    
    // Check for framing requirements
    if (direction.includes('wide shot')) {
      elements.push('- FRAMING: Wide shot showing full environment (not close-up)');
    }
    if (direction.includes('close-up') && !direction.includes('extreme')) {
      elements.push('- FRAMING: Close-up shot of subject');
    }
    if (direction.includes('full body')) {
      elements.push('- FRAMING: Full body of person must be visible');
    }
    if (direction.includes('upper body') || direction.includes('waist up')) {
      elements.push('- FRAMING: Upper body of person must be visible');
    }
    
    // Check for specific objects
    if (direction.includes('food') || direction.includes('foods')) {
      elements.push('- OBJECTS: Food items must be visible in the scene');
    }
    if (direction.includes('vegetable') || direction.includes('vegetables')) {
      elements.push('- OBJECTS: Vegetables must be visible');
    }
    if (direction.includes('fruit') || direction.includes('fruits')) {
      elements.push('- OBJECTS: Fruits must be visible');
    }
    if (direction.includes('product') || direction.includes('products')) {
      elements.push('- OBJECTS: Products must be visible');
    }
    
    // Check for lighting/mood
    if (direction.includes('natural lighting') || direction.includes('natural light')) {
      elements.push('- LIGHTING: Natural, soft lighting (not artificial/harsh)');
    }
    if (direction.includes('golden hour')) {
      elements.push('- LIGHTING: Golden hour warm lighting');
    }
    if (direction.includes('bright')) {
      elements.push('- LIGHTING: Bright, well-lit scene');
    }
    
    // Check for mood/emotion requirements
    if (direction.includes('confident') || direction.includes('empowered')) {
      elements.push('- MOOD: Person should appear confident and empowered');
    }
    if (direction.includes('welcoming') || direction.includes('friendly')) {
      elements.push('- MOOD: Scene should feel welcoming and friendly');
    }
    
    return elements.length > 0 
      ? 'Required elements to verify (BE STRICT - if missing, score must be LOW):\n' + elements.join('\n')
      : 'Verify ALL elements mentioned in the visual direction are present. Be strict about content matching.';
  }

  /**
   * Phase 10B: Check if visual direction requires text overlay
   */
  private requiresTextOverlay(visualDirection: string): boolean {
    const textKeywords = [
      'text overlay',
      'text with',
      'overlay with',
      'actionable steps',
      'bullet points',
      'list of',
      'showing text',
      'display text',
      'three steps',
      'numbered',
    ];
    
    const direction = visualDirection?.toLowerCase() || '';
    return textKeywords.some(keyword => direction.includes(keyword));
  }

  /**
   * Phase 10B: Check if visual direction requires environment to be visible with person
   */
  private requiresEnvironmentWithPerson(visualDirection: string): boolean {
    const direction = visualDirection?.toLowerCase() || '';
    
    // Check for person + environment patterns
    const hasPersonReference = direction.includes('woman') || direction.includes('man') || direction.includes('person');
    const hasEnvironmentContext = direction.includes(' in ') || 
                                   direction.includes('surrounded by') || 
                                   direction.includes('kitchen') ||
                                   direction.includes('center') ||
                                   direction.includes('entrance');
    
    return hasPersonReference && hasEnvironmentContext;
  }

  private parsePhase8AnalysisResponse(
    responseText: string,
    context: SceneContext
  ): Phase8AnalysisResult {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const analysis = JSON.parse(jsonMatch[0]);
      
      // Phase 10B: Updated scoring weights - content match is now 40% (most important)
      // Weights: Content Match 40%, Technical 20%, Brand 20%, Composition 20% = 100%
      const technicalScore = Math.round((analysis.technicalQuality?.score || 0) * 0.2);
      const contentMatchScore = Math.round((analysis.contentMatch?.score || 0) * 0.4); // 40% weight
      const brandComplianceScore = Math.round((analysis.brandCompliance?.score || 0) * 0.2);
      const compositionScore = Math.round((analysis.composition?.score || 0) * 0.2);
      
      // Phase 10B: Calculate base overall score
      let overallScore = technicalScore + contentMatchScore + brandComplianceScore + compositionScore;
      
      // Phase 10B: Post-analysis validation for text overlay requirements
      const requiresText = this.requiresTextOverlay(context.visualDirection);
      const textOverlayPresent = analysis.contentMatch?.textOverlayPresent ?? false;
      
      if (requiresText && !textOverlayPresent) {
        log.debug('[Phase10B] FORCING LOW SCORE: Text overlay required but not detected');
        overallScore = Math.min(overallScore, 40);
      }
      
      // Phase 10B: Post-analysis validation for environment requirements
      const requiresEnvironment = this.requiresEnvironmentWithPerson(context.visualDirection);
      const environmentVisible = analysis.composition?.environmentVisible ?? false;
      const detectedFraming = analysis.contentMatch?.detectedFraming || '';
      
      if (requiresEnvironment && (detectedFraming === 'extreme-close-up' || !environmentVisible)) {
        log.debug('[Phase10B] FORCING LOW SCORE: Environment required but not visible (framing: ' + detectedFraming + ')');
        overallScore = Math.min(overallScore, 45);
      }
      
      const issues: AnalysisIssue[] = [];
      
      // Phase 10B: Add issues for missing required elements
      if (requiresText && !textOverlayPresent) {
        issues.push({
          category: 'content_match',
          severity: 'critical',
          description: 'Visual direction requires text overlay but no text is visible in the image',
          suggestion: 'Regenerate with explicit text overlay or add text in post-production',
        });
      }
      
      if (requiresEnvironment && (detectedFraming === 'extreme-close-up' || !environmentVisible)) {
        issues.push({
          category: 'content_match',
          severity: 'critical',
          description: `Visual direction requires person WITH environment visible, but only ${detectedFraming || 'close-up'} framing detected without environment`,
          suggestion: 'Regenerate with wider framing to show the person in their environment',
        });
      }
      
      // Phase 10B: Add issues for missing elements from Claude's analysis
      const missingElements = analysis.contentMatch?.missingElements || [];
      for (const missing of missingElements) {
        issues.push({
          category: 'content_match',
          severity: 'major',
          description: `Missing required element: ${missing}`,
          suggestion: 'Regenerate to include this element',
        });
      }
      
      if (analysis.aiArtifacts?.detected) {
        for (const artifact of analysis.aiArtifacts.artifacts || []) {
          issues.push({
            category: 'ai_artifacts',
            severity: artifact.severity || 'major',
            description: artifact.description,
            suggestion: `Remove ${artifact.type} by regenerating with cleaner prompt`,
          });
        }
      }
      
      if (!analysis.contentMatch?.matchesNarration) {
        issues.push({
          category: 'content_match',
          severity: 'major',
          description: analysis.contentMatch?.explanation || 'Visual does not match narration',
          suggestion: 'Regenerate with more specific visual direction',
        });
      }
      
      for (const issue of analysis.brandCompliance?.issues || []) {
        issues.push({
          category: 'brand_compliance',
          severity: 'major',
          description: issue,
          suggestion: 'Adjust to match Pine Hill Farm aesthetic (warm lighting, earth tones)',
        });
      }
      
      for (const issue of analysis.technicalQuality?.issues || []) {
        issues.push({
          category: 'technical',
          severity: 'minor',
          description: issue,
          suggestion: 'Regenerate for better quality',
        });
      }
      
      let recommendation: Phase8AnalysisResult['recommendation'] = 'approved';
      const hasCriticalArtifact = analysis.aiArtifacts?.artifacts?.some(
        (a: any) => a.severity === 'critical'
      );
      
      if (hasCriticalArtifact || overallScore < 50) {
        recommendation = 'critical_fail';
      } else if (overallScore < 70) {
        recommendation = 'regenerate';
      } else if (overallScore < 85) {
        recommendation = 'needs_review';
      }
      
      return {
        sceneIndex: context.sceneIndex,
        overallScore,
        technicalScore,
        contentMatchScore,
        brandComplianceScore,
        compositionScore,
        aiArtifactsDetected: analysis.aiArtifacts?.detected || false,
        aiArtifactDetails: (analysis.aiArtifacts?.artifacts || []).map((a: any) => a.description),
        contentMatchDetails: analysis.contentMatch?.explanation || '',
        brandComplianceDetails: (analysis.brandCompliance?.issues || []).join('; '),
        frameAnalysis: {
          subjectPosition: analysis.composition?.subjectPosition || 'center',
          faceDetected: analysis.composition?.faceDetected || false,
          faceRegion: analysis.composition?.faceRegion || undefined,
          busyRegions: analysis.composition?.busyRegions || [],
          dominantColors: analysis.brandCompliance?.dominantColors || [],
          lightingType: analysis.brandCompliance?.lightingType || 'neutral',
          safeTextZones: analysis.composition?.safeTextZones || [],
        },
        issues,
        recommendation,
        improvedPrompt: analysis.overallAssessment?.improvedPrompt,
        analysisTimestamp: new Date().toISOString(),
        analysisModel: 'claude-sonnet-4-20250514',
      };
      
    } catch (error: any) {
      log.error('[Phase8] Parse error:', error.message);
      return this.createFailedPhase8Result(context, `Parse error: ${error.message}`);
    }
  }

  private createFailedPhase8Result(context: SceneContext, reason: string): Phase8AnalysisResult {
    return {
      sceneIndex: context.sceneIndex,
      overallScore: 0,
      technicalScore: 0,
      contentMatchScore: 0,
      brandComplianceScore: 0,
      compositionScore: 0,
      aiArtifactsDetected: false,
      aiArtifactDetails: [],
      contentMatchDetails: '',
      brandComplianceDetails: '',
      frameAnalysis: {
        subjectPosition: 'none',
        faceDetected: false,
        busyRegions: [],
        dominantColors: [],
        lightingType: 'neutral',
        safeTextZones: [],
      },
      issues: [{
        category: 'technical',
        severity: 'critical',
        description: `Analysis failed: ${reason}`,
        suggestion: 'Retry analysis or manually review',
      }],
      recommendation: 'critical_fail',
      analysisTimestamp: new Date().toISOString(),
      analysisModel: 'claude-sonnet-4-20250514',
    };
  }

  /**
   * Phase 10C: Returns pending status when Claude Vision is not available.
   * NO FAKE SCORES - UI should show "Analysis Pending" state.
   */
  private createSimulatedPhase8Result(context: SceneContext): Phase8AnalysisResult {
    log.warn(`Scene ${context.sceneIndex + 1} requires Claude Vision analysis - returning pending status`);
    
    // Phase 10C: Return null/0 scores to indicate no real analysis performed
    return {
      sceneIndex: context.sceneIndex,
      overallScore: 0,  // Phase 10C: Zero indicates no analysis, not a real score
      technicalScore: 0,
      contentMatchScore: 0,
      brandComplianceScore: 0,
      compositionScore: 0,
      aiArtifactsDetected: false,
      aiArtifactDetails: [],
      contentMatchDetails: '⚠️ ANALYSIS PENDING - Configure ANTHROPIC_API_KEY for real quality analysis.',
      brandComplianceDetails: '⚠️ ANALYSIS PENDING - No Anthropic API key configured',
      frameAnalysis: {
        subjectPosition: 'none',
        faceDetected: false,
        busyRegions: [],
        dominantColors: [],
        lightingType: 'neutral',
        safeTextZones: [],
      },
      issues: [{
        category: 'technical',
        severity: 'critical',
        description: '⚠️ Quality analysis not performed - Claude Vision API required',
        suggestion: 'Configure ANTHROPIC_API_KEY to enable real quality analysis',
      }],
      recommendation: 'critical_fail',  // Phase 10C: Cannot pass without real analysis
      analysisTimestamp: new Date().toISOString(),
      analysisModel: 'analysis-pending',
      hasRealAnalysis: false,  // Phase 10C: Flag to indicate no real analysis
    } as Phase8AnalysisResult;
  }
}

export const sceneAnalysisService = new SceneAnalysisService();
