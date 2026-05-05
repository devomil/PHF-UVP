// Phase NC-01 — Credit engine unit tests.
// Covers: ensureSubscription, atomic consume w/ idempotency,
// subscription→topup spend ordering, refund routing, monthly reset rollover.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../db";
import { subscriptions, creditTransactions, generationRates, users } from "../../../shared/schema";
import { eq } from "drizzle-orm";
import {
  consumeCredits,
  refundCredits,
  resetMonthlyCredits,
  addTopUpCredits,
  getAvailableCredits,
  getCreditCost,
  canAfford,
} from "../credits-service";

const TEST_USER_ID = "test-user-credits-nc01";

async function ensureTestUser() {
  const existing = await db.select().from(users).where(eq(users.id, TEST_USER_ID));
  if (existing.length === 0) {
    await db.insert(users).values({
      id: TEST_USER_ID,
      email: "credits-test@neuralcut.ai",
      passwordHash: "x",
      firstName: "Test",
      lastName: "User",
    } as any);
  }
}

async function resetUser(plan: string, current: number, topup: number, monthly: number) {
  await db.delete(creditTransactions).where(eq(creditTransactions.userId, TEST_USER_ID));
  await db.delete(subscriptions).where(eq(subscriptions.userId, TEST_USER_ID));
  await db.insert(subscriptions).values({
    userId: TEST_USER_ID,
    plan,
    status: "ACTIVE",
    monthlyGC: monthly,
    currentGC: current,
    topupGC: topup,
    billingCycleStart: new Date(),
    billingCycleEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });
}

describe("credits-service", () => {
  beforeEach(async () => {
    await ensureTestUser();
  });

  it("seeds rates lookup with sensible defaults", async () => {
    const rows = await db.select().from(generationRates).limit(1);
    if (rows.length === 0) return; // seed hasn't run in this test DB; skip
    const cost = await getCreditCost("kling-2.6", "std", 5);
    expect(cost).toBeGreaterThan(0);
  });

  it("consumes from subscription first, then top-up", async () => {
    await resetUser("STARTER", 5, 10, 200);
    const r = await consumeCredits(TEST_USER_ID, 8, { provider: "kling-2.6", jobId: "job-mix-1" });
    expect(r.consumedFromSubscription).toBe(5);
    expect(r.consumedFromTopup).toBe(3);
    expect(r.newSubscriptionGC).toBe(0);
    expect(r.newTopupGC).toBe(7);
    expect(r.source).toBe("mixed");
  });

  it("is idempotent on jobId", async () => {
    await resetUser("STARTER", 50, 0, 200);
    await consumeCredits(TEST_USER_ID, 5, { provider: "kling-2.6", jobId: "job-idem-1" });
    const r2 = await consumeCredits(TEST_USER_ID, 5, { provider: "kling-2.6", jobId: "job-idem-1" });
    expect(r2.alreadyConsumed).toBe(true);
    const snap = await getAvailableCredits(TEST_USER_ID);
    expect(snap.subscriptionGC).toBe(45);
  });

  it("rejects insufficient balance", async () => {
    await resetUser("STARTER", 2, 1, 200);
    await expect(consumeCredits(TEST_USER_ID, 10, { provider: "kling-2.6", jobId: "job-deny-1" })).rejects.toThrow(/INSUFFICIENT/);
  });

  it("refunds back to subscription bucket up to monthly cap", async () => {
    await resetUser("STARTER", 50, 0, 200);
    await consumeCredits(TEST_USER_ID, 10, { provider: "kling-2.6", jobId: "job-refund-1" });
    let snap = await getAvailableCredits(TEST_USER_ID);
    expect(snap.subscriptionGC).toBe(40);
    await refundCredits(TEST_USER_ID, 10, { jobId: "job-refund-1", reason: "failed" });
    snap = await getAvailableCredits(TEST_USER_ID);
    expect(snap.subscriptionGC).toBe(50);
    // double-refund is no-op
    await refundCredits(TEST_USER_ID, 10, { jobId: "job-refund-1" });
    snap = await getAvailableCredits(TEST_USER_ID);
    expect(snap.subscriptionGC).toBe(50);
  });

  it("monthly reset applies rollover percent capped to max", async () => {
    await resetUser("GROWTH", 200, 0, 500); // 200 unused
    const start = new Date();
    const end = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await resetMonthlyCredits(TEST_USER_ID, "GROWTH" as any, start, end);
    // GROWTH: 25% rollover capped at 125. 200 * 0.25 = 50 → newCurrent = 500 + 50.
    const snap = await getAvailableCredits(TEST_USER_ID);
    expect(snap.subscriptionGC).toBe(550);
  });

  it("monthly reset clamps rollover to plan max", async () => {
    await resetUser("GROWTH", 1000, 0, 500); // huge unused balance
    const start = new Date();
    const end = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await resetMonthlyCredits(TEST_USER_ID, "GROWTH" as any, start, end);
    // 1000 * 0.25 = 250 but max is 125 → newCurrent = 500 + 125 = 625
    const snap = await getAvailableCredits(TEST_USER_ID);
    expect(snap.subscriptionGC).toBe(625);
  });

  it("addTopUpCredits adds to topup bucket only", async () => {
    await resetUser("STARTER", 200, 0, 200);
    await addTopUpCredits(TEST_USER_ID, 500, "PACK_500");
    const snap = await getAvailableCredits(TEST_USER_ID);
    expect(snap.subscriptionGC).toBe(200);
    expect(snap.topupGC).toBe(500);
  });

  it("canAfford reports source correctly", async () => {
    await resetUser("STARTER", 20, 0, 200);
    const a = await canAfford(TEST_USER_ID, 10);
    expect(a.ok).toBe(true);
    expect(a.source).toBe("subscription");
    const b = await canAfford(TEST_USER_ID, 999);
    expect(b.ok).toBe(false);
    expect(b.shortfall).toBe(979);
  });
});
