import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { remotionLambdaService } from "./remotion-lambda-service";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { calculateEffectiveDuration } from "../../shared/config/duration-math";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const REGION = process.env.REMOTION_AWS_REGION || "us-east-2";
const BUCKET_NAME = process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || "remotionlambda-useast2-1vc2l6a56o";
const TEMP_DIR = "/tmp/video-chunks";
export const MAX_CHUNK_DURATION_SEC = 120;
export const CHUNK_THRESHOLD_SEC = 90;

export interface ChunkConfig {
  chunkIndex: number;
  startFrame: number;
  endFrame: number;
  scenes: any[];
  startTimeSeconds: number;
  endTimeSeconds: number;
  frameRange?: [number, number];
}

export interface ChunkResult {
  chunkIndex: number;
  s3Url: string;
  localPath: string;
  success: boolean;
  error?: string;
  renderTimeMs?: number;
}

export interface ChunkedRenderProgress {
  phase: 'preparing' | 'rendering' | 'downloading' | 'concatenating' | 'uploading' | 'complete' | 'error';
  totalChunks: number;
  completedChunks: number;
  currentChunk?: number;
  overallPercent: number;
  message: string;
  error?: string;
}

export interface LambdaChunkState {
  chunkIndex: number;
  renderId: string;
  bucketName: string;
  status: 'pending' | 'rendering' | 'complete' | 'failed';
  outputUrl?: string;
  startedAt: number;
}

export interface ChunkedRenderState {
  projectId: string;
  compositionId: string;
  totalChunks: number;
  chunks: ChunkConfig[];
  activeChunk: LambdaChunkState | null;
  completedChunks: ChunkResult[];
  inputProps: Record<string, any>;
  startedAt: number;
}

class ChunkedRenderService {
  private s3Client: S3Client | null = null;

  constructor() {
    this.ensureTempDirectory();
  }

  private getS3Client(): S3Client {
    const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error("[ChunkedRender] AWS credentials not configured - REMOTION_AWS_ACCESS_KEY_ID and REMOTION_AWS_SECRET_ACCESS_KEY required");
    }

    if (!this.s3Client) {
      this.s3Client = new S3Client({
        region: REGION,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }

    return this.s3Client;
  }

  private ensureTempDirectory(): void {
    try {
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
        console.log(`[ChunkedRender] Created temp directory: ${TEMP_DIR}`);
      }
    } catch (error) {
      console.error("[ChunkedRender] Failed to create temp directory:", error);
    }
  }

  shouldUseChunkedRendering(scenes: any[], thresholdSeconds: number = CHUNK_THRESHOLD_SEC, transitions?: any[]): boolean {
    const totalDuration = calculateEffectiveDuration(scenes, transitions);
    const shouldChunk = totalDuration > thresholdSeconds;
    console.log(`[ChunkedRender] Total duration: ${totalDuration}s, threshold: ${thresholdSeconds}s, use chunked: ${shouldChunk}`);
    return shouldChunk;
  }

