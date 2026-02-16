import Anthropic from '@anthropic-ai/sdk';
import { videoFrameExtractor } from './video-frame-extractor';
import { brandContextService } from './brand-context-service';
import { projectInstructionsService } from './project-instructions-service';
import { createLogger } from '../utils/logger';

const log = createLogger('QualityEval');

export interface QualityIssue {
  type: 
    | 'text-overlap' 
    | 'face-blocked' 
    | 'poor-visibility' 
    | 'bad-composition' 
    | 'technical' 
    | 'content-mismatch'
    | 'ai-text-detected'      // Garbled AI text (Phase 4F)
    | 'ai-ui-detected'        // Fake UI elements (Phase 4F)
    | 'off-brand-content'     // Content doesn't match brand (Phase 4F)
    | 'missing-brand-element' // Expected brand element missing (Phase 4F)
    | 'wrong-framing'         // Shot type doesn't match expected (Phase 10B)
    | 'missing-text-overlay'; // Expected text overlay not visible (Phase 10B)
  severity: 'critical' | 'major' | 'minor';
  description: string;
  timestamp?: number;
  sceneIndex?: number;
  examples?: string[];  // Specific examples found (Phase 4F)
}

export interface SceneQualityScore {
  sceneId: string;
  sceneIndex: number;
  overallScore: number;
  scores: {
    composition: number;
    visibility: number;
    technicalQuality: number;
    contentMatch: number;
    professionalLook: number;
    framingMatch?: number;  // Phase 10B: Shot type validation score
  };
  // Phase 10B: Text overlay verification
  textOverlayCheck?: {
    expectedVisible: boolean;
    actuallyVisible: boolean;
    textReadable: boolean;
  };
  // Phase 10B: Framing validation
  framingCheck?: {
    expectedType: string;
    actualType: string;
    matches: boolean;
  };
  issues: QualityIssue[];
  passesThreshold: boolean;
  needsRegeneration: boolean;
}

export interface VideoQualityReport {
  projectId: string;
  overallScore: number;
  passesQuality: boolean;
  sceneScores: SceneQualityScore[];
  criticalIssues: QualityIssue[];
  recommendations: string[];
  evaluatedAt: string;
}

export interface ComprehensiveQualityResult {
  overallScore: number;
  scores: {
    technical: number;
    composition: number;
    aiArtifacts: number;
    brand: {
      total: number;
      lighting: number;
      colors: number;
      setting: number;
      authenticity: number;
    };
  };
  issues: QualityIssue[];
  recommendation: 'pass' | 'adjust' | 'regenerate';
  brandAssessment: {
    overallAssessment: 'on-brand' | 'needs-adjustment' | 'off-brand';
    lightingAssessment: 'warm' | 'neutral' | 'cold';
    colorAssessment: 'earth tones' | 'neutral' | 'cold tones';
    settingAssessment: 'natural' | 'neutral' | 'clinical';
    authenticityAssessment: 'authentic' | 'generic' | 'artificial';
  };
  suggestedImprovements: string[];
}

class QualityEvaluationService {
  private anthropic: Anthropic | null = null;
  private qualityThreshold = 70;

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

  async evaluateVideo(
    videoUrl: string,
    projectData: {
      projectId: string;
      scenes: Array<{
        id: string;
        type: string;
        narration: string;
        duration: number;
        textOverlays?: Array<{ text: string }>;
        shotType?: string;  // Phase 10B: Expected shot type for framing validation
        expectedShotType?: string;  // Alias for shotType
        visualDirection?: string;  // The visual direction prompt for context-aware evaluation
      }>;
    }
  ): Promise<VideoQualityReport> {
    log.debug(` Starting evaluation for project ${projectData.projectId}`);
    
    if (!this.anthropic) {
      log.warn(` Anthropic not configured, using default scores`);
      return this.getDefaultReport(projectData.projectId, projectData.scenes);
    }
    
    const sceneScores: SceneQualityScore[] = [];
    const allIssues: QualityIssue[] = [];
    
    let currentTime = 0;
    
    for (let i = 0; i < projectData.scenes.length; i++) {
      const scene = projectData.scenes[i];
      
      const frameTime = currentTime + (scene.duration / 2);
      log.debug(` Evaluating scene ${i + 1} at ${frameTime.toFixed(1)}s...`);
      
      const frameData = await videoFrameExtractor.extractFrameAsBase64(videoUrl, frameTime);
      
      if (frameData) {
        // Phase 10B: Pass expectedShotType to evaluation
        const sceneWithShotType = {
          ...scene,
          expectedShotType: scene.expectedShotType || scene.shotType,
        };
        const evaluation = await this.evaluateFrame(frameData.base64, sceneWithShotType, i);
        sceneScores.push(evaluation);
        allIssues.push(...evaluation.issues);
      } else {
        sceneScores.push(this.getPlaceholderScore(scene.id, i));
      }
      
      currentTime += scene.duration;
    }
    
    const overallScore = sceneScores.length > 0
      ? Math.round(sceneScores.reduce((sum, s) => sum + s.overallScore, 0) / sceneScores.length)
      : 0;
    
    const criticalIssues = allIssues.filter(i => i.severity === 'critical');
    const passesQuality = overallScore >= this.qualityThreshold && criticalIssues.length === 0;
    
    const report: VideoQualityReport = {
      projectId: projectData.projectId,
      overallScore,
      passesQuality,
      sceneScores,
      criticalIssues,
      recommendations: this.generateRecommendations(sceneScores, allIssues),
      evaluatedAt: new Date().toISOString(),
    };
    
    log.debug(` Complete: Score ${overallScore}/100, ${passesQuality ? 'PASSED' : 'NEEDS REVIEW'}`);
    
    return report;
  }

