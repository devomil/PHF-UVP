import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { db } from '../db';
import { canvaSyncJobs } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { CanvaApiClient } from './canva-api-client';
import { pollUntilDone } from '../utils/canva-poll';
import { extractKeyFrames, cleanupFrames } from '../utils/canva-frame-extractor';

const BUCKET = process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';
const REGION = process.env.REMOTION_AWS_REGION || 'us-east-2';

const s3Client = (process.env.REMOTION_AWS_ACCESS_KEY_ID && process.env.REMOTION_AWS_SECRET_ACCESS_KEY)
  ? new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY!,
      },
    })
  : null;

const FRAME_COUNT = 4;

export interface CanvaSyncResult {
  videoAssetId?: string;
  frameAssetIds: string[];
  errors: string[];
}

export class CanvaAssetService {

  async syncRenderToCanva(params: {
    userId: string;
    projectId: string;
    projectTitle: string;
    renderS3Key: string;
    brandTags?: string[];
  }): Promise<CanvaSyncResult> {
    const { userId, projectId, projectTitle, renderS3Key, brandTags = [] } = params;
    const client = new CanvaApiClient(userId);
    const result: CanvaSyncResult = { frameAssetIds: [], errors: [] };

    console.log(`[CanvaSync] Starting sync for project ${projectId}, user ${userId}`);

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

    let localMp4Path: string | null = null;
    let frames: Awaited<ReturnType<typeof extractKeyFrames>> = [];

    try {
      localMp4Path = await this.downloadS3ToTemp(renderS3Key);
      frames = await extractKeyFrames(localMp4Path, FRAME_COUNT);
      console.log(`[CanvaSync] Extracted ${frames.length} frames`);

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
            name: `${projectTitle} — Key Frame ${i + 1}`,
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
      if (frames.length > 0) await cleanupFrames(frames);
      if (localMp4Path) {
        await fs.promises.unlink(localMp4Path).catch(() => {});
      }
    }

    console.log(
      `[CanvaSync] Complete for ${projectId}. Video: ${result.videoAssetId ?? 'failed'}, ` +
      `Frames: ${result.frameAssetIds.length}/${FRAME_COUNT}, ` +
      `Errors: ${result.errors.length}`
    );

    return result;
  }

  private async uploadVideoFromS3(params: {
    client: CanvaApiClient;
    userId: string;
    projectId: string;
    s3Key: string;
    name: string;
    tags: string[];
  }): Promise<string> {
    const { client, userId, projectId, s3Key, name, tags } = params;

    if (!s3Client) throw new Error('S3 client not configured');

    const [job] = await db.insert(canvaSyncJobs).values({
      userId,
      projectId,
      assetType: 'video',
      assetLabel: name,
      s3Key,
      s3Url: '',
      status: 'uploading',
    }).returning();

    try {
      const { contentLength, publicUrl } = await this.getS3ObjectInfo(s3Key);

      await db.update(canvaSyncJobs)
        .set({ s3Url: publicUrl, attempts: 1 })
        .where(eq(canvaSyncJobs.id, job.id));

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

      await this.streamS3ToCanvaPresigned(s3Key, uploadJob.upload_url, 'video/mp4', contentLength);

      await db.update(canvaSyncJobs)
        .set({ status: 'polling', updatedAt: new Date() })
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

      await client.updateAsset(assetId, { name, tags });

      await db.update(canvaSyncJobs).set({
        status: 'success',
        canvaAssetId: assetId,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(canvaSyncJobs.id, job.id));

      return assetId;
    } catch (err: any) {
      await db.update(canvaSyncJobs).set({
        status: 'failed',
        errorMessage: err.message,
        updatedAt: new Date(),
      }).where(eq(canvaSyncJobs.id, job.id));
      throw err;
    }
  }

  private async uploadImageFromUrl(params: {
    client: CanvaApiClient;
    userId: string;
    projectId: string;
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
      s3Url: url,
      status: 'uploading',
    }).returning();

    try {
      const uploadResponse = await client.createUrlUploadJob({ name, url });

      await db.update(canvaSyncJobs)
        .set({ canvaJobId: uploadResponse.job.id, status: 'polling', attempts: 1, updatedAt: new Date() })
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
        updatedAt: new Date(),
      }).where(eq(canvaSyncJobs.id, job.id));

      return assetId;
    } catch (err: any) {
      await db.update(canvaSyncJobs).set({
        status: 'failed',
        errorMessage: err.message,
        updatedAt: new Date(),
      }).where(eq(canvaSyncJobs.id, job.id));
      throw err;
    }
  }

  private async getS3ObjectInfo(s3Key: string): Promise<{
    contentLength: number;
    publicUrl: string;
  }> {
    if (!s3Client) throw new Error('S3 client not configured');

    const head = await s3Client.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: s3Key })
    );

    const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`;

    return {
      contentLength: head.ContentLength ?? 0,
      publicUrl,
    };
  }

  private async downloadS3ToTemp(s3Key: string): Promise<string> {
    if (!s3Client) throw new Error('S3 client not configured');

    const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
    const response = await s3Client.send(command);

    const tmpPath = path.join(os.tmpdir(), `neuralcut-render-${Date.now()}.mp4`);
    const writeStream = fs.createWriteStream(tmpPath);

    await pipeline(response.Body as Readable, writeStream);
    return tmpPath;
  }

  private async streamS3ToCanvaPresigned(
    s3Key: string,
    presignedUrl: string,
    contentType: string,
    contentLength: number
  ): Promise<void> {
    if (!s3Client) throw new Error('S3 client not configured');

    const MAX_MEMORY_BUFFER = 200 * 1024 * 1024;

    if (contentLength > 0 && contentLength <= MAX_MEMORY_BUFFER) {
      const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
      const response = await s3Client.send(command);

      const chunks: Buffer[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      const putResponse = await fetch(presignedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(buffer.length),
        },
        body: buffer,
      });

      if (!putResponse.ok) {
        throw new Error(`S3 → Canva PUT failed: ${putResponse.status} ${putResponse.statusText}`);
      }
    } else {
      const tmpPath = await this.downloadS3ToTemp(s3Key);
      try {
        const fileBuffer = await fs.promises.readFile(tmpPath);
        const putResponse = await fetch(presignedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(fileBuffer.length),
          },
          body: fileBuffer,
        });

        if (!putResponse.ok) {
          throw new Error(`S3 → Canva PUT failed: ${putResponse.status} ${putResponse.statusText}`);
        }
      } finally {
        await fs.promises.unlink(tmpPath).catch(() => {});
      }
    }
  }

  private async uploadFrameToS3(localPath: string, s3Key: string): Promise<string> {
    if (!s3Client) throw new Error('S3 client not configured');

    const fileBuffer = await fs.promises.readFile(localPath);

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read',
    }));

    return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`;
  }

  async getProjectSyncStatus(projectId: string, userId: string): Promise<{
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
