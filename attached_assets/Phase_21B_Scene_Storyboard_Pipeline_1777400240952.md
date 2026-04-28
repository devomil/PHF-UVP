# Phase 21B: Scene Storyboard Pipeline

## Priority: HIGH
## Dependency: Phase 21A must be complete
## Estimated Time: 4-5 hours

---

## What This Phase Builds

The full image-to-storyboard-to-video pipeline using Nano Banana 2:

1. **Scene image generation:** NB2 generates 3 candidate images per scene (with brand references and web search grounding)
2. **QA selection:** Claude Vision evaluates candidates and selects the best-aligned image
3. **Storyboard display:** Selected image appears as scene thumbnail in the project storyboard UI
4. **I2V handoff:** Selected image is stored as `seedImageUrl` and passed to Seedance 2 I2V generation

---

## Pipeline Overview

```
Scene prompt + brand references
        ↓
Nano Banana 2 × 3 candidates
        ↓
Claude Vision QA gate
(scores each candidate: brand alignment, composition, product accuracy)
        ↓
Best candidate stored as thumbnailUrl + seedImageUrl
        ↓
Storyboard UI updates with thumbnail
        ↓
[User confirms or regenerates]
        ↓
Seedance 2 I2V generation (seedImageUrl → video)
```

---

## Task 1: Scene Image Generation Service

Create `server/services/scene-image.service.ts`:

```typescript
// server/services/scene-image.service.ts

import { nanoBanana2Service } from './nano-banana2.service';
import { claudeVisionQAService } from './claude-vision-qa.service'; // Existing from Phase 10
import { shouldEnableWebSearch } from '../utils/image-generation-policy';
import { db } from '../db';
import { scenes, brandAssets } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET } from '../config/aws';

const CANDIDATE_COUNT = 3;

export interface SceneImageResult {
  selectedImageUrl: string;
  allCandidateUrls: string[];
  qaScores: number[];
  model: string;
}

export class SceneImageService {

  // ─── Generate + Select Best Image for a Scene ─────────────────────────────

  async generateSceneImage(
    sceneId: number,
    options?: { forceRegenerate?: boolean }
  ): Promise<SceneImageResult> {
    const scene = await this.getSceneWithProject(sceneId);

    // If scene already has a thumbnail and not forced, skip
    if (scene.thumbnailUrl && !options?.forceRegenerate) {
      console.log(`[SceneImage] Scene ${sceneId} already has thumbnail, skipping`);
      return {
        selectedImageUrl: scene.thumbnailUrl,
        allCandidateUrls: [scene.thumbnailUrl],
        qaScores: [1.0],
        model: scene.imageGenerationModel ?? 'existing',
      };
    }

    const project = scene.project;
    const visualStyle = scene.visualStyle ?? project.visualStyle ?? 'lifestyle';
    const contentType = scene.contentType ?? 'lifestyle';

    // Build the image prompt from the scene's video prompt
    // Image prompt is descriptive (what it looks like)
    // NOT the motion/camera prompt used for video generation
    const imagePrompt = this.buildImagePrompt(scene);

    // Collect brand reference URLs from scene's attached brand references
    const brandReferenceUrls = await this.getBrandReferenceUrls(sceneId, project.id);

    const enableWebSearch = shouldEnableWebSearch(visualStyle, contentType);

    console.log(`[SceneImage] Generating ${CANDIDATE_COUNT} candidates for scene ${sceneId}`);
    console.log(`[SceneImage] Visual style: ${visualStyle} | Content type: ${contentType}`);
    console.log(`[SceneImage] Web search: ${enableWebSearch} | Brand refs: ${brandReferenceUrls.length}`);

    // Step 1: Generate candidates
    const candidates = await nanoBanana2Service.generateCandidates(
      {
        prompt: imagePrompt,
        aspectRatio: this.getAspectRatio(project.aspectRatio),
        resolution: '2K',
        format: 'jpeg',
        referenceImages: brandReferenceUrls,
        enableWebSearch,
      },
      CANDIDATE_COUNT
    );

    const candidateUrls = candidates.map(c => c.imageUrl);

    // Step 2: QA gate — score each candidate
    let selectedUrl: string;
    let qaScores: number[] = [];

    if (candidateUrls.length === 1) {
      // Only one succeeded — use it directly
      selectedUrl = candidateUrls[0];
      qaScores = [1.0];
    } else {
      // Score candidates via Claude Vision
      qaScores = await this.scoreCandidates(candidateUrls, {
        scenePrompt: imagePrompt,
        brandName: 'Pine Hill Farm',
        visualStyle,
      });

      const bestIndex = qaScores.indexOf(Math.max(...qaScores));
      selectedUrl = candidateUrls[bestIndex];

      console.log(`[SceneImage] QA scores: [${qaScores.map(s => s.toFixed(2)).join(', ')}]`);
      console.log(`[SceneImage] Selected candidate ${bestIndex + 1} (score: ${qaScores[bestIndex].toFixed(2)})`);
    }

    // Step 3: Upload selected image to S3 (for long-term storage)
    // PiAPI generated URLs expire — copy to our S3 bucket
    const s3Key = `projects/${project.id}/scenes/${sceneId}/thumbnail.jpg`;
    const permanentUrl = await this.copyImageToS3(selectedUrl, s3Key);

    // Step 4: Update scene record
    await db.update(scenes).set({
      thumbnailUrl: permanentUrl,
      seedImageUrl: permanentUrl,
      imageGenerationModel: 'nano-banana-2',
      imageGenerationPrompt: imagePrompt,
    }).where(eq(scenes.id, sceneId));

    console.log(`[SceneImage] Scene ${sceneId} image set: ${permanentUrl.substring(0, 80)}`);

    return {
      selectedImageUrl: permanentUrl,
      allCandidateUrls: candidateUrls,
      qaScores,
      model: 'nano-banana-2',
    };
  }

  // ─── Score Candidates via Claude Vision ───────────────────────────────────

  private async scoreCandidates(
    imageUrls: string[],
    context: { scenePrompt: string; brandName: string; visualStyle: string }
  ): Promise<number[]> {
    // Use existing Claude Vision QA service from Phase 10
    // If claudeVisionQAService doesn't support batch scoring,
    // score each image individually and collect results

    const scoringPrompt = `
