import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { isAuthenticated } from '../auth';
import { db } from '../db';
import { assetLibrary, videoGenerationJobs } from '../../shared/schema';
import { eq, desc, and, or, ilike, sql } from 'drizzle-orm';
import { aiVideoService } from './ai-video-service';
import { imageGenerationService } from './image-generation-service';

const router = Router();

router.use(isAuthenticated);

function getUserId(req: Request): string | null {
  return (req.user as any)?.id || null;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { type, favorite, search } = req.query;

    const conditions = [eq(assetLibrary.createdBy, userId)];

    if (type && typeof type === 'string') {
      conditions.push(eq(assetLibrary.assetType, type));
    }

    if (favorite === 'true') {
      conditions.push(eq(assetLibrary.isFavorite, true));
    }

    if (search && typeof search === 'string') {
      conditions.push(
        or(
          ilike(assetLibrary.prompt, `%${search}%`),
          ilike(assetLibrary.contentType, `%${search}%`)
        )!
      );
    }

    const items = await db
      .select()
      .from(assetLibrary)
      .where(and(...conditions))
      .orderBy(desc(assetLibrary.createdAt));

    res.json(items);
  } catch (error: any) {
    console.error('[AssetLibrary] List error:', error.message);
    res.status(500).json({ error: 'Failed to fetch asset library' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { mode, prompt, provider, aspectRatio, duration, referenceImageUrl, style } = req.body;

    if (!prompt || !mode) {
      return res.status(400).json({ error: 'prompt and mode are required' });
    }

    const validModes = ['t2i', 't2v', 'i2v'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ error: `Invalid mode. Must be one of: ${validModes.join(', ')}` });
    }

    if (mode === 'i2v' && !referenceImageUrl) {
      return res.status(400).json({ error: 'referenceImageUrl is required for I2V mode' });
    }

    const jobId = crypto.randomUUID();
    const isImage = mode === 't2i';
    const projectId = `asset-lib-${jobId.slice(0, 8)}`;

    await db.insert(videoGenerationJobs).values({
      jobId,
      projectId,
      sceneId: 'asset-library',
      provider: provider || 'auto',
      status: 'pending',
      prompt: prompt,
      duration: isImage ? undefined : (duration || 6),
      aspectRatio: aspectRatio || '16:9',
      style: isImage ? (style || 'Photorealistic') : undefined,
      sourceImageUrl: referenceImageUrl || undefined,
      sceneType: isImage ? 'image' : 'video',
      i2vSettings: { saveToLibrary: true, outputType: isImage ? 'image' : 'video', assetLibraryMode: mode },
      triggeredBy: userId,
    });

    processAssetLibraryJob(jobId, userId, mode).catch((err) => {
      console.error(`[AssetLibrary] Background job ${jobId} failed:`, err.message);
    });

    console.log(`[AssetLibrary] Generation job created: ${jobId} (mode: ${mode}, provider: ${provider || 'auto'})`);

    res.json({ jobId, status: 'pending', mode });
  } catch (error: any) {
    console.error('[AssetLibrary] Generate error:', error.message);
    res.status(500).json({ error: 'Failed to start asset generation' });
  }
});

