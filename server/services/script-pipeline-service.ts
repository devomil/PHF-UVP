import { db } from "../db";
import { brandSettings } from "../../shared/schema";
import { llmClient } from "./piapi-llm-client";
import { getVisualArtPreset, isStylizedPreset, type VisualArtPreset } from "../../shared/config/visual-art-presets";
import { getTrendingHooks, type TrendResult } from "./trend-intelligence-service";

export interface PipelineContext {
  description: string;
  platform: string;
  targetDuration: number;
  targetAudience?: string | null;
  artPresetId?: string;
  productContext?: {
    productName: string;
    category: string;
    keyFeatures: string[];
    brandTone: string;
    colorPalette: string[];
    targetDemographic: string;
    visualDescription: string;
  } | null;
  scriptPresets?: {
    productName?: string;
    productProblem?: string;
    scriptTone?: string;
    callToAction?: string;
  } | null;
  projectType?: string | null;
  contentStructure?: string | null;
  trendHooks?: string[] | null;
}

export interface CreativeStrategy {
  narrativeFramework: string;
  coreMessage: string;
  primaryEmotion: string;
  openingHook: string;
  hooks: string[];
  productionNotes: string;
  targetAudienceInsight: string;
  toneGuidance: string;
}

export interface NarrativeArchitecture {
  scenes: NarrativeScene[];
  totalDuration: number;
  pacing: string;
}

interface NarrativeScene {
  order: number;
  type: string;
  purpose: string;
  duration: number;
  emotionalBeat: string;
  keyMessage: string;
}

export interface PipelineResult {
  strategy: CreativeStrategy;
  narrative: NarrativeArchitecture;
  scenes: any[];
  summary: {
    totalDuration: number;
    sceneCount: number;
    primaryService: string | null;
    targetConditions: string[];
    brandAlignment: string;
  };
}

interface BrandInfo {
  brandName: string;
  tagline: string;
  website: string;
  guidelines: string;
  industry: string;
  contentNiche: string;
  targetAudience: string;
  trendAnalysisEnabled: boolean;
}

async function loadBrandInfo(): Promise<BrandInfo> {
  const defaults: BrandInfo = { brandName: "", tagline: "", website: "", guidelines: "", industry: "", contentNiche: "", targetAudience: "", trendAnalysisEnabled: false };
  try {
    const [settings] = await db.select().from(brandSettings).limit(1);
    if (!settings) return defaults;
    return {
      brandName: settings.brandName || "",
      tagline: settings.tagline || "",
      website: settings.website || "",
      guidelines: settings.guidelines || "",
      industry: settings.industry || "",
      contentNiche: settings.contentNiche || "",
      targetAudience: settings.targetAudience || "",
      trendAnalysisEnabled: settings.trendAnalysisEnabled || false,
    };
  } catch {
    return defaults;
  }
}

async function loadTrendData(brand: BrandInfo, trendAnalysisEnabled: boolean): Promise<TrendResult | null> {
  if (!trendAnalysisEnabled) return null;
  if (!brand.industry || !brand.contentNiche) return null;
  try {
    return await getTrendingHooks(brand.industry, brand.contentNiche, brand.targetAudience);
  } catch (err: any) {
    console.warn("[ScriptPipeline] Trend data unavailable:", err.message?.substring(0, 100));
    return null;
  }
}

function buildPlatformRules(projectType: string | null | undefined, platform: string, contentStructure?: string | null): string {
  const projectTypePrompts: Record<string, string> = {
    "tiktok-reels": `TikTok / Reels (9:16, 15-30s) — Open with a strong hook in first 2 seconds. Fast-paced cuts, high energy. Every scene must deliver value immediately. End with clear punchy CTA. Bias scene types: hook, benefit, cta.`,
    "youtube-short": `YouTube Short (9:16, up to 60s) — Attention-grabbing hook. Mini story arc: problem → solution → payoff. High energy throughout. Bias scene types: hook, problem, solution, cta.`,
    "youtube-ad": `YouTube Ad (16:9, 30-60s) — First 5 seconds critical (viewer can skip). Front-load hook with strongest visual and copy. Cinematic widescreen. Bias scene types: hook, problem, solution, benefit, cta.`,
    "facebook-feed": `Facebook Feed (1:1, 15-30s) — Designed for autoplay with sound off. Bold text overlays for key messages. Concise and punchy. Bias scene types: hook, benefit, cta.`,
    "product-launch": `Product Launch (16:9, 90s) — Build anticipation with problem/pain. Reveal product as solution. Highlight 2-3 key features with benefit framing. Include social proof. Close with purchase-oriented CTA. Bias scene types: hook, problem, solution, feature, benefit, testimonial, cta.`,
    "educational": `Educational / Training (16:9, 2-5 min) — Clear section headers and numbered frameworks. Concept-then-example structure. On-screen text overlays for stats and lists. 3-4 micro-scenes per scene. Vary pacing. Bias scene types: explanation, demonstration, benefit, proof.${contentStructure ? ` Content structure: ${contentStructure} format.` : ""}`,
    "long-story": `Long Story / Deep Dive (16:9, 5-10 min) — Consistent narrative voice. Clear chapters with natural breaks. Bridge sentences between sections. Vary scene pacing. Include chapter title card moments. Bias scene types: story, explanation, feature, benefit, proof, testimonial.`,
  };
  if (projectType && projectTypePrompts[projectType]) {
    return projectTypePrompts[projectType];
  }
  return `Platform: ${platform}. Adapt pacing and structure to fit the platform's conventions.`;
}

