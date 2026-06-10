# Memory Index

- [Scene brand references](scene-brand-references.md) — canonical field is `assetUrl`; legacy readers only read `url`/`imageUrl`, so check every flatten site when adding refs.
- [Testing long pipelines](testing-long-pipelines.md) — bash caps at 120s and background procs get reaped; trim big PDFs with pdfseparate+pdfunite to smoke-test slow AI pipelines.
- [pdf-parse debug mode breaks under Vitest](pdf-parse-vitest-debug-mode.md) — pdf-parse throws ENOENT on import in tests; mock it to `pdf-parse/lib/pdf-parse.js` to keep real parsing.
- [Deck-to-Video anchoring](deck-to-video-anchoring.md) — per-scene deck-image overrides must persist by scene INDEX (ids are index-derived + regenerated), re-applied in generate-script.
- [LLM JSON truncation](llm-json-truncation.md) — LLM JSON cut at max_tokens = invalid JSON; put long arrays LAST, give token headroom, and repair truncated tails before throwing.
