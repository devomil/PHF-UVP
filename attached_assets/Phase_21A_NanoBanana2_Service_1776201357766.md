# Phase 21A: Nano Banana 2 Service + Client

## Priority: CRITICAL
## Dependency: None (independent of Phase 20)
## Estimated Time: 3-4 hours

---

## Task 1: Verify PiAPI Nano Banana 2 Parameters

**Before writing any code**, fetch the Nano Banana 2 PiAPI documentation:

```
https://piapi.ai/docs/gemini-api/nano-banana-2
```

Verify:
- Exact `task_type` string (likely `"nano-banana-2"`)
- `model` field value (likely `"gemini"`)
- Reference image parameter name (`reference_images`, `images`, `refs`, etc.)
- Web search toggle parameter name (`enable_web_search`, `web_search`, `use_search`, etc.)
- Resolution options (`"1K"`, `"2K"`, `"4K"`, or numeric values)
- Output field name in the completed task response (`output.image_url`, `output.url`, `output.images[0]`, etc.)

---

## Task 2: Add Schema Fields for Seed Images

Confirm or add the following fields on the scenes table:

```typescript
// shared/schema.ts — scenes table
export const scenes = pgTable('scenes', {
  // ... existing fields ...

  thumbnailUrl: text('thumbnail_url'),   // Preview image shown in storyboard UI
  seedImageUrl: text('seed_image_url'),  // Image passed to I2V generation as start frame

  // Track which image generation attempt was used
  imageGenerationModel: text('image_generation_model'), // "nano-banana-2" | "flux" | etc.
  imageGenerationPrompt: text('image_generation_prompt'), // Stored for regeneration
});
```

Run migration if new columns added:
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## Task 3: Nano Banana 2 Client

Create `server/services/nano-banana2.service.ts`:

