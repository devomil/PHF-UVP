import { db } from "../db";
import { videoGenerationJobs, universalVideoProjects } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { aiVideoService } from "./ai-video-service";
import { imageGenerationService } from "./image-generation-service";
import { assetUrlResolver } from "./asset-url-resolver";

export async function recoverStuckJobs() {
  try {
    const stuckJobs = await db
      .select()
      .from(videoGenerationJobs)
      .where(eq(videoGenerationJobs.status, "processing"));

    for (const job of stuckJobs) {
      const stuckMinutes = (Date.now() - new Date(job.updatedAt || job.createdAt || Date.now()).getTime()) / 60000;
      if (stuckMinutes > 2) {
        console.log(`[JobProcessor] Recovering stuck job ${job.jobId} (stuck ${Math.round(stuckMinutes)}min, provider: ${job.provider})`);
        await db
          .update(videoGenerationJobs)
          .set({ status: "pending", startedAt: null, updatedAt: new Date() })
          .where(eq(videoGenerationJobs.jobId, job.jobId));
        processVideoJob(job.jobId).catch((err) => {
          console.error(`[JobProcessor] Recovery retry failed for ${job.jobId}:`, err.message);
        });
      }
    }
    if (stuckJobs.length > 0) {
      console.log(`[JobProcessor] Checked ${stuckJobs.length} processing jobs for recovery`);
    }
  } catch (err: any) {
    console.error("[JobProcessor] Stuck job recovery error:", err.message);
  }
}

