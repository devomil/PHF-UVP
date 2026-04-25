import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { isAuthenticated } from '../auth';
import { db } from '../db';
import { assetLibrary, videoGenerationJobs } from '../../shared/schema';
import { eq, desc, and, or, ilike, sql } from 'drizzle-orm';
import { aiVideoService } from './ai-video-service';
import { imageGenerationService } from './image-generation-service';
import { piapiVideoService } from './piapi-video-service';
import { runwayVideoService } from './runway-video-service';
import { qubicToolkitService } from './qubic-toolkit-service';
import { assetUrlResolver } from './asset-url-resolver';

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

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const [entry] = await db.select().from(assetLibrary)
      .where(and(eq(assetLibrary.id, id), eq(assetLibrary.createdBy, userId)));
    if (!entry) return res.status(404).json({ error: 'Asset not found' });

    await db.delete(assetLibrary).where(eq(assetLibrary.id, id));
    console.log(`[AssetLibrary] Deleted asset (id: ${id})`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[AssetLibrary] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

const ALL_MODES = [
  't2i', 't2v', 'i2v', 'i2i', 'v2v',
  'upscale-image', 'upscale-video', 'bg-remove-image', 'bg-remove-video',
  'character-performance',
];

const IMAGE_OUTPUT_MODES = ['t2i', 'i2i', 'upscale-image', 'bg-remove-image'];
const NEEDS_REF_IMAGE = ['i2v', 'i2i', 'upscale-image', 'bg-remove-image', 'character-performance'];
const NEEDS_REF_VIDEO = ['v2v', 'upscale-video', 'bg-remove-video', 'character-performance'];

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const {
      mode, prompt, provider, aspectRatio, duration,
      referenceImageUrl, referenceVideoUrl, style,
      strength, useCase, scaleFactor, bodyControl,
      negativePrompt, imageFidelity,
      outputFormat, i2iAspectRatio, resolution, safetyLevel,
      additionalImageUrls,
    } = req.body;

    if (!mode) {
      return res.status(400).json({ error: 'mode is required' });
    }

    if (!ALL_MODES.includes(mode)) {
      return res.status(400).json({ error: `Invalid mode. Must be one of: ${ALL_MODES.join(', ')}` });
    }

    const promptOptionalModes = ['upscale-image', 'upscale-video', 'bg-remove-image', 'bg-remove-video', 'character-performance'];
    const needsPrompt = !promptOptionalModes.includes(mode);
    if (needsPrompt && !prompt) {
      return res.status(400).json({ error: 'prompt is required for this mode' });
    }

    if (NEEDS_REF_IMAGE.includes(mode) && !referenceImageUrl) {
      return res.status(400).json({ error: 'referenceImageUrl is required for this mode' });
    }

    if (NEEDS_REF_VIDEO.includes(mode) && !referenceVideoUrl) {
      return res.status(400).json({ error: 'referenceVideoUrl is required for this mode' });
    }

    if (mode === 'v2v' && provider?.startsWith('runway') && !referenceVideoUrl) {
      return res.status(400).json({ error: 'referenceVideoUrl is required for Runway V2V' });
    }

    if (mode === 'v2v' && !provider?.startsWith('runway') && !referenceImageUrl) {
      return res.status(400).json({ error: 'referenceImageUrl (replacement image) is required for Kling V2V' });
    }

    const jobId = crypto.randomUUID();
    const outputsImage = IMAGE_OUTPUT_MODES.includes(mode);
    const projectId = `asset-lib-${jobId.slice(0, 8)}`;

    await db.insert(videoGenerationJobs).values({
      jobId,
      projectId,
      sceneId: 'asset-library',
      provider: provider || 'auto',
      status: 'pending',
      prompt: prompt || `${mode} processing`,
      negativePrompt: negativePrompt || undefined,
      duration: outputsImage ? undefined : (duration || 6),
      aspectRatio: aspectRatio || '16:9',
      style: (mode === 't2i') ? (style || 'Photorealistic') : undefined,
      sourceImageUrl: referenceImageUrl || undefined,
      sceneType: outputsImage ? 'image' : 'video',
      i2vSettings: {
        saveToLibrary: true,
        outputType: outputsImage ? 'image' : 'video',
        assetLibraryMode: mode,
        strength: strength,
        useCase: useCase,
        referenceVideoUrl: referenceVideoUrl || undefined,
        replacementImageUrl: mode === 'v2v' ? referenceImageUrl : undefined,
        scaleFactor: scaleFactor,
        bodyControl: bodyControl,
        imageControlStrength: imageFidelity !== undefined ? imageFidelity : undefined,
        outputFormat: outputFormat,
        i2iAspectRatio: i2iAspectRatio,
        resolution: resolution,
        safetyLevel: safetyLevel,
        additionalImageUrls: additionalImageUrls,
      },
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


router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const { prompt } = req.body;
    if (prompt === undefined || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt field is required and must be a string' });
    }

    const [entry] = await db.select().from(assetLibrary)
      .where(and(eq(assetLibrary.id, id), eq(assetLibrary.createdBy, userId)));
    if (!entry) return res.status(404).json({ error: 'Asset not found' });

    const [updated] = await db
      .update(assetLibrary)
      .set({
        prompt,
        updatedAt: new Date(),
      })
      .where(and(eq(assetLibrary.id, id), eq(assetLibrary.createdBy, userId)))
      .returning();

    console.log(`[AssetLibrary] Updated asset (id: ${id}) prompt`);
    res.json(updated);
  } catch (error: any) {
    console.error('[AssetLibrary] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update asset' });
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

router.post('/save-url', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const {
      assetUrl,
      assetType,
      thumbnailUrl,
      provider,
      prompt,
      contentType,
      projectId,
      sceneId,
      width,
      height,
      duration,
      tags,
      visualDirection,
    } = req.body;

    if (!assetUrl || typeof assetUrl !== 'string') {
      return res.status(400).json({ error: 'assetUrl is required' });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(assetUrl);
    } catch {
      return res.status(400).json({ error: 'assetUrl must be a valid absolute URL' });
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return res.status(400).json({ error: 'assetUrl must use http(s) protocol' });
    }
    const host = parsedUrl.hostname.toLowerCase();
    const isInternalHost =
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '127.0.0.1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host);
    if (isInternalHost) {
      return res.status(400).json({ error: 'assetUrl must point to a public host' });
    }
    if (thumbnailUrl && typeof thumbnailUrl === 'string') {
      const isDataUrl = thumbnailUrl.startsWith('data:image/');
      if (!isDataUrl) {
        try {
          const tUrl = new URL(thumbnailUrl);
          if (tUrl.protocol !== 'https:' && tUrl.protocol !== 'http:') {
            return res.status(400).json({ error: 'thumbnailUrl must use http(s) protocol or be a data:image URL' });
          }
        } catch {
          return res.status(400).json({ error: 'thumbnailUrl must be a valid absolute URL or data:image URL when provided' });
        }
      } else if (thumbnailUrl.length > 1_500_000) {
        return res.status(400).json({ error: 'thumbnailUrl data URL too large (max ~1.5MB)' });
      }
    }

    const type = (assetType || 'image').toString();
    if (!['image', 'video'].includes(type)) {
      return res.status(400).json({ error: 'assetType must be "image" or "video"' });
    }

    const [inserted] = await db.insert(assetLibrary).values({
      assetUrl,
      thumbnailUrl: thumbnailUrl || (type === 'image' ? assetUrl : undefined),
      assetType: type,
      provider: provider || 'project-export',
      prompt: prompt || (visualDirection ? visualDirection.slice(0, 500) : 'Saved from project'),
      visualDirection: visualDirection || undefined,
      contentType: contentType || 'scene-export',
      projectId: projectId || undefined,
      sceneId: sceneId || undefined,
      width: typeof width === 'number' ? width : undefined,
      height: typeof height === 'number' ? height : undefined,
      duration: typeof duration === 'number' ? String(duration) : undefined,
      tags: Array.isArray(tags) ? tags : ['saved-from-project'],
      createdBy: userId,
    }).returning();

    console.log(`[AssetLibrary] Saved URL to library (id: ${inserted.id}, type: ${type})`);
    res.json({ success: true, asset: inserted });
  } catch (error: any) {
    console.error('[AssetLibrary] Save URL error:', error.message);
    res.status(500).json({ error: 'Failed to save asset to library' });
  }
});

