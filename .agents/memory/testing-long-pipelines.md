---
name: Testing long pipelines
description: How to smoke-test slow AI pipelines given the bash time cap and process reaping in this env.
---

# Smoke-testing slow AI pipelines

**Constraints in this environment:**
- The bash tool caps at 120s per call.
- Detached/background/nohup/setsid processes get reaped between tool calls — they will not
  survive to write output later, and `console.log` buffered to a pipe is lost on kill.
- A full multi-page deck/video AI pipeline can exceed 180s, so it cannot complete in one call.

**Workaround that works:** shrink the input so the real pipeline finishes under 120s, then run
it synchronously in a single `tsx` call and print results at the end.

For PDFs, only `pdfseparate` + `pdfunite` are available (qpdf, gs, mutool are MISSING):
```
pdfseparate -f 1 -l 3 big.pdf /tmp/out/p-%d.pdf
pdfunite /tmp/out/p-1.pdf /tmp/out/p-2.pdf /tmp/out/p-3.pdf /tmp/out/small.pdf
```
Then call the real service function on `small.pdf` synchronously. A trimmed 3-page deck ran the
full analyze pipeline (render → vision LLM → S3 host → scene mapping) in ~20s, validating every
dependency without hitting the timeout.
