import { storage } from "../storage";
import { aiVideoService } from "./ai-video-service";
import { nanoid } from "nanoid";
import type { VideoGenerationJob } from "@shared/schema";
import { createLogger } from "../utils/logger";
import { intelligentRegenerationService } from "./intelligent-regeneration-service";
import { db } from "../db";
import { universalVideoProjects, videoGenerationJobs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { preparePromptForProvider, type SanitizedPrompt } from "./prompt-sanitizer";

const log = createLogger("VideoWorker");

async function updateSceneMedia(projectId: string, sceneId: string, videoUrl: string): Promise<boolean> {
  const timestamp = new Date().toISOString();
  log.info(`[SCENE_UPDATE ${timestamp}] Starting scene media update for project=${projectId}, scene=${sceneId}`);
  log.info(`[SCENE_UPDATE ${timestamp}] New video URL: ${videoUrl}`);
  
  try {
    const rows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);
    
    if (rows.length === 0) {
      log.warn(`[SCENE_UPDATE ${timestamp}] Project ${projectId} not found when updating scene media`);
      return false;
    }
    
    const project = rows[0];
    const scenes = project.scenes as any[];
    
    const microMatch = sceneId.match(/^(.+)__micro_(\d+)$/);
    const realSceneId = microMatch ? microMatch[1] : sceneId;
    const microIndex = microMatch ? parseInt(microMatch[2], 10) : -1;

    const sceneIndex = scenes.findIndex((s: any) => s.id === realSceneId);
    if (sceneIndex === -1) {
      log.warn(`[SCENE_UPDATE ${timestamp}] Scene ${realSceneId} not found in project ${projectId}`);
      return false;
    }

    if (microIndex >= 0) {
      const microScenes = scenes[sceneIndex].microScenes || [];
      if (microIndex < microScenes.length) {
        microScenes[microIndex].videoUrl = videoUrl;
        scenes[sceneIndex].microScenes = microScenes;
        log.info(`[SCENE_UPDATE ${timestamp}] Updated micro-scene ${microIndex} of scene ${realSceneId} with new videoUrl`);

        if (scenes[sceneIndex].assemblyManifest) {
          scenes[sceneIndex].assemblyManifest.assembledClipValid = false;
          log.info(`[SCENE_UPDATE ${timestamp}] Invalidated FFmpeg assembly for scene ${realSceneId} (micro-scene ${microIndex} changed)`);
        }

        if (microIndex === 0) {
          scenes[sceneIndex].background = scenes[sceneIndex].background || {};
          scenes[sceneIndex].background.videoUrl = videoUrl;
          scenes[sceneIndex].background.mediaUrl = videoUrl;
          scenes[sceneIndex].background.type = 'video';
          scenes[sceneIndex].assets = scenes[sceneIndex].assets || {};
          scenes[sceneIndex].assets.videoUrl = videoUrl;
          log.info(`[SCENE_UPDATE ${timestamp}] Also updated main scene asset to match micro-scene 0`);
        }
      } else {
        log.warn(`[SCENE_UPDATE ${timestamp}] Micro-scene index ${microIndex} out of range for scene ${realSceneId}`);
        return false;
      }
    } else {
      const oldVideoUrl = scenes[sceneIndex].background?.videoUrl || scenes[sceneIndex].assets?.videoUrl || 'none';
      log.info(`[SCENE_UPDATE ${timestamp}] Previous video URL: ${oldVideoUrl}`);

      scenes[sceneIndex].background = scenes[sceneIndex].background || {};
      scenes[sceneIndex].background.videoUrl = videoUrl;
      scenes[sceneIndex].background.mediaUrl = videoUrl;
      scenes[sceneIndex].background.type = 'video';

      scenes[sceneIndex].assets = scenes[sceneIndex].assets || {};
      scenes[sceneIndex].assets.videoUrl = videoUrl;
    }

    await db.update(universalVideoProjects)
      .set({
        scenes: scenes,
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, projectId));

    log.info(`[SCENE_UPDATE ${timestamp}] SUCCESS - Scene ${realSceneId} updated.`);
    return true;
  } catch (error: any) {
    log.error(`[SCENE_UPDATE ${timestamp}] FAILED - Error updating scene ${sceneId}:`, error.message);
    return false;
  }
}

interface I2VSettings {
  imageControlStrength?: number; // 0-1: how much to preserve source image
  animationStyle?:
    | "product-hero"
    | "product-static"
    | "subtle-motion"
    | "dynamic";
  motionStrength?: number; // 0-1: how much motion/animation
}