  private async evaluateFrame(
    base64Image: string,
    scene: {
      id: string;
      type: string;
      narration: string;
      textOverlays?: Array<{ text: string }>;
      expectedShotType?: string;  // Phase 10B: Expected shot type for framing validation
      visualDirection?: string;  // The visual direction prompt for context-aware evaluation
    },
    sceneIndex: number
  ): Promise<SceneQualityScore> {
    if (!this.anthropic) {
      return this.getPlaceholderScore(scene.id, sceneIndex);
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: this.buildEvaluationPrompt(scene),
              },
            ],
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      return this.parseEvaluationResponse(content.text, scene.id, sceneIndex);

    } catch (error: any) {
      log.error(`[QualityEval] Frame evaluation failed:`, error.message);
      return this.getPlaceholderScore(scene.id, sceneIndex);
    }
  }

  private buildEvaluationPrompt(scene: {
    type: string;
    narration: string;
    textOverlays?: Array<{ text: string }>;
    expectedShotType?: string;
    visualDirection?: string;
  }): string {
    const expectedText = scene.textOverlays?.map(t => t.text).join(', ') || 'None';
    const expectedShot = scene.expectedShotType || 'not specified';
    
    const visualDirectionSection = scene.visualDirection 
      ? `
VISUAL DIRECTION (PRIMARY REFERENCE - What this scene was designed to show):
"${scene.visualDirection}"

CRITICAL CONTEXT-AWARE RULE: The visual direction is the PRIMARY reference for what this scene SHOULD contain.
If the visual direction specifies a clinical/medical setting, waiting room, healthcare environment, 
fluorescent lighting, or cold atmosphere - these are INTENTIONAL creative choices for storytelling purposes
(e.g., showing the "problem" before introducing wellness solutions). 

Evaluation should check: Does the image MATCH what the visual direction requested?
- If visual direction says "clinical waiting room" and image shows clinical waiting room = HIGH score
- If visual direction says "looking at watch" and person IS looking at watch = HIGH score
- Do NOT penalize elements that were EXPLICITLY REQUESTED in the visual direction
`
      : '';
    
    return `Evaluate this video frame for broadcast quality using CONTEXT-AWARE content matching.
${visualDirectionSection}
SCENE CONTEXT:
- Scene type: ${scene.type}
- Expected narration topic: "${scene.narration.substring(0, 100)}..."
- Expected text overlays: ${expectedText}
- Expected shot type/framing: ${expectedShot}
${scene.visualDirection ? `- Visual Direction: "${scene.visualDirection.substring(0, 200)}..."` : ''}

=== CONTEXT-AWARE CONTENT MATCHING RULES ===

1. TEXT OVERLAY VERIFICATION:
   - If expected text overlays are specified, they MUST be visible in the frame
   - Score < 40 if expected text is missing entirely
   - Score < 50 if text is present but unreadable or garbled

2. FRAMING/SHOT TYPE VALIDATION:
   - close-up: Subject fills most of the frame (head/product occupies >50% of frame)
   - medium: Subject visible from waist up or product with context
   - wide: Full environment/scene visible, subject is small portion
   - aerial: Bird's eye or elevated perspective
   - product-shot: Product is the clear focal point, clean background
   - If actual framing doesn't match expected, score contentMatch < 50

3. CONTENT MATCH REQUIREMENTS (VISUAL DIRECTION FIRST):
   - PRIMARY: Does the image match the VISUAL DIRECTION? If yes, score HIGH
   - If visual direction specifies clinical/cold/waiting room settings, these are INTENTIONAL - score HIGH
   - SECONDARY: Does the visual relate to narration topic?
   - Only flag "wrong subject" if it contradicts BOTH visual direction AND narration

Rate each aspect 0-100:

{
  "scores": {
    "composition": <0-100 - Is the visual layout professional? Text placed well?>,
    "visibility": <0-100 - Is all text clearly readable? Good contrast?>,
    "technicalQuality": <0-100 - No blur, artifacts, good resolution?>,
    "contentMatch": <0-100 - Does visual match VISUAL DIRECTION first, then narration? If visual direction specifies clinical/cold settings and image shows them, score HIGH>,
    "professionalLook": <0-100 - Would this look good on TV?>,
    "framingMatch": <0-100 - Does shot type match expected framing?>
  },
  "textOverlayCheck": {
    "expectedVisible": true/false,
    "actuallyVisible": true/false,
    "textReadable": true/false
  },
  "framingCheck": {
    "expectedType": "${expectedShot}",
    "actualType": "detected shot type",
    "matches": true/false
  },
  "issues": [
    {
      "type": "text-overlap | face-blocked | poor-visibility | bad-composition | technical | content-mismatch | wrong-framing | missing-text-overlay",
      "severity": "critical | major | minor",
      "description": "Specific description of the issue"
    }
  ],
  "notes": "Brief overall assessment"
}

SCORING RULES:
- If visual direction is provided and image MATCHES it = contentMatch 80-100 (even if setting is clinical/cold)
- Missing expected text overlay = critical, contentMatch < 40
- Wrong framing (e.g., wide when close-up expected) = major, framingMatch < 50
- Content contradicts BOTH visual direction AND narration = critical, contentMatch < 30
- Text overlapping a face = critical, composition -= 30
- Text unreadable = critical, visibility < 40
- Poor image quality = major, technicalQuality -= 20
- Awkward composition = minor, composition -= 10

Return ONLY the JSON object.`;
  }

  private parseEvaluationResponse(
    text: string,
    sceneId: string,
    sceneIndex: number
  ): SceneQualityScore {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      const scores = {
        composition: parsed.scores?.composition || 70,
        visibility: parsed.scores?.visibility || 70,
        technicalQuality: parsed.scores?.technicalQuality || 70,
        contentMatch: parsed.scores?.contentMatch || 70,
        professionalLook: parsed.scores?.professionalLook || 70,
        framingMatch: parsed.scores?.framingMatch,  // Phase 10B
      };
      
      // Phase 10B: Include framingMatch in overall score if available
      const scoreValues = [scores.composition, scores.visibility, scores.technicalQuality, 
                          scores.contentMatch, scores.professionalLook];
      if (scores.framingMatch !== undefined) {
        scoreValues.push(scores.framingMatch);
      }
      const overallScore = Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length);
      
      const issues: QualityIssue[] = (parsed.issues || []).map((issue: any) => ({
        type: issue.type || 'technical',
        severity: issue.severity || 'minor',
        description: issue.description || 'Unknown issue',
        sceneIndex,
      }));
      
      // Phase 10B: Extract text overlay and framing checks
      const textOverlayCheck = parsed.textOverlayCheck ? {
        expectedVisible: !!parsed.textOverlayCheck.expectedVisible,
        actuallyVisible: !!parsed.textOverlayCheck.actuallyVisible,
        textReadable: !!parsed.textOverlayCheck.textReadable,
      } : undefined;
      
      const framingCheck = parsed.framingCheck ? {
        expectedType: parsed.framingCheck.expectedType || 'not specified',
        actualType: parsed.framingCheck.actualType || 'unknown',
        matches: !!parsed.framingCheck.matches,
      } : undefined;
      
      // Phase 10B: Add issues for failed checks
      if (textOverlayCheck && textOverlayCheck.expectedVisible && !textOverlayCheck.actuallyVisible) {
        issues.push({
          type: 'missing-text-overlay',
          severity: 'critical',
          description: 'Expected text overlay is not visible in the frame',
          sceneIndex,
        });
      }
      
      if (framingCheck && framingCheck.expectedType !== 'not specified' && !framingCheck.matches) {
        issues.push({
          type: 'wrong-framing',
          severity: 'major',
          description: `Wrong framing: expected ${framingCheck.expectedType}, got ${framingCheck.actualType}`,
          sceneIndex,
        });
      }
      
      const hasCriticalIssues = issues.some(i => i.severity === 'critical');
      
      // Phase 10B: Scenes with missing required elements score < 50 fail
      const hasFailingScore = overallScore < 50 || scores.contentMatch < 50 || 
                              (scores.framingMatch !== undefined && scores.framingMatch < 50);
      const passesThreshold = overallScore >= this.qualityThreshold && !hasCriticalIssues && !hasFailingScore;
      
      log.debug(` Scene ${sceneIndex + 1}: Overall=${overallScore}, Content=${scores.contentMatch}, Framing=${scores.framingMatch || 'N/A'}, Pass=${passesThreshold}`);
      
      return {
        sceneId,
        sceneIndex,
        overallScore,
        scores,
        textOverlayCheck,
        framingCheck,
        issues,
        passesThreshold,
        needsRegeneration: !passesThreshold,
      };

    } catch (error: any) {
      log.error(`[QualityEval] Parse error:`, error.message);
      return this.getPlaceholderScore(sceneId, sceneIndex);
    }
  }

  private getPlaceholderScore(sceneId: string, sceneIndex: number): SceneQualityScore {
    return {
      sceneId,
      sceneIndex,
      overallScore: 75,
      scores: {
        composition: 75,
        visibility: 75,
        technicalQuality: 75,
        contentMatch: 75,
        professionalLook: 75,
      },
      issues: [{
        type: 'technical',
        severity: 'minor',
        description: 'Could not evaluate frame - using placeholder score',
        sceneIndex,
      }],
      passesThreshold: true,
      needsRegeneration: false,
    };
  }

  private getDefaultReport(projectId: string, scenes: Array<{ id: string }>): VideoQualityReport {
    return {
      projectId,
      overallScore: 75,
      passesQuality: true,
      sceneScores: scenes.map((scene, i) => this.getPlaceholderScore(scene.id, i)),
      criticalIssues: [],
      recommendations: ['Quality evaluation unavailable - using default scores'],
      evaluatedAt: new Date().toISOString(),
    };
  }

  private generateRecommendations(
    sceneScores: SceneQualityScore[],
    issues: QualityIssue[]
  ): string[] {
    const recommendations: string[] = [];
    
    if (sceneScores.length === 0) {
      return ['No scenes to evaluate'];
    }
    
    const avgComposition = sceneScores.reduce((s, sc) => s + sc.scores.composition, 0) / sceneScores.length;
    const avgVisibility = sceneScores.reduce((s, sc) => s + sc.scores.visibility, 0) / sceneScores.length;
    const avgContentMatch = sceneScores.reduce((s, sc) => s + sc.scores.contentMatch, 0) / sceneScores.length;
    
    if (avgComposition < 70) {
      recommendations.push('Consider adjusting text placement algorithm - composition scores are low');
    }
    
    if (avgVisibility < 70) {
      recommendations.push('Text visibility needs improvement - try adding more shadow or background');
    }
    
    if (avgContentMatch < 70) {
      recommendations.push('Video content often mismatches narration - improve visual direction prompts');
    }
    
    const textOverlapIssues = issues.filter(i => i.type === 'text-overlap');
    if (textOverlapIssues.length > 0) {
      recommendations.push(`${textOverlapIssues.length} scene(s) have text overlapping faces - check face detection`);
    }
    
    const scenesNeedingRegen = sceneScores.filter(s => s.needsRegeneration);
    if (scenesNeedingRegen.length > 0) {
      recommendations.push(`${scenesNeedingRegen.length} scene(s) need regeneration: scenes ${scenesNeedingRegen.map(s => s.sceneIndex + 1).join(', ')}`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Video passes quality checks - ready for distribution');
    }
    
    return recommendations;
  }

  async quickSceneCheck(
    imageBase64: string,
    expectedText: string[]
  ): Promise<{ passes: boolean; issues: string[] }> {
    if (!this.anthropic) {
      return { passes: true, issues: [] };
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `Quick quality check. Expected text: "${expectedText.join(', ')}". 
                
Answer in JSON: {"passes": true/false, "issues": ["issue1", "issue2"]}

Check for:
1. Text overlapping faces (FAIL)
2. Text unreadable (FAIL)
3. Professional appearance (PASS/FAIL)

Return ONLY the JSON.`,
              },
            ],
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return { passes: true, issues: [] };
      }

      const match = content.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          passes: parsed.passes ?? true,
          issues: parsed.issues ?? [],
        };
      }

      return { passes: true, issues: [] };

    } catch (error) {
      return { passes: true, issues: [] };
    }
  }

  // ============================================================
  // PHASE 4F: BRAND COMPLIANCE EVALUATION
  // ============================================================

  /**
   * Evaluate brand compliance and detect AI hallucinations
   */
  async evaluateBrandCompliance(
    frameBase64: string,
    sceneContext: {
      sceneType: string;
      expectedContent: string;
      isFirstScene: boolean;
      isLastScene: boolean;
      shouldHaveWatermark: boolean;
    }
  ): Promise<{
    score: number;
    issues: QualityIssue[];
  }> {
    log.debug(` Checking brand compliance...`);
    
    if (!this.anthropic) {
      log.warn(` Anthropic not configured, skipping brand compliance check`);
      return { score: 70, issues: [] };
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: frameBase64,
                },
              },
              {
                type: 'text',
                text: this.buildBrandCompliancePrompt(sceneContext),
              },
            ],
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      return this.parseBrandComplianceResponse(content.text);

    } catch (error: any) {
      log.error(`[QualityEval] Brand compliance check failed:`, error.message);
      return { score: 70, issues: [] };
    }
  }

  /**
   * Build the prompt for brand compliance checking
   */
  private buildBrandCompliancePrompt(sceneContext: {
    sceneType: string;
    expectedContent: string;
    isFirstScene: boolean;
    isLastScene: boolean;
    shouldHaveWatermark: boolean;
  }): string {
    return `Analyze this video frame for brand compliance and AI generation artifacts.

SCENE CONTEXT:
- Scene type: ${sceneContext.sceneType}
- Expected content: ${sceneContext.expectedContent}
- First scene (should have logo intro): ${sceneContext.isFirstScene}
- Last scene (should have CTA): ${sceneContext.isLastScene}
- Should have watermark: ${sceneContext.shouldHaveWatermark}

CHECK FOR THESE SPECIFIC ISSUES:

1. AI-GENERATED TEXT (CRITICAL)
   Look for ANY text that appears garbled, misspelled, or nonsensical.
   Examples of AI text hallucination:
   - "peocineate" instead of real words
   - "weth meal" instead of "with meal"  
   - "Noney", "Fioliday", "Decumeds"
   - Any gibberish that looks like attempted text
   - Partial words or character soup

2. AI-GENERATED UI ELEMENTS (MAJOR)
   Look for fake interface elements that don't belong:
   - Fake calendars with nonsense labels
   - Mock spreadsheets or charts
   - Fake app interfaces
   - Random numbers that look like data (e.g., "1102", "5idups")
   - Dashboard-like elements in non-dashboard content

3. OFF-BRAND CONTENT (MAJOR)
   Content that doesn't match wellness/health brand:
   - Finance/business graphics in wellness video
   - Unrelated stock imagery
   - Content that doesn't match the expected scene type

4. MISSING BRAND ELEMENTS (MINOR)
   Expected elements that are missing:
   - Logo/watermark if expected
   - Brand colors not present
   - CTA elements on last scene

Return a JSON object with this EXACT structure:
{
  "aiTextDetected": {
    "found": true/false,
    "examples": ["list", "of", "garbled", "text"],
    "severity": "critical"
  },
  "aiUIDetected": {
    "found": true/false,
    "description": "what was found",
    "severity": "major"
  },
  "offBrandContent": {
    "found": true/false,
    "description": "what doesn't match",
    "severity": "major"
  },
  "missingBrandElements": {
    "found": true/false,
    "description": "what's missing",
    "severity": "minor"
  },
  "brandComplianceScore": 0-100,
  "overallAssessment": "brief summary"
}

SCORING GUIDE:
- AI text detected: -40 points (critical issue)
- AI UI detected: -25 points (major issue)
- Off-brand content: -20 points (major issue)
- Missing brand elements: -10 points (minor issue)
- Start at 100, subtract for issues found

Return ONLY the JSON object, no other text.`;
  }

  /**
   * Parse the brand compliance response
   */
  private parseBrandComplianceResponse(text: string): {
    score: number;
    issues: QualityIssue[];
  } {
    const issues: QualityIssue[] = [];
    let score = 100;

    try {
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        log.warn('[QualityEval] No JSON found in brand compliance response');
        return { score: 70, issues: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Process AI text detection
      if (parsed.aiTextDetected?.found) {
        issues.push({
          type: 'ai-text-detected',
          severity: 'critical',
          description: `AI-generated garbled text detected in video frame`,
          examples: parsed.aiTextDetected.examples || [],
        });
        score -= 40;
        log.debug(` AI text detected: ${parsed.aiTextDetected.examples?.join(', ')}`);
      }

      // Process AI UI detection
      if (parsed.aiUIDetected?.found) {
        issues.push({
          type: 'ai-ui-detected',
          severity: 'major',
          description: `AI-generated UI elements detected: ${parsed.aiUIDetected.description}`,
        });
        score -= 25;
        log.debug(` AI UI detected: ${parsed.aiUIDetected.description}`);
      }

      // Process off-brand content
      if (parsed.offBrandContent?.found) {
        issues.push({
          type: 'off-brand-content',
          severity: 'major',
          description: `Off-brand content: ${parsed.offBrandContent.description}`,
        });
        score -= 20;
        log.debug(` Off-brand content: ${parsed.offBrandContent.description}`);
      }

      // Process missing brand elements
      if (parsed.missingBrandElements?.found) {
        issues.push({
          type: 'missing-brand-element',
          severity: 'minor',
          description: `Missing brand element: ${parsed.missingBrandElements.description}`,
        });
        score -= 10;
      }

      // Use parsed score if available, otherwise use calculated
      const finalScore = parsed.brandComplianceScore ?? Math.max(0, score);
      
      log.debug(` Brand compliance score: ${finalScore}/100`);
      if (issues.length > 0) {
        log.debug(` Issues: ${issues.map(i => `${i.type} (${i.severity})`).join(', ')}`);
      }

      return {
        score: finalScore,
        issues,
      };

    } catch (parseError: any) {
      log.error(' Failed to parse brand compliance response:', parseError.message);
      return { score: 70, issues: [] };
    }
  }

  /**
   * Complete scene evaluation including brand compliance
   */
  async evaluateSceneComplete(
    frameBase64: string,
    sceneData: {
      sceneIndex: number;
      sceneType: string;
      narration: string;
      totalScenes: number;
      hasTextOverlay: boolean;
    }
  ): Promise<{
    overallScore: number;
    compositionScore: number;
    brandComplianceScore: number;
    issues: QualityIssue[];
    recommendation: 'pass' | 'regenerate' | 'adjust';
  }> {
    log.debug(` Starting complete evaluation for scene ${sceneData.sceneIndex + 1}...`);

    // Run composition evaluation (existing Phase 3 logic)
    const compositionResult = await this.evaluateFrame(
      frameBase64,
      {
        id: `scene-${sceneData.sceneIndex}`,
        type: sceneData.sceneType,
        narration: sceneData.narration,
        textOverlays: sceneData.hasTextOverlay ? [{ text: 'overlay' }] : [],
      },
      sceneData.sceneIndex
    );

    // Run brand compliance evaluation (Phase 4F logic)
    const brandResult = await this.evaluateBrandCompliance(frameBase64, {
      sceneType: sceneData.sceneType,
      expectedContent: sceneData.narration,
      isFirstScene: sceneData.sceneIndex === 0,
      isLastScene: sceneData.sceneIndex === sceneData.totalScenes - 1,
      shouldHaveWatermark: sceneData.sceneIndex > 0 && sceneData.sceneIndex < sceneData.totalScenes - 1,
    });

    // Combine issues
    const allIssues = [...compositionResult.issues, ...brandResult.issues];

    // Calculate weighted overall score
    // Brand compliance is weighted more heavily for AI text issues
    const hasCriticalBrandIssue = brandResult.issues.some(i => i.severity === 'critical');
    
    let overallScore: number;
    if (hasCriticalBrandIssue) {
      // Critical brand issues (AI text) heavily penalize the score
      overallScore = Math.min(compositionResult.overallScore * 0.3 + brandResult.score * 0.7, 50);
    } else {
      // Normal weighting: 60% composition, 40% brand
      overallScore = compositionResult.overallScore * 0.6 + brandResult.score * 0.4;
    }

    // Determine recommendation
    let recommendation: 'pass' | 'regenerate' | 'adjust';
    if (overallScore >= 70 && !hasCriticalBrandIssue) {
      recommendation = 'pass';
    } else if (hasCriticalBrandIssue || overallScore < 50) {
      recommendation = 'regenerate';  // AI text = must regenerate
    } else {
      recommendation = 'adjust';
    }

    log.debug(` Complete - Overall: ${Math.round(overallScore)}, Recommendation: ${recommendation}`);

    return {
      overallScore: Math.round(overallScore),
      compositionScore: compositionResult.overallScore,
      brandComplianceScore: brandResult.score,
      issues: allIssues,
      recommendation,
    };
  }

  /**
   * Evaluate all scenes in a video for brand compliance
   */
  async evaluateVideoBrandCompliance(
    scenes: Array<{
      frameBase64: string;
      sceneIndex: number;
      sceneType: string;
      narration: string;
    }>
  ): Promise<{
    overallBrandScore: number;
    sceneScores: Array<{ sceneIndex: number; score: number; issues: QualityIssue[] }>;
    criticalIssues: QualityIssue[];
    recommendation: 'approved' | 'needs-regeneration' | 'needs-review';
  }> {
    log.debug(` Starting brand compliance check for ${scenes.length} scenes...`);

    const sceneScores: Array<{ sceneIndex: number; score: number; issues: QualityIssue[] }> = [];
    const criticalIssues: QualityIssue[] = [];

    for (const scene of scenes) {
      const result = await this.evaluateBrandCompliance(scene.frameBase64, {
        sceneType: scene.sceneType,
        expectedContent: scene.narration,
        isFirstScene: scene.sceneIndex === 0,
        isLastScene: scene.sceneIndex === scenes.length - 1,
        shouldHaveWatermark: scene.sceneIndex > 0 && scene.sceneIndex < scenes.length - 1,
      });

      sceneScores.push({
        sceneIndex: scene.sceneIndex,
        score: result.score,
        issues: result.issues,
      });

      // Collect critical issues
      const critical = result.issues.filter(i => i.severity === 'critical');
      critical.forEach(issue => {
        criticalIssues.push({
          ...issue,
          sceneIndex: scene.sceneIndex,
        });
      });
    }

    // Calculate overall brand score (average of all scenes)
    const overallBrandScore = sceneScores.length > 0
      ? Math.round(sceneScores.reduce((sum, s) => sum + s.score, 0) / sceneScores.length)
      : 70;

    // Determine recommendation
    let recommendation: 'approved' | 'needs-regeneration' | 'needs-review';
    if (criticalIssues.length > 0) {
      recommendation = 'needs-regeneration';
    } else if (overallBrandScore < 70) {
      recommendation = 'needs-review';
    } else {
      recommendation = 'approved';
    }

    log.debug(` Brand check complete - Score: ${overallBrandScore}, Critical issues: ${criticalIssues.length}`);

    return {
      overallBrandScore,
      sceneScores,
      criticalIssues,
      recommendation,
    };
  }

  // ============================================================
  // PHASE 6D: COMPREHENSIVE BRAND-AWARE QUALITY EVALUATION
  // ============================================================

  /**
   * Comprehensive scene evaluation with Pine Hill Farm brand compliance
   * Weights: Technical 20%, Composition 15%, AI Artifacts 15%, Brand 50%
   */
  async evaluateSceneComprehensive(
    frameBase64: string,
    sceneContext: {
      sceneIndex: number;
      sceneType: string;
      narration: string;
      totalScenes: number;
      expectedContentType: string;
      visualDirection?: string;
    }
  ): Promise<ComprehensiveQualityResult> {
    log.debug(` Starting comprehensive evaluation for scene ${sceneContext.sceneIndex + 1}...`);

    if (!this.anthropic) {
      log.warn(` Anthropic not configured, using default comprehensive result`);
      return this.getDefaultComprehensiveResult();
    }

    try {
      const brandEvalContext = await brandContextService.getQualityEvaluationContext();
      const visualGuidelines = await brandContextService.getVisualAnalysisContextFull();
      const roleContext = await projectInstructionsService.getCondensedRoleContext();

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: [
            { 
              type: 'image', 
              source: { 
                type: 'base64', 
                media_type: 'image/jpeg', 
                data: frameBase64 
              }
            },
            { 
              type: 'text', 
              text: this.buildComprehensiveEvalPrompt(sceneContext, brandEvalContext, visualGuidelines, roleContext) 
            }
          ]
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      return this.parseComprehensiveEvalResponse(content.text, sceneContext);

    } catch (error: any) {
      log.error(`[QualityEval] Comprehensive evaluation failed:`, error.message);
      return this.getDefaultComprehensiveResult();
    }
  }

  /**
   * Build comprehensive evaluation prompt with brand context
   */
  private buildComprehensiveEvalPrompt(
    sceneContext: {
      sceneIndex: number;
      sceneType: string;
      narration: string;
      totalScenes: number;
      expectedContentType: string;
      visualDirection?: string;
    },
    brandEvalContext: string,
    visualGuidelines: string,
    roleContext: string
  ): string {
    const visualDirectionSection = sceneContext.visualDirection 
      ? `
VISUAL DIRECTION (PRIMARY REFERENCE - What this scene SHOULD show):
"${sceneContext.visualDirection}"

IMPORTANT: The visual direction is the PRIMARY reference for what this scene should contain.
If the visual direction specifies a clinical/medical setting, waiting room, or healthcare environment,
these are INTENTIONAL creative choices that should NOT be penalized in brand scoring.
Brand guidelines are secondary to the visual direction for content matching.`
      : '';
      
    return `${roleContext}

Evaluate this video frame for comprehensive quality including Pine Hill Farm brand compliance.
${visualDirectionSection}

${brandEvalContext}

${visualGuidelines}

SCENE CONTEXT:
- Scene ${sceneContext.sceneIndex + 1} of ${sceneContext.totalScenes}
- Scene Type: ${sceneContext.sceneType}
- Expected Content: ${sceneContext.expectedContentType}
- Narration: "${sceneContext.narration.substring(0, 200)}..."
${sceneContext.visualDirection ? `- Visual Direction: "${sceneContext.visualDirection.substring(0, 300)}..."` : ''}

EVALUATE FOUR CATEGORIES:

## 1. TECHNICAL QUALITY (20% of total)
Score 0-100:
- Resolution and sharpness
- Exposure (not over/under exposed)
- Focus accuracy
- Compression artifacts

## 2. COMPOSITION (15% of total)
Score 0-100:
- Framing and rule of thirds
- Visual balance
- Subject placement
- No awkward cropping

## 3. AI ARTIFACTS (15% of total)
Score 0-100 (deduct heavily for issues):
- Garbled or misspelled text (e.g., "peocineate", "weth meal")
- Fake UI elements (calendars, spreadsheets)
- Distorted faces or hands
- Unnatural lighting/shadows
Score 100 if none found, 0 if critical artifacts present.

## 4. BRAND COMPLIANCE (50% of total) - CONTEXT-AWARE SCORING
Score each 0-25:

IMPORTANT: If the Visual Direction INTENTIONALLY specifies a clinical, medical, waiting room, 
or healthcare setting, these are VALID creative choices for storytelling purposes (e.g., showing
problems before wellness solutions). In such cases:
- Clinical/cold lighting is APPROPRIATE and should score 20-25 points
- Clinical settings are INTENTIONAL and should score 20-25 points  
- The image should be evaluated on whether it MATCHES the visual direction, not generic brand guidelines

### Lighting (12.5%):
For wellness/farm scenes: Warm/golden = 25, Neutral = 15, Cold = 5
For clinical/problem scenes (per visual direction): Cold/clinical = 25, Neutral = 20

### Colors (12.5%):
For wellness scenes: Earth tones = 25, Neutral = 15, Cold = 5
For clinical/problem scenes: Clinical palette is INTENTIONAL = 20-25

### Setting (12.5%):
MATCH THE VISUAL DIRECTION:
- If visual direction says clinical/waiting room → clinical setting = 25 points
- If visual direction says farm/wellness → natural setting = 25 points
- Mismatch with visual direction = 0-10 points

### Authenticity (12.5%):
- Real/believable people and environments = 25 points
- Generic stock-looking = 15 points
- Artificial/uncanny = 0-10 points

Return JSON:
{
  "technicalScore": 0-100,
  "compositionScore": 0-100,
  "aiArtifactsScore": 0-100,
  "aiArtifacts": {
    "textDetected": true/false,
    "textExamples": ["garbled text if found"],
    "uiDetected": true/false,
    "distortionsFound": true/false
  },
  "brandScores": {
    "lighting": { "score": 0-25, "assessment": "warm|neutral|cold" },
    "colors": { "score": 0-25, "assessment": "earth tones|neutral|cold tones" },
    "setting": { "score": 0-25, "assessment": "natural|neutral|clinical" },
    "authenticity": { "score": 0-25, "assessment": "authentic|generic|artificial" }
  },
  "brandTotal": 0-100,
  "issues": [
    { "type": "issue-type", "severity": "critical|major|minor", "description": "..." }
  ],
  "suggestedImprovements": ["specific actionable improvement"],
  "overallAssessment": "brief summary"
}

IMPORTANT:
- AI artifacts (garbled text, fake UI) = CRITICAL, forces regeneration
- Brand score < 50 = forces regeneration
- Brand score 50-69 = needs adjustment
- Overall 70+ with no critical issues = pass`;
  }

  /**
   * Parse comprehensive evaluation response
   */
  private parseComprehensiveEvalResponse(
    text: string,
    sceneContext: {
      sceneIndex: number;
      sceneType: string;
      narration: string;
      totalScenes: number;
      expectedContentType: string;
    }
  ): ComprehensiveQualityResult {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const technicalScore = parsed.technicalScore || 70;
      const compositionScore = parsed.compositionScore || 70;
      const aiArtifactsScore = parsed.aiArtifactsScore || 100;
      
      const brandScores = {
        lighting: parsed.brandScores?.lighting?.score || 15,
        colors: parsed.brandScores?.colors?.score || 15,
        setting: parsed.brandScores?.setting?.score || 15,
        authenticity: parsed.brandScores?.authenticity?.score || 15,
      };
      const brandTotal = parsed.brandTotal || 
        (brandScores.lighting + brandScores.colors + brandScores.setting + brandScores.authenticity);

      const weightedScore = Math.round(
        technicalScore * 0.20 +
        compositionScore * 0.15 +
        aiArtifactsScore * 0.15 +
        brandTotal * 0.50
      );

      const aiArtifacts = parsed.aiArtifacts || {};
      const hasAiText = aiArtifacts.textDetected === true;
      const hasAiUI = aiArtifacts.uiDetected === true;

      const recommendation = this.computeComprehensiveRecommendation(
        weightedScore, 
        brandTotal, 
        hasAiText, 
        hasAiUI
      );

      const issues: QualityIssue[] = (parsed.issues || []).map((issue: any) => ({
        type: issue.type || 'technical',
        severity: issue.severity || 'minor',
        description: issue.description || 'Unknown issue',
        sceneIndex: sceneContext.sceneIndex,
      }));

      if (hasAiText) {
        issues.push({
          type: 'ai-text-detected',
          severity: 'critical',
          description: `AI-generated garbled text: ${aiArtifacts.textExamples?.join(', ') || 'detected'}`,
          sceneIndex: sceneContext.sceneIndex,
          examples: aiArtifacts.textExamples,
        });
      }

      if (hasAiUI) {
        issues.push({
          type: 'ai-ui-detected',
          severity: 'major',
          description: 'AI-generated fake UI elements detected',
          sceneIndex: sceneContext.sceneIndex,
        });
      }

      log.debug(` Comprehensive scores - Technical: ${technicalScore}, Composition: ${compositionScore}, AI: ${aiArtifactsScore}, Brand: ${brandTotal}`);
      log.debug(` Weighted overall: ${weightedScore}, Recommendation: ${recommendation}`);

      if (brandTotal < 70) {
        log.debug(` Brand issues:`);
        if (brandScores.lighting < 20) {
          log.debug(`  - Lighting: ${parsed.brandScores?.lighting?.assessment} (${brandScores.lighting}/25)`);
        }
        if (brandScores.colors < 20) {
          log.debug(`  - Colors: ${parsed.brandScores?.colors?.assessment} (${brandScores.colors}/25)`);
        }
        if (brandScores.setting < 20) {
          log.debug(`  - Setting: ${parsed.brandScores?.setting?.assessment} (${brandScores.setting}/25)`);
        }
        if (brandScores.authenticity < 20) {
          log.debug(`  - Authenticity: ${parsed.brandScores?.authenticity?.assessment} (${brandScores.authenticity}/25)`);
        }
      }

      return {
        overallScore: weightedScore,
        scores: {
          technical: technicalScore,
          composition: compositionScore,
          aiArtifacts: aiArtifactsScore,
          brand: {
            total: brandTotal,
            lighting: brandScores.lighting,
            colors: brandScores.colors,
            setting: brandScores.setting,
            authenticity: brandScores.authenticity,
          },
        },
        issues,
        recommendation,
        brandAssessment: {
          overallAssessment: brandTotal >= 70 ? 'on-brand' : brandTotal >= 50 ? 'needs-adjustment' : 'off-brand',
          lightingAssessment: parsed.brandScores?.lighting?.assessment || 'neutral',
          colorAssessment: parsed.brandScores?.colors?.assessment || 'neutral',
          settingAssessment: parsed.brandScores?.setting?.assessment || 'neutral',
          authenticityAssessment: parsed.brandScores?.authenticity?.assessment || 'generic',
        },
        suggestedImprovements: parsed.suggestedImprovements || [],
      };

    } catch (error: any) {
      log.error(`[QualityEval] Parse comprehensive response error:`, error.message);
      return this.getDefaultComprehensiveResult();
    }
  }

  /**
   * Compute recommendation based on Phase 6D thresholds
   */
  private computeComprehensiveRecommendation(
    weightedScore: number,
    brandScore: number,
    hasAiText: boolean,
    hasAiUI: boolean
  ): 'pass' | 'adjust' | 'regenerate' {
    if (hasAiText || hasAiUI) {
      log.debug(` AI artifacts found - forcing regeneration`);
      return 'regenerate';
    }
    
    if (brandScore < 50) {
      log.debug(` Brand score ${brandScore} < 50 - forcing regeneration`);
      return 'regenerate';
    }
    
    if (brandScore < 70 || weightedScore < 70) {
      log.debug(` Brand ${brandScore} or weighted ${weightedScore} < 70 - needs adjustment`);
      return 'adjust';
    }
    
    return 'pass';
  }

  /**
   * Default comprehensive result when evaluation fails
   */
  private getDefaultComprehensiveResult(): ComprehensiveQualityResult {
    return {
      overallScore: 75,
      scores: {
        technical: 75,
        composition: 75,
        aiArtifacts: 100,
        brand: {
          total: 75,
          lighting: 19,
          colors: 19,
          setting: 19,
          authenticity: 18,
        },
      },
      issues: [{
        type: 'technical',
        severity: 'minor',
        description: 'Could not perform comprehensive evaluation - using defaults',
      }],
      recommendation: 'adjust',
      brandAssessment: {
        overallAssessment: 'needs-adjustment',
        lightingAssessment: 'neutral',
        colorAssessment: 'neutral',
        settingAssessment: 'neutral',
        authenticityAssessment: 'generic',
      },
      suggestedImprovements: ['Manual review recommended - automated evaluation unavailable'],
    };
  }
}

export const qualityEvaluationService = new QualityEvaluationService();
