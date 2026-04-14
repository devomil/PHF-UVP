# Phase 22: Recraft V4 Image Provider

## Priority: CRITICAL
## Dependency: None (parallel with Phase 20A)
## Estimated Time: 2-3 hours

---

## What This Phase Builds

A Recraft image service that gives NeuralCut the ability to generate scenes with
accurately rendered text — clinic signs, product labels, chapter subtitle backgrounds,
food packaging, environmental branding. No other model in the current stack can do this.

This is a **direct Recraft API integration** — Recraft is NOT available through PiAPI.
It requires a separate API key and its own service module.

---

## Critical Finding from Live API Docs

Two model paths exist with different capabilities:

| Use case | Model | Why |
|---|---|---|
| General scene generation | `recraftv4` | Best quality, 1MP, 10K prompt limit, no style param |
| Precise branded text placement | `recraftv3` + `Photorealism` style + `text_layout` | `text_layout` is V3-only — exact text position control |
| Hero / large-format scenes | `recraftv4_pro` | 4MP output (2688×1536 at 16:9), same quality as V4 |

> ⚠️ **`text_layout` is not yet supported in V4 models.** V4 still renders text well from
> prompts, but cannot place text at exact pixel coordinates. For scenes requiring
> precise sign text (e.g. "ORIGIN HOLISTIC CLINIC"), use **V3 + Photorealism +
> text_layout**. For everything else, use V4.

> ⚠️ **Styles are not supported for V4 models.** Do not pass a `style` parameter
> when using `recraftv4` or `recraftv4_pro` — it will error or be ignored.

> ⚠️ **Generated image URLs expire after ~24 hours.** Copy every result to S3
> immediately after generation. Never store Recraft URLs in the database.

---

## API Reference (confirmed from live docs)

```
Base URL:  https://external.api.recraft.ai/v1
Endpoint:  POST /images/generations
Auth:      Authorization: Bearer {RECRAFT_API_KEY}
Rate:      100 images/min, 5 requests/sec
```

**Model strings (exact):**
- `recraftv4`          — V4, 1MP, default
- `recraftv4_pro`      — V4 Pro, 4MP
- `recraftv4_vector`   — V4 Vector (SVG output)
- `recraftv3`          — V3, supports style + text_layout
- `recraftv3_vector`   — V3 Vector (SVG output)

**Size for 16:9 output:**
- V4:     `1344x768`   (use `size: "16:9"` or `"1344x768"`)
- V4 Pro: `2688x1536`  (use `size: "16:9"` or `"2688x1536"`)
- V3:     `1820x1024`  (use `size: "16:9"` or `"1820x1024"`)

**Styles for V3 (V4 has no styles):**
- `realistic_image`         — photorealistic (best for branded environments)
- `digital_illustration`    — illustrated style
- `vector_illustration`     — vector
- Named styles: `"Photorealism"`, `"Illustration"`, `"Enterprise"`,
  `"Recraft V3 Raw"`, `"Hand-drawn"` (pass as `style` string)

---

## Task 1: Add Environment Variable

Add to Replit Secrets:
```
RECRAFT_API_KEY=your_recraft_api_key_here
```

Get the API key:
1. Create an account at https://app.recraft.ai
2. Go to Profile → API
3. Ensure your API units balance is above zero (purchase if needed)
4. Click "Generate" to create a token

---

## Task 2: Create Recraft Service

Create `server/services/recraft.service.ts`:

