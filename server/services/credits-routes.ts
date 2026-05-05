// Phase NC-01 — Credit + subscription HTTP API.
//
// All processor calls go through `getActiveBillingProvider()`. Missing
// configuration produces a structured 502 BILLING_NOT_CONFIGURED response
// rather than a crash, so the `/billing` page can render "Coming soon"
// tiles before the user wires Stripe up tomorrow.

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { creditTransactions, subscriptions, generationRates, billingEvents } from "../../shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  addTopUpCredits,
  getAvailableCredits,
  getCreditCost,
  resetMonthlyCredits,
  updateSubscriptionPlan,
} from "./credits-service";
import { isAuthenticated } from "../auth";
import { getActiveBillingProvider, BillingNotConfiguredError } from "./billing";
import { PLAN_CONFIG, PAID_PLANS, TOPUP_PACKS, getTopUpPack, type PlanTier } from "../config/plans";
import { PROVIDER_PERMISSIONS } from "../config/providerPermissions";
import { BILLING_CATALOG, getCatalogEntry, getStripePriceId, isCatalogEntryConfigured } from "../config/billing-catalog";

const router = Router();

// ===== Public catalog (no auth) =====
router.get("/api/billing/catalog", (_req, res) => {
  res.json({
    plans: PAID_PLANS.map((tier) => {
      const cfg = PLAN_CONFIG[tier];
      return {
        tier,
        displayName: cfg.displayName,
        monthlyGC: cfg.monthlyGC,
        monthlyPriceCents: cfg.monthlyPriceCents,
        annualPriceCents: cfg.annualPriceCents,
        rolloverPercent: cfg.rolloverPercent,
        rolloverMax: cfg.rolloverMax,
        maxResolution: cfg.maxResolution,
        maxClipDuration: cfg.maxClipDuration,
        monthlyConfigured: isCatalogEntryConfigured(cfg.catalogKeyMonthly),
        annualConfigured: isCatalogEntryConfigured(cfg.catalogKeyAnnual),
      };
    }),
    topupPacks: TOPUP_PACKS.map((p) => ({
      id: p.id,
      gc: p.gc,
      priceCents: p.priceCents,
      configured: isCatalogEntryConfigured(p.catalogKey),
    })),
    permissions: PROVIDER_PERMISSIONS,
    providerConfigured: getActiveBillingProvider().isConfigured(),
  });
});

// ===== Credit balance + cost lookup =====
router.get("/api/credits/balance", isAuthenticated, async (req: Request, res: Response) => {
  const userId = (req.user as any).id;
  const snap = await getAvailableCredits(userId);
  res.json(snap);
});

router.get("/api/credits/cost", isAuthenticated, async (req: Request, res: Response) => {
  const provider = (req.query.provider as string) || "";
  if (!provider) return res.status(400).json({ error: "provider is required" });
  const quality = (req.query.quality as string) || null;
  const durationS = req.query.durationS ? Number(req.query.durationS) : null;
  const cost = await getCreditCost(provider, quality, durationS);
  res.json({ provider, quality, durationS, gcCost: cost });
});

router.get("/api/credits/rates", async (_req, res) => {
  const rows = await db.select().from(generationRates).where(eq(generationRates.isActive, true));
  res.json(rows);
});

router.get("/api/credits/transactions", isAuthenticated, async (req: Request, res: Response) => {
  const userId = (req.user as any).id;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const type = (req.query.type as string) || null;
  let q = db
    .select()
    .from(creditTransactions)
    .where(type ? and(eq(creditTransactions.userId, userId), eq(creditTransactions.type, type)) : eq(creditTransactions.userId, userId))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(limit);
  const rows = await q;
  res.json(rows);
});

