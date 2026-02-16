import { db } from './db';
import { universalVideoProjects } from '../shared/schema';
import { eq, and, lt, inArray } from 'drizzle-orm';
import { universalVideoService } from './services/universal-video-service';
import { sceneAnalysisService } from './services/scene-analysis-service';
import { chunkedRenderService } from './services/chunked-render-service';
import type { ChunkedRenderProgress, LambdaChunkState, ChunkResult } from './services/chunked-render-service';
import { remotionLambdaService } from './services/remotion-lambda-service';
import {
  saveProjectToDb,
  dbRowToVideoProject,
  getProjectFromDb,
  type VideoProjectWithMeta,
} from './services/video-project-db';

const POLL_INTERVAL_MS = 5000;
const STALL_THRESHOLD_MS = 2 * 60 * 1000;
const RENDER_STALL_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes - long videos (3-10 min) need time for Lambda cold starts + chunk rendering
const WORKER_ID = `worker_${process.pid}_${Date.now()}`;

let isProcessing = false;
let currentProjectId: string | null = null;

function log(message: string, ...args: any[]) {
  console.log(`[VideoWorker ${WORKER_ID}] ${message}`, ...args);
}

function logError(message: string, ...args: any[]) {
  console.error(`[VideoWorker ${WORKER_ID}] ${message}`, ...args);
}

async function recoverStalledProjects() {
  try {
    const stallCutoff = new Date(Date.now() - STALL_THRESHOLD_MS);

    const stalledProjects = await db.select({
      projectId: universalVideoProjects.projectId,
      status: universalVideoProjects.status,
      updatedAt: universalVideoProjects.updatedAt,
    })
    .from(universalVideoProjects)
    .where(
      and(
        eq(universalVideoProjects.status, 'generating'),
        lt(universalVideoProjects.updatedAt, stallCutoff)
      )
    );

    if (stalledProjects.length > 0) {
      log(`Found ${stalledProjects.length} stalled generating project(s), requeuing...`);
      for (const project of stalledProjects) {
        await db.update(universalVideoProjects)
          .set({
            status: 'queued',
            updatedAt: new Date(),
          })
          .where(eq(universalVideoProjects.projectId, project.projectId));
        log(`Requeued stalled project: ${project.projectId} (last update: ${project.updatedAt})`);
      }
    }

    const renderStallCutoff = new Date(Date.now() - RENDER_STALL_THRESHOLD_MS);
    const stalledRenders = await db.select({
      projectId: universalVideoProjects.projectId,
      status: universalVideoProjects.status,
      updatedAt: universalVideoProjects.updatedAt,
    })
    .from(universalVideoProjects)
    .where(
      and(
        inArray(universalVideoProjects.status, ['rendering', 'lambda_pending']),
        lt(universalVideoProjects.updatedAt, renderStallCutoff)
      )
    );

    if (stalledRenders.length > 0) {
      log(`Found ${stalledRenders.length} stalled render/lambda_pending project(s) (>${RENDER_STALL_THRESHOLD_MS / 60000}min no update), checking...`);
      for (const project of stalledRenders) {
        if (project.projectId === currentProjectId) {
          log(`Skipping stall recovery for ${project.projectId} - currently being processed by this worker`);
          continue;
        }
        const projectData = await getProjectFromDb(project.projectId);
        const renderMethod = (projectData?.progress as any)?.renderMethod;
        if (renderMethod === 'standard') {
          log(`Skipping stall recovery for ${project.projectId} - standard Lambda render (frontend handles status)`);
          continue;
        }
        await db.update(universalVideoProjects)
          .set({
            status: 'render_queued',
            updatedAt: new Date(),
          })
          .where(eq(universalVideoProjects.projectId, project.projectId));
        log(`Re-queued stalled ${project.status} project: ${project.projectId} (last update: ${project.updatedAt})`);
      }
    }
  } catch (err: any) {
    logError('Error recovering stalled projects:', err.message);
  }
}

