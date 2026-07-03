---
name: Runway is a multi-model gateway; app-side kill-switch only covers this app
description: Why Seedance/Veo charges on the Runway dashboard are not from this app, and how the Runway cost guard is scoped
---

Runway's API (`api.dev.runwayml.com`) is now a **multi-model gateway** that resells
third-party models (Seedance 2.0/Fast, Veo-3/3.1) alongside its own (Gen-4.5, Aleph,
Act-Two). Its usage dashboard itemizes those resold models — so a "Seedance 2.0" or
"Veo-3" line on the Runway usage page looks alarming but says nothing about which app
made the call.

**This app cannot produce a Seedance/Veo line item on Runway.** The only Runway client
is `server/services/runway-video-service.ts`, and it only ever sends Runway-native model
IDs (gen4.5 / aleph2 / act_two / gen3a_turbo). There is no seedance/veo mapping in the
code or in git history, and the app's credit ledger confirms its all-time Runway
footprint is tiny (a handful of Aleph-2 + one Gen-4 task). Seedance/Veo in the app go
through PiAPI (`api.piapi.ai`, `apiProvider:'piapi'`), a totally different host/account.

**Why:** user (admin ryan@pinehillfarm.co) saw 7×$20/2000-credit Seedance charges on
Runway and suspected the app double-charged. Proven false: the app never sends Seedance
to Runway; the ledger showed zero Runway/Seedance on the charge day.

**How to apply:** If a user reports unexpected Runway charges for Seedance/Veo, don't
assume the app did it — check whether the app sends those model IDs to Runway at all
(it doesn't). The likely source is another tool/leaked key using the same
`RUNWAY_API_KEY`, or direct use of Runway's web Playground/Recipes. The fix is on the
user's side: **rotate `RUNWAY_API_KEY` and disable Runway auto-recharge.** The app-side
kill-switch (`assertRunwayAllowed` in runway-video-service.ts, env `RUNWAY_DISABLED` /
`RUNWAY_ALLOWED_MODELS`) only governs THIS app's own Runway usage — it cannot stop an
external key holder.