// CSV export for transaction history.
router.get("/api/credits/transactions.csv", isAuthenticated, async (req: Request, res: Response) => {
  const userId = (req.user as any).id;
  const rows = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(1000);
  const header = "createdAt,type,gcAmount,gcBalance,provider,quality,durationS,jobId,source,description\n";
  const csv = rows
    .map((r) =>
      [
        r.createdAt?.toISOString() ?? "",
        r.type,
        r.gcAmount,
        r.gcBalance,
        r.provider ?? "",
        r.quality ?? "",
        r.durationS ?? "",
        r.jobId ?? "",
        r.source ?? "",
        (r.description ?? "").replace(/"/g, '""'),
      ]
        .map((v) => `"${String(v)}"`)
        .join(","),
    )
    .join("\n");
  res.header("Content-Type", "text/csv");
  res.header("Content-Disposition", `attachment; filename="credit-transactions.csv"`);
  res.send(header + csv);
});

// ===== Subscription management =====
router.get("/api/subscriptions/current", isAuthenticated, async (req: Request, res: Response) => {
  const userId = (req.user as any).id;
  const snap = await getAvailableCredits(userId);
  res.json(snap);
});

router.post("/api/subscriptions/upgrade-checkout", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const userEmail = (req.user as any).email;
    const { plan, period } = req.body as { plan: PlanTier; period: "monthly" | "annual" };
    if (!PAID_PLANS.includes(plan)) return res.status(400).json({ error: "Invalid plan", code: "INVALID_PLAN" });
    const cfg = PLAN_CONFIG[plan];
    const catalogKey = period === "annual" ? cfg.catalogKeyAnnual : cfg.catalogKeyMonthly;
    if (!isCatalogEntryConfigured(catalogKey)) {
      return res.status(502).json({ error: `Plan ${plan} ${period} is not yet configured`, code: "BILLING_NOT_CONFIGURED" });
    }
    const provider = getActiveBillingProvider();
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    const session = await provider.createCheckoutSession({
      kind: "subscription",
      catalogKey,
      userId,
      userEmail,
      customerId: sub?.stripeCustomerId ?? null,
      successUrl: `${baseUrl(req)}/billing?status=success`,
      cancelUrl: `${baseUrl(req)}/billing?status=cancel`,
    });
    res.json(session);
  } catch (err: any) {
    if (err instanceof BillingNotConfiguredError) {
      return res.status(502).json({ error: err.message, code: "BILLING_NOT_CONFIGURED" });
    }
    console.error("[upgrade-checkout]", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/api/subscriptions/portal", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    if (!sub?.stripeCustomerId) return res.status(400).json({ error: "No billing customer on file yet" });
    const provider = getActiveBillingProvider();
    const portal = await provider.createCustomerPortalSession({
      customerId: sub.stripeCustomerId,
      returnUrl: `${baseUrl(req)}/billing`,
    });
    res.json(portal);
  } catch (err: any) {
    if (err instanceof BillingNotConfiguredError) {
      return res.status(502).json({ error: err.message, code: "BILLING_NOT_CONFIGURED" });
    }
    res.status(500).json({ error: "Failed to open portal" });
  }
});