async function startupRecovery() {
  log('=== STARTUP RECOVERY: Checking for in-flight Lambda renders ===');

  try {
    const inFlightProjects = await db.select()
      .from(universalVideoProjects)
      .where(
        inArray(universalVideoProjects.status, ['rendering', 'lambda_pending'])
      );

    if (inFlightProjects.length === 0) {
      log('No in-flight renders found at startup');
      return;
    }

    log(`Found ${inFlightProjects.length} in-flight render(s) to recover`);

    for (const row of inFlightProjects) {
      const projectData = dbRowToVideoProject(row);
      const projectId = projectData.id;
      const progress = projectData.progress as any;
      const lambdaState = progress?.lambdaChunkState as LambdaChunkState | null;

      log(`Recovering project ${projectId} (status: ${row.status}, renderMethod: ${progress?.renderMethod || 'unknown'})`);

      if (progress?.renderMethod === 'standard') {
        log(`Project ${projectId}: Standard Lambda render - leaving as-is (frontend polls Lambda directly)`);
        continue;
      }

      if (!lambdaState || !lambdaState.renderId || !lambdaState.bucketName) {
        const completedChunks = (progress?.completedChunkResults || []) as ChunkResult[];
        const totalChunks = progress?.renderStatus?.totalChunks || progress?.chunkedRenderTotalChunks || 0;

        if (completedChunks.length > 0 && completedChunks.length >= totalChunks && totalChunks > 0) {
          log(`Project ${projectId}: No active Lambda render but all ${totalChunks} chunks completed. Finishing render...`);
          await finishChunkedRender(projectData, completedChunks, totalChunks);
          continue;
        }

        if (completedChunks.length > 0 && totalChunks > 0) {
          log(`Project ${projectId}: No active Lambda render, ${completedChunks.length}/${totalChunks} chunks done. Requeueing to render remaining chunks...`);
          const currentProject = await getProjectFromDb(projectId);
          if (currentProject) {
            (currentProject.progress as any).completedChunkResults = completedChunks;
            (currentProject.progress as any).lambdaChunkState = null;
            currentProject.status = 'render_queued';
            await saveProjectToDb(currentProject, projectData.ownerId);
          }
          continue;
        }

        if (progress?.renderMethod === 'chunked' && progress?.renderInputProps) {
          log(`Project ${projectId}: Chunked render with input props, requeueing to render_queued`);
          await db.update(universalVideoProjects)
            .set({ status: 'render_queued', updatedAt: new Date() })
            .where(eq(universalVideoProjects.projectId, projectId));
          continue;
        }

        log(`Project ${projectId}: No Lambda render context and no completed chunks, leaving as-is`);
        continue;
      }

      try {
        log(`Project ${projectId}: Checking Lambda render ${lambdaState.renderId} (chunk ${lambdaState.chunkIndex})...`);
        const lambdaStatus = await chunkedRenderService.checkChunkRenderStatus(
          lambdaState.renderId,
          lambdaState.bucketName
        );

        switch (lambdaStatus.status) {
          case 'complete': {
            log(`Project ${projectId}: Lambda render COMPLETE for chunk ${lambdaState.chunkIndex} -> ${lambdaStatus.outputUrl}`);
            const completedChunks = (progress?.completedChunkResults || []) as ChunkResult[];
            completedChunks.push({
              chunkIndex: lambdaState.chunkIndex,
              s3Url: lambdaStatus.outputUrl!,
              localPath: '',
              success: true,
            });

            const totalChunks = progress?.renderStatus?.totalChunks || 0;
            const allChunksComplete = completedChunks.length >= totalChunks && totalChunks > 0;

            if (allChunksComplete) {
              log(`Project ${projectId}: All ${totalChunks} chunks complete! Finishing render...`);
              await finishChunkedRender(projectData, completedChunks, totalChunks);
            } else {
              log(`Project ${projectId}: Chunk ${lambdaState.chunkIndex} done, ${completedChunks.length}/${totalChunks} complete. Requeueing for next chunk...`);
              const currentProject = await getProjectFromDb(projectId);
              if (currentProject) {
                (currentProject.progress as any).completedChunkResults = completedChunks;
                (currentProject.progress as any).lambdaChunkState = null;
                currentProject.status = 'render_queued';
                await saveProjectToDb(currentProject, projectData.ownerId);
              }
            }
            break;
          }

          case 'in_progress': {
            log(`Project ${projectId}: Lambda render IN PROGRESS (${lambdaStatus.progress}%) for chunk ${lambdaState.chunkIndex}. Resuming monitoring...`);
            await db.update(universalVideoProjects)
              .set({ status: 'lambda_pending', updatedAt: new Date() })
              .where(eq(universalVideoProjects.projectId, projectId));
            resumeLambdaMonitoring(projectData, lambdaState);
            break;
          }

          case 'failed':
          case 'not_found': {
            log(`Project ${projectId}: Lambda render ${lambdaStatus.status} for chunk ${lambdaState.chunkIndex}: ${lambdaStatus.error}. Requeueing...`);
            const currentProject = await getProjectFromDb(projectId);
            if (currentProject) {
              (currentProject.progress as any).lambdaChunkState = null;
              currentProject.status = 'render_queued';
              (currentProject.progress as any).renderStatus = {
                ...(currentProject.progress as any).renderStatus,
                lastUpdateAt: Date.now(),
                message: `Chunk ${lambdaState.chunkIndex} ${lambdaStatus.status}, requeueing...`,
              };
              await saveProjectToDb(currentProject, projectData.ownerId);
            }
            break;
          }
        }
      } catch (error: any) {
        logError(`Error recovering project ${projectId}: ${error.message}`);
        await db.update(universalVideoProjects)
          .set({ status: 'render_queued', updatedAt: new Date() })
          .where(eq(universalVideoProjects.projectId, projectId));
      }
    }

    log('=== STARTUP RECOVERY COMPLETE ===');
  } catch (err: any) {
    logError('Startup recovery failed:', err.message);
  }
}

