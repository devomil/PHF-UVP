// Phase NC-02 — Notification dedupe behavior. Asserts that repeated
// evaluator runs in the same cycle never produce duplicate notification
// rows for the same threshold (idempotency contract).

import { describe, it, expect, vi, beforeEach } from "vitest";

const insertedRows: any[] = [];

// Mock the db module so we can simulate the unique-constraint behavior
// of `onConflictDoNothing` without touching a real Postgres.
vi.mock("../../db", () => {
  const seen = new Set<string>();
  const builder = {
    values(v: any) {
      this._v = v;
      return this;
    },
    onConflictDoNothing(_opts: any) {
      return this;
    },
    async returning() {
      const v = this._v;
      const key = `${v.userId}|${v.cycleStart.toISOString()}|${v.threshold}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const row = { id: insertedRows.length + 1, ...v };
      insertedRows.push(row);
      return [row];
    },
    where() { return this; },
    set() { return this; },
  };
  return {
    db: {
      insert: () => ({ ...builder }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
      select: () => ({ from: () => ({ where: () => Promise.resolve([{ email: null, firstName: null }]) }) }),
    },
    __reset: () => { seen.clear(); insertedRows.length = 0; },
  };
});

vi.mock("@shared/schema", () => ({
  creditNotifications: { userId: 'userId', cycleStart: 'cycleStart', threshold: 'threshold' },
  users: { id: 'id', email: 'email', firstName: 'firstName' },
  subscriptions: {},
}));

vi.mock("@sendgrid/mail", () => ({
  default: { setApiKey: () => {}, send: async () => [{ statusCode: 202 }] },
}));

describe("credit notifications — dedupe across repeated evaluator runs", () => {
  beforeEach(async () => {
    const mod: any = await import("../../db");
    mod.__reset?.();
  });

  it("USAGE_80 evaluator emits at most one notification per cycle", async () => {
    const { evaluateUsageThresholds } = await import("../credit-notifications-service");
    const cycleStart = new Date("2026-05-01T00:00:00Z");

    // Five back-to-back evaluator runs in the SAME cycle, each crossing
    // the 80% threshold. Should produce exactly ONE persisted row.
    for (let i = 0; i < 5; i++) {
      await evaluateUsageThresholds("user-1", 18, 0, 100, cycleStart, 12);
    }

    const usage80Rows = insertedRows.filter((r) => r.threshold === "USAGE_80");
    expect(usage80Rows.length).toBe(1);
  });

  it("RESET_TODAY only fires once per rollover even if emitted twice", async () => {
    const { emitResetToday } = await import("../credit-notifications-service");
    const cycleStart = new Date("2026-06-01T00:00:00Z");

    // Simulate the rollover firing the signal, then a stray retry.
    await emitResetToday("user-2", cycleStart, 200, 200);
    await emitResetToday("user-2", cycleStart, 200, 200);

    const resetRows = insertedRows.filter((r) => r.threshold === "RESET_TODAY" && r.userId === "user-2");
    expect(resetRows.length).toBe(1);
  });

  it("different cycles produce independent USAGE_80 notifications", async () => {
    const { evaluateUsageThresholds } = await import("../credit-notifications-service");

    await evaluateUsageThresholds("user-3", 18, 0, 100, new Date("2026-05-01T00:00:00Z"), 12);
    await evaluateUsageThresholds("user-3", 18, 0, 100, new Date("2026-06-01T00:00:00Z"), 12);

    const rows = insertedRows.filter((r) => r.userId === "user-3" && r.threshold === "USAGE_80");
    expect(rows.length).toBe(2);
  });
});
