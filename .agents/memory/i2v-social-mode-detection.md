---
name: I2V mode detection for social scenes
description: promptRequiresNewContent() was missing hospitality/social words, causing bar/restaurant/event prompts to always run in ANIMATE MODE; brandLogoUrl also not forwarded to reference image arrays.
---

## The Rule
`promptRequiresNewContent()` in `piapi-video-service.ts` controls whether I2V runs as:
- **ANIMATE MODE** — subtle motion added to the source image; prompt mostly ignored
- **REFERENCE MODE** — new content generated using reference images as anchors; full prompt followed

The original regex was missing entire categories of human subjects (patrons, guests, bartender, diners, attendees) and social activity verbs (socializing, mingling, chatting, sipping). Prompts for bar, restaurant, hotel, and event contexts always fell through to ANIMATE MODE.

**Why:** Observed directly — "packed bar floor...patrons laughing and socializing" produced a quiet static bar animation. "patrons" and "socializing" were not in either regex list.

## How to Apply
When updating `promptRequiresNewContent`, keep three independent trigger paths:
1. `isCharacterReference` flag (always REFERENCE)
2. Explicit crowd/group patterns + entity words
3. `humanSubjects` + `activityVerbs` co-occurrence

When adding new domain terms, add to BOTH lists: the subject AND the verb (e.g., "bartender" + "pour").

Also added: packed/busy environment shortcut — if the prompt contains `packed|bustling|buzzing|lively|crowded` AND any human subject, it's REFERENCE MODE regardless of verb.

## brandLogoUrl Not Forwarded

`job.i2vSettings.brandLogoUrl` was stored in the DB but never added to `resolvedImageUrls` in `job-processor.ts`. This meant the logo never reached `elements[]` (Kling 1.6) or `reference_images[]` (other providers).

**Fix:** Merge `brandLogoUrl` into `rawRefImagesWithLogo` before the URL resolution loop, then also copy it into `i2vSettingsForProvider` so Seedance's explicit `@imageN` brand-mark injection (which reads from `options.i2vSettings.brandLogoUrl`) still functions.
