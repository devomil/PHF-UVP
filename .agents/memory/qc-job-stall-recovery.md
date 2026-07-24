---
name: QC job stall recovery dead zone
description: Quick Create jobs reset to "pending" by stall recovery are never picked up again if the server restarts before processVideoJob executes; fix requires scanning pending jobs too.
---

## The Rule
`recoverStuckJobs()` must query BOTH `processing` AND `pending` jobs. After recovery resets a QC job to `pending` and fires `processVideoJob` async, a second server restart kills that call before it runs. The next server's recovery only sees `processing` — the `pending` job is permanently invisible, and the VideoWorker always skips QC projects.

**Why:** Observed directly — kling-1.6 job (ee3fa0a0) sat as `pending` indefinitely across multiple restarts because each restart's recovery only rescued `processing` jobs.

## How to Apply
Three-state logic in `recoverStuckJobs()` (`server/services/job-processor.ts`):

| Status | isQC | Age | Action |
|---|---|---|---|
| `processing` | true | ≤15 min | Skip — still in-flight (Runway/Kling can take 5+ min) |
| `processing` | true | >15 min | Reset to `pending` + call `processVideoJob` — orphaned by restart |
| `processing` | false | >2 min | Reset to `pending` + call `processVideoJob` — normal stall |
| `pending` | true | >1 min | Call `processVideoJob` directly — VideoWorker skips QC, nobody else will pick it up |

The `pending` scan catches jobs where a previous recovery's async `processVideoJob` call was killed by a server restart before executing.

## Key Constants
- `QC_INFLIGHT_THRESHOLD_MINUTES = 15` — safe above Runway Aleph (~5 min) and Kling (~3 min)
- `QC_PENDING_STALE_MINUTES = 1` — if pending longer than 1 min, the initial call was lost
