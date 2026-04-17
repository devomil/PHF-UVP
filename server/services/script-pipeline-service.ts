import { db } from "../db";
import { brandSettings } from "../../shared/schema";
import { llmClient } from "./piapi-llm-client";
import { getVisualArtPreset, isStylizedPreset, getAllVisualArtPresets, type VisualArtPreset } from "../../shared/config/visual-art-presets";
import { getTrendingHooks, type TrendResult } from "./trend-intelligence-service";
import { getProjectPurpose, getContentTagForSceneType } from "../../shared/config/project-types";
import { getSceneContentTagIds } from "../../shared/config/scene-content-tags";

export interface PipelineContext {
  description: string;
  platform: string;
  targetDuration: number;
  targetAudience?: string | null;
  artPresetId?: string;
  artPresetIds?: string[];
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
  projectPurpose?: string | null;
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
  styleRationale?: string;
  summary: {
    totalDuration: number;
    sceneCount: number;
    primaryService: string | null;
    targetConditions: string[];
    brandAlignment: string;
  };
}

const ALLOWED_FRAMEWORKS: Record<string, string> = {
  "PAS": "PAS \u2014 Problem \u2192 Agitate \u2192 Solution",
  "AIDA": "AIDA \u2014 Attention \u2192 Interest \u2192 Desire \u2192 Action",
  "StoryBrand": "StoryBrand \u2014 Hero \u2192 Problem \u2192 Guide \u2192 Plan \u2192 Action \u2192 Result",
  "BeforeAfter": "Before & After \u2014 Current State \u2192 Transformation \u2192 New Reality",
  "SocialProof": "Social Proof \u2014 Claim \u2192 Evidence \u2192 Testimonial \u2192 CTA",
  "EducateThenSell": "Educate Then Sell \u2014 Teach Value \u2192 Position Product \u2192 Offer",
};

const FRAMEWORK_KEYS = Object.keys(ALLOWED_FRAMEWORKS);
const DEFAULT_FRAMEWORK = "PAS";

