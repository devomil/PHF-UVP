import { Router, Request, Response } from "express";
import { db } from "../db";
import { brandSettings, trendCache } from "../../shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { getTrendingHooks, clearCacheForIndustry } from "./trend-intelligence-service";

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

export default router;
