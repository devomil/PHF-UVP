---
name: Dev HMR reload wipes in-memory state
description: Why a long/event-loop-blocking dev request makes the page "jump back home", and how to prevent it.
---

# Long/blocking dev requests drop the Vite HMR socket → full page reload → state loss

**Symptom:** A multi-step in-browser flow (e.g. Deck-to-Video: pick mode → upload → analyze)
"starts working, then refreshes back to the home/picker screen" mid-request, losing all
in-memory React state. Looks like an auth redirect or a server crash — it is neither.

**Cause:** During a long, synchronous request that blocks the Node event loop (here:
in-process `pdf-parse` on a ~22MB buffer during deck analysis), Vite's HMR websocket
heartbeat is missed and the socket drops (`[vite] server connection lost. Polling for
restart...`). On reconnect Vite force-reloads the page, which wipes any state held only in
React memory. This is **dev-preview-only** — production `serveStatic` has no HMR, so it
never reloads.

**Two-part fix (apply both):**
1. Keep heavy work OFF the event loop. Shell out to child processes (here: Poppler
   `pdftoppm` + `pdftotext` via `Promise.all`) instead of CPU-bound in-process parsing.
   This removes the root cause and also helps production latency.
2. Persist critical multi-step in-memory flow state to `sessionStorage` and rehydrate on
   mount (lazy `useState` initializer + a persist `useEffect`), clearing it on Back and on
   success. A safety net so ANY reload (HMR or otherwise) restores the user's place.

**Why:** dev-only reloads are easy to misdiagnose as crashes/redirects. The real tell is the
"server connection lost" HMR line in the browser console AND the absence of a fresh server
startup banner in the workflow logs (no restart happened).
