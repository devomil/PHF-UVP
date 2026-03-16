import { aiVideoService } from './ai-video-service';
import { sceneAnalysisService } from './scene-analysis-service';
import { compositionInstructionsService } from './composition-instructions-service';
import { QualityIssue, SceneQualityScore } from './quality-evaluation-service';

interface RegenerationResult {
  success: boolean;
  sceneId: string;
  sceneIndex: number;
  newVideoUrl?: string;
  newAnalysis?: any;
  newInstructions?: any;
  error?: string;
  attempt: number;
}

interface SceneData {
  id: string;
  type: string;
  duration: number;
  narration?: string;
  visualDirection?: string;
  textOverlays?: Array<{ text: string; style?: string }>;
  assets?: {
    useProductOverlay?: boolean;
    videoUrl?: string;
  };
  background?: {
    source?: string;
  };
}

interface ProjectData {
  id: string;
  outputFormat?: {
    aspectRatio?: string;
  };
  scenes: SceneData[];
}

class SceneRegenerationService {
  private maxRetries = 2;

  async regenerateFailedScenes(
    project: ProjectData,
    failedScenes: SceneQualityScore[]
  ): Promise<RegenerationResult[]> {
    console.log(`[Regen] Regenerating ${failedScenes.length} scenes...`);
    
    const results: RegenerationResult[] = [];
    
    for (const failedScene of failedScenes) {
      const scene = project.scenes[failedScene.sceneIndex];
      if (!scene) continue;
      
      console.log(`[Regen] Regenerating scene ${failedScene.sceneIndex + 1}: ${scene.type}`);
      
      const result = await this.regenerateScene(
        scene,
        project,
        failedScene.issues,
        failedScene.sceneIndex
      );
      
      results.push(result);
    }
    
    return results;
  }

  async regenerateScene(
    scene: SceneData,
    project: ProjectData,
    issues: QualityIssue[],
    sceneIndex: number,
    attempt: number = 1
  ): Promise<RegenerationResult> {
    try {
      const improvedPrompt = this.improvePromptFromIssues(
        scene.visualDirection || scene.background?.source || `${scene.type} scene for ${scene.narration || 'video'}`,
        issues
      );
      
      console.log(`[Regen] Improved prompt (attempt ${attempt}): ${improvedPrompt.substring(0, 100)}...`);
      
      const aspectRatio = (project.outputFormat?.aspectRatio || '16:9') as '16:9' | '9:16' | '1:1';
      const videoResult = await aiVideoService.generateVideo({
        prompt: improvedPrompt,
        duration: Math.min(scene.duration || 5, 10),
        aspectRatio,
        sceneType: scene.type,
        negativePrompt: this.buildNegativePrompt(issues),
      });
      
      if (!videoResult.success || !videoResult.s3Url) {
        if (attempt < this.maxRetries) {
          console.log(`[Regen] Attempt ${attempt} failed, retrying...`);
          return this.regenerateScene(scene, project, issues, sceneIndex, attempt + 1);
        }
        
        return {
          success: false,
          sceneId: scene.id,
          sceneIndex,
          error: videoResult.error || 'Video generation failed after retries',
          attempt,
        };
      }
      
      const analysis = await sceneAnalysisService.analyzeScene(videoResult.s3Url, {
        sceneType: scene.type,
        narration: scene.narration || '',
        hasTextOverlays: (scene.textOverlays?.length || 0) > 0,
        hasProductOverlay: scene.assets?.useProductOverlay || false,
      });
      
      const instructions = compositionInstructionsService.generateInstructions(
        scene.id,
        scene.textOverlays || [],
        analysis,
        {
          useProductOverlay: scene.assets?.useProductOverlay,
          sceneType: scene.type,
          sceneDuration: scene.duration,
        }
      );
      
      console.log(`[Regen] Scene ${sceneIndex + 1} regenerated successfully`);
      
      return {
        success: true,
        sceneId: scene.id,
        sceneIndex,
        newVideoUrl: videoResult.s3Url,
        newAnalysis: analysis,
        newInstructions: instructions,
        attempt,
      };
      
    } catch (error: any) {
      console.error(`[Regen] Scene regeneration failed:`, error.message);
      
      if (attempt < this.maxRetries) {
        console.log(`[Regen] Attempt ${attempt} threw error, retrying...`);
        return this.regenerateScene(scene, project, issues, sceneIndex, attempt + 1);
      }
      
      return {
        success: false,
        sceneId: scene.id,
        sceneIndex,
        error: error.message,
        attempt,
      };
    }
  }

  private improvePromptFromIssues(originalPrompt: string, issues: QualityIssue[]): string {
    let improved = originalPrompt;
    const additions: string[] = [];
    
    for (const issue of issues) {
      switch (issue.type) {
        case 'text-overlap':
        case 'face-blocked':
          additions.push('Leave clear space in the lower third for text overlays.');
          additions.push('Position main subjects in the upper portion of the frame.');
          break;
          
        case 'poor-visibility':
          additions.push('Use high contrast lighting with clean, uncluttered backgrounds.');
          additions.push('Ensure good exposure and visibility.');
          break;
          
        case 'content-mismatch':
          improved = `IMPORTANT: Focus specifically on ${originalPrompt}. `;
          additions.push('Ensure the visual directly represents the described content.');
          break;
          
        case 'bad-composition':
          additions.push('Use professional cinematography with rule of thirds composition.');
          additions.push('Create balanced, visually appealing framing.');
          break;
          
        case 'technical':
          additions.push('Ensure sharp focus and high video quality.');
          additions.push('No artifacts, glitches, or distortions.');
          break;

        // Phase 4F: Brand-related issue handling
        case 'ai-text-detected':
          additions.push('CRITICAL: Generate only visual content with absolutely no text.');
          additions.push('Pure visual imagery only, no words or letters.');
          break;

        case 'ai-ui-detected':
          additions.push('No user interfaces, no calendars, no charts, no data displays.');
          additions.push('Natural scene only, no digital elements.');
          break;

        case 'off-brand-content':
          additions.push('Wellness and health focused content.');
          additions.push('Warm natural aesthetic, no corporate or finance imagery.');
          break;

        case 'missing-brand-element':
          // Missing elements are handled by overlay system, not regeneration
          break;
      }
    }
    
    const uniqueAdditions = [...new Set(additions)];
    if (uniqueAdditions.length > 0) {
      improved += ' ' + uniqueAdditions.join(' ');
    }
    
    return improved;
  }

