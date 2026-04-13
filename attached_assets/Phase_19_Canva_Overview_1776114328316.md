# Phase 19: Canva Connect Integration (Tier 1)

## Executive Summary

Phase 19 adds a Canva asset push pipeline to NeuralCut.AI. When a video render completes successfully, the system automatically pushes the final MP4 and extracted key frames to the Pine Hill Farm Canva workspace. The design team gets production assets in Canva instantly — no manual downloading, re-uploading, or file management required.

**Current State:** Rendered video assets live in S3. Design team must manually download and re-upload to Canva to create derivative social content.

**Target State:** On render completion, assets are automatically available in Canva. Design team opens Canva and the video + hero frames are already in their Projects folder, tagged and named, ready for social content creation.

**Tier:** 1 (no Canva Enterprise required — Assets API + direct upload are available to all plans)

---

## What Gets Built

```
PHASE 19: CANVA CONNECT INTEGRATION
┌─────────────────────────────────────────────────────┐
│ 19A: OAuth + Token Management          [CRITICAL]   │
│      Connect/disconnect, token storage, refresh     │
├─────────────────────────────────────────────────────┤
│ 19B: Asset Upload Service              [CRITICAL]   │
│      MP4 binary upload + frame URL upload + polling │
├─────────────────────────────────────────────────────┤
│ 19C: Render Hook + UI                  [HIGH]       │
│      Wire into render completion, status UI         │
└─────────────────────────────────────────────────────┘
```

---

## API Surface Being Used (Tier 1 Only)

| Endpoint | Method | Purpose | Auth Scope |
|---|---|---|---|
| `/rest/v1/assets` (upload job) | POST | Create presigned upload URL for MP4 | `asset:write` |
| `/rest/v1/assets/{jobId}` | GET | Poll upload job status | `asset:read` |
| `/rest/v1/url-asset-uploads` | POST | Upload key frame image from S3 URL | `asset:write` |
| `/rest/v1/url-asset-uploads/{jobId}` | GET | Poll URL upload job status | `asset:read` |
| `/rest/v1/assets/{assetId}` | PATCH | Update asset name + tags after upload | `asset:write` |
| `/rest/v1/users/me` | GET | Verify token is valid on connect | `profile:read` |

**Not used in Tier 1:** Brand Templates, Autofill, Designs (create/export), Resize, Folders.

---

## Architecture Decisions

### Two upload paths for two asset types

**MP4 video (final render):**
- Max size: up to 2GB MP4 outputs from Remotion Lambda
- URL upload cap is 100MB for video — most renders exceed this
- **Use: Direct binary upload** — create upload job → get presigned URL → stream MP4 from S3 to Canva via PUT → poll for completion

**Key frames (thumbnails / hero images):**
- Extracted by ffmpeg from the rendered MP4 at scene boundaries
- Always <5MB per frame as JPEG
- URL upload endpoint (preview API) accepts publicly accessible S3 URLs
- **Use: URL upload** — pass S3 URL directly, Canva fetches it

> ⚠️ The URL upload endpoint (`/rest/v1/url-asset-uploads`) is currently in Canva Preview status. This means it may have breaking changes. Acceptable for image frames since the fallback is binary upload. Do NOT use it as the primary path for the MP4.

### Token storage

Each NeuralCut user who connects their Canva account gets a `canva_tokens` row. Tokens are per-user (Canva's OAuth is user-level, not org-level). Access tokens expire; refresh tokens do not expire until revoked.

### Async job polling strategy

Both upload paths return async job IDs. Poll with exponential backoff:
- Initial delay: 1s
- Multiplier: 1.5x
- Max delay: 10s
- Timeout: 5 minutes
- On timeout: mark sync as `failed`, log the job ID for manual recovery

### Non-blocking render pipeline

The Canva push is a **post-render side effect**, not part of the render critical path. If Canva push fails, the render is still considered successful. The failure is logged and surfaced in the UI as a sync status badge — it does not retry the render.

---

## Database Schema Additions

Two new tables:

```
canva_tokens     — OAuth tokens per user
canva_sync_jobs  — Tracks each asset push attempt
```

Full schema in Phase 19A.

---

## Environment Variables Required

```
CANVA_CLIENT_ID=          # From Canva Developer Portal
CANVA_CLIENT_SECRET=      # From Canva Developer Portal  
CANVA_REDIRECT_URI=       # https://[your-domain]/api/canva/callback
```

---

## Implementation Order

Execute phases in order. 19B depends on the token infrastructure from 19A. 19C depends on the service from 19B.

```
19A → 19B → 19C
```

Each phase is a single Replit agent session.

---

## Success Criteria for Phase 19

- [ ] User can connect and disconnect their Canva account from NeuralCut settings
- [ ] On render success, final MP4 is automatically pushed to Canva
- [ ] 3-5 key frames are extracted and pushed as image assets
- [ ] Assets appear in user's Canva Projects with correct names and tags
- [ ] UI shows sync status (pending / syncing / synced / failed) on the project card
- [ ] Canva sync failures do not block or affect render success status
- [ ] Token refresh happens automatically when access token expires
- [ ] Disconnect properly revokes and clears stored tokens

---

## Next Phase After 19C

The Tier 2 upgrade path (Brand Template Autofill) is gated on Pine Hill Farm confirming Canva Enterprise access. Once confirmed, Phase 20 will add the autofill pipeline on top of this foundation.
