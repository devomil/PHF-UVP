import { llmClient } from './piapi-llm-client';
import type { VisualFormat } from '../../shared/video-types';
import { getVisualArtPreset, isStylizedPreset } from '../../shared/config/visual-art-presets';

export interface SceneContent {
  sceneId: string;
  sceneIndex: number;
  sceneType: string;
  narration: string;
  visualDirection: string;
  duration: number;
}

export type ContentClassification = 'cinematic' | 'human_subjects' | 'product_reveal' | 'broll' | 'conceptual_explanatory' | 'infographic_diagram' | 'motion_graphics' | 'mixed';

export interface ProviderRecommendation {
  sceneId: string;
  sceneIndex: number;
  recommendedProvider: 'runway' | 'kling' | 'luma' | 'hailuo' | 'wan' | 'remotion';
  confidence: number;
  reasoning: string;
  contentClassification: ContentClassification;
  visualFormat: VisualFormat;
  fallbackProvider: string;
}

export interface BatchProviderRecommendations {
  recommendations: ProviderRecommendation[];
  analysisTimestamp: string;
  totalScenes: number;
}

class IntelligentProviderSelectorService {
  async analyzeAndRecommendProviders(scenes: SceneContent[], artPresetId?: string): Promise<BatchProviderRecommendations> {
    if (!llmClient.isAvailable() || scenes.length === 0) {
      return this.fallbackProviderSelection(scenes, artPresetId);
    }

    console.log(`[IntelligentProvider] Analyzing ${scenes.length} scenes with Claude...`);

    try {
      const prompt = this.buildAnalysisPrompt(scenes);
      
      const result = await llmClient.createChatCompletion({
        systemPrompt: 'You are an expert video production AI assistant.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 4000,
      });

      let recommendations = this.parseRecommendations(result.text, scenes);
      
      if (artPresetId) {
        recommendations = this.applyArtPresetPreferences(recommendations, artPresetId);
      }
      
      console.log('[IntelligentProvider] Claude analysis complete:');
      recommendations.forEach(r => {
        console.log(`  Scene ${r.sceneIndex + 1} (${r.sceneId}): ${r.recommendedProvider} | format=${r.visualFormat} | classification=${r.contentClassification} | confidence=${r.confidence}%`);
      });

      return {
        recommendations,
        analysisTimestamp: new Date().toISOString(),
        totalScenes: scenes.length,
      };
    } catch (error: any) {
      console.error('[IntelligentProvider] Claude analysis failed, using fallback:', error.message);
      return this.fallbackProviderSelection(scenes, artPresetId);
    }
  }