  private buildNegativePrompt(issues: QualityIssue[]): string {
    const negatives: string[] = [
      'blurry', 'low quality', 'distorted', 'ugly', 'deformed',
      'text', 'watermark', 'logo', 'border', 'frame',
      'amateur', 'unprofessional',
    ];
    
    for (const issue of issues) {
      if (issue.type === 'poor-visibility') {
        negatives.push('dark', 'underexposed', 'overexposed', 'low contrast', 'shadowy');
      }
      if (issue.type === 'bad-composition') {
        negatives.push('cluttered', 'busy background', 'poorly framed', 'off-center');
      }
      if (issue.type === 'technical') {
        negatives.push('pixelated', 'noise', 'artifacts', 'compression');
      }
      // Phase 4F: Brand-related negative prompts
      if (issue.type === 'ai-text-detected') {
        negatives.push(
          'text', 'words', 'letters', 'writing', 'captions', 'labels',
          'signage', 'typography', 'font', 'readable text', 'gibberish text'
        );
      }
      if (issue.type === 'ai-ui-detected') {
        negatives.push(
          'user interface', 'UI elements', 'calendar', 'chart', 'graph',
          'spreadsheet', 'dashboard', 'app screen', 'digital display'
        );
      }
      if (issue.type === 'off-brand-content') {
        negatives.push(
          'corporate', 'finance', 'business graphics', 'office setting',
          'cold colors', 'sterile', 'industrial'
        );
      }
    }
    
    return [...new Set(negatives)].join(', ');
  }

  // ============================================================
  // PHASE 4F: REGENERATION STRATEGY
  // ============================================================

  /**
   * Determine regeneration strategy based on issue type
   */
  getRegenerationStrategy(issues: QualityIssue[]): {
    shouldRegenerate: boolean;
    strategy: string;
    promptModifications: string[];
  } {
    const promptModifications: string[] = [];
    let shouldRegenerate = false;
    let strategy = 'none';

    // Check for AI text - ALWAYS regenerate with stronger negative prompt
    const hasAIText = issues.some(i => i.type === 'ai-text-detected');
    if (hasAIText) {
      shouldRegenerate = true;
      strategy = 'regenerate-with-enhanced-negative-prompt';
      promptModifications.push(
        'CRITICAL: Generate only visual content with absolutely no text',
        'no words, no letters, no writing, no captions of any kind',
        'pure visual imagery only'
      );
    }

    // Check for AI UI elements - regenerate with content restrictions
    const hasAIUI = issues.some(i => i.type === 'ai-ui-detected');
    if (hasAIUI) {
      shouldRegenerate = true;
      strategy = hasAIText ? strategy : 'regenerate-with-content-restrictions';
      promptModifications.push(
        'no user interfaces, no calendars, no charts, no data displays',
        'natural scene only, no digital elements'
      );
    }

    // Check for off-brand content - regenerate with brand guidance
    const hasOffBrand = issues.some(i => i.type === 'off-brand-content');
    if (hasOffBrand) {
      shouldRegenerate = true;
      strategy = (hasAIText || hasAIUI) ? strategy : 'regenerate-with-brand-guidance';
      promptModifications.push(
        'wellness and health focused content',
        'warm natural aesthetic',
        'no corporate or finance imagery'
      );
    }

    // Check for critical composition issues
    const hasCriticalComposition = issues.some(
      i => i.severity === 'critical' && ['text-overlap', 'face-blocked', 'content-mismatch'].includes(i.type)
    );
    if (hasCriticalComposition && !shouldRegenerate) {
      shouldRegenerate = true;
      strategy = 'regenerate-with-composition-fixes';
    }

    console.log(`[Regen] Strategy: ${strategy}, Should regenerate: ${shouldRegenerate}`);
    if (promptModifications.length > 0) {
      console.log(`[Regen] Prompt modifications: ${promptModifications.length} additions`);
    }

    return {
      shouldRegenerate,
      strategy,
      promptModifications,
    };
  }

  getScenesNeedingRegeneration(
    sceneScores: SceneQualityScore[],
    maxScenes: number = 3
  ): SceneQualityScore[] {
    const failed = sceneScores.filter(s => s.needsRegeneration);
    
    failed.sort((a, b) => {
      const aCritical = a.issues.filter(i => i.severity === 'critical').length;
      const bCritical = b.issues.filter(i => i.severity === 'critical').length;
      if (aCritical !== bCritical) return bCritical - aCritical;
      return a.overallScore - b.overallScore;
    });
    
    return failed.slice(0, maxScenes);
  }
}

export const sceneRegenerationService = new SceneRegenerationService();
