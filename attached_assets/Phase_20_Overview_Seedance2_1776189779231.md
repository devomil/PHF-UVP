# Phase 20A: Seedance 2 Provider Router + T2V

## Priority: CRITICAL
## Dependency: None (first phase)
## Estimated Time: 3-4 hours

---

## What This Phase Builds

1. Seedance 2 payload builders in `piapi-video-service.ts`
2. Updated visual style routing in `visual-style-config.ts`
3. Updated provider prompt strategy (Group 1 — prompt AS-IS)
4. Fallback logic for Seedance timeouts/errors

---

## Task 1: Verify PiAPI Parameter Names

**Before writing any code**, open the PiAPI docs to confirm exact parameter names:

```bash
# Fetch the Seedance 2 API spec from PiAPI docs
# Check: exact field names for generation_mode, first_frame, image_list
# The Replit agent should use the browser tool or curl to fetch:
# https://piapi.ai/docs/seedance-api/seedance-2
```

The parameters documented below are based on published research. If PiAPI uses different names at runtime (e.g. `mode` instead of `generation_mode`, or `images` instead of `image_list`), use the PiAPI docs as ground truth.

---

## Task 2: Add Seedance 2 Payload Builders

Open `server/services/piapi-video-service.ts`.

Find the existing `buildT2VRequestBody` method (or equivalent). Add the Seedance 2 section inside it:

```typescript
// ─── Seedance 2 T2V ────────────────────────────────────────────────────────
// Add this block inside buildT2VRequestBody, alongside the existing
// Veo, Kling, Luma, Hailuo sections.

if (options.model === 'seedance-2' || options.model === 'seedance-2-fast') {
  const taskType = options.model === 'seedance-2-fast'
    ? 'seedance-2-fast'
    : 'seedance-2';

  // Seedance 2 accepts integer seconds 4-15
  const clampedDuration = Math.max(4, Math.min(15,
    Math.round(options.duration ?? 8)
  ));

  console.log(`[PiAPI:Seedance2] T2V | task_type=${taskType} | duration=${clampedDuration}s`);
  console.log(`[PiAPI:Seedance2] Prompt (first 100): ${options.prompt.substring(0, 100)}`);

  return {
    model: 'seedance',
    task_type: taskType,
    input: {
      prompt: options.prompt,        // Group 1: send AS-IS, no modification
      generation_mode: 'text_to_video',
      duration: clampedDuration,
      aspect_ratio: options.aspectRatio ?? '16:9',
      resolution: '1080p',
      generate_audio: false,         // Default OFF — conflicts with OAI TTS pipeline
    },
    config: {
      webhook_config: {
        endpoint: process.env.PIAPI_WEBHOOK_URL ?? '',
        secret: process.env.PIAPI_WEBHOOK_SECRET ?? '',
      },
    },
  };
}
```

---

## Task 3: Add Seedance 2 to I2V Payload Builder

Find the existing `buildI2VRequestBody` method. Add the Seedance 2 section:

```typescript
// ─── Seedance 2 I2V (basic image-to-video) ────────────────────────────────
// This is the standard I2V path. first_last_frames and omni_reference
// modes are handled in Phase 20B and 20C respectively.

if (options.model === 'seedance-2' || options.model === 'seedance-2-fast') {
  const taskType = options.model === 'seedance-2-fast'
    ? 'seedance-2-fast'
    : 'seedance-2';

  const clampedDuration = Math.max(4, Math.min(15,
    Math.round(options.duration ?? 8)
  ));

  if (!options.imageUrl) {
    throw new Error('[PiAPI:Seedance2 I2V] imageUrl is required for I2V generation');
  }

  console.log(`[PiAPI:Seedance2] I2V | task_type=${taskType} | duration=${clampedDuration}s`);
  console.log(`[PiAPI:Seedance2] Image URL: ${options.imageUrl.substring(0, 80)}`);

  // CRITICAL: Do NOT sanitize prompt for I2V (same rule as Veo/other providers)
  // The image already contains visual context — re-describing it wastes prompt capacity
  // I2V prompt should describe MOTION ONLY: "gentle camera push toward subject, soft movement"

  return {
    model: 'seedance',
    task_type: taskType,
    input: {
      prompt: options.prompt,
      generation_mode: 'text_to_video',   // Standard I2V uses text_to_video mode with image
      image_url: options.imageUrl,         // Starting frame image
      duration: clampedDuration,
      aspect_ratio: options.aspectRatio ?? '16:9',
      resolution: '1080p',
      generate_audio: false,
    },
    config: {
      webhook_config: {
        endpoint: process.env.PIAPI_WEBHOOK_URL ?? '',
        secret: process.env.PIAPI_WEBHOOK_SECRET ?? '',
      },
    },
  };
}
```

