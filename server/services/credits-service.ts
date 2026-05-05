// Phase NC-01 — Credit engine.
//
// All GC mutation goes through here. Concurrency-safe via Postgres
// row-level locks (`SELECT … FOR UPDATE`) inside a transaction. Idempotent
// on `jobId` so duplicate consumes from network retries are no-ops.
// Subscription credits are spent BEFORE top-up credits.

import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  subscriptions,
  creditTransactions,
  generationRates,
  users,
  type Subscription,
} from "../../shared/schema";
import { PLAN_CONFIG, type PlanTier } from "../config/plans";
import { planAllowsProvider } from "../config/providerPermissions";
import { eq, and } from "drizzle-orm";

// Caller-provided transaction handle, or `undefined` to open a fresh one.
// Webhook flow passes its own `tx` so the business mutation + the
// `billing_events` dedupe insert commit (or roll back) atomically.
type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;
async function runInTx<T>(
  maybeTx: TxOrDb | undefined,
  fn: (tx: TxOrDb) => Promise<T>,
): Promise<T> {
  if (maybeTx) return fn(maybeTx);
  return db.transaction(fn);
}

export type CreditSource = "subscription" | "topup" | "mixed";

export interface CreditSnapshot {
  subscriptionGC: number;
  topupGC: number;
  totalGC: number;
  monthlyGC: number;
  plan: PlanTier;
  status: string;
  cycleStart: Date | null;
  cycleEnd: Date | null;
}

export interface ConsumeContext {
  provider: string;
  quality?: string | null;
  durationS?: number | null;
  jobId: string; // REQUIRED for idempotency
  description?: string;
}

export interface ConsumeResult {
  ok: boolean;
  alreadyConsumed?: boolean;
  source: CreditSource;
  consumedFromSubscription: number;
  consumedFromTopup: number;
  newSubscriptionGC: number;
  newTopupGC: number;
}

export interface RefundContext {
  jobId: string;
  reason?: string;
  provider?: string;
}

// How long a user account can exist without a subscription row before we
// stop granting a fresh 14-day trial. Without this guard the rollout of
// NC-01 would retroactively credit every existing user with 50 GC + a
// trial period, even ones who signed up months ago.
const TRIAL_GRACE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Public: explicit subscription creation hook to be called at the end of
// /api/register. Idempotent — if a row already exists (e.g. webhook beat
// us to it) we leave it alone.
export async function createInitialTrialForNewUser(userId: string): Promise<Subscription> {
  return ensureSubscription(userId);
}

// Look up the user's subscription row. On first access:
//  • New accounts (created within the last 24h) get a FREE_TRIAL with the
//    full 50 GC bucket and a 14-day window — this is the intended UX.
//  • Older "backfill" accounts get an ACTIVE-but-empty FREE_TRIAL row
//    (0 GC, billingCycleEnd = now) so their balance reads as 0 and they
//    must explicitly upgrade — they don't get retroactive trial credits.
async function ensureSubscription(userId: string): Promise<Subscription> {
  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  if (existing) return existing;

  const now = new Date();
  const [user] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId));
  const accountAgeMs = user?.createdAt ? now.getTime() - user.createdAt.getTime() : 0;
  const isNewSignup = !user?.createdAt || accountAgeMs <= TRIAL_GRACE_WINDOW_MS;

  const monthlyGC = PLAN_CONFIG.FREE_TRIAL.monthlyGC;
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [created] = await db
    .insert(subscriptions)
    .values({
      userId,
      plan: "FREE_TRIAL",
      status: isNewSignup ? "TRIALING" : "ACTIVE",
      monthlyGC,
      currentGC: isNewSignup ? monthlyGC : 0,
      topupGC: 0,
      billingCycleStart: now,
      billingCycleEnd: isNewSignup ? trialEnd : now,
    })
    .returning();
  return created;
}

