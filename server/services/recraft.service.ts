import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const RECRAFT_API_BASE = 'https://external.api.recraft.ai/v1';

export type RecraftModel =
  | 'recraftv4'
  | 'recraftv4_pro'
  | 'recraftv4_vector'
  | 'recraftv3'
  | 'recraftv3_vector';

export type RecraftAspectRatio =
  | '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3';

export interface TextLayoutItem {
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  font_size?: number;
}

export interface RecraftGenerateOptions {
  prompt: string;
  model?: RecraftModel;
  aspectRatio?: RecraftAspectRatio;
  n?: number;
  style?: string;
  styleId?: string;
  textLayout?: TextLayoutItem[];
  responseFormat?: 'url' | 'b64_json';
}

export interface RecraftResult {
  imageUrl: string;
  s3Key: string;
  model: RecraftModel;
}

export class RecraftService {
  private apiKey: string;
  private s3Client: S3Client | null = null;
  private bucket: string;

  constructor() {
    this.apiKey = process.env.RECRAFT_API_KEY || '';
    this.bucket = process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';

    if (!this.apiKey) {
      console.warn('[Recraft] RECRAFT_API_KEY not set — service disabled');
    }

    const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
    if (accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: process.env.REMOTION_AWS_REGION || 'us-east-2',
        credentials: { accessKeyId, secretAccessKey },
      });
      console.log('[Recraft] S3 client configured for image caching');
    } else {
      console.warn('[Recraft] AWS credentials not configured — S3 caching disabled');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async generateImage(
    options: RecraftGenerateOptions,
    s3KeyPrefix: string
  ): Promise<RecraftResult> {
    if (!this.apiKey) {
      throw new Error('Recraft API key not configured');
    }

    const {
      model = 'recraftv4',
      aspectRatio = '16:9',
      n = 1,
      responseFormat = 'url',
    } = options;

    // Recraft hard-caps prompts at 1000 chars. Our enhanced cinematic prompts
    // routinely exceed this, so clamp at a safe 980 to leave headroom for any
    // trailing style suffixes. Truncate at the last space to avoid mid-word cuts.
    const MAX_RECRAFT_PROMPT = 980;
    let prompt = options.prompt;
    if (prompt.length > MAX_RECRAFT_PROMPT) {
      const hardCut = prompt.slice(0, MAX_RECRAFT_PROMPT);
      const lastSpace = hardCut.lastIndexOf(' ');
      const safeCut = lastSpace > MAX_RECRAFT_PROMPT - 80 ? hardCut.slice(0, lastSpace) : hardCut;
      console.warn(`[Recraft] Prompt ${prompt.length} chars > ${MAX_RECRAFT_PROMPT} limit — truncating to ${safeCut.length}`);
      prompt = safeCut;
    }

    const isV4 = model.startsWith('recraftv4');
    if (isV4 && options.style) {
      console.warn(`[Recraft] style parameter ignored for ${model} — V4 has no styles`);
    }
    if (isV4 && options.textLayout) {
      console.warn(`[Recraft] text_layout ignored for ${model} — V3 only feature`);
    }

    const body: Record<string, any> = {
      prompt,
      model,
      size: aspectRatio,
      n,
      response_format: responseFormat,
    };

    if (!isV4) {
      if (options.style) body.style = options.style;
      if (options.styleId) body.style_id = options.styleId;
      if (options.textLayout?.length) body.text_layout = options.textLayout;
    }

    console.log(`[Recraft] Generating with ${model} | ${aspectRatio} | ${prompt.substring(0, 80)}`);
    if (options.textLayout?.length) {
      console.log(`[Recraft] text_layout: ${options.textLayout.length} text element(s)`);
    }

    const startTime = Date.now();
    const response = await fetch(`${RECRAFT_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Recraft API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const imageData = data?.data?.[0];
    if (!imageData) {
      throw new Error(`Recraft: No image in response: ${JSON.stringify(data).substring(0, 200)}`);
    }

    const recraftUrl: string = imageData.url;
    if (!recraftUrl) {
      throw new Error(`Recraft: No URL in response data`);
    }

    console.log(`[Recraft] Generated in ${elapsed}s, copying to S3...`);

    const s3Key = `${s3KeyPrefix}/recraft-${Date.now()}.png`;
    const permanentUrl = await this.copyToS3(recraftUrl, s3Key);

    console.log(`[Recraft] Saved to S3: ${permanentUrl.substring(0, 80)}`);
    return { imageUrl: permanentUrl, s3Key, model };
  }

  async generateWithBrandedText(params: {
    sceneDescription: string;
    textElements: Array<{
      text: string;
      x: number;
      y: number;
      width?: number;
    }>;
    style?: string;
    aspectRatio?: RecraftAspectRatio;
    s3KeyPrefix: string;
  }): Promise<RecraftResult> {
    const {
      sceneDescription,
      textElements,
      style = 'Photorealism',
      aspectRatio = '16:9',
      s3KeyPrefix,
    } = params;

    const textDescriptions = textElements.map(t => `"${t.text}"`).join(', ');
    const prompt = `${sceneDescription}. The following text appears in the scene: ${textDescriptions}.`;

    const textLayout: TextLayoutItem[] = textElements.map(t => ({
      text: t.text,
      x: t.x,
      y: t.y,
      width: t.width ?? 0.5,
    }));

    console.log(`[Recraft] Branded text generation: ${textElements.length} text element(s)`);
    textElements.forEach(t => console.log(`  → "${t.text}" at (${t.x}, ${t.y})`));

    return this.generateImage({
      prompt,
      model: 'recraftv3',
      style,
      aspectRatio,
      textLayout,
    }, s3KeyPrefix);
  }

  async generatePremiumImage(
    options: Omit<RecraftGenerateOptions, 'model'>,
    s3KeyPrefix: string
  ): Promise<RecraftResult> {
    return this.generateImage({ ...options, model: 'recraftv4_pro' }, s3KeyPrefix);
  }

  private async copyToS3(sourceUrl: string, s3Key: string): Promise<string> {
    if (!this.s3Client) {
      throw new Error('Recraft S3 client not configured — cannot store images permanently. Recraft URLs expire in ~24h. Set REMOTION_AWS_ACCESS_KEY_ID and REMOTION_AWS_SECRET_ACCESS_KEY.');
    }

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to download Recraft image for S3 copy: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      Body: Buffer.from(buffer),
      ContentType: contentType,
      ACL: 'public-read',
    }));

    return `https://${this.bucket}.s3.amazonaws.com/${s3Key}`;
  }
}

export const recraftService = new RecraftService();
