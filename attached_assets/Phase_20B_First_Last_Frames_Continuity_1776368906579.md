# Phase 20B: first_last_frames Scene Continuity

## Priority: HIGH
## Dependency: Phase 20A must be complete
## Estimated Time: 4-5 hours

---

## What This Phase Builds

"Seamless Transitions" — an opt-in project-level toggle that makes scenes visually continuous by passing each scene's last frame as the next scene's starting frame.

Without this, each AI scene generates independently with no visual awareness of adjacent scenes. Cuts between scenes look abrupt. With this enabled, the subject, lighting, and environment flow naturally from scene to scene.

---

## Architecture Decision: Sequential vs Parallel Generation

**This is a breaking change to the generation pipeline.**

Currently, scenes likely generate in parallel (all submitted simultaneously, results collected as they complete).

When "Seamless Transitions" is enabled, scenes MUST generate sequentially:

```
Scene 1 generates → extract last frame → Scene 2 generates (with Scene 1 last frame) → extract last frame → Scene 3...
```

This means:
- "Seamless Transitions" mode increases total generation time proportionally to scene count
- The UI must NOT show "all scenes submitting" — it must show per-scene progress
- A 6-scene video at 8s/scene takes ~6x longer than parallel generation

**The toggle must clearly communicate this tradeoff in the UI.**

---

## Task 1: Add Schema Field for Continuity Mode

In `shared/schema.ts` or wherever your project/scene schema lives, add:

```typescript
// In the videoProjects table OR a project_settings JSON field:

// Option A: Add column to videoProjects table
export const videoProjects = pgTable('video_projects', {
  // ... existing fields ...
  seamlessTransitions: boolean('seamless_transitions').default(false).notNull(),
});

// Option B: If project has a settings JSONB column, add to the settings type:
export interface ProjectSettings {
  // ... existing settings ...
  seamlessTransitions?: boolean;
}
```

Also add a per-scene field to store the extracted last frame URL:

```typescript
// In the scenes table (or scene settings JSONB):
export const scenes = pgTable('scenes', {
  // ... existing fields ...
  lastFrameUrl: text('last_frame_url'),   // S3 URL of extracted last frame
  firstFrameUrl: text('first_frame_url'), // S3 URL used as start frame (from previous scene)
});
```

Run migration:
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## Task 2: Frame Extraction Helper

NeuralCut already has ffmpeg available (used in Phase 19B for Canva frame extraction). If that utility exists at `server/utils/canva-frame-extractor.ts`, extract the shared logic into a reusable utility.

Create `server/utils/video-frame-extractor.ts`:

```typescript
// server/utils/video-frame-extractor.ts

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const execFileAsync = promisify(execFile);

/**
 * Extract the last frame from a video file at a given URL.
 * Downloads the video to a temp file, extracts the last frame, uploads to S3.
 *
 * @param videoUrl  Public URL of the source video
 * @param s3Key     Destination S3 key for the extracted frame
 * @returns         Public S3 URL of the extracted frame
 */
export async function extractLastFrame(
  videoUrl: string,
  s3Key: string
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nc-frame-'));
  const tmpVideo = path.join(tmpDir, 'source.mp4');
  const tmpFrame = path.join(tmpDir, 'last_frame.jpg');

  try {
    // Download the video
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Failed to download video: ${response.status}`);
    const buffer = await response.arrayBuffer();
    await fs.writeFile(tmpVideo, Buffer.from(buffer));

    // Get video duration
    const { stdout: probeOut } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      tmpVideo,
    ]);

    const probe = JSON.parse(probeOut);
    const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
    const duration = parseFloat(videoStream?.duration ?? '8');

    // Extract last frame (0.1s before end to avoid black frames on fade-out)
    const seekTime = Math.max(0, duration - 0.1).toFixed(3);

    await execFileAsync('ffmpeg', [
      '-ss', seekTime,
      '-i', tmpVideo,
      '-vframes', '1',
      '-vf', 'scale=1920:-1',
      '-q:v', '2',
      '-y',
      tmpFrame,
    ]);

    // Verify frame was extracted
    await fs.access(tmpFrame);

    // Upload to S3
    const s3Url = await uploadFrameToS3(tmpFrame, s3Key);

    console.log(`[FrameExtract] Last frame extracted: ${s3Url}`);
    return s3Url;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Upload a local JPEG frame to S3 with public-read ACL
 * (required for PiAPI to fetch it as a reference URL)
 */