---

## Task 4: Add Seedance 2 to Provider Prompt Strategy

Open `server/services/piapi-video-service.ts` (or wherever `enhancePromptForProvider` or the Group 1/2/3 classification lives — see Phase 15 Addendum).

Add Seedance 2 to Group 1 (prompt AS-IS):

```typescript
// In the provider classification function/constant
// Find: GROUP_1_PROVIDERS or similar array
// Add:

const GROUP_1_PROVIDERS = [
  'veo', 'veo3', 'veo3.1', 'veo2',
  'runway', 'runway-gen3',
  'pika', 'pika-labs',
  'genmo', 'hunyuan', 'skyreels',
  'seedance', 'seedance-1.0',
  'seedance-2',        // ← ADD
  'seedance-2-fast',   // ← ADD
];

// Seedance 2 is Group 1: send prompt exactly as provided.
// Do NOT prepend camera instructions or animation style descriptions.
// Simple descriptive prompts outperform technical film jargon for Seedance.
```

---

## Task 5: Update Visual Style Provider Routing

Open `shared/visual-style-config.ts`.

Update `preferredVideoProviders` for each visual style:

```typescript
// BEFORE (current state):
hero: {
  preferredVideoProviders: ['runway', 'kling', 'luma'],
  ...
}

// AFTER:
hero: {
  preferredVideoProviders: ['seedance-2', 'runway', 'kling'],
  ...
}

// Apply the same pattern:
lifestyle: {
  preferredVideoProviders: ['seedance-2-fast', 'kling', 'runway'],
  ...
}

product: {
  preferredVideoProviders: ['seedance-2', 'luma', 'runway'],
  ...
}

educational: {
  preferredVideoProviders: ['seedance-2-fast', 'kling', 'hailuo'],
  ...
}

social: {
  preferredVideoProviders: ['seedance-2-fast', 'hailuo', 'kling'],
  ...
}

premium: {
  preferredVideoProviders: ['seedance-2', 'runway', 'luma'],
  ...
}
```

---

## Task 6: Add Seedance 2 to Provider Selection Logic

Find the method that iterates `preferredVideoProviders` and routes to the correct payload builder. It likely looks something like:

```typescript
const provider = visualStyle.preferredVideoProviders[0];
switch (provider) {
  case 'runway': return await this.generateRunwayVideo(options);
  case 'kling': return await this.generateKlingVideo(options);
  // ...
}
```

Add the Seedance 2 cases:

```typescript
case 'seedance-2':
case 'seedance-2-fast':
  return await this.generateSeedance2Video({ ...options, model: provider });
```

And add the `generateSeedance2Video` method:

