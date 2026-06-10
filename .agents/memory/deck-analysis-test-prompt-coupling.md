---
name: Deck analysis test LLM routing coupling
description: The deck-to-video analysis test routes mocked LLM responses by a substring of the system prompt — rewording the prompt silently breaks the whole suite.
---

The deck-analysis-service test suite stubs the LLM transport and decides which
canned response to return by matching a substring of the system prompt:
`'senior video strategist'` selects the analysis response, `'assign real deck
images'` selects the image→scene mapping response.

**Why:** both pipeline stages share one mocked `createChatCompletion`, so the
only way the stub can tell them apart is the prompt text. If you reword the
*opening* of the analysis system prompt and drop the routing phrase, every
analysis test fails with `Unexpected LLM systemPrompt in test: …` even though
production is perfectly fine — a confusing failure that looks like a logic bug
but is really a test-fixture coupling.

**How to apply:** when changing the analysis or mapping prompt wording, keep the
routing phrase intact OR update the matching substring in the test's `routeLlm`
helper in lockstep.
