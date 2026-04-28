# Phase 20C: omni_reference Brand Anchoring

## Priority: HIGH
## Dependency: Phase 20A must be complete
## Estimated Time: 3-4 hours

---

## What This Phase Builds

Brand product images as visual anchors in video generation. Instead of describing the Pine Hill Farm product in text ("a woman holding an organic supplement bottle"), the actual product image is passed directly to Seedance 2 as a visual reference using the omni_reference generation mode.

The `@image1` tag in the prompt tells the model exactly where that reference should appear. The model locks the product's appearance — label, color, form factor — while generating the surrounding scene naturally.

---

## How omni_reference Works in the Prompt

The `@image1`, `@image2` tags are embedded directly in the prompt text. They are NOT separate parameters — they are inline references that the model parses from the prompt.

```
✅ CORRECT:
"A sophisticated middle-aged woman holding @image1 in a cozy sunlit kitchen. 
She smiles warmly as she sets it on the counter."

❌ WRONG:
"A sophisticated middle-aged woman holding a Pine Hill Farm supplement bottle 
in a cozy sunlit kitchen."   ← No reference, model guesses the product appearance

❌ WRONG:
// Passing product image separately without @tag in prompt
// The model doesn't know where to apply the reference
```

---

## Task 1: Add Reference Fields to Scene Schema

Add brand reference tracking to the scenes table:

```typescript
// shared/schema.ts — add to scenes table

export const scenes = pgTable('scenes', {
  // ... existing fields ...

  // Brand reference images for omni_reference generation
  // Stored as JSON array: [{ assetId: number, assetUrl: string, tag: string }]
  brandReferences: jsonb('brand_references').$type<BrandReferenceInput[]>(),

  // Whether omni_reference mode was used for this scene
  useOmniReference: boolean('use_omni_reference').default(false),
});

export interface BrandReferenceInput {
  assetId: number;       // FK to brandAssets table
  assetUrl: string;      // Public S3 URL
  tag: string;           // "image1", "image2", etc.
  label?: string;        // "Product bottle", "Brand logo" (display only)
}
```

Run migration:
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## Task 2: Prompt Builder for omni_reference

Add a helper that constructs the @tag-injected prompt:

```typescript
// server/utils/omni-reference-prompt.ts

import { BrandReferenceInput } from '@shared/schema';

/**
 * Prepare a prompt and reference list for Seedance 2 omni_reference mode.
 *
 * If the scene prompt already contains @image1 tags (placed by the user or
 * script generator), leave them in place.
 *
 * If the prompt does NOT contain @image1 tags but brand references exist,
 * automatically inject a reference to the primary product at the point where
 * a product noun appears, or append it to the end.
 */
export function buildOmniReferencePrompt(params: {
  basePrompt: string;
  references: BrandReferenceInput[];
}): { prompt: string; imageList: string[] } {
  const { basePrompt, references } = params;

  if (references.length === 0) {
    return { prompt: basePrompt, imageList: [] };
  }

  const imageList = references.map(r => r.assetUrl);

  // Check if user already placed @image tags
  if (basePrompt.includes('@image1')) {
    // Prompt is already tagged — use as-is
    console.log('[OmniRef] Using pre-tagged prompt');
    return { prompt: basePrompt, imageList };
  }

  // Auto-inject: replace the first product noun with @image1
  // Common product nouns in Pine Hill Farm context:
  const productNouns = [
    'supplement bottle', 'bottle', 'supplement',
    'product', 'package', 'container', 'jar',
  ];

  let modifiedPrompt = basePrompt;
  let injected = false;

  for (const noun of productNouns) {
    const regex = new RegExp(`\\b${noun}\\b`, 'i');
    if (regex.test(modifiedPrompt)) {
      modifiedPrompt = modifiedPrompt.replace(regex, `@image1`);
      injected = true;
      console.log(`[OmniRef] Injected @image1 at noun: "${noun}"`);
      break;
    }
  }

  if (!injected) {
    // No product noun found — append reference note
    modifiedPrompt = `${basePrompt.trimEnd()}. Product: @image1.`;
    console.log('[OmniRef] No product noun found — appended @image1');
  }

  // Add additional references if present
  for (let i = 1; i < references.length; i++) {
    const tag = `@image${i + 1}`;
    if (!modifiedPrompt.includes(tag)) {
      // Additional references don't auto-inject — user must place them
      console.log(`[OmniRef] Reference ${i + 1} provided but @image${i + 1} not in prompt — reference will be available but not explicitly placed`);
    }
  }

  return { prompt: modifiedPrompt, imageList };
}
```

