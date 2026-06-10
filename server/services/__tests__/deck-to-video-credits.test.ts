// Task #189 — Credit metering coverage for POST /api/deck-to-video/analyze.
//
// Task #186 wired the deck-analysis route into the credit pipeline:
//   requireCredits({ provider: "deck-analysis" }) gates the request, and a
//   post-success consumeCredits() debits the GC and writes a GENERATION
//   ledger row. These tests prove (1) a successful analyze debits the
//   correct GC and logs a `deck-analysis` GENERATION row, (2) insufficient
//   credits returns 402 and the analysis NEVER runs, and (3) admin-unlimited
//   users get the analytics ledger row WITHOUT a balance decrement.
//
// The expensive multimodal analyzeDeck() call and auth are mocked; the
// credit engine runs against the real DB so balances + ledger rows are
// asserted end-to-end (mirrors admin-unlimited.test.ts).

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { db } from "../../db";
import { subscriptions, creditTransactions, users } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { getCreditCost } from "../credits-service";

// isAuthenticated → passthrough; the per-request user is injected by the
// test app's own middleware below so each case can flip role/balance.
vi.mock("../auth", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

// Stub the costly PDF render + multimodal LLM analysis. We assert on whether
// it was invoked (it must NOT run when the user can't afford the charge).
const { analyzeDeckMock } = vi.hoisted(() => ({ analyzeDeckMock: vi.fn() }));
vi.mock("../deck-analysis-service", () => ({
  analyzeDeck: analyzeDeckMock,
}));

// Import AFTER mocks are registered (vi.mock is hoisted, but keep order clear).
import deckRouter from "../deck-to-video-routes";

const PROVIDER = "deck-analysis";
const USER_ID = "test-deck-credits-user-189";
const ADMIN_ID = "test-deck-credits-admin-189";

function makeApp(user: { id: string; role?: string | null } | null) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = user ?? undefined;
    (req as any).isAuthenticated = (() => !!user) as any;
    next();
  });
  app.use("/api/deck-to-video", deckRouter);
  return app;
}

async function ensureUser(id: string, role: "employee" | "admin") {
  const existing = await db.select().from(users).where(eq(users.id, id));
  if (existing.length === 0) {
    await db.insert(users).values({
      id,
      email: `${id}@neuralcut.ai`,
      role,
      firstName: "Deck",
      lastName: "Test",
    });
  } else {
    await db.update(users).set({ role }).where(eq(users.id, id));
  }
}

async function resetSubscription(userId: string, currentGC: number) {
  await db.delete(creditTransactions).where(eq(creditTransactions.userId, userId));
  await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
  await db.insert(subscriptions).values({
    userId,
    plan: "FREE_TRIAL",
    status: "ACTIVE",
    monthlyGC: 50,
    currentGC,
    topupGC: 0,
    billingCycleStart: new Date(),
    billingCycleEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });
}

function attachDeck(req: request.Test) {
  return req.attach("file", Buffer.from("%PDF-1.4 fake deck bytes"), {
    filename: "deck.pdf",
    contentType: "application/pdf",
  });
}

const ANALYSIS = { pageCount: 8, usableCount: 5, excludedCount: 3 };

describe("POST /api/deck-to-video/analyze — credit metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyzeDeckMock.mockResolvedValue(ANALYSIS);
  });

  it("debits the configured GC and writes a deck-analysis GENERATION row on success", async () => {
    await ensureUser(USER_ID, "employee");
    await resetSubscription(USER_ID, 100);
    const cost = await getCreditCost(PROVIDER, null, null);

    const res = await attachDeck(request(makeApp({ id: USER_ID, role: "employee" })).post("/api/deck-to-video/analyze"));

    expect(res.status).toBe(200);
    expect(res.body.analysis).toMatchObject(ANALYSIS);
    expect(analyzeDeckMock).toHaveBeenCalledTimes(1);

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, USER_ID));
    expect(sub.currentGC).toBe(100 - cost);
    expect(sub.topupGC).toBe(0);

    const txs = await db
      .select()
      .from(creditTransactions)
      .where(and(eq(creditTransactions.userId, USER_ID), eq(creditTransactions.type, "GENERATION")));
    expect(txs).toHaveLength(1);
    expect(txs[0].provider).toBe(PROVIDER);
    expect(txs[0].gcAmount).toBe(-cost);
    expect(txs[0].source).toBe("subscription");
  });

  it("returns 402 and never runs the analysis when the user can't afford it", async () => {
    await ensureUser(USER_ID, "employee");
    await resetSubscription(USER_ID, 0);

    const res = await attachDeck(request(makeApp({ id: USER_ID, role: "employee" })).post("/api/deck-to-video/analyze"));

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("INSUFFICIENT_CREDITS");
    expect(analyzeDeckMock).not.toHaveBeenCalled();

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, USER_ID));
    expect(sub.currentGC).toBe(0);

    const txs = await db
      .select()
      .from(creditTransactions)
      .where(and(eq(creditTransactions.userId, USER_ID), eq(creditTransactions.type, "GENERATION")));
    expect(txs).toHaveLength(0);
  });

  it("admin-unlimited users get an admin_unlimited ledger row but no balance decrement", async () => {
    await ensureUser(ADMIN_ID, "admin");
    await resetSubscription(ADMIN_ID, 5); // intentionally below any real cost
    const cost = await getCreditCost(PROVIDER, null, null);

    const res = await attachDeck(request(makeApp({ id: ADMIN_ID, role: "admin" })).post("/api/deck-to-video/analyze"));

    expect(res.status).toBe(200);
    expect(analyzeDeckMock).toHaveBeenCalledTimes(1);

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, ADMIN_ID));
    expect(sub.currentGC).toBe(5); // unchanged — admin bypasses the decrement

    const txs = await db
      .select()
      .from(creditTransactions)
      .where(and(eq(creditTransactions.userId, ADMIN_ID), eq(creditTransactions.type, "GENERATION")));
    expect(txs).toHaveLength(1);
    expect(txs[0].provider).toBe(PROVIDER);
    expect(txs[0].source).toBe("admin_unlimited");
    expect(txs[0].gcAmount).toBe(-cost); // would-have-been cost logged for analytics
  });
});
