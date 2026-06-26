---
name: Runway V2V API schema
description: Exact request shape for the Runway /video_to_video endpoint — model IDs, promptImage format, and gotchas discovered via validation errors.
---

## Runway /video_to_video request shape

```json
{
  "videoUri": "<source-video-url>",
  "promptText": "<edit direction>",
  "model": "<v2v-model-id>",
  "promptImage": [{ "uri": "<still-image-url>" }]   // optional, array of objects
}
```

### Model ID map (V2V ≠ T2V namespace)

| Provider key      | V2V model ID   |
|-------------------|----------------|
| runway-aleph-2    | aleph2         |
| runway-gen4-aleph | gen4_aleph     |
| runway-agent-2    | aleph2_alpha   |

The T2V endpoint uses `gen4.5`, `gen4`, etc. — those are REJECTED by /video_to_video.

### promptImage rules

- Must be `Array<{ uri: string }>` — not a plain string, not `[string]`.
- Is optional; omit entirely if no still-frame reference is available.
- **Never send a video URL (.mp4/.webm) as promptImage** — the pipeline's
  `brandAssetUrl` fallback is a video; check for video extensions before
  including it as `promptImage`.

**Why:** Runway returns 400 with very specific Zod-style validation messages
that reveal the exact schema. Three sequential 400s were needed to discover:
string → array → array of objects → skip video URLs.

**How to apply:** In `runway-video-service.ts` `generateVideoToVideo()`:
- Use `RUNWAY_V2V_MODEL_MAP[providerKey]` before falling back to `resolveApiModel()`.
- Gate `promptImage` on `isImageRef` (regex excludes .mp4/.webm/.mov extensions).
