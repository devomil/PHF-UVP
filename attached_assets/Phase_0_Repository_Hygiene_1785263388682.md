# Phase 0 — Repository Hygiene

**Target repo:** `devomil/PHF-UVP`
**Depends on:** nothing
**Blocks:** Phase A1
**Estimated scope:** under 1 hour. No feature code.

---

## Objective

Remove two dead files that actively mislead automated agents, and confirm no credentials are committed to a repository that is currently public.

This phase changes **zero runtime behavior**. If any step alters application behavior, stop and report — that means the file was not dead and this analysis was wrong.

---

## Why now

1. `attached_assets/piapi-video-service_1771266564432.ts` is a stale fork of `server/services/piapi-video-service.ts`, roughly 700 lines behind. It is missing `seedance-2*`, `sora-2`, `sora-2-pro`, and `wan26-txt2video`. It is not imported by anything. Any agent searching the repo by filename gets two hits and can edit the wrong one.
2. `server/services/health-script-context.ts` holds a hardcoded Pine Hill Farm persona. `replit.md` states the script pipeline "completely bypasses" it. Bypassed code gets re-imported by future agents.
3. The repository is public. Provider routing logic and tuning constants are readable by anyone. That is a business decision and is out of scope here — but committed **credentials** are not, and must be checked.

---

## Out of scope

- Making the repository private (owner's decision, deferred)
- Any change to `server/services/piapi-video-service.ts` itself
- Any change to `script-pipeline-service.ts` logic
- Deleting anything else in `attached_assets/` or `uploads/`
- Refactoring, reformatting, or "tidying" adjacent code

---

## Running order

### Step 1 — Verify the duplicate is unreferenced

```bash
grep -rn "piapi-video-service_1771266564432" --include="*.ts" --include="*.tsx" --include="*.json" .
grep -rn "attached_assets/piapi" --include="*.ts" --include="*.tsx" .
```

**Expected:** zero matches outside the file itself.

**If there are matches:** STOP. Report the matches. Do not delete.

### Step 2 — Delete the stale fork

```bash
git rm attached_assets/piapi-video-service_1771266564432.ts
```

### Step 3 — Verify the Pine Hill persona is unreferenced

```bash
grep -rn "health-script-context" --include="*.ts" --include="*.tsx" .
grep -rni "pine hill" --include="*.ts" --include="*.tsx" server/ shared/ client/
```

**Expected:** matches only inside `health-script-context.ts` itself.

**If `script-pipeline-service.ts` or any other live service still imports it:** STOP. Report every import site with line numbers. Do not delete. Removing a live import is a Phase A1 concern, not a hygiene concern.

**If `grep -i "pine hill"` returns hits in files other than `health-script-context.ts`:** report them but do not edit them in this phase.

### Step 4 — Delete the persona file

Only if Step 3 came back clean:

```bash
git rm server/services/health-script-context.ts
```

### Step 5 — Secret scan

```bash
npx trufflehog git file://. --only-verified --no-update
```

If `trufflehog` is unavailable in the environment, use:

```bash
npx gitleaks detect --source . --no-git -v
```

Report every finding. **Do not attempt to rotate or remove anything.** Credential rotation is a human task — history rewriting does not un-publish a leaked key, so the owner must rotate at the provider. Specifically check for: `.env` files, `AYRSHARE_API_KEY`, `SENDGRID_FROM_EMAIL`, `PIAPI_API_KEY`, `RUNWAY_API_KEY`, AWS access keys, `SESSION_SECRET`, and any Neon connection string.

### Step 6 — Confirm nothing broke

```bash
npx tsc --noEmit
npm run build
```

Both must pass.

---

## Success criteria

- [ ] `attached_assets/piapi-video-service_1771266564432.ts` no longer exists
- [ ] `server/services/health-script-context.ts` no longer exists, **or** a report explains which live file still imports it
- [ ] `grep -rn "piapi-video-service"` returns exactly one file: `server/services/piapi-video-service.ts`
- [ ] `npx tsc --noEmit` passes with no new errors
- [ ] `npm run build` succeeds
- [ ] Secret scan output pasted into the completion report, including "no findings" if clean
- [ ] Application starts and `GET /api/health` returns `{"status":"ok"}`

---

## Behavior contract

Things an agent will want to improve, and must not:

1. **Do not delete anything not named in this document.** `attached_assets/` and `uploads/` contain other files. Leave them.
2. **Do not rotate, redact, or rewrite git history** in response to a secret-scan finding. Report only.
3. **Do not refactor `piapi-video-service.ts`.** Phase A1 edits it. Touching it here creates a merge conflict with the next phase.
4. **Do not remove a live import to make a deletion possible.** If a file is still referenced, it is not dead; report and stop.
5. **Do not reformat, re-lint, or reorganize files you happened to open.**

---

## Completion report

Reply with:

- Output of each grep in Steps 1 and 3
- Confirmation of both deletions, or the blocking reason
- Full secret-scan output
- `tsc` and `build` results
- Anything encountered that this document did not anticipate
