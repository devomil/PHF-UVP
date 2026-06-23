---
name: LLM fallback model must be account-accessible
description: Why a fail-open LLM helper silently no-op'd forever — broken Anthropic fallback model id
---

The Anthropic-direct fallback in the LLM client (`piapi-llm-client.ts`) only runs when the
PiAPI primary fails (e.g. a short per-call `timeoutMs` aborts it). If the fallback's model id is
NOT one the `ANTHROPIC_API_KEY` account can access, Anthropic returns **HTTP 404
`not_found_error`** — not 401. That looks like a model problem, not an auth problem.

**The trap:** a *fail-open* LLM helper (returns its input unchanged on any error — e.g.
`optimizeI2IEditPrompt`) turns this into a permanent **silent no-op**. The feature appears wired and
"works" (no crash), but the LLM step never actually runs, so output never changes. The user sees
"nothing happened" with zero errors surfaced.

**Why:** the helper's whole point is to never break generation, so it swallows the 404 and uses the
raw input. Combine that with a primary that times out under load and the fallback runs *every time* —
and fails *every time* — invisibly.

**How to apply:**
- The fallback model id must be verified against the deployed key: `curl https://api.anthropic.com/v1/models -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"`. This account's accessible Sonnet ids are gateway aliases (e.g. `claude-sonnet-4-6`, `claude-sonnet-4-5-20250929`), NOT the public dated ids — do not assume a "real" Anthropic id works.
- When a fail-open helper "isn't doing anything," check the logs for the swallowed warning and exercise the *fallback* path directly (`preferDirect: true` or force a primary failure) — a green primary hides a dead fallback.
- Keep all LLM model ids in one place; a model id is operational config, and an env override + startup list-models check would have made this visible immediately.
