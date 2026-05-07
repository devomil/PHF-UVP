// Phase NC-02 — pure-helper boundary tests for the warning level
// derivations consumed by the meter, banner, and notification engine.

import { describe, it, expect } from "vitest";
import { deriveWarning, deriveDaysUntilReset } from "../credits-service";

describe("deriveWarning", () => {
  it("calm at 0% used", () => {
    const r = deriveWarning(100, 0, 100);
    expect(r.warningLevel).toBe("calm");
    expect(r.percentUsed).toBe(0);
  });

  it("calm just below 80%", () => {
    const r = deriveWarning(21, 0, 100); // 79% used
    expect(r.warningLevel).toBe("calm");
    expect(r.percentUsed).toBe(79);
  });

  it("warning at exactly 80%", () => {
    const r = deriveWarning(20, 0, 100);
    expect(r.warningLevel).toBe("warning");
    expect(r.percentUsed).toBe(80);
  });

  it("urgent at exactly 95%", () => {
    const r = deriveWarning(5, 0, 100);
    expect(r.warningLevel).toBe("urgent");
    expect(r.percentUsed).toBe(95);
  });

  it("empty when total is zero", () => {
    const r = deriveWarning(0, 0, 100);
    expect(r.warningLevel).toBe("empty");
    expect(r.percentUsed).toBe(100);
  });

  it("topup credits keep warning level out of 'empty' even at 0 sub", () => {
    const r = deriveWarning(0, 50, 100);
    // 100% of subscription used but topup is still available
    expect(r.warningLevel).toBe("urgent");
    expect(r.percentUsed).toBe(100);
  });

  it("monthlyGC=0 short-circuits to calm to avoid divide-by-zero", () => {
    const r = deriveWarning(100, 0, 0);
    expect(r.warningLevel).toBe("calm");
    expect(r.percentUsed).toBe(0);
  });
});

describe("deriveDaysUntilReset", () => {
  const now = new Date("2026-05-07T12:00:00Z");
  it("null when cycleEnd is null", () => {
    expect(deriveDaysUntilReset(null, now)).toBeNull();
  });
  it("0 when cycleEnd is in the past", () => {
    expect(deriveDaysUntilReset(new Date("2026-05-01T00:00:00Z"), now)).toBe(0);
  });
  it("floors days into the future", () => {
    const end = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000);
    expect(deriveDaysUntilReset(end, now)).toBe(3);
  });
});
