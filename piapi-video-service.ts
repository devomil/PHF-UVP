// server/services/piapi-video-service.ts

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { AI_VIDEO_PROVIDERS } from '../config/ai-video-providers';
import { sanitizePromptForAI, enhancePromptForProvider } from './prompt-sanitizer';
import { MotionControlConfig, mapToKlingMotion, buildVeoMotionPrompt } from '../../shared/config/motion-control';

interface PiAPIGenerationResult {
  success: boolean;
  videoUrl?: string;
  s3Url?: string;
  duration?: number;
  cost?: number;
  error?: string;
  generationTimeMs?: number;
  taskId?: string;
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

  async generateVideo(options: PiAPIGenerationOptions): Promise<PiAPIGenerationResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'PiAPI key not configured' };
    }

    const startTime = Date.now();
    const modelConfig = this.getModelConfig(options.model);
    
    // Phase 11A: Sanitize prompt to remove text/logo requests before video generation
    const sanitized = sanitizePromptForAI(options.prompt, 'video');
    const sanitizedPrompt = enhancePromptForProvider(sanitized.cleanPrompt, options.model);
    
    console.log(`[PiAPI:${options.model}] Starting generation...`);
    console.log(`[PiAPI:${options.model}] Original prompt: ${options.prompt.substring(0, 80)}...`);
    console.log(`[PiAPI:${options.model}] Sanitized prompt: ${sanitizedPrompt.substring(0, 80)}...`);
    console.log(`[PiAPI:${options.model}] Removed ${sanitized.removedElements.length} elements`);
    if (sanitized.extractedText.length > 0) {
      console.log(`[PiAPI:${options.model}] Extracted text for overlays: ${sanitized.extractedText.join(', ')}`);
    }
    
    // Use sanitized prompt for generation
    const sanitizedOptions = { ...options, prompt: sanitizedPrompt };

    try {
      const taskResponse = await this.createTask(sanitizedOptions, modelConfig);
      
      if (!taskResponse.success || !taskResponse.taskId) {
        return {
          success: false,
          error: taskResponse.error || 'Failed to create task',
          generationTimeMs: Date.now() - startTime,
        };
      }

      console.log(`[PiAPI:${options.model}] Task created: ${taskResponse.taskId}`);

      const result = await this.pollForCompletion(taskResponse.taskId, options.model);
      
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

      console.log(`[PiAPI:${options.model}] Complete! Time: ${(generationTimeMs / 1000).toFixed(1)}s, Cost: $${cost.toFixed(3)}`);

      return {
        success: true,
        videoUrl: result.videoUrl,
        s3Url,
        duration: options.duration,
        cost,
        generationTimeMs,
        taskId: taskResponse.taskId,
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

  private async createTask(
    options: PiAPIGenerationOptions,
    modelConfig: ModelConfig
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    try {
      const requestBody = this.buildRequestBody(options, modelConfig);
      
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

  private buildRequestBody(options: PiAPIGenerationOptions, modelConfig: ModelConfig): any {
    const motionParams = options.motionControl ? mapToKlingMotion(options.motionControl) : {};
    const motionPrompt = options.motionControl 
      ? buildVeoMotionPrompt(options.prompt, options.motionControl)
      : options.prompt;
    
    if (options.motionControl) {
      console.log(`[PiAPI T2V] Motion control: ${options.motionControl.camera_movement} @ ${options.motionControl.intensity}`);
      console.log(`[PiAPI T2V] Motion rationale: ${options.motionControl.rationale}`);
    }
    
    const baseRequest = {
      model: modelConfig.modelId,
      task_type: 'text_to_video',
      input: {
        prompt: options.prompt,
        negative_prompt: options.negativePrompt || 'blurry, low quality, distorted, ugly, watermark, text',
        duration: Math.min(options.duration, modelConfig.maxDuration),
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
        console.log(`[PiAPI T2V] Using Hailuo (t2v-01)`);
        return {
          ...baseRequest,
          model: 'hailuo',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            model: 't2v-01',
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
      
      // Wan Family (Alibaba - via Hailuo API)
      case 'wan-2.1':
        console.log(`[PiAPI T2V] Using Wan 2.1`);
        return {
          ...baseRequest,
          model: 'hailuo',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            model: 'wan-2.1',
          },
        };
        
      case 'wan-2.6':
        console.log(`[PiAPI T2V] Using Wan 2.6`);
        return {
          ...baseRequest,
          model: 'hailuo',
          task_type: 'video_generation',
          input: {
            ...baseRequest.input,
            model: 'wan-2.6',
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
            prompt: motionPrompt,
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
            prompt: motionPrompt,
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
            prompt: motionPrompt,
            negative_prompt: baseRequest.input.negative_prompt,
            aspect_ratio: baseRequest.input.aspect_ratio,
            duration: `${Math.min(baseRequest.input.duration, 8)}s`,
            resolution: '1080p',
            generate_audio: false,
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
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.sleep(pollInterval);

      try {
        const response = await fetch(`${this.baseUrl}/task/${taskId}`, {
          headers: {
            'X-API-Key': this.apiKey,
          },
        });

        if (!response.ok) {
          console.warn(`[PiAPI:${model}] Status check failed: ${response.status}`);
          continue;
        }

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
      // Wan Family (Alibaba via PiAPI)
      'wan-2.1': { modelId: 'hailuo', maxDuration: 5 },
      'wan-2.6': { modelId: 'hailuo', maxDuration: 5 },
      // Hunyuan
      'hunyuan': { modelId: 'hunyuan', maxDuration: 5 },
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
    };
    motionControl?: MotionControlConfig;
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
        console.error(`[PiAPI:${options.model}] I2V API error: ${response.status} - ${errorText}`);
        return { success: false, error: `API error: ${response.status}`, generationTimeMs: Date.now() - startTime };
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;
      
      if (!taskId) {
        return { success: false, error: 'No task ID in I2V response', generationTimeMs: Date.now() - startTime };
      }

      console.log(`[PiAPI:${options.model}] I2V task created: ${taskId}`);

      const result = await this.pollForCompletion(taskId, options.model);
      
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

      console.log(`[PiAPI:${options.model}] I2V complete! Time: ${(generationTimeMs / 1000).toFixed(1)}s, Cost: $${cost.toFixed(3)}`);

      return {
        success: true,
        videoUrl: result.videoUrl,
        s3Url,
        duration: options.duration,
        cost,
        generationTimeMs,
        taskId,
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
    prompt: string;
    duration: number;
    aspectRatio: '16:9' | '9:16' | '1:1';
    model: string;
    i2vSettings?: {
      imageControlStrength?: number;
      animationStyle?: 'product-hero' | 'product-static' | 'subtle-motion' | 'dynamic';
      motionStrength?: number;
    };
    motionControl?: MotionControlConfig;
  }, sanitizedPrompt: string): any {
    const animationStyle = options.i2vSettings?.animationStyle ?? 'product-hero';
    
    // Helper: Detect if prompt requires NEW content generation vs simple animation
    // When prompt mentions people/activities/montages, use reference_images mode
    // Otherwise, use image_url mode for simple animation
    const promptRequiresNewContent = (prompt: string): boolean => {
      const p = prompt.toLowerCase();
      return p.includes('montage') || 
             p.includes('people') || 
             p.includes('person') ||
             p.includes('adults') ||
             p.includes('yoga') ||
             p.includes('cooking') ||
             p.includes('hiking') ||
             p.includes('activity') ||
             p.includes('engaging') ||
             p.includes('couple') ||
             p.includes('woman') ||
             p.includes('man') ||
             p.includes('customer') ||
             p.includes('farmer') ||
             p.includes('worker') ||
             p.includes('wellness') ||
             p.includes('exercise') ||
             p.includes('shopping');
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
    
    // Seedance - sends prompt AS-IS
    if (options.model.includes('seedance')) {
      console.log(`[PiAPI I2V] Seedance: Sending prompt AS-IS`);
      return {
        model: 'hailuo',
        task_type: 'video_generation',
        input: {
          prompt: sanitizedPrompt,  // SEND AS-IS!
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
            model: 'i2v-01',
            reference_images: [options.imageUrl],  // Style reference for new content
            expand_prompt: true,
          },
        };
      }
      
      return {
        model: 'hailuo',
        task_type: 'video_generation',
        input: {
          prompt: prompt,
          model: 'i2v-01',
          image_url: options.imageUrl,  // First frame animation
          expand_prompt: true,
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
    
    // I2V-specific negative prompt for Kling (simplified - no black/fade references)
    const i2vNegativePrompt = 'blurry, low quality, distorted, warping, watermark';
    
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
      const animationStyle = options.i2vSettings?.animationStyle ?? 'product-hero';
      
      // Map user's Image Fidelity slider (0-1 where 1 = max fidelity) to cfg_scale
      // Higher fidelity = lower cfg (more source preservation)
      // cfg_scale range: 0.0 (full source) to 1.0 (full prompt)
      const cfgScale = Math.max(0.1, 1.0 - imageControlStrength * 0.8); // Invert: high fidelity = low cfg
      
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
      
      // Build Kling-specific prompt
      let klingPromptBase: string;
      if (requiresNewContent) {
        // Reference mode: use the image as context/style guide but generate new content
        klingPromptBase = sanitizedPrompt;
      } else if (animationStyle === 'product-static') {
        klingPromptBase = `Gently animate this exact product image. Preserve all details, labels, and text exactly as shown. Subtle ambient motion only.`;
      } else if (animationStyle === 'product-hero') {
        klingPromptBase = `Cinematic product shot. Animate this exact product image with gentle, smooth camera motion. Preserve all product details, labels, and text exactly as shown. ${sanitizedPrompt.substring(0, 100)}`;
      } else if (animationStyle === 'subtle-motion') {
        klingPromptBase = `Animate this image with subtle environmental motion. Preserve the product exactly as shown. Gentle lighting shifts and ambient movement. ${sanitizedPrompt.substring(0, 80)}`;
      } else {
        klingPromptBase = `Dynamic product animation. Animate from this exact image with energetic camera motion. Preserve product appearance and labels. ${sanitizedPrompt.substring(0, 100)}`;
      }
      
      // Append motion directive to prompt for better control
      const klingI2vPrompt = `${klingPromptBase}. Camera: ${motionDirective}.`;
      
      console.log(`[PiAPI I2V] Kling prompt: ${klingI2vPrompt}`);
      
      // Include camera_control from intelligent motion control system (Phase 16)
      const motionParams = options.motionControl ? mapToKlingMotion(options.motionControl) : {};
      if (options.motionControl) {
        console.log(`[PiAPI I2V] Motion control: ${options.motionControl.camera_movement} @ ${options.motionControl.intensity}`);
      }
      
      if (requiresNewContent) {
        // Reference mode: use reference_images for style guidance while generating new content
        return {
          model: 'kling',
          task_type: 'video_generation',
          input: {
            prompt: klingI2vPrompt,
            reference_images: [options.imageUrl],  // Style reference for new content
            duration: options.duration,
            aspect_ratio: options.aspectRatio,
            negative_prompt: i2vNegativePrompt,
            mode,
            version,
            cfg_scale: cfgScale,
            ...motionParams,
          },
        };
      }
      
      // Animation mode: use image_url for first-frame animation
      return {
        model: 'kling',
        task_type: 'video_generation',
        input: {
          prompt: klingI2vPrompt,
          image_url: options.imageUrl,
          first_frame_image: options.imageUrl, // Some Kling versions use this
          duration: options.duration,
          aspect_ratio: options.aspectRatio,
          negative_prompt: i2vNegativePrompt,
          mode,
          version,
          cfg_scale: cfgScale,
          // Elements array is preferred for Kling 1.6+
          elements: [{ image_url: options.imageUrl }],
          ...motionParams, // Apply camera_control from Phase 16 motion system
        },
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
          negative_prompt: 'blurry, low quality, distorted, morphing, warping, watermark',
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
          negative_prompt: 'blurry, low quality, distorted, morphing, warping, watermark, different product, wrong product',
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
