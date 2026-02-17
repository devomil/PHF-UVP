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
  return {
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
    progress: row.progress || {},
    status: row.status,
    history: row.history || [],
    qualityReport: row.qualityReport,
    qualityTier: row.qualityTier,
    mediaMode: row.mediaMode,
    renderId: row.renderId,
    bucketName: row.bucketName,
    outputUrl: row.outputUrl,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
  } as VideoProject;
}

export async function saveProjectToDb(
  project: any,
  ownerId: string | number,
  renderId?: string,
  bucketName?: string
): Promise<void> {
  const projectId = project.projectId as string;
  const existing = await db.select({ id: universalVideoProjects.id })
    .from(universalVideoProjects)
    .where(eq(universalVideoProjects.projectId, projectId));

  const updateData: any = {
    status: project.status,
    progress: project.progress,
    updatedAt: new Date(),
  };
  if (renderId !== undefined) updateData.renderId = renderId;
  if (bucketName !== undefined) updateData.bucketName = bucketName;

  if (existing.length > 0) {
    await db.update(universalVideoProjects)
      .set(updateData)
      .where(eq(universalVideoProjects.projectId, projectId));
  } else {
    await (db.insert(universalVideoProjects) as any).values({
      projectId,
      ownerId: typeof ownerId === 'string' ? parseInt(ownerId) || 0 : ownerId,
      status: project.status,
      progress: project.progress,
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
