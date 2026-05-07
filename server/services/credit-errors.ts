// Phase NC-02 — Typed credit errors + structured 402/403 envelope helper.
//
// Every generation route should rely on these to surface insufficient-credits
// or plan-locked-provider failures in a single canonical shape, so the
// client's `useGenerationErrorHandler` can route the user to the right
// modal without parsing free-form strings.

import type { Response } from "express";
import type { PlanTier } from "../config/plans";

export interface InsufficientCreditsContext {
  required: number;
  available: number;
  provider?: string | null;
  quality?: string | null;
  durationS?: number | null;
}

export class InsufficientCreditsError extends Error {
  readonly code = "INSUFFICIENT_CREDITS" as const;
  readonly required: number;
  readonly available: number;
  readonly shortfall: number;
  readonly provider: string | null;
  readonly quality: string | null;
  readonly durationS: number | null;

  constructor(ctx: InsufficientCreditsContext) {
    super(`INSUFFICIENT_CREDITS: required=${ctx.required} available=${ctx.available}`);
    this.name = "InsufficientCreditsError";
    this.required = ctx.required;
    this.available = ctx.available;
    this.shortfall = Math.max(0, ctx.required - ctx.available);
    this.provider = ctx.provider ?? null;
    this.quality = ctx.quality ?? null;
    this.durationS = ctx.durationS ?? null;
  }

  toEnvelope() {
    return {
      success: false,
      error: this.message,
      code: this.code,
      required: this.required,
      available: this.available,
      shortfall: this.shortfall,
      provider: this.provider,
      quality: this.quality,
      durationS: this.durationS,
    };
  }
}

export class ProviderNotInPlanError extends Error {
  readonly code = "PROVIDER_NOT_IN_PLAN" as const;
  readonly provider: string;
  readonly currentPlan: PlanTier | null;
  readonly requiredPlan: PlanTier | null;

  constructor(provider: string, currentPlan: PlanTier | null, requiredPlan: PlanTier | null) {
    super(`PROVIDER_NOT_IN_PLAN: ${provider} is not included in your current plan`);
    this.name = "ProviderNotInPlanError";
    this.provider = provider;
    this.currentPlan = currentPlan;
    this.requiredPlan = requiredPlan;
  }

  toEnvelope() {
    return {
      success: false,
      error: this.message,
      code: this.code,
      provider: this.provider,
      currentPlan: this.currentPlan,
      requiredPlan: this.requiredPlan,
    };
  }
}

// Detect a credit-style failure that started life as a plain string thrown
// by older code paths in the credits service. Used to keep older routes
// that still catch `Error` from consumeCredits compatible while we migrate.
export function isInsufficientCreditsLike(err: unknown): boolean {
  if (err instanceof InsufficientCreditsError) return true;
  if (err instanceof Error && /INSUFFICIENT_CREDITS/i.test(err.message)) return true;
  return false;
}

// Parse the legacy `INSUFFICIENT_CREDITS: required=N available=M` string
// emitted by older throw sites so a route catching a generic Error can
// still produce the new envelope without a bespoke branch.
export function parseLegacyInsufficient(err: Error, fallback?: Partial<InsufficientCreditsContext>): InsufficientCreditsError {
  const m = /required=(\d+).*?available=(\d+)/.exec(err.message);
  const required = m ? Number(m[1]) : fallback?.required ?? 0;
  const available = m ? Number(m[2]) : fallback?.available ?? 0;
  return new InsufficientCreditsError({
    required,
    available,
    provider: fallback?.provider ?? null,
    quality: fallback?.quality ?? null,
    durationS: fallback?.durationS ?? null,
  });
}

// Express helper: send the right status + envelope for a typed credit
// error. Returns true if it handled the error (route should `return`).
export function sendCreditErrorIfTyped(res: Response, err: unknown): boolean {
  if (err instanceof InsufficientCreditsError) {
    res.status(402).json(err.toEnvelope());
    return true;
  }
  if (err instanceof ProviderNotInPlanError) {
    res.status(403).json(err.toEnvelope());
    return true;
  }
  return false;
}