async function uploadFrameToS3(localPath: string, s3Key: string): Promise<string> {
  // Import your existing S3 client and bucket name
  // Adjust the import path to match your actual S3 config location
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { s3Client, S3_BUCKET } = await import('../config/aws');

  const fileBuffer = await fs.readFile(localPath);

  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: 'image/jpeg',
    ACL: 'public-read',
  }));

  return `https://${S3_BUCKET}.s3.amazonaws.com/${s3Key}`;
}
```

---

## Task 3: Seedance 2 first_last_frames Payload Builder

In `piapi-video-service.ts`, add a dedicated method for the continuity generation mode:

```typescript
/**
 * Generate a video scene using Seedance 2 first_last_frames mode.
 * The generated video will start from firstFrameUrl and end at the
 * model's natural conclusion (or lastFrameUrl if provided).
 *
 * The first frame locks the starting visual state — subject position,
 * lighting, and environment carry over from the previous scene.
 */
async generateSeedance2WithContinuity(options: {
  prompt: string;
  firstFrameUrl: string;     // Last frame of the previous scene (public S3 URL)
  lastFrameUrl?: string;     // Optional: if you want to also lock the end state
  duration: number;
  aspectRatio?: string;
  model?: 'seedance-2' | 'seedance-2-fast';
}): Promise<VideoGenerationResult> {
  const taskType = options.model === 'seedance-2-fast' ? 'seedance-2-fast' : 'seedance-2';
  const clampedDuration = Math.max(4, Math.min(15, Math.round(options.duration)));

  console.log(`[PiAPI:Seedance2] first_last_frames | duration=${clampedDuration}s`);
  console.log(`[PiAPI:Seedance2] First frame: ${options.firstFrameUrl.substring(0, 80)}`);

  // NOTE: When first_last_frames mode is used, the aspect ratio is determined
  // by the reference image dimensions — the aspect_ratio parameter is ignored.
  // Ensure the extracted frame has the correct aspect ratio (16:9 = 1920x1080).

  const requestBody: any = {
    model: 'seedance',
    task_type: taskType,
    input: {
      prompt: options.prompt,
      generation_mode: 'first_last_frames',
      first_frame: options.firstFrameUrl,    // Verify field name against PiAPI docs
      duration: clampedDuration,
      generate_audio: false,
    },
  };

  // Only add last_frame if explicitly provided
  if (options.lastFrameUrl) {
    requestBody.input.last_frame = options.lastFrameUrl;
  }

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
    throw new Error(`Seedance2 first_last_frames error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error(`Seedance2: No task_id in response`);

  return await this.pollSeedance2Task(taskId);
}
```

---

## Task 4: Sequential Generation Orchestrator

In `server/services/universal-video-service.ts` (or wherever multi-scene generation is orchestrated), add the sequential continuity pipeline:

```typescript
import { extractLastFrame } from '../utils/video-frame-extractor';
import { piapiVideoService } from './piapi-video-service';

/**
 * Generate all scenes for a project in sequence, passing
 * each scene's last frame to the next scene as its start frame.
 *
 * Called when project.seamlessTransitions === true AND
 * all scenes use a Seedance 2 provider.
 */
async function generateScenesWithContinuity(
  projectId: number,
  scenes: Scene[],
  options: GenerationOptions,
  onSceneProgress: (sceneId: number, status: string) => void
): Promise<void> {
  let previousSceneLastFrameUrl: string | null = null;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const isFirstScene = i === 0;

    onSceneProgress(scene.id, 'generating');

    try {
      let videoResult: VideoGenerationResult;

      if (isFirstScene || !previousSceneLastFrameUrl) {
        // First scene: standard T2V generation (no continuity frame yet)
        console.log(`[Continuity] Scene ${i + 1}/${scenes.length}: standard T2V (no prior frame)`);
        videoResult = await piapiVideoService.generateSeedance2Video({
          ...options,
          prompt: scene.prompt,
          duration: scene.duration ?? 8,
          model: options.model ?? 'seedance-2',
        });
      } else {
        // Subsequent scenes: use last frame of previous scene as start frame
        console.log(`[Continuity] Scene ${i + 1}/${scenes.length}: first_last_frames mode`);
        console.log(`[Continuity] Anchoring to previous scene frame: ${previousSceneLastFrameUrl.substring(0, 60)}`);

        videoResult = await piapiVideoService.generateSeedance2WithContinuity({
          prompt: scene.prompt,
          firstFrameUrl: previousSceneLastFrameUrl,
          duration: scene.duration ?? 8,
          model: options.model ?? 'seedance-2',
        });
      }

      // Store the generated video URL
      await updateSceneVideo(scene.id, videoResult.videoUrl);
      onSceneProgress(scene.id, 'extracting_frame');

      // Extract last frame for the NEXT scene's start frame
      const s3Key = `projects/${projectId}/continuity/scene-${scene.id}-last-frame.jpg`;
      previousSceneLastFrameUrl = await extractLastFrame(videoResult.videoUrl, s3Key);

      // Store the frame URLs on the scene record
      await updateSceneFrameUrls(scene.id, {
        lastFrameUrl: previousSceneLastFrameUrl,
        firstFrameUrl: i > 0 ? scenes[i - 1].lastFrameUrl : null,
      });

      onSceneProgress(scene.id, 'complete');
      console.log(`[Continuity] Scene ${i + 1} complete. Frame extracted for Scene ${i + 2}.`);

    } catch (err: any) {
      console.error(`[Continuity] Scene ${i + 1} failed:`, err.message);
      onSceneProgress(scene.id, 'failed');

      // On failure: reset continuity chain (don't cascade bad frames)
      previousSceneLastFrameUrl = null;

      // Mark scene as failed but continue with remaining scenes
      await markSceneFailed(scene.id, err.message);
    }
  }
}
```

---

## Task 5: Project Generation Router

In the main generation handler, add the routing logic:

```typescript
// In the project generation entry point (route handler or service method):

const project = await getProject(projectId);
const scenes = await getScenesForProject(projectId);

// Determine if Seedance 2 continuity mode should be used
const useSeedanceContinuity =
  project.seamlessTransitions === true &&
  scenes.every(scene => {
    const style = getVisualStyleConfig(scene.visualStyle ?? project.visualStyle);
    return style.preferredVideoProviders[0].startsWith('seedance-2');
  });

if (useSeedanceContinuity) {
  console.log(`[Generation] Seamless transitions mode: sequential Seedance 2`);
  console.log(`[Generation] ⚠️ Sequential mode — ${scenes.length} scenes will generate one at a time`);

  await generateScenesWithContinuity(
    projectId,
    scenes,
    options,
    (sceneId, status) => notifySceneProgress(projectId, sceneId, status)
  );
} else {
  // Existing parallel generation path — unchanged
  await generateScenesInParallel(projectId, scenes, options);
}
```

---

## Task 6: UI — Project Settings Toggle

Add the "Seamless Transitions" toggle to the project settings / creation form:

```tsx
// In your project settings component or creation wizard

interface SeamlessTransitionsToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function SeamlessTransitionsToggle({ value, onChange }: SeamlessTransitionsToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-border">
      <div>
        <p className="text-sm font-medium">Seamless transitions</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Scenes share visual continuity — each scene starts where the last one ended.
          Requires sequential generation (takes longer).
        </p>
        {value && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Generation time increases with scene count. 6 scenes ≈ 6× longer.
          </p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`
          relative inline-flex h-5 w-9 shrink-0 rounded-full border border-border
          transition-colors cursor-pointer
          ${value ? 'bg-green-500 border-green-500' : 'bg-muted'}
        `}
      >
        <span
          className={`
            pointer-events-none block h-4 w-4 rounded-full bg-white shadow
            transition-transform mt-0.5
            ${value ? 'translate-x-4' : 'translate-x-0.5'}
          `}
        />
      </button>
    </div>
  );
}
```

---

## Task 7: Per-Scene Progress UI

When in continuity mode, replace any aggregate progress indicator with per-scene status:

```tsx
// Show each scene's individual status during sequential generation

const SCENE_STATUS_LABELS = {
  pending: 'Waiting',
  generating: 'Generating video…',
  extracting_frame: 'Extracting frame…',
  complete: 'Complete',
  failed: 'Failed',
} as const;

// In your scene list component, show status badge per scene:
<span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[scene.generationStatus]}`}>
  {SCENE_STATUS_LABELS[scene.generationStatus]}
</span>
```

---

## Success Criteria

- [ ] `seamless_transitions` column added to project table
- [ ] `last_frame_url` and `first_frame_url` columns added to scenes table
- [ ] `extractLastFrame` utility downloads video, extracts frame, uploads to S3
- [ ] `generateSeedance2WithContinuity` sends correct `first_last_frames` payload
- [ ] Sequential orchestrator generates scenes in order, passing frames forward
- [ ] On scene failure, continuity chain resets cleanly (no cascade of bad frames)
- [ ] UI toggle sets `seamless_transitions` on the project
- [ ] Toggle shows time warning when enabled
- [ ] Per-scene progress visible during sequential generation
- [ ] No TypeScript errors

---

## Next Phase

Proceed to **Phase 20C: omni_reference Brand Anchoring** once a test project with "Seamless Transitions" enabled produces visually continuous scenes.
