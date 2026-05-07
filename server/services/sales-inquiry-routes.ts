// Phase NC-03 — Public pricing-page projections + sales inquiry endpoint.
//
// `/api/billing/plans` and `/api/billing/topup-packs` are read-only
// projections that compose existing config (PLAN_CONFIG, TOPUP_PACKS,
// PROVIDER_PERMISSIONS, BILLING_CATALOG) so the public pricing page never
// hardcodes prices, GC budgets, or provider gating. `/api/sales-inquiries`
// accepts the contact-sales form and emails ADMIN_NOTIFICATION_EMAIL.

import { Router, type Request, type Response } from "express";
import sgMail from "@sendgrid/mail";
import { and, eq } from "drizzle-orm";
import { PAID_PLANS, PLAN_CONFIG, TOPUP_PACKS } from "../config/plans";
import { PROVIDER_PERMISSIONS } from "../config/providerPermissions";
import { getActiveBillingProvider } from "./billing";
import { db } from "../db";
import { generationRates } from "@shared/schema";

const router = Router();

// Marketing-only fields surfaced on the public pricing page. NOT enforced
// today — these are forward-looking commitments. See replit.md NC-03 note.
const MARKETING_CLAIMS: Record<string, {
  seats: number | "unlimited";
  brandWorkspaces: number | "unlimited";
  prioritySupport: boolean;
  apiAccess: boolean;
  tagline: string;
}> = {
  STARTER: { seats: 1, brandWorkspaces: 1, prioritySupport: false, apiAccess: false, tagline: "For solo creators getting started." },
  GROWTH: { seats: 3, brandWorkspaces: 3, prioritySupport: false, apiAccess: false, tagline: "For growing brands shipping weekly." },
  STUDIO: { seats: 10, brandWorkspaces: 10, prioritySupport: true, apiAccess: true, tagline: "For studios producing at scale." },
  ENTERPRISE: { seats: "unlimited", brandWorkspaces: "unlimited", prioritySupport: true, apiAccess: true, tagline: "For agencies and teams with custom needs." },
};

router.get("/api/billing/plans", async (_req: Request, res: Response) => {
  const provider = getActiveBillingProvider();
  const providerConfigured = provider.isConfigured();
  const checkKey = (key: string) =>
    providerConfigured ? provider.isCatalogConfigured(key).catch(() => false) : Promise.resolve(false);

  const flags = await Promise.all(
    PAID_PLANS.flatMap((tier) => {
      const cfg = PLAN_CONFIG[tier];
      return [checkKey(cfg.catalogKeyMonthly), checkKey(cfg.catalogKeyAnnual)];
    }),
  );

  res.json({
    providerConfigured,
    plans: PAID_PLANS.map((tier, i) => {
      const cfg = PLAN_CONFIG[tier];
      const annualMonthlyCents = Math.round(cfg.annualPriceCents / 12);
      const annualSavingsCents = Math.max(0, cfg.monthlyPriceCents * 12 - cfg.annualPriceCents);
      return {
        tier,
        displayName: cfg.displayName,
        monthlyGC: cfg.monthlyGC,
        monthlyPriceCents: cfg.monthlyPriceCents,
        annualPriceCents: cfg.annualPriceCents,
        annualMonthlyCents,
        annualSavingsCents,
        rolloverPercent: cfg.rolloverPercent,
        rolloverMax: cfg.rolloverMax,
        overageRateCents: cfg.overageRateCents,
        maxResolution: cfg.maxResolution,
        maxClipDuration: cfg.maxClipDuration,
        catalogKeyMonthly: cfg.catalogKeyMonthly,
        catalogKeyAnnual: cfg.catalogKeyAnnual,
        monthlyConfigured: flags[i * 2],
        annualConfigured: flags[i * 2 + 1],
        providerIds: PROVIDER_PERMISSIONS[tier] as readonly string[],
        marketingClaims: MARKETING_CLAIMS[tier] ?? MARKETING_CLAIMS.STARTER,
      };
    }),
  });
});

