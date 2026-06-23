---
name: PiAPI Flux Kontext model ID
description: The correct PiAPI model/task_type for Flux Kontext image editing; the Qubico namespaces do not work for this model.
---

## Rule
Flux Kontext is a Black Forest Labs model. PiAPI uses `black-forest-labs/` namespace for BFL models (confirmed: `black-forest-labs/FLUX.1-schnell` in universal-video-service.ts).

The `generateWithKontext` function now probes 4 candidates in order:
1. `black-forest-labs/FLUX.1-kontext-dev` + `task_type: img2img-kontext`
2. `black-forest-labs/FLUX.1-kontext-pro` + `task_type: img2img-kontext`
3. `black-forest-labs/flux-kontext-dev` + `task_type: img2img-kontext`
4. `black-forest-labs/flux-kontext-pro` + `task_type: img2img-kontext`

HTTP 400 responses containing "invalid model" or "invalid task type" are skipped to the next candidate. Any other error throws immediately.

**Why:** PiAPI's Kontext model ID has changed at least twice:
- `Qubico/flux1-kontext-dev` → "invalid model"
- `Qubico/flux1-dev` with `img2img-kontext` → "invalid task type"
The probe approach survives future renames without a code change.

**How to apply:** Do not hardcode a single Kontext model ID. Keep the probe list in `generateWithKontext`. After a successful generation, check the logs for `[I2I-Kontext] Task created with <model>` to identify which candidate is currently live, and promote it to the top of the list.

## Fallback chain for I2I
When provider = `flux-kontext`:
1. Try all 4 Kontext candidates (fast — each 400 is instant)
2. If all fail → Nano Banana Pro (`model: "gemini"`, `task_type: "nano-banana-pro"`) — real I2I, preserves the image
3. Absolute last resort → standard img2img (`Qubico/flux1-dev` + `img2img`) — mostly ignores the reference at high strength

## Nano Banana vs Kontext
- **Nano Banana** (Gemini): good image-style preservation, weak on precise spatial instructions ("add two rows of tables" gets ignored)
- **Flux Kontext**: strong instruction-following for specific edits ("remove the booth from the stage") — this is why getting Kontext working matters for the user's layout editing use case