  calculateChunks(scenes: any[], fps: number = 30, maxChunkDurationSec: number = MAX_CHUNK_DURATION_SEC): ChunkConfig[] {
    const MAX_VIDEO_CHUNK_SEC = 30;
    const chunks: ChunkConfig[] = [];
    let currentChunk: ChunkConfig = {
      chunkIndex: 0,
      startFrame: 0,
      endFrame: 0,
      scenes: [],
      startTimeSeconds: 0,
      endTimeSeconds: 0,
    };
    let chunkDuration = 0;
    let globalFrame = 0;
    let globalTime = 0;

    for (const scene of scenes) {
      const sceneDuration = scene.duration || 0;
      const sceneFrames = Math.round(sceneDuration * fps);
      const sceneHasVideo = scene.background?.type === 'video' || scene.assets?.videoUrl || 
        (scene.microScenes && scene.microScenes.some((ms: any) => ms.videoUrl));

      if (sceneHasVideo && sceneDuration > MAX_VIDEO_CHUNK_SEC) {
        if (currentChunk.scenes.length > 0) {
          currentChunk.endFrame = globalFrame - 1;
          currentChunk.endTimeSeconds = globalTime;
          chunks.push({ ...currentChunk });
        }

        const numSubChunks = Math.ceil(sceneDuration / MAX_VIDEO_CHUNK_SEC);
        const framesPerSubChunk = Math.ceil(sceneFrames / numSubChunks);
        console.log(`[ChunkedRender] Splitting ${sceneDuration.toFixed(1)}s video scene into ${numSubChunks} frame-range sub-chunks (~${(sceneDuration / numSubChunks).toFixed(1)}s each)`);

        for (let sc = 0; sc < numSubChunks; sc++) {
          const rangeStart = sc * framesPerSubChunk;
          const rangeEnd = Math.min((sc + 1) * framesPerSubChunk - 1, sceneFrames - 1);
          const subChunkDur = (rangeEnd - rangeStart + 1) / fps;

          const sceneWithAdjustedTiming = {
            ...scene,
            chunkStartFrame: 0,
          };

          chunks.push({
            chunkIndex: chunks.length,
            startFrame: globalFrame + rangeStart,
            endFrame: globalFrame + rangeEnd,
            scenes: [sceneWithAdjustedTiming],
            startTimeSeconds: globalTime + (rangeStart / fps),
            endTimeSeconds: globalTime + ((rangeEnd + 1) / fps),
            frameRange: [rangeStart, rangeEnd],
          });
        }

        globalFrame += sceneFrames;
        globalTime += sceneDuration;
        currentChunk = {
          chunkIndex: chunks.length,
          startFrame: globalFrame,
          endFrame: 0,
          scenes: [],
          startTimeSeconds: globalTime,
          endTimeSeconds: 0,
        };
        chunkDuration = 0;
        continue;
      }

      if (chunkDuration + sceneDuration > maxChunkDurationSec && currentChunk.scenes.length > 0) {
        currentChunk.endFrame = globalFrame - 1;
        currentChunk.endTimeSeconds = globalTime;
        chunks.push({ ...currentChunk });

        currentChunk = {
          chunkIndex: chunks.length,
          startFrame: globalFrame,
          endFrame: 0,
          scenes: [],
          startTimeSeconds: globalTime,
          endTimeSeconds: 0,
        };
        chunkDuration = 0;
      }

      const sceneWithAdjustedTiming = {
        ...scene,
        chunkStartFrame: currentChunk.scenes.length === 0 ? 0 : 
          currentChunk.scenes.reduce((acc: number, s: any) => acc + Math.round((s.duration || 0) * fps), 0),
      };

      currentChunk.scenes.push(sceneWithAdjustedTiming);
      chunkDuration += sceneDuration;
      globalFrame += sceneFrames;
      globalTime += sceneDuration;
    }

    if (currentChunk.scenes.length > 0) {
      currentChunk.endFrame = globalFrame - 1;
      currentChunk.endTimeSeconds = globalTime;
      chunks.push(currentChunk);
    }

    console.log(`[ChunkedRender] Calculated ${chunks.length} chunks from ${scenes.length} scenes`);
    chunks.forEach((chunk, idx) => {
      const chunkDur = chunk.scenes.reduce((acc: number, s: any) => acc + (s.duration || 0), 0);
      const rangeInfo = chunk.frameRange ? ` [frameRange: ${chunk.frameRange[0]}-${chunk.frameRange[1]}]` : '';
      console.log(`[ChunkedRender] Chunk ${idx}: ${chunk.scenes.length} scenes, ${chunkDur.toFixed(1)}s, frames ${chunk.startFrame}-${chunk.endFrame}${rangeInfo}, time ${chunk.startTimeSeconds.toFixed(1)}s-${chunk.endTimeSeconds.toFixed(1)}s`);
    });

    return chunks;
  }