```typescript
// server/services/recraft.service.ts

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET } from '../config/aws';

const RECRAFT_API_BASE = 'https://external.api.recraft.ai/v1';

// ─── Types ──────────────────────────────────────────────────────────────────

export type RecraftModel =
  | 'recraftv4'
  | 'recraftv4_pro'
  | 'recraftv4_vector'
  | 'recraftv3'
  | 'recraftv3_vector';

export type RecraftAspectRatio =
  | '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3';

// V3-only: text_layout specifies exact text to render at a position
export interface TextLayoutItem {
  text: string;         // The exact string to render
  x: number;           // Horizontal position, 0.0–1.0 (fraction of image width)
  y: number;           // Vertical position, 0.0–1.0 (fraction of image height)
  width?: number;      // Text box width as fraction of image width
  height?: number;     // Text box height as fraction of image height
  font_size?: number;  // Font size hint
}

export interface RecraftGenerateOptions {
  prompt: string;
  model?: RecraftModel;
  aspectRatio?: RecraftAspectRatio;
  n?: number;                      // 1–6, default 1
  style?: string;                  // V3 only — do NOT pass for V4
  styleId?: string;                // UUID of a saved custom style (V3 only)
  textLayout?: TextLayoutItem[];   // V3 only — exact text placement
  responseFormat?: 'url' | 'b64_json';
}

export interface RecraftResult {
  imageUrl: string;    // Permanent S3 URL (Recraft URL already copied to S3)
  s3Key: string;
  model: RecraftModel;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class RecraftService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.RECRAFT_API_KEY!;
    if (!this.apiKey) {
      console.warn('[Recraft] RECRAFT_API_KEY not set — service disabled');
    }
  }

  // ─── Generate image (V4, general use) ───────────────────────────────────
  // Use for: lifestyle scenes, product backgrounds, nature, abstract.
  // V4 renders text well from prompts — just describe it naturally.

  async generateImage(
    options: RecraftGenerateOptions,
    s3KeyPrefix: string
  ): Promise<RecraftResult> {
    const {
      prompt,
      model = 'recraftv4',
      aspectRatio = '16:9',
      n = 1,
      responseFormat = 'url',
    } = options;

    // V4 does NOT accept a style parameter
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

    // V3-only parameters
    if (!isV4) {
      if (options.style) body.style = options.style;
      if (options.styleId) body.style_id = options.styleId;
      if (options.textLayout?.length) body.text_layout = options.textLayout;
    }

    console.log(`[Recraft] Generating with ${model} | ${aspectRatio} | ${prompt.substring(0, 80)}`);
    if (options.textLayout?.length) {
      console.log(`[Recraft] text_layout: ${options.textLayout.length} text element(s)`);
    }

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
    const recraftUrl: string = data?.data?.[0]?.url ?? data?.data?.[0]?.b64_json;

    if (!recraftUrl) {
      throw new Error(`Recraft: No URL in response: ${JSON.stringify(data)}`);
    }

    // CRITICAL: Copy to S3 immediately — Recraft URLs expire in ~24 hours
    const s3Key = `${s3KeyPrefix}/${Date.now()}.jpg`;
    const permanentUrl = await this.copyToS3(recraftUrl, s3Key);

    console.log(`[Recraft] Generated + saved: ${permanentUrl.substring(0, 80)}`);
    return { imageUrl: permanentUrl, s3Key, model };
  }

  // ─── Generate with precise text placement (V3 + text_layout) ────────────
  // Use for: branded environments, clinic signs, product packaging labels,
  // any scene where a specific text string must appear accurately in the image.

  async generateWithBrandedText(params: {
    sceneDescription: string;   // The scene context (background, environment)
    textElements: Array<{
      text: string;             // Exact text to render (e.g. "ORIGIN HOLISTIC CLINIC")
      x: number;                // 0.0 = far left, 1.0 = far right
      y: number;                // 0.0 = top, 1.0 = bottom
      width?: number;           // Text box width as fraction of image
    }>;
    style?: string;             // Default: "Photorealism"
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

    // Build a prompt that combines the scene and the text elements
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
      model: 'recraftv3',    // V3 required for text_layout
      style,
      aspectRatio,
      textLayout,
    }, s3KeyPrefix);
  }

  // ─── Generate premium hero image (V4 Pro, 4MP) ───────────────────────────
  // Use for: hero/cinematic scenes where maximum resolution matters.
  // Outputs at 2688×1536 for 16:9 (compared to V4's 1344×768).

  async generatePremiumImage(
    options: Omit<RecraftGenerateOptions, 'model'>,
    s3KeyPrefix: string
  ): Promise<RecraftResult> {
    return this.generateImage({ ...options, model: 'recraftv4_pro' }, s3KeyPrefix);
  }

  // ─── Create a saved brand style (one-time setup) ─────────────────────────
  // Upload 2-5 brand images to create a reusable style UUID.
  // Store the returned UUID in the brand's settings for future use.
  // NOTE: Only works with V3 models.

  async createBrandStyle(params: {
    referenceImageUrls: string[];   // Public URLs of brand reference images (max 5)
    baseStyle?: string;             // "realistic_image" | "digital_illustration" | "any"
  }): Promise<string> {
    const { referenceImageUrls, baseStyle = 'realistic_image' } = params;

    if (referenceImageUrls.length > 5) {
      throw new Error('Recraft brand style: max 5 reference images');
    }

    const formData = new FormData();
    formData.append('style', baseStyle);

    // Download each reference image and attach as a file
    for (let i = 0; i < referenceImageUrls.length; i++) {
      const imgResponse = await fetch(referenceImageUrls[i]);
      if (!imgResponse.ok) {
        console.warn(`[Recraft] Could not download reference image ${i + 1}`);
        continue;
      }
      const buffer = await imgResponse.arrayBuffer();
      const file = new File([buffer], `reference_${i + 1}.jpg`, { type: 'image/jpeg' });
      formData.append(`file${i + 1}`, file);
    }

    const response = await fetch(`${RECRAFT_API_BASE}/styles`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Recraft createBrandStyle failed ${response.status}: ${err}`);
    }

    const data = await response.json();
    const styleId: string = data?.id;

    if (!styleId) throw new Error('Recraft: No style ID in response');

    console.log(`[Recraft] Brand style created: ${styleId}`);
    return styleId;
  }

  // ─── Copy generated image to S3 ─────────────────────────────────────────
  // Must be called immediately — Recraft URLs expire in ~24 hours.

  private async copyToS3(sourceUrl: string, s3Key: string): Promise<string> {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to download Recraft image for S3 copy: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: Buffer.from(buffer),
      ContentType: 'image/jpeg',
      ACL: 'public-read',
    }));

    return `https://${S3_BUCKET}.s3.amazonaws.com/${s3Key}`;
  }
}

