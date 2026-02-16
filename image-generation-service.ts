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

interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  provider?: string;
  style?: ImageStyle;
  qualityTier?: QualityTier;
  aspectRatio?: string;
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
    
    if (provider.apiProvider === 'piapi') {
      return this.generateWithFlux(options, provider);
    }
    
    return this.generateWithFalAI(options, provider);
  }
  
  async generateImageToImage(request: I2IRequest): Promise<GeneratedImage> {
    const qualityTier = request.qualityTier || 'premium';
    
    let i2iConfig: I2IConfig | null = null;
    let strength = request.strength ?? 0.6;
    
    if (request.assetType) {
      const placementRules = resolvePlacementRules(request.assetType, {
        frameWidth: request.width || 1920,
        frameHeight: request.height || 1080,
        useCase: request.useCase || 'scene-integration',
      });
      i2iConfig = placementRules.i2i;
      strength = request.strength ?? i2iConfig.strength;
      
      console.log(`[I2I] Asset-type-aware generation for: ${request.assetType}`);
      console.log(`[I2I] Using resolved I2I config: strength=${strength}, guidanceScale=${i2iConfig.guidanceScale}`);
      console.log(`[I2I] Config description: ${i2iConfig.description}`);
    }
    
    console.log(`[I2I] Reference: ${request.referenceImageUrl.substring(0, 50)}...`);
    console.log(`[I2I] Strength: ${strength}`);
    console.log(`[I2I] Quality tier: ${qualityTier}`);
    
    const i2iProviders: Record<QualityTier, string> = {
      ultra: 'flux-kontext',
      premium: 'flux-1.1-pro',
      standard: 'flux',
    };
    const providerId = request.provider || i2iProviders[qualityTier];
    
    console.log(`[I2I] Using provider: ${providerId}`);
    
    const piApiKey = process.env.PIAPI_API_KEY;
    if (!piApiKey) {
      throw new Error('PIAPI_API_KEY not configured');
    }
    
    const piapiModelMap: Record<string, string> = {
      'flux-kontext': 'Qubico/flux1-dev-advanced',
      'flux-1.1-pro': 'flux-pro',
      'flux': 'flux-schnell',
      'gpt-image-1.5': 'gpt-image-1.5',
      'stable-diffusion-3': 'sd3',
      'ideogram': 'ideogram-v2',
    };
    
    const model = piapiModelMap[providerId] || 'flux-pro';
    
    const guidanceScale = i2iConfig?.guidanceScale ?? 7.5;
    console.log(`[I2I] Using guidance scale: ${guidanceScale}`);
    
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
          input: {
            image_url: request.referenceImageUrl,
            prompt: request.prompt,
            strength,
            guidance_scale: guidanceScale,
          },
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
      console.log(`[I2I] Falling back to standard txt2img`);
      return this.generateImage({
        prompt: request.prompt,
        qualityTier,
        width: request.width,
        height: request.height,
      });
    }
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
  
  private async generateWithFlux(
    options: ImageGenerationOptions,
    provider?: ImageProvider
  ): Promise<GeneratedImage> {
    const width = options.width || 1280;
    const height = options.height || 720;
    const usedProvider = provider || IMAGE_PROVIDERS['flux'];
    
    try {
      const apiKey = process.env.PIAPI_API_KEY;
      if (!apiKey) {
        throw new Error('PIAPI_API_KEY not configured');
      }
      
      const response = await fetch('https://api.piapi.ai/api/v1/task', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: usedProvider.modelId || 'Qubico/flux1-schnell',
          task_type: 'txt2img',
          input: {
            prompt: options.prompt,
            negative_prompt: options.negativePrompt || 'blurry, low quality, distorted, watermark, text',
            width,
            height,
            num_inference_steps: 4,
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
        console.log(`[ImageGen] Flux task created: ${result.data.task_id}`);
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
      
      const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: options.prompt,
          image_size: { width, height },
          num_inference_steps: 4,
          num_images: 1,
          enable_safety_checker: true,
        }),
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
}

export const imageGenerationService = new ImageGenerationService();