  buildChunkInputProps(chunk: ChunkConfig, inputProps: Record<string, any>): Record<string, any> {
    const chunkSceneIds = new Set(chunk.scenes.map((s: any) => s.id));
    let filteredOverlayConfigs: Record<string, any> | undefined;
    if (inputProps.sceneOverlayConfigs) {
      filteredOverlayConfigs = {};
      for (const [sceneId, config] of Object.entries(inputProps.sceneOverlayConfigs)) {
        if (chunkSceneIds.has(sceneId)) {
          filteredOverlayConfigs[sceneId] = config;
        }
      }
    }

    let chunkTransitions: any[] | undefined;
    if (inputProps.transitions && Array.isArray(inputProps.transitions)) {
      const allScenes = inputProps.scenes || [];
      const chunkSceneIndices = chunk.scenes.map((cs: any) => allScenes.findIndex((s: any) => s.id === cs.id));
      chunkTransitions = [];
      for (let i = 0; i < chunk.scenes.length - 1; i++) {
        const globalIdx = chunkSceneIndices[i];
        if (globalIdx >= 0 && globalIdx < inputProps.transitions.length) {
          chunkTransitions.push(inputProps.transitions[globalIdx]);
        }
      }
    }

    const chunkInputProps: any = {
      ...inputProps,
      scenes: chunk.scenes,
      isChunk: true,
      chunkIndex: chunk.chunkIndex,
      sceneOverlayConfigs: filteredOverlayConfigs,
      transitions: chunkTransitions,
      voiceoverRanges: undefined,
      voiceoverUrl: null,
      musicUrl: null,
      musicVolume: 0,
      audioDuckingKeyframes: undefined,
      endCardConfig: chunk.chunkIndex === (inputProps._totalChunks || 999) - 1 ? inputProps.endCardConfig : { enabled: false },
    };

    chunkInputProps.soundDesignConfig = {
      ...(chunkInputProps.soundDesignConfig || {}),
      enabled: false,
      ambientLayer: false,
      transitionSounds: false,
      impactSounds: false,
    };
    chunkInputProps.soundEffectsBaseUrl = undefined;

    if (chunkInputProps.scenes && Array.isArray(chunkInputProps.scenes)) {
      chunkInputProps.scenes = chunkInputProps.scenes.map((scene: any) => {
        const { soundDesign, ...sceneWithoutSound } = scene;
        return sceneWithoutSound;
      });
    }

    // Log chunk payload size for debugging
    const chunkPayloadSize = JSON.stringify(chunkInputProps).length;
    console.log(`[ChunkedRender] Chunk ${chunk.chunkIndex} payload size: ${Math.round(chunkPayloadSize / 1024)} KB`);

    return chunkInputProps;
  }

  async startChunkRender(
    chunk: ChunkConfig,
    inputProps: Record<string, any>,
    compositionId: string,
    serveUrlOverride?: string
  ): Promise<{ renderId: string; bucketName: string }> {
    const rangeInfo = chunk.frameRange ? ` [frameRange: ${chunk.frameRange[0]}-${chunk.frameRange[1]}]` : '';
    console.log(`[ChunkedRender] Starting Lambda render for chunk ${chunk.chunkIndex} with ${chunk.scenes.length} scenes${rangeInfo}...`);

    const chunkInputProps = this.buildChunkInputProps(chunk, inputProps);

    const result = await remotionLambdaService.startRender({
      compositionId,
      inputProps: chunkInputProps,
      serveUrlOverride,
      frameRange: chunk.frameRange,
    });

    console.log(`[ChunkedRender] Chunk ${chunk.chunkIndex} render started: renderId=${result.renderId}`);
    return result;
  }

  async pollChunkRender(
    renderId: string,
    bucketName: string,
    chunkIndex: number,
    onLambdaProgress?: (lambdaPercent: number) => void | Promise<void>
  ): Promise<string> {
    console.log(`[ChunkedRender] Polling chunk ${chunkIndex} render ${renderId} to completion...`);

    const outputUrl = await remotionLambdaService.pollRenderToCompletion(
      renderId,
      bucketName,
      onLambdaProgress
    );

    console.log(`[ChunkedRender] Chunk ${chunkIndex} render complete: ${outputUrl}`);
    return outputUrl;
  }

  async checkChunkRenderStatus(renderId: string, bucketName: string): Promise<{
    status: 'in_progress' | 'complete' | 'failed' | 'not_found';
    progress: number;
    outputUrl?: string;
    error?: string;
  }> {
    try {
      const progress = await remotionLambdaService.getRenderProgress(renderId, bucketName);

      if (progress.errors.length > 0) {
        return {
          status: 'failed',
          progress: Math.round(progress.overallProgress * 100),
          error: progress.errors.join(', '),
        };
      }

      if (progress.done && progress.outputFile) {
        return {
          status: 'complete',
          progress: 100,
          outputUrl: progress.outputFile,
        };
      }

      if (progress.done && !progress.outputFile) {
        return {
          status: 'failed',
          progress: Math.round(progress.overallProgress * 100),
          error: 'Render completed but no output file generated',
        };
      }

      return {
        status: 'in_progress',
        progress: Math.round(progress.overallProgress * 100),
      };
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      if (errorMsg.includes('not found') || errorMsg.includes('NoSuchKey') || errorMsg.includes('does not exist')) {
        return {
          status: 'not_found',
          progress: 0,
          error: 'Render not found on Lambda',
        };
      }
      throw error;
    }
  }