```typescript
// server/services/nano-banana2.service.ts

const PIAPI_BASE = 'https://api.piapi.ai/api/v1';

// Aspect ratios supported by Nano Banana 2
export type NB2AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
export type NB2Resolution = '1K' | '2K' | '4K';
export type NB2Format = 'jpeg' | 'png';

export interface NB2GenerateOptions {
  prompt: string;
  aspectRatio?: NB2AspectRatio;
  resolution?: NB2Resolution;
  format?: NB2Format;
  referenceImages?: string[];   // Public S3 URLs, max 14
  enableWebSearch?: boolean;    // Default: true for product styles
}

export interface NB2GenerateResult {
  imageUrl: string;
  taskId: string;
}

export class NanoBanana2Service {

  // ─── Generate Single Image ────────────────────────────────────────────────

  async generateImage(options: NB2GenerateOptions): Promise<NB2GenerateResult> {
    const {
      prompt,
      aspectRatio = '16:9',
      resolution = '2K',
      format = 'jpeg',
      referenceImages = [],
      enableWebSearch = true,
    } = options;

    if (referenceImages.length > 14) {
      throw new Error(`Nano Banana 2 supports max 14 reference images (got ${referenceImages.length})`);
    }

    console.log(`[NB2] Generating image | ${resolution} | ${aspectRatio}`);
    if (referenceImages.length > 0) {
      console.log(`[NB2] ${referenceImages.length} brand reference(s) attached`);
    }
    if (enableWebSearch) {
      console.log(`[NB2] Web search grounding: enabled`);
    }
    console.log(`[NB2] Prompt: ${prompt.substring(0, 100)}`);

    // NOTE: Verify these field names against PiAPI docs before deploying
    const requestBody: Record<string, any> = {
      model: 'gemini',
      task_type: 'nano-banana-2',
      input: {
        prompt,
        aspect_ratio: aspectRatio,
        resolution,
        output_format: format,
        enable_web_search: enableWebSearch,
      },
    };

    // Only add reference_images if we have any
    if (referenceImages.length > 0) {
      requestBody.input.reference_images = referenceImages;
    }

    const response = await fetch(`${PIAPI_BASE}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.PIAPI_API_KEY!,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Nano Banana 2 API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const taskId = data?.data?.task_id;

    if (!taskId) {
      throw new Error(`Nano Banana 2: No task_id in response: ${JSON.stringify(data)}`);
    }

    console.log(`[NB2] Task created: ${taskId}`);
    const imageUrl = await this.pollUntilComplete(taskId);

    return { imageUrl, taskId };
  }

  // ─── Generate Multiple Candidates ────────────────────────────────────────
  // Generate N candidates in parallel (at $0.03/image, 3 candidates = $0.09/scene)

  async generateCandidates(
    options: NB2GenerateOptions,
    count: number = 3
  ): Promise<NB2GenerateResult[]> {
    console.log(`[NB2] Generating ${count} candidates in parallel`);

    const promises = Array.from({ length: count }, () =>
      this.generateImage(options).catch(err => {
        console.error(`[NB2] Candidate failed:`, err.message);
        return null;
      })
    );

    const results = await Promise.all(promises);
    const successful = results.filter((r): r is NB2GenerateResult => r !== null);

    if (successful.length === 0) {
      throw new Error('All Nano Banana 2 candidate generations failed');
    }

    console.log(`[NB2] ${successful.length}/${count} candidates succeeded`);
    return successful;
  }

  // ─── Poll for Completion ──────────────────────────────────────────────────

  private async pollUntilComplete(taskId: string): Promise<string> {
    const maxAttempts = 60;   // 5 minutes max (images are fast — 5-25s typical)
    const interval = 3000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, interval));

      const response = await fetch(`${PIAPI_BASE}/task/${taskId}`, {
        headers: { 'X-API-Key': process.env.PIAPI_API_KEY! },
      });

      if (!response.ok) {
        console.warn(`[NB2] Poll error attempt ${attempt}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const status = data?.data?.status;

      if (status === 'completed') {
        // VERIFY output field name against PiAPI docs
        const imageUrl =
          data?.data?.output?.image_url ??
          data?.data?.output?.url ??
          data?.data?.output?.images?.[0];

        if (!imageUrl) {
          throw new Error(`NB2 completed but no image URL: ${JSON.stringify(data?.data?.output)}`);
        }

        console.log(`[NB2] Complete: ${imageUrl.substring(0, 80)}`);
        return imageUrl;
      }

      if (status === 'failed' || status === 'error') {
        const msg = data?.data?.error?.message ?? 'Unknown error';
        throw new Error(`Nano Banana 2 task failed: ${msg}`);
      }
    }

    throw new Error(`Nano Banana 2 timed out after ${(maxAttempts * interval) / 60000}min`);
  }

  // ─── Image Editing ────────────────────────────────────────────────────────
  // Nano Banana 2 supports image-to-image editing on the same endpoint.
  // Pass an existing image URL + an edit instruction as the prompt.

  async editImage(options: {
    sourceImageUrl: string;
    editInstruction: string;
    aspectRatio?: NB2AspectRatio;
    resolution?: NB2Resolution;
  }): Promise<NB2GenerateResult> {
    console.log(`[NB2] Editing image: ${options.editInstruction.substring(0, 80)}`);

    return this.generateImage({
      prompt: options.editInstruction,
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
      referenceImages: [options.sourceImageUrl],  // Existing image as input
      enableWebSearch: false,  // Editing doesn't benefit from web search
    });
  }
}

export const nanoBanana2Service = new NanoBanana2Service();
```

---

## Task 4: Update Visual Style Config — Image Providers

In `shared/visual-style-config.ts`, update `preferredImageProviders` for all visual styles:

```typescript
// BEFORE:
hero: {
  preferredImageProviders: ['flux', 'ideogram'],
  ...
}

// AFTER — all styles use Nano Banana 2 as primary:
hero: {
  preferredImageProviders: ['nano-banana-2', 'flux'],   // NB2 primary, flux fallback
  ...
}

lifestyle: {
  preferredImageProviders: ['nano-banana-2', 'flux'],
  ...
}

product: {
  preferredImageProviders: ['nano-banana-2', 'ideogram'],
  // NB2 with web search is especially strong for product accuracy
  ...
}

educational: {
  preferredImageProviders: ['nano-banana-2', 'flux'],
  ...
}

social: {
  preferredImageProviders: ['nano-banana-2', 'flux'],
  ...
}

premium: {
  preferredImageProviders: ['nano-banana-2', 'ideogram'],
  ...
}
```

---

## Task 5: Web Search Policy per Visual Style

Add a helper that decides whether web search should be enabled for a given visual style and scene type:

```typescript
// server/utils/image-generation-policy.ts

/**
 * Web search grounding is most valuable when the image needs to represent
 * real-world products, current trends, or factual visual content.
 * It adds latency (~3-5s) — skip it for abstract/nature/lifestyle scenes.
 */
export function shouldEnableWebSearch(
  visualStyle: string,
  sceneContentType: string
): boolean {
  // Always enable for product-adjacent content
  const productStyles = ['product', 'premium'];
  if (productStyles.includes(visualStyle)) return true;

  // Enable for product/solution/CTA scene types in any style
  const productSceneTypes = ['product', 'solution', 'cta', 'benefit'];
  if (productSceneTypes.includes(sceneContentType)) return true;

  // Disable for abstract, nature, or lifestyle B-roll
  const abstractTypes = ['nature', 'abstract', 'lifestyle'];
  if (abstractTypes.includes(sceneContentType)) return false;

  // Default: enable (safe choice for accuracy)
  return true;
}
```

---

## Task 6: Export from Services Index

Update `server/services/index.ts`:

```typescript
export { nanoBanana2Service, NanoBanana2Service } from './nano-banana2.service';
```

---

## Verification

Test the service with a simple generation:

```typescript
// Quick test (run as a test route or in Node REPL):

import { nanoBanana2Service } from './server/services/nano-banana2.service';

const result = await nanoBanana2Service.generateImage({
  prompt: 'A sophisticated woman holding a premium supplement bottle in a sunlit modern kitchen',
  aspectRatio: '16:9',
  resolution: '2K',
  enableWebSearch: true,
});

console.log('Image URL:', result.imageUrl);
// → Should be a HTTPS URL to a JPEG image
// → Image should be 1920×1080 or similar 16:9 at 2K
// → Woman and bottle should be clearly visible
```

---

## Success Criteria

- [ ] `NanoBanana2Service` submits tasks and polls to completion
- [ ] `generateCandidates(options, 3)` returns 3 image URLs in parallel
- [ ] `editImage` calls work (re-uses generate endpoint with source as reference)
- [ ] All 6 visual styles have `nano-banana-2` as first `preferredImageProvider`
- [ ] `shouldEnableWebSearch` returns correct values for product vs lifestyle contexts
- [ ] Service exported from services index
- [ ] No TypeScript errors

---

## Next Phase

Proceed to **Phase 21B: Scene Storyboard Pipeline** once `generateCandidates` produces quality images for a test Pine Hill Farm scene.
