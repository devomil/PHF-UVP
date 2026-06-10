# Memory Index

- [Scene brand references](scene-brand-references.md) — canonical field is `assetUrl`; legacy readers only read `url`/`imageUrl`, so check every flatten site when adding refs.
- [Testing long pipelines](testing-long-pipelines.md) — bash caps at 120s and background procs get reaped; trim big PDFs with pdfseparate+pdfunite to smoke-test slow AI pipelines.
