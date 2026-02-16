import { storage } from "../storage";
import { aiVideoService } from "./ai-video-service";
import { nanoid } from "nanoid";
import type { VideoGenerationJob } from "@shared/schema";
import { createLogger } from "../utils/logger";
import { intelligentRegenerationService } from "./intelligent-regeneration-service";
import { db } from "../db";
import { universalVideoProjects } from "@shared/schema";
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
    
    const sceneIndex = scenes.findIndex((s: any) => s.id === sceneId);
    if (sceneIndex === -1) {
      log.warn(`[SCENE_UPDATE ${timestamp}] Scene ${sceneId} not found in project ${projectId}`);
      return false;
    }
    
    const oldVideoUrl = scenes[sceneIndex].background?.videoUrl || scenes[sceneIndex].assets?.videoUrl || 'none';
    log.info(`[SCENE_UPDATE ${timestamp}] Previous video URL: ${oldVideoUrl}`);
    
    scenes[sceneIndex].background = scenes[sceneIndex].background || {};
    scenes[sceneIndex].background.videoUrl = videoUrl;
    scenes[sceneIndex].background.mediaUrl = videoUrl;
    scenes[sceneIndex].background.type = 'video';
    
    scenes[sceneIndex].assets = scenes[sceneIndex].assets || {};
    scenes[sceneIndex].assets.videoUrl = videoUrl;
    
    await db.update(universalVideoProjects)
      .set({
        scenes: scenes,
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, projectId));
    
    log.info(`[SCENE_UPDATE ${timestamp}] SUCCESS - Scene ${sceneId} updated. Old: ${oldVideoUrl.substring(0, 40)}... -> New: ${videoUrl.substring(0, 40)}...`);
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
  provider: string;
  prompt: string;
  fallbackPrompt?: string;
  duration?: number;
  aspectRatio?: string;
  negativePrompt?: string;
  style?: string;
  triggeredBy?: string;
  sourceImageUrl?: string; // For I2V: matched brand asset product photo URL
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
      provider: request.provider,
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
      i2vSettings: request.i2vSettings || null,
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

      const provider = job.provider as
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
          provider
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

        const result = await aiVideoService.generateVideo({
          prompt: promptForGeneration,
          duration: job.duration || 6,
          aspectRatio,
          sceneType: job.sceneType || "hook",
          preferredProvider: provider,
          negativePrompt: enhancedNegativePrompt,
          visualStyle: job.style || "professional",
          imageUrl: job.sourceImageUrl || undefined, // For I2V: pass the matched brand asset image
          i2vSettings: jobI2vSettings || undefined, // I2V-specific settings from UI
          motionOverride: jobMotionControl ? {
            camera_movement: jobMotionControl.camera_movement as any,
            intensity: jobMotionControl.intensity,
            description: `User override: ${jobMotionControl.camera_movement}`,
            rationale: 'User selected via Motion Control UI',
          } : undefined, // Phase 16: motion control override from UI
        });

        // Log which provider actually fulfilled the request
        const actualProvider = result.provider || provider;
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
        log.error(`Video generation error for job ${job.jobId}:`, genError);

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
        
        const completedJob = await storage.updateVideoGenerationJob(job.jobId, {
          status: "succeeded",
          completedAt: new Date(),
          progress: 100,
          videoUrl,
        });
        this.notifyJobUpdate(completedJob);
        log.info(`[JOB_COMPLETE ${completionTimestamp}] Job ${job.jobId} status updated to 'succeeded' in storage`);

        const sceneUpdated = await updateSceneMedia(job.projectId, job.sceneId, videoUrl);
        if (sceneUpdated) {
          log.info(`[JOB_COMPLETE ${completionTimestamp}] Scene ${job.sceneId} database record updated with new video from job ${job.jobId}`);
        } else {
          log.warn(`[JOB_COMPLETE ${completionTimestamp}] FAILED to update scene ${job.sceneId} media - video URL saved to job only`);
        }

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
