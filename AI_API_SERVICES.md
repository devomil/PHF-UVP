# NeuralCut.AI — AI API Services Reference

> Last updated: May 2026  
> Source of truth: `server/services/piapi-test-config.ts`  
> All costs are per-generation estimates. Disabled services are noted but not currently available.

---

## Video Generation (T2V) — 22 services

Text-to-Video: generate a video clip from a text prompt.

| Service | Est. Cost | Est. Time | Notes |
|---|---|---|---|
| **Kling 2.6** | $0.14 | ~60s | Standard mode, version 2.6 |
| **Kling 3.0 Omni** | $0.21 | ~90s | Latest Kling model |
| **Kling 2.5** | $0.14 | ~60s | Standard mode, version 2.5 |
| **Kling Effects (VFX)** | $0.14 | ~60s | VFX-specialized generation with effect scenes (sparkle, etc.) |
| **Kling AI Avatar** | $0.30 | ~90s | Avatar mode — presenter-to-camera generation |
| **Hailuo** | $0.20 | ~120s | MiniMax v2.3 |
| **Hunyuan** | $0.10 | ~300s | Qubico/hunyuan |
| **Luma** | $0.30 | ~90s | Ray v2 model |
| **Wan 2.6** | $0.15 | ~90s | 720p, prompt extension support |
| **Wan 2.2** | $0.28 | ~600s | 14B model via Qubico/wanx |
| **Wan 2.1** | $0.28 | ~600s | 14B model via Qubico/wanx |
| **Seedance 2** | $0.75 | ~25 min | ByteDance — high quality, slow |
| **Seedance 2 Fast** | $0.10 | ~15 min | ByteDance — faster variant |
| **Veo 3** | $0.50 | ~120s | Google Veo 3 fast |
| **Veo 3.1** | $0.50 | ~120s | Google Veo 3.1 fast |
| **Runway 4.5** | $0.35 | ~120s | Direct Runway API (requires RUNWAY_API_KEY) |
| **Runway Gen-4** | $0.25 | ~120s | Direct Runway API |
| **Runway Gen-4 Aleph** | $0.30 | ~120s | Direct Runway API |
| **Runway Act Two** | $0.30 | ~120s | Character performance specialization |
| **Sora 2** | $0.40 | ~120s | OpenAI Sora 2 |
| **Sora 2 Pro** | $0.60 | ~180s | OpenAI Sora 2 Pro — 720p |
| **OmniAvatar** | $0.30 | ~120s | Digital avatar generation |

---

## Image-to-Video (I2V) — 15 services

Animate a reference image into a video clip.

| Service | Est. Cost | Est. Time | Inputs | Notes |
|---|---|---|---|---|
| **Kling 2.6 I2V** | $0.14 | ~60s | Image | Standard mode, version 2.6 |
| **Kling 2.5 I2V** | $0.14 | ~60s | Image | Standard mode, version 2.5 |
| **Kling AI Avatar I2V** | $0.23 | ~90s | Image | Portrait-to-avatar animation, version 2.0 |
| **Hailuo I2V** | $0.20 | ~120s | Image | MiniMax v2.3 |
| **Hailuo Director I2V** | $0.20 | ~120s | Image | Camera control mode (Push in, Pan, etc.) |
| **Wan 2.6 I2V** | $0.40 | ~90s | Image | 720p |
| **Luma I2V** | $0.30 | ~90s | Image | Ray v2 model |
| **Veo 3 I2V** | $0.50 | ~120s | Image | Google Veo 3 |
| **Veo 3.1 I2V** | $0.50 | ~120s | Image | Google Veo 3.1 |
| **Seedance 2 I2V** | $0.75 | ~25 min | Image | ByteDance — high quality |
| **Seedance 2 Fast I2V** | $0.10 | ~15 min | Image | ByteDance — faster variant |
| **Seedance 2 First-Last Frames** | $0.50 | ~15 min | Image(s) | Seamless transitions — locks start/end frames for scene chaining |
| **Skyreels I2V** | $0.10 | ~90s | Image | Qubico/skyreels, FPS-24 |
| **OmniAvatar I2V** | $0.30 | ~120s | Image | Portrait → speaking avatar clip |
| **OmniHuman 1.5** | $0.30 | ~120s | Image + Audio | Talking photo — lip-syncs portrait to speech audio |

---

## Video-to-Video (V2V) — 2 services

Transform or replace elements in an existing video.

| Service | Est. Cost | Est. Time | Inputs | Notes |
|---|---|---|---|---|
| **Runway Gen-4 Aleph V2V** | $0.35 | ~180s | Video | Prompt-based video transformation |
| **Kling V2V Object Replace** | $0.20 | ~120s | Video + Image | Replaces an object in the source video with a supplied image |

---

## Character Performance — 1 service

Animate a character image using motion captured from a reference performance video.

| Service | Est. Cost | Est. Time | Inputs | Notes |
|---|---|---|---|---|
| **Runway Act Two** | $0.40 | ~180s | Image + Video | Full-body motion transfer from reference video to character image |

---

## Image Generation (T2I) — 17 services

Generate an image from a text prompt.

### Active

