// Phase NC-02 follow-up — requireCredits middleware admin bypass.
// Mounts the middleware on a tiny supertest app and asserts admin
// requests skip 402/403 envelopes while non-admins still receive them.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { requireCredits } from "../requireCredits";

vi.mock("../../services/credits-service", () => ({
  canAccessProvider: vi.fn(async (_uid: string, provider: string) => provider === "kling-2.6"),
  canAfford: vi.fn(async (_uid: string, gc: number) => ({
    ok: false, required: gc, available: 0, shortfall: gc, source: "subscription" as const,
  })),
  getCreditCost: vi.fn(async () => 42),
}));

interface FakeUser { id: string; role?: string | null }

function buildApp(user: FakeUser | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user ?? undefined;
    req.isAuthenticated = (() => !!user) as Request["isAuthenticated"];
    next();
  });
  app.post(
    "/gen",
    requireCredits({ provider: (req) => (req.body?.provider ?? "kling-2.6") as string }),
    (req, res) => res.json({ ok: true, cost: req.creditCost }),
  );
  return app;
}

describe("requireCredits admin bypass", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with attached cost for admin even when canAfford reports insufficient", async () => {
    const app = buildApp({ id: "admin-1", role: "admin" });
    const res = await request(app).post("/gen").send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cost).toMatchObject({ provider: "kling-2.6", gcCost: 42 });
  });

  it("returns 200 for admin on a plan-locked provider (PROVIDER_NOT_IN_PLAN never fires)", async () => {
    const app = buildApp({ id: "admin-1", role: "admin" });
    const res = await request(app).post("/gen").send({ provider: "sora-2-pro" });
    expect(res.status).toBe(200);
  });

  it("returns 402 INSUFFICIENT_CREDITS for non-admins with empty balance", async () => {
    const app = buildApp({ id: "user-1", role: "user" });
    const res = await request(app).post("/gen").send({});
    expect(res.status).toBe(402);
    expect(res.body.code).toBe("INSUFFICIENT_CREDITS");
  });

  it("returns 403 PROVIDER_NOT_IN_PLAN for non-admins on a locked provider", async () => {
    const app = buildApp({ id: "user-1", role: "user" });
    const res = await request(app).post("/gen").send({ provider: "sora-2-pro" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROVIDER_NOT_IN_PLAN");
  });

  it("returns 401 UNAUTHENTICATED when no user is attached", async () => {
    const app = buildApp(null);
    const res = await request(app).post("/gen").send({});
    expect(res.status).toBe(401);
  });
});

import type { Request } from "express";
