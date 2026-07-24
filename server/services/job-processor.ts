import { db } from "../db";
import { videoGenerationJobs, universalVideoProjects } from "../../shared/schema";
import { eq, inArray } from "drizzle-orm";
import { aiVideoService } from "./ai-video-service";
import { imageGenerationService } from "./image-generation-service";
import { assetUrlResolver } from "./asset-url-resolver";
import { optimizeI2IEditPrompt } from "./i2i-prompt-optimizer";

export async function recoverStuckJobs() {
  try {
    // Query both "processing" jobs (which stalled) AND "pending" QC jobs
    // (which were reset to pending by a previous recovery run but whose
    // processVideoJob call was lost because the server restarted again
    // before it could execute — the VideoWorker skips QC projects so
    // nobody else will pick these up).
    const [processingJobs, pendingQcJobs] = await Promise.all([
      db.select().from(videoGenerationJobs)
        .where(eq(videoGenerationJobs.status, "processing")),
      db.select().from(videoGenerationJobs)
        .where(eq(videoGenerationJobs.status, "pending")),
    ]);

    const stuckJobs = processingJobs;
    const allJobsToCheck = [...processingJobs, ...pendingQcJobs];

    if (allJobsToCheck.length === 0) return;

    // Batch-fetch projects for all jobs so we can identify Quick Create ones.
    const uniqueProjectIds = [...new Set(allJobsToCheck.map(j => j.projectId))];
    const projects = uniqueProjectIds.length > 0
      ? await db
          .select({ projectId: universalVideoProjects.projectId, outputFormat: universalVideoProjects.outputFormat })
          .from(universalVideoProjects)
          .where(inArray(universalVideoProjects.projectId, uniqueProjectIds))
      : [];

    // Quick Create projects are managed directly by processVideoJob (called from the
    // Phase9B-Async route handler immediately after job creation). We must NOT
    // re-trigger them while they could still be legitimately in-flight — Runway
    // Aleph takes ~4-5 minutes, which would exceed a short threshold.
    //
    // Recovery rules for QC jobs:
    //   "processing" + ≤15 min  → still in-flight, skip
    //   "processing" + >15 min  → orphaned by restart (provider finished, server lost polling) → reset + re-run
    //   "pending"    + >1  min  → processVideoJob call was lost (server restarted again before
    //                              the async call executed); VideoWorker skips QC projects so
    //                              nobody else will pick this up → call processVideoJob directly
    const QC_INFLIGHT_THRESHOLD_MINUTES = 15;
    const QC_PENDING_STALE_MINUTES = 1;

    const qcProjectIds = new Set(
      projects
        .filter(p => (p.outputFormat as any)?.platform === 'quick-create')
        .map(p => p.projectId)
    );

    let recovered = 0;
    let skipped = 0;

    for (const job of allJobsToCheck) {
      const ageMins = (Date.now() - new Date(job.updatedAt || job.createdAt || Date.now()).getTime()) / 60000;
      const isQC = qcProjectIds.has(job.projectId) || job.sceneId === 'quick-create';

      if (job.status === 'processing') {
        if (isQC && ageMins <= QC_INFLIGHT_THRESHOLD_MINUTES) {
          // Still within the normal generation window for a QC job.
          console.log(`[JobProcessor] QC job ${job.jobId} processing for ${Math.round(ageMins)}min — within normal window, skipping`);
          skipped++;
          continue;
        }
        if (ageMins > 2) {
          const reason = isQC
            ? `QC orphan (${Math.round(ageMins)}min > ${QC_INFLIGHT_THRESHOLD_MINUTES}min threshold)`
            : `${Math.round(ageMins)}min stall`;
          console.log(`[JobProcessor] Recovering stuck job ${job.jobId} (${reason}, provider: ${job.provider})`);
          await db
            .update(videoGenerationJobs)
            .set({ status: "pending", startedAt: null, updatedAt: new Date() })
            .where(eq(videoGenerationJobs.jobId, job.jobId));
          processVideoJob(job.jobId).catch((err) => {
            console.error(`[JobProcessor] Recovery retry failed for ${job.jobId}:`, err.message);
          });
          recovered++;
        }
      } else if (job.status === 'pending' && isQC && ageMins > QC_PENDING_STALE_MINUTES) {
        // QC job stuck as "pending" — nobody will pick it up (VideoWorker skips QC
        // projects). This happens when a server restart killed the async processVideoJob
        // call that was fired by a previous recovery run. Re-trigger it directly.
        console.log(`[JobProcessor] QC job ${job.jobId} stuck pending ${Math.round(ageMins)}min — re-triggering processVideoJob`);
        processVideoJob(job.jobId).catch((err) => {
          console.error(`[JobProcessor] Re-trigger failed for pending QC job ${job.jobId}:`, err.message);
        });
        recovered++;
      }
    }

    if (allJobsToCheck.length > 0) {
      console.log(`[JobProcessor] Recovery scan: ${allJobsToCheck.length} jobs checked, ${recovered} recovered/re-triggered, ${skipped} in-flight skipped`);
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

    // Resolve additional reference images (character, logo, extras) stored in
    // i2vSettings.referenceImages. These feed the multi-image I2V path in
    // piapi-video-service (reference_images[] / elements[]) so the provider
    // receives all reference images, not just the first-frame source image.
    let resolvedImageUrls: string[] | undefined = undefined;
    const rawRefImages = Array.isArray(jobI2vSettings.referenceImages)
      ? (jobI2vSettings.referenceImages as string[]).filter(Boolean)
      : [];

    // Also include brandLogoUrl in the reference image array — it is stored
    // separately in i2vSettings but must reach elements[] (Kling 1.6) and
    // reference_images[] (other providers) alongside the other ref images.
    const brandLogoUrl = (jobI2vSettings.brandLogoUrl as string | undefined) || undefined;
    const rawRefImagesWithLogo = brandLogoUrl && !rawRefImages.includes(brandLogoUrl)
      ? [...rawRefImages, brandLogoUrl]
      : rawRefImages;

    if (rawRefImagesWithLogo.length > 0 && resolvedImageUrl) {
      const resolvedRefs = await Promise.all(
        rawRefImagesWithLogo.map(async (url: string) => {
          if (url.startsWith('https://')) return url;
          const r = await assetUrlResolver.resolve(url);
          if (r) console.log(`[JobProcessor] Resolved ref image: ${url.substring(0, 60)} → ${r.substring(0, 60)}...`);
          return r || null;
        })
      );
      const validRefs = resolvedRefs.filter((u): u is string => !!u);
      // imageUrls = [sourceImage, ...additionalRefs] — source goes first so
      // it maps to @image1 and subsequent refs to @image2, @image3, etc.
      resolvedImageUrls = [resolvedImageUrl, ...validRefs];
      console.log(`[JobProcessor] Multi-image I2V: ${resolvedImageUrls.length} images (source + ${validRefs.length} refs${brandLogoUrl ? ', including brand logo' : ''})`);
    }

    // Forward brandLogoUrl in i2vSettingsForProvider so Seedance's explicit
    // @imageN brand-mark injection still works (it reads from options.i2vSettings).
    if (brandLogoUrl) {
      i2vSettingsForProvider.brandLogoUrl = brandLogoUrl;
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

      // Kontext and Nano Banana Pro both operate on the reference image via direct
      // prompt instructions — the "place the subject" prefix corrupts their intent.
      // Only apply subject-extraction prefixes for traditional flux img2img providers.
      const isKontextProvider = job.provider === 'flux-kontext' || job.provider === 'nano-banana-pro';
      const transformPrefixes: Record<string, string> = {
        'scene-integration': 'Place the subject from the reference image into this scene, preserving their appearance and identity:',
        'background-generation': 'Keep the subject from the reference image exactly as they are, but replace the background with:',
        'style-transfer': 'Transform the reference image into this artistic style while preserving the composition and subject:',
        'product-placement': 'Create a professional marketing visual featuring the product from the reference image:',
      };
      const prefix = transformPrefixes[i2iUseCase] || transformPrefixes['scene-integration'];

      // Direct-edit models (Kontext / Nano Banana) follow the instruction literally.
      // Preservation-heavy user prompts make them freeze the image and change nothing,
      // so rewrite into an action-first edit instruction. Falls back to the raw prompt
      // on any failure. Traditional img2img providers keep the subject-extraction prefix.
      let enhancedPrompt: string;
      if (isKontextProvider) {
        const { prompt: optimized } = await optimizeI2IEditPrompt(job.prompt || '');
        enhancedPrompt = optimized;
      } else {
        enhancedPrompt = `${prefix} ${job.prompt || ""}`;
      }

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
        // Forward all resolved reference images so multi-image providers
        // (Kling 2.5, Seedance) receive them in reference_images[]/elements[].
        ...(resolvedImageUrls && resolvedImageUrls.length > 1 ? { imageUrls: resolvedImageUrls } : {}),
        sourceVideoUrl: jobI2vSettings.sourceVideoUrl || undefined,
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
      // Phase NC-01 — fail-CLOSED credit consumption per generation. Debit
      // BEFORE we mark the job completed so an unrecoverable charge error
      // surfaces as a failed job rather than an unmetered asset. Image
      // (I2I) and video paths both flow through here, so this also
      // satisfies the "image-generation paths also consume per call"
      // requirement.
      // Local helper: mirror the existing failure-path project update so
      // fail-closed credit branches don't leave the parent project stuck
      // in an in-progress state.
      const markProjectFailed = async (failMsg: string) => {
        await db
          .update(universalVideoProjects)
          .set({
            status: "failed",
            progress: { phase: "failed", percentage: 0, currentStep: failMsg },
            assets: {
              ...assetsAfterGen,
              quickCreate: {
                ...(assetsAfterGen.quickCreate || {}),
                visual: {
                  status: "failed",
                  url: null,
                  provider: job.provider || "auto",
                  error: failMsg,
                  updatedAt: new Date().toISOString(),
                },
              },
            },
            updatedAt: new Date(),
          })
          .where(eq(universalVideoProjects.projectId, job.projectId));
      };

      if (job.triggeredBy) {
        try {
          const { consumeCredits, getCreditCost, canAccessProvider } = await import('./credits-service');
          const debitProvider = result.provider || job.provider || (isI2IJob ? 'image-flux' : 'kling-2.6');
          const allowedActual = await canAccessProvider(job.triggeredBy, debitProvider);
          if (!allowedActual) {
            const denyMsg = `Provider ${debitProvider} is not included in your plan`;
            console.error(`[JobProcessor] Job ${jobId} resolved to ${debitProvider} (not in plan) — withholding delivery`);
            await db
              .update(videoGenerationJobs)
              .set({ status: "failed", errorMessage: denyMsg, completedAt: new Date(), updatedAt: new Date() })
              .where(eq(videoGenerationJobs.jobId, jobId));
            await markProjectFailed(denyMsg);
            return;
          }
          const debitDuration = isI2IJob ? null : (typeof job.duration === 'number' ? job.duration : null);
          const gcCost = await getCreditCost(debitProvider, null, debitDuration);
          await consumeCredits(job.triggeredBy, gcCost, {
            provider: debitProvider,
            durationS: debitDuration ?? undefined,
            jobId,
            description: isI2IJob
              ? `Quick Create I2I image generation`
              : `Quick Create ${job.sceneType || 'video'} generation`,
          });
        } catch (creditErr: any) {
          console.error(`[JobProcessor] Job ${jobId} consume FAILED — withholding delivery: ${creditErr.message}`);
          const chargeErrMsg = `Credit charge failed: ${creditErr.message}`;
          await db
            .update(videoGenerationJobs)
            .set({
              status: "failed",
              errorMessage: chargeErrMsg,
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(videoGenerationJobs.jobId, jobId));
          await markProjectFailed(chargeErrMsg);
          return;
        }
      }

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

      // Phase NC-01 — refund any credits we previously debited for this
      // jobId. Idempotent: a no-op if no debit was ever recorded.
      if (job.triggeredBy) {
        try {
          const { refundCredits } = await import('./credits-service');
          await refundCredits(job.triggeredBy, Number.MAX_SAFE_INTEGER, {
            jobId,
            reason: `Quick Create generation failed: ${errorMsg}`,
          });
        } catch (refundErr: any) {
          console.error(`[JobProcessor] Job ${jobId} refund failed (non-fatal): ${refundErr.message}`);
        }
      }

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

    // Phase NC-01 — refund any credits previously debited for this jobId.
    // Idempotent and a no-op if we never charged it.
    if (job.triggeredBy) {
      try {
        const { refundCredits } = await import('./credits-service');
        await refundCredits(job.triggeredBy, Number.MAX_SAFE_INTEGER, {
          jobId,
          reason: `Quick Create generation error: ${errorMsg}`,
        });
      } catch (refundErr: any) {
        console.error(`[JobProcessor] Job ${jobId} refund failed (non-fatal): ${refundErr.message}`);
      }
    }

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
