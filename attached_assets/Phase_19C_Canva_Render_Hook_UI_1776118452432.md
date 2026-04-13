# Phase 19C: Render Hook + Canva Sync UI

## Priority: HIGH
## Dependency: Phase 19A + 19B must be complete and verified
## Estimated Time: 2-3 hours

---

## What This Phase Builds

1. Hook `canvaAssetService.syncRenderToCanva()` into the existing render completion handler
2. Canva sync status badge on the project card UI
3. "View in Canva" deep-link button after successful sync
4. Manual re-sync button for failed syncs

This phase wires everything together. The service and OAuth exist. This phase connects them to the render pipeline and surfaces the result to the user.

---

## Task 1: Hook Into Render Completion

Find the existing render completion handler in your codebase. It is likely in one of:
- `server/services/render.service.ts`
- `server/services/video-render.service.ts`
- `server/routes/render.routes.ts`
- A webhook handler for Remotion Lambda callbacks

Look for where `status: 'completed'` or `render_status: 'success'` is set on a project after Remotion finishes. That is the injection point.

### Add the Canva sync trigger:

```typescript
// In your existing render completion handler
// Find the block that marks a render as successful and add the Canva sync below it.

import { canvaAuthService } from '../services/canva-auth.service';
import { canvaAssetService } from '../services/canva-asset.service';

// ─── EXISTING CODE (do not modify) ───────────────────────────────────────
// await db.update(videoProjects).set({ status: 'completed', outputUrl: renderUrl })...
// ─────────────────────────────────────────────────────────────────────────

// ─── ADD: Trigger Canva sync (non-blocking, post-render side effect) ──────
// Get the userId from the project. Adjust field name to match your schema.
const projectUserId = project.userId ?? project.user_id;

if (projectUserId && renderS3Key) {
  // Check if this user has Canva connected before spawning the task
  canvaAuthService.isConnected(projectUserId).then(connected => {
    if (!connected) return;

    console.log(`[RenderComplete] Triggering Canva sync for project ${project.id}`);

    canvaAssetService.syncRenderToCanva({
      userId: projectUserId,
      projectId: project.id,
      projectTitle: project.title ?? `Project ${project.id}`,
      renderS3Key,
      brandTags: ['pine-hill-farm', 'neuralcut'],
    }).then(result => {
      const successCount = (result.videoAssetId ? 1 : 0) + result.frameAssetIds.length;
      console.log(`[RenderComplete] Canva sync done: ${successCount} assets pushed`);
    }).catch(err => {
      // Non-fatal — render is already marked successful
      console.error('[RenderComplete] Canva sync failed (non-fatal):', err.message);
    });
  }).catch(() => {
    // isConnected check failed — skip silently
  });
}
// ─────────────────────────────────────────────────────────────────────────

// NOTE: The Canva sync is intentionally fire-and-forget.
// Render success status is NOT dependent on Canva sync success.
// Users see sync status separately via the CanvaSyncBadge component.
```

### Finding `renderS3Key`:

The `renderS3Key` should already be available in your render completion handler as the S3 path of the output MP4. It's typically the key used when uploading the Remotion Lambda output to S3. If you have the full S3 URL, extract the key like this:

```typescript
function s3KeyFromUrl(url: string): string {
  // e.g. https://bucket.s3.amazonaws.com/renders/project-123/final.mp4
  // → renders/project-123/final.mp4
  return new URL(url).pathname.slice(1);
}
const renderS3Key = s3KeyFromUrl(renderOutputUrl);
```

---

## Task 2: Canva Sync Status Badge Component

Create file: `client/src/components/canva/CanvaSyncBadge.tsx`