async function finishChunkedRender(
  projectData: VideoProjectWithMeta,
  completedChunks: ChunkResult[],
  totalChunks: number
) {
  const projectId = projectData.id;
  currentProjectId = projectId;

  try {
    const outputUrl = await chunkedRenderService.resumeFromCompletedChunks(
      projectId,
      completedChunks,
      totalChunks,
      async (renderProgress: ChunkedRenderProgress) => {
        try {
          const currentProject = await getProjectFromDb(projectId);
          if (currentProject) {
            currentProject.progress.steps.rendering.progress = renderProgress.overallPercent;
            currentProject.progress.steps.rendering.message = renderProgress.message;
            currentProject.progress.overallPercent = 85 + Math.round(renderProgress.overallPercent * 0.15);
            (currentProject.progress as any).renderStatus = {
              ...(currentProject.progress as any).renderStatus,
              phase: renderProgress.phase,
              percent: renderProgress.overallPercent,
              message: renderProgress.message,
              lastUpdateAt: Date.now(),
            };
            await saveProjectToDb(currentProject, projectData.ownerId);
          }
        } catch (e: any) {
          log(`Failed to save finish progress: ${e.message}`);
        }
      }
    );

    const latestProject = await getProjectFromDb(projectId);
    if (latestProject) {
      latestProject.status = 'complete';
      latestProject.progress.steps.rendering.status = 'complete';
      latestProject.progress.steps.rendering.progress = 100;
      latestProject.progress.steps.rendering.message = 'Video rendering complete!';
      latestProject.progress.overallPercent = 100;
      latestProject.outputUrl = outputUrl;
      (latestProject.progress as any).renderStatus = {
        phase: 'complete',
        totalChunks,
        completedChunks: totalChunks,
        percent: 100,
        message: 'Video rendering complete!',
        lastUpdateAt: Date.now(),
        error: null,
      };
      (latestProject.progress as any).lambdaChunkState = null;
      (latestProject.progress as any).completedChunkResults = null;
      delete (latestProject.progress as any).renderInputProps;

      await saveProjectToDb(latestProject, projectData.ownerId, 'chunked', 'chunked', outputUrl);
      log(`Finished render for ${projectId}: ${outputUrl}`);
    }
  } catch (error: any) {
    logError(`Failed to finish chunked render for ${projectId}: ${error.message}`);
    const latestProject = await getProjectFromDb(projectId);
    if (latestProject) {
      latestProject.status = 'error';
      latestProject.progress.steps.rendering.status = 'error';
      latestProject.progress.steps.rendering.message = error.message;
      latestProject.progress.errors = latestProject.progress.errors || [];
      latestProject.progress.errors.push(`Finish render failed: ${error.message}`);
      await saveProjectToDb(latestProject, projectData.ownerId);
    }
  } finally {
    currentProjectId = null;
  }
}

