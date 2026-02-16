import Anthropic from '@anthropic-ai/sdk';
import { brandContextService } from './brand-context-service';
import { createLogger } from '../utils/logger';
import type { Phase8AnalysisIssue } from '../../shared/video-types';

const log = createLogger('PromptImprover');

export interface SceneRequirements {
  sceneIndex: number;
  sceneType: string;
  narration: string;
  originalPrompt: string;
  hasBrandAssets: boolean;
  brandAssetTypes?: string[];
  generationType: 'T2I' | 'T2V' | 'I2I' | 'I2V';
  qualityTier: 'standard' | 'premium' | 'ultra';
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

export interface IssueContext {
  issues: Phase8AnalysisIssue[];
  overallScore: number;
  scores: {
    technical: number;
    contentMatch: number;
    composition: number;
  };
}

export interface ImprovedPromptResult {
  improvedPrompt: string;
  promptStrategy: 'detailed_i2v' | 'detailed_i2i' | 'simple_t2v' | 'simple_t2i';
  keyChanges: string[];
  confidence: number;
}

const I2V_PROMPT_FORMULA = `
For I2V (Image-to-Video) prompts, use this formula:
[Subject Description] + [Motion/Action] + [Scene/Environment] + [Aesthetics/Style] + [Camera Movement]

Example structure:
- Subject: A detailed description of the main focus with appearance details
- Motion: VITAL - explicit movement instructions (e.g., "slowly rotating", "gently swaying", "camera drifts")
- Scene: Background and foreground context
- Aesthetics: Lighting, mood, visual quality (e.g., "warm golden light", "cinematic", "soft focus")
- Camera: Non-compulsory but effective (e.g., "slow push in", "dolly around", "static wide shot")

IMPORTANT: Focus on actions/changes relative to the input image. Constrain motion to prevent unwanted changes.
`;

const I2I_PROMPT_FORMULA = `
For I2I (Image-to-Image) prompts, use this formula:
[Keep/Preserve] + [Modify/Add] + [Style/Aesthetics] + [Lighting/Environment]

Key principles:
- Specify what to KEEP constant (e.g., "maintain product positioning", "preserve label visibility")
- Specify what to MODIFY (e.g., "place on rustic wooden surface", "add soft natural lighting")
- Style modifiers for desired aesthetic
- Low denoise = minor touch-ups; High denoise = significant changes

IMPORTANT: Words at the beginning carry more weight. Be descriptive about subject, setting, lighting, colors.
`;

const SIMPLE_PROMPT_FORMULA = `
For standard T2I/T2V without brand assets, use simpler, direct prompts:
[Subject] + [Setting] + [Style] + [Quality]

Keep it focused and concise:
- Clear main subject description
- Simple setting/background
- Style keywords (cinematic, professional, etc.)
- Quality markers (high resolution, sharp focus)

Avoid over-specification - let the AI model have creative freedom within constraints.
`;

class IntelligentPromptImprover {
  private anthropic: Anthropic | null = null;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  isAvailable(): boolean {
    return !!this.anthropic;
  }

  async improvePrompt(
    scene: SceneRequirements,
    issueContext: IssueContext
  ): Promise<ImprovedPromptResult> {
    if (!this.anthropic) {
      log.warn('Anthropic not available, returning original prompt with basic fixes');
      return this.getBasicImprovement(scene, issueContext);
    }

    try {
      const promptStrategy = this.determinePromptStrategy(scene);
      const formula = this.getFormulaForStrategy(promptStrategy);
      const brandContext = await brandContextService.getBrandSummary();
      
      log.debug(`Improving prompt for scene ${scene.sceneIndex + 1}, strategy: ${promptStrategy}`);

      const systemPrompt = this.buildSystemPrompt(promptStrategy, formula, brandContext);
      const userPrompt = this.buildUserPrompt(scene, issueContext, promptStrategy);

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      return this.parseResponse(content.text, promptStrategy);

    } catch (error: any) {
      log.error(`Prompt improvement failed: ${error.message}`);
      return this.getBasicImprovement(scene, issueContext);
    }
  }

  private determinePromptStrategy(scene: SceneRequirements): ImprovedPromptResult['promptStrategy'] {
    if (scene.hasBrandAssets) {
      return scene.generationType === 'I2V' ? 'detailed_i2v' : 'detailed_i2i';
    }
    return scene.generationType === 'T2V' ? 'simple_t2v' : 'simple_t2i';
  }

  private getFormulaForStrategy(strategy: ImprovedPromptResult['promptStrategy']): string {
    switch (strategy) {
      case 'detailed_i2v':
        return I2V_PROMPT_FORMULA;
      case 'detailed_i2i':
        return I2I_PROMPT_FORMULA;
      case 'simple_t2v':
      case 'simple_t2i':
      default:
        return SIMPLE_PROMPT_FORMULA;
    }
  }

