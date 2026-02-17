import type { Express } from "express";
import crypto from "crypto";
import express from "express";
import { db } from "./db";
import { videoProductions, universalVideoProjects, videoGenerationJobs } from "../shared/schema";
import { desc, eq } from "drizzle-orm";
import providerTestRouter from "./services/provider-test-routes";
import { AI_VIDEO_PROVIDERS } from "./config/ai-video-providers";
import { VIDEO_PROVIDERS } from "./config/video-providers";
import s3AssetRouter from "./services/s3-asset-routes";
import brandMediaRouter from "./services/brand-media-routes";
import mediaAssetRouter from "./services/media-asset-routes";
import assetLibraryRouter from "./services/asset-library-routes";
import uploadRouter from "./services/upload-routes";
import { processVideoJob } from "./services/job-processor";
import { universalVideoService } from "./services/universal-video-service";
import { aiMusicService } from "./services/ai-music-service";

export function registerRoutes(app: Express) {
  app.use("/api/provider-test", providerTestRouter);
  app.use("/api/admin/s3-assets", s3AssetRouter);
  app.use("/api/brand-media-library", brandMediaRouter);
  app.use("/api/media-assets", mediaAssetRouter);
  app.use("/api/asset-library", assetLibraryRouter);
  app.use("/api/videos", uploadRouter);
  app.use('/uploads', express.static('uploads'));

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

  app.get("/api/services/lambda-health", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    try {
      const { remotionLambdaService } = await import("./services/remotion-lambda-service");
      const isConfigured = await remotionLambdaService.isConfigured();
      if (!isConfigured) {
        return res.json({ health: { status: "unconfigured", region: "us-east-2", timestamp: new Date().toISOString() } });
      }
      const health = await remotionLambdaService.healthCheck();
      res.json({ health });
    } catch (error: any) {
      res.json({ health: { status: "error", error: error.message, timestamp: new Date().toISOString() } });
    }
  });

  app.get("/api/service-status", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    res.json({
      services: {
        piapi: { configured: !!process.env.PIAPI_API_KEY, description: "PiAPI - Video/Image generation hub (Kling, Luma, Veo, Wan, etc.)" },
        runway: { configured: !!process.env.RUNWAY_API_KEY, description: "Runway - Direct video generation API" },
        stability: { configured: !!process.env.STABILITY_API_KEY, description: "Stability AI - Image generation" },
        openai: { configured: !!process.env.OPENAI_API_KEY, description: "OpenAI - Script writing and analysis" },
        anthropic: { configured: !!process.env.ANTHROPIC_API_KEY, description: "Anthropic - AI analysis and prompt enhancement" },
        elevenlabs: { configured: !!process.env.ELEVENLABS_API_KEY, description: "ElevenLabs - Voice generation and TTS" },
        pexels: { configured: !!process.env.PEXELS_API_KEY, description: "Pexels - Stock video/photo library" },
        pixabay: { configured: !!process.env.PIXABAY_API_KEY, description: "Pixabay - Stock media library" },
        unsplash: { configured: !!process.env.UNSPLASH_ACCESS_KEY, description: "Unsplash - Stock photography" },
        remotion: {
          configured: !!(process.env.REMOTION_SERVE_URL && process.env.REMOTION_S3_BUCKET),
          description: "Remotion Lambda - Video composition and rendering",
          details: {
            serveUrl: !!process.env.REMOTION_SERVE_URL,
            s3Bucket: !!process.env.REMOTION_S3_BUCKET,
            awsRegion: !!process.env.REMOTION_AWS_REGION,
            functionName: !!process.env.REMOTION_FUNCTION_NAME,
          }
        },
      },
      timestamp: new Date().toISOString(),
    });
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

  app.get("/api/projects/:projectId", async (req, res) => {
    try {
      const { projectId } = req.params;
      const [project] = await db
        .select()
        .from(universalVideoProjects)
        .where(eq(universalVideoProjects.projectId, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const jobs = await db
        .select()
        .from(videoGenerationJobs)
        .where(eq(videoGenerationJobs.projectId, projectId))
        .orderBy(desc(videoGenerationJobs.createdAt));

      res.json({ ...project, jobs });
    } catch (error) {
      console.error("Failed to fetch project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
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

        processVideoJob(jobId).catch((err) => {
          console.error(`[Routes] Background job ${jobId} failed:`, err.message);
        });

        return res.json({ projectId: project.projectId, id: project.id, jobId, status: "pending" });
      }

      return res.status(400).json({ error: "Invalid mode" });
    } catch (error) {
      console.error("Failed to create project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.delete("/api/projects/:projectId", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const userId = (req.user as any).id;

      const [project] = await db
        .select()
        .from(universalVideoProjects)
        .where(eq(universalVideoProjects.projectId, projectId))
        .limit(1);

      if (!project || project.ownerId !== userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      await db.delete(videoGenerationJobs).where(eq(videoGenerationJobs.projectId, projectId));
      await db.delete(universalVideoProjects).where(eq(universalVideoProjects.projectId, projectId));
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  app.post("/api/projects/:projectId/regenerate", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const userId = (req.user as any).id;

      const [project] = await db
        .select()
        .from(universalVideoProjects)
        .where(eq(universalVideoProjects.projectId, projectId))
        .limit(1);

      if (!project || project.ownerId !== userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      const outputFormat = (project.outputFormat as any) || {};
      const isQuickCreate = outputFormat.platform === "quick-create";

      if (!isQuickCreate) {
        return res.status(400).json({ error: "Regeneration only supported for Quick Create projects" });
      }

      const previousJobs = await db
        .select()
        .from(videoGenerationJobs)
        .where(eq(videoGenerationJobs.projectId, projectId))
        .orderBy(desc(videoGenerationJobs.createdAt))
        .limit(1);

      const originalProvider = previousJobs[0]?.provider || "kling";

      await db.update(universalVideoProjects).set({
        status: "draft",
        outputUrl: null,
        progress: { phase: "generating", percentage: 0, currentStep: "Queued for regeneration" },
      }).where(eq(universalVideoProjects.projectId, projectId));

      const jobId = crypto.randomUUID();
      await db.insert(videoGenerationJobs).values({
        jobId,
        projectId,
        sceneId: "scene-1",
        provider: originalProvider,
        status: "pending",
        prompt: project.description || "",
        duration: project.totalDuration || 6,
        aspectRatio: outputFormat.aspectRatio || "16:9",
        sceneType: project.mediaMode === "image" ? "image" : "video",
        i2vSettings: { saveToLibrary: true, outputType: project.mediaMode || "video" },
        triggeredBy: userId,
      });

      processVideoJob(jobId).catch((err) => {
        console.error(`[Routes] Background regeneration job ${jobId} failed:`, err.message);
      });

      res.json({ jobId, status: "pending" });
    } catch (error) {
      console.error("Failed to regenerate project:", error);
      res.status(500).json({ error: "Failed to regenerate" });
    }
  });

  app.get("/api/projects/:projectId/quick-create/assets", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const userId = (req.user as any).id;

      const [project] = await db
        .select()
        .from(universalVideoProjects)
        .where(eq(universalVideoProjects.projectId, projectId))
        .limit(1);

      if (!project || project.ownerId !== userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      const outputFormat = (project.outputFormat as any) || {};
      if (outputFormat.platform !== "quick-create") {
        return res.status(400).json({ error: "Not a Quick Create project" });
      }

      const assets = (project.assets as any) || {};
      const qc = assets.quickCreate || {};

      const jobs = await db
        .select()
        .from(videoGenerationJobs)
        .where(eq(videoGenerationJobs.projectId, projectId))
        .orderBy(desc(videoGenerationJobs.createdAt))
        .limit(5);

      res.json({
        visual: {
          status: qc.visual?.status || (project.outputUrl ? "completed" : "pending"),
          url: qc.visual?.url || project.outputUrl || null,
          provider: qc.visual?.provider || jobs[0]?.provider || null,
          error: qc.visual?.error || null,
          duration: qc.visual?.duration || null,
          cost: qc.visual?.cost || null,
          generationTimeMs: qc.visual?.generationTimeMs || null,
        },
        voiceover: {
          status: qc.voiceover?.status || "pending",
          url: qc.voiceover?.url || null,
          duration: qc.voiceover?.duration || null,
          error: qc.voiceover?.error || null,
        },
        music: {
          status: qc.music?.status || "pending",
          url: qc.music?.url || null,
          duration: qc.music?.duration || null,
          mood: qc.music?.mood || null,
          error: qc.music?.error || null,
        },
        jobs: jobs.map((j) => ({
          jobId: j.jobId,
          status: j.status,
          provider: j.provider,
          prompt: j.prompt,
          videoUrl: j.videoUrl,
          errorMessage: j.errorMessage,
          createdAt: j.createdAt,
        })),
        project: {
          status: project.status,
          mediaMode: project.mediaMode,
          prompt: project.description,
          outputUrl: project.outputUrl,
          totalDuration: project.totalDuration,
          aspectRatio: outputFormat.aspectRatio,
        },
      });
    } catch (error) {
      console.error("Failed to fetch Quick Create assets:", error);
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  app.post("/api/projects/:projectId/quick-create/generate-visual", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const userId = (req.user as any).id;
      const { prompt: newPrompt, provider: newProvider, duration: newDuration, aspectRatio: newAspectRatio } = req.body || {};

      const [project] = await db
        .select()
        .from(universalVideoProjects)
        .where(eq(universalVideoProjects.projectId, projectId))
        .limit(1);

      if (!project || project.ownerId !== userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      const outputFormat = (project.outputFormat as any) || {};
      if (outputFormat.platform !== "quick-create") {
        return res.status(400).json({ error: "Not a Quick Create project" });
      }

      const finalPrompt = newPrompt || project.description || "";
      const finalProvider = newProvider || "kling";
      const finalDuration = newDuration || project.totalDuration || 6;
      const finalAspectRatio = newAspectRatio || outputFormat.aspectRatio || "16:9";

      if (newPrompt && newPrompt !== project.description) {
        await db.update(universalVideoProjects).set({
          description: newPrompt,
          updatedAt: new Date(),
        }).where(eq(universalVideoProjects.projectId, projectId));
      }

      const existingAssets = (project.assets as any) || {};
      await db.update(universalVideoProjects).set({
        status: "generating",
        progress: { phase: "generating", percentage: 0, currentStep: "Queued for visual generation" },
        assets: {
          ...existingAssets,
          quickCreate: {
            ...(existingAssets.quickCreate || {}),
            visual: {
              status: "queued",
              url: null,
              provider: finalProvider,
              error: null,
              updatedAt: new Date().toISOString(),
            },
          },
        },
        updatedAt: new Date(),
      }).where(eq(universalVideoProjects.projectId, projectId));

      const jobId = crypto.randomUUID();
      await db.insert(videoGenerationJobs).values({
        jobId,
        projectId,
        sceneId: "scene-1",
        provider: finalProvider,
        status: "pending",
        prompt: finalPrompt,
        duration: project.mediaMode === "video" ? finalDuration : undefined,
        aspectRatio: finalAspectRatio,
        sceneType: project.mediaMode === "image" ? "image" : "video",
        i2vSettings: { saveToLibrary: true, outputType: project.mediaMode || "video" },
        triggeredBy: userId,
      });

      processVideoJob(jobId).catch((err) => {
        console.error(`[QuickCreate] Visual generation job ${jobId} failed:`, err.message);
      });

      res.json({ jobId, status: "pending", component: "visual" });
    } catch (error) {
      console.error("Failed to generate Quick Create visual:", error);
      res.status(500).json({ error: "Failed to generate visual" });
    }
  });

  app.post("/api/projects/:projectId/quick-create/generate-voiceover", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const userId = (req.user as any).id;
      const { narrationText, voiceId } = req.body || {};

      const [project] = await db
        .select()
        .from(universalVideoProjects)
        .where(eq(universalVideoProjects.projectId, projectId))
        .limit(1);

      if (!project || project.ownerId !== userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      const outputFormat = (project.outputFormat as any) || {};
      if (outputFormat.platform !== "quick-create") {
        return res.status(400).json({ error: "Not a Quick Create project" });
      }

      const text = narrationText || project.description || "";
      if (!text.trim()) {
        return res.status(400).json({ error: "No narration text provided" });
      }

      const existingAssets = (project.assets as any) || {};
      await db.update(universalVideoProjects).set({
        assets: {
          ...existingAssets,
          quickCreate: {
            ...(existingAssets.quickCreate || {}),
            voiceover: {
              status: "generating",
              url: null,
              error: null,
              updatedAt: new Date().toISOString(),
            },
          },
        },
        updatedAt: new Date(),
      }).where(eq(universalVideoProjects.projectId, projectId));

      res.json({ status: "generating", component: "voiceover" });

      try {
        const result = await universalVideoService.generateVoiceover(text, voiceId);

        const [freshProject] = await db
          .select()
          .from(universalVideoProjects)
          .where(eq(universalVideoProjects.projectId, projectId))
          .limit(1);
        const freshAssets = (freshProject?.assets as any) || {};

        if (result.success && result.url) {
          await db.update(universalVideoProjects).set({
            assets: {
              ...freshAssets,
              quickCreate: {
                ...(freshAssets.quickCreate || {}),
                voiceover: {
                  status: "completed",
                  url: result.url,
                  duration: result.duration,
                  error: null,
                  updatedAt: new Date().toISOString(),
                },
              },
            },
            updatedAt: new Date(),
          }).where(eq(universalVideoProjects.projectId, projectId));
          console.log(`[QuickCreate] Voiceover generated: ${result.url}`);
        } else {
          await db.update(universalVideoProjects).set({
            assets: {
              ...freshAssets,
              quickCreate: {
                ...(freshAssets.quickCreate || {}),
                voiceover: {
                  status: "failed",
                  url: null,
                  error: result.error || "Voiceover generation failed",
                  updatedAt: new Date().toISOString(),
                },
              },
            },
            updatedAt: new Date(),
          }).where(eq(universalVideoProjects.projectId, projectId));
        }
      } catch (err: any) {
        console.error("[QuickCreate] Voiceover generation error:", err.message);
        const [ep] = await db.select().from(universalVideoProjects).where(eq(universalVideoProjects.projectId, projectId)).limit(1);
        const ea = (ep?.assets as any) || {};
        await db.update(universalVideoProjects).set({
          assets: {
            ...ea,
            quickCreate: {
              ...(ea.quickCreate || {}),
              voiceover: { status: "failed", url: null, error: err.message, updatedAt: new Date().toISOString() },
            },
          },
          updatedAt: new Date(),
        }).where(eq(universalVideoProjects.projectId, projectId));
      }
    } catch (error) {
      console.error("Failed to generate Quick Create voiceover:", error);
      res.status(500).json({ error: "Failed to generate voiceover" });
    }
  });

  app.post("/api/projects/:projectId/quick-create/generate-music", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const userId = (req.user as any).id;
      const { mood, style, customPrompt } = req.body || {};

      const [project] = await db
        .select()
        .from(universalVideoProjects)
        .where(eq(universalVideoProjects.projectId, projectId))
        .limit(1);

      if (!project || project.ownerId !== userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      const outputFormat = (project.outputFormat as any) || {};
      if (outputFormat.platform !== "quick-create") {
        return res.status(400).json({ error: "Not a Quick Create project" });
      }

      const duration = project.totalDuration || 10;

      const existingAssets = (project.assets as any) || {};
      await db.update(universalVideoProjects).set({
        assets: {
          ...existingAssets,
          quickCreate: {
            ...(existingAssets.quickCreate || {}),
            music: {
              status: "generating",
              url: null,
              error: null,
              updatedAt: new Date().toISOString(),
            },
          },
        },
        updatedAt: new Date(),
      }).where(eq(universalVideoProjects.projectId, projectId));

      res.json({ status: "generating", component: "music" });

      try {
        let result = await aiMusicService.generateMusic({
          mood: mood || "upbeat",
          style: style || "cinematic",
          duration,
          customPrompt: customPrompt || undefined,
        });

        if (!result || !result.url) {
          console.log("[QuickCreate] PiAPI music failed, trying ElevenLabs fallback...");
          const fallbackResult = await universalVideoService.generateBackgroundMusic(duration, `${mood || "upbeat"} ${style || "cinematic"}`, project.title);
          if (fallbackResult && fallbackResult.url) {
            result = {
              url: fallbackResult.url,
              s3Url: fallbackResult.url,
              duration: fallbackResult.duration || duration,
              mood: mood || "upbeat",
              style: style || "cinematic",
              cost: 0,
            } as any;
          }
        }

        const [freshProject] = await db
          .select()
          .from(universalVideoProjects)
          .where(eq(universalVideoProjects.projectId, projectId))
          .limit(1);
        const freshAssets = (freshProject?.assets as any) || {};

        if (result && result.url) {
          await db.update(universalVideoProjects).set({
            assets: {
              ...freshAssets,
              quickCreate: {
                ...(freshAssets.quickCreate || {}),
                music: {
                  status: "completed",
                  url: result.s3Url || result.url,
                  duration: result.duration,
                  mood: result.mood,
                  style: result.style,
                  cost: result.cost,
                  error: null,
                  updatedAt: new Date().toISOString(),
                },
              },
            },
            updatedAt: new Date(),
          }).where(eq(universalVideoProjects.projectId, projectId));
          console.log(`[QuickCreate] Music generated: ${result.s3Url || result.url}`);
        } else {
          await db.update(universalVideoProjects).set({
            assets: {
              ...freshAssets,
              quickCreate: {
                ...(freshAssets.quickCreate || {}),
                music: {
                  status: "failed",
                  url: null,
                  error: "Music generation failed (both PiAPI and ElevenLabs)",
                  updatedAt: new Date().toISOString(),
                },
              },
            },
            updatedAt: new Date(),
          }).where(eq(universalVideoProjects.projectId, projectId));
        }
      } catch (err: any) {
        console.error("[QuickCreate] Music generation error:", err.message);
        const [ep] = await db.select().from(universalVideoProjects).where(eq(universalVideoProjects.projectId, projectId)).limit(1);
        const ea = (ep?.assets as any) || {};
        await db.update(universalVideoProjects).set({
          assets: {
            ...ea,
            quickCreate: {
              ...(ea.quickCreate || {}),
              music: { status: "failed", url: null, error: err.message, updatedAt: new Date().toISOString() },
            },
          },
          updatedAt: new Date(),
        }).where(eq(universalVideoProjects.projectId, projectId));
      }
    } catch (error) {
      console.error("Failed to generate Quick Create music:", error);
      res.status(500).json({ error: "Failed to generate music" });
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
