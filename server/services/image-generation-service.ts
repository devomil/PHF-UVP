import { imageProviderSelector, ImageProviderSelection } from './image-provider-selector';
import { legNextClient } from './legnext-client';
import { 
  IMAGE_PROVIDERS, 
  ImageProvider, 
  ImageStyle,
  getImageProviderForStyle,
  isLegNextProvider 
} from '../config/image-providers';
import { QualityTier } from '../config/quality-tiers';
import { resolvePlacementRules, I2IConfig } from './placement-resolver-service';
import { recraftService, RecraftModel } from './recraft.service';
import { nanoBanana2Service } from './nano-banana2.service';
import sharp from 'sharp';

const I2I_MAX_WIDTH = 1024;
const I2I_MAX_HEIGHT = 2048;

function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    if (host.startsWith('10.') || host.startsWith('192.168.') || host === '169.254.169.254') return false;
    if (host.match(/^172\.(1[6-9]|2\d|3[01])\./)) return false;
    return true;
  } catch {
    return false;
  }
}

async function ensureI2IImageSize(imageUrl: string): Promise<string> {
  if (!isAllowedImageUrl(imageUrl)) {
    throw new Error(`[I2I-Resize] Blocked disallowed image URL: ${imageUrl.substring(0, 60)}`);
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`[I2I-Resize] Failed to fetch image: HTTP ${response.status}`);
  }

  const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
  if (contentLength > 50 * 1024 * 1024) {
    throw new Error(`[I2I-Resize] Image too large to process: ${contentLength} bytes`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (width <= I2I_MAX_WIDTH && height <= I2I_MAX_HEIGHT) {
    console.log(`[I2I-Resize] Image ${width}x${height} is within limits, no resize needed`);
    return imageUrl;
  }

  console.log(`[I2I-Resize] Image ${width}x${height} exceeds ${I2I_MAX_WIDTH}x${I2I_MAX_HEIGHT}, resizing...`);

  const scaleW = I2I_MAX_WIDTH / width;
  const scaleH = I2I_MAX_HEIGHT / height;
  const scale = Math.min(scaleW, scaleH);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  const resizedBuffer = await sharp(buffer)
    .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  console.log(`[I2I-Resize] Resized to ${newWidth}x${newHeight} (${resizedBuffer.length} bytes)`);

  const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('[I2I-Resize] AWS credentials not configured (REMOTION_AWS_ACCESS_KEY_ID/REMOTION_AWS_SECRET_ACCESS_KEY)');
  }

  const region = process.env.REMOTION_AWS_REGION || 'us-east-2';
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const bucket = process.env.REMOTION_S3_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';
  const key = `video-assets/i2i-resized/${Date.now()}_${newWidth}x${newHeight}.png`;

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: resizedBuffer,
    ContentType: 'image/png',
    ACL: 'public-read',
  }));

  const resizedUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  console.log(`[I2I-Resize] Uploaded resized image: ${resizedUrl.substring(0, 80)}`);
  return resizedUrl;
}

interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  provider?: string;
  style?: ImageStyle;
  qualityTier?: QualityTier;
  aspectRatio?: string;
  /** Optional URLs of reference images. Consumed by Nano Banana 2
   *  (Gemini-conditioned, capped at 14), Flux (PiAPI ip_adapter, capped at
   *  multiImageSupport.maxImages), and fal.ai (reference_images, capped at
   *  multiImageSupport.maxImages). Excess images are silently dropped. */
  referenceImages?: string[];
  /** Optional explicit text-layout hints forwarded only to Recraft V3
   *  (typography-accurate). Other providers ignore this field. */
  textLayout?: Array<{ text: string; x: number; y: number; width?: number; height?: number; font_size?: number }>;
}

interface I2IRequest {
  referenceImageUrl: string;
  prompt: string;
  strength?: number;
  provider?: string;
  qualityTier?: QualityTier;
  width?: number;
  height?: number;
  assetType?: string;
  useCase?: 'background-generation' | 'style-transfer' | 'scene-integration' | 'product-placement';
  noFallback?: boolean;
  useApiDefaults?: boolean;
  outputFormat?: 'jpg' | 'png';
  aspectRatio?: string;
  resolution?: '2k' | '4k';
  safetyLevel?: 'low' | 'medium' | 'high';
  additionalImageUrls?: string[];
}