function resumeLambdaMonitoring(projectData: VideoProjectWithMeta, lambdaState: LambdaChunkState) {
  const projectId = projectData.id;

  (async () => {
    try {
      log(`Resuming Lambda poll for project ${projectId}, render ${lambdaState.renderId}`);

      const outputUrl = await remotionLambdaService.pollRenderToCompletion(
        lambdaState.renderId,
        lambdaState.bucketName,
        async (pct: number) => {
          try {
            const currentProject = await getProjectFromDb(projectId);
            if (currentProject) {
              const totalChunks = (currentProject.progress as any).renderStatus?.totalChunks || 1;
              const prevPercent = (currentProject.progress as any).renderStatus?.percent || 0;
              const newPercent = Math.max(pct, prevPercent);
              
              currentProject.progress.steps.rendering.progress = newPercent;
              currentProject.progress.steps.rendering.message = `Rendering chunk ${lambdaState.chunkIndex + 1} of ${totalChunks} (${newPercent}%)...`;
              currentProject.progress.overallPercent = 85 + Math.round(newPercent * 0.15);
              (currentProject.progress as any).renderStatus = {
                ...(currentProject.progress as any).renderStatus,
                percent: newPercent,
                lastUpdateAt: Date.now(),
                message: `Rendering chunk ${lambdaState.chunkIndex + 1} of ${totalChunks} (${newPercent}%)...`,
              };
              await saveProjectToDb(currentProject, projectData.ownerId);
            }
          } catch (e) {}
        }
      );

      log(`Resumed render for chunk ${lambdaState.chunkIndex} complete: ${outputUrl}`);

      const currentProject = await getProjectFromDb(projectId);
      if (currentProject) {
        const completedChunks = ((currentProject.progress as any).completedChunkResults || []) as ChunkResult[];
        completedChunks.push({
          chunkIndex: lambdaState.chunkIndex,
          s3Url: outputUrl,
          localPath: '',
          success: true,
        });

        const totalChunks = (currentProject.progress as any).renderStatus?.totalChunks || 0;
        const allComplete = completedChunks.length >= totalChunks && totalChunks > 0;

        if (allComplete) {
          log(`All ${totalChunks} chunks done after resume. Finishing render...`);
          (currentProject.progress as any).completedChunkResults = completedChunks;
          (currentProject.progress as any).lambdaChunkState = null;
          await saveProjectToDb(currentProject, projectData.ownerId);
          await finishChunkedRender(projectData, completedChunks, totalChunks);
        } else {
          log(`Chunk ${lambdaState.chunkIndex} done, ${completedChunks.length}/${totalChunks}. Requeueing for next chunk...`);
          (currentProject.progress as any).completedChunkResults = completedChunks;
          (currentProject.progress as any).lambdaChunkState = null;
          currentProject.status = 'render_queued';
          await saveProjectToDb(currentProject, projectData.ownerId);
        }
      }
    } catch (error: any) {
      logError(`Resumed Lambda monitoring failed for ${projectId}: ${error.message}`);
      try {
        const currentProject = await getProjectFromDb(projectId);
        if (currentProject) {
          (currentProject.progress as any).lambdaChunkState = null;
          currentProject.status = 'render_queued';
          await saveProjectToDb(currentProject, projectData.ownerId);
        }
      } catch (e) {}
    }
  })();
}

async function processProject(projectData: VideoProjectWithMeta) {
  const projectId = projectData.id;
  currentProjectId = projectId;

  log(`Processing project: ${projectId} (${projectData.title})`);

  try {
    await db.update(universalVideoProjects)
      .set({
        status: 'generating',
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, projectId));

    universalVideoService.clearNotifications();

    const onProgress = async (p: any) => {
      try {
        await saveProjectToDb(p, projectData.ownerId);
      } catch (err: any) {
        log(`Progress save warning for ${projectId}: ${err.message}`);
      }
    };

    const skipMusic = projectData.assets?.music?.url ? true : false;

    const updatedProject = await universalVideoService.generateProjectAssets(
      projectData,
      { skipMusic, onProgress }
    );

    await saveProjectToDb(updatedProject, projectData.ownerId);

    if (sceneAnalysisService.isAvailable()) {
      log(`Triggering scene analysis for ${projectId}`);
      try {
        const freshProject = await getProjectFromDb(projectId);
        if (freshProject && freshProject.scenes) {
          for (let i = 0; i < freshProject.scenes.length; i++) {
            const scene = freshProject.scenes[i] as any;
            const imageUrl = scene.assets?.imageUrl || scene.background?.mediaUrl;
            if (imageUrl) {
              try {
                const analysis = await sceneAnalysisService.analyzeScene(imageUrl, scene);
                if (analysis) {
                  (freshProject.scenes[i] as any).analysis = analysis;
                }
              } catch (analysisErr: any) {
                log(`Scene analysis failed for scene ${i}: ${analysisErr.message}`);
              }
            }
          }
          await saveProjectToDb(freshProject, projectData.ownerId);
        }
      } catch (analysisErr: any) {
        log(`Scene analysis error for ${projectId}: ${analysisErr.message}`);
      }
    }

    log(`Completed project: ${projectId}`);
  } catch (error: any) {
    logError(`Error processing project ${projectId}:`, error.message);

    try {
      const failedProject = await getProjectFromDb(projectId);
      if (failedProject) {
        failedProject.status = 'error';
        if (failedProject.progress) {
          failedProject.progress.errors = failedProject.progress.errors || [];
          failedProject.progress.errors.push(`Worker error: ${error.message}`);
        }
        await saveProjectToDb(failedProject, projectData.ownerId);
      }
    } catch (dbErr: any) {
      logError(`Failed to save error status for ${projectId}:`, dbErr.message);
    }
  } finally {
    currentProjectId = null;
  }
}

