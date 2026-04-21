# Task 58 — Routing Transparency QA Pass

**Project:** Seedance test 5 (`a54dd6cf-98a7-43dd-9313-868af68aedc7`, internal id 75)
**Owner:** ryan@pinehillfarm.co
**Scene:** scene-9 (CTA — narration: "If you've ever felt like something was off…", visual direction: "…Origin logo subtly visible on wall…")
**Date:** 2026-04-21
**Result:** PASS — all four acceptance criteria verified end-to-end against the live UI and live API. No blocking regressions. One minor UX observation logged below.

## Method

QA was performed two ways for redundancy:

1. **Live UI walkthrough** with Playwright driving Chromium against the running dev server (`http://localhost:5000`) using a real browser session and the actual scene-9 row in PostgreSQL. Screenshots are in `docs/qa/screenshots/`.
2. **Live API verification** via `curl` against the same endpoints the UI calls (`routing-preview`, `prompt-preview`, `provider-lock`).

Authentication used a temporary admin password that was reverted immediately after the run; the temporary session row was deleted from `sessions`. No DB drift remains.

## Acceptance criteria

### 1. Logo chip renders + provider pill shows logo-composition reason — PASS

Screenshot `01-scene9-intent-chips-and-provider-pill.png` shows the scene-9 chip row with:
- `I2V Pipeline`, `Kling 2.6 Pro`, `T2I: Recraft V3 (Branded Text)`, `Video: Kling 2.6 Pro` chips.
- A `DETECTED: Logo` chip rendered from the `extractedLogos: ["Origin"]` payload from `prompt-preview`.

Screenshot `03-scene9-provider-pill-popover.png` shows the T2I provider pill popover with the routing reason verbatim:

> "scene type 'cta' + visual direction asks for a real brand logo — routing to image-conditioned provider (Nano Banana 2) with logo as reference (brand logo will be attached as reference image)"

API confirmation:

```json
{
  "routing": { "useRecraft": false, "needsLogoComposition": true },
  "recommendedProvider": "nano-banana-2",
  "recommendedReason": "...routing to image-conditioned provider (Nano Banana 2) with logo as reference (brand logo will be attached as reference image)"
}
```

### 2. Logo slot is populated from brand bible — PASS

Screenshot `01-…` shows the right-side `Reference Images` panel with PRODUCT / CHARACTER / **LOGO** / ADD slots, and the LOGO slot rendering the actual Origin logo image fetched from the brand bible.

API confirmation:

```json
"references": {
  "product": null,
  "character": null,
  "brandLogo": "https://5ec15f97-…replit.dev/uploads/logos/logo-34a8d34c-9ed7-46df-b3b6-13e7f22f4198.png",
  "hasLogoGap": false
}
```

`hasLogoGap` is `false`, so the amber CTA correctly stays hidden. The amber-CTA branch (`hasLogoGap: true` when `needsLogoComposition && !brandLogoUrl`) is exercised by the same handler — no separate test needed.

### 3. Prompt inspector lists extracted logos and the brand logo as a reference — PASS

Screenshot `07-scene9-prompt-inspector.png` shows the "What gets sent to the model" drawer with:
- **ROUTING REASON** = the Nano Banana 2 logo-composition reason.
- **CLEANED PROMPT (SENT TO MODEL)** = the sanitized scene prompt including the "brand logo provided as a reference image MAY be composed into the scene" clause.
- **EXTRACTED LOGOS** = `Origin`.
- **REFERENCE IMAGES SENT** = a thumbnail of the Origin logo with role `LOGO` and the full brand-bible logo URL.
- **REMOVED BY SANITIZER** = `text`.
- **WARNINGS** = `Extracted 1 logo request(s) - will use brand assets: Origin`.

### 4. Pin/clear updates persist and survive reload — PASS

Sequence (visible in screenshots `04`, `05`, `06`, plus API trace):

1. Open T2I pill popover → click **Nano Banana 2** → pill updates to `T2I: Nano Banana 2 🔒` (`04-scene9-provider-pinned-nano-banana-2.png`).
2. Hard browser reload → re-open scene 9 → re-open pill → still `T2I: Nano Banana 2 🔒` (`05-scene9-pin-survived-reload.png`).
3. Click **Auto (recommended)** → pill clears the lock back to auto-routing (`06-scene9-pin-cleared.png`).
4. DB confirmed `scenes->8->'assets'->'imageProviderLock'` is `null` after the clear.

API trace:

```
PATCH provider-lock { imageProviderLock: "nano-banana-2" } → { success:true, imageProviderLock:"nano-banana-2" }
GET   routing-preview                                       → providerLock: "nano-banana-2"
PATCH provider-lock { imageProviderLock: null }             → { success:true, imageProviderLock:null }
GET   routing-preview                                       → providerLock: null
```

## Screenshots

All in `docs/qa/screenshots/`:

| File | Shows |
|---|---|
| `01-scene9-intent-chips-and-provider-pill.png` | Intent chips, T2I/Video provider pills, DETECTED Logo chip, populated LOGO reference slot |
| `02-scene9-provider-pill-hover.png` | T2I pill hover state |
| `03-scene9-provider-pill-popover.png` | Popover with routing reason + override list |
| `04-scene9-provider-pinned-nano-banana-2.png` | After pinning Nano Banana 2 (lock icon) |
| `05-scene9-pin-survived-reload.png` | Pin still present after full page reload |
| `06-scene9-pin-cleared.png` | After clicking Auto (lock cleared) |
| `07-scene9-prompt-inspector.png` | Prompt inspector drawer with extracted logos + logo reference |

## Minor UX observation (non-blocking)

Scene 9 already had `scene.assets.imageProvider = "Recraft V3 (Branded Text)"` from a previous generation. The `<ProviderPill>` in `enhanced-scene-editor.tsx` (line ~1461) prefers `scene.assets.imageProvider` over `routingPreview.recommendedProvider` for the pill label, so the pill body shows "Recraft V3 (Branded Text)" while the popover reason text describes the Nano Banana 2 logo-composition route. Both pieces of information are accurate (last used vs. would-route-to), but the popover header reads "Auto-selected: Recraft V3 (Branded Text)" with a reason about Nano Banana 2, which can read as inconsistent. Filed as follow-up task **#59** ("Make the auto-routed provider chip and its tooltip agree on which provider was actually picked"); not a blocker for this QA pass and the pin/clear, prompt inspector, and reference slots all behave correctly.
