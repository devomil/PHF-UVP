import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export interface ProductImageOptions {
  productName: string;
  productDescription?: string;
  imageType: 'product-shot' | 'lifestyle' | 'hero' | 'overlay';
  style?: 'studio' | 'natural' | 'dramatic' | 'minimal';
  background?: 'white' | 'gradient' | 'natural' | 'transparent' | 'custom';
  customBackground?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3';
  lighting?: 'soft' | 'dramatic' | 'natural' | 'studio';
}

export interface GeneratedProductImage {
  url: string;
  s3Url: string;
  type: string;
  style: string;
  cost: number;
}

const PRODUCT_PROMPT_TEMPLATES = {
  'product-shot': {
    studio: '{product}, professional product photography, studio lighting, clean white background, high-end commercial quality, sharp focus, 8k resolution',
    natural: '{product}, professional product photography, soft natural lighting, light wood surface, minimal props, wellness aesthetic, commercial quality',
    dramatic: '{product}, dramatic product photography, dark moody background, spotlight lighting, luxury feel, high contrast, commercial quality',
    minimal: '{product}, minimalist product photography, pure white background, soft shadows, clean aesthetic, e-commerce style, high resolution',
  },
  'lifestyle': {
    studio: '{product}, lifestyle photography, wellness spa setting, soft morning light, healthy lifestyle context, aspirational, commercial quality',
    natural: '{product}, lifestyle photography, natural home setting, window light, cozy wellness atmosphere, authentic feel, editorial style',
    dramatic: '{product}, lifestyle photography, dramatic natural lighting, golden hour, inspirational setting, magazine quality',
    minimal: '{product}, lifestyle flat lay, clean marble surface, minimal wellness props, instagram aesthetic, bright and airy',
  },
  'hero': {
    studio: '{product}, hero shot, dramatic studio lighting, floating effect, gradient background, premium brand feel, advertising quality',
    natural: '{product}, hero shot, nature backdrop, soft focus background, product in focus, wellness brand aesthetic, cinematic quality',
    dramatic: '{product}, hero shot, epic dramatic lighting, moody atmosphere, luxury product feel, high-end advertising',
    minimal: '{product}, hero shot, clean gradient background, centered composition, space for text overlay, modern brand aesthetic',
  },
  'overlay': {
    studio: '{product}, product cutout, transparent background style, clean edges, no shadow, suitable for compositing, high resolution PNG style',
    natural: '{product}, product with soft shadow, clean simple background, ready for video overlay, clear edges, professional quality',
    dramatic: '{product}, product with dramatic shadow, dark gradient fade at bottom, suitable for lower third overlay, premium look',
    minimal: '{product}, product floating, subtle shadow, maximum negative space, designed for text overlay, clean composition',
  },
};

const NEGATIVE_PROMPTS = {
  general: 'blurry, low quality, distorted, ugly, watermark, text, logo, people, hands, fingers',
  product: 'damaged product, dirty, dusty, fingerprints, reflections of photographer, messy background',
  wellness: 'unhealthy, junk food, artificial, clinical, cold, sterile',
};

class ProductImageService {
  private s3Client: S3Client;
  private bucket = process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';
  private region = process.env.REMOTION_AWS_REGION || 'us-east-2';
  private apiKey = process.env.PIAPI_API_KEY || '';
  private baseUrl = 'https://api.piapi.ai/api/v1';

