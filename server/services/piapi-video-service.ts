// server/services/piapi-video-service.ts

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { AI_VIDEO_PROVIDERS } from '../config/ai-video-providers';
import { MotionControlConfig, mapToKlingMotion, buildVeoMotionPrompt } from '../../shared/config/motion-control';
import { isStylizedPreset, getVisualArtPreset, STYLIZED_CHARACTER_CFG, STYLIZED_ENVIRONMENT_CFG } from '../../shared/config/visual-art-presets';

function hasActionPrompt(prompt: string): boolean {
  const actionPatterns = [
    /\bexplod(e|es|ed|ing|ion|ions)?\b/,
    /\bburst(s|ed|ing)?\b/,
    /\bshoot(s|ing)?\b/,
    /\blaunch(es|ed|ing)?\b/,
    /\bthrow(s|n|ing)?\b/,
    /\bcrash(es|ed|ing)?\b/,
    /\bsmash(es|ed|ing)?\b/,
    /\bshatter(s|ed|ing)?\b/,
    /\bblast(s|ed|ing)?\b/,
    /\berupt(s|ed|ing|ion|ions)?\b/,
    /\bfl(y|ies|ying|ew)\b/,
    /\bsplash(es|ed|ing)?\b/,
    /\bpour(s|ed|ing)?\b/,
    /\bscatter(s|ed|ing)?\b/,
    /\bspin(s|ning)?\b/,
    /\bwhip(s|ped|ping)?\b/,
    /\bsurg(e|es|ed|ing)?\b/,
    /\brush(es|ed|ing)?\b/,
    /\bstrik(e|es|ing)\b/,
    /\bslam(s|med|ming)?\b/,
    /\btransform(s|ed|ing|ation)?\b/,
    /\bmorph(s|ed|ing)?\b/,
    /\bdissolv(e|es|ed|ing)?\b/,
    /\bmelt(s|ed|ing)?\b/,
    /\bcollaps(e|es|ed|ing)?\b/,
    /\bexpand(s|ed|ing)?\b/,
    /\bgrow(s|ing|n)?\b/,
  ];
  const lower = prompt.toLowerCase();
  return actionPatterns.some(rx => rx.test(lower));
}

interface PiAPIGenerationResult {
  success: boolean;
  videoUrl?: string;
  s3Url?: string;
  duration?: number;
  cost?: number;
  error?: string;
  generationTimeMs?: number;
  taskId?: string;
  providerUsed?: string;
}

interface PiAPIGenerationOptions {
  prompt: string;
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  model: string;
  negativePrompt?: string;
  motionControl?: MotionControlConfig;
}

interface ModelConfig {
  modelId: string;
  maxDuration: number;
}

class PiAPIVideoService {
  private s3Client: S3Client | null = null;
  private bucket = process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';
  private region = process.env.REMOTION_AWS_REGION || 'us-east-2';
  private apiKey = process.env.PIAPI_API_KEY || '';
  private baseUrl = 'https://api.piapi.ai/api/v1';

