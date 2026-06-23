---
name: I2I direct-edit prompt engineering
description: Why Flux Kontext / Nano Banana Pro image edits "do nothing", and how the auto-optimizer fixes it
---

Direct-edit image models — Flux Kontext (`Qubico/flux1-dev-advanced`, task_type `kontext`) and
Nano Banana Pro (`gemini`, task_type `nano-banana-pro`) — edit a reference image in place and
follow whatever signal **dominates** the instruction.

**The "nothing changes" failure is prompt phrasing, NOT a bug.** When a user's edit prompt is
dominated by preservation language ("preserve everything else exactly", "keep all guests in their
current positions", long keep-lists), the model obeys the dominant instruction and freezes the
image — no visible change. Verified directly against the live PiAPI: a clean action-first prompt
("Change the blue curtains to red. Keep everything else the same.") works perfectly; the same
scene with a 70%-preservation prompt produces a near-identical copy.

**Rule:** lead with concrete edits (REMOVE / ADD / MOVE, with locations), keep preservation to ONE
short clause at the end ("Keep the existing decor, lighting, and architecture unchanged.").

**How we apply it:** `server/services/i2i-prompt-optimizer.ts` (`optimizeI2IEditPrompt`) runs an LLM
rewrite that restructures verbose/preservation-heavy prompts into action-first instructions. It is
fail-open — returns the original prompt on any LLM failure, short prompts (<40 chars), or refusal-
looking output. Wired in `job-processor.ts` ONLY for the direct-edit providers (`isKontextProvider`
= `flux-kontext` || `nano-banana-pro`); traditional img2img providers keep the subject-extraction
prefix instead.

**Also note:** the old I2I prefix ("Place the subject from the reference image into this scene…")
must NOT be prepended for Kontext/Nano-Banana — it corrupts edit intent. Kontext Pro does not exist
on PiAPI; Kontext Dev cannot do complex spatial rearrangements (use Nano Banana Pro for those).
