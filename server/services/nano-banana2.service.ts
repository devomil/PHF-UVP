const PIAPI_BASE = 'https://api.piapi.ai/api/v1';

export type NB2AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '4:1' | '8:1';
export type NB2Format = 'jpeg' | 'png';

export interface NB2GenerateOptions {
  prompt: string;
  aspectRatio?: NB2AspectRatio;
  format?: NB2Format;
  numImages?: number;
  referenceImages?: string[];
  /**
   * Phase 21B (Task #107): Search-grounding flag forwarded as
   * `input.enable_web_search` on PiAPI's `nano-banana-2` task. When true the
   * model can pull live web context (real-world places, branded environments,
   * recent events) before generating, which materially improves factual
   * accuracy for grounded scenes.
   *
   * Verified against piapi.ai/docs/gemini-api/nano-banana-2 (Mar 2026):
   *   - Type: boolean. Lives in `input`. Defaults to `true` server-side, so
   *     omitting the field is equivalent to opting in.
   *   - Pricing: rolled into the per-image rate (no separate web-search
   *     surcharge documented). PiAPI bills NB2 per image by resolution —
   *     1K $0.06, 2K $0.08, 4K $0.12. Same SLA as a plain NB2 task; the
   *     existing 60×3s poll loop comfortably covers the typical 10–30s
   *     completion window.
   *
   * Caller pattern (see `scene-image.service.ts`):
   *   enableWebSearch: shouldEnableWebSearch(visualStyle, sceneType)
   */
  enableWebSearch?: boolean;
}

export interface NB2GenerateResult {
  imageUrl: string;
  taskId: string;
}

export class NanoBanana2Service {
  private getApiKey(): string {
    const key = process.env.PIAPI_API_KEY;
    if (!key) throw new Error('PIAPI_API_KEY not configured');
    return key;
  }