---

## Task 3: Seedance 2 omni_reference Payload Builder

In `piapi-video-service.ts`, add the omni_reference generation method:

```typescript
/**
 * Generate a video scene using Seedance 2 omni_reference mode.
 * Brand assets are passed as image references — the model locks their
 * visual appearance while generating the surrounding scene.
 */
async generateSeedance2WithBrandReference(options: {
  prompt: string;
  references: BrandReferenceInput[];
  duration: number;
  aspectRatio?: string;
  model?: 'seedance-2' | 'seedance-2-fast';
}): Promise<VideoGenerationResult> {
  if (options.references.length === 0) {
    throw new Error('generateSeedance2WithBrandReference requires at least one reference');
  }

  const { prompt: taggedPrompt, imageList } = buildOmniReferencePrompt({
    basePrompt: options.prompt,
    references: options.references,
  });

  const taskType = options.model === 'seedance-2-fast' ? 'seedance-2-fast' : 'seedance-2';
  const clampedDuration = Math.max(4, Math.min(15, Math.round(options.duration)));

  console.log(`[PiAPI:Seedance2] omni_reference | ${options.references.length} refs | duration=${clampedDuration}s`);
  console.log(`[PiAPI:Seedance2] Tagged prompt: ${taggedPrompt.substring(0, 120)}`);

  // NOTE: When using omni_reference, the aspect ratio follows the
  // reference image's dimensions. Ensure brand assets are stored at
  // the correct aspect ratio (16:9 for landscape, 9:16 for vertical).

  const requestBody = {
    model: 'seedance',
    task_type: taskType,
    input: {
      prompt: taggedPrompt,
      generation_mode: 'omni_reference',
      // VERIFY: PiAPI may use 'image_list', 'images', or 'references' — check docs
      image_list: imageList,
      duration: clampedDuration,
      aspect_ratio: options.aspectRatio ?? '16:9',
      generate_audio: false,
    },
  };

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
    throw new Error(`Seedance2 omni_reference error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error('Seedance2 omni_reference: No task_id in response');

  return await this.pollSeedance2Task(taskId);
}
```

---

## Task 4: Wire omni_reference into Scene Generation

In the main scene generation flow, check for brand references and route accordingly:

```typescript
// In your scene video generation method:

async function generateSceneVideo(scene: Scene, project: Project): Promise<string> {
  const style = getVisualStyleConfig(scene.visualStyle ?? project.visualStyle);
  const provider = style.preferredVideoProviders[0];
  const isSeedance2 = provider.startsWith('seedance-2');

  // Use omni_reference if:
  // 1. Provider is Seedance 2
  // 2. Scene has brand references attached
  if (isSeedance2 && scene.brandReferences && scene.brandReferences.length > 0) {
    console.log(`[SceneGen] Scene ${scene.id}: omni_reference mode (${scene.brandReferences.length} refs)`);

    return await piapiVideoService.generateSeedance2WithBrandReference({
      prompt: scene.videoPrompt ?? scene.prompt,
      references: scene.brandReferences,
      duration: scene.duration ?? 8,
      model: provider as 'seedance-2' | 'seedance-2-fast',
    }).then(r => r.videoUrl);
  }

  // Standard generation path (no brand references)
  return await piapiVideoService.generateSeedance2Video({
    prompt: scene.videoPrompt ?? scene.prompt,
    duration: scene.duration ?? 8,
    model: provider,
  }).then(r => r.videoUrl);
}
```

---

## Task 5: Scene Editor — Brand Reference Panel

Add a brand reference attachment UI to the scene editor. This panel lets users attach brand assets to individual scenes.

```tsx
// client/src/components/scene/BrandReferencePanel.tsx

import { useState, useEffect } from 'react';

interface BrandAsset {
  id: number;
  name: string;
  type: string;
  url: string;
  thumbnailUrl?: string;
}

interface BrandReferencePanelProps {
  sceneId: number;
  currentReferences: BrandReferenceInput[];
  onReferencesChange: (refs: BrandReferenceInput[]) => void;
}