  private buildSystemPrompt(
    strategy: ImprovedPromptResult['promptStrategy'],
    formula: string,
    brandContext: string
  ): string {
    const isDetailedMode = strategy.startsWith('detailed_');
    
    return `You are an expert AI prompt engineer specializing in image and video generation.
Your task is to analyze issues found in a generated asset and create an IMPROVED prompt that addresses those issues.

${formula}

${isDetailedMode ? `
BRAND CONTEXT (incorporate naturally):
${brandContext}

For scenes with brand assets (product photos, logos), the prompt must:
- Preserve the brand asset's integrity (no distortion, proper placement)
- Describe motion that enhances without overwhelming the subject
- Use camera movements appropriate for the content (subtle for products, dynamic for lifestyle)
` : `
For standard scenes WITHOUT brand assets:
- Keep prompts concise and focused
- Don't over-specify - allow creative freedom
- Focus on addressing the specific issues found
`}

OUTPUT FORMAT:
Return a JSON object with:
{
  "improvedPrompt": "the complete improved prompt text",
  "keyChanges": ["change 1", "change 2", "change 3"],
  "confidence": 0.85
}

IMPORTANT RULES:
1. Address EACH issue found in the analysis
2. Keep the core scene intent from the original prompt
3. For I2V/I2I: Include explicit motion and camera instructions
4. For T2I/T2V: Keep it simple and direct
5. Always end with quality keywords: "high quality, professional, sharp focus"`;
  }

  private buildUserPrompt(
    scene: SceneRequirements,
    issueContext: IssueContext,
    strategy: ImprovedPromptResult['promptStrategy']
  ): string {
    const issueDescriptions = issueContext.issues
      .map(i => `- [${i.severity.toUpperCase()}] ${i.description}`)
      .join('\n');

    const scoresInfo = `
Current Scores:
- Overall: ${issueContext.overallScore}/100
- Technical: ${issueContext.scores.technical}/100
- Content Match: ${issueContext.scores.contentMatch}/100
- Composition: ${issueContext.scores.composition}/100`;

    return `SCENE CONTEXT:
- Scene Type: ${scene.sceneType}
- Scene Narration: "${scene.narration}"
- Generation Type: ${scene.generationType}
- Quality Tier: ${scene.qualityTier}
${scene.hasBrandAssets ? `- Brand Assets: ${scene.brandAssetTypes?.join(', ') || 'Yes'}` : '- No Brand Assets'}

ORIGINAL PROMPT:
"${scene.originalPrompt}"

${scoresInfo}

ISSUES FOUND:
${issueDescriptions || 'No specific issues listed, but score is below threshold'}

TASK:
Create an improved prompt that:
1. Fixes ALL the issues listed above
2. Maintains the scene's intended purpose: "${scene.narration}"
3. Uses ${strategy.replace('_', ' ').replace('detailed', 'detailed formula for').replace('simple', 'simple direct format for')}
4. ${scene.hasBrandAssets 
    ? 'Includes specific motion/camera instructions for brand asset animation'
    : 'Keeps the prompt focused and concise'}

Generate the improved prompt now.`;
  }

  private parseResponse(
    text: string,
    strategy: ImprovedPromptResult['promptStrategy']
  ): ImprovedPromptResult {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        improvedPrompt: parsed.improvedPrompt || parsed.improved_prompt || '',
        promptStrategy: strategy,
        keyChanges: parsed.keyChanges || parsed.key_changes || [],
        confidence: parsed.confidence || 0.7,
      };

    } catch (error: any) {
      log.error(`Failed to parse prompt improvement response: ${error.message}`);
      return {
        improvedPrompt: '',
        promptStrategy: strategy,
        keyChanges: ['Parse error - using original prompt'],
        confidence: 0,
      };
    }
  }

  private getBasicImprovement(
    scene: SceneRequirements,
    issueContext: IssueContext
  ): ImprovedPromptResult {
    let improvedPrompt = scene.originalPrompt;
    const keyChanges: string[] = [];

    for (const issue of issueContext.issues) {
      switch (issue.category) {
        case 'ai_artifacts':
          if (!improvedPrompt.includes('photorealistic')) {
            improvedPrompt += ', photorealistic, no text overlays, no UI elements';
            keyChanges.push('Added anti-artifact keywords');
          }
          break;
        case 'content_match':
          keyChanges.push('Content mismatch - manual review needed');
          break;
        case 'brand_compliance':
          if (issue.description.toLowerCase().includes('lighting')) {
            improvedPrompt += ', warm golden natural lighting, soft shadows';
            keyChanges.push('Added warm lighting fix');
          }
          if (issue.description.toLowerCase().includes('color')) {
            improvedPrompt += ', earth tones, natural palette';
            keyChanges.push('Added earth tone colors');
          }
          break;
        case 'composition':
          improvedPrompt += ', balanced composition, clear subject';
          keyChanges.push('Added composition guidance');
          break;
        case 'technical':
          improvedPrompt += ', high resolution, sharp focus, professional quality';
          keyChanges.push('Added quality keywords');
          break;
      }
    }

    if (scene.generationType === 'I2V' && !improvedPrompt.includes('camera')) {
      improvedPrompt += ', subtle camera movement, gentle motion';
      keyChanges.push('Added I2V motion guidance');
    }

    const strategy = this.determinePromptStrategy(scene);

    return {
      improvedPrompt,
      promptStrategy: strategy,
      keyChanges,
      confidence: 0.5,
    };
  }
}

export const intelligentPromptImprover = new IntelligentPromptImprover();