// ===== Top-up =====
router.post("/api/credits/topup-checkout", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const userEmail = (req.user as any).email;
    const { packId } = req.body as { packId: string };
    const pack = getTopUpPack(packId);
    if (!pack) return res.status(400).json({ error: "Invalid pack", code: "INVALID_PACK" });
    if (!isCatalogEntryConfigured(pack.catalogKey)) {
      return res.status(502).json({ error: `Pack ${packId} is not yet configured`, code: "BILLING_NOT_CONFIGURED" });
    }
    const provider = getActiveBillingProvider();
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    const session = await provider.createCheckoutSession({
      kind: "topup",
      catalogKey: pack.catalogKey,
      userId,
      userEmail,
      customerId: sub?.stripeCustomerId ?? null,
      successUrl: `${baseUrl(req)}/billing?status=topup_success`,
      cancelUrl: `${baseUrl(req)}/billing?status=topup_cancel`,
    });
    res.json(session);
  } catch (err: any) {
    if (err instanceof BillingNotConfiguredError) {
      return res.status(502).json({ error: err.message, code: "BILLING_NOT_CONFIGURED" });
    }
    console.error("[topup-checkout]", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ===== Webhook =====
// Mounted in routes.ts with raw body capture (NOT JSON-parsed).
router.post("/api/billing/webhook/:providerName", async (req: Request, res: Response) => {
  const providerName = req.params.providerName;
  const provider = getActiveBillingProvider();
  if (provider.name !== providerName) {
    return res.status(400).send("provider mismatch");
  }

  try {
    // Use the provider-declared header. Each provider knows which header
    // its signatures travel in (Stripe → "stripe-signature"). We never
    // silently fall back to a generic header — that would let an attacker
    // forge events when the real signature is missing.
    const headerName = provider.signatureHeader;
    const sig = (req.headers[headerName] as string) || "";
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) return res.status(400).send("missing raw body");
    if (!sig) return res.status(400).send(`missing ${headerName}`);
    const event = await provider.verifyAndParseWebhook(rawBody, sig);

    // Idempotency: skip if we've already processed this event id.
    try {
      await db.insert(billingEvents).values({ provider: providerName, eventId: event.eventId, eventType: (event as any).type ?? "ignored" });
    } catch (e: any) {
      // Unique constraint violation = already processed → no-op success.
      if (String(e?.code) === "23505" || /duplicate key/i.test(String(e?.message))) {
        return res.json({ ok: true, deduped: true });
      }
      throw e;
    }

    if (event.type === "ignored") {
      return res.json({ ok: true, ignored: event.nativeType });
    }

    if (event.type === "subscription.activated" || event.type === "subscription.updated") {
      const userId = await resolveUserId(event.data.userId, event.data.customerId);
      if (!userId) return res.json({ ok: true, warn: "userId not resolvable" });
      const tier = catalogKeyToPlanTier(event.data.catalogKey) ?? "STARTER";
      const status = mapToInternalStatus(event.data.status);
      await updateSubscriptionPlan(
        userId,
        tier,
        status,
        event.data.customerId,
        event.data.subscriptionId,
        event.data.currentPeriodStart,
        event.data.currentPeriodEnd,
      );
      return res.json({ ok: true });
    }

    if (event.type === "subscription.deleted") {
      const userId = await resolveUserId(event.data.userId, event.data.customerId);
      if (userId) {
        await db.update(subscriptions).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(subscriptions.userId, userId));
      }
      return res.json({ ok: true });
    }

    if (event.type === "invoice.paid") {
      const userId = await resolveUserId(event.data.userId, event.data.customerId);
      if (!userId) return res.json({ ok: true, warn: "userId not resolvable" });
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
      if (sub) {
        await resetMonthlyCredits(userId, sub.plan as PlanTier, sub.billingCycleStart ?? new Date(), sub.billingCycleEnd ?? new Date());
      }
      return res.json({ ok: true });
    }

    if (event.type === "topup.paid") {
      const userId = await resolveUserId(event.data.userId, event.data.customerId);
      if (!userId) return res.json({ ok: true, warn: "userId not resolvable" });
      await addTopUpCredits(userId, event.data.gcAmount, event.data.catalogKey);
      return res.json({ ok: true });
    }

    res.json({ ok: true });
  } catch (err: any) {
    // Distinguish "not configured yet" from real signature/payload failures
    // so ops can detect missing env wiring (502) vs. a bad/forged payload
    // (400) without combing through logs.
    if (err instanceof BillingNotConfiguredError) {
      console.warn("[webhook] BILLING_NOT_CONFIGURED:", err.message);
      return res.status(502).json({ error: err.message, code: "BILLING_NOT_CONFIGURED" });
    }
    console.error("[webhook]", err.message);
    res.status(400).send("webhook error");
  }
});

function baseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const host = req.headers.host;
  return `${proto}://${host}`;
}

function catalogKeyToPlanTier(key: string | null): PlanTier | null {
  if (!key) return null;
  const entry = getCatalogEntry(key);
  return entry?.planTier ?? null;
}

function mapToInternalStatus(s: string): "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING" | "PAUSED" {
  return ({ active: "ACTIVE", past_due: "PAST_DUE", canceled: "CANCELED", trialing: "TRIALING", paused: "PAUSED" } as const)[s as "active"] ?? "PAUSED";
}

async function resolveUserId(metadataUserId: string | null, customerId: string): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  if (!customerId) return null;
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, customerId));
  return sub?.userId ?? null;
}

export default router;