  async renderChunk(
    chunk: ChunkConfig,
    inputProps: Record<string, any>,
    compositionId: string,
    onLambdaProgress?: (lambdaPercent: number) => void
  ): Promise<ChunkResult> {
    const startTime = Date.now();
    const maxRetries = 5;
    let lastError: Error | null = null;
    
    console.log(`[ChunkedRender] Rendering chunk ${chunk.chunkIndex} with ${chunk.scenes.length} scenes...`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const chunkInputProps = this.buildChunkInputProps(chunk, inputProps);

        const outputUrl = await remotionLambdaService.renderVideo({
          compositionId,
          inputProps: chunkInputProps,
          onPollProgress: onLambdaProgress,
        });

        const renderTimeMs = Date.now() - startTime;
        console.log(`[ChunkedRender] Chunk ${chunk.chunkIndex} completed in ${(renderTimeMs / 1000).toFixed(1)}s: ${outputUrl}`);

        return {
          chunkIndex: chunk.chunkIndex,
          s3Url: outputUrl,
          localPath: "",
          success: true,
          renderTimeMs,
        };
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || String(error);
        
        const isRateLimitError = 
          errorMessage.includes('Rate Exceeded') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('Concurrency limit') ||
          errorMessage.includes('TooManyRequestsException') ||
          errorMessage.includes('Lambda is currently busy') ||
          errorMessage.includes('ConcurrentInvocationLimitExceeded');

        if (isRateLimitError && attempt < maxRetries) {
          const delay = Math.min(30000 * Math.pow(2, attempt - 1), 120000);
          console.log(`[ChunkedRender] Chunk ${chunk.chunkIndex} hit rate limit, waiting ${delay/1000}s before retry ${attempt + 1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        console.error(`[ChunkedRender] Chunk ${chunk.chunkIndex} failed (attempt ${attempt}/${maxRetries}):`, error);
        
        if (attempt < maxRetries && !isRateLimitError) {
          const delay = 10000;
          console.log(`[ChunkedRender] Retrying chunk ${chunk.chunkIndex} in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    const renderTimeMs = Date.now() - startTime;
    return {
      chunkIndex: chunk.chunkIndex,
      s3Url: "",
      localPath: "",
      success: false,
      error: lastError?.message || "Unknown error after all retries",
      renderTimeMs,
    };
  }

  async downloadChunk(s3Url: string, chunkIndex: number): Promise<string> {
    const localPath = path.join(TEMP_DIR, `chunk_${chunkIndex}_${Date.now()}.mp4`);
    console.log(`[ChunkedRender] Downloading chunk ${chunkIndex} from ${s3Url.substring(0, 60)}...`);

    try {
      const urlParts = s3Url.match(/https?:\/\/([^.]+)\.s3\.([^.]+)\.amazonaws\.com\/(.+)/);
      if (!urlParts) {
        const response = await fetch(s3Url);
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(localPath, Buffer.from(buffer));
      } else {
        const [, bucket, region, key] = urlParts;
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: decodeURIComponent(key),
        });

        const response = await this.getS3Client().send(command);
        const stream = response.Body as NodeJS.ReadableStream;
        
        await new Promise<void>((resolve, reject) => {
          const writeStream = fs.createWriteStream(localPath);
          stream.pipe(writeStream);
          writeStream.on("finish", resolve);
          writeStream.on("error", reject);
        });
      }

      const stats = fs.statSync(localPath);
      console.log(`[ChunkedRender] Downloaded chunk ${chunkIndex}: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      return localPath;
    } catch (error) {
      console.error(`[ChunkedRender] Failed to download chunk ${chunkIndex}:`, error);
      throw error;
    }
  }

  async concatenateChunks(chunkPaths: string[], outputPath: string): Promise<void> {
    console.log(`[ChunkedRender] Concatenating ${chunkPaths.length} chunks...`);

    const listFile = path.join(TEMP_DIR, `concat_list_${Date.now()}.txt`);
    const listContent = chunkPaths.map(p => `file '${p}'`).join("\n");
    fs.writeFileSync(listFile, listContent);

    try {
      const ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`;
      console.log(`[ChunkedRender] Running FFmpeg: ${ffmpegCmd}`);

      const { stdout, stderr } = await execAsync(ffmpegCmd, { maxBuffer: 50 * 1024 * 1024 });
      
      if (stderr) {
        console.log(`[ChunkedRender] FFmpeg stderr:`, stderr.substring(0, 500));
      }

      const stats = fs.statSync(outputPath);
      console.log(`[ChunkedRender] Concatenation complete: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } finally {
      try {
        fs.unlinkSync(listFile);
      } catch (e) {
      }
    }
  }

  async downloadAudioFile(url: string, label: string): Promise<string | null> {
    if (!url) return null;
    const localPath = path.join(TEMP_DIR, `${label}_${Date.now()}.mp3`);
    console.log(`[ChunkedRender] Downloading ${label} from ${url.substring(0, 80)}...`);

    try {
      const urlParts = url.match(/https?:\/\/([^.]+)\.s3\.([^.]+)\.amazonaws\.com\/(.+)/);
      if (!urlParts) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(localPath, Buffer.from(buffer));
      } else {
        const [, bucket, region, key] = urlParts;
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: decodeURIComponent(key),
        });
        const response = await this.getS3Client().send(command);
        const stream = response.Body as NodeJS.ReadableStream;
        await new Promise<void>((resolve, reject) => {
          const writeStream = fs.createWriteStream(localPath);
          stream.pipe(writeStream);
          writeStream.on("finish", resolve);
          writeStream.on("error", reject);
        });
      }
      const stats = fs.statSync(localPath);
      console.log(`[ChunkedRender] Downloaded ${label}: ${(stats.size / 1024).toFixed(1)} KB`);
      return localPath;
    } catch (error) {
      console.warn(`[ChunkedRender] Failed to download ${label}:`, error);
      return null;
    }
  }

  async mixAudioIntoVideo(
    videoPath: string,
    voiceoverPath: string | null,
    musicPath: string | null,
    musicVolume: number,
    outputPath: string
  ): Promise<void> {
    console.log(`[ChunkedRender] Mixing audio into final video (voiceover: ${!!voiceoverPath}, music: ${!!musicPath}, musicVol: ${musicVolume})...`);

    if (!voiceoverPath && !musicPath) {
      fs.copyFileSync(videoPath, outputPath);
      console.log(`[ChunkedRender] No audio to mix, copied video as-is`);
      return;
    }

    const args: string[] = ['-y', '-i', videoPath];
    if (voiceoverPath) args.push('-i', voiceoverPath);
    if (musicPath) args.push('-i', musicPath);

    if (voiceoverPath && musicPath) {
      const volFilter = Math.max(0.01, Math.min(1, musicVolume)).toFixed(2);
      args.push(
        '-filter_complex',
        `[1:a]aresample=44100[vo];[2:a]aresample=44100,volume=${volFilter}[mu];[vo][mu]amix=inputs=2:duration=longest:dropout_transition=2[aout]`,
        '-map', '0:v', '-map', '[aout]'
      );
    } else if (voiceoverPath) {
      args.push('-map', '0:v', '-map', '1:a');
    } else if (musicPath) {
      const volFilter = Math.max(0.01, Math.min(1, musicVolume)).toFixed(2);
      args.push(
        '-filter_complex', `[1:a]volume=${volFilter}[mu]`,
        '-map', '0:v', '-map', '[mu]'
      );
    }

    args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', outputPath);
    console.log(`[ChunkedRender] Running FFmpeg audio mix with ${args.length} args...`);

    try {
      const { stderr } = await execFileAsync('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 });
      if (stderr) {
        console.log(`[ChunkedRender] FFmpeg audio mix stderr:`, stderr.substring(0, 500));
      }
      const stats = fs.statSync(outputPath);
      console.log(`[ChunkedRender] Audio mix complete: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } catch (error: any) {
      console.error(`[ChunkedRender] Audio mix failed, falling back to video-only:`, error.message);
      fs.copyFileSync(videoPath, outputPath);
    }
  }

  async mixAudioPostConcat(
    concatVideoPath: string,
    voiceoverUrl: string | null,
    musicUrl: string | null,
    musicVolume: number,
    projectId: string,
    totalChunks: number,
    tempFiles: string[],
    updateProgress: (progress: ChunkedRenderProgress) => Promise<void>
  ): Promise<string> {
    if (!voiceoverUrl && !musicUrl) {
      return concatVideoPath;
    }

    await updateProgress({
      phase: 'concatenating',
      totalChunks,
      completedChunks: totalChunks,
      overallPercent: 83,
      message: 'Downloading audio tracks...',
    });

    const [voiceoverPath, musicPath] = await Promise.all([
      voiceoverUrl ? this.downloadAudioFile(voiceoverUrl, 'voiceover') : Promise.resolve(null),
      musicUrl ? this.downloadAudioFile(musicUrl, 'music') : Promise.resolve(null),
    ]);
    if (voiceoverPath) tempFiles.push(voiceoverPath);
    if (musicPath) tempFiles.push(musicPath);

    if (!voiceoverPath && !musicPath) {
      return concatVideoPath;
    }

    await updateProgress({
      phase: 'concatenating',
      totalChunks,
      completedChunks: totalChunks,
      overallPercent: 86,
      message: 'Mixing audio into video...',
    });

    const mixedPath = path.join(TEMP_DIR, `mixed_${projectId}_${Date.now()}.mp4`);
    tempFiles.push(mixedPath);
    await this.mixAudioIntoVideo(concatVideoPath, voiceoverPath, musicPath, musicVolume, mixedPath);
    return mixedPath;
  }

  async uploadFinalVideo(localPath: string, projectId: string): Promise<string> {
    const key = `renders/chunked/${projectId}_${Date.now()}.mp4`;
    console.log(`[ChunkedRender] Uploading final video to S3: ${key}`);

    const fileBuffer = fs.readFileSync(localPath);

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: "video/mp4",
      ACL: "public-read",
    });

    await this.getS3Client().send(command);

    const url = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
    console.log(`[ChunkedRender] Upload complete: ${url}`);

    return url;
  }

  cleanupTempFiles(paths: string[]): void {
    console.log(`[ChunkedRender] Cleaning up ${paths.length} temp files...`);
    for (const filePath of paths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn(`[ChunkedRender] Failed to delete temp file ${filePath}:`, error);
      }
    }
  }

