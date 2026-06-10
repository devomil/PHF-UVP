# Memory Index

- [Scene brand references](scene-brand-references.md) — canonical field is `assetUrl`; legacy readers only read `url`/`imageUrl`, so check every flatten site when adding refs.
- [Testing long pipelines](testing-long-pipelines.md) — bash caps at 120s and background procs get reaped; trim big PDFs with pdfseparate+pdfunite to smoke-test slow AI pipelines.
- [pdf-parse debug mode breaks under Vitest](pdf-parse-vitest-debug-mode.md) — pdf-parse throws ENOENT on import in tests; mock it to `pdf-parse/lib/pdf-parse.js` to keep real parsing.