  private buildAnalysisPrompt(scenes: SceneContent[]): string {
    const scenesDescription = scenes.map((scene, idx) => `
Scene ${idx + 1} (ID: ${scene.sceneId}):
- Type: ${scene.sceneType}
- Duration: ${scene.duration}s
- Narration: "${scene.narration}"
- Visual Direction: "${scene.visualDirection}"
`).join('\n');

    return `You are an expert video production AI assistant. Analyze each scene and recommend the optimal AI video generation provider based on the content.

PROVIDER SPECIALIZATIONS:
- RUNWAY: Best for cinematic, dramatic, emotional content. High-quality film-like visuals. Epic shots, dramatic lighting, emotional storytelling. Multiple specialized models available:
  * Runway 4.5: Top-tier creative control, photorealistic motion, advanced camera manipulation. Best for premium cinematic and hero shots.
  * Runway Gen-4: Advanced creative control with superior motion manipulation. Best for dramatic storytelling and scene composition.
  * Runway Gen-4 Aleph: Enhanced Gen-4 with creative visual effects and artistic interpretation. Best for abstract, artistic, and surreal content.
  * Runway Act Two: Character performance and acting specialization. Best for emotional scenes, testimonials, character reactions, dialogue, and human performance.
- KLING: Best for human subjects, people, faces, talking heads, testimonials. Natural human movement and expressions. Kling 2.6 adds native audio and lip-sync.
- LUMA: Best for product reveals, product shots, close-ups of objects, commercial product showcases.
- HAILUO: Best for B-roll, ambient footage, nature scenes, establishing shots, background visuals. Cost-effective for simpler content.
- WAN: Best for text rendering, character consistency, conceptual illustrations, metaphorical visuals. Budget-friendly with good quality.
- REMOTION: Best for infographics, diagrams, data visualization, step-by-step processes, charts, lists, motion graphics with text overlays. Uses programmatic animation instead of AI video.

CONTENT CLASSIFICATION GUIDE:
- cinematic: Dramatic, epic, emotional, inspiring visuals with sweeping shots, film-like quality
- human_subjects: People, faces, expressions, testimonials, talking heads, interviews, practitioners
- product_reveal: Product shots, close-ups, packaging, unboxing, showcases, commercial displays
- broll: Ambient footage, nature, landscapes, establishing shots, background visuals, scenery
- conceptual_explanatory: Metaphors, abstract concepts, processes explained visually, comparisons, "how it works", root causes, mechanisms of action, "versus" comparisons, cause-and-effect, analogies, transformations
- infographic_diagram: Data visualization, statistics, numbered lists, step-by-step instructions, diagrams, charts, graphs, percentages, timelines, flowcharts
- motion_graphics: Animated text, kinetic typography, lower thirds, logo animations, title cards, call-to-action animations
- mixed: Combination of multiple content types that doesn't clearly fit one category

SCENES TO ANALYZE:
${scenesDescription}

For each scene, analyze the narration and visual direction to determine:
1. What type of content it primarily contains (cinematic, human_subjects, product_reveal, broll, conceptual_explanatory, infographic_diagram, motion_graphics, or mixed)
2. Which provider would produce the best results
3. Your confidence level (0-100)
4. Brief reasoning

Respond with ONLY a JSON array (no markdown, no code blocks):
[
  {
    "sceneIndex": 0,
    "sceneId": "scene_id",
    "contentClassification": "cinematic|human_subjects|product_reveal|broll|conceptual_explanatory|infographic_diagram|motion_graphics|mixed",
    "recommendedProvider": "runway|kling|luma|hailuo|wan|remotion",
    "fallbackProvider": "runway|kling|luma|hailuo|wan|remotion",
    "confidence": 85,
    "reasoning": "Brief explanation of why this provider is best"
  }
]`;
  }

