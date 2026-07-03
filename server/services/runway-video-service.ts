const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';

// Model-aware API version — bump per model if Runway docs require a newer date.
// Aleph 2.0 and Agent 2.0 default to the same version as Gen-4;
// update here without a code re-deploy by setting the correct date string.
const RUNWAY_MODEL_API_VERSION: Record<string, string> = {
  'gen3a_turbo':   '2024-11-06',
  'gen4.5':        '2024-11-06',
  'act_two':       '2024-11-06',
  'happyhorse_1_0':'2024-11-06',
};
const RUNWAY_DEFAULT_API_VERSION = '2024-11-06';

const RUNWAY_MODEL_MAP: Record<string, string> = {
  'runway':              'gen3a_turbo',
  'runway-gen4':         'gen4.5',
  'runway-gen4-aleph':   'gen4.5',
  'runway-4.5':          'gen4.5',
  'runway-act-two':      'act_two',
  // Aleph 2.0 uses Gen-4 engine (gen4.5) for T2V
  'runway-aleph-2':      'gen4.5',
  // Agent 2.0 not yet available on Runway text_to_video endpoint; placeholder uses Gen-4
  'runway-agent-2':      'gen4.5',
  // Happy Horse 1.0 — correct API model ID confirmed from Runway API validation response
  'runway-happy-horse-1':'happyhorse_1_0',
};

// The /video_to_video endpoint uses a different model ID namespace than /text_to_video.
// These IDs are confirmed from the Runway V2V API validation error response.
const RUNWAY_V2V_MODEL_MAP: Record<string, string> = {
  'runway-gen4-aleph':   'gen4_aleph',
  'runway-aleph-2':      'aleph2',
  'runway-agent-2':      'aleph2_alpha',
};

const RUNWAY_COST_PER_SECOND: Record<string, number> = {
  'runway': 0.05,
  'runway-gen4': 0.05,
  'runway-gen4-aleph': 0.06,
  'runway-4.5': 0.07,
  'runway-act-two': 0.06,
  'runway-aleph-2': 0.09,
  'runway-agent-2': 0.1,
  'runway-happy-horse-1': 0.08,
};

