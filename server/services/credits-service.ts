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
import { InsufficientCreditsError } from "./credit-errors";
// Lazy import to avoid a circular dependency: credit-notifications-service
// imports `deriveWarning`/`deriveDaysUntilReset` from this module.
type EvalUsageFn = (
  userId: string,
  newSub: number,
  newTop: number,
  monthlyGC: number,
  cycleStart: Date | null,
) => Promise<void>;
let evalUsageThresholds: EvalUsageFn | null = null;
async function loadEvaluator(): Promise<EvalUsageFn> {
  if (evalUsageThresholds) return evalUsageThresholds;
  const mod = await import("./credit-notifications-service");
  evalUsageThresholds = mod.evaluateUsageThresholds;
  return evalUsageThresholds;
}

// Caller-provided transaction handle, or `undefined` to open a fresh one.
// Webhook flow passes its own `tx` so the business mutation + the
// `billing_events` dedupe insert commit (or roll back) atomically.
type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

// Typed shape of a row returned by `SELECT … FOR UPDATE` against the
// `subscriptions` table. Only fields we actually read are listed; numeric
// columns arrive as strings under node-postgres so we Number() at use.
interface LockedSubscriptionRow {
  id: string;
  current_gc: string | number;
  topup_gc: string | number;
  monthly_gc?: string | number;
  billing_cycle_start?: Date | string | null;
}

// drizzle's `tx.execute()` returns `{ rows: T[] }` on Neon HTTP and a
// bare array on some serverless drivers. This narrows both shapes
// without leaking `any`.
function firstLockedRow(result: unknown): LockedSubscriptionRow | undefined {
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown[] }).rows;
    return Array.isArray(rows) ? (rows[0] as LockedSubscriptionRow | undefined) : undefined;
  }
  return Array.isArray(result) ? (result[0] as LockedSubscriptionRow | undefined) : undefined;
}
async function runInTx<T>(
  maybeTx: TxOrDb | undefined,
  fn: (tx: TxOrDb) => Promise<T>,
): Promise<T> {
  if (maybeTx) return fn(maybeTx);
  return db.transaction(fn);
}

export type CreditSource = "subscription" | "topup" | "mixed";

// Phase NC-02 — Server-derived warning level so the meter, banner, and
// notification engine all read from the same source of truth.
export type CreditWarningLevel = "calm" | "warning" | "urgent" | "empty";

export interface CreditSnapshot {
  subscriptionGC: number;
  topupGC: number;
  totalGC: number;
  monthlyGC: number;
  plan: PlanTier;
  status: string;
  cycleStart: Date | null;
  cycleEnd: Date | null;
  // Phase NC-02 additions — all derived server-side. The client never
  // recomputes these so the meter, banner and email engine stay in lockstep.
  warningLevel: CreditWarningLevel;
  percentUsed: number; // 0-100, computed against monthlyGC budget
  daysUntilReset: number | null; // floor of days from now → cycleEnd; null if no cycleEnd
}

// Pure helper exported for unit tests so the boundary cases (80, 95, 100, 0)
// can be asserted without a DB round-trip. Keep in lockstep with the
// notification engine thresholds.
export function deriveWarning(
  subscriptionGC: number,
  topupGC: number,
  monthlyGC: number,
): { warningLevel: CreditWarningLevel; percentUsed: number } {
  const total = subscriptionGC + topupGC;
  if (total <= 0) return { warningLevel: "empty", percentUsed: 100 };
  if (monthlyGC <= 0) return { warningLevel: "calm", percentUsed: 0 };
  const used = Math.max(0, monthlyGC - subscriptionGC);
  const pct = Math.min(100, Math.round((used / monthlyGC) * 100));
  let level: CreditWarningLevel = "calm";
  if (pct >= 95) level = "urgent";
  else if (pct >= 80) level = "warning";
  return { warningLevel: level, percentUsed: pct };
}