  constructor() {
    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async generateProductImage(options: ProductImageOptions): Promise<GeneratedProductImage | null> {
    if (!this.isAvailable()) {
      console.warn('[ProductImage] PiAPI not configured');
      return null;
    }

    const startTime = Date.now();
    
    const prompt = this.buildPrompt(options);
    const negativePrompt = this.buildNegativePrompt(options);
    
    console.log(`[ProductImage] Generating ${options.imageType} for "${options.productName}"...`);
    console.log(`[ProductImage] Prompt: "${prompt.substring(0, 100)}..."`);

    try {
      const taskResponse = await this.createImageTask(prompt, negativePrompt, options);
      
      if (!taskResponse.success || !taskResponse.taskId) {
        console.error('[ProductImage] Failed to create task:', taskResponse.error);
        return null;
      }

      console.log(`[ProductImage] Task created: ${taskResponse.taskId}`);

      const result = await this.pollForCompletion(taskResponse.taskId);
      
      if (!result.success || !result.imageUrl) {
        console.error('[ProductImage] Generation failed:', result.error);
        return null;
      }

      const s3Url = await this.uploadToS3(result.imageUrl, options.imageType);
      
      const generationTime = Date.now() - startTime;
      const cost = 0.03;

      console.log(`[ProductImage] Complete! Time: ${(generationTime / 1000).toFixed(1)}s`);

      return {
        url: result.imageUrl,
        s3Url,
        type: options.imageType,
        style: options.style || 'studio',
        cost,
      };

    } catch (error: any) {
      console.error('[ProductImage] Generation failed:', error.message);
      return null;
    }
  }

  async generateProjectImages(
    products: Array<{
      name: string;
      description?: string;
      needsOverlay?: boolean;
      needsHero?: boolean;
      needsLifestyle?: boolean;
    }>,
    brandStyle: 'studio' | 'natural' | 'dramatic' | 'minimal' = 'natural'
  ): Promise<Map<string, GeneratedProductImage[]>> {
    const results = new Map<string, GeneratedProductImage[]>();

    console.log(`[ProductImage] Generating images for ${products.length} products...`);

    for (const product of products) {
      const images: GeneratedProductImage[] = [];

      if (product.needsOverlay !== false) {
        const overlay = await this.generateProductImage({
          productName: product.name,
          productDescription: product.description,
          imageType: 'overlay',
          style: 'minimal',
          aspectRatio: '1:1',
        });
        if (overlay) images.push(overlay);
      }

      if (product.needsHero) {
        const hero = await this.generateProductImage({
          productName: product.name,
          productDescription: product.description,
          imageType: 'hero',
          style: brandStyle,
          aspectRatio: '16:9',
        });
        if (hero) images.push(hero);
      }

      if (product.needsLifestyle) {
        const lifestyle = await this.generateProductImage({
          productName: product.name,
          productDescription: product.description,
          imageType: 'lifestyle',
          style: 'natural',
          aspectRatio: '16:9',
        });
        if (lifestyle) images.push(lifestyle);
      }

      results.set(product.name, images);
      
      console.log(`[ProductImage] Generated ${images.length} images for "${product.name}"`);
    }

    return results;
  }

  private buildPrompt(options: ProductImageOptions): string {
    const templates = PRODUCT_PROMPT_TEMPLATES[options.imageType];
    const style = options.style || 'studio';
    
    let template = templates[style as keyof typeof templates] || templates.studio;
    
    let productDesc = options.productName;
    if (options.productDescription) {
      productDesc += `, ${options.productDescription}`;
    }
    
    let prompt = template.replace('{product}', productDesc);
    
    if (options.background === 'custom' && options.customBackground) {
      prompt += `, ${options.customBackground} background`;
    } else if (options.background && options.background !== 'white') {
      const backgroundDescriptions: Record<string, string> = {
        gradient: 'soft gradient background transitioning from light to dark',
        natural: 'natural organic background with soft bokeh',
        transparent: 'clean edges suitable for transparent background',
      };
      prompt += `, ${backgroundDescriptions[options.background] || ''}`;
    }
    
    if (options.lighting) {
      const lightingDescriptions: Record<string, string> = {
        soft: 'soft diffused lighting',
        dramatic: 'dramatic directional lighting with deep shadows',
        natural: 'natural window lighting',
        studio: 'professional three-point studio lighting',
      };
      prompt += `, ${lightingDescriptions[options.lighting]}`;
    }
    
    prompt += ', wellness brand aesthetic, health and vitality';
    
    return prompt;
  }

  private buildNegativePrompt(options: ProductImageOptions): string {
    const parts = [
      NEGATIVE_PROMPTS.general,
      NEGATIVE_PROMPTS.product,
      NEGATIVE_PROMPTS.wellness,
    ];
    
    if (options.imageType === 'overlay') {
      parts.push('complex background, busy scene, multiple products');
    }
    
    return parts.join(', ');
  }

  private async createImageTask(
    prompt: string,
    negativePrompt: string,
    options: ProductImageOptions
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    try {
      const dimensions = this.getImageDimensions(options.aspectRatio || '1:1');
      
      const response = await fetch(`${this.baseUrl}/flux/txt2img`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'flux-pro',
          prompt: prompt,
          negative_prompt: negativePrompt,
          width: dimensions.width,
          height: dimensions.height,
          num_inference_steps: 30,
          guidance_scale: 7.5,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `API error: ${response.status} - ${errorText}` };
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

  private getImageDimensions(aspectRatio: string): { width: number; height: number } {
    const dimensions: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1344, height: 768 },
      '9:16': { width: 768, height: 1344 },
      '4:3': { width: 1152, height: 896 },
    };
    return dimensions[aspectRatio] || dimensions['1:1'];
  }

  private async pollForCompletion(
    taskId: string
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    const maxAttempts = 60;
    const pollInterval = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.sleep(pollInterval);

      try {
        const response = await fetch(`${this.baseUrl}/task/${taskId}`, {
          headers: { 'X-API-Key': this.apiKey },
        });

        if (!response.ok) continue;

        const data = await response.json();
        const status = data.data?.status || data.status;

        if (status === 'completed' || status === 'success' || status === 'SUCCESS') {
          const imageUrl = this.extractImageUrl(data);
          
          if (imageUrl) {
            return { success: true, imageUrl };
          }
          return { success: false, error: 'No image URL in response' };
        }

        if (status === 'failed' || status === 'error') {
          return { success: false, error: data.data?.error || 'Generation failed' };
        }

      } catch (error) {
        // Continue polling
      }
    }

    return { success: false, error: 'Generation timed out' };
  }

  private extractImageUrl(data: any): string | null {
    const possiblePaths = [
      data.data?.output?.image_url,
      data.data?.output?.image,
      data.data?.output?.[0]?.url,
      data.data?.image_url,
      data.output?.image_url,
      data.image_url,
    ];

    for (const path of possiblePaths) {
      if (path && typeof path === 'string' && path.startsWith('http')) {
        return path;
      }
    }

    if (Array.isArray(data.data?.output)) {
      const image = data.data.output.find((o: any) => o.image_url || o.url);
      return image?.image_url || image?.url || null;
    }

    return null;
  }

  private async uploadToS3(imageUrl: string, type: string): Promise<string> {
    try {
      const response = await fetch(imageUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      
      const key = `product-images/${type}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;

      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
        ACL: 'public-read',
      }));

      return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    } catch (error: any) {
      console.warn('[ProductImage] S3 upload failed:', error.message);
      return imageUrl;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const productImageService = new ProductImageService();
