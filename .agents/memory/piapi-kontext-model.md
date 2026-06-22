---
name: PiAPI Flux Kontext model ID
description: The correct PiAPI model/task_type for Flux Kontext image editing; the Qubico/flux1-kontext-dev namespace does not exist.
---

## Rule
Flux Kontext I2I calls must use:
- `model: "Qubico/flux1-dev"`
- `task_type: "img2img-kontext"`

The model ID `Qubico/flux1-kontext-dev` returns HTTP 400 "invalid model".

**Why:** PiAPI hosts Kontext as a task-type variant of the existing `flux1-dev` model, not as a separate model in its own namespace. The namespace `Qubico/flux1-kontext-dev` never existed in production.

**How to apply:** Any call to `generateWithKontext()` in `server/services/image-generation-service.ts` or any new PiAPI img2img-kontext task must use the model above. Do not invent a `flux1-kontext-*` namespace.

## Fallback chain for I2I
When provider = `flux-kontext`:
1. Try Kontext (`Qubico/flux1-dev` + `img2img-kontext`)
2. If Kontext fails → try Nano Banana Pro (`model: "gemini"`, `task_type: "nano-banana-pro"`) — this is real I2I that preserves the reference image
3. If Nano Banana also fails → last-resort standard img2img (`Qubico/flux1-dev` + `img2img`) — NOTE: this T2I fallback largely ignores the reference image at high strength values; it should only run as a last resort.
