// server/services/auto-regeneration-service.ts
// Phase 8B: Intelligent Auto-Regeneration

import { sceneAnalysisService, SceneContext } from './scene-analysis-service';
import { imageGenerationService } from './image-generation-service';
import { piapiVideoService } from './piapi-video-service';
import { intelligentPromptImprover, type SceneRequirements, type IssueContext } from './intelligent-prompt-improver';
import type { Phase8AnalysisResult, Phase8AnalysisIssue } from '../../shared/video-types';

export interface RegenerationAttempt {
  attemptNumber: number;
  timestamp: string;
  provider: string;
  prompt: string;
  result: 'success' | 'failed' | 'improved';
  scoreBefore: number;
  scoreAfter: number;
  analysisResult?: Phase8AnalysisResult;
}

export interface RegenerationResult {
  success: boolean;
  finalScore: number;
  attempts: RegenerationAttempt[];
  escalatedToUser: boolean;
  newAssetUrl?: string;
  newAnalysis?: Phase8AnalysisResult;
}

export interface SceneForRegeneration {
  id: string;
  sceneIndex: number;
  sceneType: string;
  contentType: string;
  narration: string;
  visualDirection: string;
  duration: number;
  currentProvider: string;
  currentAssetUrl?: string;
  analysisResult: Phase8AnalysisResult;
  projectId: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  totalScenes: number;
  qualityTier?: 'ultra' | 'premium' | 'standard';
  mediaMode?: 'image' | 'video';
  hasBrandAssets?: boolean;
  brandAssetTypes?: string[];
  generationType?: 'T2I' | 'T2V' | 'I2I' | 'I2V';
}

export interface ReviewQueueEntry {
  projectId: string;
  sceneId: string;
  sceneIndex: number;
  reason: string;
  attempts: RegenerationAttempt[];
  bestScore: number;
  createdAt: string;
  bestAssetUrl?: string;
}

const CONFIG = {
  maxAttempts: 3,
  minScoreToPass: 70,
  scoreImprovementThreshold: 10,
  providerFallbackOrder: {
    video: ['kling', 'luma', 'hailuo', 'runway'],
    image: ['flux', 'falai'],
  },
};

class AutoRegenerationService {
  private reviewQueue: ReviewQueueEntry[] = [];

  async regenerateScene(scene: SceneForRegeneration): Promise<RegenerationResult> {
    console.log(`[AutoRegen] Starting regeneration for scene ${scene.sceneIndex + 1}`);
    console.log(`[AutoRegen] Current score: ${scene.analysisResult.overallScore}`);
    
    const attempts: RegenerationAttempt[] = [];
    let currentAnalysis = scene.analysisResult;
    let currentScore = currentAnalysis.overallScore;
    let newAssetUrl: string | undefined;
    let bestAssetUrl: string | undefined = scene.currentAssetUrl;
    let bestScore = currentScore;
    
    for (let attempt = 1; attempt <= CONFIG.maxAttempts; attempt++) {
      console.log(`[AutoRegen] Attempt ${attempt}/${CONFIG.maxAttempts}`);
      
      const strategy = this.determineStrategy(attempt, currentAnalysis, scene);
      
      console.log(`[AutoRegen] Strategy: ${strategy.approach}`);
      console.log(`[AutoRegen] Provider: ${strategy.provider}`);
      
      const improvedPrompt = await this.improvePromptIntelligent(
        scene,
        currentAnalysis,
        attempt
      );
      
      console.log(`[AutoRegen] Improved prompt: ${improvedPrompt.substring(0, 100)}...`);
      
      const generationResult = await this.generateAsset(
        scene,
        strategy.provider,
        improvedPrompt
      );
      
      if (!generationResult.success || !generationResult.url) {
        attempts.push({
          attemptNumber: attempt,
          timestamp: new Date().toISOString(),
          provider: strategy.provider,
          prompt: improvedPrompt,
          result: 'failed',
          scoreBefore: currentScore,
          scoreAfter: currentScore,
        });
        console.log(`[AutoRegen] Generation failed, continuing to next attempt`);
        continue;
      }
      
      const newAnalysis = await this.analyzeNewAsset(generationResult.url, scene);
      
      const scoreAfter = newAnalysis.overallScore;
      const improved = scoreAfter > currentScore;
      const passesThreshold = scoreAfter >= CONFIG.minScoreToPass;
      
      attempts.push({
        attemptNumber: attempt,
        timestamp: new Date().toISOString(),
        provider: strategy.provider,
        prompt: improvedPrompt,
        result: passesThreshold ? 'success' : (improved ? 'improved' : 'failed'),
        scoreBefore: currentScore,
        scoreAfter: scoreAfter,
        analysisResult: newAnalysis,
      });
      
      if (scoreAfter > bestScore) {
        bestScore = scoreAfter;
        bestAssetUrl = generationResult.url;
      }
      
      if (passesThreshold) {
        console.log(`[AutoRegen] Success! Score improved to ${scoreAfter}`);
        return {
          success: true,
          finalScore: scoreAfter,
          attempts,
          escalatedToUser: false,
          newAssetUrl: generationResult.url,
          newAnalysis,
        };
      }
      
      if (improved) {
        currentScore = scoreAfter;
        currentAnalysis = newAnalysis;
        newAssetUrl = generationResult.url;
        console.log(`[AutoRegen] Improved to ${scoreAfter}, continuing...`);
      } else {
        console.log(`[AutoRegen] No improvement (${scoreAfter}), trying different approach...`);
      }
    }
    
    console.log(`[AutoRegen] Exhausted attempts, escalating to user review`);
    console.log(`[AutoRegen] Best score achieved: ${bestScore}`);
    
    return {
      success: false,
      finalScore: bestScore,
      attempts,
      escalatedToUser: true,
      newAssetUrl: bestAssetUrl,
      newAnalysis: currentAnalysis,
    };
  }

