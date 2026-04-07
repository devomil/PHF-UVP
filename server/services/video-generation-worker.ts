import { storage } from "../storage";
import { aiVideoService } from "./ai-video-service";
import { nanoid } from "nanoid";
import type { VideoGenerationJob } from "@shared/schema";
import { createLogger } from "../utils/logger";
import { intelligentRegenerationService } from "./intelligent-regeneration-service";
import { db } from "../db";
import { universalVideoProjects, videoGenerationJobs } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { preparePromptForProvider, type SanitizedPrompt } from "./prompt-sanitizer";

const log = createLogger("VideoWorker");

async function findSceneIndex(projectId: string, sceneId: string): Promise<{ sceneIndex: number; scenes: any[] } | null> {
  const rows = await db.select({ scenes: universalVideoProjects.scenes })
    .from(universalVideoProjects)
    .where(eq(universalVideoProjects.projectId, projectId))
    .limit(1);

  if (rows.length === 0) return null;
  const scenes = rows[0].scenes as any[];
  const sceneIndex = scenes.findIndex((s: any) => s.id === sceneId);
  if (sceneIndex === -1) return null;
  return { sceneIndex, scenes };
}

async function updateSceneMedia(projectId: string, sceneId: string, videoUrl: string, videoProvider?: string, providerHint?: string): Promise<boolean> {
  const timestamp = new Date().toISOString();
  log.info(`[SCENE_UPDATE ${timestamp}] Starting atomic scene media update for project=${projectId}, scene=${sceneId}`);
  log.info(`[SCENE_UPDATE ${timestamp}] New video URL: ${videoUrl}`);
  
  try {
    const microMatch = sceneId.match(/^(.+)__micro_(\d+)$/);
    const realSceneId = microMatch ? microMatch[1] : sceneId;
    const microIndex = microMatch ? parseInt(microMatch[2], 10) : -1;

    const found = await findSceneIndex(projectId, realSceneId);
    if (!found) {
      log.warn(`[SCENE_UPDATE ${timestamp}] Scene ${realSceneId} not found in project ${projectId}`);
      return false;
    }

    const { sceneIndex, scenes } = found;
    const idx = sceneIndex.toString();

    if (microIndex >= 0) {
      const microScenes = scenes[sceneIndex].microScenes || [];
      if (microIndex >= microScenes.length) {
        log.warn(`[SCENE_UPDATE ${timestamp}] Micro-scene index ${microIndex} out of range for scene ${realSceneId}`);
        return false;
      }
      const mi = microIndex.toString();

      let atomicUpdate = sql`
        jsonb_set(
          jsonb_set(
            ${universalVideoProjects.scenes},
            ${`{${idx},microScenes,${mi},videoUrl}`}::text[],
            ${JSON.stringify(videoUrl)}::jsonb
          ),
          ${`{${idx},assemblyManifest,assembledClipValid}`}::text[],
          'false'::jsonb,
          true
        )
      `;

      if (microIndex === 0) {
        atomicUpdate = sql`
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      ${universalVideoProjects.scenes},
                      ${`{${idx},microScenes,${mi},videoUrl}`}::text[],
                      ${JSON.stringify(videoUrl)}::jsonb
                    ),
                    ${`{${idx},assemblyManifest,assembledClipValid}`}::text[],
                    'false'::jsonb,
                    true
                  ),
                  ${`{${idx},background,videoUrl}`}::text[],
                  ${JSON.stringify(videoUrl)}::jsonb,
                  true
                ),
                ${`{${idx},background,mediaUrl}`}::text[],
                ${JSON.stringify(videoUrl)}::jsonb,
                true
              ),
              ${`{${idx},background,type}`}::text[],
              '"video"'::jsonb,
              true
            ),
            ${`{${idx},assets,videoUrl}`}::text[],
            ${JSON.stringify(videoUrl)}::jsonb,
            true
          )
        `;
        log.info(`[SCENE_UPDATE ${timestamp}] Atomic update: micro-scene ${microIndex} + main scene asset for scene ${realSceneId}`);
      } else {
        log.info(`[SCENE_UPDATE ${timestamp}] Atomic update: micro-scene ${microIndex} of scene ${realSceneId}`);
      }

      await db.update(universalVideoProjects)
        .set({
          scenes: atomicUpdate as any,
          updatedAt: new Date(),
        })
        .where(eq(universalVideoProjects.projectId, projectId));
    } else {
      const atomicUpdate = sql`
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  ${universalVideoProjects.scenes},
                  ${`{${idx},background,videoUrl}`}::text[],
                  ${JSON.stringify(videoUrl)}::jsonb,
                  true
                ),
                ${`{${idx},background,mediaUrl}`}::text[],
                ${JSON.stringify(videoUrl)}::jsonb,
                true
              ),
              ${`{${idx},background,type}`}::text[],
              '"video"'::jsonb,
              true
            ),
            ${`{${idx},assets,videoUrl}`}::text[],
            ${JSON.stringify(videoUrl)}::jsonb,
            true
          ),
          ${`{${idx},assets,imageUrl}`}::text[],
          ${JSON.stringify(videoUrl)}::jsonb,
          true
        )
      `;

      log.info(`[SCENE_UPDATE ${timestamp}] Atomic update: main scene ${realSceneId} at index ${idx}`);

      await db.update(universalVideoProjects)
        .set({
          scenes: atomicUpdate as any,
          updatedAt: new Date(),
        })
        .where(eq(universalVideoProjects.projectId, projectId));
    }

    if (videoProvider) {
      try {
        let providerUpdate;
        if (microIndex >= 0 && microIndex === 0) {
          providerUpdate = sql`jsonb_set(jsonb_set(${universalVideoProjects.scenes}, ${`{${idx},microScenes,${microIndex},videoProvider}`}::text[], ${JSON.stringify(videoProvider)}::jsonb, true), ${`{${idx},assets,videoProvider}`}::text[], ${JSON.stringify(videoProvider)}::jsonb, true)`;
        } else if (microIndex >= 0) {
          providerUpdate = sql`jsonb_set(${universalVideoProjects.scenes}, ${`{${idx},microScenes,${microIndex},videoProvider}`}::text[], ${JSON.stringify(videoProvider)}::jsonb, true)`;
        } else {
          providerUpdate = sql`jsonb_set(${universalVideoProjects.scenes}, ${`{${idx},assets,videoProvider}`}::text[], ${JSON.stringify(videoProvider)}::jsonb, true)`;
        }
        await db.update(universalVideoProjects)
          .set({
            scenes: providerUpdate as any,
          })
          .where(eq(universalVideoProjects.projectId, projectId));
        log.info(`[SCENE_UPDATE ${timestamp}] Video provider "${videoProvider}" stored on scene ${realSceneId}${microIndex >= 0 ? ` (micro ${microIndex})` : ''}`);
      } catch (provErr: any) {
        log.warn(`[SCENE_UPDATE ${timestamp}] Failed to store video provider: ${provErr.message}`);
      }
    }

    const hintBase = providerHint?.split('-')[0];
    const resolvedBase = videoProvider?.split('-')[0];
    const isCrossFamilyMismatch = providerHint && videoProvider && hintBase !== resolvedBase;
    if (isCrossFamilyMismatch) {
      try {
        const mismatchData = JSON.stringify({ intended: providerHint, resolved: videoProvider });
        let mismatchUpdate;
        if (microIndex >= 0 && microIndex === 0) {
          mismatchUpdate = sql`jsonb_set(jsonb_set(${universalVideoProjects.scenes}, ${`{${idx},microScenes,${microIndex},providerMismatch}`}::text[], ${mismatchData}::jsonb, true), ${`{${idx},assets,providerMismatch}`}::text[], ${mismatchData}::jsonb, true)`;
        } else if (microIndex >= 0) {
          mismatchUpdate = sql`jsonb_set(${universalVideoProjects.scenes}, ${`{${idx},microScenes,${microIndex},providerMismatch}`}::text[], ${mismatchData}::jsonb, true)`;
        } else {
          mismatchUpdate = sql`jsonb_set(${universalVideoProjects.scenes}, ${`{${idx},assets,providerMismatch}`}::text[], ${mismatchData}::jsonb, true)`;
        }
        await db.update(universalVideoProjects)
          .set({ scenes: mismatchUpdate as any })
          .where(eq(universalVideoProjects.projectId, projectId));
        log.warn(`[SCENE_UPDATE ${timestamp}] Provider mismatch stored on scene ${realSceneId}: intended=${providerHint}, resolved=${videoProvider}`);
      } catch (mmErr: any) {
        log.warn(`[SCENE_UPDATE ${timestamp}] Failed to store provider mismatch: ${mmErr.message}`);
      }
    }

    log.info(`[SCENE_UPDATE ${timestamp}] SUCCESS - Scene ${realSceneId} updated atomically (no read-modify-write).`);
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
      duration: Math.round(request.duration || 6),
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

      const i2vProviderHint = (job.i2vSettings as any)?.providerHint;
      const provider = (job.provider === "auto"
        ? (i2vProviderHint || undefined)
        : job.provider) as
        | "runway"
        | "kling"
        | "luma"
        | "hailuo"
        | "hunyuan"
        | "veo";
      const isProviderHint = job.provider === "auto" && !!i2vProviderHint;

      let videoUrl: string | null = null;
      let resolvedProvider: string = job.provider || 'auto';

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
        let projectQualityTier: string = 'standard';

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
                const hasCharacterProfiles = ((projectData as any).characters || []).some((c: any) => c.locked && c.referenceImageUrl);
                const shouldCheckChars = isCharI2VMode || isStylizedArt || hasCharacterProfiles;

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
                    const nameHasDescription = (name: string, text: string): boolean => {
                      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      const fullDescPattern = new RegExp(escapedName + '\\s*\\([^)]{20,}\\)', 'i');
                      if (fullDescPattern.test(text)) return true;
                      const firstName = name.split(/\s+/)[0];
                      if (firstName && firstName.length >= 3 && firstName !== name) {
                        const firstNamePattern = new RegExp(firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\([^)]{20,}\\)', 'i');
                        return firstNamePattern.test(text);
                      }
                      return false;
                    };

                    const charsNeedingInjection = finalMatchedChars.filter((c: any) => !nameHasDescription(c.name, charEnhancedPrompt));
                    const charsAlreadyDescribed = finalMatchedChars.filter((c: any) => nameHasDescription(c.name, charEnhancedPrompt));

                    if (charsAlreadyDescribed.length > 0) {
                      log.info(`[CharRef] Job ${job.jobId}: characters already have inline descriptions, skipping injection for: ${charsAlreadyDescribed.map((c: any) => c.name).join(', ')}`);
                    }

                    const detectedCharNames = finalMatchedChars.map((c: any) => c.name).join(', ');
                    if (isStylizedArt) {
                      if (charsNeedingInjection.length > 0) {
                        const charDescs = charsNeedingInjection.map((c: any) => `${c.name}: ${c.physicalDescription || ''}, wearing ${c.wardrobe || ''}`).join('. ');
                        log.info(`[CharRef] Job ${job.jobId}: STYLIZED PRESET '${jobArtPresetId}' — safety-net injection for characters missing descriptions: [${charsNeedingInjection.map((c: any) => c.name).join(', ')}]`);
                        charEnhancedPrompt = `${charEnhancedPrompt}\nCharacter details for visual consistency: ${charDescs}`;
                      } else {
                        log.info(`[CharRef] Job ${job.jobId}: STYLIZED PRESET '${jobArtPresetId}' — all characters [${detectedCharNames}] already have inline descriptions, no injection needed`);
                      }
                    } else {
                      charRefImageUrl = finalMatchedChars[0].referenceImageUrl;
                      charRefImageUrls = finalMatchedChars.map((c: any) => c.referenceImageUrl).filter(Boolean);
                      isCharacterRef = true;
                      log.info(`[CharRef] Job ${job.jobId}: preset '${jobArtPresetId || 'none'}' — using I2V character reference for [${detectedCharNames}]`);
                      const charsForTextAppend = charsNeedingInjection.length > 0 ? charsNeedingInjection : finalMatchedChars;
                      const charDescs = charsForTextAppend.map((c: any) => `${c.name}: ${c.physicalDescription || ''}, wearing ${c.wardrobe || ''}`).join('. ');
                      if (charsNeedingInjection.length > 0) {
                        charEnhancedPrompt = `${charEnhancedPrompt}\nGenerate a NEW scene showing ${charsForTextAppend.length > 1 ? 'these characters' : 'this character'} in the described setting. Use the reference image ONLY for character appearance consistency (face, hair, clothing, art style). Do NOT animate or reproduce the reference image itself. Characters: ${charDescs}`;
                      } else {
                        log.info(`[CharRef] Job ${job.jobId}: all characters [${detectedCharNames}] already have inline descriptions, skipping text injection (I2V reference still used)`);
                      }
                    }
                  }
                }
              }
            }
          }
          projectQualityTier = projectData?.qualityTier || projectData?.progress?.qualityTier || 'standard';
        } catch (e) {
          log.debug(` Job ${job.jobId} could not resolve art preset/content tag: ${(e as any).message}`);
        }

        let textImageUrl: string | undefined;
        let textImagePromptOverride: string | undefined;

        const hasExplicitSources = !!(job.i2vSettings as any)?.sourceImageUrls?.length;
        if (!hasSourceImage && !charRefImageUrl && !hasExplicitSources) {
          try {
            const { isTextHeavyScene, imageGenerationService } = await import('./image-generation-service');
            const { getProjectFromDb } = await import('./video-project-db');
            const projectForTextCheck = await getProjectFromDb(job.projectId);
            if (projectForTextCheck) {
              const baseId = job.sceneId.includes('__micro_') ? job.sceneId.split('__micro_')[0] : job.sceneId;
              const sceneForTextCheck = projectForTextCheck.scenes?.find((s: any) => s.id === baseId);
              if (sceneForTextCheck && isTextHeavyScene(sceneForTextCheck)) {
                log.info(`[TextImage] Job ${job.jobId}: Scene ${job.sceneId} detected as text-heavy, generating image via GPT-Image-1 first`);

                const progressTextImg = await storage.updateVideoGenerationJob(job.jobId, {
                  progress: 40,
                });
                this.notifyJobUpdate(progressTextImg);

                const chapterTitleText = sceneForTextCheck.chapterTitle || sceneForTextCheck.textOverlays?.[0]?.text || '';
                const textContent = chapterTitleText
                  ? `Display the text "${chapterTitleText}" prominently.`
                  : '';
                const textImgPrompt = `Create a cinematic title card image. ${textContent} ${job.prompt || charEnhancedPrompt}. The text must be perfectly legible, sharp, and professionally typeset. Use cinematic lighting with subtle depth of field. High-end motion graphics style.`;

                const textImage = await imageGenerationService.generateWithOpenAI({
                  prompt: textImgPrompt,
                  width: 1536,
                  height: 1024,
                });

                textImageUrl = textImage.url;
                textImagePromptOverride = "Subtle cinematic motion: gentle camera push-in with soft parallax depth layers, atmospheric particles drifting slowly. The text and design elements remain sharp and legible throughout. Smooth, professional broadcast-quality motion.";

                log.info(`[TextImage] Job ${job.jobId}: GPT-Image-1 generated text image: ${textImageUrl.substring(0, 80)}...`);

                try {
                  const found = await findSceneIndex(job.projectId, baseId);
                  if (found) {
                    const idx = found.sceneIndex.toString();
                    await db.update(universalVideoProjects)
                      .set({
                        scenes: sql`jsonb_set(
                          ${universalVideoProjects.scenes},
                          ${`{${idx},textImageUrl}`}::text[],
                          ${JSON.stringify(textImageUrl)}::jsonb,
                          true
                        )`,
                      })
                      .where(eq(universalVideoProjects.projectId, job.projectId));
                    log.info(`[TextImage] Saved text image URL to scene ${baseId}`);
                  }
                } catch (saveErr: any) {
                  log.warn(`[TextImage] Could not save text image to scene data: ${saveErr.message}`);
                }
              }
            }
          } catch (textImgErr: any) {
            log.warn(`[TextImage] Text-image pre-step failed for job ${job.jobId}, falling back to normal generation: ${textImgErr.message}`);
          }
        }

        const finalImageUrl = textImageUrl || job.sourceImageUrl || charRefImageUrl || undefined;
        const finalImageUrls = (job.i2vSettings as any)?.sourceImageUrls || (charRefImageUrls && charRefImageUrls.length > 1 ? charRefImageUrls : undefined);

        if (isProviderHint) {
          log.info(` Job ${job.jobId} using provider hint: ${provider} (soft preference with fallbacks)`);
        }

        const result = await aiVideoService.generateVideo({
          prompt: textImagePromptOverride || charEnhancedPrompt,
          duration: job.duration || 6,
          aspectRatio,
          sceneType: job.sceneType || "hook",
          preferredProvider: provider,
          isProviderHint,
          negativePrompt: textImageUrl ? (job.negativePrompt || "") : enhancedNegativePrompt,
          visualStyle: job.style || "professional",
          imageUrl: finalImageUrl,
          imageUrls: finalImageUrls,
          i2vSettings: jobI2vSettings || undefined,
          qualityTier: projectQualityTier,
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
        resolvedProvider = actualProvider;
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

        if (i2vProviderHint && resolvedProvider && resolvedProvider !== 'auto') {
          const hintBase = i2vProviderHint.split('-')[0];
          const resolvedBase = resolvedProvider.split('-')[0];
          if (hintBase !== resolvedBase && i2vProviderHint !== resolvedProvider) {
            log.warn(`[PROVIDER_MISMATCH] Job ${job.jobId} scene=${job.sceneId}: providerHint="${i2vProviderHint}" but resolved="${resolvedProvider}" — pipeline assignment was overridden by fallback`);
          } else if (i2vProviderHint !== resolvedProvider) {
            log.info(`[PROVIDER_VARIANT] Job ${job.jobId} scene=${job.sceneId}: providerHint="${i2vProviderHint}" resolved to variant="${resolvedProvider}"`);
          }
        }
        
        const sceneUpdated = await updateSceneMedia(job.projectId, job.sceneId, videoUrl, resolvedProvider !== 'auto' ? resolvedProvider : undefined, i2vProviderHint || undefined);
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
