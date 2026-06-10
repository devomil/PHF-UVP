---
name: Scene brand references
description: The canonical URL field for scene brand/product references and the legacy readers that miss it.
---

# Scene brand references (omni_reference)

A scene's `brandReferences[]` entries use **`assetUrl`** as the canonical URL field,
alongside `tag` (e.g. `image1`) and `label`, and the scene sets `useOmniReference = true`.
The main omni_reference generation path reads `assetUrl`.

**Why:** Some older consumers (notably the product-showcase snapshot flatten in
`video-generation-worker.ts`) historically read only `r.url || r.imageUrl` and silently
fell back to nothing when given canonical refs. Anything that writes brand refs with only
`assetUrl` would be invisible to those readers.

**How to apply:** When adding a new feature that writes `scene.brandReferences` (e.g. the
Deck-to-Video image anchoring), write `assetUrl`. When adding a new *reader* that flattens
refs to URLs, read `r.assetUrl || r.url || r.imageUrl` (assetUrl first). Grep for every
flatten site before assuming refs propagate end-to-end.
