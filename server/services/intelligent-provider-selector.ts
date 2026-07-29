import { llmClient } from './piapi-llm-client';
import type { VisualFormat } from '../../shared/video-types';
import { getVisualArtPreset, isStylizedPreset, getProviderHierarchy } from '../../shared/config/visual-art-presets';

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
  recommendedProvider: string;
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
  async analyzeAndRecommendProviders(scenes: SceneContent[], artPresetId?: string, availableProviders?: string[]): Promise<BatchProviderRecommendations> {
    if (!llmClient.isAvailable() || scenes.length === 0) {
      return this.fallbackProviderSelection(scenes, artPresetId);
    }

    console.log(`[IntelligentProvider] Analyzing ${scenes.length} scenes with Claude...`);

    try {
      const prompt = this.buildAnalysisPrompt(scenes, availableProviders);
      
      const result = await llmClient.createChatCompletion({
        systemPrompt: 'You are an expert video production AI assistant.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 4000,
      });

      let recommendations = this.parseRecommendations(result.text, scenes);
      
      if (artPresetId) {
        recommendations = this.applyArtPresetPreferences(recommendations, artPresetId, scenes);
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

  private buildAnalysisPrompt(scenes: SceneContent[], availableProviders?: string[]): string {
    const scenesDescription = scenes.map((scene, idx) => `
Scene ${idx + 1} (ID: ${scene.sceneId}):
- Type: ${scene.sceneType}
- Duration: ${scene.duration}s
- Narration: "${scene.narration}"
- Visual Direction: "${scene.visualDirection}"
`).join('\n');

    // When a constraint list is active, restrict the JSON schema enum to only those
    // providers so the example and the constraint block agree — no contradiction for Claude.
    const providerEnum = availableProviders && availableProviders.length > 0
      ? availableProviders.join('|')
      : 'seedance|runway|kling|luma|veo|sora|wan|remotion';

    return `You are an expert video production AI assistant. Analyze each scene and recommend the optimal AI video generation provider based on the content.

PROVIDER SPECIALIZATIONS:
- SEEDANCE: PRIMARY provider for most content types. Seedance 2 GA with 1080p output, up to 15s duration, multi-image references, and morphing effects. Excellent general-purpose quality for cinematic, lifestyle, product, educational, and social content. Default choice when no specialized provider is clearly better.
- RUNWAY: Best for cinematic, dramatic, emotional content. High-quality film-like visuals. Epic shots, dramatic lighting, emotional storytelling. Multiple specialized models available:
  * Runway 4.5: Top-tier creative control, photorealistic motion, advanced camera manipulation. Best for premium cinematic and hero shots.
  * Runway Gen-4: Advanced creative control with superior motion manipulation. Best for dramatic storytelling and scene composition.
  * Runway Gen-4 Aleph: Enhanced Gen-4 with creative visual effects and artistic interpretation. Best for abstract, artistic, and surreal content.
  * Runway Act Two: Character performance and acting specialization. Best for emotional scenes, testimonials, character reactions, dialogue, and human performance.
- KLING: Best for human subjects, people, faces, talking heads, testimonials. Natural human movement and expressions. Kling 2.6 adds native audio and lip-sync.
- LUMA: Best for product reveals, product shots, close-ups of objects, commercial product showcases.
- VEO: Best for high-quality cinematic content, sweeping establishing shots, nature footage, and premium B-roll. Produces film-quality visuals. Veo 3.1 available.
- SORA: Best for creative, cinematic, and artistic content. High-quality generation with strong motion. Sora 2 and Sora 2 Pro available.
- HAILUO: Lower-tier provider for simple ambient content. Use only as a last resort when quality is not a priority.
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

IMPORTANT PROVIDER PREFERENCE ORDER:
1. Seedance (PRIMARY default for most content — general scenes, lifestyle, product, educational, social)
2. Runway 4.5 (cinematic, dramatic, emotional content when premium quality needed)
3. Kling (human subjects, people, faces, talking heads, testimonials)
4. Veo (premium B-roll, nature, establishing shots)
5. Sora (creative, artistic content)
6. Luma (product reveals)
7. Wan (text rendering, conceptual)
8. Remotion (infographics, motion graphics)
9. Hailuo (ONLY as absolute last resort — avoid recommending this provider)

When in doubt, default to Seedance. For fallbacks, prefer Runway 4.5, Kling, or Veo over Hailuo.
${availableProviders && availableProviders.length > 0 ? `
CONSTRAINT — only recommend providers from this list: ${availableProviders.join(', ')}
Do NOT recommend any provider not in the list above, even if it seems like a better fit.
If your top choice is not available, pick the next best available provider.
` : ''}
Respond with ONLY a JSON array (no markdown, no code blocks):
[
  {
    "sceneIndex": 0,
    "sceneId": "scene_id",
    "contentClassification": "cinematic|human_subjects|product_reveal|broll|conceptual_explanatory|infographic_diagram|motion_graphics|mixed",
    "recommendedProvider": "${providerEnum}",
    "fallbackProvider": "${providerEnum}",
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
          fallbackProvider: this.validateProvider(rec.fallbackProvider || 'runway'),
        };
      });
    } catch (error) {
      console.error('[IntelligentProvider] Failed to parse Claude response:', error);
      return this.fallbackProviderSelection(scenes).recommendations;
    }
  }

  private validateProvider(provider: string): string {
    const valid = ['seedance', 'runway', 'kling', 'luma', 'hailuo', 'wan', 'remotion', 'veo', 'sora'];
    const normalized = (provider || '').toLowerCase().trim();
    return valid.includes(normalized) ? normalized : 'seedance';
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
    if (baseProvider === 'seedance') {
      return 'seedance-2.0';
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

  private applyArtPresetPreferences(recommendations: ProviderRecommendation[], artPresetId: string, scenes?: SceneContent[]): ProviderRecommendation[] {
    const preset = getVisualArtPreset(artPresetId);
    if (!preset) return recommendations;

    const hierarchy = getProviderHierarchy(artPresetId);
    const isStylized = isStylizedPreset(artPresetId);
    const sceneMap = preset.sceneTypeProviderMap;

    console.log(`[IntelligentProvider] Applying art preset "${preset.name}" preferences: hierarchy=${hierarchy.primary}→[${hierarchy.fallback}], stylized=${isStylized}, hasSceneTypeMap=${!!sceneMap}`);

    const motionKeywords = /\b(arc|orbit|pull[- ]?back|push[- ]?in|tracking shot|crane|dolly|motion control|sweeping pan|circular)\b/i;

    return recommendations.map(rec => {
      if (rec.visualFormat === 'remotion-motion-graphics') return rec;

      if (isStylized && rec.visualFormat === 'ai-image-remotion') {
        console.log(`[IntelligentProvider] Stylized preset override: scene ${rec.sceneIndex} format ai-image-remotion → ai-video (${preset.name} needs full AI video)`);
        rec = { ...rec, visualFormat: 'ai-video' };
      }

      rec = {
        ...rec,
        recommendedProvider: hierarchy.primary,
        fallbackProvider: hierarchy.fallback[0] || rec.fallbackProvider,
        reasoning: `${rec.reasoning} (${preset.name}: ${hierarchy.reason})`,
      };

      let mappedProviders: string[] | null = null;
      let mappingKey: string | null = null;

      if (sceneMap) {
        const scene = scenes?.find(s => s.sceneIndex === rec.sceneIndex);
        const promptText = scene?.visualDirection || '';

        if (motionKeywords.test(promptText)) {
          mappedProviders = sceneMap['motion-control'] || null;
          mappingKey = 'motion-control (keyword)';
        }

        if (!mappedProviders && scene?.sceneType) {
          mappedProviders = sceneMap[scene.sceneType] || null;
          mappingKey = scene.sceneType;
        }

        if (!mappedProviders && rec.contentClassification) {
          mappedProviders = sceneMap[rec.contentClassification] || null;
          mappingKey = `${rec.contentClassification} (classification)`;
        }
      }

      if (mappedProviders && mappedProviders.length > 0) {
        const newProvider = mappedProviders[0];
        const newFallback = mappedProviders[1] || hierarchy.primary;
        console.log(`[IntelligentProvider] Art preset '${preset.name}' scene-type routed scene ${rec.sceneIndex} '${mappingKey}': ${rec.recommendedProvider} → ${newProvider}`);
        return {
          ...rec,
          recommendedProvider: newProvider,
          fallbackProvider: newFallback,
          reasoning: `${rec.reasoning} (${preset.name}: ${mappingKey} scene-type routing)`,
        };
      }

      console.log(`[IntelligentProvider] Art preset '${preset.name}' hierarchy: scene ${rec.sceneIndex} → ${hierarchy.primary}`);
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
        fallbackProvider: provider === 'seedance' ? 'runway' : 'seedance',
      };
    });

    if (artPresetId) {
      recommendations = this.applyArtPresetPreferences(recommendations, artPresetId, scenes);
    }

    return {
      recommendations,
      analysisTimestamp: new Date().toISOString(),
      totalScenes: scenes.length,
    };
  }

  private classifySceneByRules(scene: SceneContent): {
    provider: string;
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
      return { provider: 'seedance', classification: 'cinematic', confidence: 80, reasoning: 'Hook/CTA scenes — Seedance 2 GA primary provider with cinematic quality' };
    }

    if (sceneType === 'testimonial') {
      return { provider: 'seedance', classification: 'human_subjects', confidence: 85, reasoning: 'Testimonial — Seedance 2 GA handles human subjects well' };
    }

    if (sceneType === 'product') {
      return { provider: 'seedance', classification: 'product_reveal', confidence: 85, reasoning: 'Product scene — Seedance 2 GA primary provider' };
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
      return { provider: 'seedance', classification: 'broll', confidence: 75, reasoning: 'B-roll content — Seedance 2 GA primary provider' };
    }

    const scores = [
      { type: 'cinematic' as const, provider: 'seedance' as const, score: cinematicScore * 2 },
      { type: 'human_subjects' as const, provider: 'seedance' as const, score: humanScore * 1.5 },
      { type: 'product_reveal' as const, provider: 'seedance' as const, score: productScore * 1.8 },
      { type: 'broll' as const, provider: 'seedance' as const, score: brollScore * 1.3 },
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

    return { provider: 'seedance', classification: 'mixed', confidence: 60, reasoning: 'Default to Seedance 2 GA as primary provider' };
  }

  async recommendProviderForScene(scene: SceneContent, availableProviders?: string[]): Promise<ProviderRecommendation> {
    const batch = await this.analyzeAndRecommendProviders([scene], undefined, availableProviders);
    return batch.recommendations[0];
  }
}

export const intelligentProviderSelector = new IntelligentProviderSelectorService();
