import type { Express } from "express";
import crypto from "crypto";
import { db } from "./db";
import { videoProductions, universalVideoProjects, videoGenerationJobs } from "../shared/schema";
import { desc } from "drizzle-orm";
import providerTestRouter from "./services/provider-test-routes";
import { AI_VIDEO_PROVIDERS } from "./config/ai-video-providers";
import { VIDEO_PROVIDERS } from "./config/video-providers";

export function registerRoutes(app: Express) {
  app.use("/api/provider-test", providerTestRouter);

  import("./services/universal-video-routes")
    .then((mod) => {
      app.use("/api/universal-video", mod.default);
      console.log("[Routes] Universal video routes loaded");
    })
    .catch((err: any) => {
      console.warn("[Routes] Universal video routes not loaded:", err.message?.substring(0, 100));
    });
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/universal-video/provider-registry", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const providers = Object.entries(VIDEO_PROVIDERS).map(([id, config]) => ({
      id,
      name: config.name,
      version: config.version,
      costPer10Seconds: config.costPer10Seconds,
      capabilities: config.capabilities,
      apiProvider: config.apiProvider,
      modelId: config.modelId,
      isExecutable: config.isExecutable,
      legacyId: config.legacyId,
    }));

    const families: Record<string, typeof providers> = { kling: [], wan: [], veo: [], other: [] };
    for (const p of providers) {
      if (p.id.startsWith('kling')) families.kling.push(p);
      else if (p.id.startsWith('wan')) families.wan.push(p);
      else if (p.id.includes('veo')) families.veo.push(p);
      else families.other.push(p);
    }

    res.json({
      success: true,
      totalProviders: providers.length,
      providers,
      families,
      videoProviders: providers.map(p => ({
        id: p.id,
        name: p.name,
        costPer10Seconds: p.costPer10Seconds,
        isExecutable: p.isExecutable,
      })),
    });
  });

  app.get("/api/projects", async (_req, res) => {
    try {
      const projects = await db
        .select()
        .from(universalVideoProjects)
        .orderBy(desc(universalVideoProjects.createdAt))
        .limit(50);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.post("/api/projects/create", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { mode, title, description, targetAudience, duration, platform, aspectRatio, mediaMode, qualityTier, script, numScenes, visualStyle, voiceStyle, outputType, prompt, imageStyle, provider, saveToLibrary } = req.body;

      const projectId = crypto.randomUUID();

      const resolutionMap: Record<string, { width: number; height: number }> = {
        "16:9": { width: 1920, height: 1080 },
        "9:16": { width: 1080, height: 1920 },
        "1:1": { width: 1080, height: 1080 },
      };

      const resolution = resolutionMap[aspectRatio || "16:9"] || resolutionMap["16:9"];

      if (mode === "ai-script" || mode === "custom-script") {
        const type = mode === "ai-script" ? "product" : "script-based";
        const [project] = await db.insert(universalVideoProjects).values({
          projectId,
          ownerId: (req.user as any).id,
          type,
          title: title || "Untitled Project",
          description: description || script || "",
          targetAudience: targetAudience || null,
          totalDuration: duration || 60,
          fps: 30,
          outputFormat: { aspectRatio: aspectRatio || "16:9", resolution, platform: platform || "YouTube" },
          brand: {},
          scenes: [],
          assets: {},
          progress: { phase: "draft", percentage: 0, currentStep: "" },
          status: "draft",
          qualityTier: qualityTier || "premium",
          mediaMode: mediaMode || "video",
        }).returning();

        return res.json({ projectId: project.projectId, id: project.id, status: "draft" });
      }

      if (mode === "quick-create") {
        const [project] = await db.insert(universalVideoProjects).values({
          projectId,
          ownerId: (req.user as any).id,
          type: "product",
          title: `Quick ${outputType === "image" ? "Image" : "Video"} - ${new Date().toLocaleDateString()}`,
          description: prompt || "",
          totalDuration: outputType === "video" ? (duration || 6) : 0,
          fps: 30,
          outputFormat: { aspectRatio: aspectRatio || "16:9", resolution, platform: "quick-create" },
          brand: {},
          scenes: [],
          assets: {},
          progress: { phase: "generating", percentage: 0, currentStep: "Queued for generation" },
          status: "draft",
          qualityTier: "standard",
          mediaMode: outputType === "image" ? "image" : "video",
        }).returning();

        const jobId = crypto.randomUUID();
        await db.insert(videoGenerationJobs).values({
          jobId,
          projectId,
          sceneId: "scene-1",
          provider: provider === "auto" ? "kling" : (provider || "kling"),
          status: "pending",
          prompt: prompt || "",
          duration: outputType === "video" ? (duration || 6) : undefined,
          aspectRatio: aspectRatio || "16:9",
          style: outputType === "image" ? (imageStyle || "Photorealistic") : undefined,
          sceneType: outputType === "image" ? "image" : "video",
          i2vSettings: { saveToLibrary: saveToLibrary !== false, outputType: outputType || "video" },
          triggeredBy: (req.user as any).id,
        });

        return res.json({ projectId: project.projectId, id: project.id, jobId, status: "pending" });
      }

      return res.status(400).json({ error: "Invalid mode" });
    } catch (error) {
      console.error("Failed to create project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.get("/api/productions", async (_req, res) => {
    try {
      const productions = await db
        .select()
        .from(videoProductions)
        .orderBy(desc(videoProductions.createdAt))
        .limit(50);
      res.json(productions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch productions" });
    }
  });
}
