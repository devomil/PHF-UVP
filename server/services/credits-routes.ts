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
import { getActiveBillingProvider, getBillingProviderByName, BillingNotConfiguredError } from "./billing";
import { PLAN_CONFIG, PAID_PLANS, TOPUP_PACKS, getTopUpPack, type PlanTier } from "../config/plans";
import { PROVIDER_PERMISSIONS } from "../config/providerPermissions";
import { BILLING_CATALOG, getCatalogEntry } from "../config/billing-catalog";

const router = Router();

// Typed shape of the authenticated user attached to req.user by Passport.
// The repo's session deserializer returns the full row, but only id+email
// are read in this module. Centralizing the narrowing here avoids leaking
// `as any` across each route handler.
interface AuthUser { id: string; email?: string | null }
function authUser(req: Request): AuthUser | null {
  const u = req.user as AuthUser | undefined;
  return u && typeof u.id === "string" ? u : null;
}

// ===== Public catalog (no auth) =====
router.get("/api/billing/catalog", async (_req, res) => {
  const provider = getActiveBillingProvider();
  const providerConfigured = provider.isConfigured();
  // Resolve all configured-flags in parallel. When the provider isn't
  // configured at all, `isCatalogConfigured` short-circuits to false
  // without an API call.
  const checkKey = (key: string) =>
    providerConfigured ? provider.isCatalogConfigured(key).catch(() => false) : Promise.resolve(false);
  const planFlags = await Promise.all(
    PAID_PLANS.flatMap((tier) => {
      const cfg = PLAN_CONFIG[tier];
      return [checkKey(cfg.catalogKeyMonthly), checkKey(cfg.catalogKeyAnnual)];
    }),
  );
  const packFlags = await Promise.all(TOPUP_PACKS.map((p) => checkKey(p.catalogKey)));
  res.json({
    plans: PAID_PLANS.map((tier, i) => {
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
        monthlyConfigured: planFlags[i * 2],
        annualConfigured: planFlags[i * 2 + 1],
      };
    }),
    topupPacks: TOPUP_PACKS.map((p, i) => ({
      id: p.id,
      gc: p.gc,
      priceCents: p.priceCents,
      configured: packFlags[i],
    })),
    permissions: PROVIDER_PERMISSIONS,
    providerConfigured,
  });
});

// ===== Credit balance + cost lookup =====
router.get("/api/credits/balance", isAuthenticated, async (req: Request, res: Response) => {
  const u = authUser(req); if (!u) return res.status(401).json({ error: "UNAUTHENTICATED" }); const userId = u.id;
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
  const u = authUser(req); if (!u) return res.status(401).json({ error: "UNAUTHENTICATED" }); const userId = u.id;
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
  const u = authUser(req); if (!u) return res.status(401).json({ error: "UNAUTHENTICATED" }); const userId = u.id;
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
  const u = authUser(req); if (!u) return res.status(401).json({ error: "UNAUTHENTICATED" }); const userId = u.id;
  const snap = await getAvailableCredits(userId);
  res.json(snap);
});