  private determineStrategy(
    attempt: number,
    analysis: Phase8AnalysisResult,
    scene: SceneForRegeneration
  ): { approach: string; provider: string } {
    const isVideo = this.isVideoScene(scene);
    
    let providerOrder: string[];
    
    if (isVideo) {
      providerOrder = CONFIG.providerFallbackOrder.video;
    } else {
      providerOrder = CONFIG.providerFallbackOrder.image;
    }
    
    if (attempt === 1) {
      const provider = scene.currentProvider || providerOrder[0];
      return {
        approach: 'improved_prompt_same_provider',
        provider,
      };
    }
    
    if (attempt === 2) {
      const newProvider = this.selectAlternateProvider(scene.currentProvider, providerOrder);
      return {
        approach: 'alternate_provider',
        provider: newProvider,
      };
    }
    
    if (attempt === 3) {
      const bestProvider = this.selectBestProviderForContent(scene.contentType, providerOrder);
      return {
        approach: 'best_provider_modified_prompt',
        provider: bestProvider,
      };
    }
    
    return {
      approach: 'fallback',
      provider: providerOrder[0],
    };
  }

  private isVideoScene(scene: SceneForRegeneration): boolean {
    if (scene.mediaMode === 'video') {
      console.log(`[AutoRegen] User selected VIDEO mode for scene ${scene.sceneIndex + 1} - using video`);
      return true;
    }
    // Default to image mode when mediaMode is not explicitly 'video'
    console.log(`[AutoRegen] IMAGE mode (${scene.mediaMode || 'default'}) for scene ${scene.sceneIndex + 1} - using image`);
    return false;
  }

  private selectAlternateProvider(
    currentProvider: string,
    providerOrder: string[]
  ): string {
    for (const provider of providerOrder) {
      if (provider.toLowerCase() !== currentProvider?.toLowerCase()) {
        return provider;
      }
    }
    return providerOrder[0];
  }

  private selectBestProviderForContent(
    contentType: string,
    providerOrder: string[]
  ): string {
    const contentProviderMap: Record<string, string> = {
      'person': 'kling',
      'lifestyle': 'kling',
      'product': 'luma',
      'nature': 'hailuo',
      'cinematic': 'runway',
      'food': 'flux',
      'object': 'flux',
      'wellness': 'kling',
      'farm': 'hailuo',
    };
    
    const preferred = contentProviderMap[contentType?.toLowerCase()];
    if (preferred && providerOrder.includes(preferred)) {
      return preferred;
    }
    
    return providerOrder[0];
  }