// ── Hard cost safeguard ──────────────────────────────────────────────
// Policy: Runway is ONLY for explicit Aleph 2 usage; every other model
// must route through PiAPI. `assertRunwayAllowed()` (below) is the single
// choke point that enforces this — it runs BEFORE any task-creating request
// (a Runway task is what gets billed), so no auto-fallback, test route,
// retry, or future code path can charge Runway for a disallowed model.
//   RUNWAY_DISABLED=1|true|yes   emergency lock — blocks ALL Runway calls
//                                (including Aleph); flip from secrets, no deploy.
//   RUNWAY_ALLOWED_MODELS="a,b"  override the allow-list (defaults to Aleph).
const DEFAULT_RUNWAY_ALLOWED_MODELS = ['runway-gen4-aleph', 'runway-aleph-2'];

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

  private isTruthyEnv(v?: string): boolean {
    return ['1', 'true', 'yes', 'on'].includes((v || '').trim().toLowerCase());
  }

  private getAllowedRunwayModels(): Set<string> {
    const raw = process.env.RUNWAY_ALLOWED_MODELS;
    if (raw && raw.trim()) {
      return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
    }
    return new Set(DEFAULT_RUNWAY_ALLOWED_MODELS);
  }

  /**
   * Cost safeguard. Returns an error string if this Runway call must be
   * blocked, or null if allowed. Callers MUST invoke this before creating a
   * task so a disallowed model never incurs a charge.
   */
  private assertRunwayAllowed(providerKey: string): string | null {
    if (this.isTruthyEnv(process.env.RUNWAY_DISABLED)) {
      console.warn(`[Runway] ⛔ BLOCKED "${providerKey}" — RUNWAY_DISABLED is set; all Runway generation is disabled.`);
      return 'Runway generation is disabled (RUNWAY_DISABLED). No Runway task was created.';
    }
    const allowed = this.getAllowedRunwayModels();
    if (!allowed.has(providerKey)) {
      console.warn(`[Runway] ⛔ BLOCKED non-Aleph model "${providerKey}" — Runway is restricted to [${[...allowed].join(', ')}]; everything else routes through PiAPI. Set RUNWAY_ALLOWED_MODELS to change.`);
      return `Runway is restricted to Aleph 2 only on this account — "${providerKey}" was blocked to prevent an unintended charge. Route this model through PiAPI, or add it to RUNWAY_ALLOWED_MODELS.`;
    }
    return null;
  }

  private getHeaders(apiModel?: string) {
    const version = (apiModel && RUNWAY_MODEL_API_VERSION[apiModel]) || RUNWAY_DEFAULT_API_VERSION;
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': version,
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

    const blocked = this.assertRunwayAllowed(providerKey);
    if (blocked) return { success: false, error: blocked, generationTimeMs: Date.now() - startTime };

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
        headers: this.getHeaders(apiModel),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Runway] API error: ${response.status} - model=${apiModel} endpoint=${endpoint} body=${errorText}`);
        return { success: false, error: `Runway API error: ${response.status} - ${errorText.substring(0, 200)}`, generationTimeMs: Date.now() - startTime };
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
    referenceImageUrl?: string;
  }): Promise<RunwayGenerationResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'RUNWAY_API_KEY not configured' };
    }

    this.apiKey = process.env.RUNWAY_API_KEY!;
    const startTime = Date.now();
    const providerKey = options.model || 'runway-gen4-aleph';
    // V2V endpoint uses a different model ID namespace — prefer V2V map, fall back to T2V map.
    const apiModel = RUNWAY_V2V_MODEL_MAP[providerKey] || this.resolveApiModel(providerKey);

    const blocked = this.assertRunwayAllowed(providerKey);
    if (blocked) return { success: false, error: blocked, generationTimeMs: Date.now() - startTime };

    try {
      console.log(`[Runway:V2V] Starting video-to-video with model: ${apiModel} (provider: ${providerKey})`);
      console.log(`[Runway:V2V] Source video: ${options.videoUrl.substring(0, 80)}...`);
      console.log(`[Runway:V2V] Prompt: ${options.prompt.substring(0, 100)}...`);
      if (options.referenceImageUrl) {
        console.log(`[Runway:V2V] Reference frame image: ${options.referenceImageUrl.substring(0, 80)}...`);
      }

      const body: any = {
        videoUri: options.videoUrl,
        promptText: options.prompt,
        model: apiModel,
      };

      // Aleph 2.0 accepts an optional still-frame reference alongside the source video.
      // promptImage must be an array of objects: [{ uri: "..." }]
      // Skip if referenceImageUrl is actually a video (mp4/webm/mov) — the V2V
      // pipeline sometimes falls back to brandAssetUrl which is an mp4, not an image.
      const refUrl = options.referenceImageUrl;
      const isImageRef = refUrl && !/\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(refUrl);
      if (isImageRef) {
        body.promptImage = [{ uri: refUrl }];
      }

      const response = await fetch(`${RUNWAY_API_BASE}/video_to_video`, {
        method: 'POST',
        headers: this.getHeaders(apiModel),
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

    const blocked = this.assertRunwayAllowed('runway-act-two');
    if (blocked) return { success: false, error: blocked, generationTimeMs: Date.now() - startTime };

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
        headers: this.getHeaders('act_two'),
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

  async generateWithAgent(options: {
    brief: string;
    referenceImageUrl?: string;
    aspectRatio?: string;
    duration?: number;
  }): Promise<RunwayGenerationResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'RUNWAY_API_KEY not configured' };
    }

    this.apiKey = process.env.RUNWAY_API_KEY!;
    const startTime = Date.now();
    const providerKey = 'runway-agent-2';
    const apiModel = this.resolveApiModel(providerKey);

    const blocked = this.assertRunwayAllowed(providerKey);
    if (blocked) return { success: false, error: blocked, generationTimeMs: Date.now() - startTime };

    try {
      const clampedDuration = Math.round(Math.min(options.duration || 10, 30));
      console.log(`[Runway:Agent2] Starting agentic generation with model: ${apiModel}`);
      console.log(`[Runway:Agent2] Brief: ${options.brief.substring(0, 100)}...`);

      const truncatedBrief = options.brief.length > 1000
        ? options.brief.substring(0, 997) + '...'
        : options.brief;

      const ratio = options.aspectRatio === '9:16' ? '720:1280' : '1280:720';

      let endpoint: string;
      let body: any;

      if (options.referenceImageUrl) {
        endpoint = `${RUNWAY_API_BASE}/image_to_video`;
        body = {
          model: apiModel,
          promptImage: options.referenceImageUrl,
          promptText: truncatedBrief,
          duration: clampedDuration,
          ratio,
        };
      } else {
        endpoint = `${RUNWAY_API_BASE}/text_to_video`;
        body = {
          model: apiModel,
          promptText: truncatedBrief,
          duration: clampedDuration,
          ratio,
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(apiModel),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Runway:Agent2] API error: ${response.status} - ${errorText}`);
        return { success: false, error: `Runway Agent 2.0 API error: ${response.status}`, generationTimeMs: Date.now() - startTime };
      }

      const data = await response.json();
      const taskId = data.id;

      if (!taskId) {
        return { success: false, error: 'No task ID in Runway Agent 2.0 response', generationTimeMs: Date.now() - startTime };
      }

      console.log(`[Runway:Agent2] Task created: ${taskId}`);

      const result = await this.pollForCompletion(taskId);
      const costPerSec = RUNWAY_COST_PER_SECOND[providerKey] || 0.1;

      return {
        ...result,
        taskId,
        duration: clampedDuration,
        cost: clampedDuration * costPerSec,
        generationTimeMs: Date.now() - startTime,
        provider: providerKey,
      };
    } catch (error: any) {
      console.error(`[Runway:Agent2] Generation failed:`, error.message);
      return { success: false, error: error.message, generationTimeMs: Date.now() - startTime };
    }
  }

  async submitJob(options: {
    prompt: string;
    duration?: number;
    aspectRatio?: string;
    imageUrl?: string;
    model?: string;
  }): Promise<{ taskId?: string; error?: string }> {
    if (!this.isAvailable()) return { error: 'RUNWAY_API_KEY not configured' };
    this.apiKey = process.env.RUNWAY_API_KEY!;
    const providerKey = options.model || 'runway';
    const blocked = this.assertRunwayAllowed(providerKey);
    if (blocked) return { error: blocked };
    const apiModel = this.resolveApiModel(providerKey);
    const clampedDuration = Math.round(Math.min(options.duration || 5, 10));
    const ratio = options.aspectRatio === '9:16' ? '720:1280' : '1280:720';
    const truncatedPrompt = options.prompt.length > 1000 ? options.prompt.substring(0, 997) + '...' : options.prompt;
    let endpoint: string;
    let body: any;
    if (options.imageUrl) {
      endpoint = `${RUNWAY_API_BASE}/image_to_video`;
      body = { model: apiModel, promptImage: options.imageUrl, promptText: truncatedPrompt, duration: clampedDuration, ratio };
    } else {
      endpoint = `${RUNWAY_API_BASE}/text_to_video`;
      body = { model: apiModel, promptText: truncatedPrompt, duration: clampedDuration, ratio };
    }
    console.log(`[Runway:submitJob] Submitting — provider: ${providerKey}, model: ${apiModel}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(apiModel),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Runway:submitJob] API error: ${response.status} — model=${apiModel} body=${errorText}`);
      return { error: `Runway API error: ${response.status} — ${errorText.substring(0, 200)}` };
    }
    const data = await response.json();
    const taskId = data.id;
    if (!taskId) return { error: 'No task ID in Runway response' };
    console.log(`[Runway:submitJob] Task created: ${taskId}`);
    return { taskId };
  }

  async getTaskStatus(taskId: string): Promise<{ status: string; videoUrl?: string; error?: string }> {
    if (!this.isAvailable()) return { status: 'error', error: 'RUNWAY_API_KEY not configured' };
    this.apiKey = process.env.RUNWAY_API_KEY!;
    try {
      const response = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'X-Runway-Version': RUNWAY_DEFAULT_API_VERSION },
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return { status: 'error', error: `Runway tasks API: ${response.status} — ${errText.substring(0, 100)}` };
      }
      const data = await response.json();
      console.log(`[Runway:getTaskStatus] Task ${taskId}: ${data.status}`);
      if (data.status === 'SUCCEEDED') {
        const videoUrl = data.output?.[0] || data.artifacts?.[0]?.url;
        return { status: 'succeeded', videoUrl };
      }
      if (data.status === 'FAILED') {
        return { status: 'failed', error: data.failure || 'Generation failed' };
      }
      return { status: 'processing' };
    } catch (error: any) {
      return { status: 'error', error: error.message };
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
