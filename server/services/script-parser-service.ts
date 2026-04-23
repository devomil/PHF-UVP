import { llmClient } from "./piapi-llm-client";
import { brandContextService } from "./brand-context-service";
import { projectInstructionsService } from "./project-instructions-service";
import { getBrandContext, getBrandNameOrDefault, type BrandContext } from "./brand-settings-service";
import { getVisualArtPreset, isStylizedPreset } from "@shared/config/visual-art-presets";
import { evaluateSceneTextRouting } from "../utils/recraft-scene-policy";

export interface ParsedScene {
  id: string;
  type: string;
  narration: string;
  duration: number;
  visualDirection: string;
  searchQuery?: string;
  fallbackQuery?: string;
  contentType: string;
  status: string;
  keyPoints?: string[];
  serviceMatch?: string | null;
  productMatch?: string | null;
  conditionMatch?: string | null;
  audienceResonance?: string | null;
  brandOpportunity?: string | null;
}

export interface ParsedScriptSummary {
  totalDuration: number;
  sceneCount: number;
  primaryService?: string | null;
  targetConditions?: string[];
  brandAlignment?: string;
}

export interface ParsedScript {
  scenes: ParsedScene[];
  summary: ParsedScriptSummary;
  brandMatches: {
    services: string[];
    products: string[];
    conditions: string[];
  };
}

export interface ScriptParseOptions {
  platform: string;
  visualStyle: string;
  targetDuration?: number;
  artPresetId?: string;
  productContext?: {
    productName: string;
    category: string;
    keyFeatures: string[];
    brandTone: string;
    colorPalette: string[];
    targetDemographic: string;
    visualDescription: string;
  };
  scriptPresets?: {
    productName?: string;
    productProblem?: string;
    scriptTone?: string;
    callToAction?: string;
  };
  projectType?: string;
  contentStructure?: string;
}

class ScriptParserService {
  async parseScript(
    script: string,
    options: ScriptParseOptions
  ): Promise<ParsedScript> {
    if (!llmClient.isAvailable()) {
      throw new Error("No LLM API configured - set PIAPI_API_KEY or ANTHROPIC_API_KEY");
    }

    console.log("[ScriptParser] Starting brand-aware script parsing...");

    const brandContext = await brandContextService.getScriptParsingContext();
    const aestheticContext = await brandContextService.getAestheticOnlyContext();
    const serviceMatches = await brandContextService.matchScriptToServices(script);
    const roleContext = await projectInstructionsService.getCondensedRoleContext();

    console.log(
      `[ScriptParser] Brand matches - Services: ${serviceMatches.services.length}, Products: ${serviceMatches.products.length}, Conditions: ${serviceMatches.conditions.length}`
    );

    const artPreset = options.artPresetId ? getVisualArtPreset(options.artPresetId) : null;
    const systemPrompt = await this.buildBrandAwareSystemPrompt(brandContext, roleContext, aestheticContext, artPreset, options.productContext, options.scriptPresets, options.projectType, options.contentStructure);
    const userPrompt = await this.buildParsingPrompt(script, options, serviceMatches, artPreset);

    try {
      const result = await llmClient.createChatCompletion({
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 8000,
        preferDirect: true,
      });

      console.log(`[ScriptParser] LLM response via ${result.provider} (${result.model})`);
      return this.parseResponse(result.text, serviceMatches, artPreset);
    } catch (error: any) {
      console.error("[ScriptParser] Parsing failed:", error.message);
      throw error;
    }
  }

