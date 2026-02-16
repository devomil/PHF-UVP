const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';

interface RunwayGenerationResult {
  success: boolean;
  videoUrl?: string;
  s3Url?: string;
  taskId?: string;
  duration?: number;
  cost?: number;
  error?: string;
  generationTimeMs?: number;
}

class RunwayVideoService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.RUNWAY_API_KEY || '';
  }

  isAvailable(): boolean {
    return !!process.env.RUNWAY_API_KEY;
  }

  async generateVideo(options: {
    prompt: string;
    duration?: number;
    aspectRatio?: string;
    imageUrl?: string;
    model?: string;
    negativePrompt?: string;
    i2vSettings?: {
      imageControlStrength?: number;
      animationStyle?: string;
      motionStrength?: number;
    };
  }): Promise<RunwayGenerationResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'RUNWAY_API_KEY not configured' };
    }

    this.apiKey = process.env.RUNWAY_API_KEY!;
    const startTime = Date.now();
    const model = options.model || 'gen4_turbo';

    try {
      console.log(`[Runway] Starting generation with model: ${model}`);
      console.log(`[Runway] Prompt: ${options.prompt.substring(0, 100)}...`);

      const body: any = {
        model,
        promptText: options.prompt,
        duration: options.duration || 5,
        ratio: options.aspectRatio === '9:16' ? '768:1280' : options.aspectRatio === '1:1' ? '1024:1024' : '1280:768',
      };

      if (options.imageUrl) {
        body.promptImage = options.imageUrl;
      }

      const response = await fetch(`${RUNWAY_API_BASE}/image_to_video`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Runway-Version': '2024-11-06',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Runway] API error: ${response.status} - ${errorText}`);
        return { success: false, error: `Runway API error: ${response.status}`, generationTimeMs: Date.now() - startTime };
      }

      const data = await response.json();
      const taskId = data.id;

      if (!taskId) {
        return { success: false, error: 'No task ID in Runway response', generationTimeMs: Date.now() - startTime };
      }

      console.log(`[Runway] Task created: ${taskId}`);

      const result = await this.pollForCompletion(taskId);

      return {
        ...result,
        taskId,
        duration: options.duration || 5,
        cost: (options.duration || 5) * 0.05,
        generationTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error(`[Runway] Generation failed:`, error.message);
      return { success: false, error: error.message, generationTimeMs: Date.now() - startTime };
    }
  }

  private async pollForCompletion(taskId: string): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
    const maxAttempts = 120;
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const response = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
          headers: { 'Authorization': `Bearer ${this.apiKey}`, 'X-Runway-Version': '2024-11-06' },
        });

        if (!response.ok) continue;

        const data = await response.json();
        console.log(`[Runway] Task ${taskId} status: ${data.status} (attempt ${attempt + 1})`);

        if (data.status === 'SUCCEEDED') {
          const videoUrl = data.output?.[0] || data.artifacts?.[0]?.url;
          if (videoUrl) return { success: true, videoUrl };
          return { success: false, error: 'No video URL in completed response' };
        }

        if (data.status === 'FAILED') {
          return { success: false, error: data.failure || 'Generation failed' };
        }
      } catch (error: any) {
        console.warn(`[Runway] Poll error:`, error.message);
      }
    }

    return { success: false, error: 'Timed out after 10 minutes' };
  }
}

export const runwayVideoService = new RunwayVideoService();
