import Anthropic from "@anthropic-ai/sdk";
import { brandContextService } from "./brand-context-service";
import { projectInstructionsService } from "./project-instructions-service";
import { getAnyBrandContext, getBrandNameOrDefault, type BrandContext } from "./brand-settings-service";

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
}

class ScriptParserService {
  private anthropic: Anthropic | null = null;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      console.log("[ScriptParser] Anthropic client configured");
    } else {
      console.warn("[ScriptParser] Anthropic API key not found");
    }
  }

  private getClient(): Anthropic {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    if (!this.anthropic) {
      throw new Error("Anthropic API not configured - set ANTHROPIC_API_KEY");
    }
    return this.anthropic;
  }

  async parseScript(
    script: string,
    options: ScriptParseOptions
  ): Promise<ParsedScript> {
    const client = this.getClient();

    console.log("[ScriptParser] Starting brand-aware script parsing...");

    const brandContext = await brandContextService.getScriptParsingContext();
    const aestheticContext = await brandContextService.getAestheticOnlyContext();
    const serviceMatches = await brandContextService.matchScriptToServices(script);
    const roleContext = await projectInstructionsService.getCondensedRoleContext();

    console.log(
      `[ScriptParser] Brand matches - Services: ${serviceMatches.services.length}, Products: ${serviceMatches.products.length}, Conditions: ${serviceMatches.conditions.length}`
    );

    const systemPrompt = await this.buildBrandAwareSystemPrompt(brandContext, roleContext, aestheticContext);
    const userPrompt = await this.buildParsingPrompt(script, options, serviceMatches);

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type");
      }

      return this.parseResponse(content.text, serviceMatches);
    } catch (error: any) {
      console.error("[ScriptParser] Parsing failed:", error.message);
      throw error;
    }
  }

  private async buildBrandAwareSystemPrompt(brandContext: string, roleContext: string, aestheticContext: string): Promise<string> {
    const brand = await getAnyBrandContext();
    const brandName = getBrandNameOrDefault(brand);
    const hasBrand = brand.brandName?.trim();
    const brandDesc = hasBrand
      ? `${brandName}${brand.tagline ? ` - ${brand.tagline}` : ''}`
      : 'the brand';
    const guidelinesBlock = brand.guidelines?.trim()
      ? `\nBRAND GUIDELINES (from user):\n${brand.guidelines}\n`
      : '';

    return `${roleContext}

You are an expert video script parser for ${brandDesc}.

${brandContext}

${aestheticContext}
${guidelinesBlock}
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

VISUAL DIRECTION RULES - CRITICAL:

## CORE PRINCIPLE: AUTHENTICITY AND RELATABILITY
The visual direction MUST match the emotional reality of the narration. Social media and TV audiences connect with visuals that mirror their own experience, not cinematic productions.

1. MATCH THE NARRATION'S REALITY
   - The visual must reflect the situation being described
   - NOT every scene needs a person — use objects, environments, close-ups, and B-roll
   - When people ARE shown, they must look like the audience (not models or actors)
   
   WRONG: "Close-up shot of a frustrated woman in her 30s standing on a modern bathroom scale, soft morning light filtering through frosted glass window creating gentle shadows, camera slowly pulls back..."
   RIGHT: "A bathroom scale with feet stepping on, showing a disappointing number"
   
   WRONG: "A fit, athletic person at the gym looking determined"
   RIGHT: "A calorie tracking app on a phone screen next to a half-eaten salad"
   
   WRONG: "${brandName} consultation room with cinematic lighting"
   RIGHT: "Supplement bottles lined up on a kitchen counter next to a glass of water"

2. VISUAL VARIETY — USE DIVERSE VISUAL TYPES
   - Object close-ups: scales, phones, food, products, supplements
   - Environment shots: empty kitchen, bathroom counter, desk, nature
   - B-roll: hands preparing food, water pouring, walking feet
   - Conceptual: wilting vs thriving plant, tangled vs untangled rope
   - People: use sparingly, only when narration specifically requires human emotion
   - Across all scenes, at MOST half should feature a person as the main subject

3. KEEP IT SIMPLE - 1-2 plain sentences max
   - ONE subject, ONE action, ONE setting
   - Describe what we SEE in plain language
   - NO camera angles, NO color palettes, NO lighting descriptions, NO cinematic language
   - Write as if describing a scene to a friend, not a film crew

4. REAL SETTINGS
   - Kitchen, bathroom, living room, bedroom, office, park
   - Places that look lived-in, not styled or cinematic
   - Everyday environments audiences recognize from their own life

5. WHEN TO MENTION "${brandName.toUpperCase()}":
   - Only in CTA, outro, or product showcase scenes
   - NEVER in educational/informational/hook/problem scenes
   - DO NOT describe fictional "${brandName}" locations

6. NEVER include text, words, signs, labels, logos, or written content in visual directions
   - AI video models cannot render readable text

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
    serviceMatches: { services: string[]; products: string[]; conditions: string[] }
  ): Promise<string> {
    const brand = await getAnyBrandContext();
    const brandName = getBrandNameOrDefault(brand);

    return `Parse this video script${brand.brandName?.trim() ? ` for ${brandName}` : ''}.

PLATFORM: ${options.platform}
VISUAL STYLE: ${options.visualStyle}
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
3. Write SIMPLE, AUTHENTIC visual directions (1-2 sentences) that match the emotional reality of the narration
4. Note audience resonance and brand opportunities
5. Create searchQuery for stock video (3-5 concise words)
6. Create fallbackQuery as alternative search approach

CRITICAL VISUAL DIRECTION RULES:
- Keep visual directions to 1-2 plain sentences. Describe what we SEE, not cinematic production details.
- The subject must visually match the situation in the narration (e.g., weight loss = someone with realistic body, not a fit model)
- Use everyday settings (kitchen, living room, bathroom) not styled cinematic locations
- NO camera angles, lighting rigs, color palettes, or film language
- Only mention "${brandName}" in CTA, outro, or product scenes
- NEVER include text, words, signs, labels, logos in visual directions - AI cannot render readable text.

Return ONLY valid JSON matching this structure:
{
  "scenes": [
    {
      "id": "scene-1",
      "type": "hook|problem|solution|benefit|cta|etc",
      "narration": "exact script text for this scene",
      "duration": 5,
      "visualDirection": "1-2 simple sentences describing what we see - authentic and relatable",
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
    serviceMatches: { services: string[]; products: string[]; conditions: string[] }
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
