// Placeholder: stub for video project DB helpers
import type { VideoProject } from '../../shared/video-types';
import { db } from '../db';
import { universalVideoProjects } from '../../shared/schema';
import { eq } from 'drizzle-orm';

export type VideoProjectWithMeta = VideoProject & {
  renderId?: string;
  bucketName?: string;
  outputUrl?: string;
};

export function dbRowToVideoProject(row: any): VideoProject {
  const progress = row.progress || {};
  const result: any = {
    ...(row.projectData || {}),
    id: row.id,
    projectId: row.projectId,
    ownerId: row.ownerId,
    title: row.title,
    description: row.description,
    type: row.type,
    targetAudience: row.targetAudience,
    totalDuration: row.totalDuration,
    fps: row.fps,
    outputFormat: row.outputFormat,
    brand: row.brand || {},
    scenes: row.scenes || [],
    assets: row.assets || {},
    progress: progress,
    status: row.status,
    history: row.history || [],
    qualityReport: row.qualityReport,
    qualityTier: row.qualityTier,
    mediaMode: row.mediaMode,
    videoGenerationMode: row.videoGenerationMode,
    referenceImages: row.referenceImages || (row.assets as any)?.referenceImages || [],
    renderId: row.renderId,
    bucketName: row.bucketName,
    outputUrl: row.outputUrl,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
  };
  if (progress.voiceoverSettings) result.voiceoverSettings = progress.voiceoverSettings;
  if (progress.musicSettings) result.musicSettings = progress.musicSettings;
  if (progress.soundDesignSettings) result.soundDesignSettings = progress.soundDesignSettings;
  if (progress.filmTreatmentSettings) result.filmTreatmentSettings = progress.filmTreatmentSettings;
  if (progress.transitionSettings) result.transitionSettings = progress.transitionSettings;
  if (progress.introTemplate) result.introTemplate = progress.introTemplate;
  if (progress.outroTemplate) result.outroTemplate = progress.outroTemplate;
  if (progress.introBackgroundRandom !== undefined) result.introBackgroundRandom = progress.introBackgroundRandom;
  return result as VideoProject;
}

export async function saveProjectToDb(
  project: any,
  ownerId: string | number,
  renderId?: string,
  bucketName?: string,
  outputUrl?: string
): Promise<void> {
  const projectId = project.projectId as string;
  const existing = await db.select({ id: universalVideoProjects.id })
    .from(universalVideoProjects)
    .where(eq(universalVideoProjects.projectId, projectId));

  const progressToSave = { ...(project.progress || {}) };
  if (project.voiceoverSettings !== undefined) progressToSave.voiceoverSettings = project.voiceoverSettings;
  if (project.musicSettings !== undefined) progressToSave.musicSettings = project.musicSettings;
  if (project.soundDesignSettings !== undefined) progressToSave.soundDesignSettings = project.soundDesignSettings;
  if (project.filmTreatmentSettings !== undefined) progressToSave.filmTreatmentSettings = project.filmTreatmentSettings;
  if (project.transitionSettings !== undefined) progressToSave.transitionSettings = project.transitionSettings;
  if (project.introTemplate !== undefined) progressToSave.introTemplate = project.introTemplate;
  if (project.outroTemplate !== undefined) progressToSave.outroTemplate = project.outroTemplate;
  if (project.introBackgroundRandom !== undefined) progressToSave.introBackgroundRandom = project.introBackgroundRandom;

  const updateData: any = {
    status: project.status,
    progress: progressToSave,
    updatedAt: new Date(),
  };
  if (project.scenes !== undefined) updateData.scenes = project.scenes;
  if (project.assets !== undefined) {
    const assetsToSave = { ...project.assets };
    if (project.referenceImages && Array.isArray(project.referenceImages) && project.referenceImages.length > 0) {
      assetsToSave.referenceImages = project.referenceImages;
    }
    updateData.assets = assetsToSave;
  }
  if (project.totalDuration !== undefined) updateData.totalDuration = project.totalDuration;
  if (renderId !== undefined) updateData.renderId = renderId;
  if (bucketName !== undefined) updateData.bucketName = bucketName;
  if (outputUrl !== undefined) updateData.outputUrl = outputUrl;

  if (existing.length > 0) {
    await db.update(universalVideoProjects)
      .set(updateData)
      .where(eq(universalVideoProjects.projectId, projectId));
  } else {
    await (db.insert(universalVideoProjects) as any).values({
      projectId,
      ownerId: typeof ownerId === 'string' ? parseInt(ownerId) || 0 : ownerId,
      status: project.status,
      progress: progressToSave,
      title: project.title || 'Untitled',
      scenes: project.scenes || [],
      brand: project.brand || {},
      type: project.type || 'product',
    });
  }
}

export async function getProjectFromDb(projectId: string): Promise<VideoProject | null> {
  const rows = await db.select()
    .from(universalVideoProjects)
    .where(eq(universalVideoProjects.projectId, projectId));

  if (rows.length === 0) return null;
  return dbRowToVideoProject(rows[0]);
}
