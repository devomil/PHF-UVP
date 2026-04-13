# Phase 19B: Canva Asset Upload Service

## Priority: CRITICAL
## Dependency: Phase 19A (OAuth + tokens must exist)
## Estimated Time: 4-5 hours

---

## What This Phase Builds

1. `CanvaAssetService` — handles both upload paths:
   - **Direct binary upload** for MP4 renders (presigned URL → PUT → poll)
   - **URL upload** for key frame images (pass S3 URL → Canva fetches → poll)
2. Async job polling with exponential backoff
3. Frame extraction helper using ffmpeg
4. Asset tagging with brand metadata
5. DB tracking of every sync job (status, canva_asset_id, errors)

---

## Upload Path Decision Tree

```
Is this a video file (MP4)?
  YES → Use Direct Binary Upload
        (POST /rest/v1/assets → presigned URL → PUT binary → poll)
  NO  → Is it an image (JPEG/PNG)?
          YES → Use URL Upload (Preview)
                (POST /rest/v1/url-asset-uploads with S3 URL → poll)
```

> Important: URL upload for video is capped at 100MB and is a Preview API.
> Remotion Lambda renders frequently exceed 100MB. Always use direct binary
> upload for the final render MP4.

---

## Task 1: Canva API Client

Create file: `server/services/canva-api.client.ts`

This is a thin typed wrapper over the Canva REST API. No SDK is provided by Canva — they publish an OpenAPI spec, but for Tier 1 the surface area is small enough that a manual wrapper is simpler.