router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const jobs = await db
      .select()
      .from(videoGenerationJobs)
      .where(
        and(
          eq(videoGenerationJobs.sceneId, 'asset-library'),
          eq(videoGenerationJobs.triggeredBy, userId)
        )
      )
      .orderBy(desc(videoGenerationJobs.createdAt))
      .limit(20);

    res.json(jobs);
  } catch (error: any) {
    console.error('[AssetLibrary] Jobs list error:', error.message);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { jobId } = req.params;

    const [job] = await db
      .select()
      .from(videoGenerationJobs)
      .where(
        and(
          eq(videoGenerationJobs.jobId, jobId),
          eq(videoGenerationJobs.triggeredBy, userId)
        )
      )
      .limit(1);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error: any) {
    console.error('[AssetLibrary] Job status error:', error.message);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const [deleted] = await db
      .delete(assetLibrary)
      .where(and(eq(assetLibrary.id, id), eq(assetLibrary.createdBy, userId)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[AssetLibrary] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

router.post('/:id/favorite', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const [existing] = await db
      .select({ isFavorite: assetLibrary.isFavorite })
      .from(assetLibrary)
      .where(and(eq(assetLibrary.id, id), eq(assetLibrary.createdBy, userId)));

    if (!existing) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const [updated] = await db
      .update(assetLibrary)
      .set({
        isFavorite: !existing.isFavorite,
        updatedAt: new Date(),
      })
      .where(and(eq(assetLibrary.id, id), eq(assetLibrary.createdBy, userId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('[AssetLibrary] Favorite error:', error.message);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

router.post('/:id/use', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const [updated] = await db
      .update(assetLibrary)
      .set({
        useCount: sql`${assetLibrary.useCount} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(assetLibrary.id, id), eq(assetLibrary.createdBy, userId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[AssetLibrary] Use error:', error.message);
    res.status(500).json({ error: 'Failed to increment use count' });
  }
});

async function processAssetLibraryJob(jobId: string, userId: string, mode: string) {
  console.log(`[AssetLibrary] Processing job ${jobId} (mode: ${mode})`);

  const [job] = await db
    .select()
    .from(videoGenerationJobs)
    .where(eq(videoGenerationJobs.jobId, jobId))
    .limit(1);

  if (!job) {
    console.error(`[AssetLibrary] Job ${jobId} not found`);
    return;
  }

  try {
    await db
      .update(videoGenerationJobs)
      .set({ status: 'processing', startedAt: new Date(), updatedAt: new Date() })
      .where(eq(videoGenerationJobs.jobId, jobId));

    if (mode === 't2i') {
      const arMap: Record<string, { w: number; h: number }> = {
        '16:9': { w: 1280, h: 720 },
        '9:16': { w: 720, h: 1280 },
        '1:1': { w: 1024, h: 1024 },
        '4:3': { w: 1024, h: 768 },
      };
      const dims = arMap[job.aspectRatio || '16:9'] || arMap['16:9'];

      const imageResult = await imageGenerationService.generateImage({
        prompt: job.prompt || '',
        width: dims.w,
        height: dims.h,
        style: (job.style as any) || 'Photorealistic',
        provider: job.provider !== 'auto' ? job.provider : undefined,
        aspectRatio: job.aspectRatio || '16:9',
      });

      if (imageResult.url) {
        await db
          .update(videoGenerationJobs)
          .set({
            status: 'completed',
            videoUrl: imageResult.url,
            progress: 100,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(videoGenerationJobs.jobId, jobId));

        await db.insert(assetLibrary).values({
          assetUrl: imageResult.url,
          thumbnailUrl: imageResult.url,
          assetType: 'image',
          provider: imageResult.provider || job.provider || 'auto',
          prompt: job.prompt || '',
          contentType: 't2i',
          width: imageResult.width || dims.w,
          height: imageResult.height || dims.h,
          tags: [],
          createdBy: userId,
        });

        console.log(`[AssetLibrary] T2I job ${jobId} completed. Image: ${imageResult.url?.substring(0, 80)}`);
      } else {
        throw new Error(imageResult.error || 'Image generation returned no URL');
      }
    } else {
      const result = await aiVideoService.generateVideo({
        prompt: job.prompt || '',
        duration: job.duration || 6,
        aspectRatio: (job.aspectRatio as '16:9' | '9:16' | '1:1') || '16:9',
        sceneType: job.sceneType || 'general',
        preferredProvider: job.provider || 'auto',
        negativePrompt: job.negativePrompt || undefined,
        imageUrl: job.sourceImageUrl || undefined,
      });

      if (result.success && result.videoUrl) {
        const finalUrl = result.s3Url || result.videoUrl;

        await db
          .update(videoGenerationJobs)
          .set({
            status: 'completed',
            videoUrl: finalUrl,
            progress: 100,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(videoGenerationJobs.jobId, jobId));

        await db.insert(assetLibrary).values({
          assetUrl: finalUrl,
          assetType: 'video',
          provider: result.provider || job.provider || 'auto',
          prompt: job.prompt || '',
          contentType: mode,
          duration: String(result.duration || job.duration || 6),
          width: result.width || undefined,
          height: result.height || undefined,
          qualityScore: result.qualityScore || undefined,
          tags: [],
          createdBy: userId,
        });

        console.log(`[AssetLibrary] ${mode.toUpperCase()} job ${jobId} completed. Video: ${finalUrl?.substring(0, 80)}`);
      } else {
        throw new Error(result.error || 'Video generation failed');
      }
    }
  } catch (error: any) {
    const errorMsg = error.message || 'Unexpected error';
    console.error(`[AssetLibrary] Job ${jobId} error:`, errorMsg);

    await db
      .update(videoGenerationJobs)
      .set({
        status: 'failed',
        errorMessage: errorMsg,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(videoGenerationJobs.jobId, jobId));
  }
}

export default router;