  async generateImage(options: NB2GenerateOptions): Promise<NB2GenerateResult> {
    const {
      prompt,
      aspectRatio = '16:9',
      format = 'jpeg',
      numImages = 1,
      referenceImages = [],
      enableWebSearch,
    } = options;

    if (referenceImages.length > 14) {
      throw new Error(`Nano Banana 2 supports max 14 reference images (got ${referenceImages.length})`);
    }

    const isI2I = referenceImages.length > 0;
    console.log(`[NB2] Generating ${isI2I ? 'I2I' : 'T2I'} image | ${aspectRatio} | ${numImages} image(s)${enableWebSearch === false ? ' | web-search:off' : enableWebSearch === true ? ' | web-search:on' : ''}`);
    if (isI2I) {
      console.log(`[NB2] ${referenceImages.length} reference image(s) attached`);
    }
    console.log(`[NB2] Prompt: ${prompt.substring(0, 100)}`);

    const inputPayload: Record<string, any> = {
      prompt,
      aspect_ratio: aspectRatio,
      output_format: format,
    };

    if (numImages > 1) {
      inputPayload.num_images = Math.min(numImages, 4);
    }

    if (referenceImages.length > 0) {
      inputPayload.reference_images = referenceImages;
    }

    // Only forward when explicitly set; PiAPI defaults to true server-side.
    if (typeof enableWebSearch === 'boolean') {
      inputPayload.enable_web_search = enableWebSearch;
    }

    const apiKey = this.getApiKey();

    const response = await fetch(`${PIAPI_BASE}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        model: 'gemini',
        task_type: 'nano-banana-2',
        input: inputPayload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Nano Banana 2 API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const taskId = data?.data?.task_id || data?.task_id;

    if (!taskId) {
      throw new Error(`Nano Banana 2: No task_id in response: ${JSON.stringify(data)}`);
    }

    console.log(`[NB2] Task created: ${taskId}`);
    const imageUrl = await this.pollUntilComplete(taskId);

    return { imageUrl, taskId };
  }

  async generateCandidates(
    options: NB2GenerateOptions,
    count: number = 3
  ): Promise<NB2GenerateResult[]> {
    if (count <= 4) {
      console.log(`[NB2] Generating ${count} candidates via num_images (single request)`);
      const result = await this.generateMultiple({ ...options, numImages: count });
      return result;
    }

    console.log(`[NB2] Generating ${count} candidates (batched requests)`);
    const batches: number[] = [];
    let remaining = count;
    while (remaining > 0) {
      const batch = Math.min(remaining, 4);
      batches.push(batch);
      remaining -= batch;
    }

    const batchResults = await Promise.all(
      batches.map(batchSize =>
        this.generateMultiple({ ...options, numImages: batchSize }).catch(err => {
          console.error(`[NB2] Batch failed:`, err.message);
          return [] as NB2GenerateResult[];
        })
      )
    );

    const results = batchResults.flat();
    if (results.length === 0) {
      throw new Error('All Nano Banana 2 candidate generations failed');
    }

    console.log(`[NB2] ${results.length}/${count} candidates succeeded`);
    return results;
  }

  private async generateMultiple(options: NB2GenerateOptions & { numImages: number }): Promise<NB2GenerateResult[]> {
    const {
      prompt,
      aspectRatio = '16:9',
      format = 'jpeg',
      numImages,
      referenceImages = [],
      enableWebSearch,
    } = options;

    const inputPayload: Record<string, any> = {
      prompt,
      aspect_ratio: aspectRatio,
      output_format: format,
      num_images: Math.min(numImages, 4),
    };

    if (referenceImages.length > 0) {
      inputPayload.reference_images = referenceImages;
    }

    // See `NB2GenerateOptions.enableWebSearch` for pricing/SLA verification.
    if (typeof enableWebSearch === 'boolean') {
      inputPayload.enable_web_search = enableWebSearch;
    }

    const apiKey = this.getApiKey();

    const response = await fetch(`${PIAPI_BASE}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        model: 'gemini',
        task_type: 'nano-banana-2',
        input: inputPayload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Nano Banana 2 API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const taskId = data?.data?.task_id || data?.task_id;

    if (!taskId) {
      throw new Error(`Nano Banana 2: No task_id in response`);
    }

    console.log(`[NB2] Multi-image task created: ${taskId} (${numImages} images)`);
    const imageUrls = await this.pollUntilCompleteMulti(taskId);

    return imageUrls.map(url => ({ imageUrl: url, taskId }));
  }

  async editImage(options: {
    sourceImageUrl: string;
    editInstruction: string;
    aspectRatio?: NB2AspectRatio;
  }): Promise<NB2GenerateResult> {
    console.log(`[NB2] Editing image: ${options.editInstruction.substring(0, 80)}`);

    return this.generateImage({
      prompt: options.editInstruction,
      aspectRatio: options.aspectRatio,
      referenceImages: [options.sourceImageUrl],
    });
  }

  private async pollUntilComplete(taskId: string): Promise<string> {
    const urls = await this.pollUntilCompleteMulti(taskId);
    return urls[0];
  }

  private async pollUntilCompleteMulti(taskId: string): Promise<string[]> {
    const maxAttempts = 60;
    const interval = 3000;
    const apiKey = this.getApiKey();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, interval));

      const response = await fetch(`${PIAPI_BASE}/task/${taskId}`, {
        headers: { 'X-API-Key': apiKey },
      });

      if (!response.ok) {
        console.warn(`[NB2] Poll error attempt ${attempt + 1}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const status = data?.data?.status || data?.status;

      if (status === 'completed' || status === 'success') {
        const output = data?.data?.output || data?.output;

        const imageUrls: string[] = [];
        if (output?.image_urls && Array.isArray(output.image_urls)) {
          imageUrls.push(...output.image_urls.filter((u: any) => typeof u === 'string'));
        } else if (output?.image_url) {
          imageUrls.push(output.image_url);
        } else if (output?.url) {
          imageUrls.push(output.url);
        } else if (Array.isArray(output?.images)) {
          imageUrls.push(...output.images.filter((u: any) => typeof u === 'string'));
        }

        if (imageUrls.length === 0) {
          throw new Error(`NB2 completed but no image URL found: ${JSON.stringify(output)}`);
        }

        console.log(`[NB2] Complete: ${imageUrls.length} image(s) returned`);
        return imageUrls;
      }

      if (status === 'failed' || status === 'error') {
        const msg = data?.data?.error?.message || data?.data?.logs?.join(', ') || 'Unknown error';
        throw new Error(`Nano Banana 2 task failed: ${msg}`);
      }

      if (attempt % 5 === 0 && attempt > 0) {
        console.log(`[NB2] Polling attempt ${attempt + 1}/${maxAttempts}, status: ${status}`);
      }
    }

    throw new Error(`Nano Banana 2 timed out after ${(maxAttempts * interval) / 60000}min`);
  }
}

export const nanoBanana2Service = new NanoBanana2Service();