| Service | Est. Cost | Est. Time | Notes |
|---|---|---|---|
| **Flux Schnell** | $0.003 | ~5s | Fast, low cost |
| **Flux Dev** | $0.015 | ~10s | Higher quality than Schnell |
| **Z Image Turbo** | $0.01 | ~3s | Qubico/z-image — fastest T2I |
| **Nano Banana** | $0.03 | ~5s | Gemini 2.5 Flash image generation |
| **Nano Banana 2** | $0.03 | ~5-25s | Gemini 3.1 Flash — 4K support, up to 14 reference images |
| **Nano Banana 2 Multi** | $0.12 | ~10-30s | Generates 4 image candidates in a single request |
| **Nano Banana Pro** | $0.105 | ~8s | Higher-quality Gemini image model |
| **Qwen Image** | $0.075 | ~10s | Qubico/qwen-image |
| **Recraft V4** | $0.04 | ~10s | Direct Recraft API (requires RECRAFT_API_KEY) |
| **Recraft V4 Pro (4MP)** | $0.08 | ~15s | 4 megapixel output |
| **Recraft V3 (Branded Text)** | $0.04 | ~10s | Reliable branded text rendering in images |
| **GPT-Image-1 (OpenAI Direct)** | $0.04 | ~15s | Best text rendering quality — uses OPENAI_API_KEY directly |

### Disabled (currently unavailable)

| Service | Reason |
|---|---|
| **Flux Dev Advanced** | Qubico/flux1-dev-advanced returns invalid model error on PiAPI |
| **Ideogram V2** | Not available on PiAPI — needs direct Ideogram API key |
| **GPT-Image-1 (PiAPI)** | Not available via PiAPI — use OpenAI Direct version instead |
| **GPT Image 1.5** | Not listed in PiAPI documentation |
| **Seedream 4.0** | Requires direct ByteDance API access — not available via PiAPI |

---

## Image-to-Image (I2I) — 4 services

Transform a reference image with a new style, environment, or edit.

### Active

| Service | Est. Cost | Est. Time | Notes |
|---|---|---|---|
| **Flux Schnell I2I** | $0.01 | ~5s | Style transfer, quick transformations |
| **Flux Dev I2I** | $0.015 | ~10s | Higher quality, 1024×1024 output |
| **Qwen Image I2I** | $0.075 | ~10s | Detailed scene edits and style transfers |

### Disabled

| Service | Reason |
|---|---|
| **Seedream 4.0 I2I** | Requires direct ByteDance API access |

---

## Toolkit (Upscale / BG Remove) — 4 services

Post-processing utilities for images and videos.

| Service | Est. Cost | Est. Time | Input | Notes |
|---|---|---|---|---|
| **Qubic Image Upscale** | $0.02 | ~15s | Image | 2× or 4× upscale with optional face enhancement |
| **Qubic Image BG Removal** | $0.01 | ~10s | Image | Background removal via RMBG-2.0 |
| **Qubic Video Upscale** | $0.10 | ~10 min | Video | AI upscaling for video clips |
| **Qubic Video BG Removal** | $0.08 | ~10 min | Video | Background removal for video |

---

## Audio Generation — 6 services

Generate music, speech, and sound from text or video.

### Active

| Service | Est. Cost | Est. Time | Type | Notes |
|---|---|---|---|---|
| **DiffRhythm** | $0.05 | ~30s | Music | Lyrics + style prompt → song |
| **Udio** | $0.10 | ~60s | Music | Ambient / instrumental music generation |
| **ACE Step AI** | $0.05 | ~30s | Music | Ambient electronic, supports lyrics |
| **F5 TTS** | $0.025 | ~10s | Speech | Zero-shot text-to-speech with voice cloning |
| **Moshi** | $0.02 | ~10s | Speech | Conversational AI audio — may be on waitlist |

### Disabled

| Service | Reason |
|---|---|
| **MMAudio** | Video-to-audio generation — video upload for audio tests not yet implemented |

---

## LLM — 4 services

Large language model completions via PiAPI chat completions endpoint.

| Service | Model | Est. Cost | Est. Time | Notes |
|---|---|---|---|---|
| **DeepSeek** | deepseek-chat | $0.001 | ~3s | Low-cost reasoning model |
| **GPT-4o** | gpt-4o | $0.005 | ~3s | OpenAI GPT-4o via PiAPI |
| **Claude** | claude-sonnet-4-6 | $0.003 | ~3s | Anthropic Claude via PiAPI |
| **Deep Research** | deep-research | $0.01 | ~10s | Extended research model |

---

## LLM Service Integration — 6 services

Internal NeuralCut.AI service layer — uses `piapi-llm-client` with PiAPI → Anthropic failover. These power core platform features rather than user-facing generation.

| Service | Est. Cost | Est. Time | What It Powers |
|---|---|---|---|
| **Script Generation** | $0.003 | ~5s | AI script writer — generates multi-scene video scripts |
| **Visual Direction** | $0.003 | ~5s | Creates detailed AI generation prompts from scene descriptions |
| **Prompt Enhancement** | $0.002 | ~4s | Improves and optimizes user prompts for better AI output |
| **Provider Selection** | $0.002 | ~4s | Recommends the best AI provider for a given scene |
| **Text Label Extraction** | $0.001 | ~3s | Extracts on-screen text labels from narration copy |
| **Ask Suzzie Assistant** | $0.003 | ~5s | Powers the Suzzie creative assistant chat interface |

---

## Summary

| Category | Active | Disabled | Total |
|---|---|---|---|
| Video Generation (T2V) | 22 | 0 | **22** |
| Image-to-Video (I2V) | 15 | 0 | **15** |
| Video-to-Video (V2V) | 2 | 0 | **2** |
| Character Performance | 1 | 0 | **1** |
| Image Generation (T2I) | 12 | 5 | **17** |
| Image-to-Image (I2I) | 3 | 1 | **4** |
| Toolkit | 4 | 0 | **4** |
| Audio Generation | 5 | 1 | **6** |
| LLM | 4 | 0 | **4** |
| LLM Service Integration | 6 | 0 | **6** |
| **Total** | **74** | **7** | **81** |