interface GeneratedImage {
  url: string;
  provider: string;
  prompt: string;
  width: number;
  height: number;
  cost?: number;
  generationType?: 'txt2img' | 'img2img';
  sourceAsset?: string;
}

class ImageGenerationService {
  
  async generateImage(options: ImageGenerationOptions): Promise<GeneratedImage> {
    const qualityTier = options.qualityTier || 'premium';
    const style = options.style || 'default';
    
    let provider: ImageProvider;
    
    if (options.provider && IMAGE_PROVIDERS[options.provider]) {
      provider = IMAGE_PROVIDERS[options.provider];
    } else {
      provider = getImageProviderForStyle(style, qualityTier);
    }
    
    console.log(`[ImageGen] Generating with ${provider.name} (${qualityTier} tier): ${options.prompt.substring(0, 50)}...`);
    
    if (isLegNextProvider(provider.id)) {
      return this.generateWithLegNext(options, provider);
    }

    if (provider.apiProvider === 'recraft') {
      return this.generateWithRecraft(options, provider);
    }

    if (provider.apiProvider === 'nano-banana-2') {
      return this.generateWithNanoBanana2(options);
    }
    
    if (provider.apiProvider === 'piapi') {
      return this.generateWithFlux(options, provider);
    }
    
    return this.generateWithFalAI(options, provider);
  }
  
