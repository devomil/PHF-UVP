---
name: Deck-to-Video image anchoring
description: How deck slide images are anchored to scenes and why manual overrides persist by scene index.
---

# Deck-to-Video image→scene anchoring

Deck-to-Video projects stash usable slide images in `progress.deckImages`
(`{id,url,pageNumber,label}`). The generate-script route anchors them onto
scenes by writing `scene.brandReferences = [{assetUrl, tag:'image1', label}]`
+ `scene.useOmniReference = true`. Auto-matching uses an LLM
(`mapDeckImagesToScenes` in deck-analysis-service.ts).

## Manual overrides persist by scene INDEX, not scene id
**Rule:** User picks of which deck slide anchors which scene are stored in
`progress.deckImageAssignments` as `{sceneIndex, imageId|null}` (null = explicit
"AI visuals, no slide"). generate-script applies these FIRST (claiming those
scenes + images), then auto-maps the remainder onto unclaimed scenes.

**Why:** Scene ids are index-derived (`scene_${pad(index+1)}_${type}` in
universal-video-service.ts) and regenerated on every script run, so the id is
NOT stable across regeneration. Scene index is the only stable key, which is why
overrides must key on index for "survive regeneration" to work.

**How to apply:** Any future feature that must persist per-scene state across
script regeneration for deck (or pipeline) projects should key on scene index
and re-apply in the generate-script post-processing step — not on scene id.
`mapDeckImagesToScenes` validates `sceneIndex < scenes.length` against the array
you PASS it, so always pass the full scenes array (with real indices) and filter
results afterward rather than passing a subset.