export function deriveDaysUntilReset(cycleEnd: Date | null, now: Date = new Date()): number | null {
  if (!cycleEnd) return null;
  const ms = cycleEnd.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
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
// stop granting a fresh trial. Aligned with the 14-day trial length so a
// user who registered up to 14 days before NC-01 rollout still receives
// their full trial on first credit-endpoint hit. Older accounts get a
// zero-balance backfill row instead — no retroactive credits.
const TRIAL_GRACE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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
  const { warningLevel, percentUsed } = deriveWarning(sub.currentGC, sub.topupGC, sub.monthlyGC);
  return {
    subscriptionGC: sub.currentGC,
    topupGC: sub.topupGC,
    totalGC: sub.currentGC + sub.topupGC,
    monthlyGC: sub.monthlyGC,
    plan: sub.plan as PlanTier,
    status: sub.status,
    cycleStart: sub.billingCycleStart,
    cycleEnd: sub.billingCycleEnd,
    warningLevel,
    percentUsed,
    daysUntilReset: deriveDaysUntilReset(sub.billingCycleEnd),
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

  // Helper that returns the existing-debit no-op result. Used by both
  // the pre-check fast path and the unique-violation race fallback so
  // concurrent duplicate jobIds always converge to the same response.
  const buildAlreadyConsumed = async (tx: TxOrDb): Promise<ConsumeResult> => {
    const sub = (await tx.select().from(subscriptions).where(eq(subscriptions.userId, userId)))[0];
    return {
      ok: true,
      alreadyConsumed: true,
      source: "subscription",
      consumedFromSubscription: 0,
      consumedFromTopup: 0,
      newSubscriptionGC: sub?.currentGC ?? 0,
      newTopupGC: sub?.topupGC ?? 0,
    };
  };

  try {
    return await db.transaction(async (tx) => {
    // Lock the subscription row FIRST so a concurrent duplicate (same
    // userId, same jobId) blocks here and serializes behind us. Only
    // after we hold the lock do we re-check for an existing debit —
    // this closes the TOCTOU window where two callers both passed a
    // pre-lock idempotency check and then raced to insert.
    const locked0 = await tx.execute(
      sql`SELECT id FROM subscriptions WHERE user_id = ${userId} FOR UPDATE`,
    );
    void locked0;

    const existing = await tx
      .select()
      .from(creditTransactions)
      .where(and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.jobId, ctx.jobId),
        eq(creditTransactions.type, "GENERATION"),
      ));
    if (existing.length > 0) {
      return await buildAlreadyConsumed(tx);
    }

    // Row-lock on the user's subscription row.
    const locked = await tx.execute(
      sql`SELECT id, current_gc, topup_gc, monthly_gc, billing_cycle_start FROM subscriptions WHERE user_id = ${userId} FOR UPDATE`,
    );
    const row = firstLockedRow(locked);
    if (!row) throw new Error(`consumeCredits: subscription row missing for user ${userId}`);

    const currentSub = Number(row.current_gc);
    const currentTop = Number(row.topup_gc);
    const total = currentSub + currentTop;
    if (total < gcAmount) {
      // Phase NC-02 — typed error so the route handler can surface the
      // canonical 402 envelope without re-parsing a free-form string.
      throw new InsufficientCreditsError({
        required: gcAmount,
        available: total,
        provider: ctx.provider ?? null,
        quality: ctx.quality ?? null,
        durationS: ctx.durationS ?? null,
      });
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

    // Phase NC-02 — fire-and-forget threshold evaluator. Never blocks
    // (or fails) the consume path; ledger is committed by the time
    // we get here, so this only enqueues notifications.
    const monthlyForEval = Number(row.monthly_gc ?? 0);
    const cycleStartForEval = (row as { billing_cycle_start?: Date | string | null }).billing_cycle_start
      ? new Date((row as { billing_cycle_start: Date | string }).billing_cycle_start as Date | string)
      : null;
    setImmediate(() => {
      loadEvaluator()
        .then((fn) => fn(userId, newSub, newTop, monthlyForEval, cycleStartForEval))
        .catch((err) => console.warn("[credits-service] threshold eval failed:", err?.message ?? err));
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
  } catch (err: unknown) {
    // Race fallback: if a concurrent caller with the same (userId, jobId)
    // committed first, our INSERT trips the uq_credit_tx_user_job_type
    // constraint. Convert that into the same idempotent no-op the
    // pre-check would have returned, so duplicate jobIds always converge.
    const e = err as { code?: string; message?: string };
    const isDup = e?.code === "23505" || /uq_credit_tx_user_job_type|duplicate key/i.test(String(e?.message ?? ""));
    if (isDup) {
      return await buildAlreadyConsumed(db);
    }
    throw err;
  }
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
    const row = firstLockedRow(locked);
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
      source: debit.source as CreditSource,
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
    const row = firstLockedRow(locked);
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

    // Phase NC-02 — fire RESET_TODAY exactly when the cycle actually
    // rolls over. The 6h tick scan is a fallback for the rare case
    // where this webhook path fails or is missed; firing here keeps
    // the timing accurate even when the scan window misses the
    // cycle-rollover moment. emailIfNew is idempotent on
    // (user, cycleStart, threshold) so doing both is safe.
    setImmediate(async () => {
      try {
        const { emitResetToday } = await import('./credit-notifications-service');
        await emitResetToday(userId, periodStart, planCfg.monthlyGC, planCfg.monthlyGC);
      } catch (err) {
        console.error('[Credits] emitResetToday failed (non-fatal):', err);
      }
    });

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
    const row = firstLockedRow(locked);
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
    // Read the prior plan + balance under FOR UPDATE so we can detect
    // an upgrade and provision the new monthly budget atomically. Spec:
    // "upgraded users get the new monthly budget immediately" — if the
    // user moves to a richer plan we top currentGC up to the new
    // monthlyGC (never down — mid-cycle balances are preserved).
    const locked = await tx.execute(
      sql`SELECT id, plan, monthly_gc, current_gc FROM subscriptions WHERE user_id = ${userId} FOR UPDATE`,
    );
    const rows = (locked && typeof locked === "object" && "rows" in locked)
      ? (locked as { rows: Array<{ plan: PlanTier; monthly_gc: string | number; current_gc: string | number }> }).rows
      : (locked as Array<{ plan: PlanTier; monthly_gc: string | number; current_gc: string | number }>);
    const prior = Array.isArray(rows) ? rows[0] : undefined;
    const priorMonthly = prior ? Number(prior.monthly_gc) : 0;
    const priorCurrent = prior ? Number(prior.current_gc) : 0;
    const isUpgrade = planCfg.monthlyGC > priorMonthly;
    const newCurrent = isUpgrade ? Math.max(priorCurrent, planCfg.monthlyGC) : priorCurrent;

    await tx
      .update(subscriptions)
      .set({
        plan,
        status,
        monthlyGC: planCfg.monthlyGC,
        currentGC: newCurrent,
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: subscriptionId ?? undefined,
        billingCycleStart: periodStart ?? undefined,
        billingCycleEnd: periodEnd ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, userId));

    if (isUpgrade && newCurrent > priorCurrent) {
      await tx.insert(creditTransactions).values({
        userId,
        type: "MONTHLY_RESET",
        gcAmount: newCurrent - priorCurrent,
        gcBalance: newCurrent,
        description: `Plan upgraded to ${plan} — credits topped up to ${planCfg.monthlyGC} GC`,
      });
    }
  });
}
