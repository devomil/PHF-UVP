---
name: LLM JSON truncation
description: Why LLM JSON responses silently truncate at max_tokens and how to make parsing tolerant.
---

# LLM JSON responses truncate at max_tokens → invalid JSON

When an LLM is asked for structured JSON, hitting the `max_tokens` output cap cuts
the response mid-token, producing unparseable JSON (e.g. "Expected ',' or ']'
after array element"). The route then throws/500s and the UI looks like it did
nothing. This bit the "Deck to Video" deck-analysis call (a 24-page deck overran a
2500-token cap).

**Rules to apply when designing an LLM JSON contract:**
- Put the longest, variable-length array (one entry per page/item) **LAST** in the
  schema. If the response truncates, a tolerant parser can still recover all the
  top-level metadata plus the items that fully arrived.
- Set `max_tokens` with real headroom for the worst case (entries × per-entry size
  + the free-text brief), not a round number that feels safe.
- Cap free-text fields in the prompt (e.g. label/reason ≤ 12 words, brief ≤ ~220
  words) so output size is bounded and predictable.
- Parse defensively: direct parse → trim to outermost brackets → **repair a
  truncated tail** (single pass tracking string/escape state + a bracket stack,
  cut at the last safe boundary, append the missing closers) → only then throw.
  Critical subtlety: a closed string that is an object **key** (`"reason"`) is NOT
  a safe cut point — track an `expectValue` flag so only completed *values*,
  closed containers, and pre-comma positions are recorded as cut boundaries.

**Why:** the failure is silent and intermittent (only large inputs hit the cap),
so it's easy to ship and hard to reproduce. Schema ordering + a repair fallback
turns a hard 500 into graceful degradation.

**Where:** `server/services/deck-analysis-service.ts`
(`parseJsonFromLLM` / `repairTruncatedJson`). The LLM client
(`server/services/piapi-llm-client.ts`) passes `max_tokens` straight through with
no cap, so bumping it is safe (Sonnet supports ≥8192 output tokens).