```tsx
// client/src/components/canva/CanvaSyncBadge.tsx

import { useState, useEffect } from 'react';

type SyncStatus = 
  | 'not_connected' 
  | 'not_started' 
  | 'in_progress' 
  | 'success' 
  | 'partial' 
  | 'failed';

interface SyncStatusResponse {
  connected: boolean;
  status: SyncStatus;
  totalAssets?: number;
  successCount?: number;
  assetIds?: Array<{ id: string; type: string; label: string }>;
}

interface CanvaSyncBadgeProps {
  projectId: number;
  renderComplete: boolean;   // Only poll if a render has completed
  onManualSync?: () => void; // Optional callback after manual re-sync
}

const STATUS_CONFIG: Record<SyncStatus, {
  label: string;
  bgClass: string;
  textClass: string;
  dotClass: string;
  animate: boolean;
}> = {
  not_connected: {
    label: 'Canva not connected',
    bgClass: 'bg-gray-100 dark:bg-gray-800',
    textClass: 'text-gray-500 dark:text-gray-400',
    dotClass: 'bg-gray-400',
    animate: false,
  },
  not_started: {
    label: 'Canva sync pending',
    bgClass: 'bg-yellow-50 dark:bg-yellow-900/20',
    textClass: 'text-yellow-700 dark:text-yellow-400',
    dotClass: 'bg-yellow-500',
    animate: false,
  },
  in_progress: {
    label: 'Syncing to Canva…',
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    textClass: 'text-blue-700 dark:text-blue-400',
    dotClass: 'bg-blue-500',
    animate: true,
  },
  success: {
    label: 'In Canva',
    bgClass: 'bg-green-50 dark:bg-green-900/20',
    textClass: 'text-green-700 dark:text-green-300',
    dotClass: 'bg-green-500',
    animate: false,
  },
  partial: {
    label: 'Partial sync',
    bgClass: 'bg-orange-50 dark:bg-orange-900/20',
    textClass: 'text-orange-700 dark:text-orange-300',
    dotClass: 'bg-orange-500',
    animate: false,
  },
  failed: {
    label: 'Sync failed',
    bgClass: 'bg-red-50 dark:bg-red-900/20',
    textClass: 'text-red-700 dark:text-red-300',
    dotClass: 'bg-red-500',
    animate: false,
  },
};

export function CanvaSyncBadge({ projectId, renderComplete, onManualSync }: CanvaSyncBadgeProps) {
  const [syncData, setSyncData] = useState<SyncStatusResponse | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/canva/sync/status/${projectId}`);
      if (!res.ok) return;
      const data: SyncStatusResponse = await res.json();
      setSyncData(data);

      // Stop polling once terminal state is reached
      if (data.status !== 'in_progress' && data.status !== 'not_started') {
        if (pollInterval) {
          clearInterval(pollInterval);
          setPollInterval(null);
        }
      }
    } catch {
      // Silent fail — badge is non-critical
    }
  };

  useEffect(() => {
    if (!renderComplete) return;

    fetchStatus();

    // Poll every 5 seconds while in progress
    const interval = setInterval(fetchStatus, 5000);
    setPollInterval(interval);

    return () => clearInterval(interval);
  }, [projectId, renderComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollInterval]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await fetch(`/api/canva/sync/${projectId}`, { method: 'POST' });
      setSyncData(prev => prev ? { ...prev, status: 'in_progress' } : null);
      // Resume polling
      const interval = setInterval(fetchStatus, 5000);
      setPollInterval(interval);
      onManualSync?.();
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setRetrying(false);
    }
  };

  // Don't show anything if Canva is not connected or no render
  if (!renderComplete) return null;
  if (!syncData || syncData.status === 'not_connected') return null;

  const config = STATUS_CONFIG[syncData.status];

  return (
    <div className="flex items-center gap-2">
      <span
        className={`
          inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium
          ${config.bgClass} ${config.textClass}
        `}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${config.dotClass} ${
            config.animate ? 'animate-pulse' : ''
          }`}
        />
        {/* Canva C icon */}
        <span
          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white text-[8px] font-bold"
          style={{ backgroundColor: '#7D2AE8' }}
        >
          C
        </span>
        {config.label}
        {syncData.status === 'success' && syncData.successCount != null && (
          <span className="opacity-70">({syncData.successCount})</span>
        )}
      </span>

      {/* Retry button for failed syncs */}
      {(syncData.status === 'failed' || syncData.status === 'partial') && (
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted transition-colors disabled:opacity-50"
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}
```

---

## Task 3: "View in Canva" Link Component

Create file: `client/src/components/canva/CanvaViewLink.tsx`

```tsx
// client/src/components/canva/CanvaViewLink.tsx

// Canva's Projects deep link: opens user's Canva projects/uploads folder
// where they'll find the synced assets
const CANVA_PROJECTS_URL = 'https://www.canva.com/folder/uploads';

interface CanvaViewLinkProps {
  synced: boolean;
  className?: string;
}

export function CanvaViewLink({ synced, className = '' }: CanvaViewLinkProps) {
  if (!synced) return null;

  return (
    <a
      href={CANVA_PROJECTS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded
        border border-border hover:bg-muted transition-colors
        ${className}
      `}
    >
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[8px] font-bold"
        style={{ backgroundColor: '#7D2AE8' }}
      >
        C
      </span>
      View in Canva
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-50">
        <path d="M1 9L9 1M9 1H3M9 1V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </a>
  );
}
```

---

## Task 4: Integrate into Project Card

Find your existing project card component (likely something like `ProjectCard.tsx`, `VideoProjectCard.tsx`, or similar). Add the Canva components:

```tsx
// In your existing project card component
// Add these imports at the top:

import { CanvaSyncBadge } from '@/components/canva/CanvaSyncBadge';
import { CanvaViewLink } from '@/components/canva/CanvaViewLink';

// Inside the card JSX, in the footer/actions area:

