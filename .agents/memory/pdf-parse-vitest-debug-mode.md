---
name: pdf-parse debug mode breaks under Vitest
description: Why pdf-parse throws ENOENT in tests and how to test code that uses it
---

`pdf-parse`'s package entry (`index.js`) runs a debug harness whenever
`module.parent` is falsy. Under Vitest that condition is true, so on import it
tries to read a bundled sample file `./test/data/05-versions-space.pdf` (relative
to CWD) and throws `ENOENT` *before* your own code runs. The normal app runtime
(tsx/esbuild) sets `module.parent`, so this never happens in production — it is a
test-environment-only trap.

**Symptom:** code that calls pdf-parse silently returns empty text in tests
(callers often `.catch()` extraction errors), or the import throws ENOENT for
`05-versions-space.pdf`.

**Fix in tests:** redirect the import to the real implementation, bypassing the
debug entrypoint:
```ts
vi.mock('pdf-parse', async () => {
  // @ts-expect-error — no types for the internal lib build
  const real = await import('pdf-parse/lib/pdf-parse.js');
  return { default: (real as any).default || real };
});
```
This keeps genuine PDF parsing (real text extraction) — it is NOT a stub of the
parsing logic, only a bypass of the broken debug shim.

**Why it matters:** `document-extraction-service.ts` depends on pdf-parse. NOTE:
the Deck-to-Video `analyzeDeck` path NO LONGER uses pdf-parse — it now extracts
text with Poppler `pdftotext` as a child process to keep the event loop free, so
only tests that exercise real pdf-parse extraction (document ingestion) need this
mock, or they will assert against empty text.