export const recraftService = new RecraftService();
```

---

## Task 3: Scene-Level Text Accuracy Helper

Create `server/utils/recraft-scene-policy.ts`:

```typescript
// server/utils/recraft-scene-policy.ts

/**
 * Determines whether a scene requires Recraft's precise text rendering
 * rather than standard image generation (NB2 or Flux).
 *
 * "Text accuracy required" means the scene contains readable text that
 * must appear correctly — signage, labels, packaging, annotations.
 * Video models and most T2I models cannot reliably render this.
 */
export function requiresTextAccuracy(scene: {
  sceneType?: string;
  visualStyle?: string;
  prompt?: string;
  videoPrompt?: string;
  imagePrompt?: string;
}): boolean {
  // Scientific/medical scenes almost always have text annotations
  const textHeavySceneTypes = ['scientific_medical', 'title_card', 'infographic'];
  if (scene.sceneType && textHeavySceneTypes.includes(scene.sceneType)) return true;

  // Product style scenes with physical environments often have signage
  const textHeavyStyles = ['product', 'premium', 'educational'];
  if (scene.visualStyle && textHeavyStyles.includes(scene.visualStyle)) {
    // Check prompt for text indicators
    const prompt = (scene.imagePrompt ?? scene.videoPrompt ?? scene.prompt ?? '').toLowerCase();
    const textIndicators = [
      'sign', 'label', 'logo', 'text', 'clinic', 'store', 'brand', 'banner',
      'poster', 'package', 'bottle', 'container', 'packaging', 'ingredient',
      'menu', 'price', 'title', 'headline',
    ];
    return textIndicators.some(indicator => prompt.includes(indicator));
  }

  return false;
}

/**
 * Returns the recommended Recraft model for a given use case.
 */
export function getRecraftModel(params: {
  needsBrandedText: boolean;
  isPremium: boolean;
}): 'recraftv4' | 'recraftv4_pro' | 'recraftv3' {
  if (params.needsBrandedText) return 'recraftv3';       // text_layout requires V3
  if (params.isPremium) return 'recraftv4_pro';          // 4MP for hero scenes
  return 'recraftv4';                                     // Default: V4 quality
}
```

---

## Task 4: Update Visual Style Config — Image Providers

Open `shared/visual-style-config.ts`. Update `preferredImageProviders`:

```typescript
// Recraft V4 for general photorealistic scenes
// Recraft V3 (text) for scenes requiring brand text accuracy  
// Nano Banana 2 for web-grounded, brand-reference-heavy scenes
// Flux as fallback

