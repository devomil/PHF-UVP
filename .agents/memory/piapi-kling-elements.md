---
name: PiAPI Kling elements[] is v1.6-only; duration max 10s
description: Kling multi-image (elements) constraints on PiAPI and how the I2V request builder must handle them
---

PiAPI's Kling `video_generation` rejects the `elements[]` field (multi-image references)
for any version other than **1.6** — error code 10000, `"the elements feature is only
supported in version 1.6"`, surfaced as HTTP 500 with `failed to validate input`. This is
a Kling platform limitation (multi-image/elements is a v1.6 feature), not a PiAPI bug.
AI-generated search summaries claim 2.6 supports elements — the live API says otherwise;
trust the API response.

Kling duration must be ≤10s (5 or 10). An unclamped duration (e.g. 20) reaches the API
if the request builder passes `options.duration` straight through.

**Why:** a Quick Create multi-image I2V on kling-2.6-pro (2 reference images, 20s) failed
with the generic "All providers failed for Auto style" UI message; the real cause was
only visible in server logs as the code-10000 validation error. No charge occurred
(points frozen then released, consume=0).

**How to apply:** in the Kling I2V request builder (piapi-video-service.ts), attach
`elements[]` only when version is 1.6/1.0. For newer versions with multiple images,
animate the primary `image_url` only, strip `@image_N` tokens from the prompt, and log
that extra references were dropped — fail soft, not the whole job. Always clamp Kling
duration with `Math.min(duration, 10)`. If true multi-image referencing is required,
Kling 1.6 is the only Kling option on PiAPI.
