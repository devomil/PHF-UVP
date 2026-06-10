// Task #190 — Upload-guardrail coverage for POST /api/deck-to-video/analyze.
//
// Task #184 added three protections to the deck-analysis intake route:
//   (1) a multer fileFilter that rejects non-PDF uploads with 400,
//   (2) a 50MB multer size cap that rejects oversized files with 413, and
//   (3) a per-user in-memory rate limit (ANALYZE_RATE_LIMIT = 6 / minute)
//       that returns 429 once the window is saturated.
// Task #189 covered credit metering but not these guardrails — this file
// locks them down, and crucially proves the rejected requests are NOT
// charged (analyzeDeck never runs, and no GENERATION ledger row is written).
//
// As in deck-to-video-credits.test.ts the expensive multimodal analyzeDeck()
// call and auth are mocked; the credit engine runs against the real DB so we
// can assert the absence (and, for the rate-limit case, the bounded presence)
// of charges end-to-end.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { db } from "../../db";
import { subscriptions, creditTransactions, users } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";

// isAuthenticated → passthrough; the per-request user is injected by the
// test app's own middleware below.
vi.mock("../auth", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

// Stub the costly PDF render + multimodal LLM analysis. Every guardrail test
// asserts it was NOT invoked for rejected uploads (no work, no charge).
const { analyzeDeckMock } = vi.hoisted(() => ({ analyzeDeckMock: vi.fn() }));
vi.mock("../deck-analysis-service", () => ({
  analyzeDeck: analyzeDeckMock,
}));

// Import AFTER mocks are registered.
import deckRouter from "../deck-to-video-routes";

const PROVIDER = "deck-analysis";
const TYPE_USER_ID = "test-deck-guardrails-type-190";
const SIZE_USER_ID = "test-deck-guardrails-size-190";
const RATE_USER_ID = "test-deck-guardrails-rate-190";
const ANALYZE_RATE_LIMIT = 6;

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

async function generationTxCount(userId: string) {
  const txs = await db
    .select()
    .from(creditTransactions)
    .where(and(eq(creditTransactions.userId, userId), eq(creditTransactions.type, "GENERATION")));
  return txs.length;
}

const ANALYSIS = { pageCount: 8, usableCount: 5, excludedCount: 3 };

describe("POST /api/deck-to-video/analyze — upload guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyzeDeckMock.mockResolvedValue(ANALYSIS);
  });

  it("rejects a non-PDF upload with 400 and never runs (or charges) the analysis", async () => {
    await ensureUser(TYPE_USER_ID, "employee");
    await resetSubscription(TYPE_USER_ID, 1000);

    const res = await request(makeApp({ id: TYPE_USER_ID, role: "employee" }))
      .post("/api/deck-to-video/analyze")
      .attach("file", Buffer.from("not a pdf at all"), {
        filename: "deck.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Only PDF decks are supported");
    expect(analyzeDeckMock).not.toHaveBeenCalled();

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, TYPE_USER_ID));
    expect(sub.currentGC).toBe(1000);
    expect(await generationTxCount(TYPE_USER_ID)).toBe(0);
  });

  it("rejects an oversized (>50MB) file with 413 and never runs (or charges) the analysis", async () => {
    await ensureUser(SIZE_USER_ID, "employee");
    await resetSubscription(SIZE_USER_ID, 1000);

    // 50MB + 1 byte of valid-looking PDF — trips multer's fileSize limit.
    const oversized = Buffer.alloc(50 * 1024 * 1024 + 1, 0x20);
    oversized.write("%PDF-1.4", 0);

    const res = await request(makeApp({ id: SIZE_USER_ID, role: "employee" }))
      .post("/api/deck-to-video/analyze")
      .attach("file", oversized, {
        filename: "huge.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(413);
    expect(res.body.error).toBe("Deck is too large (50MB max)");
    expect(analyzeDeckMock).not.toHaveBeenCalled();

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, SIZE_USER_ID));
    expect(sub.currentGC).toBe(1000);
    expect(await generationTxCount(SIZE_USER_ID)).toBe(0);
  });

  it("returns 429 after the per-user rate limit and does not charge the throttled request", async () => {
    await ensureUser(RATE_USER_ID, "employee");
    // Plenty of credits so the cap, not affordability, is what stops us.
    await resetSubscription(RATE_USER_ID, 100_000);
    const app = makeApp({ id: RATE_USER_ID, role: "employee" });

    // The first ANALYZE_RATE_LIMIT (6) requests in the window all succeed.
    for (let i = 0; i < ANALYZE_RATE_LIMIT; i++) {
      const ok = await request(app)
        .post("/api/deck-to-video/analyze")
        .attach("file", Buffer.from("%PDF-1.4 fake deck bytes"), {
          filename: "deck.pdf",
          contentType: "application/pdf",
        });
      expect(ok.status).toBe(200);
    }
    expect(analyzeDeckMock).toHaveBeenCalledTimes(ANALYZE_RATE_LIMIT);
    expect(await generationTxCount(RATE_USER_ID)).toBe(ANALYZE_RATE_LIMIT);

    // The next request in the same window is rejected with 429...
    const limited = await request(app)
      .post("/api/deck-to-video/analyze")
      .attach("file", Buffer.from("%PDF-1.4 fake deck bytes"), {
        filename: "deck.pdf",
        contentType: "application/pdf",
      });

    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatch(/too many deck analyses/i);

    // ...and it neither ran the analysis nor wrote an extra ledger row.
    expect(analyzeDeckMock).toHaveBeenCalledTimes(ANALYZE_RATE_LIMIT);
    expect(await generationTxCount(RATE_USER_ID)).toBe(ANALYZE_RATE_LIMIT);
  });
});