  async generateImageToImage(request: I2IRequest): Promise<GeneratedImage> {
    const qualityTier = request.qualityTier || 'premium';
    
    const resizedRefUrl = await ensureI2IImageSize(request.referenceImageUrl);
    
    console.log(`[I2I] Reference: ${resizedRefUrl.substring(0, 50)}...`);
    console.log(`[I2I] Quality tier: ${qualityTier}`);
    
    const piApiKey = process.env.PIAPI_API_KEY;
    if (!piApiKey) {
      throw new Error('PIAPI_API_KEY not configured');
    }
    
    const isNanoBanana = !request.provider || request.provider === 'nano-banana-pro' || request.provider === 'auto';
    const isKontext = !request.provider || request.provider === 'flux-kontext' || request.provider === 'auto' || request.provider === 'nano-banana-pro';
    
    if (isNanoBanana) {
      console.log(`[I2I] Using Nano Banana Pro (primary I2I provider)`);
      try {
        const nbResult = await this.generateWithNanoBanana(resizedRefUrl, request.prompt, piApiKey, {
          outputFormat: request.outputFormat,
          additionalImageUrls: request.additionalImageUrls,
          aspectRatio: request.aspectRatio,
          resolution: request.resolution,
          safetyLevel: request.safetyLevel,
        });
        console.log(`[I2I] Nano Banana generation complete: ${nbResult.url.substring(0, 50)}...`);
        return {
          ...nbResult,
          provider: 'nano-banana-pro',
          prompt: request.prompt,
          generationType: 'img2img',
          sourceAsset: request.referenceImageUrl,
        };
      } catch (nbError: any) {
        console.warn(`[I2I] Nano Banana failed: ${nbError.message}, falling back to Kontext`);
      }
    }
    
    if (isKontext) {
      console.log(`[I2I] Using Kontext mode (img2img-kontext) as fallback`);
      try {
        const kontextResult = await this.generateWithKontext(resizedRefUrl, request.prompt, piApiKey);
        console.log(`[I2I] Kontext generation complete: ${kontextResult.url.substring(0, 50)}...`);
        return {
          ...kontextResult,
          provider: 'flux-kontext',
          prompt: request.prompt,
          generationType: 'img2img',
          sourceAsset: request.referenceImageUrl,
        };
      } catch (kontextError: any) {
        console.warn(`[I2I] Kontext failed: ${kontextError.message}, falling back to standard img2img`);
      }
    }
    
    let strength = request.strength ?? 0.35;
    let i2iConfig: I2IConfig | null = null;
    
    if (request.assetType) {
      const placementRules = resolvePlacementRules(request.assetType, {
        frameWidth: request.width || 1920,
        frameHeight: request.height || 1080,
        useCase: request.useCase || 'scene-integration',
      });
      i2iConfig = placementRules.i2i;
      strength = request.strength ?? i2iConfig.strength;
    }
    
    const providerId = request.provider && request.provider !== 'auto' && request.provider !== 'flux-kontext' && request.provider !== 'nano-banana-pro'
      ? request.provider : 'flux-1.1-pro';
    console.log(`[I2I] Using standard img2img with provider: ${providerId}`);
    
    const piapiModelMap: Record<string, string> = {
      'flux-1.1-pro': 'Qubico/flux1-dev',
      'flux': 'Qubico/flux1-schnell',
      'stability': 'sd3',
      'ideogram': 'ideogram-v2',
    };
    
    const model = piapiModelMap[providerId] || 'Qubico/flux1-dev';
    const guidanceScale = i2iConfig?.guidanceScale ?? 3.5;
    
    const inputPayload: Record<string, any> = {
      image: resizedRefUrl,
      prompt: request.prompt,
    };
    if (!request.useApiDefaults) {
      inputPayload.image_strength = strength;
      inputPayload.guidance_scale = guidanceScale;
    }
    console.log(`[I2I] Standard img2img: strength=${strength}, guidance=${guidanceScale}`);

    try {
      const response = await fetch('https://api.piapi.ai/api/v1/task', {
        method: 'POST',
        headers: {
          'X-API-Key': piApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          task_type: 'img2img',
          input: inputPayload,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[I2I] API error: ${response.status} - ${errorText}`);
        throw new Error(`I2I generation failed: ${errorText}`);
      }
      
      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;
      
      if (!taskId) {
        throw new Error('No task ID returned from I2I API');
      }
      
      console.log(`[I2I] Task created: ${taskId}`);
      
      const result = await this.pollForI2ICompletion(taskId, piApiKey);
      
      console.log(`[I2I] Generation complete: ${result.url.substring(0, 50)}...`);
      
      return {
        ...result,
        provider: providerId,
        prompt: request.prompt,
        generationType: 'img2img',
        sourceAsset: request.referenceImageUrl,
      };
      
    } catch (error: any) {
      console.error(`[I2I] Error:`, error.message);
      if (request.noFallback) {
        throw error;
      }
      console.log(`[I2I] Falling back to standard txt2img`);
      return this.generateImage({
        prompt: request.prompt,
        qualityTier,
        width: request.width,
        height: request.height,
      });
    }
  }
  
  private async generateWithNanoBanana(
    imageUrl: string,
    prompt: string,
    apiKey: string,
    options: {
      outputFormat?: 'jpg' | 'png';
      additionalImageUrls?: string[];
      aspectRatio?: string;
      resolution?: string;
      safetyLevel?: string;
    } = {}
  ): Promise<{ url: string; width: number; height: number }> {
    const allImageUrls = [imageUrl];
    if (options.additionalImageUrls?.length) {
      allImageUrls.push(...options.additionalImageUrls.slice(0, 13));
    }

    const inputPayload: Record<string, any> = {
      prompt,
      image_urls: allImageUrls,
    };

    if (options.outputFormat) {
      inputPayload.output_format = options.outputFormat;
    }
    if (options.aspectRatio) {
      inputPayload.aspect_ratio = options.aspectRatio;
    }
    if (options.resolution) {
      inputPayload.resolution = options.resolution;
    }
    if (options.safetyLevel) {
      inputPayload.safety_level = options.safetyLevel;
    }

    console.log(`[I2I-NanoBanana] Sending request with ${allImageUrls.length} source image(s), options:`, JSON.stringify({
      outputFormat: options.outputFormat,
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
      numImages: 1,
      sourceImageCount: allImageUrls.length,
    }));

    const response = await fetch('https://api.piapi.ai/api/v1/task', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini',
        task_type: 'nano-banana-pro',
        input: inputPayload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[I2I-NanoBanana] API error: ${response.status} - ${errorText}`);
      throw new Error(`Nano Banana generation failed: ${errorText}`);
    }

    const data = await response.json();
    const taskId = data.data?.task_id || data.task_id;

    if (!taskId) {
      throw new Error('No task ID returned from Nano Banana API');
    }

    console.log(`[I2I-NanoBanana] Task created: ${taskId}`);
    return this.pollForNanoBananaCompletion(taskId, apiKey);
  }

  private async pollForNanoBananaCompletion(taskId: string, apiKey: string): Promise<{ url: string; width: number; height: number }> {
    const maxAttempts = 60;
    const pollInterval = 3000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const response = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
        headers: { 'X-API-Key': apiKey },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const status = data.data?.status || data.status;

      if (status === 'completed' || status === 'success') {
        const output = data.data?.output || data.output;
        const imageUrls = output?.image_urls || [];
        const imageUrl = imageUrls[0] || output?.image_url;

        if (imageUrl && typeof imageUrl === 'string') {
          console.log(`[I2I-NanoBanana] Generation complete, got ${imageUrls.length} image(s)`);
          return { url: imageUrl, width: 1280, height: 720 };
        }
        throw new Error('Nano Banana completed but no image URL in output');
      }

      if (status === 'failed' || status === 'error') {
        const errorMsg = data.data?.error?.message || data.data?.logs?.join(', ') || 'Unknown error';
        throw new Error(`Nano Banana generation failed: ${errorMsg}`);
      }

      if (attempt % 5 === 0) {
        console.log(`[I2I-NanoBanana] Polling attempt ${attempt + 1}/${maxAttempts}, status: ${status}`);
      }
    }

    throw new Error('Nano Banana generation timed out after 3 minutes');
  }

  private async generateWithKontext(
    imageUrl: string, 
    prompt: string, 
    apiKey: string
  ): Promise<{ url: string; width: number; height: number }> {
    const response = await fetch('https://api.piapi.ai/api/v1/task', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Qubico/flux1-kontext-dev',
        task_type: 'img2img-kontext',
        input: {
          prompt,
          image: imageUrl,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[I2I-Kontext] API error: ${response.status} - ${errorText}`);
      throw new Error(`Kontext generation failed: ${errorText}`);
    }

    const data = await response.json();
    const taskId = data.data?.task_id || data.task_id;

    if (!taskId) {
      throw new Error('No task ID returned from Kontext API');
    }

    console.log(`[I2I-Kontext] Task created: ${taskId}`);
    return this.pollForI2ICompletion(taskId, apiKey);
  }

  private async pollForI2ICompletion(taskId: string, apiKey: string): Promise<{ url: string; width: number; height: number }> {
    const maxAttempts = 60;
    const pollInterval = 3000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      const response = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
        headers: { 'X-API-Key': apiKey },
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const status = data.data?.status || data.status;
      
      if (status === 'completed' || status === 'success') {
        const output = data.data?.output || data.output;
        const imageUrl = output?.image_url || output?.images?.[0] || output;
        
        if (imageUrl && typeof imageUrl === 'string') {
          return { url: imageUrl, width: 1280, height: 720 };
        }
      } else if (status === 'failed' || status === 'error') {
        throw new Error(`I2I task failed: ${data.data?.error || 'Unknown error'}`);
      }
      
      if (attempt % 5 === 0) {
        console.log(`[I2I] Polling... attempt ${attempt + 1}/${maxAttempts} (status: ${status})`);
      }
    }
    
    throw new Error('I2I generation timed out');
  }
  
  private async generateWithLegNext(
    options: ImageGenerationOptions, 
    provider: ImageProvider
  ): Promise<GeneratedImage> {
    const width = options.width || 1280;
    const height = options.height || 720;
    
    if (!legNextClient.isConfigured()) {
      console.log('[ImageGen] LegNext not configured, falling back to Flux');
      return this.generateWithFlux(options, IMAGE_PROVIDERS['flux-1.1-pro'] || IMAGE_PROVIDERS['flux']);
    }
    
    const hasCredits = await legNextClient.hasAvailableCredits(4);
    if (!hasCredits) {
      console.log('[ImageGen] LegNext credits low, falling back to Flux');
      return this.generateWithFlux(options, IMAGE_PROVIDERS['flux-1.1-pro'] || IMAGE_PROVIDERS['flux']);
    }
    
    try {
      const enhancedPrompt = this.enhancePromptForMidjourney(options.prompt, options.style);
      
      const aspectRatio = options.aspectRatio || this.calculateAspectRatio(width, height);
      
      const result = await legNextClient.generateImage({
        prompt: enhancedPrompt,
        model: provider.modelId as any,
        mode: 'fast',
        aspectRatio,
        stylize: provider.defaultParams?.stylize || 100,
      });
      
      if (!result.success || !result.imageUrl) {
        console.error(`[ImageGen] LegNext failed: ${result.error}, falling back`);
        return this.generateWithFlux(options, IMAGE_PROVIDERS['flux-1.1-pro'] || IMAGE_PROVIDERS['flux']);
      }
      
      console.log(`[ImageGen] LegNext success: ${result.imageUrl.substring(0, 50)}...`);
      
      return {
        url: result.imageUrl,
        provider: provider.id,
        prompt: options.prompt,
        width,
        height,
        cost: provider.costPerImage,
      };
      
    } catch (error: any) {
      console.error('[ImageGen] LegNext error:', error.message);
      return this.generateWithFlux(options, IMAGE_PROVIDERS['flux-1.1-pro'] || IMAGE_PROVIDERS['flux']);
    }
  }
  
  private enhancePromptForMidjourney(prompt: string, style?: ImageStyle): string {
    let enhanced = prompt;
    
    const qualityTerms = ['high quality', '8k', 'detailed', 'professional'];
    const hasQualityTerm = qualityTerms.some(term => prompt.toLowerCase().includes(term));
    
    if (!hasQualityTerm) {
      enhanced += ', high quality, professional photography';
    }
    
    switch (style) {
      case 'lifestyle':
        enhanced += ', natural lighting, candid, authentic';
        break;
      case 'hero-shot':
        enhanced += ', dramatic lighting, cinematic composition';
        break;
      case 'product-photo':
        enhanced += ', studio lighting, clean background, commercial photography';
        break;
      case 'artistic':
        enhanced += ', artistic, creative, visually striking';
        break;
      case 'nature':
        enhanced += ', natural environment, organic, scenic';
        break;
      case 'person':
        enhanced += ', natural portrait, warm lighting, genuine expression';
        break;
    }
    
    return enhanced;
  }
  
  private calculateAspectRatio(width: number, height: number): string {
    const ratio = width / height;
    
    if (Math.abs(ratio - 16/9) < 0.1) return '16:9';
    if (Math.abs(ratio - 9/16) < 0.1) return '9:16';
    if (Math.abs(ratio - 4/3) < 0.1) return '4:3';
    if (Math.abs(ratio - 3/4) < 0.1) return '3:4';
    if (Math.abs(ratio - 1) < 0.1) return '1:1';
    if (Math.abs(ratio - 3/2) < 0.1) return '3:2';
    if (Math.abs(ratio - 2/3) < 0.1) return '2:3';
    
    return '16:9';
  }
  
  private async generateWithRecraft(
    options: ImageGenerationOptions,
    provider: ImageProvider
  ): Promise<GeneratedImage> {
    if (!recraftService.isAvailable()) {
      console.warn('[ImageGen] Recraft not available, falling back to Flux');
      return this.generateWithFlux(options);
    }

    const aspectRatio = options.aspectRatio || this.calculateAspectRatio(options.width || 1280, options.height || 720);

    try {
      const result = await recraftService.generateImage({
        prompt: options.prompt,
        model: provider.modelId as RecraftModel,
        aspectRatio: aspectRatio as any,
        ...(options.textLayout && options.textLayout.length > 0 ? { textLayout: options.textLayout } : {}),
      }, `images/recraft/${Date.now()}`);

      return {
        url: result.imageUrl,
        provider: provider.name,
        prompt: options.prompt,
        width: provider.maxWidth || 1344,
        height: provider.maxHeight || 768,
        cost: provider.costPerImage,
      };
    } catch (error: any) {
      console.error(`[ImageGen] Recraft error: ${error.message}`);
      console.log('[ImageGen] Falling back to Flux...');
      return this.generateWithFlux(options);
    }
  }

  private async generateWithNanoBanana2(
    options: ImageGenerationOptions
  ): Promise<GeneratedImage> {
    try {
      const aspectRatio = options.aspectRatio || this.calculateAspectRatio(options.width || 1280, options.height || 720);
      const refs = options.referenceImages;

      const result = await nanoBanana2Service.generateImage({
        prompt: options.prompt,
        aspectRatio: aspectRatio as any,
        format: 'jpeg',
        ...(Array.isArray(refs) && refs.length > 0 ? { referenceImages: refs.slice(0, 14) } : {}),
      });

      return {
        url: result.imageUrl,
        width: options.width || 1280,
        height: options.height || 720,
        provider: 'nano-banana-2',
      };
    } catch (error: any) {
      console.error(`[ImageGen] Nano Banana 2 error: ${error.message}`);
      console.log('[ImageGen] Falling back to Flux...');
      return this.generateWithFlux(options);
    }
  }

  private async generateWithFlux(
    options: ImageGenerationOptions,
    provider?: ImageProvider
  ): Promise<GeneratedImage> {
    let width = options.width || 1280;
    let height = options.height || 720;
    const usedProvider = provider || IMAGE_PROVIDERS['flux'];

    // Flux Schnell on PiAPI maxes at 1024x1024. Clamp while preserving aspect ratio
    // so a 1920x1080 fallback request doesn't 500 with "output image size too large".
    const modelId = usedProvider.modelId || 'Qubico/flux1-schnell';
    const fluxMax = modelId.includes('schnell') ? 1024 : 1280;
    if (width > fluxMax || height > fluxMax) {
      const scale = fluxMax / Math.max(width, height);
      const newW = Math.max(64, Math.round((width * scale) / 8) * 8);
      const newH = Math.max(64, Math.round((height * scale) / 8) * 8);
      console.warn(`[ImageGen] Flux fallback: clamping ${width}x${height} → ${newW}x${newH} (max ${fluxMax} for ${modelId})`);
      width = newW;
      height = newH;
    }
    
    // Build ip_adapter array for multi-image reference support (capped at maxImages)
    const rawReferenceImages = options.referenceImages || [];
    const maxFluxImages = usedProvider.multiImageSupport?.maxImages ?? 4;
    let fluxReferenceImages = rawReferenceImages;
    if (rawReferenceImages.length > maxFluxImages) {
      console.warn(`[ImageGen] Flux: ${rawReferenceImages.length} reference images supplied but provider cap is ${maxFluxImages} — dropping ${rawReferenceImages.length - maxFluxImages} excess image(s)`);
      fluxReferenceImages = rawReferenceImages.slice(0, maxFluxImages);
    }
    const ipAdapterEntries = fluxReferenceImages.map(url => ({ image_url: url, weight: 0.8 }));

    try {
      const apiKey = process.env.PIAPI_API_KEY;
      if (!apiKey) {
        throw new Error('PIAPI_API_KEY not configured');
      }
      
      const response = await fetch('https://api.piapi.ai/api/v1/task', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: usedProvider.modelId || 'Qubico/flux1-schnell',
          task_type: usedProvider.defaultParams?.taskType || 'txt2img',
          input: {
            prompt: options.prompt,
            negative_prompt: options.negativePrompt || 'blurry, low quality, distorted, watermark, text',
            width,
            height,
            num_inference_steps: 4,
            ...(usedProvider.defaultParams?.output_format ? { output_format: usedProvider.defaultParams.output_format } : {}),
            ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
            ...(ipAdapterEntries.length > 0 ? { ip_adapter: ipAdapterEntries } : {}),
          },
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Flux API error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      
      if (result.data?.output?.image_url) {
        return {
          url: result.data.output.image_url,
          provider: usedProvider.id,
          prompt: options.prompt,
          width,
          height,
          cost: usedProvider.costPerImage,
        };
      }
      
      if (result.data?.task_id) {
        console.log(`[ImageGen] Task created: ${result.data.task_id}, polling for completion...`);
        const polledUrl = await this.pollPiAPITask(result.data.task_id, apiKey);
        if (polledUrl) {
          return {
            url: polledUrl,
            provider: usedProvider.id,
            prompt: options.prompt,
            width,
            height,
            cost: usedProvider.costPerImage,
          };
        }
        return {
          url: `pending:${result.data.task_id}`,
          provider: usedProvider.id,
          prompt: options.prompt,
          width,
          height,
          cost: usedProvider.costPerImage,
        };
      }
      
      throw new Error('Unexpected Flux response format');
      
    } catch (error: any) {
      console.error('[ImageGen] Flux.1 failed:', error.message);
      console.log('[ImageGen] Falling back to fal.ai');
      return this.generateWithFalAI(options);
    }
  }
  
  private async generateWithFalAI(
    options: ImageGenerationOptions,
    provider?: ImageProvider
  ): Promise<GeneratedImage> {
    const width = options.width || 1280;
    const height = options.height || 720;
    const usedProvider = provider || IMAGE_PROVIDERS['falai'];

    // Build reference_images array for multi-image support (capped at maxImages)
    const rawReferenceImages = options.referenceImages || [];
    const maxFalImages = usedProvider.multiImageSupport?.maxImages ?? 4;
    let falReferenceImages = rawReferenceImages;
    if (rawReferenceImages.length > maxFalImages) {
      console.warn(`[ImageGen] fal.ai: ${rawReferenceImages.length} reference images supplied but provider cap is ${maxFalImages} — dropping ${rawReferenceImages.length - maxFalImages} excess image(s)`);
      falReferenceImages = rawReferenceImages.slice(0, maxFalImages);
    }
    const hasReferenceImages = falReferenceImages.length > 0;
    
    try {
      const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
      if (!apiKey) {
        console.log('[ImageGen] FAL_KEY not configured, returning placeholder');
        return {
          url: 'placeholder:no-api-key',
          provider: 'falai',
          prompt: options.prompt,
          width,
          height,
        };
      }

      // When reference images are supplied use flux-pro/v1.1 which supports reference_images;
      // otherwise fall back to the cheaper flux/schnell endpoint.
      const endpoint = hasReferenceImages
        ? 'https://fal.run/fal-ai/flux-pro/v1.1'
        : 'https://fal.run/fal-ai/flux/schnell';

      const body: Record<string, any> = {
        prompt: options.prompt,
        image_size: { width, height },
        num_inference_steps: hasReferenceImages ? 28 : 4,
        num_images: 1,
        enable_safety_checker: true,
      };

      if (hasReferenceImages) {
        body.reference_images = falReferenceImages.map(url => ({ url }));
        console.log(`[ImageGen] fal.ai: sending ${falReferenceImages.length} reference image(s) to flux-pro/v1.1`);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`fal.ai API error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      
      return {
        url: result.images?.[0]?.url || result.url || 'placeholder:response-parse-error',
        provider: usedProvider.id,
        prompt: options.prompt,
        width,
        height,
        cost: usedProvider.costPerImage,
      };
      
    } catch (error: any) {
      console.error('[ImageGen] fal.ai failed:', error.message);
      return {
        url: 'placeholder:generation-failed',
        provider: 'falai',
        prompt: options.prompt,
        width: options.width || 1280,
        height: options.height || 720,
      };
    }
  }
  
  async generateWithProvider(
    prompt: string,
    providerId: string,
    options?: {
      width?: number;
      height?: number;
      aspectRatio?: string;
      style?: ImageStyle;
    }
  ): Promise<GeneratedImage> {
    const provider = IMAGE_PROVIDERS[providerId];
    
    if (!provider) {
      console.warn(`[ImageGen] Unknown provider ${providerId}, falling back to flux`);
      return this.generateImage({
        prompt,
        width: options?.width,
        height: options?.height,
        style: options?.style,
      });
    }
    
    return this.generateImage({
      prompt,
      provider: providerId,
      width: options?.width,
      height: options?.height,
      aspectRatio: options?.aspectRatio,
      style: options?.style,
    });
  }
  
  async generateImagesForScenes(
    scenes: Array<{
      sceneIndex: number;
      contentType: string;
      sceneType: string;
      visualDirection: string;
      needsImage: boolean;
    }>,
    qualityTier: QualityTier = 'premium'
  ): Promise<Map<number, GeneratedImage>> {
    const providerSelections = imageProviderSelector.selectProvidersForScenes(scenes);
    const results = new Map<number, GeneratedImage>();
    
    for (const scene of scenes.filter(s => s.needsImage)) {
      const selection = providerSelections.get(scene.sceneIndex);
      if (!selection) continue;
      
      const style = this.contentTypeToStyle(scene.contentType);
      
      try {
        const image = await this.generateImage({
          prompt: scene.visualDirection,
          style,
          qualityTier,
        });
        
        results.set(scene.sceneIndex, image);
        console.log(`[ImageGen] Scene ${scene.sceneIndex + 1}: ${image.provider} ✓`);
        
      } catch (error: any) {
        console.error(`[ImageGen] Scene ${scene.sceneIndex + 1} failed:`, error.message);
      }
    }
    
    return results;
  }
  
  private contentTypeToStyle(contentType: string): ImageStyle {
    switch (contentType) {
      case 'product':
        return 'product-photo';
      case 'lifestyle':
      case 'person':
        return 'lifestyle';
      case 'nature':
        return 'nature';
      case 'artistic':
        return 'artistic';
      default:
        return 'default';
    }
  }
  
  async checkLegNextStatus(): Promise<{
    configured: boolean;
    available: boolean;
    balance?: number;
    plan?: string;
  }> {
    const configured = legNextClient.isConfigured();
    
    if (!configured) {
      return { configured: false, available: false };
    }
    
    const balance = await legNextClient.getBalance();
    
    return {
      configured: true,
      available: balance.points >= 4,
      balance: balance.points,
      plan: balance.plan,
    };
  }

  private async pollPiAPITask(taskId: string, apiKey: string): Promise<string | null> {
    const maxAttempts = 60;
    const pollInterval = 3000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const response = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
          headers: { 'X-API-Key': apiKey },
        });

        if (!response.ok) continue;

        const data = await response.json();
        const status = data.data?.status || data.status;

        if (status === 'completed' || status === 'success') {
          const output = data.data?.output;
          if (typeof output === 'string') return output;
          if (output?.image_url) return output.image_url;
          if (Array.isArray(output) && output.length > 0) {
            return typeof output[0] === 'string' ? output[0] : output[0]?.url || output[0]?.image_url;
          }
          return null;
        }

        if (status === 'failed' || status === 'error') {
          console.error(`[ImageGen] PiAPI task ${taskId} failed`);
          return null;
        }
      } catch (error: any) {
        console.warn(`[ImageGen] Poll error for ${taskId}:`, error.message);
      }
    }

    console.warn(`[ImageGen] PiAPI task ${taskId} timed out`);
    return null;
  }

  async generateWithOpenAI(options: ImageGenerationOptions): Promise<GeneratedImage> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY not configured for GPT-Image-1 generation');
    }

    const width = options.width || 1024;
    const height = options.height || 1024;
    const size = width === height ? '1024x1024' : (width > height ? '1536x1024' : '1024x1536');

    console.log(`[ImageGen] GPT-Image-1: Generating text-capable image (${size})`);

    try {
      const body: Record<string, any> = {
        model: 'gpt-image-1',
        prompt: options.prompt,
        n: 1,
        size,
        quality: 'high',
        output_format: 'png',
      };

      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Image API error: ${response.status} - ${errorText.substring(0, 300)}`);
      }

      const data: any = await response.json();
      const imageEntry = data.data?.[0];
      let imageUrl = imageEntry?.url;

      if (!imageUrl && imageEntry?.b64_json) {
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: process.env.AWS_REGION || 'us-east-2',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
          },
        });
        const buffer = Buffer.from(imageEntry.b64_json, 'base64');
        const key = `text-images/gpt-image-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
        const bucket = process.env.AWS_S3_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';

        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: 'image/png',
          ACL: 'public-read',
        }));

        imageUrl = `https://${bucket}.s3.amazonaws.com/${key}`;
        console.log(`[ImageGen] GPT-Image-1: Uploaded base64 image to S3: ${imageUrl}`);
      }

      if (!imageUrl) {
        throw new Error('OpenAI returned no image URL or base64 data');
      }

      console.log(`[ImageGen] GPT-Image-1: Generated successfully: ${imageUrl.substring(0, 80)}...`);

      return {
        url: imageUrl,
        provider: 'gpt-image-1',
        prompt: options.prompt,
        width,
        height,
        cost: 0.04,
        generationType: 'txt2img',
      };
    } catch (error: any) {
      console.error(`[ImageGen] GPT-Image-1 failed:`, error.message);
      throw error;
    }
  }
}

