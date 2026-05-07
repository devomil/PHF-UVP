// Phase NC-02 follow-up — Single client predicate for the admin-unlimited
// posture. Mirrors the server-side `isAdminUnlimited(user)` helper but
// reads from the server-derived `unlimited` flag on `CreditSnapshot`
// (the client never decides admin status on its own — the server is the
// source of truth via the user's role). Route every UI gating decision
// through this helper so adding a future client surface is a one-line
// import, not another `snap?.unlimited` branch sprinkled around.

import type { CreditSnapshot } from "@/hooks/use-credits";

// Typed as a TypeScript user-defined type guard so callers can dereference
// snapshot fields safely inside the truthy branch (e.g. snap.monthlyUsedGC
// without a `?.`).
export function isAdminUnlimitedSnapshot(
  snap: CreditSnapshot | undefined | null,
): snap is CreditSnapshot & { unlimited: true } {
  return !!snap?.unlimited;
}