export async function getAvailableCredits(userId: string): Promise<CreditSnapshot> {
  const sub = await ensureSubscription(userId);
  return {
    subscriptionGC: sub.currentGC,
    topupGC: sub.topupGC,
    totalGC: sub.currentGC + sub.topupGC,
    monthlyGC: sub.monthlyGC,
    plan: sub.plan as PlanTier,
    status: sub.status,
    cycleStart: sub.billingCycleStart,
    cycleEnd: sub.billingCycleEnd,
  };
}

export async function canAccessProvider(userId: string, providerId: string): Promise<boolean> {
  const sub = await ensureSubscription(userId);
  return planAllowsProvider(sub.plan as PlanTier, providerId);
}

// Looks up the GC cost from `generation_rates`. Falls back to a sensible
// default if the row is missing — this should only happen pre-seed.
export async function getCreditCost(provider: string, quality?: string | null, durationS?: number | null): Promise<number> {
  const rows = await db
    .select()
    .from(generationRates)
    .where(and(eq(generationRates.provider, provider), eq(generationRates.isActive, true)));

  if (rows.length === 0) return 5; // safe default — never charge 0 silently

  // Prefer exact (quality + durationS) match, then quality-only, then any.
  const exact = rows.find((r) => (quality ? r.quality === quality : true) && (durationS ? r.durationS === durationS : true));
  if (exact) return exact.gcCost;
  const qOnly = quality ? rows.find((r) => r.quality === quality) : undefined;
  if (qOnly) return qOnly.gcCost;
  return rows[0].gcCost;
}

export interface CanAffordResult {
  ok: boolean;
  required: number;
  available: number;
  shortfall: number;
  source: CreditSource;
}

export async function canAfford(userId: string, gcCost: number): Promise<CanAffordResult> {
  const snap = await getAvailableCredits(userId);
  const total = snap.totalGC;
  if (total >= gcCost) {
    let source: CreditSource;
    if (snap.subscriptionGC >= gcCost) source = "subscription";
    else if (snap.subscriptionGC === 0) source = "topup";
    else source = "mixed";
    return { ok: true, required: gcCost, available: total, shortfall: 0, source };
  }
  return { ok: false, required: gcCost, available: total, shortfall: gcCost - total, source: "subscription" };
}

// Atomic, idempotent, race-resistant deduction. Spends subscription GC
// first, then top-up GC. Records the post-balance in credit_transactions.
export async function consumeCredits(
  userId: string,
  gcAmount: number,
  ctx: ConsumeContext,
): Promise<ConsumeResult> {
  if (gcAmount < 0) throw new Error("consumeCredits: gcAmount must be non-negative");

  // Make sure the row exists OUTSIDE the transaction so we don't fight a
  // first-write race inside the FOR UPDATE block.
  await ensureSubscription(userId);

  return await db.transaction(async (tx) => {
    // Idempotency: if a debit for (this user, this jobId) already exists,
    // return its result. Scoped by userId so two users who happen to use
    // the same jobId can never collide.
    const existing = await tx
      .select()
      .from(creditTransactions)
      .where(and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.jobId, ctx.jobId),
        eq(creditTransactions.type, "GENERATION"),
      ));
    if (existing.length > 0) {
      const sub = (await tx.select().from(subscriptions).where(eq(subscriptions.userId, userId)))[0];
      return {
        ok: true,
        alreadyConsumed: true,
        source: "subscription",
        consumedFromSubscription: 0,
        consumedFromTopup: 0,
        newSubscriptionGC: sub.currentGC,
        newTopupGC: sub.topupGC,
      };
    }

    // Row-lock on the user's subscription row.
    const locked = await tx.execute(
      sql`SELECT id, current_gc, topup_gc FROM subscriptions WHERE user_id = ${userId} FOR UPDATE`,
    );
    const row = (locked.rows ?? locked)[0] as any;
    if (!row) throw new Error(`consumeCredits: subscription row missing for user ${userId}`);

    const currentSub = Number(row.current_gc);
    const currentTop = Number(row.topup_gc);
    const total = currentSub + currentTop;
    if (total < gcAmount) {
      throw new Error(`INSUFFICIENT_CREDITS: required=${gcAmount} available=${total}`);
    }

    const fromSub = Math.min(gcAmount, currentSub);
    const fromTop = gcAmount - fromSub;
    const newSub = currentSub - fromSub;
    const newTop = currentTop - fromTop;

    await tx
      .update(subscriptions)
      .set({ currentGC: newSub, topupGC: newTop, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId));

    const source: CreditSource = fromSub > 0 && fromTop > 0 ? "mixed" : fromTop > 0 ? "topup" : "subscription";

    await tx.insert(creditTransactions).values({
      userId,
      type: "GENERATION",
      gcAmount: -gcAmount,
      gcBalance: newSub + newTop,
      provider: ctx.provider,
      quality: ctx.quality ?? null,
      durationS: ctx.durationS ?? null,
      jobId: ctx.jobId,
      source,
      description: ctx.description ?? null,
    });

    return {
      ok: true,
      source,
      consumedFromSubscription: fromSub,
      consumedFromTopup: fromTop,
      newSubscriptionGC: newSub,
      newTopupGC: newTop,
    };
  });
}