export function BrandReferencePanel({
  sceneId,
  currentReferences,
  onReferencesChange,
}: BrandReferencePanelProps) {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/brand-assets?type=product_image')
      .then(r => r.json())
      .then(setAssets)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const addReference = (asset: BrandAsset) => {
    if (currentReferences.length >= 9) return; // Seedance 2 max: 9 image references
    if (currentReferences.some(r => r.assetId === asset.id)) return;

    const tag = `image${currentReferences.length + 1}`;
    onReferencesChange([
      ...currentReferences,
      { assetId: asset.id, assetUrl: asset.url, tag, label: asset.name },
    ]);
  };

  const removeReference = (assetId: number) => {
    const updated = currentReferences
      .filter(r => r.assetId !== assetId)
      .map((r, i) => ({ ...r, tag: `image${i + 1}` })); // Re-number tags
    onReferencesChange(updated);
  };

  if (loading) return <div className="h-20 animate-pulse rounded bg-muted" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Brand references
        </p>
        <p className="text-xs text-muted-foreground">
          {currentReferences.length}/9
        </p>
      </div>

      {/* Active references */}
      {currentReferences.length > 0 && (
        <div className="space-y-1.5">
          {currentReferences.map((ref) => (
            <div
              key={ref.assetId}
              className="flex items-center gap-2 p-2 rounded border border-border bg-muted/30"
            >
              <img
                src={ref.assetUrl}
                alt={ref.label}
                className="w-8 h-8 rounded object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{ref.label}</p>
                <p className="text-xs text-muted-foreground">
                  Used as <code className="font-mono">@{ref.tag}</code> in prompt
                </p>
              </div>
              <button
                onClick={() => removeReference(ref.assetId)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Asset picker */}
      {currentReferences.length < 9 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Add product image as visual anchor:
          </p>
          <div className="grid grid-cols-4 gap-2">
            {assets
              .filter(a => !currentReferences.some(r => r.assetId === a.id))
              .slice(0, 8)
              .map(asset => (
                <button
                  key={asset.id}
                  onClick={() => addReference(asset)}
                  className="aspect-square rounded border border-border hover:border-ring overflow-hidden"
                  title={asset.name}
                >
                  <img
                    src={asset.thumbnailUrl ?? asset.url}
                    alt={asset.name}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
          </div>
        </div>
      )}

      {currentReferences.length > 0 && (
        <p className="text-xs text-muted-foreground">
          The model will lock the product's appearance. 
          Use <code className="font-mono">@image1</code> in the scene prompt to place it.
        </p>
      )}
    </div>
  );
}
```

---

## Task 6: Auto-Apply for Product Showcase Scenes

For projects using `product` visual style, auto-attach the primary brand product image to all product-type scenes:

```typescript
// server/services/scene-setup.service.ts (or wherever scenes are initialized)

async function autoApplyBrandReferences(
  projectId: number,
  scenes: Scene[]
): Promise<void> {
  const project = await getProject(projectId);
  const style = getVisualStyleConfig(project.visualStyle);

  // Auto-apply for product showcase style
  if (style.id !== 'product') return;

  // Find the primary brand product image
  const primaryProduct = await db.query.brandAssets.findFirst({
    where: and(
      eq(brandAssets.projectId, projectId),
      eq(brandAssets.assetType, 'product_image'),
      eq(brandAssets.isPrimary, true),
    ),
  });

  if (!primaryProduct?.fileUrl) return;

  // Apply to scenes where content type is 'product'
  for (const scene of scenes) {
    const contentType = scene.contentType;
    if (contentType === 'product' || contentType === 'solution') {
      if (!scene.brandReferences?.length) {
        await updateSceneBrandReferences(scene.id, [{
          assetId: primaryProduct.id,
          assetUrl: primaryProduct.fileUrl,
          tag: 'image1',
          label: primaryProduct.name ?? 'Product',
        }]);
        console.log(`[AutoRef] Applied product reference to scene ${scene.id}`);
      }
    }
  }
}
```

---

## Success Criteria

- [ ] `brand_references` JSONB column on scenes table
- [ ] `buildOmniReferencePrompt` correctly injects @image1 tags
- [ ] `generateSeedance2WithBrandReference` sends correct omni_reference payload
- [ ] Scene generation routes to omni_reference when brand references present
- [ ] BrandReferencePanel renders in scene editor, shows attached assets
- [ ] Assets are numbered @image1, @image2 in order
- [ ] Removing a reference re-numbers remaining tags correctly
- [ ] Auto-apply works for product style projects
- [ ] Product appears correctly in generated video (label readable, not distorted)
- [ ] No TypeScript errors

---

## Next Phase

Proceed to **Phase 20D: Duration Slider + Native Audio Controls** once omni_reference generation produces scenes with correctly-anchored product appearances.
