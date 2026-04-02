const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';

const RUNWAY_MODEL_MAP: Record<string, string> = {
  'runway': 'gen3a_turbo',
  'runway-gen4': 'gen4.5',
  'runway-gen4-aleph': 'gen4.5',
  'runway-4.5': 'gen4.5',
  'runway-act-two': 'act_two',
};

const RUNWAY_COST_PER_SECOND: Record<string, number> = {
  'runway': 0.05,
  'runway-gen4': 0.05,
  'runway-gen4-aleph': 0.06,
  'runway-4.5': 0.07,
  'runway-act-two': 0.06,
};

interface RunwayGenerationResult {
  success: boolean;
  videoUrl?: string;
  s3Url?: string;
  taskId?: string;
  duration?: number;
  cost?: number;
  error?: string;
  generationTimeMs?: number;
  provider?: string;
}

class RunwayVideoService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.RUNWAY_API_KEY || '';
  }

  isAvailable(): boolean {
    return !!process.env.RUNWAY_API_KEY;
  }

  getSupportedModels(): string[] {
    return Object.keys(RUNWAY_MODEL_MAP);
  }

  isRunwayModel(providerKey: string): boolean {
    return providerKey in RUNWAY_MODEL_MAP;
  }

  private resolveApiModel(providerKey: string): string {
    return RUNWAY_MODEL_MAP[providerKey] || 'gen4_turbo';
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    };
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
    const providerKey = options.model || 'runway';
    const apiModel = this.resolveApiModel(providerKey);

    try {
      const clampedDuration = Math.round(Math.min(options.duration || 5, 10));
      console.log(`[Runway] Starting generation with provider: ${providerKey}, API model: ${apiModel}`);
      console.log(`[Runway] Prompt: ${options.prompt.substring(0, 100)}...`);
      console.log(`[Runway] Duration: ${clampedDuration}s (requested: ${options.duration || 5}s, max: 10s)`);

      const ratio = options.aspectRatio === '9:16' ? '720:1280' : '1280:720';

      let endpoint: string;
      let body: any;

      const truncatedPrompt = options.prompt.length > 1000 ? options.prompt.substring(0, 997) + '...' : options.prompt;
      if (truncatedPrompt.length < options.prompt.length) {
        console.log(`[Runway] Prompt truncated from ${options.prompt.length} to ${truncatedPrompt.length} chars (Runway limit: 1000)`);
      }

      if (options.imageUrl) {
        endpoint = `${RUNWAY_API_BASE}/image_to_video`;
        body = {
          model: apiModel,
          promptImage: options.imageUrl,
          promptText: truncatedPrompt,
          duration: clampedDuration,
          ratio,
        };
      } else {
        endpoint = `${RUNWAY_API_BASE}/text_to_video`;
        body = {
          model: apiModel,
          promptText: truncatedPrompt,
          duration: clampedDuration,
          ratio,
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
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
      const costPerSec = RUNWAY_COST_PER_SECOND[providerKey] || 0.05;

      return {
        ...result,
        taskId,
        duration: clampedDuration,
        cost: clampedDuration * costPerSec,
        generationTimeMs: Date.now() - startTime,
        provider: providerKey,
      };
    } catch (error: any) {
      console.error(`[Runway] Generation failed:`, error.message);
      return { success: false, error: error.message, generationTimeMs: Date.now() - startTime };
    }
  }

  async generateVideoToVideo(options: {
    videoUrl: string;
    prompt: string;
    model?: string;
    duration?: number;
    aspectRatio?: string;
  }): Promise<RunwayGenerationResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'RUNWAY_API_KEY not configured' };
    }

    this.apiKey = process.env.RUNWAY_API_KEY!;
    const startTime = Date.now();
    const providerKey = options.model || 'runway-gen4-aleph';
    const apiModel = this.resolveApiModel(providerKey);

    try {
      console.log(`[Runway:V2V] Starting video-to-video with model: ${apiModel}`);
      console.log(`[Runway:V2V] Source video: ${options.videoUrl.substring(0, 80)}...`);
      console.log(`[Runway:V2V] Prompt: ${options.prompt.substring(0, 100)}...`);

      const body = {
        videoUri: options.videoUrl,
        promptText: options.prompt,
        model: apiModel,
      };

      const response = await fetch(`${RUNWAY_API_BASE}/video_to_video`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Runway:V2V] API error: ${response.status} - ${errorText}`);
        return { success: false, error: `Runway V2V API error: ${response.status} - ${errorText}`, generationTimeMs: Date.now() - startTime };
      }

      const data = await response.json();
      const taskId = data.id;

      if (!taskId) {
        return { success: false, error: 'No task ID in Runway V2V response', generationTimeMs: Date.now() - startTime };
      }

      console.log(`[Runway:V2V] Task created: ${taskId}`);

      const result = await this.pollForCompletion(taskId);
      const costPerSec = RUNWAY_COST_PER_SECOND[providerKey] || 0.06;
      const dur = options.duration || 5;

      return {
        ...result,
        taskId,
        duration: dur,
        cost: dur * costPerSec,
        generationTimeMs: Date.now() - startTime,
        provider: providerKey,
      };
    } catch (error: any) {
      console.error(`[Runway:V2V] Generation failed:`, error.message);
      return { success: false, error: error.message, generationTimeMs: Date.now() - startTime };
    }
  }

  async generateCharacterPerformance(options: {
    characterImageUrl: string;
    referenceVideoUrl: string;
    seed?: number;
    bodyControl?: boolean;
  }): Promise<RunwayGenerationResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'RUNWAY_API_KEY not configured' };
    }

    this.apiKey = process.env.RUNWAY_API_KEY!;
    const startTime = Date.now();

    try {
      console.log(`[Runway:ActTwo] Starting character performance`);
      console.log(`[Runway:ActTwo] Character image: ${options.characterImageUrl.substring(0, 80)}...`);
      console.log(`[Runway:ActTwo] Reference video: ${options.referenceVideoUrl.substring(0, 80)}...`);

      const body = {
        model: 'act_two',
        character: {
          type: 'image',
          uri: options.characterImageUrl,
        },
        reference: {
          type: 'video',
          uri: options.referenceVideoUrl,
        },
        seed: options.seed || Math.floor(Math.random() * 1000000000),
        bodyControl: options.bodyControl ?? false,
      };

      const response = await fetch(`${RUNWAY_API_BASE}/character_performance`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Runway:ActTwo] API error: ${response.status} - ${errorText}`);
        return { success: false, error: `Runway Act Two API error: ${response.status} - ${errorText}`, generationTimeMs: Date.now() - startTime };
      }

      const data = await response.json();
      const taskId = data.id;

      if (!taskId) {
        return { success: false, error: 'No task ID in Runway Act Two response', generationTimeMs: Date.now() - startTime };
      }

      console.log(`[Runway:ActTwo] Task created: ${taskId}`);

      const result = await this.pollForCompletion(taskId);
      const costPerSec = RUNWAY_COST_PER_SECOND['runway-act-two'] || 0.06;

      return {
        ...result,
        taskId,
        duration: 5,
        cost: 5 * costPerSec,
        generationTimeMs: Date.now() - startTime,
        provider: 'runway-act-two',
      };
    } catch (error: any) {
      console.error(`[Runway:ActTwo] Generation failed:`, error.message);
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
