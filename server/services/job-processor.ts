import { db } from "../db";
import { videoGenerationJobs, universalVideoProjects } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { aiVideoService } from "./ai-video-service";

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

    const result = await aiVideoService.generateVideo({
      prompt: job.prompt || "",
      duration: job.duration || 6,
      aspectRatio: (job.aspectRatio as "16:9" | "9:16" | "1:1") || "16:9",
      sceneType: job.sceneType || "general",
      preferredProvider: job.provider || "auto",
      negativePrompt: job.negativePrompt || undefined,
      imageUrl: job.sourceImageUrl || undefined,
    });

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