interface MotionControlOverride {
  camera_movement: string;
  intensity: number;
}

interface VideoGenerationRequest {
  projectId: string;
  sceneId: string;
  provider?: string;
  prompt: string;
  fallbackPrompt?: string;
  duration?: number;
  aspectRatio?: string;
  negativePrompt?: string;
  style?: string;
  triggeredBy?: string;
  sourceImageUrl?: string;
  sourceImageUrls?: string[];
  i2vSettings?: I2VSettings; // I2V-specific settings from UI
  motionControl?: MotionControlOverride; // Phase 16: motion control override from UI
  sceneType?: string; // For intelligent motion control when no override
}

type JobUpdateCallback = (job: VideoGenerationJob) => void;

class VideoGenerationWorker {
  private workerInterval: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private jobUpdateCallbacks: JobUpdateCallback[] = [];
  private processingJobIds: Set<string> = new Set();

  constructor() {}

  onJobUpdate(callback: JobUpdateCallback) {
    this.jobUpdateCallbacks.push(callback);
    return () => {
      const index = this.jobUpdateCallbacks.indexOf(callback);
      if (index > -1) {
        this.jobUpdateCallbacks.splice(index, 1);
      }
    };
  }

  private notifyJobUpdate(job: VideoGenerationJob) {
    for (const callback of this.jobUpdateCallbacks) {
      try {
        callback(job);
      } catch (error) {
        log.error(" Error in job update callback:", error);
      }
    }
  }

  async createJob(
    request: VideoGenerationRequest,
  ): Promise<VideoGenerationJob> {
    const jobId = `vj_${nanoid(16)}`;

    log.debug(` Creating job ${jobId} for scene ${request.sceneId}`);

    const job = await storage.createVideoGenerationJob({
      jobId,
      projectId: request.projectId,
      sceneId: request.sceneId,
      provider: request.provider || 'auto',
      status: "pending",
      progress: 0,
      prompt: request.prompt,
      fallbackPrompt: request.fallbackPrompt || null,
      duration: request.duration || 6,
      aspectRatio: request.aspectRatio || "16:9",
      negativePrompt: request.negativePrompt || null,
      style: request.style || null,
      triggeredBy: request.triggeredBy || null,
      retryCount: 0,
      maxRetries: 3,
      sourceImageUrl: request.sourceImageUrl || null,
      i2vSettings: (request.sourceImageUrls && request.sourceImageUrls.length > 0)
        ? { ...(request.i2vSettings || {}), sourceImageUrls: request.sourceImageUrls }
        : (request.i2vSettings || null),
      motionControl: request.motionControl || null,
      sceneType: request.sceneType || null,
    });

    log.debug(` Job ${jobId} created successfully`);

    this.notifyJobUpdate(job);

    return job;
  }

  async getJob(jobId: string): Promise<VideoGenerationJob | undefined> {
    return storage.getVideoGenerationJob(jobId);
  }

  async getJobsByScene(
    projectId: string,
    sceneId: string,
  ): Promise<VideoGenerationJob[]> {
    return storage.getVideoGenerationJobsByScene(projectId, sceneId);
  }

  async getActiveJobForScene(
    projectId: string,
    sceneId: string,
  ): Promise<VideoGenerationJob | undefined> {
    const jobs = await this.getJobsByScene(projectId, sceneId);
    return jobs.find((j) => j.status === "pending" || j.status === "running");
  }

  startWorker(intervalMs: number = 3000) {
    if (this.workerInterval) {
      log.debug("Worker already running");
      return;
    }

    log.debug(
      `🎬 [VideoWorker] Starting video generation worker (interval: ${intervalMs}ms)`,
    );

    this.workerInterval = setInterval(async () => {
      await this.processNextJob();
    }, intervalMs);

    db.update(videoGenerationJobs)
      .set({ status: "pending", startedAt: null } as any)
      .where(eq(videoGenerationJobs.status, "running"))
      .returning()
      .then((reset) => {
        if (reset.length > 0) {
          log.info(`[STARTUP] Reset ${reset.length} orphaned running jobs back to pending`);
        }
      })
      .catch((err) => log.error("[STARTUP] Error resetting orphaned jobs:", err));

    storage
      .recoverStuckVideoGenerationJobs(10)
      .then((recovered) => {
        if (recovered > 0) {
          log.debug(` Recovered ${recovered} stuck jobs`);
        }
      })
      .catch((error) => {
        log.error(" Error recovering stuck jobs:", error);
      });
  }