async function processChunkedRender(projectData: VideoProjectWithMeta) {
  const projectId = projectData.id;
  currentProjectId = projectId;

  log(`=== CHUNKED RENDER STARTED (worker process) ===`);
  log(`Project: ${projectId} (${projectData.title})`);

  const progress = projectData.progress as any;
  const inputProps = progress?.renderInputProps;
  const compositionId = progress?.renderCompositionId;
  const startTime = Date.now();

  const previouslyCompletedChunks = (progress?.completedChunkResults || []) as ChunkResult[];
  if (previouslyCompletedChunks.length > 0) {
    log(`Resuming with ${previouslyCompletedChunks.length} previously completed chunk(s)`);
  }

  if (!inputProps || !compositionId) {
    logError(`Missing render input props or compositionId for ${projectId}`);
    try {
      const project = await getProjectFromDb(projectId);
      if (project) {
        project.status = 'error';
        project.progress.steps.rendering = project.progress.steps.rendering || {};
        project.progress.steps.rendering.status = 'error';
        project.progress.steps.rendering.message = 'Missing render configuration. Please re-initiate render.';
        project.progress.errors = project.progress.errors || [];
        project.progress.errors.push('Worker: Missing renderInputProps or renderCompositionId');
        (project.progress as any).renderStatus = {
          phase: 'error',
          totalChunks: (project.progress as any).renderStatus?.totalChunks || 0,
          completedChunks: 0,
          percent: 0,
          message: 'Missing render configuration. Please re-initiate render.',
          startedAt: startTime,
          lastUpdateAt: Date.now(),
          elapsedMs: 0,
          error: 'Missing renderInputProps or renderCompositionId',
        };
        await saveProjectToDb(project, projectData.ownerId);
      }
    } catch (e: any) {
      logError(`Failed to save error for missing props: ${e.message}`);
    }
    currentProjectId = null;
    return;
  }

  let lastKnownTotalChunks = (progress?.renderStatus?.totalChunks as number) || 0;

  try {
    const currentProjForMethod = await getProjectFromDb(projectId);
    if (currentProjForMethod) {
      (currentProjForMethod.progress as any).renderMethod = 'chunked';
      await saveProjectToDb(currentProjForMethod, projectData.ownerId);
    }
    await db.update(universalVideoProjects)
      .set({
        status: 'lambda_pending',
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, projectId));

    const progressCallback = async (renderProgress: ChunkedRenderProgress) => {
      if (renderProgress.totalChunks > 0) {
        lastKnownTotalChunks = renderProgress.totalChunks;
      }
      log(`Chunked progress: ${renderProgress.phase} - ${renderProgress.overallPercent}% - ${renderProgress.message}`);
      try {
        const currentProject = await getProjectFromDb(projectId);
        if (currentProject) {
          const prevPercent = (currentProject.progress as any).renderStatus?.percent || 0;
          const newPercent = Math.max(renderProgress.overallPercent, prevPercent);
          currentProject.progress.steps.rendering.progress = newPercent;
          currentProject.progress.steps.rendering.message = renderProgress.message;
          currentProject.progress.overallPercent = 85 + Math.round(newPercent * 0.15);

          const elapsedMs = Date.now() - startTime;
          (currentProject.progress as any).renderStatus = {
            phase: renderProgress.phase,
            totalChunks: renderProgress.totalChunks,
            completedChunks: renderProgress.completedChunks,
            currentChunk: renderProgress.currentChunk,
            percent: newPercent,
            message: renderProgress.message,
            startedAt: startTime,
            lastUpdateAt: Date.now(),
            elapsedMs,
            error: renderProgress.error || null,
          };

          if (renderProgress.phase === 'error') {
            currentProject.status = 'error';
            currentProject.progress.steps.rendering.status = 'error';
          }
          await saveProjectToDb(currentProject, projectData.ownerId);
        }
      } catch (e) {
        log(`Failed to save render progress update: ${e}`);
      }
    };

    const onChunkLambdaStarted = async (state: LambdaChunkState) => {
      log(`Lambda render started for chunk ${state.chunkIndex}: renderId=${state.renderId}`);
      try {
        const currentProject = await getProjectFromDb(projectId);
        if (currentProject) {
          (currentProject.progress as any).lambdaChunkState = state;
          currentProject.status = 'lambda_pending';
          await saveProjectToDb(currentProject, projectData.ownerId);
          await db.update(universalVideoProjects)
            .set({
              renderId: state.renderId,
              bucketName: state.bucketName,
              updatedAt: new Date(),
            })
            .where(eq(universalVideoProjects.projectId, projectId));
        }
      } catch (e: any) {
        log(`Failed to save Lambda chunk state: ${e.message}`);
      }
    };

    const onChunkComplete = async (chunkResult: ChunkResult) => {
      log(`Chunk ${chunkResult.chunkIndex} complete, saving to DB`);
      try {
        const currentProject = await getProjectFromDb(projectId);
        if (currentProject) {
          const completed = ((currentProject.progress as any).completedChunkResults || []) as ChunkResult[];
          completed.push(chunkResult);
          (currentProject.progress as any).completedChunkResults = completed;
          (currentProject.progress as any).lambdaChunkState = null;
          await saveProjectToDb(currentProject, projectData.ownerId);
        }
      } catch (e: any) {
        log(`Failed to save chunk completion: ${e.message}`);
      }
    };

    const outputUrl = await chunkedRenderService.renderLongVideo(
      projectId,
      inputProps,
      compositionId,
      progressCallback,
      onChunkLambdaStarted,
      onChunkComplete
    );

    const elapsedMs = Date.now() - startTime;
    log(`=== CHUNKED RENDER COMPLETE ===`);
    log(`Project: ${projectId}, Time: ${(elapsedMs / 1000).toFixed(1)}s, Output: ${outputUrl}`);

    const latestProject = await getProjectFromDb(projectId);
    if (latestProject) {
      latestProject.status = 'complete';
      latestProject.progress.steps.rendering.status = 'complete';
      latestProject.progress.steps.rendering.progress = 100;
      latestProject.progress.steps.rendering.message = 'Video rendering complete!';
      latestProject.progress.overallPercent = 100;
      latestProject.outputUrl = outputUrl;

      (latestProject.progress as any).renderStatus = {
        phase: 'complete',
        totalChunks: lastKnownTotalChunks,
        completedChunks: lastKnownTotalChunks,
        percent: 100,
        message: 'Video rendering complete!',
        startedAt: startTime,
        lastUpdateAt: Date.now(),
        elapsedMs: elapsedMs,
        error: null,
      };

      (latestProject.progress as any).lambdaChunkState = null;
      (latestProject.progress as any).completedChunkResults = null;
      delete (latestProject.progress as any).renderInputProps;

      await saveProjectToDb(latestProject, projectData.ownerId, 'chunked', 'chunked', outputUrl);
      log(`Final state saved to DB with output URL`);
    } else {
      logError(`CRITICAL: Could not reload project ${projectId} from DB after render`);
    }
  } catch (error: any) {
    const elapsedMs = Date.now() - (progress?.renderStartedAt || Date.now());
    logError(`=== CHUNKED RENDER FAILED ===`);
    logError(`Project: ${projectId}, Time: ${(elapsedMs / 1000).toFixed(1)}s`);
    logError(`Error: ${error.message}`);

    try {
      const latestProject = await getProjectFromDb(projectId);
      if (latestProject) {
        latestProject.status = 'error';
        latestProject.progress.steps.rendering = latestProject.progress.steps.rendering || {};
        latestProject.progress.steps.rendering.status = 'error';
        latestProject.progress.steps.rendering.message = error.message || 'Chunked render failed';
        latestProject.progress.errors = latestProject.progress.errors || [];
        latestProject.progress.errors.push(`Chunked render failed: ${error.message}`);
        latestProject.progress.serviceFailures = latestProject.progress.serviceFailures || [];
        latestProject.progress.serviceFailures.push({
          service: 'chunked-render',
          timestamp: new Date().toISOString(),
          error: error.message || 'Unknown error',
        });

        const prevRenderStatus = (latestProject.progress as any).renderStatus;
        (latestProject.progress as any).renderStatus = {
          phase: 'error',
          totalChunks: lastKnownTotalChunks || prevRenderStatus?.totalChunks || 0,
          completedChunks: prevRenderStatus?.completedChunks || 0,
          percent: prevRenderStatus?.percent || 0,
          message: error.message || 'Chunked render failed',
          startedAt: prevRenderStatus?.startedAt || startTime,
          lastUpdateAt: Date.now(),
          elapsedMs: Date.now() - startTime,
          error: error.message || 'Unknown error',
        };

        (latestProject.progress as any).lambdaChunkState = null;
        delete (latestProject.progress as any).renderInputProps;

        await saveProjectToDb(latestProject, projectData.ownerId);
        log(`Error state persisted to DB`);
      }
    } catch (dbError: any) {
      logError(`CRITICAL: Failed to persist render error status: ${dbError.message}`);
    }
  } finally {
    currentProjectId = null;
  }
}