function buildVisualDirectionRules(artPreset: VisualArtPreset | null, brandName: string): string {
  if (artPreset && isStylizedPreset(artPreset.id)) {
    return `VISUAL DIRECTION RULES — ${artPreset.name.toUpperCase()} STYLE:

STYLE CONTEXT: ${artPreset.description}
Avoid: ${artPreset.negativePromptAdditions.join(", ")}
${artPreset.globalStyleNotes ? `GLOBAL STYLE NOTES: ${artPreset.globalStyleNotes}` : ""}
${artPreset.cameraMotionHints ? `CAMERA MOTION SUGGESTIONS: ${artPreset.cameraMotionHints}` : ""}

Write each visual direction as a natural, vivid description (2-4 sentences, 40-80 words). Each MUST explicitly state the art style "${artPreset.styleMarkerPrefix || artPreset.name}" because AI video providers treat each prompt independently and default to photorealistic without it.

Describe:
- WHAT we see: specific characters, objects, environments
- HOW it looks: lighting, color mood, atmosphere
- The FEELING: emotional tone matching narration
- Optional: subtle camera motion hint

CRITICAL RULES:
- EVERY visual direction MUST include "${artPreset.styleMarkerPrefix || artPreset.name}"
- Be CONCRETE, not abstract. No "transformation", "journey", "representing"
- Vary openings — don't start every prompt the same way
- NEVER include readable text, words, signs, labels, or logos
- Vary visual types: characters, environments, objects, nature, hands doing things
- Only mention "${brandName}" in CTA/outro/product scenes

CHARACTER CONSISTENCY: If a recurring character appears, define their appearance in the FIRST scene and reference the EXACT SAME description in every subsequent scene.

EXAMPLES:
WRONG: "A warm, welcoming exploration through ${artPreset.name} depicting the healthcare journey"
WRONG: "Woman in her 40s sitting at kitchen table" (MISSING STYLE — will generate photorealistic)
RIGHT: "${artPreset.styleMarkerPrefix || artPreset.name} — A cheerful round-faced character with bright curious eyes and auburn hair waves from behind a sunny kitchen counter. Morning light streams through a window, casting soft warm shadows. Soft cinematic lighting, warm inviting tones."`;
  }

  return `VISUAL DIRECTION RULES — REALISTIC STYLE:

CORE PRINCIPLE: AUTHENTICITY AND RELATABILITY
Match the emotional reality of the narration. Social media audiences connect with visuals that mirror their own experience.

1. MATCH THE NARRATION'S REALITY — reflect the situation being described
2. VISUAL VARIETY — object close-ups, environments, B-roll, people (at MOST half of scenes)
3. KEEP IT SIMPLE — 1-2 plain sentences, 10-20 words. ONE subject, ONE action, ONE setting.
   NEVER join alternatives with "or". NEVER use abstract words. NO camera angles, lighting, cinematic language.
4. REAL SETTINGS — kitchen, bathroom, living room, office, park
5. Only mention "${brandName}" in CTA, outro, or product showcase scenes
6. NEVER include text, words, signs, labels, logos in visual directions`;
}

async function callLLMWithRetry(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  stageName: string,
  retries: number = 2
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await llmClient.createChatCompletion({
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens,
        temperature: 0.7,
      });
      console.log(`[ScriptPipeline] ${stageName} completed via ${result.provider} (attempt ${attempt + 1})`);
      return result.text;
    } catch (err: any) {
      console.warn(`[ScriptPipeline] ${stageName} attempt ${attempt + 1} failed: ${err.message?.substring(0, 120)}`);
      if (attempt === retries) throw err;
    }
  }
  throw new Error(`${stageName} failed after all retries`);
}