export function isTextHeavyScene(scene: any): boolean {
  if (scene.type === 'chapter-title') return true;
  if (scene.type === 'infographic' || scene.type === 'infographic_diagram') return true;

  if (scene.textImageEnabled === true) return true;
  if (scene.textImageEnabled === false) return false;

  const visualDir = (scene.visualDirection || '').toLowerCase();
  const imagePrompt = ((scene as any).imagePrompt || '').toLowerCase();
  const combinedText = `${visualDir} ${imagePrompt}`;
  const textKeywords = [
    'text overlay', 'title card', 'title screen', 'text on screen',
    'words appear', 'text reading', 'text saying', 'display text',
    'show text', 'typography', 'lettering', 'headline',
    'with the text', 'with text', 'words on',
    'stat card', 'statistics card', 'data card',
    'lower third', 'callout', 'label reading',
    'digital readout', 'screen showing', 'interface display',
    'biometric', 'scanning device', 'device screen',
  ];

  if (textKeywords.some(kw => combinedText.includes(kw))) return true;

  const overlays = scene.textOverlays || [];
  if (overlays.length > 0 && overlays.some((o: any) => o.text && o.text.length > 3 && o.style === 'title')) {
    return true;
  }

  return false;
}

export const imageGenerationService = new ImageGenerationService();