  private async improvePromptIntelligent(
    scene: SceneForRegeneration,
    analysis: Phase8AnalysisResult,
    attempt: number
  ): Promise<string> {
    if (intelligentPromptImprover.isAvailable() && attempt === 1) {
      try {
        const sceneReqs: SceneRequirements = {
          sceneIndex: scene.sceneIndex,
          sceneType: scene.sceneType,
          narration: scene.narration,
          originalPrompt: scene.visualDirection,
          hasBrandAssets: scene.hasBrandAssets || false,
          brandAssetTypes: scene.brandAssetTypes,
          generationType: scene.generationType || (this.isVideoScene(scene) ? 'T2V' : 'T2I'),
          qualityTier: scene.qualityTier || 'standard',
          aspectRatio: scene.aspectRatio,
        };

        const issueContext: IssueContext = {
          issues: analysis.issues || [],
          overallScore: analysis.overallScore,
          scores: {
            technical: analysis.technicalScore ?? 70,
            contentMatch: analysis.contentMatchScore ?? 70,
            composition: analysis.compositionScore ?? 70,
          },
        };

        const result = await intelligentPromptImprover.improvePrompt(sceneReqs, issueContext);
        
        if (result.improvedPrompt && result.confidence > 0.5) {
          console.log(`[AutoRegen] Using intelligent prompt improvement (${result.promptStrategy})`);
          console.log(`[AutoRegen] Key changes: ${result.keyChanges.join(', ')}`);
          return result.improvedPrompt;
        }
      } catch (error: any) {
        console.error(`[AutoRegen] Intelligent prompt improvement failed: ${error.message}`);
      }
    }

    return this.improvePromptBasic(scene.visualDirection, analysis, attempt);
  }

  private improvePromptBasic(
    originalPrompt: string,
    analysis: Phase8AnalysisResult,
    attempt: number
  ): string {
    let improvedPrompt = originalPrompt;
    
    if (analysis.improvedPrompt && attempt === 1) {
      improvedPrompt = analysis.improvedPrompt;
    }
    
    const fixes: string[] = [];
    
    for (const issue of analysis.issues || []) {
      switch (issue.category) {
        case 'ai_artifacts':
          fixes.push('photorealistic, no text overlays, no UI elements, clean image');
          break;
          
        case 'content_match':
          fixes.push('focus on the main subject clearly visible');
          break;
          
        case 'brand_compliance':
          if (issue.description.toLowerCase().includes('lighting')) {
            fixes.push('warm golden natural lighting, soft shadows');
          }
          if (issue.description.toLowerCase().includes('color')) {
            fixes.push('earth tones, warm browns and greens, natural palette');
          }
          if (issue.description.toLowerCase().includes('clinical') || 
              issue.description.toLowerCase().includes('corporate')) {
            fixes.push('cozy home environment, natural textures, organic materials');
          }
          break;
          
        case 'technical':
          fixes.push('high resolution, sharp focus, professional quality');
          break;
          
        case 'composition':
          fixes.push('balanced composition, clear subject, uncluttered background');
          break;
      }
    }
    
    if (attempt >= 2) {
      fixes.push('simple composition, single clear subject');
    }
    
    if (attempt >= 3) {
      fixes.push('minimalist, clean, professional photography style');
    }
    
    const uniqueFixes = Array.from(new Set(fixes));
    if (uniqueFixes.length > 0) {
      improvedPrompt = `${improvedPrompt}. ${uniqueFixes.join(', ')}`;
    }
    
    improvedPrompt = `${improvedPrompt}. Avoid: garbled text, fake UI, distorted features, cold clinical lighting, blue/gray tones`;
    
    return improvedPrompt;
  }

  private async generateAsset(
    scene: SceneForRegeneration,
    provider: string,
    prompt: string
  ): Promise<{ success: boolean; url?: string }> {
    const isVideo = this.isVideoScene(scene);
    
    try {
      if (isVideo) {
        return this.generateVideo(provider, prompt, scene);
      } else {
        return this.generateImage(provider, prompt, scene);
      }
    } catch (error: any) {
      console.error(`[AutoRegen] Generation failed:`, error.message);
      return { success: false };
    }
  }

  private async generateVideo(
    provider: string,
    prompt: string,
    scene: SceneForRegeneration
  ): Promise<{ success: boolean; url?: string }> {
    const aspectRatio = scene.aspectRatio || '16:9';
    const duration = Math.min(scene.duration || 5, 10);
    
    try {
      const result = await piapiVideoService.generateVideo({
        prompt,
        duration,
        aspectRatio,
        model: provider,
        negativePrompt: 'blurry, low quality, distorted, garbled text, fake UI, clinical lighting',
      });
      
      return {
        success: result.success,
        url: result.s3Url || result.videoUrl,
      };
    } catch (error: any) {
      console.error(`[AutoRegen] Video generation failed:`, error.message);
      return { success: false };
    }
  }

  private async generateImage(
    provider: string,
    prompt: string,
    scene: SceneForRegeneration
  ): Promise<{ success: boolean; url?: string }> {
    try {
      const dimensions = this.getDimensionsForAspectRatio(scene.aspectRatio || '16:9');
      
      const result = await imageGenerationService.generateImage({
        prompt,
        provider: provider as 'flux' | 'falai',
        width: dimensions.width,
        height: dimensions.height,
        negativePrompt: 'blurry, low quality, distorted, garbled text, fake UI, clinical lighting',
      });
      
      if (result.url && !result.url.startsWith('placeholder:') && !result.url.startsWith('pending:')) {
        return { success: true, url: result.url };
      }
      
      return { success: false };
    } catch (error: any) {
      console.error(`[AutoRegen] Image generation failed:`, error.message);
      return { success: false };
    }
  }