function normalizeFramework(raw: string): string {
  if (!raw) return ALLOWED_FRAMEWORKS[DEFAULT_FRAMEWORK];
  const lower = raw.toLowerCase().replace(/[^a-z]/g, "");
  for (const [key, display] of Object.entries(ALLOWED_FRAMEWORKS)) {
    if (lower === key.toLowerCase().replace(/[^a-z]/g, "")) return display;
    if (lower.includes(key.toLowerCase().replace(/[^a-z]/g, ""))) return display;
  }
  if (lower.includes("problem") && (lower.includes("agitate") || lower.includes("solution"))) return ALLOWED_FRAMEWORKS["PAS"];
  if (lower.includes("attention") || lower.includes("aida")) return ALLOWED_FRAMEWORKS["AIDA"];
  if (lower.includes("story") || lower.includes("hero")) return ALLOWED_FRAMEWORKS["StoryBrand"];
  if (lower.includes("before") && lower.includes("after")) return ALLOWED_FRAMEWORKS["BeforeAfter"];
  if (lower.includes("social") || lower.includes("proof") || lower.includes("testimonial")) return ALLOWED_FRAMEWORKS["SocialProof"];
  if (lower.includes("educate") || lower.includes("teach")) return ALLOWED_FRAMEWORKS["EducateThenSell"];
  return ALLOWED_FRAMEWORKS[DEFAULT_FRAMEWORK];
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
  retries: number = 2,
  preferDirect: boolean = false
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await llmClient.createChatCompletion({
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens,
        temperature: 0.7,
        preferDirect,
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

/**
 * Phase 43: Detect when a generated imagePrompt drifts away from the literal
 * subjects mentioned in the narration. Returns the list of significant nouns
 * from the narration that are absent from the prompt+visualDirection.
 */
const NARRATION_NOUN_STOPWORDS = new Set([
  'about','above','across','after','against','along','among','around','because','before','behind','below','beneath','beside','between','beyond','during','either','every','everyone','everything','except','further','having','herself','himself','itself','myself','others','please','really','should','simply','someone','something','therefore','through','toward','towards','within','without','would','could','their','these','those','there','where','which','while','whose','being','doing','going','great','still','always','never','often','sometimes','today','tomorrow','really','actually','probably','maybe','people','things','stuff'
]);

function extractNarrationNouns(narration: string): string[] {
  return Array.from(new Set(
    (narration || '').toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length >= 5 && !NARRATION_NOUN_STOPWORDS.has(w))
  ));
}

function detectNarrationDrift(narration: string, imagePrompt: string, visualDirection: string): { drift: boolean; missing: string[]; nouns: string[] } {
  const nouns = extractNarrationNouns(narration);
  if (nouns.length < 2 || !imagePrompt) {
    return { drift: false, missing: [], nouns };
  }
  const haystack = `${imagePrompt} ${visualDirection || ''}`.toLowerCase();
  const missing = nouns.filter((n) => !haystack.includes(n));
  const drift = missing.length >= Math.ceil(nouns.length * 0.6);
  return { drift, missing, nouns };
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

function extractPartialScenesJSON(text: string): { scenes: any[] } {
  let cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const scenesMatch = cleaned.match(/"scenes"\s*:\s*\[/);
  if (!scenesMatch || scenesMatch.index === undefined) return { scenes: [] };

  const arrayStart = scenesMatch.index + scenesMatch[0].length - 1;
  let substr = cleaned.substring(arrayStart);

  let braceDepth = 0;
  let inString = false;
  let escape = false;
  const scenes: any[] = [];
  let lastObjEnd = 0;

  for (let i = 0; i < substr.length; i++) {
    const ch = substr[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (braceDepth === 0) lastObjEnd = i;
      braceDepth++;
    } else if (ch === '}') {
      braceDepth--;
      if (braceDepth === 0) {
        const objStr = substr.substring(lastObjEnd, i + 1);
        try {
          scenes.push(JSON.parse(objStr));
        } catch {}
      }
    } else if (ch === ']' && braceDepth === 0) {
      break;
    }
  }

  console.log(`[Pipeline S4] Partial JSON recovery: extracted ${scenes.length} complete scene objects`);
  return { scenes };
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
  "narrativeFramework": "Choose exactly one: PAS, AIDA, StoryBrand, BeforeAfter, SocialProof, or EducateThenSell",
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
    narrativeFramework: normalizeFramework(parsed.narrativeFramework || ""),
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
- Visual Appearance: ${ctx.productContext.visualDescription}
IMPORTANT: Incorporate this product naturally. At least one scene (preferably a "product" or "solution" type) MUST describe the actual product in the visual direction — reference its physical appearance (${ctx.productContext.visualDescription}) so the AI video generator can depict it accurately. NEVER describe text, brand names, or label wording on the product — AI video models CANNOT render readable text and it will appear garbled. Describe only the product's shape, color, and container type. The uploaded product image will be used as a starting frame for that scene.`
    : "";

  const ctaMap: Record<string, string> = {
    "shop-now": "Shop Now — drive immediate purchase",
    "learn-more": "Learn More — encourage deeper exploration",
    "follow-us": "Follow Us — build ongoing social connection",
    "book-consultation": "Book a Consultation — generate leads",
  };

  const ctaDirective = ctx.scriptPresets?.callToAction
    ? `CTA DIRECTIVE: The final scene must use a "${ctaMap[ctx.scriptPresets.callToAction] || ctx.scriptPresets.callToAction}" call to action. Mention the brand name or website directly instead of referring to links.`
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

CRITICAL RULES FOR NARRATION:
- NEVER say "link below", "link in bio", "click the link", "link in the description", or any reference to clickable links. These are generated videos — there are no clickable elements.
- For CTAs, say the brand name or website URL directly (e.g. "Visit ${brand.website || brand.brandName || "our website"}" or "Search for ${brand.brandName || "us"} online").
- Keep narration natural and conversational. Avoid sounding like a text ad.

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

function buildProviderHints(primary: string): string {
  const base = primary.split('-')[0];
  const hints: Record<string, string> = {
    sora: 'Optimize for Sora — use rich scene description, strong physics, emotional atmosphere, environmental storytelling.',
    runway: 'Optimize for Runway — emphasize cinematic composition, dramatic lighting contrasts, film-grade color grading, painterly quality.',
    kling: 'Optimize for Kling — emphasize character consistency, natural fluid motion, warm color grading, expressive faces.',
    veo: 'Optimize for Veo — leverage photorealistic rendering, precise object physics, natural motion, coherent spatial environments.',
    hailuo: 'Optimize for Hailuo — emphasize clean compositions, smooth camera motion, consistent character appearance.',
    hunyuan: 'Optimize for Hunyuan — emphasize detailed textures, atmospheric depth, cinematic framing.',
  };
  return hints[base] || 'Optimize for cinematic quality with rich scene description and atmospheric depth.';
}

function buildArtStyleBlock(artPreset: VisualArtPreset | null): string {
  if (!artPreset) {
    return `ART STYLE: Cinematic Realism
STYLE SUFFIX TO APPEND: natural lighting, shallow depth of field, photorealistic. No text in scene.
NEGATIVE PROMPT GUIDANCE: blurry, low quality, text, watermark, logo, words, labels`;
  }
  const suffix = [
    artPreset.imagePromptPrefix,
    artPreset.imagePromptSuffix,
    artPreset.globalStyleNotes || '',
  ].filter(Boolean).join(' ');
  return `ART STYLE: ${artPreset.name}
STYLE DESCRIPTION: ${artPreset.description}
STYLE MARKER (MUST appear in every visual direction): ${artPreset.styleMarkerPrefix || artPreset.name}
STYLE SUFFIX TO APPEND: ${suffix}. No text, no labels, no readable words in scene.
${artPreset.cameraMotionHints ? `CAMERA MOTION SUGGESTIONS: ${artPreset.cameraMotionHints}` : ''}
${artPreset.globalStyleNotes ? `GLOBAL STYLE NOTES: ${artPreset.globalStyleNotes}` : ''}
NEGATIVE PROMPT GUIDANCE: ${artPreset.negativePromptAdditions.join(', ')}, text, watermark, logo, words, labels`;
}

async function stageFourVisualDirections(
  stage3Scenes: any[],
  strategy: CreativeStrategy,
  narrative: NarrativeArchitecture,
  ctx: PipelineContext,
  brand: BrandInfo,
): Promise<{ scenes: any[]; styleRationale?: string }> {
  const multiStyleMode = ctx.artPresetIds && ctx.artPresetIds.length > 1;
  const artPresets = multiStyleMode
    ? ctx.artPresetIds!.map(id => getVisualArtPreset(id)).filter(Boolean) as VisualArtPreset[]
    : [];
  const singlePreset = !multiStyleMode && ctx.artPresetId ? getVisualArtPreset(ctx.artPresetId) : null;
  const artPreset = multiStyleMode ? null : singlePreset;
  const isStylized = !multiStyleMode && singlePreset && isStylizedPreset(singlePreset.id);
  const primaryProvider = multiStyleMode ? 'kling-2.6-pro' : (singlePreset?.providerHierarchy?.primary || 'kling-2.6-pro');
  const providerHints = multiStyleMode
    ? 'Provider selection will be determined per-scene based on assigned art style. Write visual prompts that work well across multiple AI video models.'
    : buildProviderHints(primaryProvider);

  let artStyleBlock: string;
  if (multiStyleMode && artPresets.length > 1) {
    const styleDescriptions = artPresets.map((p, i) => {
      return `STYLE ${i + 1}: "${p.id}" — ${p.name}
  Description: ${p.description}
  Style Marker: ${p.styleMarkerPrefix || p.name}
  Camera Hints: ${p.cameraMotionHints || 'standard cinematic'}
  Global Notes: ${p.globalStyleNotes || ''}
  Negative: ${p.negativePromptAdditions.join(', ')}`;
    }).join('\n\n');
    artStyleBlock = `MULTI-STYLE MODE — You have ${artPresets.length} art styles available. For EACH scene, choose the single best-fitting style based on the narration content and emotional beat.

AVAILABLE STYLES:
${styleDescriptions}

STYLE ASSIGNMENT RULES:
- Each scene MUST include "assignedStyleId" in the JSON output with the chosen style's id (e.g. "${artPresets[0].id}")
- The chosen style's marker MUST appear in every visual direction prompt for that scene
- Match scientific/medical content to scientific-medical style, emotional/human content to cinematic-realism, abstract/process content to 3d-illustration, etc.
- Ensure visual variety — don't assign all scenes the same style unless the content truly demands it
- Micro-scenes inherit their parent scene's assigned style
${ctx.projectPurpose ? `\nPROJECT PURPOSE STYLE BIAS: The project purpose is "${ctx.projectPurpose}". Use this to bias style selection:
- "educate-patient": Prefer scientific-medical for explanation/proof scenes, cinematic-realism for testimonials, lifestyle for hooks/benefits
- "build-trust": Prefer cinematic-realism for testimonials/proof, lifestyle for hooks/benefits
- "promote-service" / "drive-bookings": Prefer cinematic-realism for product/solution scenes, lifestyle for hooks
- "social-awareness": Prefer lifestyle and collage styles for authentic feel
- "product-selling": Prefer cinematic-realism for product scenes, 3d-illustration for features` : ''}`;
  } else {
    artStyleBlock = buildArtStyleBlock(artPreset);
  }

  const systemPrompt = `You are a world-class AI video director, cinematographer, and prompt engineer with deep expertise in generative AI video models (Kling, Runway, Sora, Veo). You write visual direction prompts that produce stunning, cinematic, emotionally resonant AI video output. You think like a creative director — using visual metaphors, symbolic imagery, and narrative-driven compositions rather than literal or generic descriptions. Every prompt you write is designed to produce a 'wow' reaction from the viewer.

${artStyleBlock}

${providerHints}

## 7-LAYER CINEMATIC FRAMEWORK
Build EVERY visual direction with ALL of these layers:
1. **Subject anchor** — Who/what is the focal point, with precise physical description, pose, positioning
2. **Environment** — Specific setting with named materials, textures, depth layers (foreground bokeh elements, midground subject, background atmosphere)
3. **Lighting design** — Direction (key light side, rim light placement), quality (soft/hard), color temperature, named setups (Rembrandt triangle, split lighting, butterfly, golden hour side-rake)
4. **Color palette/grade** — Dominant and accent colors, color grade style (warm golden, cool teal, desaturated matte, high-contrast cinematic)
5. **Camera** — Specific lens (35mm wide, 50mm standard, 85mm portrait, macro), movement (glacial push-in, smooth orbital arc, parallax drift, crane-up), distance (ECU/CU/MS/WS), depth of field
6. **Mood/Atmosphere** — Atmospheric effects (volumetric haze, dust motes, floating particles, bokeh), emotional tone
7. **Technical quality markers** — "8K", "cinematic color grade", "shot on Arri Alexa", "shallow depth of field f/1.8"

BAD: "Simple text overlay on a soft, blurred, natural background"
BAD: "A woman in a lab coat in a modern setting"
GOOD: "Slow 85mm push-in on a mid-30s woman in a crisp white lab coat, examining a holographic molecular display casting cyan light across her focused expression. Modern pharmaceutical lab with glass partition walls and brushed steel countertops. Cool blue rim light from the left, warm 4000K key from upper right creating Rembrandt triangle. Volumetric light haze with drifting particles. Cinematic teal shadows, warm highlights, 8K."

## SCENE TYPE VISUAL FRAMEWORKS
- hook: Pattern interrupt — unexpected scale, dramatic reveal, something visually arresting. Wide or extreme close-up. High contrast. Use visual metaphors that arrest attention.
- problem: Relatable reality — warm but slightly desaturated, imperfect lived-in environment, subtle visual tension. Medium shot. Show the emotion, not the concept.
- agitation: Heightened tension — tighter framing, cooler color temperature, more contrast, slight unease. Use symbolic imagery (crumbling structures, tilting objects, fading light).
- solution: Transformation moment — warmer light enters frame, environment brightens. Slow push-in or reveal camera. Visual metaphor of clarity/breakthrough.
- product: Hero showcase — product centered with clean background, premium lighting, slight orbital or push-in camera. Maximum visual clarity.
- proof: Credibility visual — clean clinical or scientific environment, precise and trustworthy. Steady camera, symmetrical composition.
- benefit: Aspirational outcome — golden warm light, healthy vibrant environment, elevated lifestyle. Gentle camera drift.
- testimonial: Human connection — medium close-up, natural warm lighting, authentic setting. Subtle shallow depth of field.
- cta: Brand moment — product hero shot with clean background, premium feel. Subtle motion. Clean composition with breathing room.
- explanation: Educational clarity — clean environment, clear subject visibility, steady smooth camera. Well-lit and organized.
- intro: Establishing shot — wide environmental reveal, sets mood and context. Slow pan or crane movement.
- brand: Identity moment — brand colors and aesthetic prominent, polished premium feel. Clean composition.
- chapter-title: Thematic visual metaphor — create a symbolic, cinematic image that represents the chapter's theme (e.g., for "The Weight Loss Illusion" → a vintage brass scale slowly tilting in golden light). NEVER use text, title cards, or simple backgrounds. Instead, craft a compelling visual that evokes the chapter's emotional core. Shallow depth of field, premium cinematic quality.

## VISUAL METAPHOR GUIDANCE
For abstract concepts, ALWAYS create symbolic visual representations instead of literal depictions:
- "Weight loss myths" → vintage brass scale tilting back and forth in soft golden light
- "Hidden dangers" → a cracked glass surface with light refracting through the fractures
- "Fresh start" → morning dew on a new leaf with the first ray of sunlight
- "Scientific breakthrough" → a single droplet falling into still water creating perfect ripples in macro
- "Transformation" → a butterfly emerging from chrysalis in extreme close-up with volumetric light
Think like a film title sequence designer — what single cinematic image captures the emotional essence?

## NARRATIVE FLOW AWARENESS
Consider what comes BEFORE and AFTER each scene. Visual directions should create a coherent visual story:
- Vary camera movements and shot types across consecutive scenes — no two adjacent scenes should feel visually identical
- Create visual progression (e.g., scenes gradually shift from cool/tense to warm/resolved)
- Use lighting temperature shifts to mirror the narrative arc
- If the previous scene ends wide, consider opening the next scene tight (and vice versa)

## DUAL PROMPT SYSTEM (IMAGE-FIRST PIPELINE)
Every scene goes through a two-step generation process:
1. FIRST: A still image is generated from the "imagePrompt" using Flux Pro (a text-to-image model)
2. THEN: That image is animated into video using the "motionPrompt" with an image-to-video model

Therefore you MUST write TWO separate prompts for each scene:
- **imagePrompt**: A rich, detailed STILL IMAGE description. Focus on composition, lighting, color, subject detail, environment, and atmosphere. This prompt drives the Flux image generator — think of it as describing a single perfect frame/photograph. NO motion words (no "slowly pans", "drifts", "moves"). 50-80 words.
- **motionPrompt**: A SHORT motion-only description that tells the I2V model how to animate the still image. Focus ONLY on: camera movement (push-in, orbital, crane up), subject motion (hair sways, particles drift, light shifts), and atmospheric motion (fog rolls, leaves flutter). 15-30 words. Do NOT re-describe the scene — the model already has the image.

GOOD imagePrompt: "Extreme close-up of a brass vintage scale on a marble surface, one side tipping downward. Warm golden sidelight casting long shadows. Soft bokeh background with amber glass bottles. Dust motes suspended in volumetric light beam. Rich teal and amber color grade, 8K, shallow depth of field f/1.4."
GOOD motionPrompt: "Slow push-in, scale gently tips and oscillates, dust motes drift through light beam, subtle light flicker."

BAD imagePrompt: "A scale slowly tipping over as camera pushes in" (contains motion — wrong for still image generation)
BAD motionPrompt: "A brass vintage scale on a marble surface with golden sidelight and bokeh background" (re-describes scene — wrong for motion prompt)

## CRITICAL RULES
1. Every imagePrompt MUST describe a single perfect still frame with all 7 cinematic layers (subject, environment, lighting, color, camera angle, mood, quality markers)
2. Every motionPrompt MUST describe ONLY motion/animation — camera movement + subject motion + atmospheric motion
3. Describe subjects with cinematic specificity — not "a bottle" but "the supplement tub centered on a moss-covered stone surface"
4. Specify lighting with technical precision — named setups (Rembrandt, butterfly, split), color temperature (3200K warm, 5600K daylight), direction
5. Include environment depth — foreground bokeh elements, midground subject, background atmosphere layers
6. ABSOLUTELY NO TEXT in visual descriptions — AI video models CANNOT render readable text. It ALWAYS produces garbled, alien-looking characters. Text overlays are handled separately by the platform's Remotion rendering engine. For scenes about concepts, use VISUAL METAPHORS instead.
7. Describe products by PHYSICAL APPEARANCE only (shape, color, container type) — never describe label text
8. ${multiStyleMode ? 'EVERY visual direction MUST include the assigned style marker for that scene' : isStylized ? `EVERY visual direction MUST include the style marker "${artPreset!.styleMarkerPrefix || artPreset!.name}"` : 'Keep descriptions cinematic but grounded in realism'}
9. Keep each imagePrompt 50-80 words — richly detailed with all 7 layers but NO motion
10. Keep each motionPrompt 15-30 words — motion ONLY
11. Vary camera, lighting, and composition across scenes — create a dynamic visual journey, not a repetitive slideshow

## TEXT-HEAVY SCENE DETECTION
Some scenes contain narration that references on-screen text, statistics, data, lists, or typography-heavy content. For these scenes, set "textImageEnabled": true so the platform routes them to a text-capable image generator (GPT-Image-1) instead of Flux. Examples of text-heavy narration:
- "Here are the top 5 benefits..." → textImageEnabled: true
- "Studies show a 73% improvement..." → textImageEnabled: true (stat card)
- "Step 1: Prepare the ingredients..." → textImageEnabled: true (numbered steps)
- "A serene mountain landscape at dawn..." → textImageEnabled: false (pure visual)

${ctx.projectPurpose ? `## CONTENT TAG AUTO-ASSIGNMENT
The project purpose is "${ctx.projectPurpose}". Based on each scene's type and content, assign an "assignedContentTag" from these options: ${getSceneContentTagIds().join(', ')}.
Content tags control visual treatment — they route scenes to specialized prompt prefixes/suffixes and provider boosting:
- "scientific-medical": cellular structures, molecular diagrams, medical visualizations, scientific processes
- "lifestyle": natural authentic scenes, wellness, everyday life, warm tones
- "testimonial": human-focused, interviews, personal stories, portrait-quality
- "product-showcase": clean product shots, hero displays, branded presentations
Choose the tag that best matches the VISUAL CONTENT of each scene (not just the scene type).` : ''}

## CHARACTER CONSISTENCY
If a recurring character appears, define their complete appearance in the FIRST scene (age, ethnicity, hair, build, wardrobe, distinctive features) and reference the EXACT SAME description in every subsequent scene.

You return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

  const scenesForPrompt = stage3Scenes.map((s: any, i: number) => {
    const narrativeScene = narrative.scenes[i];
    const prevScene = i > 0 ? stage3Scenes[i - 1] : null;
    const prevContext = prevScene
      ? `Previous Scene Narration: "${(prevScene.narration || '').substring(0, 120)}..."
Previous Scene Visual Direction: "${(prevScene.visualDirection || '').substring(0, 120)}..."`
      : 'Previous Scene: NONE (this is the first scene — establish the visual world)';
    return `Scene ${i + 1}:
Type: ${s.type || narrativeScene?.type || 'content'}
Duration: ${s.duration || narrativeScene?.duration || 8}s
Emotional Beat: ${narrativeScene?.emotionalBeat || 'neutral'}
${prevContext}
Narration: "${s.narration || ''}"
Current Visual Direction: "${s.visualDirection || ''}"
${s.chapterTitle ? `Chapter Title: "${s.chapterTitle}" (create a visual METAPHOR for this theme — NO text rendering)` : ''}`;
  }).join('\n\n');

  const productDesc = ctx.productContext
    ? `\nPRODUCT: ${ctx.productContext.productName} (${ctx.productContext.category})
Physical appearance: ${ctx.productContext.visualDescription}
Brand tone: ${ctx.productContext.brandTone}
Colors: ${ctx.productContext.colorPalette.join(', ')}`
    : '';

  const userPrompt = `Transform each scene's visual direction into a production-grade AI video generation prompt with micro-scene breakdowns.

PROJECT CONTEXT:
Brand: ${brand.brandName || 'the brand'}
Platform: ${ctx.platform}
Primary Emotion: ${strategy.primaryEmotion}
Narrative Framework: ${strategy.narrativeFramework}
Tone: ${strategy.toneGuidance}${productDesc}

SCENES TO TRANSFORM:
${scenesForPrompt}

For each scene, write:
1. An enhanced visual direction prompt following all rules above
2. A brief cinematicNotes explaining your visual approach for this scene
3. A scene-specific negativePrompt (things to avoid in generation)
4. Split the narration into 2-4 micro-scenes at natural topic shifts. Each micro-scene gets its own cinematic visual direction that inherits the parent scene's visual world, lighting, and mood. Short scenes (under 5s or 1-2 sentences) should have just 1 micro-scene.
5. A "shotType" — one of: ECU (extreme close-up), CU (close-up), MS (medium shot), WS (wide shot), EWS (extreme wide), POV, OTS (over-the-shoulder), aerial, macro.
6. An "onScreenText" — short on-screen text/caption to display over this scene (3-8 words max). Empty string if none needed.
7. A "lowerThird" — short lower-third tag for this scene (e.g. speaker name, location, or stat). Empty string if none needed.
${multiStyleMode ? '8. An "assignedStyleId" field with the chosen art style id for this scene (must come from the available styles listed above)' : '8. An optional "assignedStyleId" — if a different visual treatment fits this specific scene better, set it to a known preset id from the catalog (e.g. cinematic-realism, scientific-medical, 3d-illustration, anime, watercolor, pixel-art). Omit or leave empty to inherit the project default.'}
${ctx.projectPurpose ? `${multiStyleMode ? '9' : '8'}. An "assignedContentTag" field with the best content tag for this scene's visual content` : ''}

ALSO produce a top-level "styleRationale": a single concise paragraph (3-5 sentences) explaining the overall visual treatment — what visual style(s) you chose, why they fit the brand and narrative, how lighting/color/pacing serve the message, and any per-scene mixing decisions you made. Write it for a human creative reviewer, not for the model.

Return ONLY valid JSON:
{
  "styleRationale": "3-5 sentence paragraph for the human reviewer",
  "scenes": [
    {
      "sceneNumber": 1,
      ${multiStyleMode ? '"assignedStyleId": "style-id-here",' : ''}
      ${ctx.projectPurpose ? '"assignedContentTag": "lifestyle",' : ''}
      "shotType": "MS",
      "onScreenText": "",
      "lowerThird": "",
      "imagePrompt": "rich still-image description for Flux generation — NO motion words (50-80 words)",
      "motionPrompt": "motion-only description for I2V animation — camera + subject + atmosphere motion (15-30 words)",
      "visualDirection": "combined full production-grade AI video prompt as fallback (40-80 words)",
      "negativePrompt": "scene-specific items to avoid",
      "cinematicNotes": "brief note on why this visual approach serves the narrative",
      "textImageEnabled": false,
      "microScenes": [
        { "narration": "exact text from narration for this segment", "visualDirection": "cinematic prompt inheriting parent mood (30-60 words)", "imagePrompt": "still image prompt for this micro-scene", "motionPrompt": "motion prompt for this micro-scene", "duration": 4 },
        { "narration": "next segment", "visualDirection": "different angle/moment same visual world", "imagePrompt": "still image prompt", "motionPrompt": "motion prompt", "duration": 3 }
      ]
    }
  ]
}`;

  const sceneCount = stage3Scenes.length;
  const tokensPerScene = 500;
  const estimatedTokens = Math.min(16000, Math.max(8000, sceneCount * tokensPerScene));
  console.log(`[Pipeline S4] ${sceneCount} scenes, requesting ${estimatedTokens} max tokens`);

  let s4Scenes: any[] = [];
  let styleRationale: string | undefined;

  if (sceneCount > 12) {
    const chunkSize = Math.ceil(sceneCount / 2);
    const chunks = [];
    for (let ci = 0; ci < sceneCount; ci += chunkSize) {
      chunks.push(stage3Scenes.slice(ci, ci + chunkSize));
    }
    console.log(`[Pipeline S4] Splitting ${sceneCount} scenes into ${chunks.length} chunks of ~${chunkSize}`);

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const offset = ci * chunkSize;
      const chunkScenesForPrompt = chunk.map((s: any, i: number) => {
        const globalIdx = offset + i;
        const narrativeScene = narrative.scenes[globalIdx];
        const prevScene = globalIdx > 0 ? stage3Scenes[globalIdx - 1] : null;
        const prevContext = prevScene
          ? `Previous Scene Narration: "${(prevScene.narration || '').substring(0, 120)}..."
Previous Scene Visual Direction: "${(prevScene.visualDirection || '').substring(0, 120)}..."`
          : 'Previous Scene: NONE (this is the first scene — establish the visual world)';
        return `Scene ${globalIdx + 1}:
Type: ${s.type || narrativeScene?.type || 'content'}
Duration: ${s.duration || narrativeScene?.duration || 8}s
Emotional Beat: ${narrativeScene?.emotionalBeat || 'neutral'}
${prevContext}
Narration: "${s.narration || ''}"
Current Visual Direction: "${s.visualDirection || ''}"
${s.chapterTitle ? `Chapter Title: "${s.chapterTitle}" (create a visual METAPHOR for this theme — NO text rendering)` : ''}`;
      }).join('\n\n');

      const chunkUserPrompt = userPrompt.replace(scenesForPrompt, chunkScenesForPrompt);
      const chunkTokens = Math.min(16000, Math.max(8000, chunk.length * tokensPerScene));

      try {
        const chunkRaw = await callLLMWithRetry(systemPrompt, chunkUserPrompt, chunkTokens, `Stage 4: Visual Directions (chunk ${ci + 1}/${chunks.length})`, 2, true);
        let chunkParsed: any;
        try {
          chunkParsed = extractJSON(chunkRaw);
        } catch (parseErr: any) {
          console.warn(`[Pipeline S4] Chunk ${ci + 1} JSON parse failed, attempting partial recovery...`);
          chunkParsed = extractPartialScenesJSON(chunkRaw);
        }
        const chunkScenes = Array.isArray(chunkParsed.scenes) ? chunkParsed.scenes : [];
        chunkScenes.forEach((s: any, i: number) => {
          if (!s.sceneNumber) s.sceneNumber = offset + i + 1;
        });
        if (!styleRationale && typeof chunkParsed.styleRationale === 'string' && chunkParsed.styleRationale.trim()) {
          styleRationale = chunkParsed.styleRationale.trim();
        }
        s4Scenes.push(...chunkScenes);
        console.log(`[Pipeline S4] Chunk ${ci + 1}: got ${chunkScenes.length} scenes`);
      } catch (chunkErr: any) {
        console.warn(`[Pipeline S4] Chunk ${ci + 1} failed: ${chunkErr.message?.substring(0, 100)}`);
      }
    }
  } else {
    const raw = await callLLMWithRetry(systemPrompt, userPrompt, estimatedTokens, "Stage 4: Visual Directions", 2, estimatedTokens >= 6000);
    const parsed = extractJSON(raw);
    s4Scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    if (typeof parsed.styleRationale === 'string' && parsed.styleRationale.trim()) {
      styleRationale = parsed.styleRationale.trim();
    }
  }

  const validStyleIds = multiStyleMode
    ? new Set(artPresets.map(p => p.id))
    : new Set(getAllVisualArtPresets().map(p => p.id));

  const enhanced = await Promise.all(stage3Scenes.map(async (original: any, i: number) => {
    const s4 = s4Scenes.find((s: any) => s.sceneNumber === i + 1) || s4Scenes[i];
    if (!s4 || !s4.visualDirection) {
      if (ctx.projectPurpose) {
        const fallbackTag = getContentTagForSceneType(ctx.projectPurpose, original.type || 'standard') || undefined;
        if (fallbackTag) {
          console.log(`[Pipeline S4] Scene ${i + 1} no S4 output — applying fallback content tag: ${fallbackTag}`);
          return { ...original, contentTag: fallbackTag, assignedContentTag: fallbackTag };
        }
      }
      return original;
    }

    let assignedArtPresetId: string | undefined;
    if (multiStyleMode && s4.assignedStyleId && validStyleIds.has(s4.assignedStyleId)) {
      assignedArtPresetId = s4.assignedStyleId;
      console.log(`[Pipeline S4] Scene ${i + 1} assigned style: ${assignedArtPresetId}`);
    } else if (multiStyleMode) {
      assignedArtPresetId = artPresets[0]?.id;
      console.log(`[Pipeline S4] Scene ${i + 1} defaulting to first style: ${assignedArtPresetId}`);
    } else if (!multiStyleMode && s4.assignedStyleId && validStyleIds.has(s4.assignedStyleId) && s4.assignedStyleId !== ctx.artPresetId) {
      // Single-preset mode: LLM may suggest a different per-scene style from the catalog.
      assignedArtPresetId = s4.assignedStyleId;
      console.log(`[Pipeline S4] Scene ${i + 1} single-mode per-scene override → ${assignedArtPresetId} (project default: ${ctx.artPresetId || 'auto'})`);
    }

    let enforcedVisualDirection = s4.visualDirection;
    let enforcedNegativePrompt = s4.negativePrompt || undefined;
    if (multiStyleMode && assignedArtPresetId) {
      const assignedPreset = getVisualArtPreset(assignedArtPresetId);
      if (assignedPreset) {
        const styleMarker = assignedPreset.styleMarkerPrefix || assignedPreset.name;
        if (!enforcedVisualDirection.toLowerCase().includes(styleMarker.toLowerCase())) {
          enforcedVisualDirection = `${styleMarker}. ${enforcedVisualDirection}`;
          console.log(`[Pipeline S4] Scene ${i + 1}: patched missing style marker "${styleMarker}"`);
        }
        const styleSuffix = [
          assignedPreset.imagePromptPrefix,
          assignedPreset.imagePromptSuffix,
        ].filter(Boolean).join(' ');
        if (styleSuffix && !enforcedVisualDirection.includes(styleSuffix.substring(0, 20))) {
          enforcedVisualDirection = `${enforcedVisualDirection} ${styleSuffix}`;
        }
        const presetNegatives = assignedPreset.negativePromptAdditions.join(', ');
        if (enforcedNegativePrompt) {
          const existingLower = enforcedNegativePrompt.toLowerCase();
          const missing = assignedPreset.negativePromptAdditions.filter(n => !existingLower.includes(n.toLowerCase()));
          if (missing.length > 0) {
            enforcedNegativePrompt = `${enforcedNegativePrompt}, ${missing.join(', ')}`;
          }
        } else {
          enforcedNegativePrompt = `${presetNegatives}, text, watermark, logo, words, labels`;
        }
      }
    }

    const scenePreset = assignedArtPresetId
      ? getVisualArtPreset(assignedArtPresetId)
      : singlePreset;
    const sceneType = original.type || 'standard';
    const providerHint = scenePreset?.sceneTypeProviderMap?.[sceneType]?.[0]
      || scenePreset?.providerHierarchy?.primary
      || undefined;

    let imagePrompt = s4.imagePrompt || '';
    let motionPrompt = s4.motionPrompt || '';

    // ===== LITERAL NARRATION ENFORCEMENT =====
    // If the narration mentions concrete subjects that are missing from the
    // imagePrompt / visualDirection, ask the LLM to rewrite both for this
    // single scene with the literal subjects required. Bounded to one retry;
    // falls back to a literal-anchor prefix if the retry still drifts or fails.
    const narrationText = (original.narration || '').toString();
    if (narrationText && imagePrompt) {
      const driftCheck = detectNarrationDrift(narrationText, imagePrompt, s4.visualDirection || '');
      if (driftCheck.drift) {
        const anchorTerms = driftCheck.missing.slice(0, 6).join(', ');
        console.warn(`[Pipeline S4] Scene ${i + 1} drift detected — narration mentions [${anchorTerms}] but imagePrompt does not. Re-prompting LLM…`);

        const retrySystem = `You are a precise visual prompt rewriter. The previous imagePrompt drifted away from what the narration literally describes. Rewrite the imagePrompt and visualDirection so the LITERAL subjects from the narration are visible in the frame. Keep cinematic language tight. Output strict JSON: {"imagePrompt": "...", "visualDirection": "..."} — no commentary.`;
        const retryUser = `NARRATION (must be depicted literally):
"""${narrationText}"""

REQUIRED LITERAL SUBJECTS (must appear in the imagePrompt): ${anchorTerms}

CURRENT (drifted) imagePrompt:
"""${imagePrompt}"""

CURRENT visualDirection:
"""${s4.visualDirection || ''}"""

Rewrite both so the listed required literal subjects are clearly visible in the frame. Do NOT add unrelated symbolic imagery. Maintain photographic / cinematic realism. Return JSON only.`;

        let retried = false;
        try {
          const retryRaw = await callLLMWithRetry(retrySystem, retryUser, 600, `Stage 4 drift retry scene ${i + 1}`, 0, false);
          const retryJson = extractJSON(retryRaw);
          const newImagePrompt = (retryJson?.imagePrompt || '').toString().trim();
          const newVisualDirection = (retryJson?.visualDirection || '').toString().trim();
          if (newImagePrompt) {
            const recheck = detectNarrationDrift(narrationText, newImagePrompt, newVisualDirection);
            if (!recheck.drift) {
              console.log(`[Pipeline S4] Scene ${i + 1} drift retry succeeded (missing nouns now: ${recheck.missing.length}/${recheck.nouns.length})`);
              imagePrompt = newImagePrompt;
              if (newVisualDirection) {
                s4.visualDirection = newVisualDirection;
              }
              retried = true;
            } else {
              console.warn(`[Pipeline S4] Scene ${i + 1} retry still drifted (${recheck.missing.length}/${recheck.nouns.length} missing). Falling back to anchor prefix.`);
            }
          }
        } catch (err: any) {
          console.warn(`[Pipeline S4] Scene ${i + 1} drift retry LLM call failed: ${err?.message?.substring(0, 120)} — falling back to anchor prefix.`);
        }

        if (!retried) {
          imagePrompt = `Literal subject from narration: ${anchorTerms}. ${imagePrompt}`;
        }
      }
    }

    if (scenePreset && imagePrompt) {
      const styleMarker = scenePreset.styleMarkerPrefix || scenePreset.name;
      if (!imagePrompt.toLowerCase().includes(styleMarker.toLowerCase())) {
        imagePrompt = `${styleMarker}. ${imagePrompt}`;
      }
      if (scenePreset.imagePromptSuffix) {
        const suffixSnippet = scenePreset.imagePromptSuffix.substring(0, 20);
        if (!imagePrompt.includes(suffixSnippet)) {
          imagePrompt = `${imagePrompt} ${scenePreset.imagePromptSuffix}`;
        }
      }
    }

    if (scenePreset && motionPrompt && scenePreset.cameraMotionHints) {
      const hasMotionHint = scenePreset.cameraMotionHints.split(',').some(
        (hint: string) => motionPrompt.toLowerCase().includes(hint.trim().toLowerCase())
      );
      if (!hasMotionHint) {
        const defaultHint = scenePreset.cameraMotionHints.split(',')[0]?.trim();
        if (defaultHint && !motionPrompt.toLowerCase().includes(defaultHint.toLowerCase())) {
          motionPrompt = `${motionPrompt}, ${defaultHint}`;
        }
      }
    }

    if (!imagePrompt && enforcedVisualDirection) {
      imagePrompt = enforcedVisualDirection;
    }
    if (!motionPrompt) {
      motionPrompt = scenePreset?.cameraMotionHints?.split(',')[0]?.trim() || 'slow cinematic push-in, subtle atmospheric motion';
    }

    // ===== DETERMINISTIC PRODUCT GROUNDING =====
    // For product/CTA scenes, ensure the literal product visual description is
    // present in the imagePrompt so the model paints the user's actual product
    // (not a generic stand-in). Idempotent: only appends if not already present.
    if ((sceneType === 'product' || sceneType === 'cta') && ctx.productContext?.visualDescription) {
      const productVD = ctx.productContext.visualDescription.toString().trim();
      if (productVD) {
        const head = productVD.slice(0, 24).toLowerCase();
        if (!imagePrompt.toLowerCase().includes(head)) {
          imagePrompt = `${imagePrompt} Product shown clearly: ${productVD}.`.trim();
          console.log(`[Pipeline S4] Scene ${i + 1} (${sceneType}): injected product visual description`);
        }
      }
    }

    const textImageEnabled = s4.textImageEnabled === true;

    const validContentTagIds = new Set(getSceneContentTagIds());
    let assignedContentTag: string | undefined;
    if (s4.assignedContentTag && validContentTagIds.has(s4.assignedContentTag)) {
      assignedContentTag = s4.assignedContentTag;
      console.log(`[Pipeline S4] Scene ${i + 1} auto-assigned content tag: ${assignedContentTag}`);
    } else if (ctx.projectPurpose) {
      assignedContentTag = getContentTagForSceneType(ctx.projectPurpose, original.type || 'standard') || undefined;
      if (assignedContentTag) {
        console.log(`[Pipeline S4] Scene ${i + 1} fallback content tag from purpose map: ${assignedContentTag}`);
      }
    }

    const microScenes = Array.isArray(s4.microScenes) && s4.microScenes.length > 0
      ? s4.microScenes.map((ms: any, idx: number) => {
          let msVisualDirection = ms.visualDirection || '';
          let msImagePrompt = ms.imagePrompt || '';
          let msMotionPrompt = ms.motionPrompt || '';
          if (multiStyleMode && assignedArtPresetId) {
            const assignedPreset = getVisualArtPreset(assignedArtPresetId);
            if (assignedPreset) {
              const styleMarker = assignedPreset.styleMarkerPrefix || assignedPreset.name;
              if (!msVisualDirection.toLowerCase().includes(styleMarker.toLowerCase())) {
                msVisualDirection = `${styleMarker}. ${msVisualDirection}`;
              }
              if (msImagePrompt && !msImagePrompt.toLowerCase().includes(styleMarker.toLowerCase())) {
                msImagePrompt = `${styleMarker}. ${msImagePrompt}`;
              }
            }
          }
          if (!msImagePrompt) msImagePrompt = msVisualDirection;
          if (!msMotionPrompt) msMotionPrompt = motionPrompt;
          return {
            id: `${original.id || `scene-${i + 1}`}-micro-${idx + 1}`,
            narration: ms.narration || '',
            visualDirection: msVisualDirection,
            imagePrompt: msImagePrompt,
            motionPrompt: msMotionPrompt,
            duration: ms.duration || Math.round((original.duration || 10) / s4.microScenes.length),
            pipelineStage: 4,
            ...(assignedArtPresetId ? { artPresetId: assignedArtPresetId } : {}),
            ...(assignedContentTag ? { contentTag: assignedContentTag } : {}),
            ...(providerHint ? { providerHint } : {}),
          };
        })
      : undefined;

    const onScreenText = typeof s4.onScreenText === 'string' ? s4.onScreenText.trim() : '';
    const lowerThird = typeof s4.lowerThird === 'string' ? s4.lowerThird.trim() : '';
    const shotType = typeof s4.shotType === 'string' ? s4.shotType.trim() : '';

    return {
      ...original,
      visualDirection: enforcedVisualDirection,
      imagePrompt,
      motionPrompt,
      negativePrompt: enforcedNegativePrompt,
      cinematicNotes: s4.cinematicNotes || undefined,
      ...(providerHint ? { providerHint } : {}),
      ...(textImageEnabled ? { textImageEnabled } : {}),
      ...(assignedArtPresetId ? { artPresetId: assignedArtPresetId, assignedStyleId: assignedArtPresetId } : {}),
      ...(assignedContentTag ? { contentTag: assignedContentTag, assignedContentTag: assignedContentTag } : {}),
      ...(microScenes ? { microScenes } : {}),
      ...(onScreenText ? { onScreenText } : {}),
      ...(lowerThird ? { lowerThird } : {}),
      ...(shotType ? { shotType } : {}),
    };
  }));

  if (multiStyleMode) {
    const styleCounts: Record<string, number> = {};
    enhanced.forEach(s => { if (s.artPresetId) styleCounts[s.artPresetId] = (styleCounts[s.artPresetId] || 0) + 1; });
    console.log(`[Pipeline S4] Multi-style assignment summary: ${Object.entries(styleCounts).map(([id, c]) => `${id}(${c})`).join(', ')}`);
  }

  if (ctx.projectPurpose) {
    const tagCounts: Record<string, number> = {};
    enhanced.forEach(s => { if (s.contentTag) tagCounts[s.contentTag] = (tagCounts[s.contentTag] || 0) + 1; });
    console.log(`[Pipeline S4] Content tag assignment summary: ${Object.entries(tagCounts).map(([id, c]) => `${id}(${c})`).join(', ')}`);
  }

  if (styleRationale) {
    console.log(`[Pipeline S4] Style rationale captured (${styleRationale.length} chars)`);
  }

  return { scenes: enhanced, styleRationale };
}

function buildFallbackStrategy(ctx: PipelineContext): CreativeStrategy {
  const tone = ctx.scriptPresets?.scriptTone || "educational";
  const openingHook = ctx.trendHooks?.[0] || `Discover how ${ctx.scriptPresets?.productName || "this"} can transform your routine`;
  return {
    narrativeFramework: ALLOWED_FRAMEWORKS[DEFAULT_FRAMEWORK],
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

  console.log(`[ScriptPipeline] Starting 4-stage pipeline for ${ctx.targetDuration}s ${ctx.platform} video`);

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
    const { scenes: stage3Scenes, summary } = await stageThreeSceneWriting(ctx, brand, strategy, narrative);
    console.log(`[ScriptPipeline] Written ${stage3Scenes.length} scenes with narration and visual directions`);

    let scenes = stage3Scenes;
    let styleRationale: string | undefined;
    console.log("[ScriptPipeline] === Stage 4: Visual Direction Enhancement ===");
    const s4Start = Date.now();
    try {
      const s4Result = await stageFourVisualDirections(stage3Scenes, strategy, narrative, ctx, brand);
      scenes = s4Result.scenes;
      styleRationale = s4Result.styleRationale;
      const s4Ms = Date.now() - s4Start;
      const microSceneCount = scenes.reduce((sum: number, s: any) => sum + (s.microScenes?.length || 0), 0);
      console.log(`[ScriptPipeline] Stage 4 enhanced ${scenes.length} scenes with ${microSceneCount} micro-scenes in ${s4Ms}ms`);
    } catch (s4Err: any) {
      console.warn(`[ScriptPipeline] Stage 4 failed, using Stage 3 visual directions: ${s4Err.message}`);
    }

    return { strategy, narrative, scenes, summary, styleRationale };
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

export async function assignMultiStyleToScenes(
  scenes: any[],
  artPresetIds: string[],
): Promise<void> {
  const presets = artPresetIds.map(id => getVisualArtPreset(id)).filter(Boolean) as VisualArtPreset[];
  if (presets.length < 2) return;

  const contentScenes = scenes.filter((s: any) => s.type !== 'chapter-title');
  if (contentScenes.length === 0) return;

  const styleOptions = presets.map(p => `"${p.id}" (${p.name}: ${p.description})`).join('\n');
  const sceneDescriptions = contentScenes.map((s: any, i: number) =>
    `Scene ${i + 1} [type: ${s.type || 'content'}]: "${(s.narration || '').substring(0, 150)}"`
  ).join('\n');

  const prompt = `Assign the best-fitting art style to each scene based on its narration content and scene type.

AVAILABLE STYLES:
${styleOptions}

SCENES:
${sceneDescriptions}

RULES:
- Match scientific/medical/technical content to scientific or clinical styles
- Match emotional/human/lifestyle content to cinematic or warm styles
- Match abstract/conceptual/process content to illustration or animated styles
- Ensure visual variety — distribute styles meaningfully, don't assign all one style unless content demands it

Return ONLY valid JSON:
{"assignments": [{"scene": 1, "styleId": "style-id"}, ...]}`;

  try {
    const result = await llmClient.createChatCompletion({
      systemPrompt: 'You are a visual style assignment expert. Return only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
    });
    const raw = result.text;
    const parsed = extractJSON(raw);
    const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];
    const validIds = new Set(presets.map(p => p.id));

    for (const assignment of assignments) {
      const idx = (assignment.scene || 0) - 1;
      if (idx >= 0 && idx < contentScenes.length && assignment.styleId && validIds.has(assignment.styleId)) {
        const scene = contentScenes[idx];
        scene.artPresetId = assignment.styleId;
        scene.assignedStyleId = assignment.styleId;

        const preset = getVisualArtPreset(assignment.styleId)!;
        const styleMarker = preset.styleMarkerPrefix || preset.name;
        if (scene.visualDirection && !scene.visualDirection.toLowerCase().includes(styleMarker.toLowerCase())) {
          scene.visualDirection = `${styleMarker}. ${scene.visualDirection}`;
        }
        const presetNegatives = preset.negativePromptAdditions.join(', ');
        if (!scene.negativePrompt) {
          scene.negativePrompt = `${presetNegatives}, text, watermark, logo, words, labels`;
        }
      }
    }

    const styleCounts: Record<string, number> = {};
    contentScenes.forEach((s: any) => { if (s.artPresetId) styleCounts[s.artPresetId] = (styleCounts[s.artPresetId] || 0) + 1; });
    console.log(`[MultiStyleAssign] Intelligent assignment: ${Object.entries(styleCounts).map(([id, c]) => `${id}(${c})`).join(', ')}`);
  } catch (err: any) {
    console.warn(`[MultiStyleAssign] LLM assignment failed, using round-robin fallback: ${err.message}`);
    contentScenes.forEach((scene: any, idx: number) => {
      const preset = presets[idx % presets.length];
      scene.artPresetId = preset.id;
      scene.assignedStyleId = preset.id;
    });
  }

  const primaryPreset = presets[0];
  if (primaryPreset) {
    const titleScenes = scenes.filter((s: any) => s.type === 'chapter-title');
    for (const scene of titleScenes) {
      if (!scene.artPresetId) {
        scene.artPresetId = primaryPreset.id;
        scene.assignedStyleId = primaryPreset.id;
      }
    }
    if (titleScenes.length > 0) {
      console.log(`[MultiStyleAssign] Assigned ${primaryPreset.id} to ${titleScenes.length} chapter-title scenes`);
    }
  }
}

export async function enhanceChapterTitleVisualDirections(
  scenes: any[],
  brandName?: string,
): Promise<void> {
  const chapterScenes = scenes.filter((s: any) => s.type === 'chapter-title' && s.chapterTitle);
  if (chapterScenes.length === 0) return;

  const nextSceneMap: Record<number, any> = {};
  for (let i = 0; i < scenes.length; i++) {
    if (scenes[i].type === 'chapter-title') {
      const next = scenes[i + 1];
      if (next) nextSceneMap[i] = next;
    }
  }

  const chapterDescriptions = chapterScenes.map((s: any, idx: number) => {
    const sceneIdx = scenes.indexOf(s);
    const nextScene = nextSceneMap[sceneIdx];
    const nextNarration = nextScene?.narration ? `First scene narration: "${nextScene.narration.substring(0, 200)}"` : '';
    return `Chapter ${idx + 1}: "${s.chapterTitle}"
${nextNarration}`;
  }).join('\n\n');

  const systemPrompt = `You are a cinematic title sequence designer. For each chapter title, create a visual metaphor that captures the theme — like a film's opening title sequence. Think symbolic imagery, not literal text.

CRITICAL RULES:
- NEVER include text, words, signs, labels, typography in visual descriptions — AI cannot render readable text
- Create a symbolic visual metaphor that represents the chapter theme (e.g., "The Weight Loss Illusion" → vintage brass scale tilting in golden light)
- Use the 7-layer cinematic framework: subject anchor, environment, lighting design, color palette, camera, mood/atmosphere, technical quality
- Each visual direction should be 50-90 words, richly cinematic
- Vary the visual metaphors — each chapter should feel visually distinct

You return ONLY valid JSON.`;

  const userPrompt = `Create cinematic visual metaphor prompts for these chapter title cards.
Brand: ${brandName || 'the brand'}

CHAPTERS:
${chapterDescriptions}

Return ONLY valid JSON:
{
  "chapters": [
    {
      "chapterIndex": 0,
      "visualDirection": "cinematic visual metaphor prompt (50-90 words, NO text/words)",
      "negativePrompt": "text, words, letters, signs, labels, watermark, blurry"
    }
  ]
}`;

  try {
    const llmResult = await llmClient.createChatCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 3000,
    });
    const raw = llmResult.text;
    const parsed = extractJSON(raw);
    const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];

    chapterScenes.forEach((scene: any, idx: number) => {
      const enhanced = chapters[idx];
      if (enhanced?.visualDirection) {
        scene.visualDirection = enhanced.visualDirection;
        scene.negativePrompt = enhanced.negativePrompt || 'text, words, letters, signs, labels, typography, watermark, blurry';
        scene.background = { type: 'video' };
        console.log(`[ChapterTitle] Enhanced "${scene.chapterTitle}" → "${enhanced.visualDirection.substring(0, 80)}..."`);
      }
    });
  } catch (err: any) {
    console.warn(`[ChapterTitle] Enhancement failed, using fallback visual metaphors: ${err.message}`);
    chapterScenes.forEach((scene: any) => {
      scene.visualDirection = `Cinematic slow push-in on a symbolic still life representing "${scene.chapterTitle}". Dramatic chiaroscuro lighting with a single warm key light from upper right, deep shadows, shallow depth of field at f/1.4. Volumetric golden haze and floating dust particles. Rich warm color grade with amber highlights and deep navy shadows. Shot on 85mm lens, 8K cinematic quality.`;
      scene.negativePrompt = 'text, words, letters, signs, labels, typography, watermark, blurry';
      scene.background = { type: 'video' };
    });
  }
}

const TEXT_HEAVY_NARRATION_KEYWORDS = [
  'fda-approved', 'fda approved', 'clinically proven', 'clinically tested',
  'clinical trial', 'clinical study', 'peer-reviewed', 'peer reviewed',
  'published in', 'journal of', 'certified', 'patented', 'patent-pending',
  'study shows', 'studies show', 'research shows', 'research proves',
  'according to', 'data shows', 'data suggests', 'evidence-based',
  'statistically', 'statistics show', 'percent', '%',
  'billion', 'million', 'thousand-fold',
  'approved by', 'endorsed by', 'recommended by',
  'double-blind', 'placebo-controlled', 'randomized',
  'gmp certified', 'usda organic', 'non-gmo verified',
  'iso certified', 'iso 9001', 'ce marked',
];

export function detectTextHeavyNarration(narration: string): boolean {
  if (!narration) return false;
  const lower = narration.toLowerCase();
  return TEXT_HEAVY_NARRATION_KEYWORDS.some(kw => lower.includes(kw));
}

export function autoFlagTextHeavyScenes(scenes: any[]): number {
  let flagged = 0;
  for (const scene of scenes) {
    if (scene.type === 'chapter-title') continue;
    if (scene.textImageEnabled === true) continue;
    if (detectTextHeavyNarration(scene.narration || '')) {
      scene.textImageEnabled = true;
      flagged++;
      console.log(`[TextDetect] Auto-flagged scene "${scene.id}" for text-image pipeline (narration contains text-heavy keywords)`);
    }
  }
  return flagged;
}

export async function enhanceChapterScenesWithStage4(
  scenes: any[],
  options: {
    platform: string;
    targetDuration: number;
    artPresetId?: string;
    artPresetIds?: string[];
    productContext?: PipelineContext['productContext'];
    scriptPresets?: PipelineContext['scriptPresets'];
    projectType?: string | null;
    contentStructure?: string | null;
    projectPurpose?: string | null;
  },
): Promise<{ scenes: any[]; styleRationale: string }> {
  const contentScenes = scenes.filter((s: any) => s.type !== 'chapter-title');
  if (contentScenes.length === 0) return { scenes, styleRationale: '' };

  const chapterTitleIndices = new Set<number>();
  scenes.forEach((s: any, i: number) => {
    if (s.type === 'chapter-title') chapterTitleIndices.add(i);
  });

  const ctx: PipelineContext = {
    description: '',
    platform: options.platform,
    targetDuration: options.targetDuration,
    artPresetId: options.artPresetId,
    artPresetIds: options.artPresetIds,
    productContext: options.productContext,
    scriptPresets: options.scriptPresets,
    projectType: options.projectType,
    contentStructure: options.contentStructure,
    projectPurpose: options.projectPurpose,
  };

  const strategy = buildFallbackStrategy(ctx);
  strategy.primaryEmotion = 'trust';
  strategy.toneGuidance = ctx.scriptPresets?.scriptTone || 'educational';

  const narrativeScenes: NarrativeScene[] = contentScenes.map((s: any, i: number) => ({
    order: i + 1,
    type: s.type || 'content',
    purpose: '',
    duration: s.duration || 8,
    emotionalBeat: s.type === 'hook' ? 'curiosity' : s.type === 'cta' ? 'urgency' : 'engagement',
    keyMessage: '',
  }));
  const narrative: NarrativeArchitecture = {
    scenes: narrativeScenes,
    totalDuration: contentScenes.reduce((sum: number, s: any) => sum + (s.duration || 8), 0),
    pacing: 'steady educational pacing with emotional peaks',
  };

  const brand = await loadBrandInfo();
  console.log(`[ChapterStage4] Running Stage 4 visual direction enhancement on ${contentScenes.length} content scenes (skipping ${chapterTitleIndices.size} chapter-title scenes)`);

  const enhancedResult = await stageFourVisualDirections(contentScenes, strategy, narrative, ctx, brand);
  const enhanced = enhancedResult.scenes;
  const styleRationale = enhancedResult.styleRationale || '';

  let contentIdx = 0;
  const result = scenes.map((s: any, i: number) => {
    if (chapterTitleIndices.has(i)) return s;
    const enhancedScene = enhanced[contentIdx] || s;
    contentIdx++;
    return {
      ...s,
      visualDirection: enhancedScene.visualDirection || s.visualDirection,
      negativePrompt: enhancedScene.negativePrompt || s.negativePrompt,
      cinematicNotes: enhancedScene.cinematicNotes || s.cinematicNotes,
      ...(enhancedScene.imagePrompt ? { imagePrompt: enhancedScene.imagePrompt } : {}),
      ...(enhancedScene.motionPrompt ? { motionPrompt: enhancedScene.motionPrompt } : {}),
      ...(enhancedScene.providerHint ? { providerHint: enhancedScene.providerHint } : {}),
      ...(enhancedScene.textImageEnabled !== undefined ? { textImageEnabled: enhancedScene.textImageEnabled } : {}),
      ...(enhancedScene.microScenes ? { microScenes: enhancedScene.microScenes } : {}),
      ...(enhancedScene.artPresetId ? { artPresetId: enhancedScene.artPresetId, assignedStyleId: enhancedScene.assignedStyleId } : {}),
      ...(enhancedScene.contentTag ? { contentTag: enhancedScene.contentTag } : {}),
      ...(enhancedScene.assignedContentTag ? { assignedContentTag: enhancedScene.assignedContentTag } : {}),
      shotType: enhancedScene.shotType || '',
      onScreenText: enhancedScene.onScreenText ?? '',
      lowerThird: enhancedScene.lowerThird ?? '',
    };
  });

  const textFlagged = autoFlagTextHeavyScenes(result);
  console.log(`[ChapterStage4] Stage 4 complete. ${textFlagged} scenes auto-flagged for text-image pipeline`);

  return { scenes: result, styleRationale };
}