router.post("/api/subscriptions/upgrade-checkout", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const u = authUser(req); if (!u) return res.status(401).json({ error: "UNAUTHENTICATED" }); const userId = u.id;
    const userEmail = u.email ?? null;
    const { plan, period } = req.body as { plan: PlanTier; period: "monthly" | "annual" };
    if (!PAID_PLANS.includes(plan)) return res.status(400).json({ error: "Invalid plan", code: "INVALID_PLAN" });
    const cfg = PLAN_CONFIG[plan];
    const catalogKey = period === "annual" ? cfg.catalogKeyAnnual : cfg.catalogKeyMonthly;
    const provider = getActiveBillingProvider();
    if (!(await provider.isCatalogConfigured(catalogKey))) {
      return res.status(502).json({ error: `Plan ${plan} ${period} is not yet configured`, code: "BILLING_NOT_CONFIGURED" });
    }
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
    const u = authUser(req); if (!u) return res.status(401).json({ error: "UNAUTHENTICATED" }); const userId = u.id;
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
    const u = authUser(req); if (!u) return res.status(401).json({ error: "UNAUTHENTICATED" }); const userId = u.id;
    const userEmail = u.email ?? null;
    const { packId } = req.body as { packId: string };
    const pack = getTopUpPack(packId);
    if (!pack) return res.status(400).json({ error: "Invalid pack", code: "INVALID_PACK" });
    const provider = getActiveBillingProvider();
    if (!(await provider.isCatalogConfigured(pack.catalogKey))) {
      return res.status(502).json({ error: `Pack ${packId} is not yet configured`, code: "BILLING_NOT_CONFIGURED" });
    }
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
  // Look up the provider by URL parameter so multiple billing providers
  // can be registered side-by-side and each one's webhook endpoint
  // routes to the correct adapter — this is the multi-provider
  // extensibility contract from NC-01. Unknown providers => 404.
  const provider = getBillingProviderByName(providerName);
  if (!provider) {
    return res.status(404).json({ error: `Unknown billing provider: ${providerName}`, code: "UNKNOWN_PROVIDER" });
  }

  try {
    // Use the provider-declared header. Each provider knows which header
    // its signatures travel in (Stripe → "stripe-signature"). We never
    // silently fall back to a generic header — that would let an attacker
    // forge events when the real signature is missing.
    const headerName = provider.signatureHeader;
    const sig = (req.headers[headerName] as string) || "";
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) return res.status(400).send("missing raw body");
    if (!sig) return res.status(400).send(`missing ${headerName}`);
    const event = await provider.verifyAndParseWebhook(rawBody, sig);

    // Idempotency: pre-check whether we've already successfully processed
    // this event. Unlike a write-first approach, we only persist the
    // billing_events row AFTER business logic succeeds — so a failure
    // mid-processing rolls back atomically and the event is retried by
    // Stripe rather than silently swallowed.
    const [already] = await db
      .select({ id: billingEvents.id })
      .from(billingEvents)
      .where(and(eq(billingEvents.provider, providerName), eq(billingEvents.eventId, event.eventId)));
    if (already) {
      return res.json({ ok: true, deduped: true });
    }

    if (event.type === "ignored") {
      // Still record ignored events so we don't reprocess them, but no
      // business logic to apply — safe to write standalone.
      try {
        await db.insert(billingEvents).values({ provider: providerName, eventId: event.eventId, eventType: "ignored" });
      } catch (e: any) {
        if (!(String(e?.code) === "23505" || /duplicate key/i.test(String(e?.message)))) throw e;
      }
      return res.json({ ok: true, ignored: event.nativeType });
    }

    // Run business logic + ledger insert in one transaction. If anything
    // throws, the billing_events row is rolled back too, so Stripe's
    // retry will re-attempt the full operation.
    await db.transaction(async (tx) => {
      if (event.type === "subscription.activated" || event.type === "subscription.updated") {
        const userId = await resolveUserId(event.data.userId, event.data.customerId);
        if (userId) {
          // CRITICAL: never silently downgrade. If the catalog key is
          // missing or unknown (price renamed, env drift, foreign-product
          // event), preserve the user's existing plan and let the next
          // well-formed event reconcile. We still record status changes.
          const mapped = catalogKeyToPlanTier(event.data.catalogKey);
          let tier: PlanTier;
          if (mapped) {
            tier = mapped;
          } else {
            const [existing] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, userId));
            tier = (existing?.plan as PlanTier | undefined) ?? "STARTER";
            console.warn(
              `[billing] subscription.${event.type} for user=${userId} had unknown catalogKey=${event.data.catalogKey ?? "null"}; preserving plan=${tier}`,
            );
          }
          const status = mapToInternalStatus(event.data.status);
          await updateSubscriptionPlan(
            userId,
            tier,
            status,
            event.data.customerId,
            event.data.subscriptionId,
            event.data.currentPeriodStart,
            event.data.currentPeriodEnd,
            tx,
          );
        }
      } else if (event.type === "subscription.deleted") {
        const userId = await resolveUserId(event.data.userId, event.data.customerId);
        if (userId) {
          await tx.update(subscriptions).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(subscriptions.userId, userId));
        }
      } else if (event.type === "invoice.paid") {
        const userId = await resolveUserId(event.data.userId, event.data.customerId);
        if (userId) {
          const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, userId));
          if (sub) {
            await resetMonthlyCredits(userId, sub.plan as PlanTier, sub.billingCycleStart ?? new Date(), sub.billingCycleEnd ?? new Date(), tx);
          }
        }
      } else if (event.type === "topup.paid") {
        const userId = await resolveUserId(event.data.userId, event.data.customerId);
        if (userId) {
          await addTopUpCredits(userId, event.data.gcAmount, event.data.catalogKey, tx);
        }
      }

      // Mark processed LAST inside the same transaction. If a concurrent
      // delivery raced us, the unique constraint on (provider, event_id)
      // throws here and the whole transaction (including any work done
      // above) rolls back — the other delivery wins, no double-apply.
      await tx.insert(billingEvents).values({ provider: providerName, eventId: event.eventId, eventType: event.type });
    });

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