<div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
  <CanvaSyncBadge
    projectId={project.id}
    renderComplete={project.status === 'completed'}
  />
  <CanvaViewLink
    synced={/* derive from sync status if needed */
    project.canvaSynced ?? false}
  />
</div>
```

If your project card doesn't have space, add the Canva badge to the project detail view instead.

---

## Task 5: Sanity Check — Verify the Full Pipeline

Create a test to verify the complete flow works:

```typescript
// server/routes/canva-test.routes.ts
// DEVELOPMENT ONLY — remove before production

import { Router } from 'express';
import { canvaAuthService } from '../services/canva-auth.service';
import { canvaAssetService } from '../services/canva-asset.service';

export const canvaTestRouter = Router();

// GET /api/canva/test/full-sync?projectId=X
// Only active in development, requires auth
canvaTestRouter.get('/test/full-sync', async (req: any, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const userId = req.user?.id;
  const projectId = parseInt(req.query.projectId as string, 10);

  if (!userId || isNaN(projectId)) {
    return res.status(400).json({ error: 'userId and projectId required' });
  }

  const connected = await canvaAuthService.isConnected(userId);
  if (!connected) {
    return res.status(400).json({ error: 'Canva not connected. Go to Settings first.' });
  }

  // Use a known completed project's S3 key
  const { videoProjects } = await import('@shared/schema');
  const { db } = await import('../db');
  const { eq } = await import('drizzle-orm');

  const [project] = await db
    .select()
    .from(videoProjects)
    .where(eq(videoProjects.id, projectId))
    .limit(1);

  if (!project?.outputUrl) {
    return res.status(400).json({ error: 'Project has no output URL' });
  }

  const renderS3Key = new URL(project.outputUrl).pathname.slice(1);

  const result = await canvaAssetService.syncRenderToCanva({
    userId,
    projectId,
    projectTitle: project.title ?? `Test Project ${projectId}`,
    renderS3Key,
    brandTags: ['pine-hill-farm', 'neuralcut', 'test'],
  });

  res.json({ success: true, result });
});
```

```typescript
// Register in dev only:
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/canva', canvaTestRouter);
}
```

---

## Full End-to-End Smoke Test Sequence

Run these in order after all three phases are complete:

```
1. Settings → click "Connect with Canva" → authorize → confirm "Connected" badge

2. Pick a project with a completed render (status = 'completed')

3. GET /api/canva/test/full-sync?projectId=123
   → Should return { success: true, result: { videoAssetId, frameAssetIds } }

4. Open https://www.canva.com/folder/uploads
   → Should see the MP4 + 4 JPEG frames tagged "neuralcut"

5. Confirm canva_sync_jobs table:
   SELECT * FROM canva_sync_jobs WHERE project_id = 123;
   → 5 rows (1 video + 4 frames), all status = 'success'

6. Project card → confirm Canva badge shows "In Canva (5)"

7. Render a new project from scratch → watch badge go:
   "Canva sync pending" → "Syncing to Canva…" → "In Canva (5)"

8. Settings → Disconnect → confirm badge disappears from future renders
```

---

## What NOT to Build (Stay in Scope)

- ❌ Do not add Canva design creation (Tier 2 — needs Enterprise)
- ❌ Do not add Autofill / Brand Templates (Tier 2)
- ❌ Do not add a Resize pipeline (Tier 2)
- ❌ Do not add a Canva Apps SDK plugin (Tier 3)
- ❌ Do not surface canva_asset_ids as clickable links — Canva's asset URLs are internal-only and not directly linkable per their guidelines. Link to `/folder/uploads` instead.

---

## Success Criteria

- [ ] Render completion triggers Canva sync automatically (fire-and-forget)
- [ ] MP4 appears in Canva Projects after successful render
- [ ] 4 key frames appear in Canva Projects as images
- [ ] Project card badge cycles through pending → syncing → synced states
- [ ] Failed syncs surface a Retry button
- [ ] "View in Canva" opens Canva Projects in new tab
- [ ] Disconnect from Settings stops future syncs
- [ ] Render success status is NOT affected by Canva sync failure
- [ ] No TypeScript errors
- [ ] Dev test route works end-to-end

---

## Phase 19 Complete

With 19A + 19B + 19C done, NeuralCut has a full Canva Tier 1 integration:

```
NeuralCut renders → S3 → [render complete] 
  → canvaAssetService.syncRenderToCanva()
    → MP4 binary upload to Canva Projects
    → 4 key frames extracted + uploaded
    → Assets tagged with brand metadata
    → UI shows sync status
  → Pine Hill Farm design team opens Canva
    → All assets ready for social content creation
```

The foundation is also ready for Tier 2 (Brand Template Autofill) if Pine Hill Farm
confirms Canva Enterprise access. Tier 2 would add a `canvaAutofillService` on top of
this OAuth + token infrastructure without modifying what was built here.