  private async buildBrandAwareSystemPrompt(brandContext: string, roleContext: string, aestheticContext: string, artPreset?: any, productContext?: ScriptParseOptions['productContext'], scriptPresets?: ScriptParseOptions['scriptPresets'], projectType?: string, contentStructure?: string): Promise<string> {
    const brand = await getBrandContext();
    const brandName = getBrandNameOrDefault(brand);
    const hasBrand = brand.brandName?.trim();
    const brandDesc = hasBrand
      ? `${brandName}${brand.tagline ? ` - ${brand.tagline}` : ''}`
      : 'the brand';
    const guidelinesBlock = brand.guidelines?.trim()
      ? `\nBRAND GUIDELINES (from user):\n${brand.guidelines}\n`
      : '';

    const productBlock = productContext ? `
PRODUCT CONTEXT (from uploaded product image analysis):
- Product: ${productContext.productName}
- Category: ${productContext.category}
- Key Features: ${productContext.keyFeatures.join(', ')}
- Brand Tone: ${productContext.brandTone}
- Color Palette: ${productContext.colorPalette.join(', ')}
- Target Demographic: ${productContext.targetDemographic}
- Visual: ${productContext.visualDescription}

IMPORTANT: Incorporate this product information naturally into narration and visual directions. Reference the product's actual features, colors, and appearance. At least one scene should showcase the product prominently.
` : '';

    const toneMap: Record<string, string> = {
      educational: 'Educational — informative, clear, expert-driven. Teach the audience something valuable.',
      emotional: 'Emotional — heartfelt, empathetic, story-driven. Connect on a deep personal level.',
      urgency: 'Urgency — time-sensitive, compelling, action-oriented. Create a sense of "act now."',
      humor: 'Humor — witty, lighthearted, entertaining. Make the audience smile while delivering the message.',
      aspirational: 'Aspirational — inspiring, forward-looking, empowering. Show the audience who they could become.',
    };
    const ctaMap: Record<string, string> = {
      'shop-now': 'Shop Now — drive immediate purchase action',
      'learn-more': 'Learn More — encourage deeper exploration',
      'follow-us': 'Follow Us — build ongoing social connection',
      'book-consultation': 'Book a Consultation — generate qualified leads',
    };

    const scriptPresetsBlock = scriptPresets ? `
SCRIPT TONE & DIRECTION (user-selected):
${scriptPresets.productName ? `- Product Name: ${scriptPresets.productName}` : ''}
${scriptPresets.productProblem ? `- Problem It Solves: ${scriptPresets.productProblem}` : ''}
- Tone: ${toneMap[scriptPresets.scriptTone || 'educational'] || scriptPresets.scriptTone}
- Call to Action: ${ctaMap[scriptPresets.callToAction || 'learn-more'] || scriptPresets.callToAction}

IMPORTANT: The script MUST match this tone throughout all scenes. The final scene (CTA) must use the specified call to action.${scriptPresets.productProblem ? ` Structure the narrative around the problem "${scriptPresets.productProblem}" and show how ${scriptPresets.productName || 'the product'} solves it.` : ''}
` : '';

    let projectTypeBlock = '';
    if (projectType) {
      const projectTypePrompts: Record<string, string> = {
        'tiktok-reels': `PROJECT FORMAT: TikTok / Reels (9:16, 15-30s)
- Open with a strong hook in the first 2 seconds — this is make-or-break
- Fast-paced cuts, high energy throughout
- Every scene must deliver value immediately — no slow buildups
- End with a clear, punchy call to action
- Bias scene types toward: hook, benefit, cta`,
        'youtube-short': `PROJECT FORMAT: YouTube Short (9:16, up to 60s)
- Start with an attention-grabbing hook
- Build a mini story arc: problem → solution → payoff
- Keep energy high throughout — viewers swipe away fast
- Bias scene types toward: hook, problem, solution, cta`,
        'youtube-ad': `PROJECT FORMAT: YouTube Ad (16:9, 30-60s)
- The first 5 seconds are critical — the viewer can skip after that
- Front-load the hook with the strongest visual and copy
- Cinematic widescreen framing, professional production quality
- Bias scene types toward: hook, problem, solution, benefit, cta`,
        'facebook-feed': `PROJECT FORMAT: Facebook Feed (1:1, 15-30s)
- Designed for autoplay with sound off — visual storytelling is paramount
- Bold text overlays for key messages (viewers may not hear audio)
- Concise and punchy — every second counts
- Bias scene types toward: hook, benefit, cta`,
        'product-launch': `PROJECT FORMAT: Product Launch Video (16:9, 90s)
- Build anticipation with a problem/pain scene
- Reveal the product as the solution — make this a moment
- Highlight 2-3 key features with benefit framing
- Include social proof if available
- Close with a strong purchase-oriented CTA
- Bias scene types toward: hook, problem, solution, feature, benefit, testimonial, cta`,
        'educational': `PROJECT FORMAT: Educational / Training Video (16:9, 2-5 min)
- Use clear section headers and numbered frameworks
- Follow concept-then-example structure throughout
- Include on-screen text overlays for key stats, frameworks, and numbered lists
- Use 3-4 micro-scenes per scene to allow concept buildup
- Vary pacing between dense information delivery and visual breathers
- Bias scene types toward: explanation, demonstration, benefit, proof
${contentStructure ? `- Content structure: ${contentStructure} format` : ''}`,
        'long-story': `PROJECT FORMAT: Long Story / Deep Dive (16:9, 5-10 min)
- Maintain a consistent narrative voice throughout all sections
- Structure content into clear chapters with natural breaks
- Each chapter should end with a bridge sentence leading to the next
- Vary scene pacing — use faster cuts for lists/frameworks, slower for emotional or conceptual moments
- Include chapter title card moments between major sections
- Bias scene types toward: story, explanation, feature, benefit, proof, testimonial`,
      };
      projectTypeBlock = projectTypePrompts[projectType] ? `\n${projectTypePrompts[projectType]}\n` : '';
    }

    return `${roleContext}

You are an expert video script parser for ${brandDesc}.

${brandContext}

${aestheticContext}
${guidelinesBlock}${productBlock}${scriptPresetsBlock}${projectTypeBlock}
YOUR ROLE:
You parse video scripts into scenes, identifying:
1. Scene breaks and types (hook, problem, solution, benefit, testimonial, cta)
2. ${hasBrand ? `${brandName} service/product connections for each scene` : 'Brand service/product connections for each scene'}
3. Visual directions that match the brand's aesthetic
4. Target audience resonance points
5. Brand messaging opportunities

SCENE TYPES:
- "hook": Opening that captures attention
- "problem": Depicts the challenge or pain point
- "agitation": Deepens the pain point
- "solution": Introduces ${hasBrand ? `${brandName}'s` : "the brand's"} approach
- "benefit": Shows transformation and positive outcomes
- "proof": Social proof, credentials, certifications
- "product": Showcases specific products or services
- "testimonial": Customer success stories
- "cta": Call to action (visit website, book consultation)
- "explanation": Educational content
- "process": Step-by-step demonstrations
- "intro": Introduction and context setting
- "brand": Brand values and mission

${artPreset && isStylizedPreset(artPreset.id) ? `
VISUAL DIRECTION RULES - ${artPreset.name.toUpperCase()} STYLE:

## STYLE CONTEXT
${artPreset.description}
Avoid: ${artPreset.negativePromptAdditions.join(', ')}
${artPreset.globalStyleNotes ? `\n## GLOBAL STYLE NOTES (include these qualities in every visual direction):\n${artPreset.globalStyleNotes}` : ''}
${artPreset.cameraMotionHints ? `\n## CAMERA MOTION SUGGESTIONS:\nUse subtle camera moves for cinematic feel: ${artPreset.cameraMotionHints}` : ''}

## HOW TO WRITE VISUAL DIRECTIONS
Write each visual direction as a natural, vivid description — the way a skilled art director would describe a shot to an animator. Each prompt MUST explicitly state the art style because AI video providers treat each prompt independently and will default to photorealistic if the style is not mentioned.

Each scene visual direction should be 2-4 sentences (40-80 words) describing:
- WHAT we see: specific characters, objects, environments — concrete and tangible
- HOW it looks: lighting quality, color mood, atmosphere — woven naturally into the description
- The FEELING: emotional tone matching the narration
- Optional: a subtle camera motion hint (e.g., "slow push-in", "gentle orbit")

## CRITICAL RULES
- EVERY visual direction MUST include the style marker "${artPreset.styleMarkerPrefix || artPreset.name}" — providers will generate photorealistic footage without it
- Be CONCRETE, not abstract. Describe physical things, not concepts like "transformation" or "journey"
- Do NOT start every prompt with the same words. Vary openings
- Do NOT use meta-descriptions like "representing" or "symbolizing" — describe what is literally visible
- NEVER include readable text, words, signs, labels, or logos — AI cannot render text
- Vary visual types across scenes: characters, environments, object close-ups, nature, hands doing things
- Only mention "${brandName}" in CTA/outro/product scenes

## CHARACTER CONSISTENCY
If the video features a recurring character, define their appearance in the FIRST scene (hair color/style, clothing, body type, distinguishing features) and reference the EXACT SAME description in every subsequent scene they appear in.

## EXAMPLES
WRONG: "A warm, welcoming exploration through ${artPreset.name} depicting the healthcare journey"
WRONG: "Woman in her 40s sitting at kitchen table, looking thoughtful and slightly frustrated." (MISSING STYLE — will generate photorealistic)
WRONG: "Close-up of everyday packaged foods on kitchen counter." (MISSING STYLE — will generate photorealistic)
RIGHT: "${artPreset.styleMarkerPrefix || artPreset.name} — A cheerful round-faced character with bright curious eyes and shoulder-length auburn hair waves from behind a sunny kitchen counter. Morning light streams through a large window, casting soft warm shadows across potted herbs and a steaming mug of tea. Soft cinematic lighting, warm inviting tones."
RIGHT: "${artPreset.styleMarkerPrefix || artPreset.name} — Close-up of 3D rendered colorful cereal boxes and snack packages arranged on a glossy kitchen counter. Each package has smooth rounded shapes with vibrant saturated colors. Shallow depth of field with soft ambient occlusion."
` : `
VISUAL DIRECTION RULES - CRITICAL:

## CORE PRINCIPLE: AUTHENTICITY AND RELATABILITY
The visual direction MUST match the emotional reality of the narration. Social media and TV audiences connect with visuals that mirror their own experience, not cinematic productions.

1. MATCH THE NARRATION'S REALITY
   - The visual must reflect the situation being described
   - NOT every scene needs a person — use objects, environments, close-ups, and B-roll

2. VISUAL VARIETY — USE DIVERSE VISUAL TYPES
   - Object close-ups: scales, phones, food, products, supplements
   - Environment shots: kitchen, bathroom, desk, nature
   - B-roll: hands preparing food, water pouring, walking feet
   - Conceptual: wilting vs thriving plant
   - People: use sparingly, at MOST half of scenes should feature a person

3. KEEP IT SIMPLE - 1-2 plain sentences max, 10-20 words
   - ONE subject, ONE action, ONE setting
   - NEVER join alternatives with "or"
   - NEVER use abstract words like "progression", "journey", "transformation"
   - NO camera angles, NO color palettes, NO lighting descriptions, NO cinematic language

4. REAL SETTINGS - Kitchen, bathroom, living room, office, park

5. WHEN TO MENTION "${brandName.toUpperCase()}":
   - Only in CTA, outro, or product showcase scenes
   - NEVER in educational/informational/hook/problem scenes

6. NEVER include text, words, signs, labels, logos, or written content in visual directions
   - AI video models cannot render readable text
`}

OUTPUT FORMAT:
Return a JSON object with scenes array. Each scene should include:
- id: unique identifier
- type: scene type from list above
- narration: the script text for this scene
- duration: estimated seconds (based on reading speed ~150 words/min or ~2.5 words/sec)
- visualDirection: detailed visual description matching brand aesthetic
- searchQuery: 3-5 word stock video search query
- fallbackQuery: alternative search query
- keyPoints: main points for text overlays
- serviceMatch: ${hasBrand ? `${brandName} service` : 'brand service'} if relevant
- productMatch: ${hasBrand ? `${brandName} product` : 'brand product'} if relevant
- conditionMatch: Health condition being addressed
- audienceResonance: Why this connects with target audience
- brandOpportunity: Messaging opportunity for brand values`;
  }

  private async buildParsingPrompt(
    script: string,
    options: ScriptParseOptions,
    serviceMatches: { services: string[]; products: string[]; conditions: string[] },
    artPreset?: any
  ): Promise<string> {
    const brand = await getBrandContext();
    const brandName = getBrandNameOrDefault(brand);
    const isStylized = artPreset && isStylizedPreset(artPreset.id);

    const visualDirectionGuidance = isStylized
      ? `3. Write VIVID visual directions (2-4 sentences, 40-80 words) in ${artPreset.name} style. EVERY visual direction MUST explicitly include "${artPreset.styleMarkerPrefix || artPreset.name}" — AI video providers default to photorealistic without the style marker. Describe concrete scenes with characters, objects, environments, lighting, and mood.`
      : `3. Write SIMPLE, AUTHENTIC visual directions (1-2 sentences) that match the emotional reality of the narration`;

    const visualRules = isStylized
      ? `CRITICAL VISUAL DIRECTION RULES (${artPreset.name.toUpperCase()} STYLE):
- EVERY visual direction MUST include the style marker "${artPreset.styleMarkerPrefix || artPreset.name}" — AI providers default to photorealistic without it
- Write 2-4 sentences per scene (40-80 words) describing CONCRETE visuals — what we literally see
- Describe specific characters (features, expressions, poses), objects, and environments in the ${artPreset.name} style
- Include lighting, color mood, and optional camera motion woven into the description
- Do NOT use abstract words like "representing", "symbolizing", "journey", "transformation"
- Vary openings — don't start every prompt the same way
- Only mention "${brandName}" in CTA, outro, or product scenes
- NEVER include readable text, words, signs, labels, logos — AI cannot render text
${artPreset.globalStyleNotes ? `- Style qualities to convey: ${artPreset.globalStyleNotes}` : ''}`
      : `CRITICAL VISUAL DIRECTION RULES:
- Keep visual directions to 1-2 plain sentences. Describe what we SEE, not cinematic production details.
- The subject must visually match the situation in the narration
- Use everyday settings (kitchen, living room, bathroom) not styled cinematic locations
- NO camera angles, lighting rigs, color palettes, or film language
- Only mention "${brandName}" in CTA, outro, or product scenes
- NEVER include text, words, signs, labels, logos in visual directions - AI cannot render readable text.`;

    const visualDirectionExample = isStylized
      ? `"${artPreset.styleMarkerPrefix || artPreset.name} — A cheerful round-faced character with bright curious eyes and auburn hair waves from behind a sunny kitchen counter. Morning light streams through a window, casting soft warm shadows across potted herbs and a steaming mug. Soft cinematic lighting, shallow depth of field."`
      : `"1-2 simple sentences describing what we see - authentic and relatable"`;

    return `Parse this video script${brand.brandName?.trim() ? ` for ${brandName}` : ''}.

PLATFORM: ${options.platform}
VISUAL STYLE: ${options.visualStyle}${artPreset ? `\nART PRESET: ${artPreset.name} - ${artPreset.description}` : ''}
${options.targetDuration ? `TARGET DURATION: ${options.targetDuration} seconds` : ""}

PRE-IDENTIFIED MATCHES (use these as hints):
- Services mentioned: ${serviceMatches.services.join(", ") || "None detected"}
- Products mentioned: ${serviceMatches.products.join(", ") || "None detected"}
- Health conditions: ${serviceMatches.conditions.join(", ") || "None detected"}

SCRIPT TO PARSE:
"""
${script}
"""

Parse this into scenes with brand awareness. For each scene:
1. Identify the scene type and purpose
2. Connect to relevant brand services/products
${visualDirectionGuidance}
4. Note audience resonance and brand opportunities
5. Create searchQuery for stock video (3-5 concise words)
6. Create fallbackQuery as alternative search approach

${visualRules}

Return ONLY valid JSON matching this structure:
{
  "scenes": [
    {
      "id": "scene-1",
      "type": "hook|problem|solution|benefit|cta|etc",
      "narration": "exact script text for this scene",
      "duration": 5,
      "visualDirection": ${visualDirectionExample},
      "searchQuery": "3-5 word stock video search",
      "fallbackQuery": "alternative search query",
      "keyPoints": ["main point for text overlay"],
      "serviceMatch": "brand service name or null",
      "productMatch": "brand product name or null",
      "conditionMatch": "health condition or null",
      "audienceResonance": "why this connects with target audience",
      "brandOpportunity": "PHF value or messaging opportunity"
    }
  ],
  "summary": {
    "totalDuration": 60,
    "sceneCount": 8,
    "primaryService": "main PHF service featured",
    "targetConditions": ["list of conditions addressed"],
    "brandAlignment": "how well this aligns with PHF messaging"
  }
}`;
  }

  private parseResponse(
    responseText: string,
    serviceMatches: { services: string[]; products: string[]; conditions: string[] },
    artPreset?: any
  ): ParsedScript {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const scenes: ParsedScene[] = parsed.scenes.map((scene: any, index: number) => ({
        id: scene.id || `scene-${index + 1}`,
        type: this.validateSceneType(scene.type),
        narration: scene.narration || "",
        duration: scene.duration || 5,
        visualDirection: scene.visualDirection || "",
        searchQuery: scene.searchQuery || "",
        fallbackQuery: scene.fallbackQuery || "",
        keyPoints: scene.keyPoints || [],
        contentType: this.inferContentType(scene),
        status: "pending",
        serviceMatch: scene.serviceMatch || null,
        productMatch: scene.productMatch || null,
        conditionMatch: scene.conditionMatch || null,
        audienceResonance: scene.audienceResonance || null,
        brandOpportunity: scene.brandOpportunity || null,
      }));

      if (artPreset && isStylizedPreset(artPreset.id)) {
        const keywords = artPreset.styleKeywords || [];
        const prefix = artPreset.styleMarkerPrefix || artPreset.name;
        let enforced = 0;
        for (const scene of scenes) {
          if (!scene.visualDirection) continue;
          const dirLower = scene.visualDirection.toLowerCase();
          const hasStyleMarker = keywords.length > 0
            ? keywords.some((kw: string) => dirLower.includes(kw))
            : false;
          if (!hasStyleMarker) {
            scene.visualDirection = `${prefix} — ${scene.visualDirection}`;
            enforced++;
          }
        }
        if (enforced > 0) {
          console.log(`[ScriptParser] Style enforcement: prepended "${prefix}" to ${enforced}/${scenes.length} scenes missing style markers`);
        }
      }

      // Brand environmental-text injection: when narration references a known
      // brand/location but the visual direction never mentions a sign or label,
      // append a concrete signage element so downstream Recraft routing has
      // real text to render. Keeps existing visual direction intact otherwise.
      let injected = 0;
      for (const scene of scenes) {
        const routing = evaluateSceneTextRouting({
          narration: scene.narration,
          visualDirection: scene.visualDirection,
          sceneType: scene.type,
        });
        if (routing.needsTextInjection && routing.suggestedTextElement) {
          // PREPEND so it survives Recraft's 980-char prompt clamp (which truncates from the end).
          scene.visualDirection = `${routing.suggestedTextElement} ${(scene.visualDirection ?? '').trimStart()}`.trim();
          injected++;
          console.log(`[ScriptParser] Brand text injected into scene ${scene.id}: "${routing.suggestedTextElement}"`);
        }
      }
      if (injected > 0) {
        console.log(`[ScriptParser] Brand text injection: updated ${injected}/${scenes.length} scenes`);
      }

      console.log(`[ScriptParser] Parsed ${scenes.length} scenes with brand awareness`);

      return {
        scenes,
        summary: parsed.summary || {
          totalDuration: scenes.reduce((sum: number, s: ParsedScene) => sum + s.duration, 0),
          sceneCount: scenes.length,
          primaryService: serviceMatches.services[0] || null,
          targetConditions: serviceMatches.conditions,
          brandAlignment: "Analyzed",
        },
        brandMatches: serviceMatches,
      };
    } catch (error: any) {
      console.error("[ScriptParser] Failed to parse response:", error.message);
      throw error;
    }
  }

