import { db } from '../db';
import { sceneRegenerationHistory, InsertSceneRegenerationHistory } from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';
import { regenerationStrategyEngine, RegenerationStrategy, RegenerationAttempt, StrategyContext } from './regeneration-strategy-engine';
import { promptComplexityAnalyzer } from './prompt-complexity-analyzer';
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
  strategy: RegenerationStrategy;
  usedStockFootage?: boolean;
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

class IntelligentRegenerationService {
  
  async regenerateScene(
    scene: SceneData,
    project: ProjectData,
    issues: QualityIssue[],
    sceneIndex: number
  ): Promise<RegenerationResult> {
    console.log(`[IntelligentRegen] Starting intelligent regeneration for scene ${sceneIndex + 1}`);
    
    const priorAttempts = await this.getPriorAttempts(scene.id);
    const currentPrompt = scene.visualDirection || 
      scene.background?.source || 
      `${scene.type} scene for ${scene.narration || 'video'}`;
    
    const complexity = promptComplexityAnalyzer.analyze(currentPrompt);
    
    const context: StrategyContext = {
      sceneId: scene.id,
      attempts: priorAttempts,
      complexity,
      currentPrompt,
      originalPrompt: currentPrompt,
      currentMediaUrl: scene.assets?.videoUrl,
    };
    
    const strategy = regenerationStrategyEngine.determineStrategy(context);
    console.log(`[IntelligentRegen] Strategy: ${strategy.approach}, Confidence: ${strategy.confidenceScore.toFixed(2)}`);
    console.log(`[IntelligentRegen] Reasoning: ${strategy.reasoning}`);
    
    if (strategy.approach === 'stock-footage') {
      await this.recordAttempt(scene.id, project.id, priorAttempts.length + 1, {
        provider: 'stock-footage',
        strategy: 'stock-footage',
        prompt: currentPrompt,
        result: 'recommendation',
        reasoning: strategy.reasoning,
        confidenceScore: strategy.confidenceScore,
      });
      
      return {
        success: false,
        sceneId: scene.id,
        sceneIndex,
        error: strategy.warning || 'AI generation unsuitable. Stock footage recommended.',
        attempt: priorAttempts.length + 1,
        strategy,
        usedStockFootage: true,
      };
    }
    
    const result = await this.executeStrategy(scene, project, strategy, issues, sceneIndex, priorAttempts.length + 1);
    
    await this.recordAttempt(scene.id, project.id, priorAttempts.length + 1, {
      provider: strategy.changes.provider || 'kling-2.5-turbo',
      strategy: strategy.approach,
      prompt: strategy.changes.prompt || currentPrompt,
      result: result.success ? 'success' : 'failure',
      qualityScore: undefined,
      issues: issues.map(i => `[${i.severity}] ${i.description}`).join('; '),
      reasoning: strategy.reasoning,
      confidenceScore: strategy.confidenceScore,
    });
    
    return result;
  }
  
  async regenerateFailedScenes(
    project: ProjectData,
    failedScenes: SceneQualityScore[]
  ): Promise<RegenerationResult[]> {
    console.log(`[IntelligentRegen] Processing ${failedScenes.length} failed scenes...`);
    
    const results: RegenerationResult[] = [];
    
    for (const failedScene of failedScenes) {
      const scene = project.scenes[failedScene.sceneIndex];
      if (!scene) continue;
      
      const result = await this.regenerateScene(
        scene,
        project,
        failedScene.issues,
        failedScene.sceneIndex
      );
      
      results.push(result);
      
      if (!result.success && !result.usedStockFootage) {
        console.log(`[IntelligentRegen] Scene ${failedScene.sceneIndex + 1} failed, retrying with next strategy...`);
      }
    }
    
    return results;
  }
  