async function pollForJobs() {
  if (isProcessing) return;

  try {
    isProcessing = true;

    const renderJobs = await db.select()
      .from(universalVideoProjects)
      .where(eq(universalVideoProjects.status, 'render_queued'))
      .orderBy(universalVideoProjects.createdAt)
      .limit(1);

    if (renderJobs.length > 0) {
      const job = renderJobs[0];
      const projectData = dbRowToVideoProject(job);
      await processChunkedRender(projectData);
      return;
    }

    const generateJobs = await db.select()
      .from(universalVideoProjects)
      .where(eq(universalVideoProjects.status, 'queued'))
      .orderBy(universalVideoProjects.createdAt)
      .limit(1);

    if (generateJobs.length === 0) return;

    const job = generateJobs[0];
    const projectData = dbRowToVideoProject(job);
    await processProject(projectData);
  } catch (error: any) {
    logError('Poll error:', error.message);
  } finally {
    isProcessing = false;
  }
}

export async function startVideoWorkerLoop() {
  log('Starting video worker loop...');
  log(`Poll interval: ${POLL_INTERVAL_MS}ms, Stall threshold: ${STALL_THRESHOLD_MS / 1000}s, Render stall: ${RENDER_STALL_THRESHOLD_MS / 1000}s`);
  log('Chunked render support: ENABLED (render_queued + lambda_pending jobs)');

  await startupRecovery();

  await recoverStalledProjects();

  setInterval(pollForJobs, POLL_INTERVAL_MS);
  log('Job polling started - waiting for queued/render_queued projects...');

  setInterval(recoverStalledProjects, 30000);
  log('Stall recovery check scheduled (every 30s)');

  if (process.send) {
    process.send('ready');
  }
}

const isForkedProcess = !!process.send;
const isDirectRun = (() => {
  try {
    const mainModule = process.argv[1];
    const thisFile = new URL(import.meta.url).pathname;
    return mainModule && thisFile.endsWith(mainModule.replace(/.*\//, '')) && !isForkedProcess;
  } catch {
    return false;
  }
})();

if (isForkedProcess || isDirectRun) {
  process.on('SIGINT', () => {
    log('Received SIGINT, shutting down...');
    if (currentProjectId) {
      log(`Warning: Project ${currentProjectId} was in progress (Lambda renders will continue on AWS)`);
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down...');
    if (currentProjectId) {
      log(`Warning: Project ${currentProjectId} was in progress (Lambda renders will continue on AWS)`);
    }
    process.exit(0);
  });

  startVideoWorkerLoop().catch((err) => {
    logError('Failed to start worker:', err);
    process.exit(1);
  });
}
