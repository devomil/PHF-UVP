import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { MicroScene, AssemblyManifest, AssemblyClipTiming } from '../../shared/video-types';

const execAsync = promisify(exec);

const TEMP_DIR = '/tmp/ffmpeg-assembly';
const BUCKET_NAME = process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || "remotionlambda-useast2-1vc2l6a56o";
const REGION = process.env.REMOTION_AWS_REGION || "us-east-2";
const DOWNLOAD_TIMEOUT_MS = 90_000;
const CONCAT_TIMEOUT_MS = 120_000;

function log(msg: string, ...args: any[]) {
  console.log(`[FFmpegAssembly] ${msg}`, ...args);
}

function logError(msg: string, ...args: any[]) {
  console.error(`[FFmpegAssembly] ${msg}`, ...args);
}

class FFmpegAssemblyService {
  private s3Client: S3Client | null = null;

  constructor() {
    this.ensureTempDir();
  }

  private ensureTempDir() {
    try {
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }
    } catch (e) {}
  }

  private getS3Client(): S3Client {
    if (this.s3Client) return this.s3Client;

    const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    this.s3Client = new S3Client({
      region: REGION,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.s3Client;
  }

  private isAllowedUrl(url: string): boolean {
    if (!url || (!url.startsWith('https://') && !url.startsWith('http://'))) {
      return false;
    }
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const blockedPatterns = [
        /^localhost$/i,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2\d|3[01])\./,
        /^192\.168\./,
        /^0\./,
        /^169\.254\./,
        /^::1$/,
        /^fc00:/i,
        /^fe80:/i,
        /metadata\.google/i,
        /\.internal$/i,
      ];
      return !blockedPatterns.some(p => p.test(hostname));
    } catch {
      return false;
    }
  }

  private async downloadClip(url: string, outputPath: string): Promise<boolean> {
    if (!this.isAllowedUrl(url)) {
      logError(`Blocked disallowed URL: ${url.substring(0, 80)}`);
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        logError(`Download failed (${response.status}): ${url.substring(0, 80)}`);
        return false;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
      log(`Downloaded ${sizeMB}MB -> ${path.basename(outputPath)}`);
      return true;
    } catch (err: any) {
      logError(`Download error for ${url.substring(0, 80)}: ${err.message}`);
      return false;
    }
  }

  private async probeClipDuration(filePath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
        { timeout: 15000 }
      );
      const duration = parseFloat(stdout.trim());
      if (isNaN(duration) || duration <= 0) {
        logError(`Invalid probe duration for ${path.basename(filePath)}: ${stdout.trim()}`);
        return 0;
      }
      return duration;
    } catch (err: any) {
      logError(`ffprobe failed for ${path.basename(filePath)}: ${err.message}`);
      return 0;
    }
  }

  private async probeClipResolution(filePath: string): Promise<{ width: number; height: number } | null> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${filePath}"`,
        { timeout: 15000 }
      );
      const parts = stdout.trim().split(',');
      const width = parseInt(parts[0]);
      const height = parseInt(parts[1]);
      if (isNaN(width) || isNaN(height)) return null;
      return { width, height };
    } catch {
      return null;
    }
  }

  async assembleScene(
    sceneId: string,
    microScenes: MicroScene[],
    projectId: string
  ): Promise<AssemblyManifest> {
    const tempFiles: string[] = [];
    const timestamp = Date.now();
    const workDir = path.join(TEMP_DIR, `${projectId}_${sceneId}_${timestamp}`);

    try {
      fs.mkdirSync(workDir, { recursive: true });

      const videosWithUrls = microScenes
        .map((ms, idx) => ({ ms, idx }))
        .filter(({ ms }) => !!ms.videoUrl);

      if (videosWithUrls.length < 2) {
        log(`Scene ${sceneId}: Only ${videosWithUrls.length} micro-scene(s) with video, skipping assembly`);
        return this.createFailedManifest(sceneId, 'Not enough micro-scenes with video (need >=2)');
      }

      log(`Scene ${sceneId}: Assembling ${videosWithUrls.length} micro-scene clips...`);

      const downloadedClips: Array<{
        filePath: string;
        microSceneIndex: number;
        microSceneId: string;
        sourceUrl: string;
        probedDuration: number;
      }> = [];

      for (const { ms, idx } of videosWithUrls) {
        const clipPath = path.join(workDir, `clip_${idx}.mp4`);
        tempFiles.push(clipPath);

        const downloaded = await this.downloadClip(ms.videoUrl!, clipPath);
        if (!downloaded) {
          log(`Scene ${sceneId}: Failed to download clip ${idx}, aborting assembly`);
          return this.createFailedManifest(sceneId, `Failed to download micro-scene ${idx}`);
        }

        const duration = await this.probeClipDuration(clipPath);
        if (duration <= 0) {
          log(`Scene ${sceneId}: Clip ${idx} has invalid duration, aborting`);
          return this.createFailedManifest(sceneId, `Micro-scene ${idx} has invalid duration`);
        }

        downloadedClips.push({
          filePath: clipPath,
          microSceneIndex: idx,
          microSceneId: ms.id,
          sourceUrl: ms.videoUrl!,
          probedDuration: duration,
        });
      }

      const targetRes = await this.determineTargetResolution(downloadedClips.map(c => c.filePath));

      const normalizedClips: string[] = [];
      for (let i = 0; i < downloadedClips.length; i++) {
        const clip = downloadedClips[i];
        const normalizedPath = path.join(workDir, `norm_${i}.mp4`);
        tempFiles.push(normalizedPath);

        await this.normalizeClip(clip.filePath, normalizedPath, targetRes);
        normalizedClips.push(normalizedPath);
      }

      const outputPath = path.join(workDir, `assembled_${sceneId}.mp4`);
      tempFiles.push(outputPath);

      await this.concatClips(normalizedClips, outputPath);

      const totalDuration = await this.probeClipDuration(outputPath);
      if (totalDuration <= 0) {
        return this.createFailedManifest(sceneId, 'Assembled clip has invalid duration');
      }

      const s3Url = await this.uploadToS3(outputPath, projectId, sceneId);
      if (!s3Url) {
        return this.createFailedManifest(sceneId, 'Failed to upload assembled clip to S3');
      }

      let runningTime = 0;
      const clips: AssemblyClipTiming[] = downloadedClips.map((clip) => {
        const startTime = runningTime;
        runningTime += clip.probedDuration;
        return {
          microSceneIndex: clip.microSceneIndex,
          microSceneId: clip.microSceneId,
          startTimeSec: startTime,
          endTimeSec: runningTime,
          durationSec: clip.probedDuration,
          sourceUrl: clip.sourceUrl,
          probedDurationSec: clip.probedDuration,
        };
      });

      const manifest: AssemblyManifest = {
        assemblyFailed: false,
        assembledClipUrl: s3Url,
        totalDurationSec: totalDuration,
        clips,
        sceneId,
        createdAt: new Date().toISOString(),
      };

      log(`Scene ${sceneId}: Assembly complete! ${videosWithUrls.length} clips -> ${totalDuration.toFixed(2)}s, URL: ${s3Url.substring(0, 80)}`);
      return manifest;

    } catch (err: any) {
      logError(`Scene ${sceneId}: Assembly failed: ${err.message}`);
      return this.createFailedManifest(sceneId, err.message);
    } finally {
      this.cleanup(workDir, tempFiles);
    }
  }

  private async determineTargetResolution(clipPaths: string[]): Promise<{ width: number; height: number }> {
    let maxWidth = 0;
    let maxHeight = 0;
    for (const clipPath of clipPaths) {
      const res = await this.probeClipResolution(clipPath);
      if (res) {
        if (res.width > maxWidth) maxWidth = res.width;
        if (res.height > maxHeight) maxHeight = res.height;
      }
    }
    if (maxWidth === 0 || maxHeight === 0) {
      return { width: 1920, height: 1080 };
    }
    maxWidth = Math.round(maxWidth / 2) * 2;
    maxHeight = Math.round(maxHeight / 2) * 2;
    return { width: maxWidth, height: maxHeight };
  }

  private async normalizeClip(
    inputPath: string,
    outputPath: string,
    target: { width: number; height: number }
  ): Promise<void> {
    const cmd = [
      'ffmpeg -y',
      `-i "${inputPath}"`,
      `-vf "scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"`,
      `-c:v libx264 -preset fast -crf 18`,
      `-r 30`,
      `-pix_fmt yuv420p`,
      `-an`,
      `"${outputPath}"`,
    ].join(' ');

    try {
      await execAsync(cmd, { timeout: CONCAT_TIMEOUT_MS });
      log(`Normalized: ${path.basename(inputPath)} -> ${target.width}x${target.height}`);
    } catch (err: any) {
      throw new Error(`Normalize failed for ${path.basename(inputPath)}: ${err.message?.substring(0, 200)}`);
    }
  }

  private async concatClips(clipPaths: string[], outputPath: string): Promise<void> {
    const listContent = clipPaths.map(p => `file '${p}'`).join('\n');
    const listFile = path.join(path.dirname(outputPath), 'concat_list.txt');

    try {
      fs.writeFileSync(listFile, listContent);

      const cmd = [
        'ffmpeg -y',
        `-f concat -safe 0 -i "${listFile}"`,
        `-c copy`,
        `"${outputPath}"`,
      ].join(' ');

      await execAsync(cmd, { timeout: CONCAT_TIMEOUT_MS });

      const stats = fs.statSync(outputPath);
      log(`Concat complete: ${clipPaths.length} clips -> ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
    } finally {
      try { fs.unlinkSync(listFile); } catch {}
    }
  }

  private async uploadToS3(localPath: string, projectId: string, sceneId: string): Promise<string | null> {
    try {
      const s3 = this.getS3Client();
      const key = `video-assets/assembly/${projectId}/${sceneId}_${Date.now()}.mp4`;

      const fileBuffer = fs.readFileSync(localPath);

      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: 'video/mp4',
        ACL: 'public-read',
      }));

      const url = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
      log(`Uploaded to S3: ${url}`);
      return url;
    } catch (err: any) {
      logError(`S3 upload failed: ${err.message}`);
      return null;
    }
  }

  private createFailedManifest(sceneId: string, error: string): AssemblyManifest {
    log(`Creating failed manifest for scene ${sceneId}: ${error}`);
    return {
      assemblyFailed: true,
      totalDurationSec: 0,
      clips: [],
      sceneId,
      createdAt: new Date().toISOString(),
      error,
    };
  }

  private cleanup(workDir: string, tempFiles: string[]) {
    for (const f of tempFiles) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
    try { if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

export const ffmpegAssemblyService = new FFmpegAssemblyService();