  private parseRecommendations(responseText: string, scenes: SceneContent[]): ProviderRecommendation[] {
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return parsed.map((rec: any, idx: number) => {
        const classification = this.validateClassification(rec.contentClassification);
        return {
          sceneId: rec.sceneId || scenes[idx]?.sceneId || `scene_${idx}`,
          sceneIndex: rec.sceneIndex ?? idx,
          recommendedProvider: this.validateProvider(rec.recommendedProvider),
          confidence: Math.min(100, Math.max(0, rec.confidence || 70)),
          reasoning: rec.reasoning || 'AI analysis',
          contentClassification: classification,
          visualFormat: this.determineVisualFormat(classification),
          fallbackProvider: this.validateProvider(rec.fallbackProvider || 'kling'),
        };
      });
    } catch (error) {
      console.error('[IntelligentProvider] Failed to parse Claude response:', error);
      return this.fallbackProviderSelection(scenes).recommendations;
    }
  }

  private validateProvider(provider: string): 'runway' | 'kling' | 'luma' | 'hailuo' | 'wan' | 'remotion' {
    const valid = ['runway', 'kling', 'luma', 'hailuo', 'wan', 'remotion'];
    const normalized = (provider || '').toLowerCase().trim();
    return valid.includes(normalized) ? normalized as any : 'runway';
  }

  resolveRunwayModel(classification: ContentClassification, sceneType: string): string {
    if (classification === 'cinematic' || sceneType === 'hook' || sceneType === 'cta') {
      return 'runway-4.5';
    }
    if (classification === 'human_subjects' || sceneType === 'testimonial') {
      return 'runway-act-two';
    }
    if (classification === 'mixed' && /abstract|artistic|surreal|creative/i.test(sceneType)) {
      return 'runway-gen4-aleph';
    }
    return 'runway-gen4';
  }

  resolveSpecificProvider(baseProvider: string, classification: ContentClassification, sceneType: string): string {
    if (baseProvider === 'runway') {
      return this.resolveRunwayModel(classification, sceneType);
    }
    return baseProvider;
  }

  private validateClassification(classification: string): ContentClassification {
    const valid: ContentClassification[] = ['cinematic', 'human_subjects', 'product_reveal', 'broll', 'conceptual_explanatory', 'infographic_diagram', 'motion_graphics', 'mixed'];
    const normalized = (classification || '').toLowerCase().trim() as ContentClassification;
    return valid.includes(normalized) ? normalized : 'mixed';
  }

  private determineVisualFormat(classification: ContentClassification): VisualFormat {
    switch (classification) {
      case 'conceptual_explanatory':
        return 'ai-image-remotion';
      case 'infographic_diagram':
      case 'motion_graphics':
        return 'remotion-motion-graphics';
      case 'cinematic':
      case 'human_subjects':
      case 'product_reveal':
      case 'broll':
      case 'mixed':
      default:
        return 'ai-video';
    }
  }

  private applyArtPresetPreferences(recommendations: ProviderRecommendation[], artPresetId: string): ProviderRecommendation[] {
    const preset = getVisualArtPreset(artPresetId);
    if (!preset) return recommendations;

    const preferredVideoProviders = preset.recommendedProviders.video || [];
    const isStylized = isStylizedPreset(artPresetId);

    console.log(`[IntelligentProvider] Applying art preset "${preset.name}" preferences: video=[${preferredVideoProviders}], stylized=${isStylized}`);

    return recommendations.map(rec => {
      if (rec.visualFormat === 'remotion-motion-graphics') return rec;

      if (isStylized && rec.visualFormat === 'ai-image-remotion') {
        console.log(`[IntelligentProvider] Stylized preset override: scene ${rec.sceneIndex} format ai-image-remotion → ai-video (${preset.name} needs full AI video)`);
        rec = { ...rec, visualFormat: 'ai-video' };
      }

      const currentProvider = rec.recommendedProvider;
      const isPreferred = preferredVideoProviders.includes(currentProvider);

      if (!isPreferred && preferredVideoProviders.length > 0) {
        const newProvider = this.validateProvider(preferredVideoProviders[0]);
        console.log(`[IntelligentProvider] Art preset provider override: scene ${rec.sceneIndex} ${currentProvider} → ${newProvider} (preset: ${preset.name})`);
        return {
          ...rec,
          recommendedProvider: newProvider,
          fallbackProvider: this.validateProvider(preferredVideoProviders[1] || currentProvider),
          reasoning: `${rec.reasoning} (adjusted for ${preset.name} art preset)`,
        };
      }

      return rec;
    });
  }

  private fallbackProviderSelection(scenes: SceneContent[], artPresetId?: string): BatchProviderRecommendations {
    console.log('[IntelligentProvider] Using rule-based fallback selection');
    
    let recommendations = scenes.map(scene => {
      const { provider, classification, confidence, reasoning } = this.classifySceneByRules(scene);
      const visualFormat = this.determineVisualFormat(classification);
      
      console.log(`[IntelligentProvider] Format decision: scene=${scene.sceneId} | classification=${classification} → visualFormat=${visualFormat} | provider=${provider}`);
      
      return {
        sceneId: scene.sceneId,
        sceneIndex: scene.sceneIndex,
        recommendedProvider: provider,
        confidence,
        reasoning,
        contentClassification: classification,
        visualFormat,
        fallbackProvider: provider === 'runway' ? 'kling' : 'runway',
      };
    });

    if (artPresetId) {
      recommendations = this.applyArtPresetPreferences(recommendations, artPresetId);
    }

    return {
      recommendations,
      analysisTimestamp: new Date().toISOString(),
      totalScenes: scenes.length,
    };
  }

  private classifySceneByRules(scene: SceneContent): {
    provider: 'runway' | 'kling' | 'luma' | 'hailuo' | 'wan' | 'remotion';
    classification: ContentClassification;
    confidence: number;
    reasoning: string;
  } {
    const text = `${scene.narration} ${scene.visualDirection}`.toLowerCase();
    const sceneType = scene.sceneType.toLowerCase();

    const cinematicKeywords = ['cinematic', 'dramatic', 'epic', 'emotional', 'inspiring', 'powerful', 'stunning', 'breathtaking', 'majestic', 'sweeping', 'film'];
    const humanKeywords = ['person', 'people', 'face', 'talking', 'speaking', 'testimonial', 'interview', 'customer', 'woman', 'man', 'practitioner', 'expert', 'smile', 'expression'];
    const productKeywords = ['product', 'bottle', 'package', 'supplement', 'item', 'close-up', 'showcase', 'display', 'reveal', 'unboxing', 'box', 'container'];
    const brollKeywords = ['b-roll', 'broll', 'ambient', 'background', 'establishing', 'nature', 'landscape', 'scenery', 'atmosphere', 'environment', 'exterior'];
    const conceptualKeywords = ['root cause', 'how it works', 'mechanism', 'process', 'compare', 'comparison', 'versus', 'vs', 'metaphor', 'analogy', 'concept', 'explain', 'why', 'cause and effect', 'transformation', 'before and after', 'abstract', 'symbolize', 'represent', 'illustrate'];
    const infographicKeywords = ['diagram', 'chart', 'graph', 'statistic', 'percentage', 'data', 'step-by-step', 'step 1', 'step 2', 'step 3', 'numbered', 'list', 'timeline', 'flowchart', 'infographic', 'facts', 'figures', 'survey', 'research shows'];
    const motionGraphicsKeywords = ['motion graphic', 'kinetic text', 'animated text', 'title card', 'lower third', 'logo animation', 'text animation', 'typography'];

    const cinematicScore = cinematicKeywords.filter(k => text.includes(k)).length;
    const humanScore = humanKeywords.filter(k => text.includes(k)).length;
    const productScore = productKeywords.filter(k => text.includes(k)).length;
    const brollScore = brollKeywords.filter(k => text.includes(k)).length;
    const conceptualScore = conceptualKeywords.filter(k => text.includes(k)).length;
    const infographicScore = infographicKeywords.filter(k => text.includes(k)).length;
    const motionGraphicsScore = motionGraphicsKeywords.filter(k => text.includes(k)).length;

    if (sceneType === 'hook' || sceneType === 'cta') {
      return { provider: 'runway', classification: 'cinematic', confidence: 80, reasoning: 'Hook/CTA scenes benefit from cinematic impact' };
    }

    if (sceneType === 'testimonial') {
      return { provider: 'kling', classification: 'human_subjects', confidence: 90, reasoning: 'Testimonial requires natural human expressions' };
    }

    if (sceneType === 'product') {
      return { provider: 'luma', classification: 'product_reveal', confidence: 85, reasoning: 'Product scene needs detailed product showcase' };
    }

    if (infographicScore >= 2 || sceneType === 'infographic') {
      return { provider: 'remotion', classification: 'infographic_diagram', confidence: 85, reasoning: 'Infographic/diagram content best rendered with motion graphics' };
    }

    if (motionGraphicsScore >= 1) {
      return { provider: 'remotion', classification: 'motion_graphics', confidence: 80, reasoning: 'Motion graphics content best rendered programmatically' };
    }

    if (conceptualScore >= 2) {
      return { provider: 'wan', classification: 'conceptual_explanatory', confidence: 80, reasoning: 'Conceptual/explanatory content benefits from AI image + animation or Wan text rendering' };
    }

    if (sceneType === 'broll' || sceneType === 'explanation') {
      if (conceptualScore >= 1) {
        return { provider: 'wan', classification: 'conceptual_explanatory', confidence: 75, reasoning: 'Explanation scene with conceptual content' };
      }
      return { provider: 'hailuo', classification: 'broll', confidence: 75, reasoning: 'B-roll/explanation is cost-effective with Hailuo' };
    }

    const scores = [
      { type: 'cinematic' as const, provider: 'runway' as const, score: cinematicScore * 2 },
      { type: 'human_subjects' as const, provider: 'kling' as const, score: humanScore * 1.5 },
      { type: 'product_reveal' as const, provider: 'luma' as const, score: productScore * 1.8 },
      { type: 'broll' as const, provider: 'hailuo' as const, score: brollScore * 1.3 },
      { type: 'conceptual_explanatory' as const, provider: 'wan' as const, score: conceptualScore * 2.0 },
      { type: 'infographic_diagram' as const, provider: 'remotion' as const, score: infographicScore * 2.5 },
      { type: 'motion_graphics' as const, provider: 'remotion' as const, score: motionGraphicsScore * 2.5 },
    ].sort((a, b) => b.score - a.score);

    if (scores[0].score > 0) {
      return {
        provider: scores[0].provider,
        classification: scores[0].type,
        confidence: Math.min(85, 50 + scores[0].score * 10),
        reasoning: `Keyword analysis detected ${scores[0].type} content`,
      };
    }

    return { provider: 'runway', classification: 'mixed', confidence: 60, reasoning: 'Default to Runway for best quality' };
  }

  async recommendProviderForScene(scene: SceneContent): Promise<ProviderRecommendation> {
    const batch = await this.analyzeAndRecommendProviders([scene]);
    return batch.recommendations[0];
  }
}

export const intelligentProviderSelector = new IntelligentProviderSelectorService();
