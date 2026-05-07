// Single predicate for the admin-unlimited credit posture.
// See replit.md → "Admin-Unlimited Credits" for the contract.

import { db } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";

export interface AdminCheckUser {
  role?: string | null;
}

export function isAdminUnlimited(user: AdminCheckUser | null | undefined): boolean {
  return !!user && user.role === "admin";
}

export async function isAdminUnlimitedById(userId: string): Promise<boolean> {
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return isAdminUnlimited(u ?? null);
}
