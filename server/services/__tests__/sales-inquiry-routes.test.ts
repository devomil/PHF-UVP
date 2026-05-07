// Phase NC-03 — Tests for the public projection endpoints + sales inquiry.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock SendGrid before importing the route module
vi.mock("@sendgrid/mail", () => ({
  default: {
    setApiKey: vi.fn(),
    send: vi.fn().mockResolvedValue([{ statusCode: 202 }]),
  },
}));

// Mock the DB so /api/billing/generation-rates doesn't hit Postgres.
vi.mock("../../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([
          { tier: "standard", gcCost: 3 },
          { tier: "standard", gcCost: 5 },
          { tier: "premium", gcCost: 7 },
          { tier: "premium", gcCost: 11 },
          { tier: "top-tier", gcCost: 15 },
          { tier: "top-tier", gcCost: 25 },
        ]),
      }),
    }),
  },
}));

// Mock the billing provider so isCatalogConfigured doesn't hit Stripe.
vi.mock("../billing", () => ({
  getActiveBillingProvider: () => ({
    name: "stripe",
    isConfigured: () => true,
    isCatalogConfigured: async (key: string) => key.startsWith("STARTER") || key === "PACK_500",
  }),
  BillingNotConfiguredError: class extends Error {},
}));

let salesInquiryRouter: any;
beforeEach(async () => {
  vi.resetModules();
  // Re-import after mocks are in place.
  salesInquiryRouter = (await import("../sales-inquiry-routes")).default;
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(salesInquiryRouter);
  return app;
}

describe("/api/billing/plans projection", () => {
  it("returns four paid plans with configured flags", async () => {
    const res = await request(makeApp()).get("/api/billing/plans");
    expect(res.status).toBe(200);
    const tiers = res.body.plans.map((p: any) => p.tier);
    expect(tiers).toEqual(["STARTER", "GROWTH", "STUDIO", "ENTERPRISE"]);
    const starter = res.body.plans.find((p: any) => p.tier === "STARTER");
    expect(starter.monthlyConfigured).toBe(true);
    expect(starter.annualConfigured).toBe(true);
    const growth = res.body.plans.find((p: any) => p.tier === "GROWTH");
    expect(growth.monthlyConfigured).toBe(false);
    expect(growth.providerIds.length).toBeGreaterThan(0);
    expect(growth.marketingClaims.tagline).toBeTruthy();
    expect(growth.annualSavingsCents).toBeGreaterThan(0);
  });
});

describe("/api/billing/generation-rates projection", () => {
  it("aggregates min/max per tier from active rate rows and computes a worked example", async () => {
    const res = await request(makeApp()).get("/api/billing/generation-rates");
    expect(res.status).toBe(200);
    expect(res.body.liveSourced).toBe(true);
    expect(res.body.tiers.Standard).toEqual({ min: 3, max: 5 });
    expect(res.body.tiers.Premium).toEqual({ min: 7, max: 11 });
    expect(res.body.tiers["Top-tier"]).toEqual({ min: 15, max: 25 });
    expect(res.body.example.premiumGCPerClip).toBe(9);
    expect(res.body.example.gcPerVideo).toBe(54);
    expect(res.body.example.planMonthlyGC).toBeGreaterThan(0);
    expect(res.body.example.videosPerBudget).toBe(Math.floor(res.body.example.planMonthlyGC / 54));
  });
});

describe("/api/billing/topup-packs projection", () => {
  it("returns five packs with the right badges", async () => {
    const res = await request(makeApp()).get("/api/billing/topup-packs");
    expect(res.status).toBe(200);
    expect(res.body.topupPacks.length).toBe(5);
    const popular = res.body.topupPacks.find((p: any) => p.id === "PACK_500");
    expect(popular.badge).toBe("POPULAR");
    expect(popular.configured).toBe(true);
    const best = res.body.topupPacks.find((p: any) => p.id === "PACK_2500");
    expect(best.badge).toBe("BEST VALUE");
    expect(best.configured).toBe(false);
  });
});

describe("/api/sales-inquiries", () => {
  beforeEach(() => {
    process.env.SENDGRID_API_KEY = "SG.fake";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
    process.env.ADMIN_NOTIFICATION_EMAIL = "admin@example.com";
  });

  it("rejects missing fields", async () => {
    const res = await request(makeApp())
      .post("/api/sales-inquiries")
      .send({ name: "", email: "bad", company: "", message: "" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("rejects invalid email", async () => {
    const res = await request(makeApp())
      .post("/api/sales-inquiries")
      .send({ name: "Jane", email: "not-an-email", company: "Acme", message: "hi" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_EMAIL");
  });

  it("rejects non-numeric estMonthlyGC", async () => {
    const res = await request(makeApp())
      .post("/api/sales-inquiries")
      .send({ name: "Jane", email: "j@a.com", company: "Acme", message: "hi", estMonthlyGC: "lots" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_EST_GC");
  });

  it("returns ok on a valid submission", async () => {
    const res = await request(makeApp())
      .post("/api/sales-inquiries")
      .send({
        name: "Jane Doe",
        email: "jane@acme.com",
        company: "Acme",
        estMonthlyGC: "5000",
        message: "Want a demo.",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("silently accepts when honeypot is filled (anti-spam)", async () => {
    const res = await request(makeApp())
      .post("/api/sales-inquiries")
      .send({
        name: "Bot",
        email: "bot@spam.com",
        company: "Spam",
        message: "buy now",
        website: "http://spam.example",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("config endpoint reports email configured state", async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = "admin@example.com";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
    const res = await request(makeApp()).get("/api/sales-inquiries/config");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.fallbackEmail).toBeTruthy();
  });

  it("config endpoint reports not-configured when admin email is missing", async () => {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    const res = await request(makeApp()).get("/api/sales-inquiries/config");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.fallbackEmail).toBeNull();
  });

  it("config endpoint reports not-configured when from-email is missing", async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = "admin@example.com";
    delete process.env.SENDGRID_FROM_EMAIL;
    const res = await request(makeApp()).get("/api/sales-inquiries/config");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });
});