```typescript
// server/services/canva-api.client.ts

import { canvaAuthService } from './canva-auth.service';

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

// ─── Request / Response Types ──────────────────────────────────────────────

export interface CanvaAsset {
  id: string;
  name: string;
  type: 'image' | 'video';
  tags: string[];
  created_at: number;
  updated_at: number;
}

export interface CanvaUploadJob {
  id: string;
  status: 'in_progress' | 'success' | 'failed';
  error?: {
    code: 'file_too_big' | 'import_failed' | 'fetch_failed';
    message: string;
  };
  asset?: CanvaAsset;
}

export interface CanvaDirectUploadJob {
  job: CanvaUploadJob;
  upload_url?: string;          // Presigned PUT URL (only in initial response)
  upload_url_expiry?: number;   // Unix timestamp
}

export interface CanvaUrlUploadResponse {
  job: CanvaUploadJob;
}

// ─── Client Class ──────────────────────────────────────────────────────────

export class CanvaApiClient {
  private userId: number;

  constructor(userId: number) {
    this.userId = userId;
  }

  // Build auth headers with auto-refresh
  private async headers(): Promise<HeadersInit> {
    const token = await canvaAuthService.getValidAccessToken(this.userId);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  // ─── Create Direct Upload Job (for binary file upload) ──────────────────
  // Returns a presigned upload_url for PUT and a job ID for polling.
  // POST /rest/v1/assets

  async createDirectUploadJob(params: {
    name: string;
    mimeType: string;  // e.g. 'video/mp4', 'image/jpeg'
    fileSize: number;  // bytes
  }): Promise<CanvaDirectUploadJob> {
    const response = await fetch(`${CANVA_API_BASE}/assets`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify({
        name: params.name,
        content_type: params.mimeType,
        size: params.fileSize,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Canva createDirectUploadJob failed ${response.status}: ${err}`);
    }

    return response.json() as Promise<CanvaDirectUploadJob>;
  }

  // ─── Get Direct Upload Job Status ────────────────────────────────────────
  // GET /rest/v1/assets/{jobId}

  async getDirectUploadJob(jobId: string): Promise<CanvaUploadJob> {
    const response = await fetch(`${CANVA_API_BASE}/assets/${jobId}`, {
      headers: await this.headers(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Canva getDirectUploadJob failed ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.job as CanvaUploadJob;
  }

  // ─── Create URL Upload Job (for image frames from S3) ────────────────────
  // Preview API — use only for images, not for large videos.
  // POST /rest/v1/url-asset-uploads
  // Rate limit: 30 req/min per user

  async createUrlUploadJob(params: {
    name: string;
    url: string;   // Must be publicly accessible HTTPS URL
  }): Promise<CanvaUrlUploadResponse> {
    const response = await fetch(`${CANVA_API_BASE}/url-asset-uploads`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify({
        name: params.name,
        url: params.url,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Canva createUrlUploadJob failed ${response.status}: ${err}`);
    }

    return response.json() as Promise<CanvaUrlUploadResponse>;
  }

  // ─── Get URL Upload Job Status ────────────────────────────────────────────
  // GET /rest/v1/url-asset-uploads/{jobId}

  async getUrlUploadJob(jobId: string): Promise<CanvaUploadJob> {
    const response = await fetch(`${CANVA_API_BASE}/url-asset-uploads/${jobId}`, {
      headers: await this.headers(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Canva getUrlUploadJob failed ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.job as CanvaUploadJob;
  }

  // ─── Update Asset Metadata (name + tags) ─────────────────────────────────
  // PATCH /rest/v1/assets/{assetId}

  async updateAsset(assetId: string, params: {
    name?: string;
    tags?: string[];
  }): Promise<void> {
    const body: Record<string, unknown> = {};
    if (params.name) body.name = params.name;
    if (params.tags) body.tags = params.tags;

    const response = await fetch(`${CANVA_API_BASE}/assets/${assetId}`, {
      method: 'PATCH',
      headers: await this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Non-fatal — asset is uploaded, just metadata update failed
      console.warn(`[CanvaAPI] updateAsset failed for ${assetId}: ${response.status}`);
    }
  }
}
```

---

## Task 2: Async Polling Helper

Create file: `server/utils/canva-poll.ts`

```typescript
// server/utils/canva-poll.ts

interface PollOptions {
  initialDelayMs?: number;   // Default: 1000
  multiplier?: number;       // Default: 1.5
  maxDelayMs?: number;       // Default: 10000
  timeoutMs?: number;        // Default: 300000 (5 min)
}

type PollFn<T> = () => Promise<T>;
type IsDone<T> = (result: T) => boolean;
type IsFailed<T> = (result: T) => { failed: boolean; message?: string };

export async function pollUntilDone<T>(
  fn: PollFn<T>,
  isDone: IsDone<T>,
  isFailed: IsFailed<T>,
  options: PollOptions = {}
): Promise<T> {
  const {
    initialDelayMs = 1000,
    multiplier = 1.5,
    maxDelayMs = 10000,
    timeoutMs = 300000,
  } = options;

  const deadline = Date.now() + timeoutMs;
  let delay = initialDelayMs;

  while (Date.now() < deadline) {
    const result = await fn();

    const failure = isFailed(result);
    if (failure.failed) {
      throw new Error(`Job failed: ${failure.message ?? 'Unknown error'}`);
    }

    if (isDone(result)) {
      return result;
    }

    // Wait, then increase delay (capped at maxDelayMs)
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * multiplier, maxDelayMs);
  }

  throw new Error(`Job timed out after ${timeoutMs / 1000}s`);
}
```

---

## Task 3: Frame Extraction Helper

Create file: `server/utils/canva-frame-extractor.ts`

```typescript
// server/utils/canva-frame-extractor.ts

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const execFileAsync = promisify(execFile);

export interface ExtractedFrame {
  filePath: string;
  timestamp: number;  // Seconds from start
  label: string;
}

/**
 * Extract N key frames from an MP4 file using ffmpeg.
 * Returns local temp file paths. Caller is responsible for cleanup.
 *
 * @param mp4Path  Path to the local MP4 file (already downloaded from S3)
 * @param count    Number of frames to extract (default: 4)
 * @returns Array of frame objects with file paths
 */
export async function extractKeyFrames(
  mp4Path: string,
  count: number = 4
): Promise<ExtractedFrame[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuralcut-frames-'));

  // Get video duration first
  let duration = 30; // Default fallback
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      mp4Path,
    ]);
    const probe = JSON.parse(stdout);
    const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
    if (videoStream?.duration) {
      duration = parseFloat(videoStream.duration);
    }
  } catch (err) {
    console.warn('[FrameExtract] ffprobe failed, using default duration:', err);
  }

  // Calculate timestamps: skip first and last 5% to avoid fade in/out
  const startOffset = duration * 0.05;
  const endOffset = duration * 0.95;
  const usable = endOffset - startOffset;
  const step = usable / (count + 1);

  const frames: ExtractedFrame[] = [];

  for (let i = 1; i <= count; i++) {
    const timestamp = startOffset + step * i;
    const outPath = path.join(tmpDir, `frame_${i}.jpg`);

    try {
      await execFileAsync('ffmpeg', [
        '-ss', timestamp.toFixed(2),
        '-i', mp4Path,
        '-vframes', '1',
        '-vf', 'scale=1920:-1',          // Max width 1920, preserve AR
        '-q:v', '2',                      // High quality JPEG
        '-y',                             // Overwrite
        outPath,
      ]);

      frames.push({
        filePath: outPath,
        timestamp,
        label: `Frame ${i} (${Math.round(timestamp)}s)`,
      });
    } catch (err) {
      console.warn(`[FrameExtract] Failed to extract frame at ${timestamp}s:`, err);
    }
  }

  if (frames.length === 0) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw new Error('No frames could be extracted from the video');
  }

  return frames;
}

/**
 * Clean up temp files after upload
 */
export async function cleanupFrames(frames: ExtractedFrame[]): Promise<void> {
  if (frames.length === 0) return;
  const tmpDir = path.dirname(frames[0].filePath);
  await fs.rm(tmpDir, { recursive: true, force: true });
}
```

---

## Task 4: Main Asset Service

Create file: `server/services/canva-asset.service.ts`

```typescript
// server/services/canva-asset.service.ts

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { db } from '../db';
import { canvaSyncJobs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { CanvaApiClient } from './canva-api.client';
import { pollUntilDone } from '../utils/canva-poll';
import { extractKeyFrames, cleanupFrames } from '../utils/canva-frame-extractor';

// Re-use existing S3 client from your codebase
// Adjust import to match your actual S3 client location
import { s3Client, S3_BUCKET } from '../config/aws';

const FRAME_COUNT = 4;

export interface CanvaSyncResult {
  videoAssetId?: string;
  frameAssetIds: string[];
  errors: string[];
}

export class CanvaAssetService {

  // ─── Main Entry Point ──────────────────────────────────────────────────────
  // Called after a render completes successfully.

  async syncRenderToCanva(params: {
    userId: number;
    projectId: number;
    projectTitle: string;
    renderS3Key: string;       // e.g. "renders/project-123/final.mp4"
    brandTags?: string[];      // e.g. ["pine-hill-farm", "supplements"]
  }): Promise<CanvaSyncResult> {
    const { userId, projectId, projectTitle, renderS3Key, brandTags = [] } = params;
    const client = new CanvaApiClient(userId);
    const result: CanvaSyncResult = { frameAssetIds: [], errors: [] };

    console.log(`[CanvaSync] Starting sync for project ${projectId}`);

    // ── 1. Push MP4 via direct binary upload ──────────────────────────────
    try {
      const videoAssetId = await this.uploadVideoFromS3({
        client,
        userId,
        projectId,
        s3Key: renderS3Key,
        name: `${projectTitle} — Final Render`,
        tags: [...brandTags, 'neuralcut', 'video', 'render'],
      });
      result.videoAssetId = videoAssetId;
      console.log(`[CanvaSync] Video uploaded: ${videoAssetId}`);
    } catch (err: any) {
      console.error('[CanvaSync] Video upload failed:', err.message);
      result.errors.push(`Video upload: ${err.message}`);
    }

    // ── 2. Extract frames and push as images ──────────────────────────────
    let localMp4Path: string | null = null;
    let frames: Awaited<ReturnType<typeof extractKeyFrames>> = [];

    try {
      // Download MP4 locally for ffmpeg frame extraction
      localMp4Path = await this.downloadS3ToTemp(renderS3Key);

      frames = await extractKeyFrames(localMp4Path, FRAME_COUNT);
      console.log(`[CanvaSync] Extracted ${frames.length} frames`);

      // Upload frames to S3 first (to get public URLs), then to Canva
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        try {
          const s3Key = `renders/frames/${projectId}/frame_${i + 1}.jpg`;
          const s3Url = await this.uploadFrameToS3(frame.filePath, s3Key);

          const frameAssetId = await this.uploadImageFromUrl({
            client,
            userId,
            projectId,
            url: s3Url,
            name: `${projectTitle} — Scene Frame ${i + 1}`,
            tags: [...brandTags, 'neuralcut', 'frame', `scene-${i + 1}`],
          });

          result.frameAssetIds.push(frameAssetId);
          console.log(`[CanvaSync] Frame ${i + 1} uploaded: ${frameAssetId}`);
        } catch (err: any) {
          console.error(`[CanvaSync] Frame ${i + 1} failed:`, err.message);
          result.errors.push(`Frame ${i + 1}: ${err.message}`);
        }
      }
    } catch (err: any) {
      console.error('[CanvaSync] Frame extraction failed:', err.message);
      result.errors.push(`Frame extraction: ${err.message}`);
    } finally {
      // Always clean up temp files
      if (frames.length > 0) await cleanupFrames(frames);
      if (localMp4Path) {
        await fs.promises.unlink(localMp4Path).catch(() => {});
      }
    }

    console.log(
      `[CanvaSync] Complete. Video: ${result.videoAssetId ?? 'failed'}, ` +
      `Frames: ${result.frameAssetIds.length}/${FRAME_COUNT}, ` +
      `Errors: ${result.errors.length}`
    );

    return result;
  }

  // ─── Direct Binary Upload for MP4 ─────────────────────────────────────────

  private async uploadVideoFromS3(params: {
    client: CanvaApiClient;
    userId: number;
    projectId: number;
    s3Key: string;
    name: string;
    tags: string[];
  }): Promise<string> {
    const { client, userId, projectId, s3Key, name, tags } = params;

    // Create sync job row
    const [job] = await db.insert(canvaSyncJobs).values({
      userId,
      projectId,
      assetType: 'video',
      assetLabel: name,
      s3Key,
      s3Url: '',  // Will be set after presign
      status: 'uploading',
    }).returning();

    try {
      // Get file size from S3 before creating upload job
      const { contentLength, s3Url } = await this.getS3ObjectInfo(s3Key);

      await db.update(canvaSyncJobs)
        .set({ s3Url })
        .where(eq(canvaSyncJobs.id, job.id));

      // Step 1: Create the Canva upload job (get presigned PUT URL)
      const uploadJob = await client.createDirectUploadJob({
        name,
        mimeType: 'video/mp4',
        fileSize: contentLength,
      });

      await db.update(canvaSyncJobs)
        .set({ canvaJobId: uploadJob.job.id, status: 'uploading' })
        .where(eq(canvaSyncJobs.id, job.id));

      if (!uploadJob.upload_url) {
        throw new Error('Canva did not return a presigned upload URL');
      }

      // Step 2: Stream the MP4 from S3 directly to Canva's presigned URL
      await this.streamS3ToCanvaPresigned(s3Key, uploadJob.upload_url, 'video/mp4');

      // Step 3: Poll for completion
      await db.update(canvaSyncJobs)
        .set({ status: 'polling' })
        .where(eq(canvaSyncJobs.id, job.id));

      const completed = await pollUntilDone(
        () => client.getDirectUploadJob(uploadJob.job.id),
        result => result.status === 'success',
        result => ({
          failed: result.status === 'failed',
          message: result.error?.message,
        })
      );

      const assetId = completed.asset!.id;

      // Update tags after upload
      await client.updateAsset(assetId, { name, tags });

      await db.update(canvaSyncJobs).set({
        status: 'success',
        canvaAssetId: assetId,
        completedAt: new Date(),
      }).where(eq(canvaSyncJobs.id, job.id));

      return assetId;
    } catch (err: any) {
      await db.update(canvaSyncJobs).set({
        status: 'failed',
        errorMessage: err.message,
      }).where(eq(canvaSyncJobs.id, job.id));
      throw err;
    }
  }

  // ─── URL Upload for Image Frames ───────────────────────────────────────────

  private async uploadImageFromUrl(params: {
    client: CanvaApiClient;
    userId: number;
    projectId: number;
    url: string;
    name: string;
    tags: string[];
  }): Promise<string> {
    const { client, userId, projectId, url, name, tags } = params;

    const [job] = await db.insert(canvaSyncJobs).values({
      userId,
      projectId,
      assetType: 'frame',
      assetLabel: name,
      s3Key: '',
      s3Url: url,
      status: 'uploading',
    }).returning();

    try {
      const uploadResponse = await client.createUrlUploadJob({ name, url });

      await db.update(canvaSyncJobs)
        .set({ canvaJobId: uploadResponse.job.id, status: 'polling' })
        .where(eq(canvaSyncJobs.id, job.id));

      const completed = await pollUntilDone(
        () => client.getUrlUploadJob(uploadResponse.job.id),
        result => result.status === 'success',
        result => ({
          failed: result.status === 'failed',
          message: result.error?.message,
        })
      );

      const assetId = completed.asset!.id;

      await client.updateAsset(assetId, { name, tags });

      await db.update(canvaSyncJobs).set({
        status: 'success',
        canvaAssetId: assetId,
        completedAt: new Date(),
      }).where(eq(canvaSyncJobs.id, job.id));

      return assetId;
    } catch (err: any) {
      await db.update(canvaSyncJobs).set({
        status: 'failed',
        errorMessage: err.message,
      }).where(eq(canvaSyncJobs.id, job.id));
      throw err;
    }
  }

  // ─── S3 Helpers ───────────────────────────────────────────────────────────

  private async getS3ObjectInfo(s3Key: string): Promise<{
    contentLength: number;
    s3Url: string;
  }> {
    // Generate a 1-hour presigned URL for Canva to use (for display only)
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key });
    const s3Url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // Get object head for file size
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const head = await s3Client.send(
      new HeadObjectCommand({ Bucket: S3_BUCKET, Key: s3Key })
    );

    return {
      contentLength: head.ContentLength ?? 0,
      s3Url,
    };
  }

  private async downloadS3ToTemp(s3Key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key });
    const response = await s3Client.send(command);

    const tmpPath = path.join(os.tmpdir(), `neuralcut-render-${Date.now()}.mp4`);
    const writeStream = fs.createWriteStream(tmpPath);

    await pipeline(response.Body as Readable, writeStream);
    return tmpPath;
  }

  private async streamS3ToCanvaPresigned(
    s3Key: string,
    presignedUrl: string,
    contentType: string
  ): Promise<void> {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key });
    const response = await s3Client.send(command);

    // Get body as buffer (for small files) or stream (for large)
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const putResponse = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: buffer,
    });

    if (!putResponse.ok) {
      throw new Error(`S3 → Canva PUT failed: ${putResponse.status} ${putResponse.statusText}`);
    }
  }

  private async uploadFrameToS3(localPath: string, s3Key: string): Promise<string> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const fileBuffer = await fs.promises.readFile(localPath);

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'image/jpeg',
      // Make public readable for Canva URL upload
      ACL: 'public-read',
    }));

    return `https://${S3_BUCKET}.s3.amazonaws.com/${s3Key}`;
  }

  // ─── Query Helpers ────────────────────────────────────────────────────────

  async getProjectSyncStatus(projectId: number, userId: number): Promise<{
    status: 'not_started' | 'in_progress' | 'success' | 'partial' | 'failed';
    jobs: typeof canvaSyncJobs.$inferSelect[];
  }> {
    const jobs = await db
      .select()
      .from(canvaSyncJobs)
      .where(
        and(
          eq(canvaSyncJobs.projectId, projectId),
          eq(canvaSyncJobs.userId, userId)
        )
      );

    if (jobs.length === 0) return { status: 'not_started', jobs };

    const statuses = jobs.map(j => j.status);
    const allSuccess = statuses.every(s => s === 'success');
    const anyInProgress = statuses.some(s => s === 'uploading' || s === 'polling');
    const allFailed = statuses.every(s => s === 'failed');
    const someFailed = statuses.some(s => s === 'failed');

    let status: 'not_started' | 'in_progress' | 'success' | 'partial' | 'failed';
    if (allSuccess) status = 'success';
    else if (allFailed) status = 'failed';
    else if (anyInProgress) status = 'in_progress';
    else if (someFailed) status = 'partial';
    else status = 'in_progress';

    return { status, jobs };
  }
}

export const canvaAssetService = new CanvaAssetService();
```

---

## Task 5: Canva Sync API Route

Create file: `server/routes/canva-sync.routes.ts`

```typescript
// server/routes/canva-sync.routes.ts

import { Router, Request, Response } from 'express';
import { canvaAssetService } from '../services/canva-asset.service';
import { canvaAuthService } from '../services/canva-auth.service';

export const canvaSyncRouter = Router();

// ─── GET /api/canva/sync/status/:projectId ────────────────────────────────

canvaSyncRouter.get('/status/:projectId', async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  const connected = await canvaAuthService.isConnected(userId);
  if (!connected) {
    return res.json({ connected: false, status: 'not_connected' });
  }

  const { status, jobs } = await canvaAssetService.getProjectSyncStatus(projectId, userId);

  res.json({
    connected: true,
    status,
    totalAssets: jobs.length,
    successCount: jobs.filter(j => j.status === 'success').length,
    assetIds: jobs
      .filter(j => j.canvaAssetId)
      .map(j => ({ id: j.canvaAssetId, type: j.assetType, label: j.assetLabel })),
  });
});

// ─── POST /api/canva/sync/:projectId (manual re-sync) ─────────────────────

canvaSyncRouter.post('/sync/:projectId', async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  const connected = await canvaAuthService.isConnected(userId);
  if (!connected) {
    return res.status(400).json({ error: 'Canva account not connected' });
  }

  // Fetch the project to get its S3 key + title
  // Adjust import to match your actual project table/schema
  const { videoProjects } = await import('@shared/schema');
  const { db } = await import('../db');
  const { eq } = await import('drizzle-orm');

  const [project] = await db
    .select()
    .from(videoProjects)
    .where(eq(videoProjects.id, projectId))
    .limit(1);

  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.outputUrl) return res.status(400).json({ error: 'Project has no rendered output' });

  // Kick off async — don't await
  const s3Key = extractS3KeyFromUrl(project.outputUrl);

  canvaAssetService.syncRenderToCanva({
    userId,
    projectId,
    projectTitle: project.title ?? `Project ${projectId}`,
    renderS3Key: s3Key,
    brandTags: ['pine-hill-farm', 'neuralcut'],
  }).catch(err => console.error('[CanvaSync] Manual sync failed:', err));

  res.json({ success: true, message: 'Canva sync started' });
});

// Helper: extract S3 key from a full S3 URL or presigned URL
function extractS3KeyFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // pathname starts with /bucket-name/key or /key depending on URL style
    return decodeURIComponent(parsed.pathname.replace(/^\/[^\/]+\//, ''));
  } catch {
    return url;
  }
}
```

### Register the sync router in `server/routes/index.ts` or `server/index.ts`:

```typescript
import { canvaSyncRouter } from './routes/canva-sync.routes';

app.use('/api/canva', canvaSyncRouter);
```

---

## Task 6: Export from Services Index

Update `server/services/index.ts`:

```typescript
export { CanvaApiClient } from './canva-api.client';
export { canvaAssetService } from './canva-asset.service';
```

---

## Verification

### Test the upload service manually:

```typescript
// Test script — run in Node.js REPL or as a quick test route

import { canvaAssetService } from './server/services/canva-asset.service';

// Replace with real values from your DB
const result = await canvaAssetService.syncRenderToCanva({
  userId: 1,
  projectId: 123,
  projectTitle: 'Pine Hill Omega-3 Launch',
  renderS3Key: 'renders/project-123/final.mp4',
  brandTags: ['pine-hill-farm', 'omega-3'],
});

console.log('Sync result:', JSON.stringify(result, null, 2));
```

### Check the sync jobs table:

```sql
SELECT 
  id, project_id, asset_type, asset_label, status, 
  canva_job_id, canva_asset_id, error_message, created_at
FROM canva_sync_jobs
ORDER BY created_at DESC
LIMIT 20;
```

---

## Success Criteria

- [ ] `CanvaApiClient` creates upload jobs, polls status, updates asset metadata
- [ ] `pollUntilDone` retries with exponential backoff up to 5 minutes
- [ ] `extractKeyFrames` produces 4 JPEG files from a test MP4
- [ ] `syncRenderToCanva` pushes both video and frames to Canva
- [ ] Canva Assets appear in the user's Canva Projects after a sync
- [ ] `canva_sync_jobs` rows reflect correct status lifecycle
- [ ] Failures are caught and stored in `error_message`, not thrown to render pipeline
- [ ] `/api/canva/sync/status/:projectId` returns correct aggregated status
- [ ] No TypeScript errors

---

## Next Phase

Proceed to **Phase 19C: Render Hook + UI** once the upload service is verified working end-to-end with a real project.
