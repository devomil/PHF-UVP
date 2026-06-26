// MidJourney image generation via PiAPI (replaces the original LegNext stub)
// PiAPI exposes MidJourney through the standard /api/v1/task endpoint with
// model='midjourney'.  The flow is a 2-step async pipeline:
//   1. imagine  — submits the prompt, returns a 2x2 grid of 4 candidates
//   2. upscale  — isolates the first candidate to a single full-res image
// If the upscale step fails the grid image is returned as a valid fallback
// so the ultra tier never hard-fails.

const PIAPI_BASE = 'https://api.piapi.ai/api/v1';
const IMAGINE_POLL_MS = 5000;
const UPSCALE_POLL_MS = 5000;
const MAX_IMAGINE_ATTEMPTS = 40;
const MAX_UPSCALE_ATTEMPTS = 20;

interface LegNextGenerateOptions {
  prompt: string;
  model: string;
  mode: string;
  aspectRatio: string;
  stylize?: number;
}

interface LegNextGenerateResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

interface LegNextBalance {
  points: number;
  plan: string;
}

class LegNextClient {
  isConfigured(): boolean {
    return !!process.env.PIAPI_API_KEY;
  }

  async hasAvailableCredits(_required: number): Promise<boolean> {
    return !!process.env.PIAPI_API_KEY;
  }

  async generateImage(options: LegNextGenerateOptions): Promise<LegNextGenerateResult> {
    const apiKey = process.env.PIAPI_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'PIAPI_API_KEY not configured for MidJourney generation' };
    }

    try {
      const imagineRes = await fetch(`${PIAPI_BASE}/task`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'midjourney',
          task_type: 'imagine',
          input: {
            prompt: options.prompt,
            process_mode: options.mode || 'fast',
            aspect_ratio: options.aspectRatio || '16:9',
            skip_prompt_check: false,
          },
        }),
      });

      if (!imagineRes.ok) {
        const errorText = await imagineRes.text();
        return { success: false, error: `MidJourney API error ${imagineRes.status}: ${errorText.substring(0, 200)}` };
      }

      const imagineData = await imagineRes.json();
      const imagineTaskId = imagineData.data?.task_id || imagineData.task_id;
      if (!imagineTaskId) {
        return { success: false, error: 'MidJourney: no task_id returned from imagine step' };
      }
      console.log(`[MidJourney] Imagine task submitted: ${imagineTaskId}`);

      const gridImageUrl = await this.pollUntilComplete(imagineTaskId, apiKey, MAX_IMAGINE_ATTEMPTS, IMAGINE_POLL_MS);
      if (!gridImageUrl) {
        return { success: false, error: 'MidJourney imagine timed out or failed' };
      }
      console.log(`[MidJourney] Imagine complete: ${gridImageUrl.substring(0, 60)}...`);

      const singleImageUrl = await this.upscaleFirst(imagineTaskId, apiKey);
      const finalUrl = singleImageUrl || gridImageUrl;
      console.log(`[MidJourney] Final image (${singleImageUrl ? 'upscaled' : 'grid fallback'}): ${finalUrl.substring(0, 60)}...`);

      return { success: true, imageUrl: finalUrl };
    } catch (error: any) {
      console.error('[MidJourney] Generation error:', error.message);
      return { success: false, error: error.message };
    }
  }

  private async pollUntilComplete(
    taskId: string,
    apiKey: string,
    maxAttempts: number,
    intervalMs: number
  ): Promise<string | null> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, intervalMs));
      try {
        const res = await fetch(`${PIAPI_BASE}/task/${taskId}`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (!res.ok) continue;

        const data = await res.json();
        const status = data.data?.status || data.status;

        if (status === 'completed' || status === 'success') {
          const output = data.data?.output || data.output;
          const imageUrl = output?.image_url || output?.image_urls?.[0];
          return typeof imageUrl === 'string' ? imageUrl : null;
        }

        if (status === 'failed' || status === 'error') {
          const errMsg = data.data?.error?.message || data.data?.logs?.join(', ') || 'Unknown error';
          console.error(`[MidJourney] Task ${taskId} failed: ${errMsg}`);
          return null;
        }

        if (i % 5 === 0) {
          console.log(`[MidJourney] Polling ${taskId}: attempt ${i + 1}/${maxAttempts}, status=${status}`);
        }
      } catch {
        // Network blip — retry next interval
      }
    }
    return null;
  }

  private async upscaleFirst(originTaskId: string, apiKey: string): Promise<string | null> {
    try {
      const res = await fetch(`${PIAPI_BASE}/task`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'midjourney',
          task_type: 'upscale',
          input: { origin_task_id: originTaskId, index: '1' },
        }),
      });
      if (!res.ok) return null;

      const data = await res.json();
      const taskId = data.data?.task_id || data.task_id;
      if (!taskId) return null;

      console.log(`[MidJourney] Upscale task: ${taskId}`);
      return this.pollUntilComplete(taskId, apiKey, MAX_UPSCALE_ATTEMPTS, UPSCALE_POLL_MS);
    } catch {
      return null;
    }
  }

  async getBalance(): Promise<LegNextBalance> {
    return { points: 999, plan: 'piapi-midjourney' };
  }
}

export const legNextClient = new LegNextClient();