// Live tier ranges + worked example, derived from generation_rates.
// Falls back to safe defaults pre-seed so the page never lies but also
// never blank-renders.
router.get("/api/billing/generation-rates", async (_req: Request, res: Response) => {
  const TIER_FALLBACK = {
    standard: { min: 3, max: 5 },
    premium: { min: 5, max: 12 },
    "top-tier": { min: 12, max: 30 },
  } as const;
  let tiers: Record<"standard" | "premium" | "top-tier", { min: number; max: number }> = {
    standard: { ...TIER_FALLBACK.standard },
    premium: { ...TIER_FALLBACK.premium },
    "top-tier": { ...TIER_FALLBACK["top-tier"] },
  };
  let liveSourced = false;
  try {
    const rows = await db
      .select({ tier: generationRates.tier, gcCost: generationRates.gcCost })
      .from(generationRates)
      .where(eq(generationRates.isActive, true));
    if (rows.length > 0) {
      const buckets: Record<string, number[]> = { standard: [], premium: [], "top-tier": [] };
      for (const r of rows) {
        const key = (r.tier || "standard").toLowerCase();
        if (key in buckets) buckets[key].push(r.gcCost);
      }
      const next: typeof tiers = { ...tiers };
      let any = false;
      for (const k of Object.keys(buckets) as Array<keyof typeof tiers>) {
        if (buckets[k].length > 0) {
          next[k] = { min: Math.min(...buckets[k]), max: Math.max(...buckets[k]) };
          any = true;
        }
      }
      if (any) {
        tiers = next;
        liveSourced = true;
      }
    }
  } catch (err: any) {
    console.warn("[generation-rates] DB lookup failed, using fallback:", err?.message);
  }
  // Worked example: a 30-second clip = six 5-second Premium clips at the
  // Premium midpoint. Budget reference is the Growth plan's monthlyGC.
  const premiumMid = Math.round((tiers.premium.min + tiers.premium.max) / 2);
  const clipsIn30s = 6;
  const exampleGCPerVideo = premiumMid * clipsIn30s;
  const budgetGC = PLAN_CONFIG.GROWTH.monthlyGC;
  const exampleVideosPerBudget = Math.floor(budgetGC / exampleGCPerVideo);
  res.json({
    liveSourced,
    tiers: {
      Standard: tiers.standard,
      Premium: tiers.premium,
      "Top-tier": tiers["top-tier"],
    },
    example: {
      clipDurationS: 5,
      clipsPerVideo: clipsIn30s,
      videoDurationS: 30,
      premiumGCPerClip: premiumMid,
      gcPerVideo: exampleGCPerVideo,
      planTier: "GROWTH",
      planMonthlyGC: budgetGC,
      videosPerBudget: exampleVideosPerBudget,
    },
  });
});

router.get("/api/billing/topup-packs", async (_req: Request, res: Response) => {
  const provider = getActiveBillingProvider();
  const providerConfigured = provider.isConfigured();
  const checkKey = (key: string) =>
    providerConfigured ? provider.isCatalogConfigured(key).catch(() => false) : Promise.resolve(false);
  const flags = await Promise.all(TOPUP_PACKS.map((p) => checkKey(p.catalogKey)));
  // Badges sourced from config — POPULAR on PACK_500, BEST VALUE on PACK_2500.
  res.json({
    providerConfigured,
    topupPacks: TOPUP_PACKS.map((p, i) => ({
      id: p.id,
      gc: p.gc,
      priceCents: p.priceCents,
      catalogKey: p.catalogKey,
      configured: flags[i],
      badge: p.badge ?? null,
    })),
  });
});

// Naive in-memory rate limiter — 5 inquiries per IP per minute. Good
// enough for an unauthenticated marketing form; if abused, swap for a
// shared store (Redis) without changing the route surface.
const inquiryHits = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (inquiryHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    inquiryHits.set(ip, arr);
    return true;
  }
  arr.push(now);
  inquiryHits.set(ip, arr);
  return false;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

