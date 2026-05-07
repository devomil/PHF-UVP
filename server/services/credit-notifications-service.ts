// Phase NC-02 — Credit threshold notification engine.
//
// Idempotent per (userId, cycleStart, threshold). Fires:
//   • USAGE_80 / USAGE_95 / USAGE_100 — evaluated after every consume
//   • RESET_TOMORROW — daily tick if cycle ends in <24h AND >60% used
//   • RESET_TODAY — daily tick on cycle reset day
// Email is best-effort and never blocks the credit consume path.

import { db } from "../db";
import { creditNotifications, subscriptions, users } from "../../shared/schema";
import { and, eq, isNull, lte, gte, desc } from "drizzle-orm";
import { deriveDaysUntilReset, deriveWarning } from "./credits-service";
import sgMail from "@sendgrid/mail";

export type CreditNotificationThreshold =
  | "USAGE_80"
  | "USAGE_95"
  | "USAGE_100"
  | "RESET_TOMORROW"
  | "RESET_TODAY";

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "ryan@pinehillfarm.co";

let sgInitialized = false;
function initSendGrid(): boolean {
  if (sgInitialized) return true;
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return false;
  sgMail.setApiKey(key);
  sgInitialized = true;
  return true;
}

interface ThresholdSpec {
  threshold: CreditNotificationThreshold;
  subjectShort: string;
  bodyShort: string;
}

function copyFor(threshold: CreditNotificationThreshold, percentUsed: number, remainingGC: number, daysUntilReset: number | null): ThresholdSpec {
  switch (threshold) {
    case "USAGE_80":
      return {
        threshold,
        subjectShort: "You've used 80% of this cycle's credits",
        bodyShort: `You have ${remainingGC} GC remaining this billing cycle. Top up to keep generating without interruption.`,
      };
    case "USAGE_95":
      return {
        threshold,
        subjectShort: "Only 5% of your credits remain",
        bodyShort: `Just ${remainingGC} GC left. Top up now or upgrade your plan to avoid hitting zero mid-project.`,
      };
    case "USAGE_100":
      return {
        threshold,
        subjectShort: "You're out of credits",
        bodyShort: `Generations are paused until you top up or upgrade. Resets in ${daysUntilReset ?? "?"} days.`,
      };
    case "RESET_TOMORROW":
      return {
        threshold,
        subjectShort: "Heads up — your credits reset tomorrow",
        bodyShort: `You've used over 60% of this cycle. ${percentUsed}% used so far; fresh credits arrive within 24 hours.`,
      };
    case "RESET_TODAY":
      return {
        threshold,
        subjectShort: "Fresh credits have arrived",
        bodyShort: `Your monthly credits have been refilled. Time to ship something new.`,
      };
  }
}

async function sendThresholdEmail(
  email: string,
  firstName: string | null,
  spec: ThresholdSpec,
): Promise<boolean> {
  if (!initSendGrid()) return false;
  try {
    await sgMail.send({
      to: email,
      from: { email: FROM_EMAIL, name: "NeuralCut.AI" },
      subject: spec.subjectShort,
      html: `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#09090f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e4e4e7;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="background:linear-gradient(135deg,#1a0533 0%,#0f0f1a 50%,#0a1628 100%);padding:32px;border-radius:16px;border:1px solid rgba(168,85,247,0.2);">
      <h1 style="margin:0 0 16px;font-size:22px;color:#f4f4f5;">${spec.subjectShort}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a1a1aa;">Hi ${firstName || "there"},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a1a1aa;">${spec.bodyShort}</p>
      <a href="https://neuralcut.ai/billing" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Manage credits →</a>
    </div>
    <p style="margin:24px 0 0;font-size:12px;color:#52525b;text-align:center;">NeuralCut.AI · You can adjust credit notifications anytime in Billing.</p>
  </div>
</body></html>
      `.trim(),
    });
    return true;
  } catch (err: any) {
    console.warn("[CreditNotifications] SendGrid send failed:", err.message);
    return false;
  }
}

// Insert one row idempotently. Returns true if a NEW row was created.
async function recordOnce(
  userId: string,
  cycleStart: Date,
  threshold: CreditNotificationThreshold,
  percentUsed: number,
  remainingGC: number,
): Promise<boolean> {
  try {
    const [row] = await db
      .insert(creditNotifications)
      .values({ userId, cycleStart, threshold, percentUsed, remainingGC })
      .onConflictDoNothing({
        target: [creditNotifications.userId, creditNotifications.cycleStart, creditNotifications.threshold],
      })
      .returning();
    return !!row;
  } catch (err: any) {
    // The unique constraint should make this redundant, but stay
    // resilient against driver-level edge cases — never let
    // notification bookkeeping break the consume path.
    console.warn("[CreditNotifications] insert failed:", err.message);
    return false;
  }
}