function isInternalHostname(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '127.0.0.1' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^127\./.test(h) ||
    /^0\./.test(h)
  );
}

function validatePublicHttpUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: 'url must be a valid absolute URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'url must use http(s) protocol' };
  }
  if (isInternalHostname(parsed.hostname)) {
    return { ok: false, error: 'url must point to a public host' };
  }
  return { ok: true, url: parsed };
}

// Server-side proxy that streams a remote asset back with
// Content-Disposition: attachment so the browser shows a Save dialog.
// Bypasses cross-origin CORS issues that prevent client-side blob downloads.
//
// SSRF protections:
//   - host is validated as public on every hop (initial + every redirect)
//   - redirects are followed manually (max 5) so each Location is re-validated
//   - request times out after 30s, max payload 1GB
router.get('/download', async (req: Request, res: Response) => {
  let timeoutId: NodeJS.Timeout | null = null;
  let abortController: AbortController | null = null;
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const filenameRaw = typeof req.query.filename === 'string' ? req.query.filename : '';
    if (!rawUrl) return res.status(400).json({ error: 'url query param is required' });

    const initial = validatePublicHttpUrl(rawUrl);
    if (!initial.ok) return res.status(400).json({ error: initial.error });

    const safeFilename = (filenameRaw || 'asset')
      .replace(/[\r\n;"\\\/]+/g, '_')
      .replace(/[^\x20-\x7E]/g, '_')
      .slice(0, 200) || 'asset';

    abortController = new AbortController();
    timeoutId = setTimeout(() => abortController?.abort(), 30_000);

    let currentUrl = initial.url.toString();
    let upstream: Response | null = null;
    const MAX_REDIRECTS = 5;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const r = await fetch(currentUrl, { redirect: 'manual', signal: abortController.signal });
      const isRedirect = r.status >= 300 && r.status < 400 && r.headers.get('location');
      if (!isRedirect) {
        upstream = r;
        break;
      }
      const loc = r.headers.get('location')!;
      let nextUrl: string;
      try {
        nextUrl = new URL(loc, currentUrl).toString();
      } catch {
        return res.status(502).json({ error: 'Bad redirect URL from upstream' });
      }
      const check = validatePublicHttpUrl(nextUrl);
      if (!check.ok) {
        console.warn(`[AssetLibrary] Blocked SSRF redirect from ${currentUrl} -> ${nextUrl}`);
        return res.status(400).json({ error: 'Upstream redirect to non-public host blocked' });
      }
      currentUrl = nextUrl;
      if (hop === MAX_REDIRECTS) {
        return res.status(502).json({ error: 'Too many redirects' });
      }
    }
    if (!upstream || !upstream.ok || !upstream.body) {
      console.warn(`[AssetLibrary] Proxy download upstream ${upstream?.status} for ${rawUrl}`);
      return res.status(502).json({ error: `Upstream fetch failed: ${upstream?.status ?? 'no response'}` });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');
    const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB
    if (contentLength && Number(contentLength) > MAX_BYTES) {
      return res.status(413).json({ error: 'File too large to proxy' });
    }
    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const reader = upstream.body.getReader();
    let bytesSent = 0;
    let aborted = false;
    res.on('close', () => {
      aborted = true;
      try { reader.cancel(); } catch {}
      try { abortController?.abort(); } catch {}
    });

    try {
      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          bytesSent += value.byteLength;
          if (bytesSent > MAX_BYTES) {
            try { reader.cancel(); } catch {}
            break;
          }
          if (!res.write(Buffer.from(value))) {
            await new Promise<void>((resolve) => res.once('drain', resolve));
          }
        }
      }
    } finally {
      try { reader.cancel(); } catch {}
    }
    if (!aborted) res.end();
  } catch (error: any) {
    console.error('[AssetLibrary] Download proxy error:', error?.message || error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to proxy download' });
    } else {
      try { res.end(); } catch {}
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
});

router.post('/save-character', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { name, referenceImageUrl, role, physicalDescription } = req.body;
    if (!name || !referenceImageUrl) {
      return res.status(400).json({ error: 'name and referenceImageUrl are required' });
    }

    await db.insert(assetLibrary).values({
      assetUrl: referenceImageUrl,
      thumbnailUrl: referenceImageUrl,
      assetType: 'image',
      provider: 'character-generator',
      prompt: `Character: ${name}${role ? ` — ${role}` : ''}`,
      contentType: 'character',
      tags: ['character', name],
      createdBy: userId,
      width: 1024,
      height: 1024,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('[AssetLibrary] Save character error:', error.message);
    res.status(500).json({ error: 'Failed to save character asset' });
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

const AR_DIMS: Record<string, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 1024, h: 1024 },
  '4:3': { w: 1024, h: 768 },
};

async function saveCompletedJob(jobId: string, url: string, assetType: 'image' | 'video', data: {
  provider: string; prompt: string; contentType: string; userId: string;
  width?: number; height?: number; duration?: string; qualityScore?: number;
  thumbnailUrl?: string;
}) {
  await db
    .update(videoGenerationJobs)
    .set({ status: 'completed', videoUrl: url, progress: 100, completedAt: new Date(), updatedAt: new Date() })
    .where(eq(videoGenerationJobs.jobId, jobId));

  await db.insert(assetLibrary).values({
    assetUrl: url,
    thumbnailUrl: data.thumbnailUrl || (assetType === 'image' ? url : undefined),
    assetType,
    provider: data.provider,
    prompt: data.prompt,
    contentType: data.contentType,
    width: data.width,
    height: data.height,
    duration: data.duration,
    qualityScore: data.qualityScore,
    tags: [],
    createdBy: data.userId,
  });
}

async function failJob(jobId: string, errorMsg: string) {
  await db
    .update(videoGenerationJobs)
    .set({ status: 'failed', errorMessage: errorMsg, completedAt: new Date(), updatedAt: new Date() })
    .where(eq(videoGenerationJobs.jobId, jobId));
}

const STARTUP_RECOVERY_AGE_MS = 2 * 60 * 1000;
const STALL_CHECK_INTERVAL_MS = 60 * 1000;
const MAX_RETRIES = 2;

const STALL_THRESHOLDS_MS: Record<string, number> = {
  't2i': 5 * 60 * 1000,
  'i2i': 5 * 60 * 1000,
  't2v': 10 * 60 * 1000,
  'i2v': 10 * 60 * 1000,
  'v2v': 15 * 60 * 1000,
  'character-performance': 15 * 60 * 1000,
  'upscale-image': 5 * 60 * 1000,
  'upscale-video': 10 * 60 * 1000,
  'bg-remove-image': 5 * 60 * 1000,
  'bg-remove-video': 10 * 60 * 1000,
};
const DEFAULT_STALL_THRESHOLD_MS = 10 * 60 * 1000;

async function recoverStuckAssetJobs() {
  try {
    const cutoff = new Date(Date.now() - STARTUP_RECOVERY_AGE_MS);
    const stuckJobs = await db
      .select()
      .from(videoGenerationJobs)
      .where(
        and(
          eq(videoGenerationJobs.sceneId, 'asset-library'),
          or(
            eq(videoGenerationJobs.status, 'processing'),
            eq(videoGenerationJobs.status, 'pending')
          )
        )
      );

    const jobsToRecover = stuckJobs.filter(j => {
      const jobTime = j.startedAt || j.createdAt;
      return jobTime && new Date(jobTime) < cutoff;
    });

    if (jobsToRecover.length === 0) {
      console.log('[AssetLibrary] Startup recovery: no stuck jobs found');
      return;
    }

    console.log(`[AssetLibrary] Startup recovery: found ${jobsToRecover.length} stuck job(s)`);

    for (const job of jobsToRecover) {
      const settings = (job.i2vSettings as any) || {};
      const mode = settings.assetLibraryMode;
      const userId = job.triggeredBy || '';

      if (!mode || !userId) {
        console.warn(`[AssetLibrary] Startup recovery: job ${job.jobId} missing mode or userId, marking failed`);
        await failJob(job.jobId, 'Job orphaned after server restart (missing mode or userId)');
        continue;
      }

      const retryCount = settings._retryCount || 0;
      if (retryCount >= MAX_RETRIES) {
        console.warn(`[AssetLibrary] Startup recovery: job ${job.jobId} exceeded max retries (${retryCount}), marking failed`);
        await failJob(job.jobId, `Job failed after ${retryCount} retry attempts following server restart`);
        continue;
      }

      const updated = await db
        .update(videoGenerationJobs)
        .set({
          status: 'pending',
          startedAt: null,
          updatedAt: new Date(),
          i2vSettings: { ...settings, _retryCount: retryCount + 1 },
        })
        .where(
          and(
            eq(videoGenerationJobs.jobId, job.jobId),
            or(
              eq(videoGenerationJobs.status, 'processing'),
              eq(videoGenerationJobs.status, 'pending')
            )
          )
        )
        .returning({ jobId: videoGenerationJobs.jobId });

      if (updated.length === 0) {
        console.log(`[AssetLibrary] Startup recovery: job ${job.jobId} status changed (already completed/failed), skipping`);
        continue;
      }

      console.log(`[AssetLibrary] Startup recovery: retrying job ${job.jobId} (mode: ${mode}, attempt: ${retryCount + 1})`);

      processAssetLibraryJob(job.jobId, userId, mode).catch((err) => {
        console.error(`[AssetLibrary] Recovery retry failed for job ${job.jobId}:`, err.message);
      });
    }
  } catch (error: any) {
    console.error('[AssetLibrary] Startup recovery error:', error.message);
  }
}

function startStallCheck() {
  setInterval(async () => {
    try {
      const stalledJobs = await db
        .select()
        .from(videoGenerationJobs)
        .where(
          and(
            eq(videoGenerationJobs.sceneId, 'asset-library'),
            eq(videoGenerationJobs.status, 'processing')
          )
        );

      for (const job of stalledJobs) {
        const settings = (job.i2vSettings as any) || {};
        const mode = settings.assetLibraryMode || '';
        const modeThreshold = STALL_THRESHOLDS_MS[mode] || DEFAULT_STALL_THRESHOLD_MS;
        const started = job.startedAt || job.createdAt;
        if (!started || new Date(started) >= new Date(Date.now() - modeThreshold)) {
          continue;
        }

        const retryCount = settings._retryCount || 0;
        const userId = job.triggeredBy || '';

        if (retryCount < MAX_RETRIES && mode && userId) {
          const updated = await db
            .update(videoGenerationJobs)
            .set({
              status: 'pending',
              startedAt: null,
              updatedAt: new Date(),
              i2vSettings: { ...settings, _retryCount: retryCount + 1 },
            })
            .where(
              and(
                eq(videoGenerationJobs.jobId, job.jobId),
                eq(videoGenerationJobs.status, 'processing')
              )
            )
            .returning({ jobId: videoGenerationJobs.jobId });

          if (updated.length === 0) {
            console.log(`[AssetLibrary] Stall check: job ${job.jobId} status changed, skipping`);
            continue;
          }

          console.log(`[AssetLibrary] Stall check: retrying stalled job ${job.jobId} (mode: ${mode}, attempt: ${retryCount + 1})`);

          processAssetLibraryJob(job.jobId, userId, mode).catch((err) => {
            console.error(`[AssetLibrary] Stall retry failed for job ${job.jobId}:`, err.message);
          });
        } else {
          const elapsed = Math.round((Date.now() - new Date(job.startedAt || job.createdAt!).getTime()) / 1000);
          await failJob(job.jobId, `Job stalled after ${elapsed}s with no response (max retries: ${MAX_RETRIES})`);
          console.warn(`[AssetLibrary] Stall check: marked job ${job.jobId} as failed after ${elapsed}s`);
        }
      }
    } catch (error: any) {
      console.error('[AssetLibrary] Stall check error:', error.message);
    }
  }, STALL_CHECK_INTERVAL_MS);
}

setTimeout(() => {
  recoverStuckAssetJobs();
  startStallCheck();
  console.log('[AssetLibrary] Startup recovery and stall check initialized');
}, 3000);

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

  const settings = (job.i2vSettings as any) || {};

  try {
    await db
      .update(videoGenerationJobs)
      .set({ status: 'processing', startedAt: new Date(), updatedAt: new Date() })
      .where(eq(videoGenerationJobs.jobId, jobId));

    const resolveUrl = async (url: string | undefined | null, label: string): Promise<string | undefined> => {
      if (!url) return undefined;
      if (url.startsWith('https://')) return url;
      const publicUrl = await assetUrlResolver.resolve(url);
      if (publicUrl) {
        console.log(`[AssetLibrary] Resolved ${label}: ${url} → ${publicUrl.substring(0, 60)}...`);
        return publicUrl;
      }
      console.warn(`[AssetLibrary] Failed to resolve ${label}: ${url}`);
      return url;
    };

    const resolvedSourceImageUrl = await resolveUrl(job.sourceImageUrl, 'source image');
    if (settings.additionalImageUrls?.length) {
      const resolved = await Promise.all(
        settings.additionalImageUrls.map((url: string, i: number) => resolveUrl(url, `additional image ${i + 1}`))
      );
      settings.additionalImageUrls = resolved.filter((u: string | undefined): u is string => !!u);
    }
    if (settings.referenceVideoUrl) {
      settings.referenceVideoUrl = await resolveUrl(settings.referenceVideoUrl, 'reference video');
    }
    if (settings.replacementImageUrl) {
      settings.replacementImageUrl = await resolveUrl(settings.replacementImageUrl, 'replacement image');
    }

    switch (mode) {
      case 't2i': {
        const dims = AR_DIMS[job.aspectRatio || '16:9'] || AR_DIMS['16:9'];
        const imageResult = await imageGenerationService.generateImage({
          prompt: job.prompt || '',
          width: dims.w,
          height: dims.h,
          style: (job.style as any) || 'Photorealistic',
          provider: job.provider !== 'auto' ? job.provider : undefined,
          aspectRatio: job.aspectRatio || '16:9',
        });

        if (!imageResult.url) throw new Error('Image generation returned no URL');

        await saveCompletedJob(jobId, imageResult.url, 'image', {
          provider: imageResult.provider || job.provider || 'auto',
          prompt: job.prompt || '',
          contentType: 't2i',
          userId,
          width: imageResult.width || dims.w,
          height: imageResult.height || dims.h,
        });
        console.log(`[AssetLibrary] T2I job ${jobId} completed`);
        break;
      }

      case 'i2i': {
        const dims = AR_DIMS[job.aspectRatio || '16:9'] || AR_DIMS['16:9'];
        const i2iResult = await imageGenerationService.generateImageToImage({
          referenceImageUrl: resolvedSourceImageUrl || '',
          prompt: job.prompt || '',
          strength: settings.strength || 0.35,
          width: dims.w,
          height: dims.h,
          useCase: settings.useCase || 'style-transfer',
          provider: job.provider !== 'auto' ? job.provider : undefined,
          outputFormat: settings.outputFormat,
          aspectRatio: settings.i2iAspectRatio,
          resolution: settings.resolution,
          safetyLevel: settings.safetyLevel,
          additionalImageUrls: settings.additionalImageUrls,
        });

        if (!i2iResult.url) throw new Error('Image-to-image generation returned no URL');

        await saveCompletedJob(jobId, i2iResult.url, 'image', {
          provider: i2iResult.provider || job.provider || 'auto',
          prompt: job.prompt || '',
          contentType: 'i2i',
          userId,
          width: i2iResult.width || dims.w,
          height: i2iResult.height || dims.h,
        });
        console.log(`[AssetLibrary] I2I job ${jobId} completed`);
        break;
      }

      case 't2v':
      case 'i2v': {
        const i2vOpts: any = {};
        if (mode === 'i2v' && settings.imageControlStrength !== undefined) {
          i2vOpts.i2vSettings = {
            imageControlStrength: settings.imageControlStrength,
          };
        }
        const result = await aiVideoService.generateVideo({
          prompt: job.prompt || '',
          duration: job.duration || 6,
          aspectRatio: (job.aspectRatio as '16:9' | '9:16' | '1:1') || '16:9',
          sceneType: job.sceneType || 'general',
          preferredProvider: job.provider || 'auto',
          negativePrompt: job.negativePrompt || undefined,
          imageUrl: mode === 'i2v' ? (resolvedSourceImageUrl || undefined) : undefined,
          ...i2vOpts,
        });

        if (!result.success || !result.videoUrl) throw new Error(result.error || 'Video generation failed');

        const finalUrl = result.s3Url || result.videoUrl;
        await saveCompletedJob(jobId, finalUrl, 'video', {
          provider: result.provider || job.provider || 'auto',
          prompt: job.prompt || '',
          contentType: mode,
          userId,
          width: result.width,
          height: result.height,
          duration: String(result.duration || job.duration || 6),
          qualityScore: result.qualityScore,
        });
        console.log(`[AssetLibrary] ${mode.toUpperCase()} job ${jobId} completed`);
        break;
      }

      case 'v2v': {
        const isRunwayV2V = job.provider?.startsWith('runway');

        if (isRunwayV2V) {
          const refVideoUrl = settings.referenceVideoUrl;
          if (!refVideoUrl) throw new Error('No reference video URL provided for Runway V2V');

          const v2vResult = await runwayVideoService.generateVideoToVideo({
            videoUrl: refVideoUrl,
            prompt: job.prompt || '',
            model: job.provider || 'runway-gen4-aleph',
            duration: job.duration || 5,
            aspectRatio: job.aspectRatio || '16:9',
          });

          if (!v2vResult.success || !v2vResult.videoUrl) throw new Error(v2vResult.error || 'Runway V2V failed');

          await saveCompletedJob(jobId, v2vResult.videoUrl, 'video', {
            provider: v2vResult.provider || job.provider || 'runway-gen4-aleph',
            prompt: job.prompt || '',
            contentType: 'v2v',
            userId,
            duration: String(v2vResult.duration || job.duration || 5),
          });
        } else {
          const refVideoUrl = settings.referenceVideoUrl;
          if (!refVideoUrl) throw new Error('No reference video URL provided for V2V');

          const replacementImg = settings.replacementImageUrl || resolvedSourceImageUrl;
          if (!replacementImg) throw new Error('No replacement image URL provided for V2V');

          const v2vResult = await piapiVideoService.replaceObjectInVideo({
            videoUrl: refVideoUrl,
            replacementImageUrl: replacementImg,
            prompt: job.prompt || '',
            duration: job.duration || 5,
            aspectRatio: (job.aspectRatio as '16:9' | '9:16' | '1:1') || '16:9',
          });

          if (!v2vResult.success || !v2vResult.videoUrl) throw new Error(v2vResult.error || 'V2V generation failed');

          const v2vFinalUrl = v2vResult.s3Url || v2vResult.videoUrl;
          await saveCompletedJob(jobId, v2vFinalUrl, 'video', {
            provider: v2vResult.provider || 'kling-v2v',
            prompt: job.prompt || '',
            contentType: 'v2v',
            userId,
            duration: String(v2vResult.duration || job.duration || 5),
          });
        }
        console.log(`[AssetLibrary] V2V job ${jobId} completed`);
        break;
      }

      case 'character-performance': {
        const charImage = resolvedSourceImageUrl;
        const refVideo = settings.referenceVideoUrl;
        if (!charImage) throw new Error('No character image URL provided');
        if (!refVideo) throw new Error('No reference video URL provided for character performance');

        const cpResult = await runwayVideoService.generateCharacterPerformance({
          characterImageUrl: charImage,
          referenceVideoUrl: refVideo,
          bodyControl: settings.bodyControl ?? false,
        });

        if (!cpResult.success || !cpResult.videoUrl) throw new Error(cpResult.error || 'Character performance failed');

        await saveCompletedJob(jobId, cpResult.videoUrl, 'video', {
          provider: 'runway-act-two',
          prompt: job.prompt || 'Character performance',
          contentType: 'character-performance',
          userId,
          duration: String(cpResult.duration || 5),
        });
        console.log(`[AssetLibrary] Character Performance job ${jobId} completed`);
        break;
      }

      case 'upscale-image': {
        const imgUrl = resolvedSourceImageUrl;
        if (!imgUrl) throw new Error('No image URL provided for upscaling');

        const upResult = await qubicToolkitService.upscaleImage({
          imageUrl: imgUrl,
          scaleFactor: settings.scaleFactor || 2,
          prompt: job.prompt || '',
        });

        if (!upResult.success || !upResult.url) throw new Error(upResult.error || 'Image upscale failed');

        await saveCompletedJob(jobId, upResult.url, 'image', {
          provider: 'qubic-image-toolkit',
          prompt: job.prompt || 'Image upscale',
          contentType: 'upscale-image',
          userId,
          width: upResult.width,
          height: upResult.height,
        });
        console.log(`[AssetLibrary] Image Upscale job ${jobId} completed`);
        break;
      }

      case 'upscale-video': {
        const vidUrl = settings.referenceVideoUrl;
        if (!vidUrl) throw new Error('No video URL provided for upscaling');

        const vUpResult = await qubicToolkitService.upscaleVideo({
          videoUrl: vidUrl,
          scaleFactor: settings.scaleFactor || 2,
        });

        if (!vUpResult.success || !vUpResult.url) throw new Error(vUpResult.error || 'Video upscale failed');

        await saveCompletedJob(jobId, vUpResult.url, 'video', {
          provider: 'qubic-image-toolkit',
          prompt: job.prompt || 'Video upscale',
          contentType: 'upscale-video',
          userId,
        });
        console.log(`[AssetLibrary] Video Upscale job ${jobId} completed`);
        break;
      }

      case 'bg-remove-image': {
        const bgImgUrl = resolvedSourceImageUrl;
        if (!bgImgUrl) throw new Error('No image URL provided for background removal');

        const bgResult = await qubicToolkitService.removeImageBackground({
          imageUrl: bgImgUrl,
        });

        if (!bgResult.success || !bgResult.url) throw new Error(bgResult.error || 'Background removal failed');

        await saveCompletedJob(jobId, bgResult.url, 'image', {
          provider: 'qubic-image-toolkit',
          prompt: job.prompt || 'Background removal',
          contentType: 'bg-remove-image',
          userId,
        });
        console.log(`[AssetLibrary] Image BG Removal job ${jobId} completed`);
        break;
      }

      case 'bg-remove-video': {
        const bgVidUrl = settings.referenceVideoUrl;
        if (!bgVidUrl) throw new Error('No video URL provided for background removal');

        const vBgResult = await qubicToolkitService.removeVideoBackground({
          videoUrl: bgVidUrl,
        });

        if (!vBgResult.success || !vBgResult.url) throw new Error(vBgResult.error || 'Video background removal failed');

        await saveCompletedJob(jobId, vBgResult.url, 'video', {
          provider: 'qubic-image-toolkit',
          prompt: job.prompt || 'Video background removal',
          contentType: 'bg-remove-video',
          userId,
        });
        console.log(`[AssetLibrary] Video BG Removal job ${jobId} completed`);
        break;
      }

      default:
        throw new Error(`Unsupported generation mode: ${mode}`);
    }
  } catch (error: any) {
    const errorMsg = error.message || 'Unexpected error';
    console.error(`[AssetLibrary] Job ${jobId} error:`, errorMsg);
    await failJob(jobId, errorMsg);
  }
}

export default router;