router.get("/api/sales-inquiries/config", (_req, res) => {
  // The pricing page reads this to decide whether to render a working
  // form or fall back to a `mailto:` link. Both an API key AND a
  // destination admin address are required to claim "configured".
  // No hardcoded fallback recipient — if ADMIN_NOTIFICATION_EMAIL is
  // unset the client renders a generic "email us" message and we
  // refuse to deliver server-side rather than route to a stale address.
  const configured =
    !!process.env.SENDGRID_API_KEY &&
    !!process.env.ADMIN_NOTIFICATION_EMAIL &&
    !!process.env.SENDGRID_FROM_EMAIL;
  const fallbackEmail = process.env.ADMIN_NOTIFICATION_EMAIL || null;
  res.json({ configured, fallbackEmail });
});

router.post("/api/sales-inquiries", async (req: Request, res: Response) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests — try again later", code: "RATE_LIMITED" });
  }
  const body = req.body as {
    name?: string;
    email?: string;
    company?: string;
    estMonthlyGC?: string | number;
    message?: string;
    // Honeypot: must be empty. Real users never fill this; bots will.
    website?: string;
  };
  if (body.website) {
    // Honeypot tripped — pretend success so the bot moves on.
    return res.json({ ok: true });
  }
  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const company = (body.company || "").trim();
  const estMonthlyGC = String(body.estMonthlyGC ?? "").trim();
  const message = (body.message || "").trim();
  if (!name || name.length > 200) return res.status(400).json({ ok: false, error: "Name is required", code: "INVALID_NAME" });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return res.status(400).json({ ok: false, error: "Valid email is required", code: "INVALID_EMAIL" });
  }
  if (!company || company.length > 200) return res.status(400).json({ ok: false, error: "Company is required", code: "INVALID_COMPANY" });
  if (!message || message.length > 5000) return res.status(400).json({ ok: false, error: "Message is required", code: "INVALID_MESSAGE" });
  // Optional numeric volume hint — accept blank, otherwise must be a
  // non-negative integer <= 10,000,000.
  if (estMonthlyGC) {
    if (!/^\d{1,8}$/.test(estMonthlyGC) || Number(estMonthlyGC) > 10_000_000) {
      return res.status(400).json({ ok: false, error: "Estimated monthly GC must be a whole number", code: "INVALID_EST_GC" });
    }
  }

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!adminEmail || !fromEmail) {
    return res.status(502).json({ ok: false, error: "Email delivery is not configured", code: "EMAIL_NOT_CONFIGURED" });
  }

  // Always log so the inquiry isn't lost if email is unconfigured.
  console.log(`[sales-inquiry] from=${email} company=${company} estGC=${estMonthlyGC} ip=${ip}`);

  if (!apiKey) {
    return res.status(502).json({ ok: false, error: "Email delivery is not configured", code: "EMAIL_NOT_CONFIGURED" });
  }
  try {
    sgMail.setApiKey(apiKey);
    await sgMail.send({
      to: adminEmail,
      from: { email: fromEmail, name: "NeuralCut.AI Sales" },
      replyTo: email,
      subject: `Sales inquiry: ${name} @ ${company}`,
      text: `Name: ${name}\nEmail: ${email}\nCompany: ${company}\nEst monthly GC: ${estMonthlyGC}\n\nMessage:\n${message}`,
      html: `<div style="font-family:sans-serif;max-width:560px">
        <h2>New sales inquiry</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}<br/>
        <strong>Email:</strong> ${escapeHtml(email)}<br/>
        <strong>Company:</strong> ${escapeHtml(company)}<br/>
        <strong>Est monthly GC:</strong> ${escapeHtml(estMonthlyGC)}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
      </div>`,
    });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[sales-inquiry] send failed:", err?.message);
    return res.status(502).json({ ok: false, error: "Failed to send inquiry", code: "EMAIL_SEND_FAILED" });
  }
});

export default router;
