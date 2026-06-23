import { llmClient } from "./piapi-llm-client";

// Direct-edit image models (Flux Kontext, Nano Banana Pro / Gemini) follow an
// instruction literally. When a user's edit request is dominated by preservation
// language ("preserve everything else exactly", "keep all guests in their current
// positions", long lists of things to KEEP), the model obeys the dominant signal
// and freezes the image — making no visible change. This rewrites such requests
// into an ACTION-FIRST edit instruction: concrete remove/add/change steps up
// front, with a short "keep the rest" clause at the end.
//
// It is intentionally conservative: on ANY failure (no LLM, timeout, empty/garbage
// result) it returns the original prompt unchanged so generation never breaks.

const SYSTEM_PROMPT = `You rewrite image-EDITING instructions for a direct image-edit model (Flux Kontext / Gemini Nano Banana). These models edit a provided reference image in place. They follow whatever signal dominates the instruction.

PROBLEM: When an instruction is dominated by preservation language (e.g. "preserve everything else exactly", "keep all guests in their current positions", long lists of things to keep), the model freezes the image and makes NO visible change.

YOUR JOB: Rewrite the user's request so the CHANGES come first and dominate, and preservation is a single short clause at the end.

RULES:
1. Lead with the concrete edits as direct imperatives: what to REMOVE, what to ADD, what to MOVE/CHANGE. Be specific about location ("in the foreground center", "on the left of the stage").
2. Remove scene-freezing phrases entirely: "all existing X in their current positions", "preserve everything else exactly", exhaustive keep-lists. Replace with ONE short clause, e.g. "Keep the existing decor, lighting, and architecture unchanged."
3. Preserve the user's actual creative intent and concrete details (counts, colors, materials, arrangement). Do not invent new requirements or drop requested changes.
4. Keep it concise — aim for under 90 words. No preamble, no markdown, no quotes. Output ONLY the rewritten instruction text.
5. If the request is already action-first and concise, return it essentially as-is.`;

function looksLikeRewrite(original: string, rewritten: string): boolean {
  const r = rewritten.trim();
  if (r.length < 12) return false;
  // Reject obvious refusals / meta-commentary instead of an instruction.
  const lower = r.toLowerCase();
  if (
    lower.startsWith("i cannot") ||
    lower.startsWith("i'm sorry") ||
    lower.startsWith("sorry") ||
    lower.startsWith("as an ai") ||
    lower.startsWith("here is") ||
    lower.startsWith("here's")
  ) {
    return false;
  }
  return true;
}

/**
 * Rewrite a preservation-heavy I2I edit prompt into an action-first instruction.
 * Returns the original prompt unchanged on any failure or when optimization
 * isn't warranted. Never throws.
 */
export async function optimizeI2IEditPrompt(rawPrompt: string): Promise<{ prompt: string; optimized: boolean }> {
  const original = (rawPrompt || "").trim();

  // Too short to benefit, or no LLM available — pass through untouched.
  if (original.length < 40 || !llmClient.isAvailable()) {
    return { prompt: original, optimized: false };
  }

  try {
    const result = await llmClient.createChatCompletion({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: original }],
      maxTokens: 400,
      temperature: 0.3,
      timeoutMs: 20000,
    });

    const rewritten = (result.text || "").trim();
    if (!looksLikeRewrite(original, rewritten)) {
      console.warn(`[I2I-PromptOptimizer] Rewrite rejected (unusable output), using original prompt`);
      return { prompt: original, optimized: false };
    }

    console.log(`[I2I-PromptOptimizer] Rewrote edit prompt (${original.length}→${rewritten.length} chars)`);
    console.log(`[I2I-PromptOptimizer]   original: "${original.slice(0, 140)}${original.length > 140 ? "…" : ""}"`);
    console.log(`[I2I-PromptOptimizer]   rewritten: "${rewritten.slice(0, 140)}${rewritten.length > 140 ? "…" : ""}"`);
    return { prompt: rewritten, optimized: true };
  } catch (err: any) {
    console.warn(`[I2I-PromptOptimizer] Optimization failed (${err?.message || err}), using original prompt`);
    return { prompt: original, optimized: false };
  }
}
