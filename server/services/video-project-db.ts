// Placeholder: stub for video project DB helpers
import type { VideoProject } from '../../shared/video-types';
import { db } from '../db';
import { universalVideoProjects } from '../../shared/schema';
import { eq, sql, type SQL } from 'drizzle-orm';

export type VideoProjectWithMeta = VideoProject & {
  /** Always populated from the DB row — guaranteed non-null after load. */
  ownerId: string;
  projectId: string;
  renderId?: string;
  bucketName?: string;
  outputUrl?: string;
  qualityReport?: any;
};

export function dbRowToVideoProject(row: any): VideoProjectWithMeta {
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
    characters: row.characters || [],
    assets: row.assets || {},
    progress: progress,
    status: row.status,
    history: row.history || [],
    qualityReport: row.qualityReport,
    qualityTier: row.qualityTier,
    mediaMode: row.mediaMode,
    videoGenerationMode: row.videoGenerationMode,
    referenceImages: row.referenceImages || (row.assets as any)?.referenceImages || [],
    productVisualDescription: row.productVisualDescription || null,
    characterReferenceImageUrl: row.characterReferenceImageUrl || null,
    visualStyleRationale: row.visualStyleRationale || null,
    renderId: row.renderId,
    bucketName: row.bucketName,
    outputUrl: row.outputUrl,
    scriptStrategy: row.scriptStrategy || null,
    scriptNarrative: row.scriptNarrative || null,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
  };
  if (progress.voiceoverSettings) result.voiceoverSettings = progress.voiceoverSettings;
  if (progress.musicSettings) result.musicSettings = progress.musicSettings;
  if (progress.soundDesignSettings) result.soundDesignSettings = progress.soundDesignSettings;
  if (progress.filmTreatmentSettings) result.filmTreatmentSettings = progress.filmTreatmentSettings;
  if (progress.transitionSettings) result.transitionSettings = progress.transitionSettings;
  if (progress.introEnabled !== undefined) result.introEnabled = progress.introEnabled;
  if (progress.introTemplate) result.introTemplate = progress.introTemplate;
  if (progress.outroEnabled !== undefined) result.outroEnabled = progress.outroEnabled;
  if (progress.outroTemplate) result.outroTemplate = progress.outroTemplate;
  if (progress.introBackgroundRandom !== undefined) result.introBackgroundRandom = progress.introBackgroundRandom;
  if (progress.artPresetId !== undefined) result.artPresetId = progress.artPresetId;
  if (progress.captionSettings !== undefined) result.captionSettings = progress.captionSettings;
  if (progress.nativeVideoAudioSettings !== undefined) result.nativeVideoAudioSettings = progress.nativeVideoAudioSettings;
  if (progress.endCardSettings !== undefined) result.endCardSettings = progress.endCardSettings;
  if (progress.introCardSettings !== undefined) result.introCardSettings = progress.introCardSettings;
  if (progress.introBackgroundUrl !== undefined) result.introBackgroundUrl = progress.introBackgroundUrl;
  return result as VideoProjectWithMeta;
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
  if (project.introEnabled !== undefined) progressToSave.introEnabled = project.introEnabled;
  if (project.introTemplate !== undefined) progressToSave.introTemplate = project.introTemplate;
  if (project.outroEnabled !== undefined) progressToSave.outroEnabled = project.outroEnabled;
  if (project.outroTemplate !== undefined) progressToSave.outroTemplate = project.outroTemplate;
  if (project.introBackgroundRandom !== undefined) progressToSave.introBackgroundRandom = project.introBackgroundRandom;
  if (project.artPresetId !== undefined) progressToSave.artPresetId = project.artPresetId;
  if (project.captionSettings !== undefined) progressToSave.captionSettings = project.captionSettings;
  if (project.nativeVideoAudioSettings !== undefined) progressToSave.nativeVideoAudioSettings = project.nativeVideoAudioSettings;
  if (project.endCardSettings !== undefined) progressToSave.endCardSettings = project.endCardSettings;
  if (project.introCardSettings !== undefined) progressToSave.introCardSettings = project.introCardSettings;
  if (project.introBackgroundUrl !== undefined) progressToSave.introBackgroundUrl = project.introBackgroundUrl;

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
  if (project.totalDuration !== undefined) updateData.totalDuration = Math.round(project.totalDuration);
  if (renderId !== undefined) updateData.renderId = renderId;
  if (bucketName !== undefined) updateData.bucketName = bucketName;
  if (outputUrl !== undefined) updateData.outputUrl = outputUrl;
  if (project.preferredVideoProvider !== undefined) updateData.preferredVideoProvider = project.preferredVideoProvider;
  if (project.seamlessTransitions !== undefined) updateData.seamlessTransitions = project.seamlessTransitions;
  if (project.productVisualDescription !== undefined) updateData.productVisualDescription = project.productVisualDescription;
  if (project.characterReferenceImageUrl !== undefined) updateData.characterReferenceImageUrl = project.characterReferenceImageUrl;
  if (project.visualStyleRationale !== undefined) updateData.visualStyleRationale = project.visualStyleRationale;

  if (existing.length > 0) {
    await db.update(universalVideoProjects)
      .set(updateData)
      .where(eq(universalVideoProjects.projectId, projectId));
  } else {
    await (db.insert(universalVideoProjects) as any).values({
      projectId,
      ownerId: String(ownerId),
      status: project.status,
      progress: progressToSave,
      title: project.title || 'Untitled',
      scenes: project.scenes || [],
      brand: project.brand || {},
      type: project.type || 'product',
      preferredVideoProvider: project.preferredVideoProvider,
      seamlessTransitions: project.seamlessTransitions,
      productVisualDescription: project.productVisualDescription,
      characterReferenceImageUrl: project.characterReferenceImageUrl,
    });
  }
}

