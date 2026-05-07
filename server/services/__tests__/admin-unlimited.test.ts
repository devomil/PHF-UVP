// Phase NC-02 follow-up — Admin-unlimited posture: consumeCredits logs
// a tagged transaction without decrementing balance, getAvailableCredits
// surfaces unlimited:true, and canAccessProvider returns true for any
// provider. Non-admin paths are unchanged (covered by credits-service.test.ts).

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../db";
import { subscriptions, creditTransactions, users } from "../../../shared/schema";
import { eq } from "drizzle-orm";
import {
  consumeCredits,
  getAvailableCredits,
  canAccessProvider,
  canAfford,
} from "../credits-service";

const ADMIN_ID = "test-admin-unlimited-nc02";

async function ensureAdmin() {
  const existing = await db.select().from(users).where(eq(users.id, ADMIN_ID));
  if (existing.length === 0) {
    await db.insert(users).values({
      id: ADMIN_ID,
      email: "admin-unlimited-test@neuralcut.ai",
      role: "admin",
      firstName: "Admin",
      lastName: "Test",
    });
  } else {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, ADMIN_ID));
  }
}

async function resetAdminSubscription() {
  await db.delete(creditTransactions).where(eq(creditTransactions.userId, ADMIN_ID));
  await db.delete(subscriptions).where(eq(subscriptions.userId, ADMIN_ID));
  await db.insert(subscriptions).values({
    userId: ADMIN_ID,
    plan: "FREE_TRIAL",
    status: "ACTIVE",
    monthlyGC: 50,
    currentGC: 5, // intentionally low — would be insufficient for any normal generation
    topupGC: 0,
    billingCycleStart: new Date(),
    billingCycleEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });
}

describe("admin-unlimited posture", () => {
  beforeEach(async () => {
    await ensureAdmin();
    await resetAdminSubscription();
  });

  it("consumeCredits logs an admin_unlimited row but does NOT decrement balance", async () => {
    const r = await consumeCredits(ADMIN_ID, 100, {
      provider: "veo-3",
      jobId: "admin-job-1",
      description: "test",
    });
    expect(r.ok).toBe(true);
    expect(r.source).toBe("admin_unlimited");
    expect(r.chargedGC).toBe(0);
    expect(r.wouldHaveChargedGC).toBe(100);

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, ADMIN_ID));
    expect(sub.currentGC).toBe(5); // unchanged
    expect(sub.topupGC).toBe(0);

    const txs = await db.select().from(creditTransactions).where(eq(creditTransactions.userId, ADMIN_ID));
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("GENERATION");
    expect(txs[0].source).toBe("admin_unlimited");
    expect(txs[0].gcAmount).toBe(-100);
    expect(txs[0].provider).toBe("veo-3");
  });

  it("consumeCredits is idempotent on duplicate jobId for admins", async () => {
    await consumeCredits(ADMIN_ID, 50, { provider: "kling-2.6", jobId: "admin-dup-1" });
    const r2 = await consumeCredits(ADMIN_ID, 50, { provider: "kling-2.6", jobId: "admin-dup-1" });
    expect(r2.ok).toBe(true);
    const txs = await db.select().from(creditTransactions).where(eq(creditTransactions.userId, ADMIN_ID));
    expect(txs).toHaveLength(1);
  });

  it("getAvailableCredits returns unlimited:true with monthlyUsedGC for admins", async () => {
    await consumeCredits(ADMIN_ID, 30, { provider: "veo-3", jobId: "admin-snap-1" });
    await consumeCredits(ADMIN_ID, 70, { provider: "veo-3", jobId: "admin-snap-2" });

    const snap = await getAvailableCredits(ADMIN_ID);
    expect(snap.unlimited).toBe(true);
    expect(snap.warningLevel).toBe("calm");
    expect(snap.percentUsed).toBe(0);
    expect(snap.monthlyUsedGC).toBe(100);
    // raw balance fields still populated (unchanged from sub row)
    expect(snap.subscriptionGC).toBe(5);
  });

  it("canAccessProvider returns true for admin even on locked provider", async () => {
    // FREE_TRIAL should not allow sora-2-pro normally
    expect(await canAccessProvider(ADMIN_ID, "sora-2-pro")).toBe(true);
    expect(await canAccessProvider(ADMIN_ID, "veo-3")).toBe(true);
  });

  it("canAfford returns ok:true with admin_unlimited source regardless of balance", async () => {
    const r = await canAfford(ADMIN_ID, 999_999);
    expect(r.ok).toBe(true);
    expect(r.shortfall).toBe(0);
    expect(r.source).toBe("admin_unlimited");
  });
});
