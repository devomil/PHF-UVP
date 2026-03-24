import { Router, Request, Response } from "express";
import { db } from "../db";
import { brandSettings } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { getTrendingHooks, clearCacheForIndustry } from "./trend-intelligence-service";
import { llmClient } from "./piapi-llm-client";
import * as fs from "fs";
import * as path from "path";

const router = Router();

const refreshCooldowns = new Map<string, number>();
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

router.get("/hooks", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = (req.user as any).id;

  try {
    const [settings] = await db
      .select()
      .from(brandSettings)
      .where(eq(brandSettings.userId, userId))
      .limit(1);

    if (!settings?.industry) {
      return res.status(400).json({
        error: "No industry configured",
        message: "Please set your industry in Brand Settings first.",
      });
    }

    if (!settings.trendAnalysisEnabled) {
      return res.status(403).json({
        error: "Trend analysis not enabled",
        message: "Enable AI Trend Intelligence in Brand Settings.",
      });
    }

    const result = await getTrendingHooks(
      settings.industry,
      settings.contentNiche || "",
      settings.targetAudience || ""
    );

    res.json({
      success: true,
      industry: settings.industry,
      contentNiche: settings.contentNiche || "",
      ...result,
    });
  } catch (error: any) {
    console.error("[TrendRoutes] GET /hooks error:", error.message);
    res.status(500).json({ error: "Failed to fetch trending hooks" });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = (req.user as any).id;

  try {
    const [settings] = await db
      .select()
      .from(brandSettings)
      .where(eq(brandSettings.userId, userId))
      .limit(1);

    if (!settings?.industry) {
      return res.status(400).json({
        error: "No industry configured",
        message: "Please set your industry in Brand Settings first.",
      });
    }

    if (!settings.trendAnalysisEnabled) {
      return res.status(403).json({
        error: "Trend analysis not enabled",
        message: "Enable AI Trend Intelligence in Brand Settings.",
      });
    }

    const lastRefresh = refreshCooldowns.get(userId);
    if (lastRefresh) {
      const elapsed = Date.now() - lastRefresh;
      if (elapsed < REFRESH_COOLDOWN_MS) {
        const remainingMinutes = Math.ceil((REFRESH_COOLDOWN_MS - elapsed) / 60000);
        return res.status(429).json({
          error: "Refresh cooldown active",
          message: `Refresh available in ${remainingMinutes}m`,
          remainingMinutes,
        });
      }
    }

    await clearCacheForIndustry(settings.industry, settings.contentNiche || "", settings.targetAudience || "");

    const result = await getTrendingHooks(
      settings.industry,
      settings.contentNiche || "",
      settings.targetAudience || ""
    );

    refreshCooldowns.set(userId, Date.now());

    res.json({
      success: true,
      industry: settings.industry,
      contentNiche: settings.contentNiche || "",
      ...result,
    });
  } catch (error: any) {
    console.error("[TrendRoutes] POST /refresh error:", error.message);
    res.status(500).json({ error: "Failed to refresh trending hooks" });
  }
});

router.post("/analyze-image", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { imageUrl } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: "imageUrl is required" });
  }

  try {
    console.log(`[TrendRoutes] Analyzing product image for trending hooks...`);

    if (!imageUrl.startsWith("/uploads/")) {
      return res.status(400).json({ error: "Only uploaded images are supported" });
    }

    const filename = path.basename(imageUrl);
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.join(uploadsDir, filename);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(uploadsDir)) {
      return res.status(400).json({ error: "Invalid file path" });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(400).json({ error: "Image file not found" });
    }

    const fileBuffer = fs.readFileSync(resolved);
    const base64Data = fileBuffer.toString("base64");
    const ext = path.extname(resolved).toLowerCase();
    const mimeMap: Record<string, "image/jpeg" | "image/png" | "image/webp"> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
    const mediaType: "image/jpeg" | "image/png" | "image/webp" = mimeMap[ext] || "image/png";

    const analysisResponse = await llmClient.createChatCompletion({
      systemPrompt: "You analyze product images and extract category information. Respond in valid JSON only.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mediaType, base64Data },
            {
              type: "text",
              text: `Analyze this product image and extract:
1. "industry" — the best matching industry from this list: Health & Wellness, Fitness, Food & Beverage, Education, Beauty, E-commerce, Home & Garden, Professional Services, Technology, Entertainment, Finance, Travel, Real Estate, Other
2. "contentNiche" — 2-3 specific niche keywords describing this product category (comma-separated)
3. "targetAudience" — the likely target audience for this product

Respond in valid JSON only:
{"industry": "...", "contentNiche": "...", "targetAudience": "..."}`,
            },
          ],
        },
      ],
      maxTokens: 200,
    });

    let parsed: { industry: string; contentNiche: string; targetAudience: string };
    try {
      const jsonMatch = analysisResponse.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : analysisResponse.text);
    } catch {
      console.error("[TrendRoutes] Failed to parse image analysis response:", analysisResponse.text);
      return res.status(500).json({ error: "Failed to analyze image" });
    }

    console.log(`[TrendRoutes] Image analysis: industry=${parsed.industry}, niche=${parsed.contentNiche}, audience=${parsed.targetAudience}`);

    const result = await getTrendingHooks(
      parsed.industry,
      parsed.contentNiche,
      parsed.targetAudience
    );

    res.json({
      success: true,
      industry: parsed.industry,
      contentNiche: parsed.contentNiche,
      targetAudience: parsed.targetAudience,
      ...result,
    });
  } catch (error: any) {
    console.error("[TrendRoutes] POST /analyze-image error:", error.message);
    res.status(500).json({ error: "Failed to analyze image for trends" });
  }
});

export default router;