  private async executeStrategy(
    scene: SceneData,
    project: ProjectData,
    strategy: RegenerationStrategy,
    issues: QualityIssue[],
    sceneIndex: number,
    attemptNumber: number
  ): Promise<RegenerationResult> {
    try {
      const prompt = this.buildPrompt(strategy, scene, issues);
      const provider = strategy.changes.provider || 'kling-2.5-turbo';
      
      console.log(`[IntelligentRegen] Executing ${strategy.approach} with provider ${provider}`);
      console.log(`[IntelligentRegen] Prompt: ${prompt.substring(0, 100)}...`);
      
      const aspectRatio = (project.outputFormat?.aspectRatio || '16:9') as '16:9' | '9:16' | '1:1';
      
      const videoResult = await aiVideoService.generateVideo({
        prompt,
        duration: Math.min(scene.duration || 5, 10),
        aspectRatio,
        sceneType: scene.type,
        negativePrompt: this.buildNegativePrompt(issues),
        preferredProvider: provider,
        imageUrl: strategy.changes.useReference ? strategy.changes.referenceUrl : undefined,
      });
      
      if (!videoResult.success || !videoResult.s3Url) {
        return {
          success: false,
          sceneId: scene.id,
          sceneIndex,
          error: videoResult.error || 'Video generation failed',
          attempt: attemptNumber,
          strategy,
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
      
      console.log(`[IntelligentRegen] Scene ${sceneIndex + 1} regenerated successfully`);
      
      return {
        success: true,
        sceneId: scene.id,
        sceneIndex,
        newVideoUrl: videoResult.s3Url,
        newAnalysis: analysis,
        newInstructions: instructions,
        attempt: attemptNumber,
        strategy,
      };
      
    } catch (error: any) {
      console.error(`[IntelligentRegen] Execution failed:`, error.message);
      return {
        success: false,
        sceneId: scene.id,
        sceneIndex,
        error: error.message,
        attempt: attemptNumber,
        strategy,
      };
    }
  }
  
  private buildPrompt(strategy: RegenerationStrategy, scene: SceneData, issues: QualityIssue[]): string {
    const base = strategy.changes.prompt || 
      scene.visualDirection || 
      scene.background?.source || 
      `${scene.type} scene`;
    
    const additions: string[] = [];
    
    for (const issue of issues) {
      if (issue.type === 'text-overlap' || issue.type === 'face-blocked') {
        additions.push('Leave clear space in the lower third for text overlays.');
      }
      if (issue.type === 'poor-visibility') {
        additions.push('Use high contrast lighting with clean backgrounds.');
      }
      if (issue.type === 'ai-text-detected') {
        additions.push('CRITICAL: Generate only visual content with absolutely no text.');
      }
      if (issue.type === 'ai-ui-detected') {
        additions.push('No user interfaces, no calendars, no charts, no data displays.');
      }
      if (issue.type === 'off-brand-content') {
        additions.push('Wellness and health focused content with warm natural aesthetic.');
      }
    }
    
    const uniqueAdditions = Array.from(new Set(additions));
    return uniqueAdditions.length > 0 ? `${base} ${uniqueAdditions.join(' ')}` : base;
  }
  
  private buildNegativePrompt(issues: QualityIssue[]): string {
    const negatives: string[] = [
      'blurry', 'low quality', 'distorted', 'ugly', 'deformed',
      'text', 'watermark', 'logo', 'border', 'frame',
      'amateur', 'unprofessional',
    ];
    
    for (const issue of issues) {
      if (issue.type === 'poor-visibility') {
        negatives.push('dark', 'underexposed', 'overexposed', 'low contrast');
      }
      if (issue.type === 'bad-composition') {
        negatives.push('cluttered', 'busy background', 'poorly framed');
      }
      if (issue.type === 'technical') {
        negatives.push('pixelated', 'noise', 'artifacts', 'compression');
      }
      if (issue.type === 'ai-text-detected') {
        negatives.push('words', 'letters', 'writing', 'captions', 'labels', 'typography');
      }
      if (issue.type === 'ai-ui-detected') {
        negatives.push('user interface', 'UI elements', 'calendar', 'chart', 'graph', 'dashboard');
      }
      if (issue.type === 'off-brand-content') {
        negatives.push('corporate', 'finance', 'cold colors', 'sterile', 'industrial');
      }
    }
    
    return Array.from(new Set(negatives)).join(', ');
  }
  
  private async getPriorAttempts(sceneId: string): Promise<RegenerationAttempt[]> {
    try {
      const history = await db
        .select()
        .from(sceneRegenerationHistory)
        .where(eq(sceneRegenerationHistory.sceneId, sceneId))
        .orderBy(desc(sceneRegenerationHistory.createdAt))
        .limit(10);
      
      return history.map(h => ({
        attemptNumber: h.attemptNumber,
        timestamp: h.createdAt || new Date(),
        provider: h.provider,
        prompt: h.prompt || '',
        result: h.result as 'success' | 'failure' | 'partial',
        qualityScore: h.qualityScore ? parseFloat(h.qualityScore) : undefined,
        issues: h.issues ? h.issues.split('; ') : [],
      }));
    } catch (error) {
      console.error('[IntelligentRegen] Error fetching prior attempts:', error);
      return [];
    }
  }
  
  private async recordAttempt(
    sceneId: string,
    projectId: string | undefined,
    attemptNumber: number,
    data: {
      provider: string;
      strategy: string;
      prompt: string;
      result: string;
      qualityScore?: number;
      issues?: string;
      reasoning?: string;
      confidenceScore?: number;
    }
  ): Promise<void> {
    try {
      const record: InsertSceneRegenerationHistory = {
        sceneId,
        projectId: projectId || null,
        attemptNumber,
        provider: data.provider,
        strategy: data.strategy,
        prompt: data.prompt,
        result: data.result,
        qualityScore: data.qualityScore?.toFixed(2),
        issues: data.issues,
        reasoning: data.reasoning,
        confidenceScore: data.confidenceScore?.toFixed(2),
      };
      
      await db.insert(sceneRegenerationHistory).values(record);
      console.log(`[IntelligentRegen] Recorded attempt #${attemptNumber} for scene ${sceneId}`);
    } catch (error) {
      console.error('[IntelligentRegen] Error recording attempt:', error);
    }
  }
  
  async getSceneHistory(sceneId: string, projectId?: string): Promise<RegenerationAttempt[]> {
    try {
      const conditions = [eq(sceneRegenerationHistory.sceneId, sceneId)];
      if (projectId) {
        conditions.push(eq(sceneRegenerationHistory.projectId, projectId));
      }
      
      const history = await db
        .select()
        .from(sceneRegenerationHistory)
        .where(and(...conditions))
        .orderBy(desc(sceneRegenerationHistory.createdAt))
        .limit(20);
      
      return history.map(h => ({
        attemptNumber: h.attemptNumber,
        timestamp: h.createdAt || new Date(),
        provider: h.provider,
        prompt: h.prompt || '',
        result: h.result as 'success' | 'failure' | 'partial',
        qualityScore: h.qualityScore ? parseFloat(h.qualityScore) : undefined,
        issues: h.issues ? h.issues.split('; ') : [],
      }));
    } catch (error) {
      console.error('[IntelligentRegen] Error fetching scene history:', error);
      return [];
    }
  }
  
  async clearSceneHistory(sceneId: string): Promise<void> {
    try {
      await db
        .delete(sceneRegenerationHistory)
        .where(eq(sceneRegenerationHistory.sceneId, sceneId));
      console.log(`[IntelligentRegen] Cleared history for scene ${sceneId}`);
    } catch (error) {
      console.error('[IntelligentRegen] Error clearing history:', error);
    }
  }
  
  /**
   * Public method to record video regeneration attempts from the video generation worker.
   * This handles attempt numbering automatically and stores the result in the database.
   */
  async recordVideoAttempt(params: {
    sceneId: string;
    projectId: string;
    provider: string;
    prompt: string;
    result: 'success' | 'failure';
    videoUrl?: string;
    errorMessage?: string;
    sourceImageUrl?: string;
  }): Promise<void> {
    try {
      // Get prior attempts for this scene to determine attempt number
      const priorAttempts = await this.getPriorAttempts(params.sceneId);
      const attemptNumber = priorAttempts.length + 1;
      
      // Determine strategy based on whether this was I2V or T2V
      const strategy = params.sourceImageUrl ? 'i2v' : 't2v';
      
      await this.recordAttempt(
        params.sceneId,
        params.projectId,
        attemptNumber,
        {
          provider: params.provider,
          strategy,
          prompt: params.prompt,
          result: params.result,
          reasoning: params.result === 'success' 
            ? `Video generated via ${params.provider}${params.sourceImageUrl ? ' (Image-to-Video)' : ''}` 
            : params.errorMessage || 'Generation failed',
        }
      );
      
      console.log(`[IntelligentRegen] Recorded video attempt #${attemptNumber} for scene ${params.sceneId}: ${params.result}`);
    } catch (error) {
      console.error('[IntelligentRegen] Error recording video attempt:', error);
    }
  }
}

export const intelligentRegenerationService = new IntelligentRegenerationService();