export async function processVideoJob(jobId: string) {
  console.log(`[JobProcessor] Processing job ${jobId}`);

  const [job] = await db
    .select()
    .from(videoGenerationJobs)
    .where(eq(videoGenerationJobs.jobId, jobId))
    .limit(1);

  if (!job) {
    console.error(`[JobProcessor] Job ${jobId} not found`);
    return;
  }

  if (job.status !== "pending") {
    console.log(`[JobProcessor] Job ${jobId} already in status: ${job.status}`);
    return;
  }

  try {
    await db
      .update(videoGenerationJobs)
      .set({ status: "processing", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(videoGenerationJobs.jobId, jobId));

    const [currentProject] = await db
      .select()
      .from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, job.projectId))
      .limit(1);

    const existingAssets = (currentProject?.assets as any) || {};

    await db
      .update(universalVideoProjects)
      .set({
        status: "generating",
        progress: { phase: "generating", percentage: 10, currentStep: "Sending to AI provider..." },
        assets: {
          ...existingAssets,
          quickCreate: {
            ...(existingAssets.quickCreate || {}),
            visual: {
              status: "generating",
              url: null,
              provider: job.provider || "auto",
              error: null,
              updatedAt: new Date().toISOString(),
            },
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, job.projectId));

    const jobI2vSettings = (job.i2vSettings as any) || {};

    const i2vSettingsForProvider: any = {};
    if (jobI2vSettings.imageControlStrength !== undefined) {
      i2vSettingsForProvider.imageControlStrength = jobI2vSettings.imageControlStrength;
    }

    let resolvedImageUrl = job.sourceImageUrl || undefined;
    if (resolvedImageUrl && !resolvedImageUrl.startsWith('https://')) {
      const resolved = await assetUrlResolver.resolve(resolvedImageUrl);
      if (resolved) {
        console.log(`[JobProcessor] Resolved source image: ${resolvedImageUrl} → ${resolved.substring(0, 80)}...`);
        resolvedImageUrl = resolved;
      } else {
        throw new Error(`Failed to resolve source image to a public URL: ${resolvedImageUrl}. Check S3 credentials.`);
      }
    }

    const isI2IJob = job.sceneType === 'i2i' && resolvedImageUrl;

    let result: any;

    if (isI2IJob) {
      const i2iUseCase = jobI2vSettings.i2iTransformType || 'scene-integration';
      const i2iStrength = jobI2vSettings.i2iStrength !== undefined ? jobI2vSettings.i2iStrength : 0.65;

      const aspectRatioMap: Record<string, { w: number; h: number }> = {
        '16:9': { w: 1920, h: 1080 },
        '9:16': { w: 1080, h: 1920 },
        '1:1': { w: 1024, h: 1024 },
      };
      const dims = aspectRatioMap[(job.aspectRatio as string) || '16:9'] || { w: 1920, h: 1080 };

      const transformPrefixes: Record<string, string> = {
        'scene-integration': 'Place the subject from the reference image into this scene, preserving their appearance and identity:',
        'background-generation': 'Keep the subject from the reference image exactly as they are, but replace the background with:',
        'style-transfer': 'Transform the reference image into this artistic style while preserving the composition and subject:',
        'product-placement': 'Create a professional marketing visual featuring the product from the reference image:',
      };
      const prefix = transformPrefixes[i2iUseCase] || transformPrefixes['scene-integration'];
      const enhancedPrompt = `${prefix} ${job.prompt || ""}`;

      console.log(`[JobProcessor] I2I job ${job.jobId}: useCase=${i2iUseCase}, strength=${i2iStrength}, provider=${job.provider}, aspect=${job.aspectRatio}`);

      const i2iResult = await imageGenerationService.generateImageToImage({
        referenceImageUrl: resolvedImageUrl!,
        prompt: enhancedPrompt,
        strength: i2iStrength,
        provider: job.provider === 'auto' ? undefined : job.provider || undefined,
        useCase: i2iUseCase as any,
        width: dims.w,
        height: dims.h,
        aspectRatio: (job.aspectRatio as string) || '16:9',
      });

      result = {
        success: true,
        videoUrl: i2iResult.url,
        s3Url: i2iResult.url,
        provider: i2iResult.provider,
        cost: i2iResult.cost,
        generationTimeMs: undefined,
      };
      console.log(`[JobProcessor] I2I job ${job.jobId} completed. Image: ${i2iResult.url.substring(0, 60)}...`);
    } else {
      result = await aiVideoService.generateVideo({
        prompt: job.prompt || "",
        duration: job.duration || 6,
        aspectRatio: (job.aspectRatio as "16:9" | "9:16" | "1:1") || "16:9",
        sceneType: job.sceneType || "general",
        preferredProvider: job.provider || "auto",
        negativePrompt: job.negativePrompt || undefined,
        imageUrl: resolvedImageUrl,
        ...(jobI2vSettings.isCharacterReference ? { isCharacterReference: true } : {}),
        ...(jobI2vSettings.artPresetId ? { artPresetId: jobI2vSettings.artPresetId } : {}),
        ...(Object.keys(i2vSettingsForProvider).length > 0 ? { i2vSettings: i2vSettingsForProvider } : {}),
      });
    }

    const [projectAfterGen] = await db
      .select()
      .from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, job.projectId))
      .limit(1);
    const assetsAfterGen = (projectAfterGen?.assets as any) || {};

    if (result.success && result.videoUrl) {
      await db
        .update(videoGenerationJobs)
        .set({
          status: "completed",
          videoUrl: result.videoUrl,
          progress: 100,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(videoGenerationJobs.jobId, jobId));

      const finalUrl = result.s3Url || result.videoUrl;
      const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(finalUrl || '') || job.sceneType === 'video';

      await db
        .update(universalVideoProjects)
        .set({
          status: "completed",
          outputUrl: finalUrl,
          progress: { phase: "completed", percentage: 100, currentStep: "Generation complete" },
          assets: {
            ...assetsAfterGen,
            quickCreate: {
              ...(assetsAfterGen.quickCreate || {}),
              visual: {
                status: "completed",
                url: finalUrl,
                videoUrl: isVideo ? finalUrl : undefined,
                imageUrl: !isVideo ? finalUrl : undefined,
                type: isVideo ? 'video' : 'image',
                provider: result.provider || job.provider || "auto",
                duration: result.duration,
                cost: result.cost,
                generationTimeMs: result.generationTimeMs,
                error: null,
                updatedAt: new Date().toISOString(),
              },
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(universalVideoProjects.projectId, job.projectId));

      console.log(`[JobProcessor] Job ${jobId} completed successfully. Video: ${result.videoUrl?.substring(0, 60)}...`);
    } else {
      const errorMsg = result.error || "Generation failed with no error message";
      await db
        .update(videoGenerationJobs)
        .set({
          status: "failed",
          errorMessage: errorMsg,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(videoGenerationJobs.jobId, jobId));

      await db
        .update(universalVideoProjects)
        .set({
          status: "failed",
          progress: { phase: "failed", percentage: 0, currentStep: errorMsg },
          assets: {
            ...assetsAfterGen,
            quickCreate: {
              ...(assetsAfterGen.quickCreate || {}),
              visual: {
                status: "failed",
                url: null,
                provider: job.provider || "auto",
                error: errorMsg,
                updatedAt: new Date().toISOString(),
              },
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(universalVideoProjects.projectId, job.projectId));

      console.error(`[JobProcessor] Job ${jobId} failed: ${errorMsg}`);
    }
  } catch (error: any) {
    const errorMsg = error.message || "Unexpected error during generation";
    console.error(`[JobProcessor] Job ${jobId} error:`, errorMsg);

    await db
      .update(videoGenerationJobs)
      .set({
        status: "failed",
        errorMessage: errorMsg,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(videoGenerationJobs.jobId, jobId));

    const [projectOnError] = await db
      .select()
      .from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, job.projectId))
      .limit(1);
    const assetsOnError = (projectOnError?.assets as any) || {};

    await db
      .update(universalVideoProjects)
      .set({
        status: "failed",
        progress: { phase: "failed", percentage: 0, currentStep: errorMsg },
        assets: {
          ...assetsOnError,
          quickCreate: {
            ...(assetsOnError.quickCreate || {}),
            visual: {
              status: "failed",
              url: null,
              provider: job.provider || "auto",
              error: errorMsg,
              updatedAt: new Date().toISOString(),
            },
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, job.projectId));
  }
}