  private getDimensionsForAspectRatio(aspectRatio: string): { width: number; height: number } {
    switch (aspectRatio) {
      case '9:16':
        return { width: 720, height: 1280 };
      case '1:1':
        return { width: 1024, height: 1024 };
      case '16:9':
      default:
        return { width: 1280, height: 720 };
    }
  }

  private async analyzeNewAsset(
    assetUrl: string,
    scene: SceneForRegeneration
  ): Promise<Phase8AnalysisResult> {
    try {
      const imageBase64 = await this.fetchAsBase64(assetUrl);
      
      const context: SceneContext = {
        sceneIndex: scene.sceneIndex,
        sceneType: scene.sceneType,
        narration: scene.narration,
        visualDirection: scene.visualDirection,
        expectedContentType: scene.contentType,
        totalScenes: scene.totalScenes || 1,
      };
      
      return await sceneAnalysisService.analyzeScenePhase8(imageBase64, context);
    } catch (error: any) {
      console.error(`[AutoRegen] Analysis failed:`, error.message);
      return {
        sceneIndex: scene.sceneIndex,
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
          description: `Analysis failed: ${error.message}`,
          suggestion: 'Retry analysis',
        }],
        recommendation: 'critical_fail',
        analysisTimestamp: new Date().toISOString(),
        analysisModel: 'error',
      };
    }
  }

  private async fetchAsBase64(url: string): Promise<string> {
    let fullUrl = url;
    
    if (url.startsWith('/objects') || url.startsWith('/')) {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'http://localhost:5000';
      fullUrl = `${baseUrl}${url}`;
    }
    
    const response = await fetch(fullUrl, {
      headers: { 'Accept': 'image/*' },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('base64');
  }

  async escalateToUserReview(
    scene: SceneForRegeneration,
    regenerationResult: RegenerationResult
  ): Promise<void> {
    console.log(`[AutoRegen] Escalating scene ${scene.sceneIndex + 1} to user review queue`);
    
    const entry: ReviewQueueEntry = {
      projectId: scene.projectId,
      sceneId: scene.id,
      sceneIndex: scene.sceneIndex,
      reason: 'auto_regeneration_failed',
      attempts: regenerationResult.attempts,
      bestScore: regenerationResult.finalScore,
      createdAt: new Date().toISOString(),
      bestAssetUrl: regenerationResult.newAssetUrl,
    };
    
    this.reviewQueue.push(entry);
    console.log(`[AutoRegen] Review queue entry created. Queue size: ${this.reviewQueue.length}`);
  }

  getReviewQueue(projectId?: string): ReviewQueueEntry[] {
    if (projectId) {
      return this.reviewQueue.filter(e => e.projectId === projectId);
    }
    return [...this.reviewQueue];
  }

  clearReviewQueueEntry(projectId: string, sceneId: string): boolean {
    const index = this.reviewQueue.findIndex(
      e => e.projectId === projectId && e.sceneId === sceneId
    );
    
    if (index >= 0) {
      this.reviewQueue.splice(index, 1);
      return true;
    }
    return false;
  }

  async regenerateAllFailedScenes(
    scenes: SceneForRegeneration[]
  ): Promise<{ results: RegenerationResult[]; escalated: number; succeeded: number }> {
    const results: RegenerationResult[] = [];
    let escalated = 0;
    let succeeded = 0;
    
    for (const scene of scenes) {
      if (scene.analysisResult.recommendation === 'regenerate' || 
          scene.analysisResult.recommendation === 'critical_fail' ||
          scene.analysisResult.overallScore < CONFIG.minScoreToPass) {
        
        console.log(`[AutoRegen] Processing scene ${scene.sceneIndex + 1} (score: ${scene.analysisResult.overallScore})`);
        
        const result = await this.regenerateScene(scene);
        results.push(result);
        
        if (result.success) {
          succeeded++;
        } else if (result.escalatedToUser) {
          escalated++;
          await this.escalateToUserReview(scene, result);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`[AutoRegen] Batch complete: ${succeeded} succeeded, ${escalated} escalated`);
    return { results, escalated, succeeded };
  }

  getConfig() {
    return { ...CONFIG };
  }
}

export const autoRegenerationService = new AutoRegenerationService();