// Refund — returns credit to the same buckets it came from. Idempotent on
// (jobId + REFUND): a duplicate refund call is a no-op.
export async function refundCredits(userId: string, gcAmount: number, ctx: RefundContext): Promise<void> {
  if (gcAmount <= 0) return;

  await db.transaction(async (tx) => {
    // Idempotency: skip if already refunded — scoped by userId.
    const existing = await tx
      .select()
      .from(creditTransactions)
      .where(and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.jobId, ctx.jobId),
        eq(creditTransactions.type, "REFUND"),
      ));
    if (existing.length > 0) return;

    // Look up the original GENERATION debit for (this user, this jobId)
    // so we can route the refund back to the same buckets.
    const debits = await tx
      .select()
      .from(creditTransactions)
      .where(and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.jobId, ctx.jobId),
        eq(creditTransactions.type, "GENERATION"),
      ));
    if (debits.length === 0) return; // nothing to refund

    const debit = debits[0];
    const debited = Math.abs(debit.gcAmount);
    const refundAmount = Math.min(gcAmount, debited);

    // Lock subscription row.
    const locked = await tx.execute(
      sql`SELECT id, current_gc, topup_gc, monthly_gc FROM subscriptions WHERE user_id = ${userId} FOR UPDATE`,
    );
    const row = (locked.rows ?? locked)[0] as any;
    if (!row) return;

    const currentSub = Number(row.current_gc);
    const currentTop = Number(row.topup_gc);
    const monthly = Number(row.monthly_gc);

    // Routing: if the original spend was 'subscription' or 'mixed', return
    // to subscription up to the monthly cap, then to topup. If 'topup',
    // return all to topup.
    let toSub = 0;
    let toTop = 0;
    if (debit.source === "topup") {
      toTop = refundAmount;
    } else {
      const subHeadroom = Math.max(0, monthly - currentSub);
      toSub = Math.min(refundAmount, subHeadroom);
      toTop = refundAmount - toSub;
    }

    const newSub = currentSub + toSub;
    const newTop = currentTop + toTop;

    await tx
      .update(subscriptions)
      .set({ currentGC: newSub, topupGC: newTop, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId));

    await tx.insert(creditTransactions).values({
      userId,
      type: "REFUND",
      gcAmount: refundAmount,
      gcBalance: newSub + newTop,
      provider: ctx.provider ?? debit.provider,
      jobId: ctx.jobId,
      source: debit.source as any,
      description: ctx.reason ?? "Generation failed — credits refunded",
    });
  });
}

