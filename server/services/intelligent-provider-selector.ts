import Anthropic from '@anthropic-ai/sdk';

export interface SceneContent {
  sceneId: string;
  sceneIndex: number;
  sceneType: string;
  narration: string;
  visualDirection: string;
  duration: number;
}

export interface ProviderRecommendation {
  sceneId: string;
  sceneIndex: number;
  recommendedProvider: 'runway' | 'kling' | 'luma' | 'hailuo';
  confidence: number;
  reasoning: string;
  contentClassification: 'cinematic' | 'human_subjects' | 'product_reveal' | 'broll' | 'mixed';
  fallbackProvider: string;
}

export interface BatchProviderRecommendations {
  recommendations: ProviderRecommendation[];
  analysisTimestamp: string;
  totalScenes: number;
}

class IntelligentProviderSelectorService {
  private anthropic: Anthropic | null = null;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      console.log('[IntelligentProvider] Claude-based provider selection enabled');
    } else {
      console.warn('[IntelligentProvider] No Anthropic API key - using fallback rules');
    }
  }

  async analyzeAndRecommendProviders(scenes: SceneContent[]): Promise<BatchProviderRecommendations> {
    if (!this.anthropic || scenes.length === 0) {
      return this.fallbackProviderSelection(scenes);
    }

    console.log(`[IntelligentProvider] Analyzing ${scenes.length} scenes with Claude...`);

    try {
      const prompt = this.buildAnalysisPrompt(scenes);
      
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const recommendations = this.parseRecommendations(content.text, scenes);
      
      console.log('[IntelligentProvider] Claude analysis complete:');
      recommendations.forEach(r => {
        console.log(`  Scene ${r.sceneIndex + 1} (${r.sceneId}): ${r.recommendedProvider} (${r.contentClassification}, ${r.confidence}% confidence)`);
      });

      return {
        recommendations,
        analysisTimestamp: new Date().toISOString(),
        totalScenes: scenes.length,
      };
    } catch (error: any) {
      console.error('[IntelligentProvider] Claude analysis failed, using fallback:', error.message);
      return this.fallbackProviderSelection(scenes);
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
- RUNWAY: Best for cinematic, dramatic, emotional content. High-quality film-like visuals. Epic shots, dramatic lighting, emotional storytelling.
- KLING: Best for human subjects, people, faces, talking heads, testimonials. Natural human movement and expressions.
- LUMA: Best for product reveals, product shots, close-ups of objects, commercial product showcases.
- HAILUO: Best for B-roll, ambient footage, nature scenes, establishing shots, background visuals. Cost-effective for simpler content.

SCENES TO ANALYZE:
${scenesDescription}

For each scene, analyze the narration and visual direction to determine:
1. What type of content it primarily contains (cinematic, human_subjects, product_reveal, broll, or mixed)
2. Which provider would produce the best results
3. Your confidence level (0-100)
4. Brief reasoning

Respond with ONLY a JSON array (no markdown, no code blocks):
[
  {
    "sceneIndex": 0,
    "sceneId": "scene_id",
    "contentClassification": "cinematic|human_subjects|product_reveal|broll|mixed",
    "recommendedProvider": "runway|kling|luma|hailuo",
    "fallbackProvider": "runway|kling|luma|hailuo",
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
      
      return parsed.map((rec: any, idx: number) => ({
        sceneId: rec.sceneId || scenes[idx]?.sceneId || `scene_${idx}`,
        sceneIndex: rec.sceneIndex ?? idx,
        recommendedProvider: this.validateProvider(rec.recommendedProvider),
        confidence: Math.min(100, Math.max(0, rec.confidence || 70)),
        reasoning: rec.reasoning || 'AI analysis',
        contentClassification: this.validateClassification(rec.contentClassification),
        fallbackProvider: this.validateProvider(rec.fallbackProvider || 'kling'),
      }));
    } catch (error) {
      console.error('[IntelligentProvider] Failed to parse Claude response:', error);
      return this.fallbackProviderSelection(scenes).recommendations;
    }
  }

  private validateProvider(provider: string): 'runway' | 'kling' | 'luma' | 'hailuo' {
    const valid = ['runway', 'kling', 'luma', 'hailuo'];
    const normalized = (provider || '').toLowerCase().trim();
    return valid.includes(normalized) ? normalized as any : 'runway';
  }

  private validateClassification(classification: string): 'cinematic' | 'human_subjects' | 'product_reveal' | 'broll' | 'mixed' {
    const valid = ['cinematic', 'human_subjects', 'product_reveal', 'broll', 'mixed'];
    const normalized = (classification || '').toLowerCase().trim();
    return valid.includes(normalized) ? normalized as any : 'mixed';
  }

  private fallbackProviderSelection(scenes: SceneContent[]): BatchProviderRecommendations {
    console.log('[IntelligentProvider] Using rule-based fallback selection');
    
    const recommendations = scenes.map(scene => {
      const { provider, classification, confidence, reasoning } = this.classifySceneByRules(scene);
      
      return {
        sceneId: scene.sceneId,
        sceneIndex: scene.sceneIndex,
        recommendedProvider: provider,
        confidence,
        reasoning,
        contentClassification: classification,
        fallbackProvider: provider === 'runway' ? 'kling' : 'runway',
      };
    });

    return {
      recommendations,
      analysisTimestamp: new Date().toISOString(),
      totalScenes: scenes.length,
    };
  }

  private classifySceneByRules(scene: SceneContent): {
    provider: 'runway' | 'kling' | 'luma' | 'hailuo';
    classification: 'cinematic' | 'human_subjects' | 'product_reveal' | 'broll' | 'mixed';
    confidence: number;
    reasoning: string;
  } {
    const text = `${scene.narration} ${scene.visualDirection}`.toLowerCase();
    const sceneType = scene.sceneType.toLowerCase();

    const cinematicKeywords = ['cinematic', 'dramatic', 'epic', 'emotional', 'inspiring', 'powerful', 'stunning', 'breathtaking', 'majestic', 'sweeping', 'film'];
    const humanKeywords = ['person', 'people', 'face', 'talking', 'speaking', 'testimonial', 'interview', 'customer', 'woman', 'man', 'practitioner', 'expert', 'smile', 'expression'];
    const productKeywords = ['product', 'bottle', 'package', 'supplement', 'item', 'close-up', 'showcase', 'display', 'reveal', 'unboxing', 'box', 'container'];
    const brollKeywords = ['b-roll', 'broll', 'ambient', 'background', 'establishing', 'nature', 'landscape', 'scenery', 'atmosphere', 'environment', 'exterior'];

    const cinematicScore = cinematicKeywords.filter(k => text.includes(k)).length;
    const humanScore = humanKeywords.filter(k => text.includes(k)).length;
    const productScore = productKeywords.filter(k => text.includes(k)).length;
    const brollScore = brollKeywords.filter(k => text.includes(k)).length;

    if (sceneType === 'hook' || sceneType === 'cta') {
      return { provider: 'runway', classification: 'cinematic', confidence: 80, reasoning: 'Hook/CTA scenes benefit from cinematic impact' };
    }

    if (sceneType === 'testimonial') {
      return { provider: 'kling', classification: 'human_subjects', confidence: 90, reasoning: 'Testimonial requires natural human expressions' };
    }

    if (sceneType === 'product') {
      return { provider: 'luma', classification: 'product_reveal', confidence: 85, reasoning: 'Product scene needs detailed product showcase' };
    }

    if (sceneType === 'broll' || sceneType === 'explanation') {
      return { provider: 'hailuo', classification: 'broll', confidence: 75, reasoning: 'B-roll/explanation is cost-effective with Hailuo' };
    }

    const scores = [
      { type: 'cinematic' as const, provider: 'runway' as const, score: cinematicScore * 2 },
      { type: 'human_subjects' as const, provider: 'kling' as const, score: humanScore * 1.5 },
      { type: 'product_reveal' as const, provider: 'luma' as const, score: productScore * 1.8 },
      { type: 'broll' as const, provider: 'hailuo' as const, score: brollScore * 1.3 },
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