```typescript
private async generateSeedance2Video(options: VideoGenerationOptions): Promise<VideoGenerationResult> {
  const isI2V = !!options.imageUrl;
  const requestBody = isI2V
    ? this.buildI2VRequestBody(options)
    : this.buildT2VRequestBody(options);

  console.log(`[PiAPI:Seedance2] Submitting ${isI2V ? 'I2V' : 'T2V'} task`);

  const response = await fetch('https://api.piapi.ai/api/v1/task', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.PIAPI_API_KEY!,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Seedance 2 API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const taskId = data?.data?.task_id;

  if (!taskId) {
    throw new Error(`Seedance 2: No task_id in response: ${JSON.stringify(data)}`);
  }

  console.log(`[PiAPI:Seedance2] Task created: ${taskId}`);

  // Poll for completion — reuse existing polling logic
  // (or call this.pollTaskUntilComplete(taskId))
  return await this.pollSeedance2Task(taskId);
}

private async pollSeedance2Task(taskId: string): Promise<VideoGenerationResult> {
  const maxAttempts = 120;   // 10 minutes at 5s intervals
  const interval = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, interval));

    const response = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
      headers: { 'X-API-Key': process.env.PIAPI_API_KEY! },
    });

    if (!response.ok) {
      console.warn(`[PiAPI:Seedance2] Poll error attempt ${attempt}: ${response.status}`);
      continue;
    }

    const data = await response.json();
    const status = data?.data?.status;

    if (status === 'completed') {
      const videoUrl = data?.data?.output?.video_url
        ?? data?.data?.output?.url
        ?? data?.data?.output?.video;

      if (!videoUrl) {
        throw new Error(`Seedance 2 completed but no video URL: ${JSON.stringify(data?.data?.output)}`);
      }

      console.log(`[PiAPI:Seedance2] Complete: ${videoUrl.substring(0, 80)}`);
      return { videoUrl, taskId, provider: 'seedance-2' };
    }

    if (status === 'failed' || status === 'error') {
      const errorMsg = data?.data?.error?.message ?? 'Unknown error';
      throw new Error(`Seedance 2 task failed: ${errorMsg}`);
    }

    // Peak hours warning: Seedance has high traffic 09:00-15:00 GMT
    if (attempt % 12 === 0) {
      console.log(`[PiAPI:Seedance2] Still processing... attempt ${attempt}/${maxAttempts} (task: ${taskId})`);
    }
  }

  throw new Error(`Seedance 2 task timed out after ${(maxAttempts * interval) / 60000} minutes`);
}
```

---

## Task 7: Seedance 2 Peak Hours Warning

Add a runtime check for Seedance's high-traffic window. Seedance documentation notes that queue times may extend to several hours between 09:00–15:00 GMT during peak hours.

```typescript
// Add to generateSeedance2Video, before the fetch call:

function isSeedancePeakHours(): boolean {
  const now = new Date();
  const utcHour = now.getUTCHours();
  return utcHour >= 9 && utcHour < 15;
}

if (isSeedancePeakHours()) {
  console.warn('[PiAPI:Seedance2] ⚠️ Peak hours (09:00-15:00 GMT) — queue times may be extended');
}
```

---

## Verification

Test with a known project:

```typescript
// Quick test — call via existing video generation endpoint
// with a scene using visual_style: 'hero'
// Confirm the following in logs:
// [PiAPI:Seedance2] T2V | task_type=seedance-2 | duration=8s
// [PiAPI:Seedance2] Task created: {task_id}
// [PiAPI:Seedance2] Complete: https://...
```

Check the output video:
- No watermark on the rendered video ✓
- Video is 1080p ✓
- Duration matches requested seconds ✓

---

## Success Criteria

- [ ] `generateSeedance2Video` method exists and is wired into provider routing
- [ ] T2V payload sends `model: "seedance"`, correct `task_type`, `generate_audio: false`
- [ ] I2V payload includes `image_url` field
- [ ] All 6 visual styles have Seedance 2 as first provider
- [ ] Fallback works: if Seedance fails, next provider in list is tried
- [ ] Seedance 2 is in Group 1 (prompt AS-IS, no modification)
- [ ] Peak hours logging added
- [ ] No TypeScript errors

---

## Next Phase

Proceed to **Phase 20B: first_last_frames Scene Continuity** once a full T2V render with Seedance 2 completes successfully.