// Monthly reset triggered by `invoice.paid`. Applies rollover per plan
// rules: currentGC = monthlyGC + min(floor(currentGC * rolloverPercent/100), rolloverMax).
// Top-up GC carries forward untouched. Accepts optional `outerTx` so the
// webhook handler can run reset + ledger insert atomically with the
// billing_events dedupe row.
export async function resetMonthlyCredits(
  userId: string,
  plan: PlanTier,
  periodStart: Date,
  periodEnd: Date,
  outerTx?: TxOrDb,
): Promise<void> {
  const planCfg = PLAN_CONFIG[plan];

  await runInTx(outerTx, async (tx) => {
    const locked = await tx.execute(
      sql`SELECT id, current_gc FROM subscriptions WHERE user_id = ${userId} FOR UPDATE`,
    );
    const row = (locked.rows ?? locked)[0] as any;
    if (!row) return;

    const before = Number(row.current_gc);
    const rolled = Math.min(Math.floor((before * planCfg.rolloverPercent) / 100), planCfg.rolloverMax);
    const newCurrent = planCfg.monthlyGC + rolled;

    await tx
      .update(subscriptions)
      .set({
        currentGC: newCurrent,
        monthlyGC: planCfg.monthlyGC,
        plan,
        status: "ACTIVE",
        billingCycleStart: periodStart,
        billingCycleEnd: periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, userId));

    if (rolled > 0) {
      await tx.insert(creditTransactions).values({
        userId,
        type: "ROLLOVER",
        gcAmount: rolled,
        gcBalance: newCurrent,
        description: `Rolled ${rolled} GC from previous cycle (${planCfg.rolloverPercent}% up to ${planCfg.rolloverMax})`,
      });
    }

    await tx.insert(creditTransactions).values({
      userId,
      type: "MONTHLY_RESET",
      gcAmount: planCfg.monthlyGC,
      gcBalance: newCurrent,
      description: `Monthly ${plan} reset — ${planCfg.monthlyGC} GC`,
    });
  });
}

// Add top-up GC (called from webhook after successful one-time payment).
// Accepts optional `outerTx` so the webhook can keep the credit add and
// the billing_events dedupe insert in one commit.
export async function addTopUpCredits(
  userId: string,
  gcAmount: number,
  sourceLabel: string,
  outerTx?: TxOrDb,
): Promise<void> {
  await ensureSubscription(userId);
  await runInTx(outerTx, async (tx) => {
    const locked = await tx.execute(
      sql`SELECT id, topup_gc, current_gc FROM subscriptions WHERE user_id = ${userId} FOR UPDATE`,
    );
    const row = (locked.rows ?? locked)[0] as any;
    if (!row) return;
    const newTop = Number(row.topup_gc) + gcAmount;
    await tx.update(subscriptions).set({ topupGC: newTop, updatedAt: new Date() }).where(eq(subscriptions.userId, userId));
    await tx.insert(creditTransactions).values({
      userId,
      type: "TOPUP_PURCHASE",
      gcAmount,
      gcBalance: Number(row.current_gc) + newTop,
      source: "topup",
      description: `Top-up purchase: ${sourceLabel}`,
    });
  });
}

// Updates the plan/period on a subscription (called by webhook on subscription.updated).
export async function updateSubscriptionPlan(
  userId: string,
  plan: PlanTier,
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING" | "PAUSED",
  customerId: string | null,
  subscriptionId: string | null,
  periodStart: Date | null,
  periodEnd: Date | null,
  outerTx?: TxOrDb,
): Promise<void> {
  await ensureSubscription(userId);
  const planCfg = PLAN_CONFIG[plan];
  // Lock the subscription row while we mutate plan/limits so concurrent
  // consumeCredits / addTopUpCredits / resetMonthlyCredits paths see a
  // consistent monthlyGC + plan tier. Without this lock a webhook-driven
  // plan change racing with a spend can briefly mis-cap the user's
  // remaining balance.
  await runInTx(outerTx, async (tx) => {
    await tx.execute(sql`SELECT id FROM subscriptions WHERE user_id = ${userId} FOR UPDATE`);
    await tx
      .update(subscriptions)
      .set({
        plan,
        status,
        monthlyGC: planCfg.monthlyGC,
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: subscriptionId ?? undefined,
        billingCycleStart: periodStart ?? undefined,
        billingCycleEnd: periodEnd ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, userId));
  });
}
