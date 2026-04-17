import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { db } from '../db';
import { universalVideoProjects } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { getProjectFromDb } from './video-project-db';
import { videoGenerationWorker } from './video-generation-worker';
import { getVisualArtPreset } from '../../shared/config/visual-art-presets';

export interface CinematicFlowStatus {
  status: 'running' | 'completed' | 'failed';
  total: number;
  completed: number;
  failed: number;
  currentScene: string;
  errors: string[];
  startedAt: Date;
}

const cinematicFlowStatus: Map<string, CinematicFlowStatus> = new Map();

export function getCinematicFlowStatus(projectId: string): CinematicFlowStatus | undefined {
  return cinematicFlowStatus.get(projectId);
}

export function clearCinematicFlowStatus(projectId: string): void {
  cinematicFlowStatus.delete(projectId);
}

export async function extractLastFrame(videoUrl: string): Promise<string | undefined> {
  try {
    try {
      const parsed = new URL(videoUrl);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new Error('Invalid video URL protocol');
      }
    } catch {
      throw new Error('Invalid video URL');
    }

    const tmpDir = os.tmpdir();
    const tmpVideo = path.join(tmpDir, `cinflow-${Date.now()}.mp4`);
    const tmpFrame = path.join(tmpDir, `cinflow-frame-${Date.now()}.jpg`);

    execFileSync('curl', ['-sL', '-o', tmpVideo, videoUrl], { timeout: 30000 });

    const durationStr = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', tmpVideo
    ], { timeout: 10000 }).toString().trim();
    const duration = parseFloat(durationStr);
    if (isNaN(duration) || duration <= 0) {
      throw new Error('Could not determine video duration');
    }

    const lastFrameTime = Math.max(0, duration - 0.1);
    // -update 1 + -frames:v 1 tells ffmpeg to write a single image to a fixed
    // filename (without it ffmpeg expects an image-sequence pattern like %03d
    // and silently writes nothing).
    execFileSync('ffmpeg', [
      '-y', '-ss', String(lastFrameTime), '-i', tmpVideo,
      '-frames:v', '1', '-update', '1', '-q:v', '2', tmpFrame
    ], { timeout: 15000 });

    if (!fs.existsSync(tmpFrame) || fs.statSync(tmpFrame).size === 0) {
      throw new Error('FFmpeg did not produce output frame');
    }

    const frameBuffer = fs.readFileSync(tmpFrame);
    // This project provisions credentials under the REMOTION_AWS_* names (used by
    // Remotion Lambda); fall back to plain AWS_* for portability.
    const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';
    const region = process.env.REMOTION_AWS_REGION || process.env.AWS_REGION || 'us-east-2';
    const bucket = process.env.REMOTION_S3_BUCKET || process.env.AWS_S3_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured (REMOTION_AWS_ACCESS_KEY_ID / REMOTION_AWS_SECRET_ACCESS_KEY missing)');
    }

    const s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    const key = `cinematic-flow/last-frame-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: frameBuffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read',
    }));

    try { fs.unlinkSync(tmpVideo); } catch {}
    try { fs.unlinkSync(tmpFrame); } catch {}

    const frameUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    console.log(`[CinematicFlow] Extracted last frame: ${frameUrl.substring(0, 80)}...`);
    return frameUrl;
  } catch (err: any) {
    console.warn(`[CinematicFlow] Last-frame extraction failed: ${err.message}`);
    return undefined;
  }
}

export interface RunCinematicFlowOptions {
  provider?: string;
  triggeredBy?: string;
  awaitCompletion?: boolean;
}

export async function runCinematicFlow(
  projectId: string,
  opts: RunCinematicFlowOptions = {}
): Promise<{ started: boolean; reason?: string; totalScenes?: number; completed?: number; failed?: number }> {
  // Atomic check-and-claim BEFORE any await — prevents two concurrent callers
  // (e.g. the worker auto-trigger + a manual route call) from both passing the
  // duplicate check and spawning two competing background flows.
  const existing = cinematicFlowStatus.get(projectId);
  if (existing && existing.status === 'running') {
    return { started: false, reason: 'Already running' };
  }
  cinematicFlowStatus.set(projectId, {
    status: 'running',
    total: 0,
    completed: 0,
    failed: 0,
    currentScene: '',
    errors: [],
    startedAt: new Date(),
  });

  const projectData = await getProjectFromDb(projectId);
  if (!projectData) {
    cinematicFlowStatus.delete(projectId);
    return { started: false, reason: 'Project not found' };
  }

  const scenes = (projectData.scenes || []).filter((s: any) => s.type !== 'chapter-title');
  if (scenes.length === 0) {
    cinematicFlowStatus.delete(projectId);
    return { started: false, reason: 'No content scenes' };
  }

  console.log(`[CinematicFlow] Starting cinematic flow regeneration for ${scenes.length} content scenes (project ${projectId})`);

  // Now that we have the real scene count, refresh the claimed status entry.
  cinematicFlowStatus.set(projectId, {
    status: 'running',
    total: scenes.length,
    completed: 0,
    failed: 0,
    currentScene: scenes[0]?.id || '',
    errors: [],
    startedAt: new Date(),
  });

  const flowPromise = (async () => {
    const status = cinematicFlowStatus.get(projectId)!;
    let previousLastFrameUrl: string | undefined = undefined;
    const provider = opts.provider;
    const triggeredBy = opts.triggeredBy || (projectData as any).ownerId;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      status.currentScene = scene.id;

      try {
        const sceneArtPresetId = scene.artPresetId || (projectData as any).progress?.artPresetId || (projectData as any).artPresetId;
        const artPreset = sceneArtPresetId ? getVisualArtPreset(sceneArtPresetId) : null;

        if (i > 0 && scenes[i - 1]?.artPresetId && scene.artPresetId && scenes[i - 1].artPresetId !== scene.artPresetId) {
          console.log(`[CinematicFlow] Style boundary at scene ${i} (${scenes[i - 1].artPresetId} → ${scene.artPresetId}) — breaking chain`);
          previousLastFrameUrl = undefined;
        }

        const sceneImagePrompt = scene.imagePrompt || scene.visualDirection || 'Professional cinematic scene';
        const sceneMotionPrompt = scene.motionPrompt;
        const sceneTextImageEnabled = scene.textImageEnabled === true;

        let sourceImageUrl: string | undefined = undefined;

        if (sceneTextImageEnabled) {
          console.log(`[CinematicFlow] Scene ${i}: textImageEnabled=true — skipping Flux, will use GPT-Image-1 in worker`);
          previousLastFrameUrl = undefined;
        } else if (previousLastFrameUrl) {
          sourceImageUrl = previousLastFrameUrl;
          console.log(`[CinematicFlow] Scene ${i}: Using previous scene's last frame as I2V source`);
        } else if (artPreset && artPreset.generationStrategy === 'i2v') {
          const falKey = process.env.FAL_KEY;
          if (falKey) {
            const { fal } = await import("@fal-ai/client");
            fal.config({ credentials: falKey });
            const projectAR = (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9';
            const falSize = projectAR === '9:16' ? 'portrait_16_9' as const
              : projectAR === '1:1' ? 'square' as const
              : 'landscape_16_9' as const;

            try {
              const imgResult = await fal.subscribe("fal-ai/flux-pro/v1.1", {
                input: { prompt: sceneImagePrompt, image_size: falSize, num_images: 1, safety_tolerance: "2", enable_safety_checker: true },
                logs: true,
              });
              if (imgResult.data?.images?.[0]?.url) {
                sourceImageUrl = imgResult.data.images[0].url;
                console.log(`[CinematicFlow] Scene ${i}: Generated fresh Flux image for I2V`);
              }
            } catch (imgErr: any) {
              console.warn(`[CinematicFlow] Scene ${i}: Flux image failed: ${imgErr.message}`);
            }
          }
        }

        const sceneProviderHint = scene.providerHint;
        const projectPreferredProvider = (projectData as any).preferredVideoProvider;
        const effectiveProvider = provider
          || (projectPreferredProvider && projectPreferredProvider !== 'auto' ? projectPreferredProvider : undefined);
        const effectivePrompt = (sourceImageUrl && sceneMotionPrompt) ? sceneMotionPrompt : (scene.visualDirection || 'Professional video');

        const cinFlowI2v: any = {};
        if (!provider && sceneProviderHint) {
          cinFlowI2v.providerHint = sceneProviderHint;
        }

        if (sourceImageUrl && previousLastFrameUrl) {
          cinFlowI2v.useFirstLastFrames = true;
          console.log(`[CinematicFlow] Scene ${i}: continuity frame present — requesting Seedance 2 first_last_frames mode (ignored by non-Seedance-2 providers)`);
        }

        const job = await videoGenerationWorker.createJob({
          projectId,
          sceneId: scene.id,
          provider: effectiveProvider,
          prompt: effectivePrompt,
          fallbackPrompt: scene.narration || 'professional video',
          duration: scene.duration || 6,
          aspectRatio: (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9',
          style: (projectData as any).settings?.visualStyle || 'professional',
          triggeredBy,
          sourceImageUrl,
          sceneType: scene.type || 'content',
          i2vSettings: Object.keys(cinFlowI2v).length > 0 ? cinFlowI2v : undefined,
        });

        console.log(`[CinematicFlow] Scene ${i}: Created job ${job.jobId}, waiting for completion...`);

        const maxWait = 12 * 60 * 1000;
        const pollInterval = 5000;
        const startTime = Date.now();
        let jobCompleted = false;
        let completedVideoUrl: string | undefined;

        while (Date.now() - startTime < maxWait) {
          await new Promise(r => setTimeout(r, pollInterval));
          const jobStatus = await videoGenerationWorker.getJob(job.jobId);
          if (!jobStatus) break;

          if (jobStatus.status === 'succeeded' && (jobStatus as any).videoUrl) {
            completedVideoUrl = (jobStatus as any).videoUrl;
            jobCompleted = true;
            break;
          } else if (jobStatus.status === 'failed') {
            throw new Error(`Job failed: ${jobStatus.error || 'Unknown'}`);
          }
        }

        if (jobCompleted && completedVideoUrl) {
          console.log(`[CinematicFlow] Scene ${i}: Video completed, extracting last frame for continuity`);
          previousLastFrameUrl = await extractLastFrame(completedVideoUrl);
          status.completed++;

          if (previousLastFrameUrl) {
            try {
              const freshProject = await db.select().from(universalVideoProjects)
                .where(eq(universalVideoProjects.projectId, projectId))
                .then(rows => rows[0]);
              if (freshProject) {
                const allScenes = (freshProject.scenes as any[]) || [];
                const realIdx = allScenes.findIndex((s: any) => s.id === scene.id);
                if (realIdx >= 0) {
                  allScenes[realIdx].continuityFrameUrl = previousLastFrameUrl;
                  await db.update(universalVideoProjects)
                    .set({ scenes: allScenes })
                    .where(eq(universalVideoProjects.projectId, projectId));
                  console.log(`[CinematicFlow] Scene ${i} (idx ${realIdx}): Persisted continuityFrameUrl`);
                }
              }
            } catch (saveErr: any) {
              console.warn(`[CinematicFlow] Scene ${i}: Failed to persist continuityFrameUrl: ${saveErr.message}`);
            }
          }
        } else {
          console.warn(`[CinematicFlow] Scene ${i}: Job did not complete within timeout`);
          previousLastFrameUrl = undefined;
          status.failed++;
          status.errors.push(`Scene ${scene.id}: Timeout waiting for video completion`);
        }

        console.log(`[CinematicFlow] Progress: ${status.completed + status.failed}/${status.total}`);
      } catch (err: any) {
        status.failed++;
        status.errors.push(`Scene ${scene.id}: ${err.message}`);
        console.error(`[CinematicFlow] Scene ${i} error:`, err.message);
        previousLastFrameUrl = undefined;
      }
    }

    status.status = status.failed === status.total ? 'failed' : 'completed';
    console.log(`[CinematicFlow] Complete: ${status.completed} success, ${status.failed} failed`);

    setTimeout(() => { cinematicFlowStatus.delete(projectId); }, 30 * 60 * 1000);
  })();

  if (opts.awaitCompletion) {
    await flowPromise;
    const finalStatus = cinematicFlowStatus.get(projectId);
    return {
      started: true,
      totalScenes: scenes.length,
      completed: finalStatus?.completed ?? 0,
      failed: finalStatus?.failed ?? 0,
    };
  }

  // Prevent unhandled-rejection crashes when fire-and-forget
  flowPromise.catch((err) => {
    console.error(`[CinematicFlow] Background flow crashed for ${projectId}:`, err?.message || err);
  });

  return { started: true, totalScenes: scenes.length };
}