  stopWorker() {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
      log.debug("Worker stopped");
    }
  }

  private async processNextJob() {
    if (this.isProcessing) {
      return;
    }

    try {
      this.isProcessing = true;

      const pendingJobs = await storage.getPendingVideoGenerationJobs();

      if (pendingJobs.length === 0) {
        return;
      }

      const job = pendingJobs.find((j) => !this.processingJobIds.has(j.jobId));
      if (!job) {
        return;
      }

      this.processingJobIds.add(job.jobId);
      log.debug(` Processing job ${job.jobId} for scene ${job.sceneId}`);

      await this.processJob(job);
    } catch (error) {
      log.error(" Error in worker loop:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processJob(job: VideoGenerationJob) {
    try {
      const updatedJob = await storage.updateVideoGenerationJob(job.jobId, {
        status: "running",
        startedAt: new Date(),
        progress: 10,
      });
      this.notifyJobUpdate(updatedJob);

      log.debug(` Starting video generation for job ${job.jobId}`);
      log.debug(
        ` Provider: ${job.provider}, Duration: ${job.duration}s, Aspect: ${job.aspectRatio}`,
      );

      const provider = (job.provider === "auto" ? undefined : job.provider) as
        | "runway"
        | "kling"
        | "luma"
        | "hailuo"
        | "hunyuan"
        | "veo";

      let videoUrl: string | null = null;

      try {
        const progressJob1 = await storage.updateVideoGenerationJob(job.jobId, {
          progress: 30,
        });
        this.notifyJobUpdate(progressJob1);

        const aspectRatio =
          job.aspectRatio === "16:9" ||
          job.aspectRatio === "9:16" ||
          job.aspectRatio === "1:1"
            ? job.aspectRatio
            : "16:9";

        const hasSourceImage = !!job.sourceImageUrl;
        const jobI2vSettings = job.i2vSettings as I2VSettings | null;
        const jobMotionControl = job.motionControl as MotionControlOverride | null;
        
        if (hasSourceImage) {
          log.debug(
            ` Job ${job.jobId} using I2V with source image: ${job.sourceImageUrl?.substring(0, 50)}...`,
          );
          if (jobI2vSettings) {
            log.debug(
              ` I2V Settings: fidelity=${jobI2vSettings.imageControlStrength}, style=${jobI2vSettings.animationStyle}, motion=${jobI2vSettings.motionStrength}`,
            );
          }
        }
        
        if (jobMotionControl) {
          log.debug(
            ` Motion control override: ${jobMotionControl.camera_movement} @ ${jobMotionControl.intensity}`,
          );
        } else if (job.sceneType) {
          log.debug(` Using intelligent motion control for scene type: ${job.sceneType}`);
        }

        // Phase 11A: Sanitize prompt to prevent AI from rendering text/logos
        const sanitizedResult: SanitizedPrompt = preparePromptForProvider(
          job.prompt || "",
          job.sceneType || "hook",
          provider || 'kling'
        );
        
        // Log sanitization results for debugging
        if (sanitizedResult.removedElements.length > 0) {
          log.info(`[PromptSanitizer] Job ${job.jobId}: Removed ${sanitizedResult.removedElements.length} text/logo elements from prompt`);
        }
        if (sanitizedResult.warnings.length > 0) {
          sanitizedResult.warnings.forEach(w => log.debug(`[PromptSanitizer] ${w}`));
        }
        
        // Build enhanced negative prompt with anti-text directives
        const baseNegativePrompt = job.negativePrompt || "";
        const antiTextDirectives = "no text, no words, no letters, no numbers, no logos, no watermarks, no labels, no buttons, no badges, no banners, no UI elements, no captions, no titles, no subtitles";
        const enhancedNegativePrompt = baseNegativePrompt 
          ? `${baseNegativePrompt}, ${antiTextDirectives}`
          : antiTextDirectives;

        log.debug(`[PromptSanitizer] Job ${job.jobId} using sanitized prompt: ${sanitizedResult.cleanPrompt.substring(0, 100)}...`);
        log.debug(`[PromptSanitizer] Job ${job.jobId} enhanced negative prompt: ${enhancedNegativePrompt.substring(0, 100)}...`);

        // Log provider attempt
        log.info(`[VideoWorker] Job ${job.jobId} attempting generation with provider: ${provider}`);

        // =============================================================
        // CRITICAL FIX: For I2V, use ORIGINAL prompt, NOT sanitized
        // =============================================================
        // The sanitizer strips visual direction to keywords for T2V (good)
        // But for I2V, the visual direction IS the action to perform
        // The image defines content; prompt defines animation/scene
        // =============================================================
        const promptForGeneration = hasSourceImage 
          ? (job.prompt || "").trim()  // I2V: Use original visual direction
          : sanitizedResult.cleanPrompt;  // T2V: Use sanitized prompt
        
        if (hasSourceImage) {
          log.info(`[VideoWorker] Job ${job.jobId} I2V MODE: Using ORIGINAL prompt (not sanitized)`);
          log.info(`[VideoWorker] Original prompt: ${promptForGeneration.substring(0, 150)}...`);
        }


        let jobArtPresetId: string | undefined;
        let jobContentTag: string | undefined;
        let charRefImageUrl: string | undefined;
        let charRefImageUrls: string[] | undefined;
        let isCharacterRef = false;
        let charEnhancedPrompt = promptForGeneration;

        const snapshotArtPresetId = (job.i2vSettings as any)?.snapshotArtPresetId as string | undefined;

        try {
          const { getProjectFromDb } = await import('./video-project-db');
          const projectData = await getProjectFromDb(job.projectId);
          if (projectData) {
            const isMicroScene = job.sceneId.includes('__micro_');
            const baseSceneId = isMicroScene ? job.sceneId.split('__micro_')[0] : job.sceneId;
            const scene = projectData.scenes?.find((s) => s.id === baseSceneId);
            if (scene) {
              const projectArtPreset = projectData.progress?.artPresetId || projectData.artPresetId;
              jobArtPresetId = snapshotArtPresetId || scene.artPresetId || projectArtPreset;
              if (snapshotArtPresetId) {
                log.info(`[VideoWorker] Job ${job.jobId}: Using snapshot artPresetId="${snapshotArtPresetId}" (immutable from batch endpoint)`);
              }
              jobContentTag = scene.contentTag;
              if (isMicroScene) {
                const msIdx = parseInt(job.sceneId.split('__micro_')[1], 10);
                const ms = scene.microScenes?.[msIdx];
                if (ms) {
                  jobArtPresetId = snapshotArtPresetId || ms.artPresetId || scene.artPresetId || projectArtPreset;
                  jobContentTag = ms.contentTag || scene.contentTag;
                }
              }
              log.debug(` Job ${job.jobId} resolved artPresetId=${jobArtPresetId || 'none'}, contentTag=${jobContentTag || 'none'}`);

              const hasExplicitSourceImages = !!(job.i2vSettings as any)?.sourceImageUrls?.length;
              if (!hasSourceImage && !hasExplicitSourceImages) {
                const { isStylizedPreset } = await import('../../shared/config/visual-art-presets');
                const isStylizedArt = jobArtPresetId ? isStylizedPreset(jobArtPresetId) : false;
                const isCharI2VMode = (projectData as any).videoGenerationMode === 'character-i2v';
                const shouldCheckChars = isCharI2VMode || isStylizedArt;

                if (shouldCheckChars) {
                  const lockedChars = ((projectData as any).characters || [])
                    .filter((c: any) => c.locked && c.referenceImageUrl);
                  const escapeRegexStr = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                  const nameMatchesText = (name: string, text: string): boolean => {
                    const fullRx = new RegExp('\\b' + escapeRegexStr(name) + '\\b', 'i');
                    if (fullRx.test(text)) return true;
                    const firstName = name.split(/\s+/)[0];
                    if (firstName && firstName.length >= 3 && firstName !== name) {
                      const firstRx = new RegExp('\\b' + escapeRegexStr(firstName) + '\\b', 'i');
                      return firstRx.test(text);
                    }
                    return false;
                  };

                  const matchedProjectChars = lockedChars.filter((c: any) => {
                    return nameMatchesText(c.name, charEnhancedPrompt);
                  });

                  let finalMatchedChars = matchedProjectChars;

                  if (matchedProjectChars.length === 0) {
                    try {
                      const { characterLibrary } = await import('../../shared/schema');
                      const userId = job.triggeredBy;
                      if (userId) {
                        const libChars = await db.select().from(characterLibrary).where(eq(characterLibrary.ownerId, Number(userId)));
                        finalMatchedChars = libChars.filter((c: any) => {
                          return nameMatchesText(c.name, charEnhancedPrompt) && c.referenceImageUrl;
                        });
                        if (finalMatchedChars.length > 0) {
                          log.info(`[CharRef] Job ${job.jobId}: matched ${finalMatchedChars.length} characters from library: ${finalMatchedChars.map((c: any) => c.name).join(', ')}`);
                        }
                      }
                    } catch (charErr) {
                      log.debug(`[CharRef] Could not check character library: ${(charErr as any).message}`);
                    }
                  } else {
                    log.info(`[CharRef] Job ${job.jobId}: matched ${matchedProjectChars.length} characters from project: ${matchedProjectChars.map((c: any) => c.name).join(', ')}`);
                  }

                  if (finalMatchedChars.length > 0) {
                    const charDescs = finalMatchedChars.map((c: any) => `${c.name}: ${c.physicalDescription || ''}, wearing ${c.wardrobe || ''}`).join('. ');
                    const detectedCharNames = finalMatchedChars.map((c: any) => c.name).join(', ');
                    if (isStylizedArt) {
                      log.info(`[CharRef] Job ${job.jobId}: STYLIZED PRESET '${jobArtPresetId}' — skipping I2V for characters [${detectedCharNames}]; injecting text descriptions only`);
                      charEnhancedPrompt = `${charEnhancedPrompt}\nCharacter details for visual consistency: ${charDescs}`;
                    } else {
                      charRefImageUrl = finalMatchedChars[0].referenceImageUrl;
                      charRefImageUrls = finalMatchedChars.map((c: any) => c.referenceImageUrl).filter(Boolean);
                      isCharacterRef = true;
                      log.info(`[CharRef] Job ${job.jobId}: preset '${jobArtPresetId || 'none'}' — using I2V character reference for [${detectedCharNames}]`);
                      charEnhancedPrompt = `${charEnhancedPrompt}\nGenerate a NEW scene showing ${finalMatchedChars.length > 1 ? 'these characters' : 'this character'} in the described setting. Use the reference image ONLY for character appearance consistency (face, hair, clothing, art style). Do NOT animate or reproduce the reference image itself. Characters: ${charDescs}`;
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          log.debug(` Job ${job.jobId} could not resolve art preset/content tag: ${(e as any).message}`);
        }

        const finalImageUrl = job.sourceImageUrl || charRefImageUrl || undefined;
        const finalImageUrls = (job.i2vSettings as any)?.sourceImageUrls || (charRefImageUrls && charRefImageUrls.length > 1 ? charRefImageUrls : undefined);

        const result = await aiVideoService.generateVideo({
          prompt: charEnhancedPrompt,
          duration: job.duration || 6,
          aspectRatio,
          sceneType: job.sceneType || "hook",
          preferredProvider: provider,
          negativePrompt: enhancedNegativePrompt,
          visualStyle: job.style || "professional",
          imageUrl: finalImageUrl,
          imageUrls: finalImageUrls,
          i2vSettings: jobI2vSettings || undefined,
          motionOverride: jobMotionControl ? {
            camera_movement: jobMotionControl.camera_movement as any,
            intensity: jobMotionControl.intensity,
            description: `User override: ${jobMotionControl.camera_movement}`,
            rationale: 'User selected via Motion Control UI',
          } : undefined,
          ...(jobArtPresetId ? { artPresetId: jobArtPresetId } : {}),
          ...(jobContentTag ? { contentTag: jobContentTag } : {}),
          ...(isCharacterRef ? { isCharacterReference: true } : {}),
        });

// Log which provider actually fulfilled the request
        const actualProvider = result.provider || provider || 'auto';
        log.debug(` Job ${job.jobId} fulfilled by provider: ${actualProvider}`);

        if (result.success && result.videoUrl) {
          videoUrl = result.videoUrl;
        } else if (result.success && result.s3Url) {
          videoUrl = result.s3Url;
        }

        // Update job with actual provider used (for tracking/debugging)
        const progressJob2 = await storage.updateVideoGenerationJob(job.jobId, {
          progress: 90,
          provider: actualProvider,
        });
        this.notifyJobUpdate(progressJob2);
      } catch (genError: any) {
        const errMsg = genError?.message || genError?.toString?.() || JSON.stringify(genError);
        log.error(`Video generation error for job ${job.jobId}: ${errMsg}`);

        if (
          job.retryCount !== null &&
          job.maxRetries !== null &&
          job.retryCount < job.maxRetries
        ) {
          const retryJob = await storage.updateVideoGenerationJob(job.jobId, {
            status: "pending",
            retryCount: (job.retryCount || 0) + 1,
            errorMessage: genError.message || "Generation failed, will retry",
          });
          this.notifyJobUpdate(retryJob);
          log.debug(
            ` Job ${job.jobId} will retry (attempt ${(job.retryCount || 0) + 1}/${job.maxRetries})`,
          );
        } else {
          const failedJob = await storage.updateVideoGenerationJob(job.jobId, {
            status: "failed",
            completedAt: new Date(),
            progress: 0,
            errorMessage:
              genError.message || "Video generation failed after max retries",
          });
          this.notifyJobUpdate(failedJob);
          log.debug(` Job ${job.jobId} failed permanently`);

          // Record regeneration history for failed video generation (max retries exhausted)
          await intelligentRegenerationService.recordVideoAttempt({
            sceneId: job.sceneId,
            projectId: job.projectId,
            provider: job.provider,
            prompt: job.prompt || "",
            result: "failure",
            errorMessage:
              genError.message || "Video generation failed after max retries",
            sourceImageUrl: job.sourceImageUrl || undefined,
          });
        }

        return;
      }

      if (videoUrl) {
        const completionTimestamp = new Date().toISOString();
        log.info(`[JOB_COMPLETE ${completionTimestamp}] Job ${job.jobId} completed with videoUrl: ${videoUrl}`);
        
        const sceneUpdated = await updateSceneMedia(job.projectId, job.sceneId, videoUrl);
        if (sceneUpdated) {
          log.info(`[JOB_COMPLETE ${completionTimestamp}] Scene ${job.sceneId} database record updated with new video from job ${job.jobId}`);
        } else {
          log.warn(`[JOB_COMPLETE ${completionTimestamp}] FAILED to update scene ${job.sceneId} media - video URL saved to job only`);
        }

        const completedJob = await storage.updateVideoGenerationJob(job.jobId, {
          status: "succeeded",
          completedAt: new Date(),
          progress: 100,
          videoUrl,
        });
        this.notifyJobUpdate(completedJob);
        log.info(`[JOB_COMPLETE ${completionTimestamp}] Job ${job.jobId} status updated to 'succeeded' in storage`);

        // Record regeneration history for successful video generation
        await intelligentRegenerationService.recordVideoAttempt({
          sceneId: job.sceneId,
          projectId: job.projectId,
          provider: job.provider,
          prompt: job.prompt || "",
          result: "success",
          videoUrl,
          sourceImageUrl: job.sourceImageUrl || undefined,
        });
      } else {
        const failedJob = await storage.updateVideoGenerationJob(job.jobId, {
          status: "failed",
          completedAt: new Date(),
          progress: 0,
          errorMessage: "No video URL returned from generation",
        });
        this.notifyJobUpdate(failedJob);
        log.debug(` Job ${job.jobId} failed - no video URL returned`);

        // Record regeneration history for failed video generation
        await intelligentRegenerationService.recordVideoAttempt({
          sceneId: job.sceneId,
          projectId: job.projectId,
          provider: job.provider,
          prompt: job.prompt || "",
          result: "failure",
          errorMessage: "No video URL returned from generation",
          sourceImageUrl: job.sourceImageUrl || undefined,
        });
      }
    } catch (error: any) {
      log.error(`Error processing job ${job.jobId}:`, error);

      try {
        const failedJob = await storage.updateVideoGenerationJob(job.jobId, {
          status: "failed",
          completedAt: new Date(),
          progress: 0,
          errorMessage: error.message || "Unknown error during job processing",
        });
        this.notifyJobUpdate(failedJob);

        // Record regeneration history for failed video generation
        await intelligentRegenerationService.recordVideoAttempt({
          sceneId: job.sceneId,
          projectId: job.projectId,
          provider: job.provider,
          prompt: job.prompt || "",
          result: "failure",
          errorMessage: error.message || "Unknown error during job processing",
          sourceImageUrl: job.sourceImageUrl || undefined,
        });
      } catch (updateError) {
        log.error(`Failed to update job status:`, updateError);
      }
    } finally {
      this.processingJobIds.delete(job.jobId);
    }
  }

  async cancelJob(jobId: string): Promise<VideoGenerationJob | undefined> {
    const job = await storage.getVideoGenerationJob(jobId);
    if (!job) {
      return undefined;
    }

    if (job.status === "pending") {
      const cancelledJob = await storage.updateVideoGenerationJob(jobId, {
        status: "cancelled",
        completedAt: new Date(),
      });
      this.notifyJobUpdate(cancelledJob);
      return cancelledJob;
    }

    return job;
  }
}

export const videoGenerationWorker = new VideoGenerationWorker();