You are evaluating candidate images for a ${context.brandName} marketing video.
Visual style: ${context.visualStyle}
Scene intent: ${context.scenePrompt}

Score this image on a scale of 0.0 to 1.0 based on:
- Brand alignment and professionalism (0-0.4)
- Composition and visual quality (0-0.3)
- Relevance to scene intent (0-0.3)

Respond with ONLY a decimal number between 0.0 and 1.0. No explanation.
`;

    const scores: number[] = [];

    for (const imageUrl of imageUrls) {
      try {
        // This assumes claudeVisionQAService has a scoreImage method
        // Adapt to match the actual Phase 10 implementation
        const score = await this.scoreImageWithClaude(imageUrl, scoringPrompt);
        scores.push(score);
      } catch (err) {
        console.warn(`[SceneImage] Claude Vision scoring failed for candidate:`, err);
        scores.push(0.5); // Neutral score on failure
      }
    }

    return scores;
  }

  private async scoreImageWithClaude(imageUrl: string, prompt: string): Promise<number> {
    // Fetch the image as base64 for Claude Vision
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) return 0.5;

    const buffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = 'image/jpeg';

    // Call Claude Vision (adapt to your actual Anthropic client setup)
    const { Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',  // Haiku is sufficient for scoring
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const scoreText = response.content[0]?.type === 'text'
      ? response.content[0].text.trim()
      : '0.5';

    const score = parseFloat(scoreText);
    return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
  }

  // ─── Image Prompt Builder ─────────────────────────────────────────────────

  private buildImagePrompt(scene: any): string {
    // The image prompt is descriptive, not motion-based
    // Strip any motion/camera language from the video prompt

    const base = scene.imagePrompt     // Use dedicated image prompt if it exists
      ?? scene.videoPrompt             // Fall back to video prompt
      ?? scene.prompt                  // Fall back to raw prompt
      ?? '';

    // Clean motion language that is irrelevant for still image generation
    const motionWords = [
      'camera push', 'slow zoom', 'tracking shot', 'pan left', 'pan right',
      'dolly', 'tilt up', 'tilt down', 'handheld', 'crane shot',
      'motion blur', 'time lapse', 'speed ramp',
    ];

    let cleanPrompt = base;
    for (const word of motionWords) {
      cleanPrompt = cleanPrompt.replace(new RegExp(word, 'gi'), '');
    }

    // Clean up double spaces and trailing punctuation
    cleanPrompt = cleanPrompt.replace(/\s+/g, ' ').trim();
    cleanPrompt = cleanPrompt.replace(/[,\s]+$/, '');

    return cleanPrompt || 'Professional wellness lifestyle scene with natural lighting';
  }

  // ─── Brand Reference URL Collection ──────────────────────────────────────

  private async getBrandReferenceUrls(sceneId: number, projectId: number): Promise<string[]> {
    const scene = await db.query.scenes.findFirst({
      where: eq(scenes.id, sceneId),
    });

    // Use brand references attached in Phase 20C if available
    if (scene?.brandReferences && scene.brandReferences.length > 0) {
      return scene.brandReferences.map((r: any) => r.assetUrl).filter(Boolean);
    }

    // Fall back to project's primary brand assets
    const primaryAssets = await db.query.brandAssets.findMany({
      where: eq(brandAssets.projectId ?? 0, projectId),
      limit: 4,
    });

    return primaryAssets.map(a => a.fileUrl).filter(Boolean);
  }

  // ─── Copy Image to S3 ────────────────────────────────────────────────────

  private async copyImageToS3(sourceUrl: string, s3Key: string): Promise<string> {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      console.warn(`[SceneImage] Could not fetch image for S3 copy: ${response.status}`);
      return sourceUrl; // Return original URL as fallback
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

  // ─── Aspect Ratio Mapping ─────────────────────────────────────────────────

  private getAspectRatio(projectAspectRatio?: string): '16:9' | '9:16' | '1:1' {
    if (projectAspectRatio === '9:16') return '9:16';
    if (projectAspectRatio === '1:1') return '1:1';
    return '16:9'; // Default: landscape
  }

  // ─── Helper: Get Scene with Project ──────────────────────────────────────

  private async getSceneWithProject(sceneId: number) {
    // Adjust query to match your actual schema + relations
    const scene = await db.query.scenes.findFirst({
      where: eq(scenes.id, sceneId),
      with: { project: true },
    });

    if (!scene) throw new Error(`Scene ${sceneId} not found`);
    return scene;
  }
}

export const sceneImageService = new SceneImageService();
```

