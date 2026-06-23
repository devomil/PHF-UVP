---
name: PiAPI Flux Kontext model ID
description: Correct model and task type for Flux Kontext image-to-image editing on PiAPI
---

## Rule
PiAPI Flux Kontext (image editing via reference image + prompt) uses:
- **model**: `Qubico/flux1-dev-advanced`
- **task_type**: `img2img-kontext` (also accepts `kontext`)
- **required input fields**: `prompt`, `image` (URL), `width`, `height`
- **optional**: `steps` (default 10), `seed` (-1 for random)
- **output**: `data.output.image_url`

**Why:** Every other guessed namespace (`black-forest-labs/FLUX.1-kontext-*`, `Qubico/flux1-kontext*`, no-namespace variants) returns "invalid model". The correct ID was confirmed via PiAPI docs at `piapi.ai/docs/flux-api/kontext` (June 2026). The task type `img2img-kontext` is valid on PiAPI but only with this exact model.

**How to apply:** In `server/services/image-generation-service.ts`, `generateWithKontext` probes `Qubico/flux1-dev-advanced` with `img2img-kontext` first. If PiAPI renames again, add a new candidate to the top of the `candidates` array and re-probe.
