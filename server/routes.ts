import type { Express } from "express";
import crypto from "crypto";
import express from "express";
import { db } from "./db";
import { videoProductions, universalVideoProjects, videoGenerationJobs } from "../shared/schema";
import { desc, eq, and, or, inArray } from "drizzle-orm";
import providerTestRouter from "./services/provider-test-routes";
import piapiTestRouter from "./services/piapi-test-routes";
import { AI_VIDEO_PROVIDERS } from "./config/ai-video-providers";
import { VIDEO_PROVIDERS } from "./config/video-providers";
import s3AssetRouter from "./services/s3-asset-routes";
import adminRouter from "./services/admin-routes";
import brandMediaRouter from "./services/brand-media-routes";
import mediaAssetRouter from "./services/media-asset-routes";
import assetLibraryRouter from "./services/asset-library-routes";
import uploadRouter from "./services/upload-routes";
import brandSettingsRouter from "./services/brand-settings-routes";
import trendIntelligenceRouter from "./services/trend-intelligence-routes";
import socialPublishingRouter from "./services/social-publishing-routes";
import { processVideoJob, recoverStuckJobs } from "./services/job-processor";
import { universalVideoService } from "./services/universal-video-service";
import { aiMusicService } from "./services/ai-music-service";
import { getBrandContext } from "./services/brand-settings-service";
import { analyzeProductImage } from "./services/product-analysis-service";
import { assetLibrary } from "../shared/schema";
import { getProjectType, getContentStructure } from "../shared/config/project-types";
import studioPolishUploadRouter from "./services/studio-polish-upload";
import { canvaAuthRouter } from "./services/canva-auth-routes";
import { canvaSyncRouter } from "./services/canva-sync-routes";

async function analyzeAndStoreProductMedia(projectId: string, mediaUrl: string, brief: string, userId: string, scriptPresets?: any) {
  console.log(`[Routes] Starting product media analysis for project ${projectId}`);

  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(mediaUrl);

  const [existing] = await db.select().from(universalVideoProjects).where(eq(universalVideoProjects.projectId, projectId));
  if (!existing) {
    console.warn(`[Routes] Project ${projectId} not found for product media analysis`);
    return;
  }

  const existingAssets = (existing.assets as any) || {};
  existingAssets.productMediaUrl = mediaUrl;
  existingAssets.productMediaType = isImage ? 'image' : 'video';
  await db.update(universalVideoProjects)
    .set({ assets: existingAssets, updatedAt: new Date() })
    .where(eq(universalVideoProjects.projectId, projectId));

  if (isImage) {
    try {
      const productContext = await analyzeProductImage(mediaUrl, brief, scriptPresets);
      const [fresh] = await db.select().from(universalVideoProjects).where(eq(universalVideoProjects.projectId, projectId));
      if (fresh) {
        const latestProgress = (fresh.progress as any) || {};
        latestProgress.productContext = productContext;
        latestProgress.productAnalysisStatus = 'complete';
        await db.update(universalVideoProjects)
          .set({ progress: latestProgress, updatedAt: new Date() })
          .where(eq(universalVideoProjects.projectId, projectId));
        console.log(`[Routes] Product context saved for project ${projectId}: ${productContext.productName}`);
      }
    } catch (err: any) {
      console.error(`[Routes] Vision analysis failed for ${projectId}:`, err.message);
      const [fresh] = await db.select().from(universalVideoProjects).where(eq(universalVideoProjects.projectId, projectId));
      if (fresh) {
        const latestProgress = (fresh.progress as any) || {};
        latestProgress.productAnalysisStatus = 'failed';
        await db.update(universalVideoProjects)
          .set({ progress: latestProgress, updatedAt: new Date() })
          .where(eq(universalVideoProjects.projectId, projectId));
      }
    }
  }

  try {
    await db.insert(assetLibrary).values({
      projectId,
      assetUrl: mediaUrl,
      thumbnailUrl: isImage ? mediaUrl : undefined,
      assetType: isImage ? 'image' : 'video',
      provider: 'user-upload',
      prompt: `Brand Media — ${brief?.slice(0, 100) || 'Product reference'}`,
      contentType: 'brand-media',
      tags: ['brand-media', 'product-reference'],
      createdBy: userId,
    });
    console.log(`[Routes] Brand media asset added to library for project ${projectId}`);
  } catch (err: any) {
    console.error(`[Routes] Asset library insert failed for ${projectId}:`, err.message);
  }
}