---

## Task 2: Generate Images for All Scenes in a Project

Add a batch generation method to `SceneImageService`:

```typescript
// Add to SceneImageService class:

async generateAllSceneImages(
  projectId: number,
  onProgress?: (sceneId: number, status: 'generating' | 'complete' | 'failed') => void
): Promise<{ sceneId: number; result: SceneImageResult | null }[]> {
  const projectScenes = await db.query.scenes.findMany({
    where: eq(scenes.projectId, projectId),
    orderBy: [asc(scenes.order)],
  });

  console.log(`[SceneImage] Generating images for ${projectScenes.length} scenes in project ${projectId}`);

  // Generate images in parallel (unlike video generation, images are fast and cheap)
  const results = await Promise.all(
    projectScenes.map(async (scene) => {
      onProgress?.(scene.id, 'generating');
      try {
        const result = await this.generateSceneImage(scene.id);
        onProgress?.(scene.id, 'complete');
        return { sceneId: scene.id, result };
      } catch (err: any) {
        console.error(`[SceneImage] Scene ${scene.id} failed:`, err.message);
        onProgress?.(scene.id, 'failed');
        return { sceneId: scene.id, result: null };
      }
    })
  );

  const successCount = results.filter(r => r.result !== null).length;
  console.log(`[SceneImage] Batch complete: ${successCount}/${projectScenes.length} scenes`);

  return results;
}
```

---

## Task 3: API Route for Scene Image Generation

Create `server/routes/scene-image.routes.ts`:

```typescript
// server/routes/scene-image.routes.ts

import { Router } from 'express';
import { sceneImageService } from '../services/scene-image.service';

export const sceneImageRouter = Router();

// POST /api/scenes/:sceneId/generate-image
// Generate (or regenerate) the thumbnail/seed image for a single scene
sceneImageRouter.post('/:sceneId/generate-image', async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const sceneId = parseInt(req.params.sceneId, 10);
  if (isNaN(sceneId)) return res.status(400).json({ error: 'Invalid scene ID' });

  const forceRegenerate = req.body.force === true;

  try {
    const result = await sceneImageService.generateSceneImage(sceneId, { forceRegenerate });
    res.json({
      success: true,
      imageUrl: result.selectedImageUrl,
      model: result.model,
      candidateCount: result.allCandidateUrls.length,
    });
  } catch (err: any) {
    console.error(`[SceneImage] Route error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/generate-images
// Generate images for all scenes in a project
sceneImageRouter.post('/projects/:projectId/generate-images', async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  // Fire and forget — return immediately, UI polls for progress
  sceneImageService.generateAllSceneImages(projectId).catch(err => {
    console.error(`[SceneImage] Batch generation error:`, err.message);
  });

  res.json({ success: true, message: 'Image generation started' });
});
```

Register in `server/index.ts` or routes index:
```typescript
import { sceneImageRouter } from './routes/scene-image.routes';
app.use('/api/scenes', sceneImageRouter);
```

---

## Task 4: Storyboard UI — Thumbnail Display

Update the scene storyboard component to display generated thumbnails. Find the existing scene card/storyboard component and update it:

```tsx
// In your storyboard scene card component:

