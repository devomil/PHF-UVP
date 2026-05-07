// Client mirror of server's isAdminUnlimited — reads the server-derived
// unlimited flag on CreditSnapshot (server is source of truth).

import type { CreditSnapshot } from "@/hooks/use-credits";

export function isAdminUnlimitedSnapshot(
  snap: CreditSnapshot | undefined | null,
): snap is CreditSnapshot & { unlimited: true } {
  return !!snap?.unlimited;
}