function extractJSON(text: string): any {
  let cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  }
  return JSON.parse(cleaned);
}

async function stageOneStrategy(ctx: PipelineContext, brand: BrandInfo, trends: TrendResult | null): Promise<CreativeStrategy> {
  const brandDesc = brand.brandName
    ? `${brand.brandName}${brand.tagline ? ` — ${brand.tagline}` : ""}`
    : "the brand";

  const toneMap: Record<string, string> = {
    educational: "Educational — informative, clear, expert-driven",
    emotional: "Emotional — heartfelt, empathetic, story-driven",
    urgency: "Urgency — time-sensitive, compelling, action-oriented",
    humor: "Humor — witty, lighthearted, entertaining",
    aspirational: "Aspirational — inspiring, forward-looking, empowering",
  };

  const systemPrompt = `You are a creative strategist specializing in short-form video marketing. You develop high-level creative strategies that guide script production.

You return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

  const trendBlock = trends
    ? `TRENDING HOOKS IN THIS SPACE:
${trends.hooks.map((h) => `- "${h.template}" (${h.psychologicalDriver})`).join("\n")}

TRENDING KEYWORDS: ${trends.keywords.slice(0, 8).join(", ")}

TRENDING FORMATS:
${trends.formats.map((f) => `- ${f.name}: ${f.description} (${f.why})`).join("\n")}

TREND INSIGHT: ${trends.insight}`
    : "";

  const hooksFromUser = ctx.trendHooks?.length
    ? `USER-SELECTED HOOKS:\n${ctx.trendHooks.map((h) => `- "${h}"`).join("\n")}`
    : "";

  const productBlock = ctx.productContext
    ? `PRODUCT:
- Name: ${ctx.productContext.productName}
- Category: ${ctx.productContext.category}
- Key Features: ${ctx.productContext.keyFeatures.join(", ")}
- Tone: ${ctx.productContext.brandTone}
- Target: ${ctx.productContext.targetDemographic}`
    : "";

  const presetsBlock = ctx.scriptPresets
    ? `SCRIPT DIRECTION:
${ctx.scriptPresets.productName ? `- Product: ${ctx.scriptPresets.productName}` : ""}
${ctx.scriptPresets.productProblem ? `- Problem it solves: ${ctx.scriptPresets.productProblem}` : ""}
- Tone: ${toneMap[ctx.scriptPresets.scriptTone || "educational"] || ctx.scriptPresets.scriptTone || "educational"}
- CTA: ${ctx.scriptPresets.callToAction || "learn-more"}`
    : "";

  const audienceStr = ctx.targetAudience || brand.targetAudience || "";

  const userPrompt = `Develop a creative strategy for a ${ctx.targetDuration}s video for ${brandDesc}.

${brand.industry ? `INDUSTRY: ${brand.industry}` : ""}
${brand.contentNiche ? `NICHE: ${brand.contentNiche}` : ""}
${audienceStr ? `TARGET AUDIENCE: ${audienceStr}` : ""}
${brand.guidelines ? `BRAND GUIDELINES:\n${brand.guidelines}` : ""}
${productBlock}
${presetsBlock}
${trendBlock}
${hooksFromUser}

SOURCE CONTENT / SCRIPT BRIEF:
"""
${ctx.description}
"""

Return a JSON object:
{
  "narrativeFramework": "The storytelling framework to use (e.g. Problem-Agitate-Solve, Before-After-Bridge, Hero's Journey micro-arc, etc.)",
  "coreMessage": "The single most important takeaway for the viewer (one sentence)",
  "primaryEmotion": "The dominant emotion to evoke (e.g. curiosity, relief, aspiration, urgency)",
  "hooks": ["3-5 specific opening hook lines that could start this video"],
  "productionNotes": "Key strategic notes for the scriptwriter about what to emphasize, avoid, or structure",
  "targetAudienceInsight": "A specific insight about the target audience that should drive the creative",
  "toneGuidance": "Detailed description of the voice and tone for this specific video"
}`;

  const raw = await callLLMWithRetry(systemPrompt, userPrompt, 2000, "Stage 1: Strategy");
  const parsed = extractJSON(raw);

  let hooks = Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 5) : [];
  let openingHook = hooks[0] || "";

  if (ctx.trendHooks?.length) {
    openingHook = ctx.trendHooks[0];
    hooks = [openingHook, ...hooks.filter((h: string) => h !== openingHook)].slice(0, 5);
  }

  return {
    narrativeFramework: parsed.narrativeFramework || "Problem-Solution",
    coreMessage: parsed.coreMessage || "",
    primaryEmotion: parsed.primaryEmotion || "curiosity",
    openingHook,
    hooks,
    productionNotes: parsed.productionNotes || "",
    targetAudienceInsight: parsed.targetAudienceInsight || "",
    toneGuidance: parsed.toneGuidance || "",
  };
}

async function stageTwoNarrative(
  ctx: PipelineContext,
  brand: BrandInfo,
  strategy: CreativeStrategy
): Promise<NarrativeArchitecture> {
  const brandDesc = brand.brandName || "the brand";
  const platformRules = buildPlatformRules(ctx.projectType, ctx.platform, ctx.contentStructure);

  const systemPrompt = `You are a narrative architect for short-form video. You take a creative strategy and turn it into a precise scene-by-scene structure with duration budgets.

You return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

  const userPrompt = `Build a scene-by-scene narrative architecture for a ${ctx.targetDuration}s video for ${brandDesc}.

CREATIVE STRATEGY:
- Framework: ${strategy.narrativeFramework}
- Core Message: ${strategy.coreMessage}
- Primary Emotion: ${strategy.primaryEmotion}
- Tone: ${strategy.toneGuidance}
- Production Notes: ${strategy.productionNotes}
- Opening Hook (MUST USE THIS EXACT LINE as the narration for Scene 1): "${strategy.openingHook}"

PLATFORM RULES:
${platformRules}

SCENE TYPES AVAILABLE:
hook, problem, agitation, solution, benefit, proof, product, testimonial, cta, explanation, process, intro, brand

SOURCE CONTENT:
"""
${ctx.description}
"""

Return a JSON object:
{
  "scenes": [
    {
      "order": 1,
      "type": "hook",
      "purpose": "Why this scene exists in the narrative",
      "duration": 5,
      "emotionalBeat": "What the viewer should feel during this scene",
      "keyMessage": "The key point this scene must communicate"
    }
  ],
  "totalDuration": ${ctx.targetDuration},
  "pacing": "Description of the overall pacing rhythm"
}

DURATION RULES:
- All scene durations must sum to approximately ${ctx.targetDuration} seconds
- Estimate duration based on ~2.5 words per second of narration
- Hook scenes: 3-5 seconds
- CTA scenes: 5-8 seconds
- Content scenes: 5-15 seconds each
- Create ${Math.max(4, Math.min(12, Math.ceil(ctx.targetDuration / 8)))} scenes`;

  const raw = await callLLMWithRetry(systemPrompt, userPrompt, 3000, "Stage 2: Narrative Architecture");
  const parsed = extractJSON(raw);

  const scenes: NarrativeScene[] = Array.isArray(parsed.scenes)
    ? parsed.scenes.map((s: any, i: number) => ({
        order: s.order ?? i + 1,
        type: s.type || "benefit",
        purpose: s.purpose || "",
        duration: s.duration || 5,
        emotionalBeat: s.emotionalBeat || "",
        keyMessage: s.keyMessage || "",
      }))
    : [];

  return {
    scenes,
    totalDuration: parsed.totalDuration || ctx.targetDuration,
    pacing: parsed.pacing || "",
  };
}