interface SceneCardProps {
  scene: Scene;
  onRegenerateImage: (sceneId: number) => void;
}

export function SceneCard({ scene, onRegenerateImage }: SceneCardProps) {
  const hasImage = !!scene.thumbnailUrl;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-muted">
        {hasImage ? (
          <img
            src={scene.thumbnailUrl}
            alt={`Scene ${scene.order} thumbnail`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground">No image yet</p>
          </div>
        )}

        {/* Regenerate button overlay */}
        <button
          onClick={() => onRegenerateImage(scene.id)}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100
                     text-xs px-2 py-1 rounded bg-black/60 text-white transition-opacity"
        >
          Regenerate
        </button>

        {/* NB2 badge */}
        {scene.imageGenerationModel === 'nano-banana-2' && (
          <span className="absolute bottom-2 left-2 text-xs px-1.5 py-0.5 rounded
                           bg-black/60 text-white">
            NB2
          </span>
        )}
      </div>

      {/* Scene info */}
      <div className="p-3">
        <p className="text-xs font-medium truncate">{scene.sceneType}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {scene.duration}s · {scene.visualStyle ?? 'default'}
        </p>
      </div>
    </div>
  );
}
```

---

## Task 5: Wire Seed Image into I2V Generation

In the scene video generation flow, use the NB2-generated `seedImageUrl` as the I2V starting frame when available:

```typescript
// In scene video generation (the method that calls Seedance 2):

async function generateSceneVideo(scene: Scene, project: Project): Promise<string> {
  // Use seed image if available (generated by NB2 in Phase 21B)
  const seedImageUrl = scene.seedImageUrl ?? null;

  if (seedImageUrl) {
    console.log(`[SceneGen] Using NB2 seed image for I2V: ${seedImageUrl.substring(0, 60)}`);

    return await piapiVideoService.generateSeedance2Video({
      prompt: buildI2VMotionPrompt(scene),  // Motion-only prompt for I2V
      imageUrl: seedImageUrl,               // NB2 image as visual starting point
      duration: scene.duration ?? 8,
      model: 'seedance-2',
    }).then(r => r.videoUrl);
  }

  // No seed image: fall back to T2V
  console.log(`[SceneGen] No seed image — using T2V`);
  return await piapiVideoService.generateSeedance2Video({
    prompt: scene.videoPrompt ?? scene.prompt,
    duration: scene.duration ?? 8,
    model: 'seedance-2',
  }).then(r => r.videoUrl);
}

// Motion-only prompt for I2V (camera and movement, not description)
function buildI2VMotionPrompt(scene: any): string {
  // The seed image already provides visual context
  // I2V prompt should ONLY describe motion
  const sceneTypeMotion: Record<string, string> = {
    'hook': 'Gentle camera pull back, soft focus, natural movement',
    'problem': 'Slow camera drift, contemplative stillness, subtle motion',
    'solution': 'Smooth camera push toward subject, warm reveal, gentle movement',
    'benefit': 'Steady camera, subject moves naturally, authentic motion',
    'cta': 'Slow zoom in, confident stillness, product in focus',
  };

  return sceneTypeMotion[scene.sceneType ?? 'standard']
    ?? 'Natural gentle camera movement, authentic motion';
}
```

---

## Success Criteria

- [ ] `sceneImageService.generateSceneImage` generates 3 candidates, scores them, stores the best
- [ ] `generateAllSceneImages` processes all project scenes in parallel
- [ ] Claude Vision QA selects the highest-scoring candidate
- [ ] Selected image is copied to S3 (permanent URL, not expiring PiAPI URL)
- [ ] `thumbnailUrl` and `seedImageUrl` updated on scene after generation
- [ ] Storyboard UI shows NB2-generated thumbnails with NB2 badge
- [ ] "Regenerate" button triggers fresh image generation for a scene
- [ ] Video generation uses `seedImageUrl` as I2V start frame when available
- [ ] T2V fallback works when no seed image exists
- [ ] No TypeScript errors

---

## Phase 21 Complete

With 21A + 21B done, the full image-to-video pipeline is:

```
NeuralCut scene prompt + Pine Hill Farm brand assets
        ↓
Nano Banana 2 × 3 candidates (web-grounded, brand-referenced, 2K)
        ↓
Claude Vision QA selects best (brand alignment + composition + relevance)
        ↓
Best image → S3 (permanent) → scene thumbnailUrl + seedImageUrl
        ↓
Storyboard shows preview
        ↓
Seedance 2 I2V: seed image → cinematic video (8-12s, watermark-free)
```

Pine Hill Farm's CMO now sees branded, product-accurate storyboard frames
before video generation begins — and each generated video starts from a 
precisely controlled, brand-aligned visual frame.
