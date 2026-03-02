interface QubicResult {
  success: boolean;
  url?: string;
  error?: string;
  provider?: string;
  generationTimeMs?: number;
  width?: number;
  height?: number;
}

class QubicToolkitService {
  private baseUrl = 'https://api.piapi.ai/api/v1';

  private get apiKey(): string {
    return process.env.PIAPI_API_KEY || '';
  }

  isAvailable(): boolean {
    return !!process.env.PIAPI_API_KEY;
  }

  async upscaleImage(options: {
    imageUrl: string;
    scaleFactor?: number;
    prompt?: string;
  }): Promise<QubicResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'PIAPI_API_KEY not configured' };
    }

    const startTime = Date.now();
    console.log(`[QubicToolkit:Upscale] Starting image upscale, factor: ${options.scaleFactor || 2}`);

    try {
      const response = await fetch(`${this.baseUrl}/task`, {
        method: 'POST',
        headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Qubico/image-toolkit',
          task_type: 'upscale',
          input: {
            image: options.imageUrl,
            scale: options.scaleFactor || 2,
            face_enhance: true,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[QubicToolkit:Upscale] API error: ${response.status} - ${errorText}`);
        return { success: false, error: `Upscale API error: ${response.status}`, generationTimeMs: Date.now() - startTime };
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;

      if (!taskId) {
        return { success: false, error: 'No task ID returned', generationTimeMs: Date.now() - startTime };
      }

      console.log(`[QubicToolkit:Upscale] Task created: ${taskId}`);
      const result = await this.pollForCompletion(taskId);

      return {
        ...result,
        provider: 'qubic-image-toolkit',
        generationTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error(`[QubicToolkit:Upscale] Failed:`, error.message);
      return { success: false, error: error.message, generationTimeMs: Date.now() - startTime };
    }
  }

  async removeImageBackground(options: {
    imageUrl: string;
  }): Promise<QubicResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'PIAPI_API_KEY not configured' };
    }

    const startTime = Date.now();
    console.log(`[QubicToolkit:BgRemove] Starting image background removal`);

    try {
      const response = await fetch(`${this.baseUrl}/task`, {
        method: 'POST',
        headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Qubico/image-toolkit',
          task_type: 'background-remove',
          input: {
            image: options.imageUrl,
            rmbg_model: 'RMBG-2.0',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[QubicToolkit:BgRemove] API error: ${response.status} - ${errorText}`);
        return { success: false, error: `Background removal API error: ${response.status}`, generationTimeMs: Date.now() - startTime };
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;

      if (!taskId) {
        return { success: false, error: 'No task ID returned', generationTimeMs: Date.now() - startTime };
      }

      console.log(`[QubicToolkit:BgRemove] Task created: ${taskId}`);
      const result = await this.pollForCompletion(taskId);

      return {
        ...result,
        provider: 'qubic-image-toolkit',
        generationTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error(`[QubicToolkit:BgRemove] Failed:`, error.message);
      return { success: false, error: error.message, generationTimeMs: Date.now() - startTime };
    }
  }

  async upscaleVideo(options: {
    videoUrl: string;
    scaleFactor?: number;
  }): Promise<QubicResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'PIAPI_API_KEY not configured' };
    }

    const startTime = Date.now();
    console.log(`[QubicToolkit:VideoUpscale] Starting video upscale, factor: ${options.scaleFactor || 2}`);

    try {
      const response = await fetch(`${this.baseUrl}/task`, {
        method: 'POST',
        headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Qubico/video-toolkit',
          task_type: 'upscale',
          input: {
            video: options.videoUrl,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[QubicToolkit:VideoUpscale] API error: ${response.status} - ${errorText}`);
        return { success: false, error: `Video upscale API error: ${response.status}`, generationTimeMs: Date.now() - startTime };
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;

      if (!taskId) {
        return { success: false, error: 'No task ID returned', generationTimeMs: Date.now() - startTime };
      }

      console.log(`[QubicToolkit:VideoUpscale] Task created: ${taskId}`);
      const result = await this.pollForCompletion(taskId);

      return {
        ...result,
        provider: 'qubic-image-toolkit',
        generationTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error(`[QubicToolkit:VideoUpscale] Failed:`, error.message);
      return { success: false, error: error.message, generationTimeMs: Date.now() - startTime };
    }
  }

  async removeVideoBackground(options: {
    videoUrl: string;
  }): Promise<QubicResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'PIAPI_API_KEY not configured' };
    }

    const startTime = Date.now();
    console.log(`[QubicToolkit:VideoBgRemove] Starting video background removal`);

    try {
      const response = await fetch(`${this.baseUrl}/task`, {
        method: 'POST',
        headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Qubico/video-toolkit',
          task_type: 'background-remove',
          input: {
            video: options.videoUrl,
            invert_output: false,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[QubicToolkit:VideoBgRemove] API error: ${response.status} - ${errorText}`);
        return { success: false, error: `Video background removal API error: ${response.status}`, generationTimeMs: Date.now() - startTime };
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;

      if (!taskId) {
        return { success: false, error: 'No task ID returned', generationTimeMs: Date.now() - startTime };
      }

      console.log(`[QubicToolkit:VideoBgRemove] Task created: ${taskId}`);
      const result = await this.pollForCompletion(taskId);

      return {
        ...result,
        provider: 'qubic-image-toolkit',
        generationTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error(`[QubicToolkit:VideoBgRemove] Failed:`, error.message);
      return { success: false, error: error.message, generationTimeMs: Date.now() - startTime };
    }
  }

  private async pollForCompletion(taskId: string): Promise<QubicResult> {
    const maxAttempts = 120;
    const pollInterval = 3000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const response = await fetch(`${this.baseUrl}/task/${taskId}`, {
          headers: { 'X-API-Key': this.apiKey },
        });

        if (!response.ok) continue;

        const data = await response.json();
        const status = data.data?.status || data.status;

        console.log(`[QubicToolkit] Task ${taskId} status: ${status} (attempt ${attempt + 1})`);

        if (status === 'completed' || status === 'success') {
          const output = data.data?.output;
          let url: string | undefined;

          if (typeof output === 'string') {
            url = output;
          } else if (output?.image_url) {
            url = output.image_url;
          } else if (output?.video_url) {
            url = output.video_url;
          } else if (Array.isArray(output) && output.length > 0) {
            url = typeof output[0] === 'string' ? output[0] : output[0]?.url || output[0]?.image_url || output[0]?.video_url;
          }

          if (url) {
            return { success: true, url };
          }
          return { success: false, error: 'No output URL in completed response' };
        }

        if (status === 'failed' || status === 'error') {
          const errMsg = data.data?.error || data.error || 'Task failed';
          return { success: false, error: errMsg };
        }
      } catch (error: any) {
        console.warn(`[QubicToolkit] Poll error:`, error.message);
      }
    }

    return { success: false, error: 'Timed out after 6 minutes' };
  }
}

export const qubicToolkitService = new QubicToolkitService();