async function emailIfNew(
  userId: string,
  cycleStart: Date,
  threshold: CreditNotificationThreshold,
  percentUsed: number,
  remainingGC: number,
  daysUntilReset: number | null,
): Promise<void> {
  const created = await recordOnce(userId, cycleStart, threshold, percentUsed, remainingGC);
  if (!created) return;
  // Background-only email so the consume path is never blocked.
  setImmediate(async () => {
    try {
      const [u] = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, userId));
      if (!u?.email) return;
      const sent = await sendThresholdEmail(u.email, u.firstName ?? null, copyFor(threshold, percentUsed, remainingGC, daysUntilReset));
      if (sent) {
        await db
          .update(creditNotifications)
          .set({ emailSent: true })
          .where(and(
            eq(creditNotifications.userId, userId),
            eq(creditNotifications.cycleStart, cycleStart),
            eq(creditNotifications.threshold, threshold),
          ));
      }
    } catch (err: any) {
      console.warn("[CreditNotifications] background email handler error:", err.message);
    }
  });
}

// Called from inside `consumeCredits` after a successful debit. Looks at
// the post-debit balance and crosses the right thresholds in one pass.
export async function evaluateUsageThresholds(
  userId: string,
  newSubscriptionGC: number,
  newTopupGC: number,
  monthlyGC: number,
  cycleStart: Date | null,
): Promise<void> {
  if (!cycleStart) return; // can't bucket without a cycle anchor
  const { percentUsed, warningLevel } = deriveWarning(newSubscriptionGC, newTopupGC, monthlyGC);
  const remainingGC = newSubscriptionGC + newTopupGC;
  // Daily-tick ones still need the next-reset signal.
  const daysUntilReset = null;

  if (warningLevel === "calm") return;
  if (percentUsed >= 100 || (newSubscriptionGC + newTopupGC) <= 0) {
    await emailIfNew(userId, cycleStart, "USAGE_100", 100, remainingGC, daysUntilReset);
    return;
  }
  if (percentUsed >= 95) {
    await emailIfNew(userId, cycleStart, "USAGE_95", percentUsed, remainingGC, daysUntilReset);
    return;
  }
  if (percentUsed >= 80) {
    await emailIfNew(userId, cycleStart, "USAGE_80", percentUsed, remainingGC, daysUntilReset);
    return;
  }
}

// Direct fire from `resetMonthlyCredits` on cycle rollover. Idempotent
// because emailIfNew is keyed on (user, cycleStart, threshold) — even if
// the webhook fires twice or the daily tick also catches it later, only
// one notification is persisted.
export async function emitResetToday(
  userId: string,
  cycleStart: Date,
  remainingGC: number,
  monthlyGC: number,
): Promise<void> {
  await emailIfNew(userId, cycleStart, "RESET_TODAY", 0, remainingGC, 0);
}

// Daily tick: scan active subscriptions for "reset is imminent" signals.
// Cheap because we only look at users whose cycleEnd is within a 48h window.
export async function evaluateResetSignals(now: Date = new Date()): Promise<void> {
  const lookahead = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const lookbehind = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const candidates = await db
    .select()
    .from(subscriptions)
    .where(and(
      gte(subscriptions.billingCycleEnd, lookbehind),
      lte(subscriptions.billingCycleEnd, lookahead),
    ));

  for (const sub of candidates) {
    if (!sub.billingCycleStart || !sub.billingCycleEnd) continue;
    const days = deriveDaysUntilReset(sub.billingCycleEnd, now);
    const { percentUsed } = deriveWarning(sub.currentGC, sub.topupGC, sub.monthlyGC);
    const remainingGC = sub.currentGC + sub.topupGC;

    if (days === 1 && percentUsed > 60) {
      await emailIfNew(sub.userId, sub.billingCycleStart, "RESET_TOMORROW", percentUsed, remainingGC, days);
    } else if (days === 0) {
      await emailIfNew(sub.userId, sub.billingCycleStart, "RESET_TODAY", percentUsed, remainingGC, days);
    }
  }
}

// Public list / mark-read helpers consumed by the route layer.
export async function listNotifications(userId: string, limit = 50) {
  return db
    .select()
    .from(creditNotifications)
    .where(eq(creditNotifications.userId, userId))
    .orderBy(desc(creditNotifications.createdAt))
    .limit(Math.min(limit, 200));
}

export async function markNotificationRead(userId: string, id: number): Promise<boolean> {
  const result = await db
    .update(creditNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(creditNotifications.userId, userId), eq(creditNotifications.id, id), isNull(creditNotifications.readAt)))
    .returning({ id: creditNotifications.id });
  return result.length > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await db
    .update(creditNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(creditNotifications.userId, userId), isNull(creditNotifications.readAt)))
    .returning({ id: creditNotifications.id });
  return result.length;
}

// Lightweight daily tick scheduler. Started exactly once at server boot.
let tickStarted = false;
export function startCreditNotificationsTick(): void {
  if (tickStarted) return;
  tickStarted = true;
  // Run every 6 hours; the underlying writes are idempotent so a missed
  // or doubled tick does not cause a duplicate notification.
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const run = () => {
    evaluateResetSignals().catch((err) =>
      console.warn("[CreditNotifications] reset evaluator failed:", err.message),
    );
  };
  setTimeout(run, 60_000); // first run 1 minute after boot
  setInterval(run, SIX_HOURS_MS);
  console.log("[CreditNotifications] daily reset evaluator scheduled (6h interval)");
}
