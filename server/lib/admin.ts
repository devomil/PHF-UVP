// Phase NC-02 follow-up — Single source of truth for the admin-unlimited
// posture. Any user with role="admin" (today: ryan@pinehillfarm.co via the
// ADMIN_EMAILS allowlist in server/auth.ts; future admins promoted via the
// admin portal) gets:
//   • free credits (consumeCredits logs a tagged transaction but never
//     decrements the subscription balance),
//   • unconditional provider access (canAccessProvider returns true),
//   • a 402/403 short-circuit (the typed credit envelopes never fire).
//
// Every bypass site reads from this predicate so adding more admins later
// is a single-line allowlist change with no scattered role checks.

import { db } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";

export interface AdminCheckUser {
  role?: string | null;
}

export function isAdminUnlimited(user: AdminCheckUser | null | undefined): boolean {
  return !!user && user.role === "admin";
}

// Service-internal helper for code paths that only have a userId (e.g.
// consumeCredits, the queue workers). Cached lookup would be nice but the
// volume is low (one query per generation) and keeping it stateless avoids
// stale role bugs after a promotion.
export async function isAdminUnlimitedById(userId: string): Promise<boolean> {
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return isAdminUnlimited(u ?? null);
}