hero: {
  preferredImageProviders: ['recraft-v4-pro', 'nano-banana-2', 'flux'],
  // Hero scenes: premium quality + web search grounding
}

lifestyle: {
  preferredImageProviders: ['nano-banana-2', 'recraft-v4', 'flux'],
  // Lifestyle: NB2 first for web-grounded product accuracy
}

product: {
  preferredImageProviders: ['recraft-v3-text', 'recraft-v4', 'nano-banana-2', 'flux'],
  // Product: text-accurate first (labels), then V4 for photorealism
}

educational: {
  preferredImageProviders: ['recraft-v3-text', 'recraft-v4', 'nano-banana-2', 'flux'],
  // Educational: text annotations need V3 text accuracy
}

social: {
  preferredImageProviders: ['nano-banana-2', 'recraft-v4', 'flux'],
  // Social: speed + web grounding
}

premium: {
  preferredImageProviders: ['recraft-v4-pro', 'nano-banana-2', 'flux'],
  // Premium: max resolution + web grounding
}
```

Note: `recraft-v3-text` and `recraft-v4-pro` are new provider identifiers.
Add them to your provider switch in the scene image generation service.

---

## Task 5: Wire Recraft into Scene Image Service

Find `server/services/scene-image.service.ts` (created in Phase 21B) or the equivalent
image generation routing function. Add Recraft as a provider path:

```typescript
import { recraftService } from './recraft.service';
import { requiresTextAccuracy, getRecraftModel } from '../utils/recraft-scene-policy';

// In the generateSceneImage method, add before the NB2 call:

const needsBrandedText = requiresTextAccuracy(scene);
const isPremium = (scene.visualStyle ?? project.visualStyle) === 'premium'
  || (scene.visualStyle ?? project.visualStyle) === 'hero';

// Route to Recraft if text accuracy is required OR style calls for it
const primaryProvider = getVisualStyleConfig(
  scene.visualStyle ?? project.visualStyle ?? 'lifestyle'
).preferredImageProviders[0];

const useRecraft = primaryProvider.startsWith('recraft') || needsBrandedText;

if (useRecraft) {
  console.log(`[SceneImage] Routing to Recraft | text=${needsBrandedText} premium=${isPremium}`);

  const model = getRecraftModel({ needsBrandedText, isPremium });
  const s3KeyPrefix = `projects/${project.id}/scenes/${sceneId}`;

  let recraftResult;

  if (needsBrandedText && scene.brandTextElements?.length) {
    // Use V3 text_layout for scenes with explicit branded text requirements
    recraftResult = await recraftService.generateWithBrandedText({
      sceneDescription: buildImagePrompt(scene),
      textElements: scene.brandTextElements,  // Set in Phase 23 scene classifier
      aspectRatio: '16:9',
      s3KeyPrefix,
    });
  } else {
    recraftResult = await recraftService.generateImage({
      prompt: buildImagePrompt(scene),
      model,
      aspectRatio: '16:9',
    }, s3KeyPrefix);
  }

  // Store result on scene
  await db.update(scenes).set({
    thumbnailUrl: recraftResult.imageUrl,
    seedImageUrl: recraftResult.imageUrl,
    imageGenerationModel: `recraft-${recraftResult.model}`,
  }).where(eq(scenes.id, sceneId));

  return {
    selectedImageUrl: recraftResult.imageUrl,
    allCandidateUrls: [recraftResult.imageUrl],
    qaScores: [1.0],
    model: `recraft-${recraftResult.model}`,
  };
}

// ... existing NB2 path continues below
```

---

## Task 6: Add `brandTextElements` to Scene Schema

Add a field to store explicit text elements for scenes requiring branded text:

```typescript
// shared/schema.ts — add to scenes table

export const scenes = pgTable('scenes', {
  // ... existing fields ...

  // Explicit text elements for Recraft text_layout (V3 only)
  // Set by the scene type classifier (Phase 23) or by user input
  brandTextElements: jsonb('brand_text_elements').$type<Array<{
    text: string;    // Exact text to render
    x: number;       // 0.0–1.0 horizontal position
    y: number;       // 0.0–1.0 vertical position
    width?: number;  // 0.0–1.0 text box width
  }>>(),
});
```

Run migration:
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## Task 7: Export from Services Index

Update `server/services/index.ts`:

```typescript
export { recraftService, RecraftService } from './recraft.service';
```

---

## Verification

### Test 1: V4 general scene

```typescript
import { recraftService } from './server/services/recraft.service';