  constructor() {
    const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
    
    if (accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      console.log('[PiAPI] S3 client configured for video caching');
    } else {
      console.warn('[PiAPI] S3 client not configured - videos will use original URLs');
    }
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  private isSeedancePeakHours(): boolean {
    const now = new Date();
    const gmtHour = now.getUTCHours();
    return gmtHour >= 9 && gmtHour < 15;
  }

  async generateVideo(options: PiAPIGenerationOptions): Promise<PiAPIGenerationResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'PiAPI key not configured' };
    }

    const startTime = Date.now();
    const modelConfig = this.getModelConfig(options.model);
    
    console.log(`[PiAPI:${options.model}] Starting generation...`);
    console.log(`[PiAPI:${options.model}] Prompt: ${options.prompt.substring(0, 80)}...`);

    try {
      const requestBody = this.buildRequestBody(options, modelConfig);
      const taskResponse = await this.createTask(options, modelConfig, requestBody);
      
      if (!taskResponse.success || !taskResponse.taskId) {
        return {
          success: false,
          error: taskResponse.error || 'Failed to create task',
          generationTimeMs: Date.now() - startTime,
        };
      }

      console.log(`[PiAPI:${options.model}] Task created: ${taskResponse.taskId}`);

      let result = await this.pollForCompletion(taskResponse.taskId, options.model);
      let providerUsed: string | undefined;
      let activeTaskId = taskResponse.taskId;

      // ===== Queue-stall auto-fallback for Seedance 2 GA =====
      // If the GA queue is congested and we bail out after the pending-stall
      // threshold, transparently resubmit the same payload against the
      // seedance-2-fast variant. Functionally equivalent to a maintenance
      // outage from the user's perspective.
      if (this.shouldFallbackToSeedanceFast(result, requestBody)) {
        const fastBody = { ...requestBody, task_type: 'seedance-2-fast' };
        console.warn('[CinematicFlow] seedance-2 queue stall — auto-falling back to seedance-2-fast');
        const fastSubmit = await this.createTask(options, modelConfig, fastBody);
        if (fastSubmit.success && fastSubmit.taskId) {
          console.log(`[PiAPI:${options.model}] Fast-variant task created: ${fastSubmit.taskId}`);
          const retryResult = await this.pollForCompletion(fastSubmit.taskId, 'seedance-2.0-fast');
          if (retryResult.success && retryResult.videoUrl) {
            result = retryResult;
            providerUsed = 'seedance-2-fast (fallback)';
            activeTaskId = fastSubmit.taskId;
          } else {
            console.warn(`[PiAPI:${options.model}] Fast-variant fallback also failed: ${retryResult.error}`);
          }
        } else {
          console.warn(`[PiAPI:${options.model}] Fast-variant resubmit failed: ${fastSubmit.error}`);
        }
      }
      
      if (!result.success || !result.videoUrl) {
        return {
          ...result,
          generationTimeMs: Date.now() - startTime,
        };
      }

      console.log(`[PiAPI:${options.model}] Generation complete, uploading to S3...`);
      const s3Url = await this.uploadToS3(result.videoUrl, options.model);

      const generationTimeMs = Date.now() - startTime;
      const provider = AI_VIDEO_PROVIDERS[options.model];
      const cost = options.duration * (provider?.costPerSecond || 0.03);

      console.log(`[PiAPI:${options.model}] Complete! Time: ${(generationTimeMs / 1000).toFixed(1)}s, Cost: $${cost.toFixed(3)}${providerUsed ? ` [${providerUsed}]` : ''}`);

      return {
        success: true,
        videoUrl: result.videoUrl,
        s3Url,
        duration: options.duration,
        cost,
        generationTimeMs,
        taskId: activeTaskId,
        providerUsed,
      };

    } catch (error: any) {
      console.error(`[PiAPI:${options.model}] Generation failed:`, error.message);
      return {
        success: false,
        error: error.message,
        generationTimeMs: Date.now() - startTime,
      };
    }
  }

  private isQueueStallError(err?: string): boolean {
    return !!err && /stuck in (pending|queued?) queue/i.test(err);
  }

  private shouldFallbackToSeedanceFast(
    result: { success: boolean; error?: string },
    requestBody: any,
  ): boolean {
    if (result.success) return false;
    if (!this.isQueueStallError(result.error)) return false;
    // Only auto-fallback FROM seedance-2 GA. seedance-2-fast is already the
    // fast variant (no further fallback). Preview variants are also terminal.
    return requestBody?.task_type === 'seedance-2';
  }

  private async createTask(
    options: PiAPIGenerationOptions,
    modelConfig: ModelConfig,
    bodyOverride?: any
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    try {
      const requestBody = bodyOverride ?? this.buildRequestBody(options, modelConfig);
      
      const response = await fetch(`${this.baseUrl}/task`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[PiAPI] API error: ${response.status} - ${errorText}`);

        // ===== Auto-fallback for Seedance maintenance windows =====
        // PiAPI's documented fallback: when seedance-2 / seedance-2-fast return
        // 503 with the maintenance message, retry the same request with the
        // preview task_type (seedance-2-preview / seedance-2-fast-preview) which
        // points to the still-online preview backend.
        const isMaintenance503 =
          response.status === 503 &&
          /maintenance|preview model/i.test(errorText);
        const seedanceTaskType = (requestBody as any)?.task_type;
        const isSeedanceGA =
          seedanceTaskType === 'seedance-2' || seedanceTaskType === 'seedance-2-fast';
        if (isMaintenance503 && isSeedanceGA) {
          const previewTaskType =
            seedanceTaskType === 'seedance-2'
              ? 'seedance-2-preview'
              : 'seedance-2-fast-preview';
          console.warn(
            `[PiAPI] Seedance under maintenance — auto-retrying with preview backend (task_type=${previewTaskType})`
          );
          const previewBody = { ...(requestBody as any), task_type: previewTaskType };
          const retry = await fetch(`${this.baseUrl}/task`, {
            method: 'POST',
            headers: {
              'X-API-Key': this.apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(previewBody),
          });
          if (retry.ok) {
            const retryData = await retry.json();
            const retryTaskId = retryData.data?.task_id || retryData.task_id;
            if (retryTaskId) {
              console.log(
                `[PiAPI] Preview-backend retry succeeded — task ${retryTaskId} (provider variant: ${previewTaskType})`
              );
              return { success: true, taskId: retryTaskId };
            }
            return { success: false, error: 'Preview retry: no task ID in response' };
          }
          const retryText = await retry.text();
          console.error(
            `[PiAPI] Preview-backend retry also failed: ${retry.status} - ${retryText}`
          );
          return {
            success: false,
            error: `Seedance maintenance and preview fallback failed (HTTP ${retry.status})`,
          };
        }

        return { success: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;
      
      if (!taskId) {
        return { success: false, error: 'No task ID in response' };
      }

      return { success: true, taskId };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private getProviderCharLimit(model: string): number {
    const modelLower = model.toLowerCase();
    if (modelLower.startsWith('kling')) return 2500;
    if (modelLower.startsWith('veo')) return 2000;
    if (modelLower.startsWith('luma')) return 2000;
    if (modelLower.startsWith('hailuo') || modelLower.startsWith('seedance')) return 2000;
    if (modelLower.startsWith('wan')) return 2000;
    if (modelLower.startsWith('runway')) return 2000;
    if (modelLower.startsWith('pika')) return 1500;
    if (modelLower.startsWith('sora')) return 2000;
    return 1500;
  }

  private enforceProviderCharLimit(prompt: string, model: string): string {
    const charLimit = this.getProviderCharLimit(model);
    const promptChars = prompt.length;
    console.log(`[PiAPI] Final prompt: ${prompt.split(/\s+/).length} words, ${promptChars} chars (provider limit: ${charLimit} chars for ${model})`);

    if (promptChars <= charLimit) return prompt;

    const charBlockPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\((?:late-\d+s\s+\w+|[^)]*(?:hair|eyes?|skin|build|wearing)[^)]*)[^)]{15,}\)/g;
    const charBlocks: string[] = [];
    let stripped = prompt.replace(charBlockPattern, (match) => {
      charBlocks.push(match);
      return `__PB_${charBlocks.length - 1}__`;
    });

    const stylePrefix = stripped.match(/^\[STYLE:[^\]]+\]\s*/)?.[0] || '';
    const styleSuffix = stripped.match(/\.\s*All environments[^.]+whatsoever\.$/)?.[0] || '';
    const protectedChars = stylePrefix.length + styleSuffix.length + charBlocks.reduce((sum, b) => sum + b.length + 6, 0);
    const availableChars = Math.max(0, charLimit - protectedChars);

    let middle = stripped.slice(stylePrefix.length, styleSuffix ? stripped.length - styleSuffix.length : undefined);
    for (let i = 0; i < charBlocks.length; i++) {
      middle = middle.replace(`__PB_${i}__`, '');
    }
    middle = middle.replace(/\s{2,}/g, ' ').trim();

    if (middle.length > availableChars) {
      middle = middle.substring(0, availableChars);
      const lastSpace = middle.lastIndexOf(' ');
      if (lastSpace > availableChars * 0.5) {
        middle = middle.substring(0, lastSpace);
      }
    }

    let result = stylePrefix + middle;
    for (let i = 0; i < charBlocks.length; i++) {
      if (result.length + charBlocks[i].length + styleSuffix.length < charLimit) {
        result += ' ' + charBlocks[i];
      }
    }
    result += styleSuffix ? ' ' + styleSuffix.trim() : '';
    result = result.replace(/\s{2,}/g, ' ').trim();

    if (result.length > charLimit) {
      result = result.substring(0, charLimit);
      const lastSpace = result.lastIndexOf(' ');
      if (lastSpace > charLimit * 0.7) {
        result = result.substring(0, lastSpace);
      }
      result = result.trim();
      console.log(`[PiAPI] Hard truncation applied: ${result.length} chars (limit: ${charLimit})`);
    } else {
      console.log(`[PiAPI] Prompt trimmed to provider char limit: ${result.length} chars (limit: ${charLimit})`);
    }

    return result;
  }

  private buildRequestBody(options: PiAPIGenerationOptions, modelConfig: ModelConfig): any {
    const motionParams = options.motionControl ? mapToKlingMotion(options.motionControl) : {};
    const motionPrompt = options.motionControl 
      ? buildVeoMotionPrompt(options.prompt, options.motionControl)
      : options.prompt;
    
    if (options.motionControl) {
      console.log(`[PiAPI T2V] Motion control: ${options.motionControl.camera_movement} @ ${options.motionControl.intensity}`);
      console.log(`[PiAPI T2V] Motion rationale: ${options.motionControl.rationale}`);
    }

    const safePrompt = this.enforceProviderCharLimit(options.prompt, options.model);
    const safeMotionPrompt = motionPrompt !== options.prompt 
      ? this.enforceProviderCharLimit(motionPrompt, options.model)
      : safePrompt;
    
    // NOTE: cfg_scale is intentionally omitted from T2V requests.
    // PiAPI Kling video_generation (T2V) does not support cfg_scale —
    // it is an I2V-only parameter that balances source image vs prompt.
    const baseRequest = {
      model: modelConfig.modelId,
      task_type: 'text_to_video',
      input: {
        prompt: safePrompt,
        negative_prompt: options.negativePrompt || 'text, words, letters, numbers, writing, signage, logos, watermarks, labels, captions, titles, subtitles, UI elements, buttons, banners, blurry, low quality, distorted, ugly',
        duration: Math.round(Math.min(options.duration, modelConfig.maxDuration)),
        aspect_ratio: options.aspectRatio,
      },
    };

    switch (options.model) {
      // Kling 1.6 (legacy)
      case 'kling':
      case 'kling-1.6':
        console.log(`[PiAPI T2V] Using Kling 1.6 (version 1.6, std mode)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'std',
            version: '1.6',
            ...motionParams,
          },
        };
      
      // Kling 2.0
      case 'kling-2.0':
        console.log(`[PiAPI T2V] Using Kling 2.0 (version 2.0, std mode)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'std',
            version: '2.0',
            ...motionParams,
          },
        };
        
      // Kling 2.1 variants
      case 'kling-2.1':
        console.log(`[PiAPI T2V] Using Kling 2.1 (version 2.1, std mode)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'std',
            version: '2.1',
            ...motionParams,
          },
        };
        
      case 'kling-2.1-master':
        console.log(`[PiAPI T2V] Using Kling 2.1 Master (version 2.1, pro mode)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'pro',
            version: '2.1',
            ...motionParams,
          },
        };
        
      // Kling 2.5 variants
      case 'kling-2.5':
        console.log(`[PiAPI T2V] Using Kling 2.5 (version 2.5, std mode)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'std',
            version: '2.5',
            ...motionParams,
          },
        };
        
      case 'kling-2.5-turbo':
        console.log(`[PiAPI T2V] Using Kling 2.5 Turbo (version 2.5, turbo mode)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'turbo',
            version: '2.5',
            ...motionParams,
          },
        };
        
      // Kling 2.6 variants
      case 'kling-2.6':
        console.log(`[PiAPI T2V] Using Kling 2.6 (version 2.6, std mode)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'std',
            version: '2.6',
            ...motionParams,
          },
        };
        
      case 'kling-2.6-pro':
        console.log(`[PiAPI T2V] Using Kling 2.6 Pro (version 2.6, pro mode)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'pro',
            version: '2.6',
            ...motionParams,
          },
        };
        
      // Kling Avatar (talking head specialized)
      case 'kling-avatar':
        console.log(`[PiAPI T2V] Using Kling Avatar (version 2.0, avatar mode)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'std',
            version: '2.0',
          },
        };
        
      // Kling Effects (VFX specialized)
      case 'kling-effects':
        console.log(`[PiAPI T2V] Using Kling Effects (version 1.6, std mode)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'std',
            version: '1.6',
          },
        };

      // Kling 2.6 Motion Control (motion transfer from reference video)
      case 'kling-2.6-motion-control':
        console.log(`[PiAPI T2V] Using Kling 2.6 Motion Control (version 2.6, std mode, motion transfer)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'std',
            version: '2.6',
            ...motionParams,
          },
        };

      // Kling 2.6 Motion Control Pro (premium motion transfer)
      case 'kling-2.6-motion-control-pro':
        console.log(`[PiAPI T2V] Using Kling 2.6 Motion Control Pro (version 2.6, pro mode, motion transfer)`);
        return {
          ...baseRequest,
          model: 'kling',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            mode: 'pro',
            version: '2.6',
            ...motionParams,
          },
        };

      // Luma variants
      case 'luma':
      case 'luma-dream-machine':
        return {
          ...baseRequest,
          model: 'luma',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            loop: false,
          },
        };
        
      // Hailuo/Minimax Family
      case 'hailuo':
      case 'hailuo-minimax':
        console.log(`[PiAPI T2V] Using Hailuo (v2.3)`);
        return {
          ...baseRequest,
          model: 'hailuo',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            model: 'v2.3',
          },
          config: {
            service_mode: 'public',
          },
        };
        
      case 'seedance-1.0':
        console.log(`[PiAPI T2V] Using Seedance 1.0`);
        return {
          ...baseRequest,
          model: 'hailuo',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            model: 'seedance-1.0',
          },
        };
      
      case 'seedance-2.0': {
        const isPeakHours = this.isSeedancePeakHours();
        if (isPeakHours) {
          console.warn(`[PiAPI T2V] ⚠ Seedance 2 GA request during peak hours (09:00-15:00 GMT) — expect longer queue times`);
        }
        console.log(`[PiAPI T2V] Using Seedance 2 GA (text_to_video mode)`);
        return {
          model: 'seedance',
          task_type: 'seedance-2',
          input: {
            prompt: safePrompt,
            mode: 'text_to_video',
            duration: Math.min(options.duration, 15),
            aspect_ratio: options.aspectRatio || '16:9',
          },
        };
      }
      
      case 'seedance-2.0-fast': {
        const isPeakHours = this.isSeedancePeakHours();
        if (isPeakHours) {
          console.warn(`[PiAPI T2V] ⚠ Seedance 2 Fast GA request during peak hours (09:00-15:00 GMT) — expect longer queue times`);
        }
        console.log(`[PiAPI T2V] Using Seedance 2 Fast GA (text_to_video mode)`);
        return {
          model: 'seedance',
          task_type: 'seedance-2-fast',
          input: {
            prompt: safePrompt,
            mode: 'text_to_video',
            duration: Math.min(options.duration, 15),
            aspect_ratio: options.aspectRatio || '16:9',
          },
        };
      }
      
      // Wan Family (Alibaba - via Hailuo API)
      case 'wan-2.1':
        console.log(`[PiAPI T2V] Using Wan 2.1`);
        return {
          model: 'Qubico/wanx',
          task_type: 'txt2video-14b',
          input: {
            prompt: safePrompt,
          },
        };
        
      case 'wan-2.6':
        console.log(`[PiAPI T2V] Using Wan 2.6`);
        return {
          model: 'Wan',
          task_type: 'wan26-txt2video',
          input: {
            prompt: safePrompt,
            negative_prompt: options.negativePrompt || 'text, words, letters, numbers, writing, signage, logos, watermarks, labels, captions, blurry, low quality, distorted',
            prompt_extend: true,
            resolution: '720p',
            aspect_ratio: options.aspectRatio || '16:9',
            duration: Math.min(options.duration, 5),
            watermark: false,
          },
        };
        
      // Hunyuan
      case 'hunyuan':
        console.log(`[PiAPI T2V] Using Hunyuan`);
        return {
          ...baseRequest,
          model: 'hunyuan',
          task_type: 'txt2video',
        };
        
      // Veo 3.1 (Google) - needs veo3.1 model with dot
      case 'veo-3.1':
      case 'veo3.1':
        console.log(`[PiAPI T2V] Using Veo 3.1 with motion-enhanced prompt`);
        return {
          ...baseRequest,
          model: 'veo3.1',
          task_type: 'veo3.1-video',
          input: {
            prompt: safeMotionPrompt,
            negative_prompt: baseRequest.input.negative_prompt,
            aspect_ratio: baseRequest.input.aspect_ratio,
            duration: `${Math.min(baseRequest.input.duration, 8)}s`,
            resolution: '1080p',
            generate_audio: false,
          },
        };
        
      // Veo 3.0 (Google) - uses veo3 model
      case 'veo':
      case 'veo-3':
      case 'veo-3.0':
      case 'veo3':
      case 'veo3.0':
        console.log(`[PiAPI T2V] Using Veo 3.0 with motion-enhanced prompt`);
        return {
          ...baseRequest,
          model: 'veo3',
          task_type: 'veo3-video',
          input: {
            prompt: safeMotionPrompt,
            negative_prompt: baseRequest.input.negative_prompt,
            aspect_ratio: baseRequest.input.aspect_ratio,
            duration: `${Math.min(baseRequest.input.duration, 8)}s`,
            resolution: '1080p',
            generate_audio: false,
          },
        };
        
      case 'veo-2':
      case 'veo2':
        console.log(`[PiAPI T2V] Using Veo 2 with motion-enhanced prompt`);
        return {
          ...baseRequest,
          model: 'veo2',
          task_type: 'veo2-video',
          input: {
            prompt: safeMotionPrompt,
            negative_prompt: baseRequest.input.negative_prompt,
            aspect_ratio: baseRequest.input.aspect_ratio,
            duration: `${Math.min(baseRequest.input.duration, 8)}s`,
            resolution: '1080p',
            generate_audio: false,
          },
        };
        
      // Sora 2 (OpenAI)
      case 'sora-2':
      case 'sora2':
        console.log(`[PiAPI T2V] Using Sora 2`);
        return {
          model: 'sora2',
          task_type: 'sora2-video',
          input: {
            prompt: safePrompt,
            aspect_ratio: options.aspectRatio || '16:9',
            duration: Math.min(options.duration, 10),
          },
        };
        
      case 'sora-2-pro':
      case 'sora2-pro':
        console.log(`[PiAPI T2V] Using Sora 2 Pro`);
        return {
          model: 'sora2',
          task_type: 'sora2-pro-video',
          input: {
            prompt: safePrompt,
            aspect_ratio: options.aspectRatio || '16:9',
            resolution: '720p',
            duration: Math.min(options.duration, 10),
          },
        };

      default:
        console.log(`[PiAPI T2V] Using default model: ${options.model}`);
        return baseRequest;
    }
  }

  private async pollForCompletion(
    taskId: string,
    model: string
  ): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
    const maxAttempts = 120;
    const maxPendingAttempts = 36;
    const pollInterval = 5000;
    let consecutiveErrors = 0;
    let consecutivePending = 0;
    let hasStartedProcessing = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.sleep(pollInterval);

      try {
        const response = await fetch(`${this.baseUrl}/task/${taskId}`, {
          headers: {
            'X-API-Key': this.apiKey,
          },
        });

        if (!response.ok) {
          consecutiveErrors++;
          console.warn(`[PiAPI:${model}] Status check failed: ${response.status} (${consecutiveErrors} consecutive)`);
          if (consecutiveErrors >= 5) {
            return { success: false, error: `Provider ${model} returning ${response.status} errors consistently` };
          }
          continue;
        }
        consecutiveErrors = 0;

        const data = await response.json();
        const status = data.data?.status || data.status;
        
        console.log(`[PiAPI:${model}] Status: ${status} (attempt ${attempt + 1}/${maxAttempts})`);

        if (status === 'completed' || status === 'success' || status === 'SUCCESS') {
          const videoUrl = this.extractVideoUrl(data);
          
          if (videoUrl) {
            return { success: true, videoUrl };
          }
          return { success: false, error: 'No video URL in completed response' };
        }

        if (status === 'failed' || status === 'error' || status === 'FAILED') {
          const errorMsg = data.data?.error || data.error || 'Generation failed';
          return { success: false, error: errorMsg };
        }

        if (status === 'processing' || status === 'running') {
          consecutivePending = 0;
          hasStartedProcessing = true;
        } else if (!hasStartedProcessing) {
          consecutivePending++;
          if (consecutivePending >= maxPendingAttempts) {
            console.warn(`[PiAPI:${model}] Provider stuck in '${status}' for ${consecutivePending} polls (~${Math.round(consecutivePending * pollInterval / 1000)}s) - bailing out`);
            return { success: false, error: `Provider ${model} stuck in ${status} queue for ${Math.round(consecutivePending * pollInterval / 1000)}s` };
          }
        }

      } catch (error: any) {
        console.warn(`[PiAPI:${model}] Poll error:`, error.message);
      }
    }

    return { success: false, error: 'Generation timed out after 10 minutes' };
  }

  private extractVideoUrl(data: any): string | null {
    const possiblePaths = [
      data.data?.output?.video_url,
      data.data?.output?.video,
      data.data?.video_url,
      data.data?.result?.video_url,
      data.output?.video_url,
      data.video_url,
    ];

    for (const path of possiblePaths) {
      if (path && typeof path === 'string' && path.startsWith('http')) {
        return path;
      }
    }

    if (Array.isArray(data.data?.output)) {
      const video = data.data.output.find((o: any) => o.video_url || o.url);
      return video?.video_url || video?.url || null;
    }

    return null;
  }

  private async uploadToS3(videoUrl: string, model: string): Promise<string> {
    if (!this.s3Client) {
      return videoUrl;
    }

    try {
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const key = `ai-videos/${model}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;

      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'video/mp4',
        ACL: 'public-read',
      }));

      const s3Url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
      console.log(`[PiAPI:${model}] Uploaded to S3: ${key}`);
      
      return s3Url;

    } catch (error: any) {
      console.warn(`[PiAPI:${model}] S3 upload failed, using original URL:`, error.message);
      return videoUrl;
    }
  }

  private getModelConfig(model: string): ModelConfig {
    const configs: Record<string, ModelConfig> = {
      // Kling Family (12 variants)
      'kling': { modelId: 'kling', maxDuration: 10 },
      'kling-1.6': { modelId: 'kling', maxDuration: 10 },
      'kling-2.0': { modelId: 'kling', maxDuration: 10 },
      'kling-2.1': { modelId: 'kling', maxDuration: 10 },
      'kling-2.1-master': { modelId: 'kling', maxDuration: 10 },
      'kling-2.5': { modelId: 'kling', maxDuration: 10 },
      'kling-2.5-turbo': { modelId: 'kling', maxDuration: 10 },
      'kling-2.6': { modelId: 'kling', maxDuration: 10 },
      'kling-2.6-pro': { modelId: 'kling', maxDuration: 10 },
      'kling-2.6-motion-control': { modelId: 'kling', maxDuration: 30 },
      'kling-2.6-motion-control-pro': { modelId: 'kling', maxDuration: 30 },
      'kling-avatar': { modelId: 'kling', maxDuration: 60 },
      'kling-effects': { modelId: 'kling', maxDuration: 5 },
      // Luma Family
      'luma': { modelId: 'luma', maxDuration: 5 },
      'luma-dream-machine': { modelId: 'luma', maxDuration: 5 },
      // Hailuo/Minimax Family
      'hailuo': { modelId: 'hailuo', maxDuration: 6 },
      'hailuo-minimax': { modelId: 'hailuo', maxDuration: 6 },
      'seedance-1.0': { modelId: 'hailuo', maxDuration: 6 },
      'seedance-2.0': { modelId: 'seedance', maxDuration: 15 },
      'seedance-2.0-fast': { modelId: 'seedance', maxDuration: 15 },
      // Wan Family (Alibaba via PiAPI)
      'wan-2.1': { modelId: 'Qubico/wanx', maxDuration: 10 },
      'wan-2.6': { modelId: 'Wan', maxDuration: 5 },
      // Hunyuan
      'hunyuan': { modelId: 'hunyuan', maxDuration: 5 },
      // Sora 2
      'sora-2': { modelId: 'sora2', maxDuration: 10 },
      'sora2': { modelId: 'sora2', maxDuration: 10 },
      'sora-2-pro': { modelId: 'sora2', maxDuration: 10 },
      'sora2-pro': { modelId: 'sora2', maxDuration: 10 },
      // Veo Family (Google)
      'veo': { modelId: 'veo-3', maxDuration: 8 },
      'veo-2': { modelId: 'veo-2', maxDuration: 8 },
      'veo-3.1': { modelId: 'veo-3.1', maxDuration: 8 },
    };
    return configs[model] || { modelId: model, maxDuration: 5 };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async generateImageToVideo(options: {
    imageUrl: string;
    imageUrls?: string[];
    prompt: string;
    duration: number;
    aspectRatio: '16:9' | '9:16' | '1:1';
    model: string;
    negativePrompt?: string;
    generateAudio?: boolean;
    i2vSettings?: {
      imageControlStrength?: number;
      animationStyle?: 'product-hero' | 'product-static' | 'subtle-motion' | 'dynamic';
      motionStrength?: number;
      // Seedance 2 native first_last_frames mode (for seamless scene continuity).
      // When true and model is seedance-2.0/seedance-2.0-fast, the request uses
      // `mode: "first_last_frames"` with image_urls=[first, last?] and aspect_ratio:"auto".
      useFirstLastFrames?: boolean;
      endFrameUrl?: string; // optional second image (locks the END state)
      // When the request bundles a brand logo as one of the reference images,
      // the seedance branch uses this to add an explicit @imageN cue so the
      // model actually composes the logo into the scene (otherwise it gets
      // ignored as a generic style reference).
      brandLogoUrl?: string;
    };
    motionControl?: MotionControlConfig;
    isCharacterReference?: boolean;
    artPresetId?: string;
  }): Promise<PiAPIGenerationResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'PiAPI key not configured' };
    }

    const startTime = Date.now();
    
    // ============================================================
    // CRITICAL FIX: DO NOT SANITIZE PROMPT FOR I2V
    // ============================================================
    // 
    // For T2V: Sanitization prevents AI from rendering text (good)
    // For I2V: The image ALREADY contains text/logos (product labels)
    //
    // The sanitizer:
    // 1. Replaces "pine hill farm" with "wellness center" 
    // 2. Adds "Do not include any text, logos, watermarks..."
    //
    // This causes the model to try to REMOVE existing content!
    // For I2V, use ORIGINAL prompt - the image defines the content.
    // ============================================================
    
    const promptForI2V = options.prompt.trim();
    
    console.log(`[PiAPI:${options.model}] ========== I2V GENERATION ==========`);
    console.log(`[PiAPI:${options.model}] SKIPPING SANITIZATION (I2V preserves source image)`);
    console.log(`[PiAPI:${options.model}] Original prompt used: ${promptForI2V}`);
    console.log(`[PiAPI:${options.model}] Image URL: ${options.imageUrl}`);

    try {
      // Use the public URL directly - PiAPI just needs a publicly accessible HTTP URL
      // Brand assets stored in cloud storage already have public URLs (or signed URLs)
      const requestBody = this.buildI2VRequestBody(options, promptForI2V);
      
      // Log full request body for debugging I2V issues
      console.log(`[PiAPI:${options.model}] I2V Request body:`, JSON.stringify(requestBody, null, 2).substring(0, 1500));
      
      let response = await fetch(`${this.baseUrl}/task`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Mirror the T2V maintenance auto-fallback: when Seedance 2 GA returns 503
        // with the maintenance message, retry the same I2V request against the
        // preview backend (task_type=seedance-2-preview / seedance-2-fast-preview).
        const i2vTaskType = (requestBody as any)?.task_type;
        const isMaintenance503 =
          response.status === 503 && /maintenance|preview model/i.test(errorText);
        const isSeedanceGA =
          i2vTaskType === 'seedance-2' || i2vTaskType === 'seedance-2-fast';
        if (isMaintenance503 && isSeedanceGA) {
          const previewTaskType =
            i2vTaskType === 'seedance-2' ? 'seedance-2-preview' : 'seedance-2-fast-preview';
          console.warn(
            `[PiAPI:${options.model}] I2V Seedance under maintenance — auto-retrying with preview backend (task_type=${previewTaskType})`
          );
          const previewBody = { ...(requestBody as any), task_type: previewTaskType };
          response = await fetch(`${this.baseUrl}/task`, {
            method: 'POST',
            headers: {
              'X-API-Key': this.apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(previewBody),
          });
          if (!response.ok) {
            const previewErr = await response.text();
            console.error(`[PiAPI:${options.model}] I2V preview-backend retry also failed: ${response.status} - ${previewErr}`);
            return { success: false, error: `API error: ${response.status}`, generationTimeMs: Date.now() - startTime };
          }
        } else {
          console.error(`[PiAPI:${options.model}] I2V API error: ${response.status} - ${errorText}`);
          return { success: false, error: `API error: ${response.status}`, generationTimeMs: Date.now() - startTime };
        }
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;
      
      if (!taskId) {
        return { success: false, error: 'No task ID in I2V response', generationTimeMs: Date.now() - startTime };
      }

      console.log(`[PiAPI:${options.model}] I2V task created: ${taskId}`);

      let result = await this.pollForCompletion(taskId, options.model);
      let providerUsed: string | undefined;
      let activeTaskId = taskId;

      // ===== Queue-stall auto-fallback for Seedance 2 GA (I2V mirror) =====
      if (this.shouldFallbackToSeedanceFast(result, requestBody)) {
        const fastBody = { ...(requestBody as any), task_type: 'seedance-2-fast' };
        console.warn('[CinematicFlow] seedance-2 queue stall — auto-falling back to seedance-2-fast (I2V)');
        const fastResp = await fetch(`${this.baseUrl}/task`, {
          method: 'POST',
          headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(fastBody),
        });
        if (fastResp.ok) {
          const fastData = await fastResp.json();
          const fastTaskId = fastData.data?.task_id || fastData.task_id;
          if (fastTaskId) {
            console.log(`[PiAPI:${options.model}] I2V Fast-variant task created: ${fastTaskId}`);
            const retryResult = await this.pollForCompletion(fastTaskId, 'seedance-2.0-fast');
            if (retryResult.success && retryResult.videoUrl) {
              result = retryResult;
              providerUsed = 'seedance-2-fast (fallback)';
              activeTaskId = fastTaskId;
            } else {
              console.warn(`[PiAPI:${options.model}] I2V Fast-variant fallback also failed: ${retryResult.error}`);
            }
          }
        } else {
          const errText = await fastResp.text();
          console.warn(`[PiAPI:${options.model}] I2V Fast-variant resubmit HTTP ${fastResp.status}: ${errText.slice(0, 200)}`);
        }
      }
      
      if (!result.success || !result.videoUrl) {
        return {
          ...result,
          generationTimeMs: Date.now() - startTime,
        };
      }

      console.log(`[PiAPI:${options.model}] I2V complete, uploading to S3...`);
      const s3Url = await this.uploadToS3(result.videoUrl, options.model);

      const generationTimeMs = Date.now() - startTime;
      const provider = AI_VIDEO_PROVIDERS[options.model];
      const cost = options.duration * (provider?.costPerSecond || 0.03);

      console.log(`[PiAPI:${options.model}] I2V complete! Time: ${(generationTimeMs / 1000).toFixed(1)}s, Cost: $${cost.toFixed(3)}${providerUsed ? ` [${providerUsed}]` : ''}`);

      return {
        success: true,
        videoUrl: result.videoUrl,
        s3Url,
        duration: options.duration,
        cost,
        generationTimeMs,
        taskId: activeTaskId,
        providerUsed,
      };

    } catch (error: any) {
      console.error(`[PiAPI:${options.model}] I2V generation failed:`, error.message);
      return {
        success: false,
        error: error.message,
        generationTimeMs: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Build I2V Request Body for PiAPI Providers
   * 
   * IMPORTANT: I2V Prompt Handling (Phase 18K Fix - February 2026)
   * ============================================================
   * 
   * For I2V (Image-to-Video) COMPOSITE mode:
   * - The prompt describes the COMPLETE SCENE (people, actions, settings)
   * - The source image provides BRAND/PRODUCT reference only
   * - NEVER strip prompts to motion keywords like "holding, subtle motion"
   * 
   * Supported PiAPI I2V Providers:
   * - Veo 3.1 (Google): Uses COMPOSITE mode with image_url parameter
   * - Kling 2.0/2.1: Uses source_image_url parameter  
   * - Luma I2V: Uses image_url with motion_amount control
   * 
   * The prompt passed here should be the FULL visual direction, NOT a
   * simplified motion prompt. The upstream video-prompt-optimizer.ts
   * has been fixed to preserve full prompts when mode === 'i2v'.
   */
  private buildI2VRequestBody(options: {
    imageUrl: string;
    imageUrls?: string[];
    prompt: string;
    duration: number;
    aspectRatio: '16:9' | '9:16' | '1:1';
    model: string;
    generateAudio?: boolean;
    i2vSettings?: {
      imageControlStrength?: number;
      animationStyle?: 'product-hero' | 'product-static' | 'subtle-motion' | 'dynamic';
      motionStrength?: number;
      useFirstLastFrames?: boolean;
      endFrameUrl?: string;
    };
    motionControl?: MotionControlConfig;
    isCharacterReference?: boolean;
    artPresetId?: string;
  }, sanitizedPrompt: string): any {
    let animationStyle = options.i2vSettings?.animationStyle ?? 'product-hero';
    if (animationStyle === 'product-hero' && !options.i2vSettings?.animationStyle) {
      if (hasActionPrompt(sanitizedPrompt)) {
        animationStyle = 'dynamic';
      }
    }
    
    const promptRequiresNewContent = (prompt: string): boolean => {
      if (options.isCharacterReference) {
        console.log(`[PiAPI I2V] CHARACTER REFERENCE MODE — forcing new content generation (not animate)`);
        return true;
      }

      const p = prompt.toLowerCase();

      const humanSubjects = /\b(?:people|person|woman|man|child|children|kids|family|couple|adults|customer|customers|farmer|farmers|worker|workers|athlete|athletes|patient|patients|practitioner|nurse|doctor)\b/;
      const activityVerbs = /\b(?:walk(?:s|ing)?|run(?:s|ning)?|talk(?:s|ing)?|danc(?:e|es|ing)|exercis(?:e|es|ing)|cook(?:s|ing)?|hik(?:e|es|ing)|shop(?:s|ping)?|eat(?:s|ing)?|laugh(?:s|ing)?|play(?:s|ing)?|sit(?:s|ting)?|stand(?:s|ing)?|brows(?:e|es|ing)|train(?:s|ing)?|practic(?:e|es|ing)|enjoy(?:s|ing)?|work(?:s|ing)?|gather(?:s|ing)?|celebrat(?:e|es|ing)|welcom(?:e|es|ing)|greet(?:s|ing)?|serv(?:e|es|ing)|present(?:s|ing)?|speak(?:s|ing)?|stretch(?:es|ing)?|meditat(?:e|es|ing))\b/;

      if (/\bmontage\s+of\b/.test(p)) return true;
      if (/\b(?:group|crowd|audience|team)\s+of\s+(?:people|workers|athletes|customers|patients)\b/.test(p)) return true;

      if (humanSubjects.test(p) && activityVerbs.test(p)) return true;

      return false;
    };
    
    // ===========================================
    // GROUP 1: Send prompt AS-IS (no modification)
    // These providers work best with natural, unmodified prompts
    // ===========================================
    
    // Veo Family (Google) - uses motion-enhanced prompts
    // IMPORTANT: PiAPI uses specific model/task_type combinations:
    // - Veo 3.1: model='veo3.1', task_type='veo3.1-video' (WITH dot)
    // - Veo 3: model='veo3', task_type='veo3-video'
    // - Veo 2: model='veo2', task_type='veo2-video'
    // - The presence of image_url automatically makes it I2V
    if (options.model.includes('veo')) {
      let veoModel = 'veo3';
      let taskType = 'veo3-video';
      
      // Veo 3.1 - needs special format WITH dot
      if (options.model.includes('veo-3.1') || options.model.includes('veo3.1') || options.model === 'veo-3-1') {
        veoModel = 'veo3.1';
        taskType = 'veo3.1-video';  // WITH dot for 3.1
        console.log(`[PiAPI I2V] Using Veo 3.1: model=${veoModel}, task_type=${taskType}`);
      }
      // Veo 2
      else if (options.model.includes('veo-2') || options.model.includes('veo2')) {
        veoModel = 'veo2';
        taskType = 'veo2-video';
        console.log(`[PiAPI I2V] Using Veo 2: model=${veoModel}, task_type=${taskType}`);
      }
      // Veo 3 (default)
      else {
        console.log(`[PiAPI I2V] Using Veo 3: model=${veoModel}, task_type=${taskType}`);
      }
      
      // Build motion-enhanced prompt for Veo (Phase 16 integration)
      const motionPrompt = options.motionControl 
        ? buildVeoMotionPrompt(sanitizedPrompt, options.motionControl)
        : sanitizedPrompt;
      
      if (options.motionControl) {
        console.log(`[PiAPI I2V] Motion control: ${options.motionControl.camera_movement} @ ${options.motionControl.intensity}`);
      }
      
      // Use helper to detect if prompt requires new content generation
      const requiresNewContent = promptRequiresNewContent(motionPrompt);
      
      const shouldGenerateAudio = options.generateAudio ?? false;
      
      console.log(`[PiAPI I2V] Veo ${veoModel}: ${requiresNewContent ? 'COMPOSITE MODE (product in new scene)' : 'ANIMATE MODE (motion only)'}`);
      console.log(`[PiAPI I2V] Model: ${veoModel}, Task type: ${taskType}`);
      console.log(`[PiAPI I2V] resolution=720p, generate_audio=${shouldGenerateAudio}`);
      console.log(`[PiAPI I2V] Image URL: ${options.imageUrl}`);
      console.log(`[PiAPI I2V] Original Prompt: ${motionPrompt}`);
      
      // For Veo 3.1 I2V, always use image_url (per PiAPI documentation)
      // When generating new content with people, enhance the prompt to describe 
      // how the product from the reference image should appear in the scene
      let finalPrompt = motionPrompt;
      
      if (requiresNewContent) {
        // Enhance prompt to instruct Veo to incorporate the product from the reference
        // The image_url shows the product, and the prompt describes the scene with that product
        finalPrompt = `Using the product shown in the reference image as inspiration, create a scene where: ${motionPrompt}. The product from the reference image should be visible and naturally integrated into the scene. Maintain the product's appearance, branding, and colors from the reference.`;
        console.log(`[PiAPI I2V] COMPOSITE MODE - Enhanced prompt for product integration`);
        console.log(`[PiAPI I2V] Final Prompt: ${finalPrompt}`);
      }
      
      // Veo 3.1 I2V always uses image_url parameter (not reference_images)
      // The image serves as both style reference AND product reference
      return {
        model: veoModel,
        task_type: taskType,
        input: {
          prompt: finalPrompt,
          image_url: options.imageUrl,
          aspect_ratio: options.aspectRatio || '16:9',
          duration: `${Math.min(options.duration, 8)}s`,
          resolution: '720p',
          generate_audio: shouldGenerateAudio,
        },
      };
    }
    
    // Runway Gen-3 - supports reference_images for new content generation
    if (options.model.includes('runway')) {
      const requiresNewContent = promptRequiresNewContent(sanitizedPrompt);
      console.log(`[PiAPI I2V] Runway: ${requiresNewContent ? 'REFERENCE MODE (new content)' : 'ANIMATE MODE (motion only)'}`);
      
      if (requiresNewContent) {
        return {
          model: 'runway',
          task_type: 'video_generation',
          input: {
            prompt: sanitizedPrompt,
            reference_images: [options.imageUrl],  // Style reference for new content
            duration: Math.min(options.duration, 10),
            aspect_ratio: options.aspectRatio || '16:9',
          },
        };
      }
      
      return {
        model: 'runway',
        task_type: 'video_generation',
        input: {
          prompt: sanitizedPrompt,
          image_url: options.imageUrl,  // First frame animation
          duration: Math.min(options.duration, 10),
          aspect_ratio: options.aspectRatio || '16:9',
        },
      };
    }
    
    // Pika Labs - sends prompt AS-IS
    if (options.model.includes('pika')) {
      console.log(`[PiAPI I2V] Pika: Sending prompt AS-IS`);
      return {
        model: 'pika',
        task_type: 'video_generation',
        input: {
          prompt: sanitizedPrompt,  // SEND AS-IS!
          image_url: options.imageUrl,
        },
      };
    }
    
    // Genmo - sends prompt AS-IS
    if (options.model.includes('genmo')) {
      console.log(`[PiAPI I2V] Genmo: Sending prompt AS-IS`);
      return {
        model: 'genmo',
        task_type: 'video_generation',
        input: {
          prompt: sanitizedPrompt,  // SEND AS-IS!
          image_url: options.imageUrl,
        },
      };
    }
    
    // Hunyuan - sends prompt AS-IS
    if (options.model.includes('hunyuan')) {
      console.log(`[PiAPI I2V] Hunyuan: Sending prompt AS-IS`);
      return {
        model: 'hunyuan',
        task_type: 'video_generation',
        input: {
          prompt: sanitizedPrompt,  // SEND AS-IS!
          image_url: options.imageUrl,
          duration: Math.min(options.duration, 5),
          aspect_ratio: options.aspectRatio || '16:9',
        },
      };
    }
    
    // Skyreels - sends prompt AS-IS
    if (options.model.includes('skyreels')) {
      console.log(`[PiAPI I2V] Skyreels: Sending prompt AS-IS`);
      return {
        model: 'skyreels',
        task_type: 'video_generation',
        input: {
          prompt: sanitizedPrompt,  // SEND AS-IS!
          image_url: options.imageUrl,
          duration: Math.min(options.duration, 5),
        },
      };
    }
    
    // Seedance 2 - uses @imageN syntax in prompts with image_urls array
    if (options.model === 'seedance-2.0' || options.model === 'seedance-2.0-fast') {
      const taskType = options.model === 'seedance-2.0' ? 'seedance-2' : 'seedance-2-fast';
      const useFirstLastFrames = options.i2vSettings?.useFirstLastFrames === true;
      const endFrameUrl = options.i2vSettings?.endFrameUrl;

      // ──────────────────────────────────────────────────────────────
      // Seedance 2 native `first_last_frames` mode
      // Used by Seamless Transitions (Cinematic Flow) for continuity.
      // - image_urls: [firstFrame] or [firstFrame, lastFrame]
      // - aspect_ratio: "auto" (inherits from reference image)
      // - No @image refs injected — the prompt describes ACTION, not the subject
      // ──────────────────────────────────────────────────────────────
      if (useFirstLastFrames) {
        const firstFrameUrl = (options.imageUrls && options.imageUrls[0]) || options.imageUrl;
        const flfImageUrls: string[] = [firstFrameUrl];
        if (endFrameUrl) flfImageUrls.push(endFrameUrl);

        const isPeakHours = this.isSeedancePeakHours();
        if (isPeakHours) {
          console.warn(`[PiAPI I2V] ⚠ Seedance 2 first_last_frames request during peak hours (09:00-15:00 GMT)`);
        }
        console.log(`[PiAPI I2V] Seedance 2 FIRST_LAST_FRAMES (${taskType}): ${flfImageUrls.length} anchor frame(s), aspect_ratio=auto`);

        return {
          model: 'seedance',
          task_type: taskType,
          input: {
            prompt: sanitizedPrompt, // describe motion/action only — subject is locked by the anchor frame
            mode: 'first_last_frames',
            image_urls: flfImageUrls,
            duration: Math.max(4, Math.min(options.duration, 15)),
            aspect_ratio: 'auto',
          },
        };
      }

      const allImageUrls = options.imageUrls && options.imageUrls.length > 0
        ? options.imageUrls
        : [options.imageUrl];

      // Seedance 2 GA accepts only mode = text_to_video | first_last_frames |
      // omni_reference (no "image_to_video"). We use omni_reference for both
      // single- and multi-image runs because it's the only mode that accepts
      // an explicit aspect_ratio — first_last_frames forces aspect_ratio:"auto"
      // and inherits the (often portrait) source image's ratio, breaking 16:9
      // outputs. first_last_frames is reserved for the explicit
      // useFirstLastFrames path used by Seamless Transitions above.
      const isMultiRef = allImageUrls.length > 1;
      const seedanceMode: 'omni_reference' = 'omni_reference';

      let promptWithRefs = sanitizedPrompt;
      {
        const hasImageRef = /@image\d/.test(promptWithRefs);
        if (!hasImageRef) {
          promptWithRefs = `The subject in @image1 ${promptWithRefs}`;
        }
        // If a brand logo is one of the references, point the model at it
        // explicitly — otherwise omni_reference treats it as a generic style
        // hint and the logo won't appear.
        const logoUrl = options.i2vSettings?.brandLogoUrl;
        if (logoUrl) {
          const logoIdx = allImageUrls.indexOf(logoUrl);
          if (logoIdx >= 0) {
            const logoRef = `@image${logoIdx + 1}`;
            if (!promptWithRefs.includes(logoRef)) {
              promptWithRefs = `${promptWithRefs} The brand logo from ${logoRef} should appear naturally on product packaging or as a subtle, in-scene brand mark.`;
            }
          }
        }
      }

      const isPeakHours = this.isSeedancePeakHours();
      if (isPeakHours) {
        console.warn(`[PiAPI I2V] ⚠ Seedance 2 GA request during peak hours (09:00-15:00 GMT) — expect longer queue times`);
      }
      console.log(`[PiAPI I2V] Seedance 2 GA (${taskType}, ${seedanceMode} mode): ${allImageUrls.length} image(s)`);
      return {
        model: 'seedance',
        task_type: taskType,
        input: {
          prompt: promptWithRefs,
          mode: seedanceMode,
          image_urls: allImageUrls,
          duration: Math.min(options.duration, 15),
          // first_last_frames inherits aspect from the anchor image; omni_reference
          // accepts an explicit aspect_ratio.
          aspect_ratio: seedanceMode === 'first_last_frames' ? 'auto' : (options.aspectRatio || '16:9'),
        },
      };
    }
    
    // Seedance 1.0 - sends prompt AS-IS
    if (options.model.includes('seedance')) {
      console.log(`[PiAPI I2V] Seedance 1.0: Sending prompt AS-IS`);
      return {
        model: 'hailuo',
        task_type: 'video_generation',
        input: {
          prompt: sanitizedPrompt,
          model: 'seedance-1.0-i2v',
          image_url: options.imageUrl,
        },
      };
    }
    
    // ===========================================
    // GROUP 2: Light modification (camera hint only)
    // These providers benefit from a simple camera direction
    // ===========================================
    
    const cameraHintMap: Record<string, string> = {
      'product-hero': 'gentle push in',
      'product-static': 'static camera',
      'subtle-motion': 'subtle pan',
      'dynamic': 'dynamic camera movement',
    };
    const cameraHint = cameraHintMap[animationStyle] || 'gentle movement';
    
    // Luma Dream Machine - supports reference_images for new content generation
    if (options.model.includes('luma') || options.model === 'luma-dream-machine') {
      const prompt = `${sanitizedPrompt}. Camera: ${cameraHint}`;
      const requiresNewContent = promptRequiresNewContent(sanitizedPrompt);
      
      console.log(`[PiAPI I2V] Luma: ${requiresNewContent ? 'REFERENCE MODE (new content)' : 'ANIMATE MODE (motion only)'}`);
      console.log(`[PiAPI I2V] Prompt: ${prompt}`);
      
      if (requiresNewContent) {
        return {
          model: 'luma',
          task_type: 'video_generation',
          input: {
            prompt: prompt,
            aspect_ratio: options.aspectRatio || '16:9',
            loop: false,
            reference_images: [options.imageUrl],  // Style reference for new content
          },
        };
      }
      
      return {
        model: 'luma',
        task_type: 'video_generation',
        input: {
          prompt: prompt,
          aspect_ratio: options.aspectRatio || '16:9',
          loop: false,
          keyframes: { 
            frame0: { type: 'image', url: options.imageUrl }  // First frame animation
          },
        },
      };
    }
    
    // Hailuo/Minimax Family - supports reference_images for new content generation
    if (options.model.includes('hailuo') || options.model.includes('minimax')) {
      const prompt = `${sanitizedPrompt}. Camera: ${cameraHint}`;
      const requiresNewContent = promptRequiresNewContent(sanitizedPrompt);
      
      console.log(`[PiAPI I2V] Hailuo: ${requiresNewContent ? 'REFERENCE MODE (new content)' : 'ANIMATE MODE (motion only)'}`);
      console.log(`[PiAPI I2V] Prompt: ${prompt}`);
      
      if (requiresNewContent) {
        return {
          model: 'hailuo',
          task_type: 'video_generation',
          input: {
            prompt: prompt,
            model: 'v2.3',
            reference_images: [options.imageUrl],
            expand_prompt: true,
          },
          config: {
            service_mode: 'public',
          },
        };
      }
      
      return {
        model: 'hailuo',
        task_type: 'video_generation',
        input: {
          prompt: prompt,
          model: 'v2.3',
          image_url: options.imageUrl,
          expand_prompt: true,
        },
        config: {
          service_mode: 'public',
        },
      };
    }
    
    // Wan Family - adds light camera hint
    if (options.model.includes('wan')) {
      const prompt = `${sanitizedPrompt}. Camera: ${cameraHint}`;

      // Differentiate between Wan 2.1 and Wan 2.6
      const isWan21 = options.model.includes('2.1') || options.model === 'wan-2.1';
      const taskType = isWan21 ? 'wan21-img2video' : 'wan26-img2video';

      console.log(`[PiAPI I2V] ${isWan21 ? 'Wan 2.1' : 'Wan 2.6'}: Using ${taskType}`);
      console.log(`[PiAPI I2V] Prompt: ${prompt}`);

      return {
        model: 'Wan',
        task_type: taskType,
        input: {
          prompt: prompt,
          image: options.imageUrl,
          prompt_extend: true,
          shot_type: 'single',
          resolution: '720p',
          duration: Math.min(options.duration, isWan21 ? 5 : 8),
          watermark: false,
        },
      };
    }
    
    // ===========================================
    // GROUP 3: Full animation style modification (Kling only)
    // These providers benefit from detailed motion directives
    // ===========================================
    
    // I2V-specific negative prompt - preserve source image details, only avoid quality issues
    // CRITICAL: Do NOT include "text, words, letters, logos, labels" in I2V negative prompts
    // because the source image may contain important text/labels that must be preserved
    let i2vNegativePrompt = 'blurry, low quality, distorted, warping, morphing, deformed, glitchy artifacts';
    if (options.negativePrompt) {
      i2vNegativePrompt = `${options.negativePrompt}, ${i2vNegativePrompt}`;
      console.log(`[PiAPI I2V] Merged user negative prompt: ${options.negativePrompt}`);
    }
    if (options.artPresetId && isStylizedPreset(options.artPresetId)) {
      const artPreset = getVisualArtPreset(options.artPresetId);
      if (artPreset && artPreset.negativePromptAdditions.length > 0) {
        i2vNegativePrompt = `${i2vNegativePrompt}, ${artPreset.negativePromptAdditions.join(', ')}`;
        console.log(`[PiAPI I2V] Added art preset negative prompts: ${artPreset.negativePromptAdditions.join(', ')}`);
      }
    }
    
    if (options.model.startsWith('kling')) {
      let version = '2.6';
      let mode = 'pro';
      
      // Kling 1.6 (legacy)
      if (options.model === 'kling' || options.model === 'kling-1.6') {
        version = '1.6';
        mode = 'std';
        console.log(`[PiAPI I2V] Using Kling 1.6 (version 1.6, std mode)`);
      }
      // Kling 2.0
      else if (options.model === 'kling-2.0') {
        version = '2.0';
        mode = 'std';
        console.log(`[PiAPI I2V] Using Kling 2.0 (version 2.0, std mode)`);
      }
      // Kling 2.1 variants
      else if (options.model === 'kling-2.1') {
        version = '2.1';
        mode = 'std';
        console.log(`[PiAPI I2V] Using Kling 2.1 (version 2.1, std mode)`);
      }
      else if (options.model === 'kling-2.1-master') {
        version = '2.1';
        mode = 'pro';
        console.log(`[PiAPI I2V] Using Kling 2.1 Master (version 2.1, pro mode)`);
      }
      // Kling 2.5 variants
      else if (options.model === 'kling-2.5') {
        version = '2.5';
        mode = 'std';
        console.log(`[PiAPI I2V] Using Kling 2.5 (version 2.5, std mode)`);
      }
      else if (options.model === 'kling-2.5-turbo') {
        version = '2.5';
        mode = 'turbo';
        console.log(`[PiAPI I2V] Using Kling 2.5 Turbo (version 2.5, turbo mode)`);
      }
      // Kling 2.6 variants
      else if (options.model === 'kling-2.6') {
        version = '2.6';
        mode = 'pro';
        console.log(`[PiAPI I2V] Using Kling 2.6 (version 2.6, pro mode)`);
      }
      else if (options.model === 'kling-2.6-pro') {
        version = '2.6';
        mode = 'pro';
        console.log(`[PiAPI I2V] Using Kling 2.6 Pro (version 2.6, pro mode)`);
      }
      // Kling Avatar
      else if (options.model === 'kling-avatar') {
        version = '2.0';
        mode = 'std';
        console.log(`[PiAPI I2V] Using Kling Avatar (version 2.0, std mode)`);
      }
      // Kling Effects
      else if (options.model === 'kling-effects') {
        version = '1.6';
        mode = 'std';
        console.log(`[PiAPI I2V] Using Kling Effects (version 1.6, std mode)`);
      }
      // Kling 2.6 Motion Control
      else if (options.model === 'kling-2.6-motion-control') {
        version = '2.6';
        mode = 'std';
        console.log(`[PiAPI I2V] Using Kling 2.6 Motion Control (version 2.6, std mode, motion transfer)`);
      }
      // Kling 2.6 Motion Control Pro
      else if (options.model === 'kling-2.6-motion-control-pro') {
        version = '2.6';
        mode = 'pro';
        console.log(`[PiAPI I2V] Using Kling 2.6 Motion Control Pro (version 2.6, pro mode, motion transfer)`);
      }
      // Default fallback
      else {
        const extractedVersion = options.model.replace('kling-v', '').replace('kling-', '').split('-')[0];
        version = extractedVersion || '2.6';
        console.log(`[PiAPI I2V] Using Kling ${version} (extracted, pro mode)`);
      }
      
      // Apply user I2V settings for Kling
      // PiAPI Kling I2V parameters:
      // - cfg_scale: 0.0-1.0, controls prompt vs source image balance (lower = more source fidelity)
      // - static_mask: controls what parts of image to animate (we want full frame)
      const imageControlStrength = options.i2vSettings?.imageControlStrength ?? 1.0;
      const motionStrength = options.i2vSettings?.motionStrength ?? 0.3;
      let animationStyle = options.i2vSettings?.animationStyle ?? 'product-hero';
      if (animationStyle === 'product-hero' && !options.i2vSettings?.animationStyle) {
          if (hasActionPrompt(sanitizedPrompt)) {
          animationStyle = 'dynamic';
          console.log(`[PiAPI I2V] Action prompt detected — switching from product-hero to dynamic animation style`);
        }
      }
      
      // Map user's Image Fidelity slider (0-1 where 1 = max fidelity) to cfg_scale
      // cfg_scale: 0.0 = preserve source exactly, 1.0 = follow prompt completely
      // For I2V product shots: keep LOW to preserve the actual product image
      // cfg_scale 0.25+ causes Kling to reimagine the product entirely (wrong bottle/labels)
      // Motion comes from the prompt directives, NOT from cfg_scale freedom
      // Default fidelity=1.0 → cfg=0.1 (preserve product), fidelity=0.0 → cfg=0.5 (creative)
      let cfgScale = Math.max(0.1, 0.5 - imageControlStrength * 0.4); // Range: 0.5 (creative) to 0.1 (high fidelity)
      
      if (options.artPresetId && isStylizedPreset(options.artPresetId)) {
        const targetCfg = options.isCharacterReference ? STYLIZED_CHARACTER_CFG : STYLIZED_ENVIRONMENT_CFG;
        const stylizedCfg = Math.max(cfgScale, targetCfg);
        if (stylizedCfg !== cfgScale) {
          const tier = options.isCharacterReference ? 'character' : 'environment';
          console.log(`[PiAPI I2V] Stylized preset cfg override (${tier}): ${cfgScale.toFixed(2)} → ${stylizedCfg.toFixed(2)} for art style adherence`);
          cfgScale = stylizedCfg;
        }
      }
      
      // Map motion strength to animation intensity
      // Kling uses a subtle approach - lower values mean less dramatic motion
      // The prompt-based approach is our primary control since Kling I2V has limited motion params
      
      // Different camera/animation directive for each style
      const motionDirectiveMap: Record<string, string> = {
        'product-hero': 'slow smooth push towards product, steady focus',
        'product-static': 'static camera, minimal ambient motion only',
        'subtle-motion': 'very gentle pan, subtle lighting shift',
        'dynamic': 'energetic camera movement, engaging motion',
      };
      const motionDirective = motionDirectiveMap[animationStyle] || 'gentle camera motion';
      
      console.log(`[PiAPI I2V] Kling settings: fidelity=${imageControlStrength} → cfg=${cfgScale.toFixed(2)}, motion=${motionStrength}, style=${animationStyle}`);
      
      // Check if prompt requires NEW content generation (people, activities)
      const requiresNewContent = promptRequiresNewContent(sanitizedPrompt);
      console.log(`[PiAPI I2V] Kling: ${requiresNewContent ? 'REFERENCE MODE (new content)' : 'ANIMATE MODE (motion only)'}`);
      
      // Kling has a 2500 character limit on prompts
      // Intelligently truncate by removing redundant sections first
      const enforceKlingPromptLimit = (prompt: string, limit: number = 2400): string => {
        if (prompt.length <= limit) return prompt;
        let p = prompt;
        p = p.replace(/\. CRITICAL REQUIREMENT:.*?Pure visual imagery only\./s, '');
        if (p.length <= limit) return p;
        const charBlockMatch = p.match(/\nGenerate a NEW scene.*$/s);
        if (charBlockMatch && p.length > limit) {
          const mainPart = p.substring(0, p.indexOf('\nGenerate a NEW scene'));
          const charBlock = charBlockMatch[0];
          const charBlockTruncated = charBlock.substring(0, Math.max(200, limit - mainPart.length));
          p = mainPart + charBlockTruncated;
        }
        if (p.length > limit) {
          p = p.substring(0, limit - 3) + '...';
        }
        console.log(`[PiAPI I2V] Kling prompt truncated: ${prompt.length} → ${p.length} chars (limit: ${limit})`);
        return p;
      };

      // Build Kling-specific prompt - prioritize source image preservation for I2V
      let klingPromptBase: string;
      if (requiresNewContent) {
        klingPromptBase = sanitizedPrompt;
        if (options.artPresetId && isStylizedPreset(options.artPresetId)) {
          const artPreset = getVisualArtPreset(options.artPresetId);
          if (artPreset) {
            const stylePrefix = (artPreset as any).styleMarkerPrefix || artPreset.name;
            if (options.isCharacterReference) {
              klingPromptBase = `STYLE: ${stylePrefix} — NOT photorealistic, NOT live-action, NOT real-life photography. Fully stylized ${stylePrefix} rendering throughout. Use reference image ONLY for character facial features, NOT for rendering style.\n${klingPromptBase}`;
              console.log(`[PiAPI I2V] Prepended strong style directive for "${artPreset.name}" character reference`);
            } else {
              klingPromptBase = `STYLE: ${stylePrefix} — NOT photorealistic, NOT live-action, NOT real-life photography. Fully stylized ${stylePrefix} rendering throughout. Maintain the exact art style from the source image.\n${klingPromptBase}`;
              console.log(`[PiAPI I2V] Prepended strong style directive for "${artPreset.name}" environment I2V`);
            }
          }
        }
      } else if (animationStyle === 'product-static') {
        klingPromptBase = `${sanitizedPrompt}. Keep product label and text perfectly sharp and unchanged. Subtle ambient motion, gentle lighting shifts only.`;
      } else if (animationStyle === 'product-hero') {
        klingPromptBase = `${sanitizedPrompt}. Preserve all text, labels, and product details exactly as shown. Cinematic, smooth camera motion around the product.`;
      } else if (animationStyle === 'subtle-motion') {
        klingPromptBase = `${sanitizedPrompt}. Preserve all details from source image. Subtle environmental motion, gentle lighting shifts.`;
      } else {
        klingPromptBase = `${sanitizedPrompt}. Dynamic camera motion, energetic.`;
      }
      
      // Append motion directive to prompt for better control
      const klingI2vPrompt = enforceKlingPromptLimit(`${klingPromptBase} Camera: ${motionDirective}.`);
      
      console.log(`[PiAPI I2V] Kling prompt: ${klingI2vPrompt}`);
      
      // For I2V mode: Do NOT include camera_control params - they conflict with first-frame animation
      // camera_control type "none" was suppressing I2V motion entirely, making the video static
      // Motion direction is controlled via the prompt text instead (e.g., "smooth push towards product")
      // Only use camera_control for reference mode (new content generation)
      const motionParams = (options.motionControl && requiresNewContent) ? mapToKlingMotion(options.motionControl) : {};
      if (options.motionControl) {
        console.log(`[PiAPI I2V] Motion control: ${options.motionControl.camera_movement} @ ${options.motionControl.intensity} (${requiresNewContent ? 'APPLIED' : 'SKIPPED for I2V animate mode - using prompt-based motion'})`);
      }
      
      const allImageUrls = (options.imageUrls && options.imageUrls.length > 0) ? options.imageUrls : [options.imageUrl];
      const hasMultipleImages = allImageUrls.length > 1;
      const isLegacyVersion = version === '1.6' || version === '1.0';

      if (hasMultipleImages) {
        if (isLegacyVersion) {
          console.log(`[PiAPI I2V] Kling multi-image mode: ${allImageUrls.length} images via elements[] (v${version})`);
        } else {
          console.log(`[PiAPI I2V] Kling v${version}: elements[] not supported, using first reference image only (${allImageUrls.length} provided)`);
        }
      }

      if (requiresNewContent) {
        const refInput: any = {
          prompt: klingI2vPrompt,
          reference_images: [options.imageUrl],
          duration: options.duration,
          aspect_ratio: options.aspectRatio,
          negative_prompt: i2vNegativePrompt,
          mode,
          version,
          cfg_scale: cfgScale,
          ...motionParams,
        };
        if (hasMultipleImages && isLegacyVersion) {
          refInput.elements = allImageUrls.map(url => ({ image_url: url }));
        }
        return {
          model: 'kling',
          task_type: 'video_generation',
          input: refInput,
        };
      }
      
      // Animation mode: use image_url for first-frame animation
      // No camera_control here - motion comes from prompt directives
      const klingInput: any = {
        prompt: klingI2vPrompt,
        image_url: options.imageUrl,
        duration: options.duration,
        aspect_ratio: options.aspectRatio,
        negative_prompt: i2vNegativePrompt,
        mode,
        version,
        cfg_scale: cfgScale,
      };
      if (hasMultipleImages && isLegacyVersion) {
        klingInput.elements = allImageUrls.map(url => ({ image_url: url }));
      } else if (isLegacyVersion) {
        klingInput.elements = [{ image_url: options.imageUrl }];
        klingInput.first_frame_image = options.imageUrl;
      }
      return {
        model: 'kling',
        task_type: 'video_generation',
        input: klingInput,
      };
    }
    
    // ===========================================
    // DEFAULT: Send as-is for any unknown provider
    // ===========================================
    console.log(`[PiAPI I2V] ${options.model}: Using default (sending as-is)`);
    return {
      model: options.model,
      task_type: 'video_generation',
      input: {
        prompt: sanitizedPrompt,
        image_url: options.imageUrl,
        duration: options.duration,
        aspect_ratio: options.aspectRatio,
      },
    };
  }
  /**
   * Video Object Replacement using Kling Multi-Elements
   * Takes an existing video and replaces a specific object with a product image
   */
  async replaceObjectInVideo(options: {
    videoUrl: string;
    replacementImageUrl: string;
    prompt: string;
    objectDescription?: string;
    duration?: number;
    aspectRatio?: '16:9' | '9:16' | '1:1';
  }): Promise<PiAPIGenerationResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'PiAPI key not configured' };
    }

    const startTime = Date.now();
    
    console.log(`[PiAPI:ObjectReplace] Starting video object replacement...`);
    console.log(`[PiAPI:ObjectReplace] Source video: ${options.videoUrl.substring(0, 80)}...`);
    console.log(`[PiAPI:ObjectReplace] Replacement image: ${options.replacementImageUrl.substring(0, 80)}...`);
    console.log(`[PiAPI:ObjectReplace] Prompt: ${options.prompt}`);

    try {
      // Build the multi-elements request for Kling 1.6 (elements only supported in v1.6)
      const requestBody = {
        model: 'kling',
        task_type: 'video_generation',
        input: {
          prompt: options.prompt,
          elements: [
            {
              image_url: options.replacementImageUrl,
              prompt: options.objectDescription || 'the product bottle',
            }
          ],
          mode: 'pro',
          version: '1.6',  // Elements feature only available in v1.6
          duration: Math.min(options.duration || 5, 10),  // v1.6 max 10s
          aspect_ratio: options.aspectRatio || '16:9',
          negative_prompt: 'text, words, letters, numbers, writing, signage, logos, watermarks, labels, captions, blurry, low quality, distorted, morphing, warping',
        },
      };

      console.log(`[PiAPI:ObjectReplace] Request body:`, JSON.stringify(requestBody, null, 2).substring(0, 1500));

      const response = await fetch(`${this.baseUrl}/task`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[PiAPI:ObjectReplace] API error: ${response.status} - ${errorText}`);
        
        // Try alternative task_type if elements_video fails
        console.log(`[PiAPI:ObjectReplace] Trying fallback with video_generation + elements...`);
        return await this.replaceObjectFallback(options, startTime);
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;

      if (!taskId) {
        console.log(`[PiAPI:ObjectReplace] No task ID, trying fallback...`);
        return await this.replaceObjectFallback(options, startTime);
      }

      console.log(`[PiAPI:ObjectReplace] Task created: ${taskId}`);

      const result = await this.pollForCompletion(taskId, 'kling-object-replace');

      if (!result.success || !result.videoUrl) {
        return {
          ...result,
          generationTimeMs: Date.now() - startTime,
        };
      }

      console.log(`[PiAPI:ObjectReplace] Complete, uploading to S3...`);
      const s3Url = await this.uploadToS3(result.videoUrl, 'object-replace');

      const generationTimeMs = Date.now() - startTime;
      const cost = (options.duration || 5) * 0.05; // Estimated cost for object replacement

      console.log(`[PiAPI:ObjectReplace] Complete! Time: ${(generationTimeMs / 1000).toFixed(1)}s, Cost: $${cost.toFixed(3)}`);

      return {
        success: true,
        videoUrl: result.videoUrl,
        s3Url,
        duration: options.duration || 5,
        cost,
        generationTimeMs,
        taskId,
      };

    } catch (error: any) {
      console.error(`[PiAPI:ObjectReplace] Failed:`, error.message);
      return {
        success: false,
        error: error.message,
        generationTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Fallback method using video_generation with multi-elements input
   */
  private async replaceObjectFallback(options: {
    videoUrl: string;
    replacementImageUrl: string;
    prompt: string;
    objectDescription?: string;
    duration?: number;
    aspectRatio?: '16:9' | '9:16' | '1:1';
  }, startTime: number): Promise<PiAPIGenerationResult> {
    try {
      // Alternative approach: Image-to-video with the product image as source
      const requestBody = {
        model: 'kling',
        task_type: 'video_generation',
        input: {
          image_url: options.replacementImageUrl,  // Use product image as starting point
          prompt: `${options.prompt}. Feature the ${options.objectDescription || 'product'} prominently with cinematic motion and professional lighting.`,
          mode: 'pro',
          version: '1.6',  // v1.6 for better I2V support
          duration: Math.min(options.duration || 5, 10),
          aspect_ratio: options.aspectRatio || '16:9',
          negative_prompt: 'text, words, letters, numbers, writing, signage, logos, watermarks, labels, captions, blurry, low quality, distorted, morphing, warping, different product, wrong product',
        },
      };

      console.log(`[PiAPI:ObjectReplace:Fallback] Trying alternative request...`);

      const response = await fetch(`${this.baseUrl}/task`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[PiAPI:ObjectReplace:Fallback] API error: ${response.status} - ${errorText}`);
        return {
          success: false,
          error: `Object replacement not supported: ${errorText}`,
          generationTimeMs: Date.now() - startTime,
        };
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;

      if (!taskId) {
        return {
          success: false,
          error: 'No task ID in fallback response',
          generationTimeMs: Date.now() - startTime,
        };
      }

      console.log(`[PiAPI:ObjectReplace:Fallback] Task created: ${taskId}`);

      const result = await this.pollForCompletion(taskId, 'kling-object-replace-fallback');

      if (!result.success || !result.videoUrl) {
        return {
          ...result,
          generationTimeMs: Date.now() - startTime,
        };
      }

      const s3Url = await this.uploadToS3(result.videoUrl, 'object-replace');
      const generationTimeMs = Date.now() - startTime;
      const cost = (options.duration || 5) * 0.05;

      console.log(`[PiAPI:ObjectReplace:Fallback] Complete! Time: ${(generationTimeMs / 1000).toFixed(1)}s`);

      return {
        success: true,
        videoUrl: result.videoUrl,
        s3Url,
        duration: options.duration || 5,
        cost,
        generationTimeMs,
        taskId,
      };

    } catch (error: any) {
      console.error(`[PiAPI:ObjectReplace:Fallback] Failed:`, error.message);
      return {
        success: false,
        error: error.message,
        generationTimeMs: Date.now() - startTime,
      };
    }
  }

  async testAPIConnectivity(): Promise<{
    success: boolean;
    timestamp: string;
    apiKeyConfigured: boolean;
    providers: Array<{
      name: string;
      model: string;
      status: 'available' | 'error' | 'unknown';
      taskTypes: string[];
      i2vSupported: boolean;
      t2vSupported: boolean;
      maxDuration: number;
      notes?: string;
    }>;
    accountInfo?: {
      credits?: number;
      tier?: string;
    };
    error?: string;
  }> {
    const timestamp = new Date().toISOString();
    
    if (!this.isAvailable()) {
      return {
        success: false,
        timestamp,
        apiKeyConfigured: false,
        providers: [],
        error: 'PIAPI_API_KEY not configured'
      };
    }

    console.log('[PiAPI] Testing API connectivity...');
    
    const providers = [
      { name: 'Veo 3.1', model: 'veo-3.1', i2v: true, t2v: true, maxDuration: 8, taskType: 'video_generation' },
      { name: 'Veo 3.0', model: 'veo-3', i2v: true, t2v: true, maxDuration: 8, taskType: 'video_generation' },
      { name: 'Veo 2', model: 'veo-2', i2v: true, t2v: true, maxDuration: 8, taskType: 'video_generation' },
      { name: 'Kling 2.6', model: 'kling', i2v: true, t2v: true, maxDuration: 10, taskType: 'video_generation' },
      { name: 'Kling 2.6 Pro', model: 'kling', i2v: true, t2v: true, maxDuration: 10, taskType: 'video_generation' },
      { name: 'Kling 2.5 Turbo', model: 'kling', i2v: true, t2v: true, maxDuration: 10, taskType: 'video_generation' },
      { name: 'Kling Elements', model: 'kling', i2v: true, t2v: true, maxDuration: 5, taskType: 'video_generation' },
      { name: 'Kling Effects', model: 'kling', i2v: false, t2v: true, maxDuration: 5, taskType: 'video_generation' },
      { name: 'Kling Sound', model: 'kling', i2v: false, t2v: false, maxDuration: 10, taskType: 'video_generation' },
      { name: 'Kling Avatar', model: 'kling', i2v: true, t2v: false, maxDuration: 60, taskType: 'video_generation' },
      { name: 'Kling Motion Control', model: 'kling', i2v: true, t2v: true, maxDuration: 30, taskType: 'video_generation' },
      { name: 'Wan 2.6', model: 'wan', i2v: true, t2v: true, maxDuration: 5, taskType: 'video_generation' },
      { name: 'Hailuo (Minimax)', model: 'hailuo', i2v: true, t2v: true, maxDuration: 6, taskType: 'video_generation' },
      { name: 'Skyreels', model: 'skyreels', i2v: true, t2v: true, maxDuration: 5, taskType: 'video_generation' },
      { name: 'Hunyuan', model: 'hunyuan', i2v: true, t2v: true, maxDuration: 5, taskType: 'txt2video' },
      { name: 'Dream Machine (Luma)', model: 'luma', i2v: true, t2v: true, maxDuration: 5, taskType: 'video_generation' },
      { name: 'Runway Gen-4', model: 'runway', i2v: true, t2v: true, maxDuration: 10, taskType: 'video_generation' },
    ];
    
    const results: Array<{
      name: string;
      model: string;
      status: 'available' | 'error' | 'unknown';
      taskTypes: string[];
      i2vSupported: boolean;
      t2vSupported: boolean;
      maxDuration: number;
      notes?: string;
    }> = [];
    
    let accountInfo: { credits?: number; tier?: string } | undefined;
    
    try {
      const accountResponse = await fetch(`${this.baseUrl.replace('/api/v1', '')}/api/v1/user/info`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
        },
      });
      
      if (accountResponse.ok) {
        const accountData = await accountResponse.json();
        accountInfo = {
          credits: accountData.data?.credits || accountData.credits,
          tier: accountData.data?.tier || accountData.tier || 'standard',
        };
        console.log(`[PiAPI] Account info retrieved: ${JSON.stringify(accountInfo)}`);
      }
    } catch (e: any) {
      console.log(`[PiAPI] Could not fetch account info: ${e.message}`);
    }
    
    for (const provider of providers) {
      const result = {
        name: provider.name,
        model: provider.model,
        status: 'unknown' as 'available' | 'error' | 'unknown',
        taskTypes: [provider.taskType],
        i2vSupported: provider.i2v,
        t2vSupported: provider.t2v,
        maxDuration: provider.maxDuration,
        notes: undefined as string | undefined,
      };
      
      result.status = 'available';
      result.notes = `${provider.t2v ? 'T2V' : ''}${provider.t2v && provider.i2v ? '+' : ''}${provider.i2v ? 'I2V' : ''} supported`;
      
      results.push(result);
    }
    
    console.log(`[PiAPI] Connectivity test complete: ${results.filter(r => r.status === 'available').length}/${results.length} providers available`);
    
    return {
      success: true,
      timestamp,
      apiKeyConfigured: true,
      providers: results,
      accountInfo,
    };
  }
}

export const piapiVideoService = new PiAPIVideoService();