export async function getProjectFromDb(projectId: string | string[]): Promise<VideoProjectWithMeta | null> {
  const id = Array.isArray(projectId) ? projectId[0] : projectId;
  const rows = await db.select()
    .from(universalVideoProjects)
    .where(eq(universalVideoProjects.projectId, id));

  if (rows.length === 0) return null;
  return dbRowToVideoProject(rows[0]);
}

// Atomic per-scene patch (Task #108). Merges the patch into the matching
// scene via jsonb_agg over the row's current value in a single UPDATE, so
// concurrent writers targeting different scenes can't lose each other's data.
export async function patchSceneAtomic(
  projectId: string,
  sceneId: string,
  patch: Record<string, unknown>,
): Promise<number> {
  const patchJson = JSON.stringify(patch);
  const result = await db.execute(sql`
    UPDATE universal_video_projects
    SET scenes = COALESCE(
          (SELECT jsonb_agg(
             CASE WHEN s->>'id' = ${sceneId}
                  THEN s || ${patchJson}::jsonb
                  ELSE s
             END
           )
           FROM jsonb_array_elements(scenes) AS s),
          scenes
        ),
        updated_at = NOW()
    WHERE project_id = ${projectId}
  `) as { rowCount?: number };
  return typeof result.rowCount === 'number' ? result.rowCount : 0;
}

// Atomic single-microScene imageUrl write. CASE guards out-of-bounds.
export async function updateMicroSceneImageUrl(
  projectId: string,
  sceneId: string,
  msIdx: number,
  imageUrl: string,
): Promise<boolean> {
  if (msIdx < 0) return false;

  const path = `{microScenes,${msIdx},imageUrl}`;
  const result = await db.execute(sql`
    UPDATE universal_video_projects
    SET scenes = COALESCE(
          (SELECT jsonb_agg(
             CASE
               WHEN s->>'id' = ${sceneId}
                    AND jsonb_typeof(s->'microScenes') = 'array'
                    AND jsonb_array_length(s->'microScenes') > ${msIdx}
               THEN jsonb_set(s, ${path}::text[], to_jsonb(${imageUrl}::text))
               ELSE s
             END
           )
           FROM jsonb_array_elements(scenes) AS s),
          scenes
        ),
        updated_at = NOW()
    WHERE project_id = ${projectId}
  `) as { rowCount?: number };
  return (result.rowCount ?? 0) > 0;
}

// Atomic batch microScene imageUrl writes — chains jsonb_set calls inside a
// single UPDATE. The outer length guard against the largest msIdx makes
// out-of-range indices a no-op rather than appending phantom array elements.
export async function batchUpdateMicroSceneImageUrls(
  projectId: string,
  sceneId: string,
  updates: Array<{ msIdx: number; imageUrl: string }>,
): Promise<boolean> {
  if (updates.length === 0) return true;

  let sceneExpr: SQL = sql`s`;
  for (const { msIdx, imageUrl } of updates) {
    if (msIdx < 0) continue;
    const path = `{microScenes,${msIdx},imageUrl}`;
    sceneExpr = sql`jsonb_set(${sceneExpr}, ${path}::text[], to_jsonb(${imageUrl}::text))`;
  }

  const maxIdx = updates.reduce((m, u) => (u.msIdx > m ? u.msIdx : m), -1);

  const result = await db.execute(sql`
    UPDATE universal_video_projects
    SET scenes = COALESCE(
          (SELECT jsonb_agg(
             CASE WHEN s->>'id' = ${sceneId}
                       AND jsonb_typeof(s->'microScenes') = 'array'
                       AND jsonb_array_length(s->'microScenes') > ${maxIdx}
                  THEN ${sceneExpr}
                  ELSE s
             END
           )
           FROM jsonb_array_elements(scenes) AS s),
          scenes
        ),
        updated_at = NOW()
    WHERE project_id = ${projectId}
  `) as { rowCount?: number };
  return (result.rowCount ?? 0) > 0;
}

export async function mergeRenderSettingsToDb(
  projectId: string,
  progressPatch: Record<string, any>,
  assetsPatch?: Record<string, any>,
): Promise<boolean> {
  const updateData: any = {
    updatedAt: new Date(),
  };

  if (Object.keys(progressPatch).length > 0) {
    updateData.progress = sql`COALESCE(${universalVideoProjects.progress}, '{}'::jsonb) || ${JSON.stringify(progressPatch)}::jsonb`;
  }

  if (assetsPatch && Object.keys(assetsPatch).length > 0) {
    updateData.assets = sql`COALESCE(${universalVideoProjects.assets}, '{}'::jsonb) || ${JSON.stringify(assetsPatch)}::jsonb`;
  }

  await db.update(universalVideoProjects)
    .set(updateData)
    .where(eq(universalVideoProjects.projectId, projectId));

  return true;
}