async function stageThreeSceneWriting(
  ctx: PipelineContext,
  brand: BrandInfo,
  strategy: CreativeStrategy,
  narrative: NarrativeArchitecture
): Promise<{ scenes: any[]; summary: any }> {
  const brandName = brand.brandName || "the brand";
  const artPreset = ctx.artPresetId ? getVisualArtPreset(ctx.artPresetId) : null;
  const visualRules = buildVisualDirectionRules(artPreset, brandName);
  const platformRules = buildPlatformRules(ctx.projectType, ctx.platform, ctx.contentStructure);
  const isStylized = artPreset && isStylizedPreset(artPreset.id);

  const productBlock = ctx.productContext
    ? `PRODUCT CONTEXT:
- Product: ${ctx.productContext.productName}
- Category: ${ctx.productContext.category}
- Features: ${ctx.productContext.keyFeatures.join(", ")}
- Tone: ${ctx.productContext.brandTone}
- Colors: ${ctx.productContext.colorPalette.join(", ")}
- Visual: ${ctx.productContext.visualDescription}
Incorporate this product naturally. At least one scene should showcase it prominently.`
    : "";

  const ctaMap: Record<string, string> = {
    "shop-now": "Shop Now — drive immediate purchase",
    "learn-more": "Learn More — encourage deeper exploration",
    "follow-us": "Follow Us — build ongoing social connection",
    "book-consultation": "Book a Consultation — generate leads",
  };

  const ctaDirective = ctx.scriptPresets?.callToAction
    ? `CTA DIRECTIVE: The final scene must use a "${ctaMap[ctx.scriptPresets.callToAction] || ctx.scriptPresets.callToAction}" call to action.`
    : "";

  const visualDirectionExample = isStylized
    ? `"${artPreset.styleMarkerPrefix || artPreset.name} — A cheerful round-faced character with bright curious eyes and auburn hair waves from behind a sunny kitchen counter. Morning light streams through a window, casting soft warm shadows. Soft cinematic lighting, shallow depth of field."`
    : `"A woman in her 40s sits at a kitchen table looking frustrated at a stack of supplement bottles. Warm morning light, cluttered countertop."`;

  const sceneBlueprint = narrative.scenes
    .map(
      (s) =>
        `Scene ${s.order} [${s.type}] — ${s.duration}s: ${s.purpose} | Emotional beat: ${s.emotionalBeat} | Key message: ${s.keyMessage}`
    )
    .join("\n");

  const systemPrompt = `You are an expert video scriptwriter for ${brand.brandName || "brands"}. You write compelling narration and visual directions for AI-generated video production.

${brand.guidelines ? `BRAND GUIDELINES:\n${brand.guidelines}\n` : ""}
${visualRules}

${platformRules}

You return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

  const userPrompt = `Write the full script for each scene below. Follow the narrative architecture exactly.

CREATIVE STRATEGY:
- Framework: ${strategy.narrativeFramework}
- Core Message: ${strategy.coreMessage}
- Tone: ${strategy.toneGuidance}
- Opening Hook (Scene 1 MUST use this exact line as narration): "${strategy.openingHook}"
${ctaDirective}
${productBlock}

NARRATIVE ARCHITECTURE (follow this scene structure exactly):
${sceneBlueprint}

Pacing: ${narrative.pacing}

SOURCE CONTENT:
"""
${ctx.description}
"""

For each scene, write:
1. Narration text (what the voiceover says — timed to fit the duration at ~2.5 words/sec)
2. Visual direction ${isStylized ? `(2-4 sentences in ${artPreset!.name} style, MUST include "${artPreset!.styleMarkerPrefix || artPreset!.name}")` : "(1-2 simple sentences, authentic and relatable)"}
3. A stock video search query (3-5 words)
4. Key points for text overlays

Return ONLY valid JSON:
{
  "scenes": [
    {
      "id": "scene-1",
      "type": "hook",
      "narration": "What the voiceover says",
      "duration": 5,
      "visualDirection": ${visualDirectionExample},
      "searchQuery": "3-5 word stock video search",
      "fallbackQuery": "alternative search query",
      "keyPoints": ["main point for text overlay"],
      "audienceResonance": "why this connects with viewers",
      "brandOpportunity": "messaging opportunity"
    }
  ],
  "summary": {
    "totalDuration": ${narrative.totalDuration},
    "sceneCount": ${narrative.scenes.length},
    "primaryService": null,
    "targetConditions": [],
    "brandAlignment": "how this aligns with the brand"
  }
}`;

  const raw = await callLLMWithRetry(systemPrompt, userPrompt, 8000, "Stage 3: Scene Writing");
  const parsed = extractJSON(raw);

  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const summary = parsed.summary || {
    totalDuration: narrative.totalDuration,
    sceneCount: scenes.length,
    primaryService: null,
    targetConditions: [],
    brandAlignment: "",
  };

  return { scenes, summary };
}

function buildFallbackStrategy(ctx: PipelineContext): CreativeStrategy {
  const tone = ctx.scriptPresets?.scriptTone || "educational";
  const openingHook = ctx.trendHooks?.[0] || `Discover how ${ctx.scriptPresets?.productName || "this"} can transform your routine`;
  return {
    narrativeFramework: "Problem-Solution",
    coreMessage: ctx.scriptPresets?.productProblem || "A better solution exists",
    primaryEmotion: "curiosity",
    openingHook,
    hooks: [openingHook],
    productionNotes: `Tone: ${tone}. Keep it concise and direct.`,
    targetAudienceInsight: ctx.targetAudience || "",
    toneGuidance: tone,
  };
}

function buildFallbackNarrative(ctx: PipelineContext): NarrativeArchitecture {
  const sceneCount = Math.max(4, Math.min(8, Math.ceil(ctx.targetDuration / 8)));
  const perScene = Math.round(ctx.targetDuration / sceneCount);
  const types = ["hook", "problem", "solution", "benefit", "cta"];
  const scenes: NarrativeScene[] = [];
  for (let i = 0; i < sceneCount; i++) {
    scenes.push({
      order: i + 1,
      type: types[Math.min(i, types.length - 1)],
      purpose: "",
      duration: i === sceneCount - 1 ? ctx.targetDuration - perScene * (sceneCount - 1) : perScene,
      emotionalBeat: "",
      keyMessage: "",
    });
  }
  return { scenes, totalDuration: ctx.targetDuration, pacing: "moderate" };
}

export async function runScriptPipeline(ctx: PipelineContext): Promise<PipelineResult> {
  if (!llmClient.isAvailable()) {
    throw new Error("No LLM API configured — set PIAPI_API_KEY or ANTHROPIC_API_KEY");
  }

  console.log(`[ScriptPipeline] Starting 3-stage pipeline for ${ctx.targetDuration}s ${ctx.platform} video`);

  const brand = await loadBrandInfo();
  const trends = await loadTrendData(brand, brand.trendAnalysisEnabled);
  if (trends) {
    console.log(`[ScriptPipeline] Loaded ${trends.hooks.length} trend hooks, ${trends.keywords.length} keywords`);
  }

  let strategy: CreativeStrategy;
  console.log("[ScriptPipeline] === Stage 1: Creative Strategy ===");
  try {
    strategy = await stageOneStrategy(ctx, brand, trends);
    console.log(`[ScriptPipeline] Strategy: framework="${strategy.narrativeFramework}", emotion="${strategy.primaryEmotion}", ${strategy.hooks.length} hooks`);
  } catch (err: any) {
    console.warn(`[ScriptPipeline] Stage 1 failed, using fallback strategy: ${err.message}`);
    strategy = buildFallbackStrategy(ctx);
  }

  let narrative: NarrativeArchitecture;
  console.log("[ScriptPipeline] === Stage 2: Narrative Architecture ===");
  try {
    narrative = await stageTwoNarrative(ctx, brand, strategy);
    console.log(`[ScriptPipeline] Architecture: ${narrative.scenes.length} scenes, ${narrative.totalDuration}s total, pacing="${(narrative.pacing || "").substring(0, 60)}..."`);
  } catch (err: any) {
    console.warn(`[ScriptPipeline] Stage 2 failed, using fallback narrative: ${err.message}`);
    narrative = buildFallbackNarrative(ctx);
  }

  console.log("[ScriptPipeline] === Stage 3: Scene Writing ===");
  try {
    const { scenes, summary } = await stageThreeSceneWriting(ctx, brand, strategy, narrative);
    console.log(`[ScriptPipeline] Written ${scenes.length} scenes with narration and visual directions`);
    return { strategy, narrative, scenes, summary };
  } catch (err: any) {
    console.warn(`[ScriptPipeline] Stage 3 failed, falling back to single-pass parser: ${err.message}`);
    try {
      const { scriptParserService } = await import("./script-parser-service");
      const fallbackParsed = await scriptParserService.parseScript(ctx.description, {
        platform: ctx.platform,
        visualStyle: "professional",
        targetDuration: ctx.targetDuration,
        artPresetId: ctx.artPresetId,
        productContext: ctx.productContext || undefined,
        scriptPresets: ctx.scriptPresets || undefined,
        projectType: ctx.projectType || undefined,
        contentStructure: ctx.contentStructure || undefined,
      });
      console.log(`[ScriptPipeline] Fallback parser produced ${fallbackParsed.scenes.length} scenes`);
      return {
        strategy,
        narrative,
        scenes: fallbackParsed.scenes,
        summary: fallbackParsed.summary || {
          totalDuration: ctx.targetDuration,
          sceneCount: fallbackParsed.scenes.length,
          primaryService: null,
          targetConditions: [],
          brandAlignment: "",
        },
      };
    } catch (fallbackErr: any) {
      console.error(`[ScriptPipeline] Fallback parser also failed: ${fallbackErr.message}`);
      throw new Error(`Script generation failed: ${err.message}`);
    }
  }
}