  async renderLongVideo(
    projectId: string,
    inputProps: Record<string, any>,
    compositionId: string,
    onProgress?: (progress: ChunkedRenderProgress) => void | Promise<void>,
    onChunkLambdaStarted?: (state: LambdaChunkState) => Promise<void>,
    onChunkComplete?: (chunkResult: ChunkResult) => Promise<void>
  ): Promise<string> {
    const scenes = inputProps.scenes || [];
    const fps = inputProps.fps || 30;
    const tempFiles: string[] = [];

    const updateProgress = async (progress: ChunkedRenderProgress) => {
      console.log(`[ChunkedRender] Progress: ${progress.phase} - ${progress.overallPercent}% - ${progress.message}`);
      if (onProgress) {
        try {
          await onProgress(progress);
        } catch (e: any) {
          console.error(`[ChunkedRender] Failed to save progress: ${e.message}`);
        }
      }
    };

    try {
      await updateProgress({
        phase: 'preparing',
        totalChunks: 0,
        completedChunks: 0,
        overallPercent: 5,
        message: 'Calculating chunks...',
      });

      const chunks = this.calculateChunks(scenes, fps);
      const totalChunks = chunks.length;

      // Pass total chunks count so buildChunkInputProps knows which is the last chunk
      inputProps._totalChunks = totalChunks;

      await updateProgress({
        phase: 'rendering',
        totalChunks,
        completedChunks: 0,
        overallPercent: 10,
        message: `Starting render of ${totalChunks} chunks...`,
      });

      const chunkResults: ChunkResult[] = [];
      const INTER_CHUNK_COOLDOWN_MS = 15000;
      const MAX_CHUNK_RETRIES = 3;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        if (i > 0) {
          console.log(`[ChunkedRender] Waiting ${INTER_CHUNK_COOLDOWN_MS / 1000}s between chunks to avoid rate limits...`);
          await new Promise(resolve => setTimeout(resolve, INTER_CHUNK_COOLDOWN_MS));
        }
        
        await updateProgress({
          phase: 'rendering',
          totalChunks,
          completedChunks: i,
          currentChunk: i,
          overallPercent: 10 + Math.round((i / totalChunks) * 50),
          message: `Rendering chunk ${i + 1} of ${totalChunks}...`,
        });

        let chunkSucceeded = false;

        for (let chunkAttempt = 1; chunkAttempt <= MAX_CHUNK_RETRIES; chunkAttempt++) {
          const chunkStartTime = Date.now();

          try {
            const { renderId, bucketName } = await this.startChunkRender(chunk, inputProps, compositionId);

            if (onChunkLambdaStarted) {
              await onChunkLambdaStarted({
                chunkIndex: i,
                renderId,
                bucketName,
                status: 'rendering',
                startedAt: chunkStartTime,
              });
            }

            const outputUrl = await this.pollChunkRender(
              renderId,
              bucketName,
              i,
              async (lambdaPct: number) => {
                const chunkContribution = 50 / totalChunks;
                const overallPct = 10 + Math.round((i / totalChunks) * 50) + Math.round((lambdaPct / 100) * chunkContribution);
                await updateProgress({
                  phase: 'rendering',
                  totalChunks,
                  completedChunks: i,
                  currentChunk: i,
                  overallPercent: Math.min(overallPct, 59),
                  message: `Rendering chunk ${i + 1} of ${totalChunks} (${lambdaPct}%)...`,
                });
              }
            );

            const result: ChunkResult = {
              chunkIndex: i,
              s3Url: outputUrl,
              localPath: "",
              success: true,
              renderTimeMs: Date.now() - chunkStartTime,
            };

            chunkResults.push(result);

            if (onChunkComplete) {
              await onChunkComplete(result);
            }

            chunkSucceeded = true;
            break;
          } catch (chunkError: any) {
            const renderTimeMs = Date.now() - chunkStartTime;
            const errorMessage = chunkError?.message || String(chunkError);

            const isRateLimitError =
              errorMessage.includes('Rate Exceeded') ||
              errorMessage.includes('rate limit') ||
              errorMessage.includes('Concurrency limit') ||
              errorMessage.includes('TooManyRequestsException') ||
              errorMessage.includes('ConcurrentInvocationLimitExceeded');

            const isTimeoutError =
              errorMessage.includes('timed out') ||
              errorMessage.includes('TimeoutError') ||
              errorMessage.includes('timeout');

            const isRetryableError = isRateLimitError || isTimeoutError;

            if (isRetryableError && chunkAttempt < MAX_CHUNK_RETRIES) {
              const cooldown = isRateLimitError ? 60000 * chunkAttempt : 30000;
              const reason = isRateLimitError ? 'rate limited' : 'timed out';
              console.warn(`[ChunkedRender] Chunk ${i} ${reason} (attempt ${chunkAttempt}/${MAX_CHUNK_RETRIES}), cooling down ${cooldown / 1000}s before retry...`);
              await updateProgress({
                phase: 'rendering',
                totalChunks,
                completedChunks: i,
                currentChunk: i,
                overallPercent: 10 + Math.round((i / totalChunks) * 50),
                message: `Chunk ${i + 1} ${reason}, retrying in ${cooldown / 1000}s (attempt ${chunkAttempt + 1}/${MAX_CHUNK_RETRIES})...`,
              });
              await new Promise(resolve => setTimeout(resolve, cooldown));
              continue;
            }

            console.error(`[ChunkedRender] Chunk ${i} failed after ${(renderTimeMs / 1000).toFixed(1)}s (attempt ${chunkAttempt}/${MAX_CHUNK_RETRIES}): ${chunkError.message}`);

            await updateProgress({
              phase: 'error',
              totalChunks,
              completedChunks: chunkResults.length,
              currentChunk: i,
              overallPercent: 10 + Math.round((i / totalChunks) * 50),
              message: `Chunk ${i + 1}/${totalChunks} failed: ${chunkError.message}`,
              error: chunkError.message,
            });

            throw new Error(`Chunk ${i + 1}/${totalChunks} failed after ${chunkAttempt} attempts: ${chunkError.message}`);
          }
        }

        if (!chunkSucceeded) {
          throw new Error(`Chunk ${i + 1}/${totalChunks} failed after ${MAX_CHUNK_RETRIES} attempts`);
        }
      }

      await updateProgress({
        phase: 'downloading',
        totalChunks,
        completedChunks: totalChunks,
        overallPercent: 60,
        message: 'Downloading rendered chunks...',
      });

      const chunkPaths: string[] = [];
      for (let i = 0; i < chunkResults.length; i++) {
        const result = chunkResults[i];
        
        await updateProgress({
          phase: 'downloading',
          totalChunks,
          completedChunks: totalChunks,
          currentChunk: i,
          overallPercent: 60 + Math.round((i / totalChunks) * 15),
          message: `Downloading chunk ${i + 1} of ${totalChunks}...`,
        });

        const localPath = await this.downloadChunk(result.s3Url, result.chunkIndex);
        chunkPaths.push(localPath);
        tempFiles.push(localPath);
      }

      await updateProgress({
        phase: 'concatenating',
        totalChunks,
        completedChunks: totalChunks,
        overallPercent: 80,
        message: 'Concatenating video chunks...',
      });

      const concatPath = path.join(TEMP_DIR, `concat_${projectId}_${Date.now()}.mp4`);
      tempFiles.push(concatPath);
      await this.concatenateChunks(chunkPaths, concatPath);

      const finalVideoPath = await this.mixAudioPostConcat(
        concatPath,
        inputProps.voiceoverUrl || null,
        inputProps.musicUrl || null,
        inputProps.musicVolume ?? 0.18,
        projectId, totalChunks, tempFiles, updateProgress
      );

      await updateProgress({
        phase: 'uploading',
        totalChunks,
        completedChunks: totalChunks,
        overallPercent: 90,
        message: 'Uploading final video...',
      });

      const finalUrl = await this.uploadFinalVideo(finalVideoPath, projectId);

      await updateProgress({
        phase: 'complete',
        totalChunks,
        completedChunks: totalChunks,
        overallPercent: 100,
        message: 'Video rendering complete!',
      });

      return finalUrl;
    } catch (error: any) {
      await updateProgress({
        phase: 'error',
        totalChunks: 0,
        completedChunks: 0,
        overallPercent: 0,
        message: 'Render failed',
        error: error.message,
      });
      throw error;
    } finally {
      this.cleanupTempFiles(tempFiles);
    }
  }

  async resumeFromCompletedChunks(
    projectId: string,
    completedChunkResults: ChunkResult[],
    totalChunks: number,
    onProgress?: (progress: ChunkedRenderProgress) => void | Promise<void>,
    audioConfig?: { voiceoverUrl?: string | null; musicUrl?: string | null; musicVolume?: number }
  ): Promise<string> {
    const tempFiles: string[] = [];

    const updateProgress = async (progress: ChunkedRenderProgress) => {
      console.log(`[ChunkedRender] Resume progress: ${progress.phase} - ${progress.overallPercent}% - ${progress.message}`);
      if (onProgress) {
        try {
          await onProgress(progress);
        } catch (e: any) {
          console.error(`[ChunkedRender] Failed to save resume progress: ${e.message}`);
        }
      }
    };

    try {
      await updateProgress({
        phase: 'downloading',
        totalChunks,
        completedChunks: totalChunks,
        overallPercent: 60,
        message: 'Downloading rendered chunks...',
      });

      const chunkPaths: string[] = [];
      const sorted = [...completedChunkResults].sort((a, b) => a.chunkIndex - b.chunkIndex);
      
      for (let i = 0; i < sorted.length; i++) {
        const result = sorted[i];
        await updateProgress({
          phase: 'downloading',
          totalChunks,
          completedChunks: totalChunks,
          currentChunk: i,
          overallPercent: 60 + Math.round((i / totalChunks) * 15),
          message: `Downloading chunk ${i + 1} of ${totalChunks}...`,
        });

        const localPath = await this.downloadChunk(result.s3Url, result.chunkIndex);
        chunkPaths.push(localPath);
        tempFiles.push(localPath);
      }

      await updateProgress({
        phase: 'concatenating',
        totalChunks,
        completedChunks: totalChunks,
        overallPercent: 80,
        message: 'Concatenating video chunks...',
      });

      const concatPath = path.join(TEMP_DIR, `concat_resume_${projectId}_${Date.now()}.mp4`);
      tempFiles.push(concatPath);
      await this.concatenateChunks(chunkPaths, concatPath);

      const finalVideoPath = await this.mixAudioPostConcat(
        concatPath,
        audioConfig?.voiceoverUrl || null,
        audioConfig?.musicUrl || null,
        audioConfig?.musicVolume ?? 0.18,
        projectId, totalChunks, tempFiles, updateProgress
      );

      await updateProgress({
        phase: 'uploading',
        totalChunks,
        completedChunks: totalChunks,
        overallPercent: 90,
        message: 'Uploading final video...',
      });

      const finalUrl = await this.uploadFinalVideo(finalVideoPath, projectId);

      await updateProgress({
        phase: 'complete',
        totalChunks,
        completedChunks: totalChunks,
        overallPercent: 100,
        message: 'Video rendering complete!',
      });

      return finalUrl;
    } catch (error: any) {
      await updateProgress({
        phase: 'error',
        totalChunks: 0,
        completedChunks: 0,
        overallPercent: 0,
        message: 'Resume render failed',
        error: error.message,
      });
      throw error;
    } finally {
      this.cleanupTempFiles(tempFiles);
    }
  }
}

export const chunkedRenderService = new ChunkedRenderService();