export async function registerRoutes(app: Express) {
  app.use("/api/provider-test", providerTestRouter);
  app.use(piapiTestRouter);
  app.use("/api/admin/s3-assets", s3AssetRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/brand-media-library", brandMediaRouter);
  app.use("/api/media-assets", mediaAssetRouter);
  app.use("/api/asset-library", assetLibraryRouter);
  app.use("/api/videos", uploadRouter);
  app.use("/api/brand-settings", brandSettingsRouter);
  app.use("/api/studio-polish", studioPolishUploadRouter);
  app.use("/api/trend-intelligence", trendIntelligenceRouter);
  app.use("/api/social", socialPublishingRouter);
  app.use("/api/canva", canvaAuthRouter);
  app.use("/api/canva", canvaSyncRouter);
  app.use('/uploads', express.static('uploads'));
  app.use('/test-images', express.static('public/test-images'));
  app.use('/test-videos', express.static('public/test-videos'));
  app.use('/email-assets', express.static('public'));
  app.use('/art-presets', express.static('client/public/art-presets'));

  try {
    const mod = await import("./services/universal-video-routes");
    app.use("/api/universal-video", mod.default);
    console.log("[Routes] Universal video routes loaded");
  } catch (err: any) {
    console.warn("[Routes] Universal video routes not loaded:", err.message?.substring(0, 100));
  }

  import("./services/video-worker-process")
    .then((mod) => {
      mod.startVideoWorkerLoop();
      console.log("[Routes] Video worker loop started");
    })
    .catch((err: any) => {
      console.warn("[Routes] Video worker loop not started:", err.message?.substring(0, 100));
    });

  import("./services/video-generation-worker")
    .then((mod) => {
      mod.videoGenerationWorker.startWorker(5000);
      console.log("[Routes] Scene video generation worker started");
    })
    .catch((err: any) => {
      console.warn("[Routes] Scene video generation worker not started:", err.message?.substring(0, 100));
    });

  setTimeout(() => {
    recoverStuckJobs().then(() => {
      console.log("[Routes] Stuck job recovery check completed");
    }).catch((err) => {
      console.error("[Routes] Stuck job recovery failed:", err?.message || err);
    });
  }, 3000);
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

  app.get("/api/projects", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as any).id;
      const projects = await db
        .select()
        .from(universalVideoProjects)
        .where(eq(universalVideoProjects.ownerId, userId))
        .orderBy(desc(universalVideoProjects.createdAt))
        .limit(50);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:projectId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const { projectId } = req.params;
      const userId = (req.user as any).id;
      const [project] = await db
        .select()
        .from(universalVideoProjects)
        .where(eq(universalVideoProjects.projectId, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (project.ownerId !== userId) {
        return res.status(403).json({ error: "Access denied" });
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

      const { mode, title, description, targetAudience, duration, platform, aspectRatio, mediaMode, videoGenerationMode, qualityTier, script, numScenes, visualStyle, voiceStyle, outputType, prompt, imageStyle, provider, saveToLibrary, customScenes, artPresetId, artPresetIds, characterConsistency, characters, characterReferenceUrl, characterName, characterDescription, generationMode, negativePrompt, sourceImageUrl, referenceVideoUrl, imageFidelity, productMediaUrl, scriptPresets, projectType, contentStructure, projectPurpose, productVisualDescription, i2iTransformType, i2iStrength, projectName } = req.body;

      const projectId = crypto.randomUUID();

      const resolutionMap: Record<string, { width: number; height: number }> = {
        "16:9": { width: 1920, height: 1080 },
        "9:16": { width: 1080, height: 1920 },
        "1:1": { width: 1080, height: 1080 },
      };

      const ptConfig = projectType ? getProjectType(projectType) : null;
      const derivedPlatform = ptConfig?.platform || platform || "YouTube";
      const derivedAspectRatio = ptConfig?.aspectRatio || aspectRatio || "16:9";
      const derivedDuration = ptConfig?.defaultDuration || duration || 60;
      const derivedQualityTier = ptConfig?.qualityTier || qualityTier || "premium";
      const resolution = resolutionMap[derivedAspectRatio] || resolutionMap["16:9"];

      if (mode === "ai-script" || mode === "custom-script") {
        const type = mode === "ai-script" ? "product" : "script-based";
        const userId = (req.user as any).id;
        const brandData = await getBrandContext(userId);

        let preSeededScenes: any[] = [];
        if (mode === "custom-script" && customScenes && Array.isArray(customScenes) && customScenes.length > 0) {
          const totalDur = duration || 60;
          const sceneDur = Math.floor(totalDur / customScenes.length);
          const remainder = totalDur - (sceneDur * customScenes.length);
          preSeededScenes = customScenes.map((cs: any, index: number) => ({
            id: cs.id || crypto.randomUUID(),
            type: cs.type || "content",
            title: cs.title || "",
            narration: cs.narration || "",
            visualDirection: "",
            duration: cs.duration || (sceneDur + (index === customScenes.length - 1 ? remainder : 0)),
            order: index,
          }));
          console.log(`[Routes] Custom script with ${preSeededScenes.length} pre-defined scenes`);
        }

        const progressData: any = preSeededScenes.length > 0 ? { phase: "scenes-ready", percentage: 20, currentStep: "Scenes defined" } : { phase: "draft", percentage: 0, currentStep: "" };
        if (artPresetIds && Array.isArray(artPresetIds) && artPresetIds.length > 0) {
          const { getVisualArtPreset } = await import("../shared/config/visual-art-presets");
          const uniqueIds = [...new Set(artPresetIds as string[])];
          const validIds = uniqueIds.filter((id: string) => getVisualArtPreset(id)).slice(0, 3);
          if (validIds.length > 0) {
            progressData.artPresetIds = validIds;
            progressData.artPresetId = validIds[0];
            console.log(`[Routes] Multi-style selection: ${validIds.join(', ')}`);
          }
        } else if (artPresetId && artPresetId !== "auto") {
          const { getVisualArtPreset } = await import("../shared/config/visual-art-presets");
          if (getVisualArtPreset(artPresetId)) {
            progressData.artPresetId = artPresetId;
          } else {
            console.warn(`[Routes] Invalid artPresetId "${artPresetId}", ignoring`);
          }
        }
        if (!progressData.artPresetId && !progressData.artPresetIds) {
          progressData.artPresetId = 'cinematic-realism';
          console.log(`[Routes] No art preset selected — defaulting to cinematic-realism`);
        }
        if (characterConsistency) {
          progressData.characterConsistency = true;
        }
        if (productMediaUrl) {
          progressData.productMediaUrl = productMediaUrl;
        }
        if (productVisualDescription && typeof productVisualDescription === 'string' && productVisualDescription.trim().length > 0) {
          progressData.productVisualDescription = productVisualDescription.trim();
        }
        if (scriptPresets) {
          progressData.scriptPresets = scriptPresets;
        }
        if (projectType && ptConfig) {
          progressData.projectType = projectType;
        } else if (projectType) {
          console.warn(`[Routes] Invalid projectType "${projectType}", ignoring`);
        }
        if (contentStructure && projectType === 'educational') {
          const validStructure = getContentStructure(contentStructure);
          if (validStructure) {
            progressData.contentStructure = contentStructure;
          } else {
            console.warn(`[Routes] Invalid contentStructure "${contentStructure}" for educational project, ignoring`);
          }
        }
        if (projectPurpose) {
          const { getProjectPurpose } = await import("../shared/config/project-types");
          if (getProjectPurpose(projectPurpose)) {
            progressData.projectPurpose = projectPurpose;
            console.log(`[Routes] Project purpose: ${projectPurpose}`);
          } else {
            console.warn(`[Routes] Invalid projectPurpose "${projectPurpose}", ignoring`);
          }
        }

        const [project] = await db.insert(universalVideoProjects).values({
          projectId,
          ownerId: userId,
          type,
          title: title || "Untitled Project",
          description: description || script || "",
          targetAudience: targetAudience || null,
          totalDuration: derivedDuration,
          fps: 30,
          outputFormat: { aspectRatio: derivedAspectRatio, resolution, platform: derivedPlatform },
          brand: brandData.brandName ? { name: brandData.brandName, tagline: brandData.tagline, website: brandData.website, colors: { primary: brandData.primaryColor, secondary: brandData.secondaryColor, accent: brandData.accentColor }, logoUrl: brandData.logoUrl, guidelines: brandData.guidelines } : {},
          scenes: preSeededScenes,
          assets: {},
          progress: progressData,
          status: "draft",
          qualityTier: derivedQualityTier,
          mediaMode: mediaMode || "video",
          videoGenerationMode: videoGenerationMode || null,
          voiceStyle: voiceStyle || null,
          characters: Array.isArray(characters) ? characters : [],
          productVisualDescription: (productVisualDescription && typeof productVisualDescription === 'string' && productVisualDescription.trim().length > 0)
            ? productVisualDescription.trim()
            : null,
        }).returning();

        if (productMediaUrl && mode === "ai-script") {
          analyzeAndStoreProductMedia(projectId, productMediaUrl, description || "", userId, scriptPresets || null).catch((err: any) => {
            console.error(`[Routes] Product media analysis failed for ${projectId}:`, err.message);
          });
        }

        return res.json({ projectId: project.projectId, id: project.id, status: "draft" });
      }

      if (mode === "quick-create") {
        const qcUserId = (req.user as any).id;
        const qcBrandData = await getBrandContext(qcUserId);

        const qcProgressData: any = { phase: "generating", percentage: 0, currentStep: "Queued for generation" };
        if (artPresetId && artPresetId !== "auto") {
          const { getVisualArtPreset } = await import("../shared/config/visual-art-presets");
          if (getVisualArtPreset(artPresetId)) {
            qcProgressData.artPresetId = artPresetId;
          }
        }

        let enhancedPrompt = prompt || "";
        if (qcProgressData.artPresetId) {
          const { getVisualArtPreset, isStylizedPreset } = await import("../shared/config/visual-art-presets");
          const qcPreset = getVisualArtPreset(qcProgressData.artPresetId);
          if (qcPreset && isStylizedPreset(qcPreset.id)) {
            const keywords = qcPreset.styleKeywords || [];
            const promptLower = enhancedPrompt.toLowerCase();
            const hasStyle = keywords.length > 0 ? keywords.some((kw: string) => promptLower.includes(kw)) : false;
            if (!hasStyle) {
              const prefix = qcPreset.styleMarkerPrefix || qcPreset.name;
              enhancedPrompt = `${prefix} — ${enhancedPrompt}`;
            }
            if (qcPreset.globalStyleNotes) {
              enhancedPrompt = `${enhancedPrompt}. Style: ${qcPreset.globalStyleNotes}`;
            }
          }
        }

        if (characterReferenceUrl && characterDescription) {
          const charName = characterName || "the character";
          enhancedPrompt = `${enhancedPrompt}\nGenerate a NEW scene showing ${charName} in the described setting. Use the reference image ONLY for character appearance consistency (face, hair, clothing, art style). Do NOT animate or reproduce the reference image itself. Character: ${charName} — ${characterDescription}`;
          console.log(`[Routes] Quick Create with character reference: ${charName}, image: ${characterReferenceUrl.substring(0, 60)}...`);
        }

        const qcEffectiveOutputType = outputType || (generationMode === 't2i' || generationMode === 'i2i' ? 'image' : 'video');
        const qcModeLabel = generationMode === 't2i' ? 'Image' : generationMode === 'i2i' ? 'I2I' : generationMode === 'i2v' ? 'I2V' : generationMode === 'v2v' ? 'V2V' : 'Video';

        // Compute the project-level Product reference up front so we can persist it
        // as the project default. The asset panel surfaces this with an "Inherited
        // from project" hint and treats subsequent uploads as per-scene overrides.
        const qcSourceImage = sourceImageUrl || characterReferenceUrl || undefined;

        const [project] = await db.insert(universalVideoProjects).values({
          projectId,
          ownerId: qcUserId,
          type: "product",
          title: (typeof projectName === "string" && projectName.trim())
            ? projectName.trim().slice(0, 120)
            : `Quick ${qcModeLabel} - ${new Date().toLocaleDateString()}`,
          description: prompt || "",
          totalDuration: qcEffectiveOutputType === "video" ? (duration || 6) : 0,
          fps: 30,
          outputFormat: { aspectRatio: aspectRatio || "16:9", resolution, platform: "quick-create" },
          brand: qcBrandData.brandName ? { name: qcBrandData.brandName, tagline: qcBrandData.tagline, website: qcBrandData.website, colors: { primary: qcBrandData.primaryColor, secondary: qcBrandData.secondaryColor, accent: qcBrandData.accentColor }, logoUrl: qcBrandData.logoUrl, guidelines: qcBrandData.guidelines } : {},
          scenes: [],
          assets: qcSourceImage ? { productMediaUrl: qcSourceImage } : {},
          progress: qcProgressData,
          status: "draft",
          qualityTier: "standard",
          mediaMode: qcEffectiveOutputType === "image" ? "image" : "video",
        }).returning();

        if (generationMode === 'i2i' && !qcSourceImage) {
          return res.status(400).json({ error: "A source image is required for I2I mode." });
        }
        if (generationMode === 'i2i' && i2iStrength !== undefined && (i2iStrength < 0.1 || i2iStrength > 1.0)) {
          return res.status(400).json({ error: "Transformation strength must be between 0.1 and 1.0." });
        }
        const validI2ITransformTypes = ['scene-integration', 'background-generation', 'style-transfer', 'product-placement'];
        if (generationMode === 'i2i' && i2iTransformType && !validI2ITransformTypes.includes(i2iTransformType)) {
          return res.status(400).json({ error: `Invalid transformation type. Must be one of: ${validI2ITransformTypes.join(', ')}` });
        }

        const isI2I = generationMode === 'i2i' && qcSourceImage;
        const isI2V = generationMode === 'i2v' && qcSourceImage;
        const isV2V = generationMode === 'v2v' && referenceVideoUrl;

        let qcSceneType: string = qcEffectiveOutputType === "image" ? "image" : "video";
        if (isI2I) qcSceneType = "i2i";
        if (isI2V) qcSceneType = "i2v";
        if (isV2V) qcSceneType = "v2v";

        console.log(`[Routes] Quick Create: mode=${generationMode}, sceneType=${qcSceneType}, provider=${provider}, sourceImage=${qcSourceImage ? 'YES' : 'NO'}, refVideo=${referenceVideoUrl ? 'YES' : 'NO'}, negativePrompt=${negativePrompt ? 'YES' : 'NO'}, imageFidelity=${imageFidelity || 'default'}`);

        const jobId = crypto.randomUUID();
        await db.insert(videoGenerationJobs).values({
          jobId,
          projectId,
          sceneId: "quick-create",
          provider: provider || "auto",
          status: "pending",
          prompt: enhancedPrompt,
          negativePrompt: negativePrompt || undefined,
          duration: qcEffectiveOutputType === "video" ? (duration || 6) : undefined,
          aspectRatio: aspectRatio || "16:9",
          style: qcEffectiveOutputType === "image" ? (imageStyle || "Photorealistic") : undefined,
          sceneType: qcSceneType,
          sourceImageUrl: qcSourceImage,
          i2vSettings: {
            saveToLibrary: saveToLibrary !== false,
            outputType: qcEffectiveOutputType || "video",
            artPresetId: qcProgressData.artPresetId || undefined,
            ...(characterReferenceUrl && !sourceImageUrl ? { isCharacterReference: true } : {}),
            ...(isI2V && imageFidelity !== undefined ? { imageControlStrength: imageFidelity } : {}),
            ...(isV2V ? { referenceVideoUrl, generationMode: 'v2v' } : {}),
            ...(isI2I ? { generationMode: 'i2i', i2iTransformType: i2iTransformType || 'scene-integration', i2iStrength: i2iStrength !== undefined ? i2iStrength : 0.65 } : {}),
          },
          triggeredBy: (req.user as any).id,
        });

        processVideoJob(jobId).catch((err) => {
          console.error(`[Routes] Background job ${jobId} failed:`, err.message);
        });

        return res.json({ projectId: project.projectId, id: project.id, jobId, status: "pending" });
      }

      if (mode === "studio-polish") {
        const spUserId = (req.user as any).id;
        const spBrandData = await getBrandContext(spUserId);
        const { uploadedFiles, notes } = req.body;

        if (!uploadedFiles || !Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
          return res.status(400).json({ error: "At least one file must be uploaded" });
        }

        const spScenes = uploadedFiles.map((file: any, index: number) => {
          const isVideo = file.fileType === 'video';
          return {
            id: crypto.randomUUID(),
            type: "content",
            title: file.fileName || `Scene ${index + 1}`,
            narration: "",
            visualDirection: "",
            duration: file.duration || 5,
            order: index,
            sourceType: "upload",
            microScenes: [{
              id: crypto.randomUUID(),
              videoUrl: isVideo ? file.s3Url : null,
              imageUrl: isVideo ? (file.thumbnailUrl || null) : file.s3Url,
              status: "ready",
              duration: file.duration || 5,
              originalAudioVolume: isVideo ? 1.0 : 0,
              originalAudioFadeIn: 0.3,
              originalAudioFadeOut: 0.5,
              prompt: "",
              sourceType: "upload",
            }],
          };
        });

        const totalDuration = spScenes.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);
        const spProgressData: any = {
          phase: "scenes-ready",
          percentage: 50,
          currentStep: "Media uploaded — ready for polish",
          projectMode: "studio-polish",
        };

        const [project] = await db.insert(universalVideoProjects).values({
          projectId,
          ownerId: spUserId,
          type: "script-based",
          title: title || "Untitled Studio Polish",
          description: notes || description || "",
          totalDuration,
          fps: 30,
          outputFormat: { aspectRatio: derivedAspectRatio, resolution, platform: derivedPlatform },
          brand: spBrandData.brandName ? { name: spBrandData.brandName, tagline: spBrandData.tagline, website: spBrandData.website, colors: { primary: spBrandData.primaryColor, secondary: spBrandData.secondaryColor, accent: spBrandData.accentColor }, logoUrl: spBrandData.logoUrl, guidelines: spBrandData.guidelines } : {},
          scenes: spScenes,
          assets: {},
          progress: spProgressData,
          status: "draft",
          qualityTier: derivedQualityTier,
          mediaMode: "video",
        }).returning();

        console.log(`[Routes] Studio Polish project created: ${projectId} with ${spScenes.length} scenes, total ${totalDuration.toFixed(1)}s`);
        return res.json({ projectId: project.projectId, id: project.id, status: "draft" });
      }

      return res.status(400).json({ error: "Invalid mode" });
    } catch (error) {
      console.error("Failed to create project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:projectId", async (req, res) => {
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

      const { scenes } = req.body;
      if (!scenes || !Array.isArray(scenes)) {
        return res.status(400).json({ error: "scenes array is required" });
      }

      await db.update(universalVideoProjects)
        .set({ scenes, updatedAt: new Date() })
        .where(eq(universalVideoProjects.projectId, projectId));

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to update project:", error);
      res.status(500).json({ error: "Failed to update project" });
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

      const originalJob = previousJobs[0];
      const originalProvider = originalJob?.provider || "kling";

      await db.update(universalVideoProjects).set({
        status: "draft",
        outputUrl: null,
        progress: { phase: "generating", percentage: 0, currentStep: "Queued for regeneration" },
      }).where(eq(universalVideoProjects.projectId, projectId));

      const originalSceneType = originalJob?.sceneType || (project.mediaMode === "image" ? "image" : "video");
      const originalI2vSettings = (originalJob?.i2vSettings as any) || {};

      // Step 3: Fall back to the persisted project-level Product default
      // (assets.productMediaUrl) when the prior job didn't carry a source
      // image. This keeps regenerations consistent with the project default
      // shown in the Quick Create asset panel.
      const projectAssetsForRegen = (project.assets as any) || {};
      const projectProductDefault = projectAssetsForRegen?.productMediaUrl || undefined;

      const jobId = crypto.randomUUID();
      await db.insert(videoGenerationJobs).values({
        jobId,
        projectId,
        sceneId: "quick-create",
        provider: originalProvider || "auto",
        status: "pending",
        prompt: project.description || "",
        negativePrompt: originalJob?.negativePrompt || undefined,
        duration: project.totalDuration || 6,
        aspectRatio: outputFormat.aspectRatio || "16:9",
        sceneType: originalSceneType,
        sourceImageUrl: originalJob?.sourceImageUrl || projectProductDefault,
        i2vSettings: {
          saveToLibrary: true,
          outputType: project.mediaMode || "video",
          ...originalI2vSettings,
        },
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

      const latestJob = jobs[0];
      const latestI2vSettings = (latestJob?.i2vSettings as any) || {};
      const progressData = (project.progress as any) || {};

      const visualUrl = qc.visual?.url || project.outputUrl || null;
      let visualStatus = qc.visual?.status || (project.outputUrl ? "completed" : "pending");
      if (visualStatus === "generating" && visualUrl) {
        visualStatus = "completed";
      }
      if (visualStatus === "generating" && latestJob?.status === "completed") {
        visualStatus = "completed";
      }

      // Pull brand logo (read-only) for the LOGO reference slot in Quick Create.
      let brandLogoUrl: string | null = null;
      try {
        const { brandBibleService } = await import('./services/brand-bible-service');
        const bb = await brandBibleService.getBrandBible(userId);
        const logo = bb?.logos?.main || bb?.logos?.intro || bb?.logos?.outro || bb?.logos?.watermark;
        brandLogoUrl = logo?.url || null;
      } catch {
        brandLogoUrl = null;
      }

      res.json({
        visual: {
          status: visualStatus,
          url: visualUrl,
          provider: qc.visual?.provider || latestJob?.provider || null,
          error: qc.visual?.error || null,
          duration: qc.visual?.duration || null,
          cost: qc.visual?.cost || null,
          generationTimeMs: qc.visual?.generationTimeMs || null,
        },
        voiceover: {
          status: qc.voiceover?.status || "pending",
          url: qc.voiceover?.url || null,
          duration: qc.voiceover?.duration || null,
          narrationText: qc.voiceover?.narrationText || null,
          tone: qc.voiceover?.tone || null,
          error: qc.voiceover?.error || null,
        },
        music: {
          status: qc.music?.status || "pending",
          url: qc.music?.url || null,
          duration: qc.music?.duration || null,
          mood: qc.music?.mood || null,
          error: qc.music?.error || null,
        },
        overlayItems: qc.overlayItems || [],
        jobs: jobs.map((j) => ({
          jobId: j.jobId,
          status: j.status,
          provider: j.provider,
          prompt: j.prompt,
          videoUrl: j.videoUrl,
          errorMessage: j.errorMessage,
          createdAt: j.createdAt,
          sceneType: j.sceneType,
          sourceImageUrl: j.sourceImageUrl,
        })),
        project: {
          status: project.status,
          mediaMode: project.mediaMode,
          prompt: project.description,
          outputUrl: project.outputUrl,
          totalDuration: project.totalDuration,
          aspectRatio: outputFormat.aspectRatio,
        },
        generationInfo: {
          sceneType: latestJob?.sceneType || null,
          sourceImageUrl: latestJob?.sourceImageUrl || null,
          negativePrompt: latestJob?.negativePrompt || null,
          artPresetId: progressData.artPresetId || latestI2vSettings.artPresetId || null,
          imageFidelity: latestI2vSettings.imageControlStrength ?? null,
          referenceVideoUrl: latestI2vSettings.referenceVideoUrl || null,
          characterRefImageUrl: latestI2vSettings.characterRefImageUrl || null,
          referenceImages: Array.isArray(latestI2vSettings.referenceImages) ? latestI2vSettings.referenceImages : [],
          // Effective logo URL after applying any per-run override from the
          // last job (custom upload, exclusion, or fall back to brand bible).
          brandLogoUrl: latestI2vSettings.logoExcluded === true
            ? null
            : (latestI2vSettings.customLogoUrl || brandLogoUrl),
          // Raw brand-bible logo, so the UI can re-offer it when the user
          // un-removes / un-replaces.
          brandBibleLogoUrl: brandLogoUrl,
          logoExcluded: latestI2vSettings.logoExcluded === true,
          customLogoUrl: latestI2vSettings.customLogoUrl || null,
          // Project-level Product default — set at project creation. The asset
          // panel shows an "Inherited from project" hint when the active source
          // image matches this and there's no per-scene override.
          projectProductMediaUrl: assets?.productMediaUrl || null,
          provider: qc.visual?.provider || latestJob?.provider || null,
        },
      });
    } catch (error) {
      console.error("Failed to fetch Quick Create assets:", error);
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  app.patch("/api/projects/:projectId/quick-create/overlays", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const userId = (req.user as any).id;
      const { overlayItems } = req.body;

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

      const currentAssets = (project.assets as any) || {};
      const updatedAssets = {
        ...currentAssets,
        quickCreate: {
          ...currentAssets.quickCreate,
          overlayItems: Array.isArray(overlayItems) ? overlayItems : [],
        },
      };

      await db.update(universalVideoProjects).set({
        assets: updatedAssets,
      }).where(eq(universalVideoProjects.projectId, projectId));

      res.json({ success: true, overlayItems: updatedAssets.quickCreate.overlayItems });
    } catch (error) {
      console.error("Failed to save Quick Create overlays:", error);
      res.status(500).json({ error: "Failed to save overlays" });
    }
  });

  app.post("/api/projects/:projectId/quick-create/generate-visual", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const userId = (req.user as any).id;
      const { prompt: newPrompt, provider: newProvider, duration: newDuration, aspectRatio: newAspectRatio, negativePrompt: newNegativePrompt, imageFidelity: newImageFidelity, artPresetId: newArtPresetId, sourceImageUrl: newSourceImageUrl, removeSourceImage, characterRefImageUrl: newCharacterRefImageUrl, referenceImages: newReferenceImages, excludeLogo: newExcludeLogo, customLogoUrl: newCustomLogoUrl } = req.body || {};

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
      const finalProvider = newProvider || "auto";
      const requestedDuration = Number(newDuration);
      const sanitizedRequestedDuration =
        Number.isFinite(requestedDuration) && requestedDuration > 0
          ? Math.max(3, Math.min(60, Math.round(requestedDuration)))
          : null;
      const finalDuration = sanitizedRequestedDuration ?? project.totalDuration ?? 6;
      const finalAspectRatio = newAspectRatio || outputFormat.aspectRatio || "16:9";

      if (newPrompt && newPrompt !== project.description) {
        await db.update(universalVideoProjects).set({
          description: newPrompt,
          updatedAt: new Date(),
        }).where(eq(universalVideoProjects.projectId, projectId));
      }

      if (
        sanitizedRequestedDuration !== null &&
        sanitizedRequestedDuration !== project.totalDuration &&
        project.mediaMode !== "image"
      ) {
        await db.update(universalVideoProjects).set({
          totalDuration: sanitizedRequestedDuration,
          updatedAt: new Date(),
        }).where(eq(universalVideoProjects.projectId, projectId));
      }

      if (newAspectRatio && newAspectRatio !== outputFormat.aspectRatio) {
        const resolutionMap: Record<string, { width: number; height: number }> = {
          "16:9": { width: 1920, height: 1080 },
          "9:16": { width: 1080, height: 1920 },
          "1:1": { width: 1080, height: 1080 },
        };
        await db.update(universalVideoProjects).set({
          outputFormat: { ...outputFormat, aspectRatio: newAspectRatio, resolution: resolutionMap[newAspectRatio] || resolutionMap["16:9"] },
          updatedAt: new Date(),
        }).where(eq(universalVideoProjects.projectId, projectId));
      }

      const existingAssets = (project.assets as any) || {};
      // Step 3: An explicit "remove source image" request also clears the
      // persisted project-level Product default, so the slot stays cleared
      // across future regenerations and on the asset panel after hydration.
      const updatedProjectAssets = {
        ...existingAssets,
        ...(removeSourceImage ? { productMediaUrl: null } : {}),
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
      };
      await db.update(universalVideoProjects).set({
        status: "generating",
        progress: { phase: "generating", percentage: 0, currentStep: "Queued for visual generation" },
        assets: updatedProjectAssets,
        updatedAt: new Date(),
      }).where(eq(universalVideoProjects.projectId, projectId));

      const previousJobs = await db
        .select()
        .from(videoGenerationJobs)
        .where(eq(videoGenerationJobs.projectId, projectId))
        .orderBy(desc(videoGenerationJobs.createdAt))
        .limit(1);
      const originalJob = previousJobs[0];
      let finalSceneType = originalJob?.sceneType || (project.mediaMode === "image" ? "image" : "video");
      const originalI2vSettings = (originalJob?.i2vSettings as any) || {};
      // Step 3: Project-level Product default acts as fallback when neither a
      // new upload nor the prior job carries a source image. Reads from the
      // freshly updated assets so an explicit `removeSourceImage` (which we
      // already cleared above) doesn't revive the project default.
      const projectProductDefault = updatedProjectAssets?.productMediaUrl || undefined;
      const finalSourceImage = removeSourceImage
        ? undefined
        : (newSourceImageUrl || originalJob?.sourceImageUrl || projectProductDefault);
      if (removeSourceImage && finalSceneType === "i2v") {
        finalSceneType = project.mediaMode === "image" ? "image" : "video";
      } else if (newSourceImageUrl && !originalJob?.sourceImageUrl) {
        finalSceneType = "i2v";
      }

      const finalNegativePrompt = newNegativePrompt !== undefined ? (newNegativePrompt || null) : (originalJob?.negativePrompt || undefined);
      const finalImageFidelity = newImageFidelity !== undefined ? newImageFidelity : originalI2vSettings.imageControlStrength;
      const finalArtPresetId = newArtPresetId !== undefined ? (newArtPresetId || undefined) : originalI2vSettings.artPresetId;
      // Distinguish "client did not touch this slot" (use prior value) from
      // "client explicitly cleared this slot" (drop prior value).
      const characterExplicitlyCleared = newCharacterRefImageUrl === "" || newCharacterRefImageUrl === null;
      const finalCharacterRefImageUrl = characterExplicitlyCleared
        ? undefined
        : (newCharacterRefImageUrl !== undefined
            ? newCharacterRefImageUrl
            : originalI2vSettings.characterRefImageUrl);
      const extrasExplicitlyCleared = Array.isArray(newReferenceImages) && newReferenceImages.length === 0;
      const finalReferenceImages: string[] | undefined = extrasExplicitlyCleared
        ? undefined
        : (Array.isArray(newReferenceImages)
            ? (newReferenceImages as unknown[]).filter((u): u is string => typeof u === 'string' && u.length > 0)
            : (Array.isArray(originalI2vSettings.referenceImages) ? originalI2vSettings.referenceImages : undefined));

      // Brand logo: read-only in the Quick Create UI, but the GET /assets route
      // surfaces it for the LOGO slot. We must also push it into the generation
      // job, otherwise the worker has no way to know about it. Only attach when
      // the chosen provider supports multi-image composition (so we don't
      // overwrite the product on single-ref providers).
      let brandLogoUrl: string | null = null;
      try {
        const { brandBibleService } = await import('./services/brand-bible-service');
        const bb = await brandBibleService.getBrandBible(userId);
        const logo = bb?.logos?.main || bb?.logos?.intro || bb?.logos?.outro || bb?.logos?.watermark;
        brandLogoUrl = logo?.url || null;
      } catch {
        brandLogoUrl = null;
      }
      const { VIDEO_PROVIDERS } = await import('../shared/provider-config');
      // When provider is "auto" the actual model is picked downstream, so fall
      // back to the most recently used provider for capability gating. This
      // mirrors the client-side fallback chain (selected → genInfo → visual).
      const existingQc = (project.assets as any)?.quickCreate || {};
      const providerKey =
        finalProvider && finalProvider !== "auto"
          ? String(finalProvider)
          : String(originalJob?.provider || existingQc.visual?.provider || "");
      const providerCfg = providerKey
        ? VIDEO_PROVIDERS[providerKey] || VIDEO_PROVIDERS[providerKey.split('-')[0]]
        : undefined;
      const providerSupportsMulti = Boolean(providerCfg?.multiImageSupport);
      // Per-run logo override:
      //   excludeLogo === true  → omit logo for this run (don't pull brand bible)
      //   customLogoUrl present → use this URL instead of the brand bible logo
      //   otherwise             → fall back to brand bible logo (current behavior)
      const effectiveLogoUrl = newExcludeLogo === true
        ? null
        : (typeof newCustomLogoUrl === "string" && newCustomLogoUrl.length > 0
            ? newCustomLogoUrl
            : brandLogoUrl);
      const finalLogoUrl = providerSupportsMulti && effectiveLogoUrl ? effectiveLogoUrl : undefined;

      // If we have a source image but the prior job ran as plain text-to-video,
      // upgrade the sceneType so the worker actually feeds it as i2v input.
      if (finalSourceImage && finalSceneType !== "i2v" && project.mediaMode !== "image") {
        finalSceneType = "i2v";
      }

      let finalPromptWithStyle = finalPrompt;
      if (finalArtPresetId && finalArtPresetId !== "auto") {
        const { getVisualArtPreset, isStylizedPreset } = await import("../shared/config/visual-art-presets");
        const preset = getVisualArtPreset(finalArtPresetId);
        if (preset && isStylizedPreset(preset.id)) {
          const keywords = preset.styleKeywords || [];
          const promptLower = finalPromptWithStyle.toLowerCase();
          const hasStyle = keywords.length > 0 ? keywords.some((kw: string) => promptLower.includes(kw)) : false;
          if (!hasStyle) {
            const prefix = preset.styleMarkerPrefix || preset.name;
            finalPromptWithStyle = `${prefix} — ${finalPromptWithStyle}`;
          }
          if (preset.globalStyleNotes) {
            finalPromptWithStyle = `${finalPromptWithStyle}. Style: ${preset.globalStyleNotes}`;
          }
        }
      }

      if (finalArtPresetId) {
        const progressData = (project.progress as any) || {};
        await db.update(universalVideoProjects).set({
          progress: { ...progressData, artPresetId: finalArtPresetId },
          updatedAt: new Date(),
        }).where(eq(universalVideoProjects.projectId, projectId));
      }

      const jobId = crypto.randomUUID();
      await db.insert(videoGenerationJobs).values({
        jobId,
        projectId,
        sceneId: "quick-create",
        provider: finalProvider,
        status: "pending",
        prompt: finalPromptWithStyle,
        negativePrompt: finalNegativePrompt,
        duration: project.mediaMode === "video" ? finalDuration : undefined,
        aspectRatio: finalAspectRatio,
        sceneType: finalSceneType,
        sourceImageUrl: finalSourceImage,
        i2vSettings: (() => {
          // Strip stale typed-slot fields so explicit clears actually take effect.
          const {
            characterRefImageUrl: _origChar,
            isCharacterReference: _origCharFlag,
            referenceImages: _origRefs,
            sourceImageUrls: _origUrls,
            // Always strip prior logo flags so each run reflects the CURRENT
            // request intent — otherwise a stale `logoExcluded` from a previous
            // job will keep blanking the logo on later regenerations even when
            // the user wants to inherit the brand-bible logo again.
            brandLogoUrl: _origLogo,
            logoExcluded: _origLogoExcl,
            customLogoUrl: _origCustomLogo,
            ...cleanedOriginal
          } = (originalI2vSettings || {}) as any;
          return {
            saveToLibrary: true,
            outputType: project.mediaMode || "video",
            ...cleanedOriginal,
            ...(finalImageFidelity !== undefined ? { imageControlStrength: finalImageFidelity } : {}),
            ...(finalArtPresetId ? { artPresetId: finalArtPresetId } : {}),
            // Task 69: typed reference slots for Quick Create.
            ...(finalCharacterRefImageUrl
              ? { characterRefImageUrl: finalCharacterRefImageUrl, isCharacterReference: true }
              : {}),
            ...(finalReferenceImages && finalReferenceImages.length > 0
              ? { referenceImages: finalReferenceImages }
              : {}),
            ...(finalLogoUrl ? { brandLogoUrl: finalLogoUrl } : {}),
            // Persist logo override intent so /assets can rehydrate the UI on reload.
            ...(newExcludeLogo === true ? { logoExcluded: true } : {}),
            ...(typeof newCustomLogoUrl === "string" && newCustomLogoUrl.length > 0
              ? { customLogoUrl: newCustomLogoUrl }
              : {}),
            // Worker reads `sourceImageUrls` for multi-image-aware providers
            // (Kling 2.x, Veo 3.1, Luma, Hailuo, Runway). Build it whenever any
            // typed ref exists, not only when extras are present, so character-only,
            // product+character, and product+logo flows still get the array.
            ...((finalCharacterRefImageUrl || finalLogoUrl || (finalReferenceImages && finalReferenceImages.length > 0))
              ? {
                  sourceImageUrls: [
                    ...(finalSourceImage ? [finalSourceImage] : []),
                    ...(finalCharacterRefImageUrl ? [finalCharacterRefImageUrl] : []),
                    ...(finalLogoUrl ? [finalLogoUrl] : []),
                    ...((finalReferenceImages && finalReferenceImages.length > 0) ? finalReferenceImages : []),
                  ].filter((u, i, arr) => arr.indexOf(u) === i),
                }
              : {}),
          };
        })(),
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

  // Generate (or regenerate) the I2V source/reference image only — does NOT
  // run the full video pipeline. Returns the new image URL so the client can
  // set it as the override source image and review before regenerating video.
  app.post("/api/projects/:projectId/quick-create/generate-source-image", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const userId = (req.user as any).id;
      const { prompt: bodyPrompt, artPresetId, aspectRatio: bodyAspect } = req.body || {};

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

      const finalPrompt = (bodyPrompt && String(bodyPrompt).trim()) || project.description || "";
      if (!finalPrompt) {
        return res.status(400).json({ error: "No prompt available to generate from" });
      }
      const finalAspect = bodyAspect || outputFormat.aspectRatio || "16:9";

      let promptWithStyle = finalPrompt;
      if (artPresetId && artPresetId !== "auto") {
        const { getVisualArtPreset, isStylizedPreset } = await import("../shared/config/visual-art-presets");
        const preset = getVisualArtPreset(artPresetId);
        if (preset && isStylizedPreset(preset.id)) {
          const prefix = preset.styleMarkerPrefix || preset.name;
          promptWithStyle = `${prefix} — ${promptWithStyle}`;
          if (preset.globalStyleNotes) {
            promptWithStyle = `${promptWithStyle}. Style: ${preset.globalStyleNotes}`;
          }
        }
      }

      const { universalVideoService } = await import("./services/universal-video-service");
      const result = await universalVideoService.generateImage(
        promptWithStyle,
        `quick-create-source-${Date.now()}`,
        false,
        "content",
        finalAspect,
        { narration: project.description, visualDirection: promptWithStyle, type: "content" } as any,
      );
      if (!result?.success || !result.url) {
        return res.status(500).json({ error: result?.error || "Image generation failed" });
      }

      res.json({ url: result.url, source: result.source });
    } catch (error: any) {
      console.error("Failed to generate source image:", error);
      res.status(500).json({ error: error?.message || "Failed to generate image" });
    }
  });

  app.post("/api/projects/:projectId/quick-create/generate-voiceover", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const userId = (req.user as any).id;
      const { narrationText, voiceId, tone: rawTone } = req.body || {};
      // Persist the user's narration tone alongside the voiceover so other
      // panels (e.g. Render Configuration) can re-run "Shorten narration to
      // fit" with the same tone the user originally chose. Defaults to the
      // server-side default in suggest-narration if absent.
      const tone: "punchy" | "educational" | "story" | undefined =
        rawTone === "punchy" || rawTone === "educational" || rawTone === "story" ? rawTone : undefined;

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

      const text = (narrationText || "").trim() || project.description || "";
      if (!text.trim()) {
        return res.status(400).json({ error: "No narration text provided" });
      }

      const [latestForVO] = await db.select().from(universalVideoProjects).where(eq(universalVideoProjects.projectId, projectId)).limit(1);
      const existingAssetsVO = (latestForVO?.assets as any) || {};
      const existingVO = (existingAssetsVO.quickCreate || {}).voiceover || {};
      const persistedTone = tone ?? existingVO.tone;
      await db.update(universalVideoProjects).set({
        assets: {
          ...existingAssetsVO,
          quickCreate: {
            ...(existingAssetsVO.quickCreate || {}),
            voiceover: {
              status: "generating",
              url: null,
              error: null,
              narrationText: text,
              ...(persistedTone ? { tone: persistedTone } : {}),
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
                  narrationText: text,
                  ...(persistedTone ? { tone: persistedTone } : {}),
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
                  narrationText: text,
                  ...(persistedTone ? { tone: persistedTone } : {}),
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
              voiceover: { status: "failed", url: null, narrationText: text, ...(persistedTone ? { tone: persistedTone } : {}), error: err.message, updatedAt: new Date().toISOString() },
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

  app.post("/api/projects/:projectId/quick-create/suggest-narration", async (req, res) => {
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

      const visualPrompt = (project.description || "").trim();
      if (!visualPrompt) {
        return res.status(400).json({ error: "Project has no visual prompt to base narration on" });
      }

      const rawTone: string = (req.body?.tone || "punchy").toString().toLowerCase();
      const tone: "punchy" | "educational" | "story" =
        rawTone === "educational" || rawTone === "story" ? (rawTone as any) : "punchy";

      const aspectRatio: string = outputFormat.aspectRatio || "16:9";
      // Allow an optional `durationSec` override so the "Shorten narration to fit"
      // UX can request a script sized to the user's CURRENT video-length picker
      // selection without requiring a separate save round-trip first.
      const requestedDurationOverride = Number(req.body?.durationSec);
      const baseDuration = Number.isFinite(requestedDurationOverride) && requestedDurationOverride > 0
        ? requestedDurationOverride
        : Number(project.totalDuration) || 6;
      const durationSec: number = Math.max(3, Math.min(60, Math.round(baseDuration)));
      const isVertical = aspectRatio === "9:16" || aspectRatio === "1:1";
      // Energetic VO pacing: short-form delivery ≈ 2.7 words/sec vertical, 2.3 wps horizontal.
      const wordsPerSecond = isVertical ? 2.7 : 2.3;
      const targetWords = Math.max(10, Math.round(durationSec * wordsPerSecond));
      const minWords = Math.max(8, Math.round(targetWords * 0.85));
      const maxWords = Math.round(targetWords * 1.2);

      const { llmClient } = await import("./services/piapi-llm-client");
      if (!llmClient.isAvailable()) {
        return res.status(503).json({ error: "AI service is not configured. Set PIAPI_API_KEY or ANTHROPIC_API_KEY." });
      }

      const platformHint = isVertical
        ? "TikTok / Reels / Shorts vertical-video viewer (high-retention, hook-first, scroll-stopping)"
        : "YouTube / web horizontal-video viewer (clear, confident, conversion-oriented)";

      const toneInstructions: Record<typeof tone, string> = {
        punchy:
          "High-energy, confident, slightly cheeky. Read fast. Modern, conversational. Think viral DTC ad.",
        educational:
          "Warm and authoritative. Like an expert explaining something genuinely useful to a friend. Curious, not salesy.",
        story:
          "Open with a relatable second-person scenario the viewer recognizes ('Your dog won't stop scratching…'), then resolve it with the product. Empathetic, human.",
      };

      const systemPrompt = `You are a senior short-form video copywriter for TikTok, Reels, YouTube Shorts, and DTC product videos. Your scripts are punchy, conversational, and DENSE with specifics — never generic.

Iron rules:
- The first 6 words MUST be a scroll-stopping hook (a question, a surprising claim, or a sharp pain point).
- Speak directly to the viewer in second person ("you", "your").
- Pull SPECIFIC details from the source brief: name actual capabilities, what the product detects, what problems it solves, what conditions it identifies. Never substitute a vague phrase like "helps your pet" for the real thing.
- Use short, rhythmic sentences (3–12 words each).
- End with exactly ONE clear, low-friction CTA.
- Output plain text ONLY: no hashtags, no emojis, no markdown, no quotation marks, no stage directions, no speaker labels, no preamble, no explanations.
- If the brief begins with a meta-instruction like "Create a video about…" or "Make a TikTok for…", IGNORE that wrapper and treat the rest as your subject.

You are paid to deliver substance under a tight word budget — every word earns its place.`;

      const userPrompt = `Write a ${durationSec}-second voice-over script for a ${platformHint}.

SOURCE BRIEF (extract real specifics from this — ignore any "create a video" wrapper):
"""
${visualPrompt}
"""

Required structure:
1. HOOK (first sentence, ≤8 words): grab attention with a question, surprising claim, or sharp pain point.
2. SUBSTANCE (1–2 sentences): name 2–3 SPECIFIC things from the brief — actual capabilities, conditions detected, or problems solved. Use real terminology from the source. Don't say "helps your pet" — say WHAT it does.
3. CTA (final sentence): one direct, low-friction ask.

Word budget: aim for ${targetWords} words (acceptable range ${minWords}–${maxWords}). Under-shooting is worse than slightly over — fill the time with substance, not filler.

Tone: ${toneInstructions[tone]}

Output ONLY the narration. No quotes, no labels, no explanations.`;

      const result = await llmClient.createChatCompletion({
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 600,
        temperature: 0.9,
      });

      let script = (result.text || "").trim();
      // Strip surrounding quotes the model sometimes adds despite instructions
      script = script.replace(/^["'`]+|["'`]+$/g, "").trim();
      // Collapse leading "Narrator:" / "Script:" labels just in case
      script = script.replace(/^(narrator|script|voiceover|vo)\s*[:\-—]\s*/i, "").trim();

      if (!script) {
        return res.status(502).json({ error: "AI returned an empty script. Try again." });
      }

      const wordCount = script.split(/\s+/).filter(Boolean).length;
      console.log(`[QuickCreate] Suggested narration: ${wordCount} words via ${result.provider}`);

      // When persist=true, write script back to assets and clear stale audio.
      const shouldPersist = req.body?.persist === true;
      let persisted = false;
      if (shouldPersist) {
        const assetsObj = (project.assets as any) || {};
        const qc = assetsObj.quickCreate || {};
        const existingVO = qc.voiceover || {};
        const updatedAssets = {
          ...assetsObj,
          quickCreate: {
            ...qc,
            voiceover: {
              ...existingVO,
              status: existingVO.status === "completed" ? "pending" : (existingVO.status || "pending"),
              narrationText: script,
              tone,
              // Audio for the previous (longer) script is now stale; null it
              // out so the UI surfaces "Regenerate Voiceover" clearly.
              url: null,
              duration: null,
              error: null,
            },
          },
        };
        await db
          .update(universalVideoProjects)
          .set({ assets: updatedAssets, updatedAt: new Date() })
          .where(eq(universalVideoProjects.projectId, projectId));
        persisted = true;
      }

      return res.json({
        script,
        wordCount,
        targetWords,
        durationSec,
        provider: result.provider,
        persisted,
      });
    } catch (error: any) {
      console.error("[QuickCreate] Failed to suggest narration:", error?.message || error);
      return res.status(500).json({ error: error?.message || "Failed to suggest narration" });
    }
  });

  // Lightweight duration-only update for the "Match video length to narration"
  // UX. Avoids triggering visual regeneration the way `generate-visual` does.
  app.patch("/api/projects/:projectId/quick-create/duration", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const userId = (req.user as any).id;
      const requested = Number(req.body?.totalDuration);
      if (!Number.isFinite(requested) || requested <= 0) {
        return res.status(400).json({ error: "totalDuration is required" });
      }
      // Quick Create only supports the picker steps surfaced in the UI; reject
      // anything else so we never persist an unrenderable length here.
      const QC_DURATION_STEPS = [5, 6, 8, 10] as const;
      const totalDuration = Math.round(requested);
      if (!QC_DURATION_STEPS.includes(totalDuration as any)) {
        return res.status(400).json({
          error: `totalDuration must be one of ${QC_DURATION_STEPS.join(", ")} seconds`,
        });
      }

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

      if (project.totalDuration !== totalDuration) {
        await db.update(universalVideoProjects).set({
          totalDuration,
          updatedAt: new Date(),
        }).where(eq(universalVideoProjects.projectId, projectId));
      }

      return res.json({ totalDuration });
    } catch (error: any) {
      console.error("[QuickCreate] Failed to update duration:", error?.message || error);
      return res.status(500).json({ error: error?.message || "Failed to update duration" });
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

      const [latestForMusic] = await db.select().from(universalVideoProjects).where(eq(universalVideoProjects.projectId, projectId)).limit(1);
      const existingAssetsMusic = (latestForMusic?.assets as any) || {};
      await db.update(universalVideoProjects).set({
        assets: {
          ...existingAssetsMusic,
          quickCreate: {
            ...(existingAssetsMusic.quickCreate || {}),
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

  app.get("/api/render-queue", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as any).id;
      const userProjects = await db
        .select({ projectId: universalVideoProjects.projectId, title: universalVideoProjects.title })
        .from(universalVideoProjects)
        .where(eq(universalVideoProjects.ownerId, userId));

      if (userProjects.length === 0) {
        return res.json([]);
      }

      const projectIds = userProjects.map(p => p.projectId);
      const projectTitleMap = Object.fromEntries(userProjects.map(p => [p.projectId, p.title]));

      const jobs = await db
        .select()
        .from(videoGenerationJobs)
        .where(inArray(videoGenerationJobs.projectId, projectIds))
        .orderBy(desc(videoGenerationJobs.createdAt))
        .limit(100);

      const enrichedJobs = jobs.map(job => ({
        ...job,
        projectTitle: projectTitleMap[job.projectId] || "Unknown Project",
      }));

      res.json(enrichedJobs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch render queue" });
    }
  });

  app.delete("/api/video-generation-jobs/:jobId", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { jobId } = req.params;
      const result = await db.delete(videoGenerationJobs).where(eq(videoGenerationJobs.jobId, jobId)).returning();
      if (result.length === 0) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  app.delete("/api/projects/:projectId/video-generation-jobs", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId } = req.params;
      const statusList = req.query.statuses ? (req.query.statuses as string).split(",") : null;
      let result;
      if (statusList && statusList.length > 0) {
        result = await db.delete(videoGenerationJobs)
          .where(and(
            eq(videoGenerationJobs.projectId, projectId),
            inArray(videoGenerationJobs.status, statusList)
          ))
          .returning();
      } else {
        result = await db.delete(videoGenerationJobs)
          .where(eq(videoGenerationJobs.projectId, projectId))
          .returning();
      }
      res.json({ success: true, deleted: result.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete jobs" });
    }
  });
}