  private validateSceneType(type: string): string {
    const validTypes = [
      "hook",
      "problem",
      "agitation",
      "solution",
      "benefit",
      "proof",
      "product",
      "testimonial",
      "cta",
      "explanation",
      "story",
      "broll",
      "process",
      "intro",
      "brand",
      "feature",
      "social_proof",
      "chapter-title",
    ];
    return validTypes.includes(type) ? type : "broll";
  }

  private inferContentType(scene: any): string {
    const narration = (scene.narration || "").toLowerCase();
    const visual = (scene.visualDirection || "").toLowerCase();
    const combined = narration + " " + visual;

    if (
      combined.includes("person") ||
      combined.includes("woman") ||
      combined.includes("man") ||
      combined.includes("people") ||
      combined.includes("face") ||
      combined.includes("customer")
    ) {
      return "person";
    }
    if (
      combined.includes("product") ||
      combined.includes("supplement") ||
      combined.includes("bottle") ||
      combined.includes("package")
    ) {
      return "product";
    }
    if (
      combined.includes("farm") ||
      combined.includes("field") ||
      combined.includes("garden") ||
      combined.includes("nature") ||
      combined.includes("outdoor")
    ) {
      return "nature";
    }
    if (
      combined.includes("abstract") ||
      combined.includes("concept") ||
      combined.includes("metaphor")
    ) {
      return "abstract";
    }
    return "lifestyle";
  }
}

export const scriptParserService = new ScriptParserService();