const result = await recraftService.generateImage({
  prompt: 'A warm, sunlit modern kitchen with marble countertops, fresh vegetables in a wooden bowl, and natural light coming through large windows. A wellness product bottle sits on the counter.',
  model: 'recraftv4',
  aspectRatio: '16:9',
}, 'test/scenes');

console.log('V4 result:', result.imageUrl);
// ✓ Should be a 1344×768 photorealistic kitchen scene
// ✓ URL should be an S3 URL (not recraft.ai URL)
```

### Test 2: V3 with branded text placement

```typescript
const result = await recraftService.generateWithBrandedText({
  sceneDescription: 'A rustic wooden barn-style building with a porch, rolling green hills in the background, warm afternoon light',
  textElements: [
    { text: 'ORIGIN HOLISTIC CLINIC', x: 0.08, y: 0.35, width: 0.28 },
    { text: 'PINE HILL FARM', x: 0.08, y: 0.42, width: 0.20 },
  ],
  style: 'Photorealism',
  aspectRatio: '16:9',
  s3KeyPrefix: 'test/branded-text',
});

console.log('Branded text result:', result.imageUrl);
// ✓ "ORIGIN HOLISTIC CLINIC" should be readable on a sign
// ✓ "PINE HILL FARM" should appear below it, also readable
// ✓ Overall scene should be photorealistic
```

### Test 3: Rate limit awareness

```typescript
// Generate 6 images concurrently (well under 100/min, but testing rate handling)
const results = await Promise.all([
  recraftService.generateImage({ prompt: 'test 1', model: 'recraftv4', aspectRatio: '16:9' }, 'test/1'),
  recraftService.generateImage({ prompt: 'test 2', model: 'recraftv4', aspectRatio: '16:9' }, 'test/2'),
  recraftService.generateImage({ prompt: 'test 3', model: 'recraftv4', aspectRatio: '16:9' }, 'test/3'),
]);
// All 3 should complete without rate limit errors
```

---

## Key Facts for the Agent

These are confirmed from the live Recraft documentation:

- Default model when no `model` param is passed: `recraftv4`
- V4 supports: `recraftv4`, `recraftv4_pro`, `recraftv4_vector`, `recraftv4_pro_vector`
- V4 does NOT support: `style` parameter, `style_id`, `text_layout`, `negative_prompt`
- V3 supports: all of the above
- `text_layout` allows exact text rendering at pixel coordinates — V3 ONLY
- V4 16:9 output: `1344×768` pixels
- V4 Pro 16:9 output: `2688×1536` pixels
- V3 16:9 output: `1820×1024` pixels
- Recraft URLs expire in ~24 hours — S3 copy is mandatory, not optional
- Rate limits: 100 images/minute, 5 requests/second
- The API is OpenAI-compatible (`base_url: https://external.api.recraft.ai/v1`)

---

## Success Criteria

- [ ] `RECRAFT_API_KEY` added to Replit Secrets
- [ ] `recraftService.generateImage()` returns an S3 URL (not a recraft.ai URL)
- [ ] V4 generation produces 1344×768 photorealistic scene
- [ ] V3 `generateWithBrandedText()` renders "ORIGIN HOLISTIC CLINIC" as readable sign text
- [ ] S3 copy runs immediately — no Recraft URLs stored in the database
- [ ] `requiresTextAccuracy()` returns `true` for scenes with sign/label/clinic keywords
- [ ] Visual style config updated with `recraft-v4`, `recraft-v3-text`, `recraft-v4-pro` providers
- [ ] `brand_text_elements` column added to scenes table
- [ ] No TypeScript errors

---

## Next Phase

Phase 22 is independent — it can complete before, during, or after Phase 20A.

Once done, it unblocks:
- Phase 23A (scene type classifier) — Recraft routing is the first routing target
- Phase 24A (chapter title template) — background images for title cards use Recraft V4
- Phase 25 (scientific overlay library) — base scene images use Recraft V3 text for annotations
