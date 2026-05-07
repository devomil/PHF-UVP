// Phase NC-01 — Server-authoritative credit guard middleware.
//
// Wrap any generation route with `requireCredits({ provider, quality, durationS })`
// to enforce: (1) auth, (2) provider-tier permission, (3) GC affordability.
// On success the resolved cost is attached to `req.creditCost` for the
// handler to consume after the generation lands.

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { canAccessProvider, canAfford, getCreditCost } from "../services/credits-service";
import { minimumTierForProvider } from "../config/providerPermissions";
import { isAdminUnlimited } from "../lib/admin";

export interface RequireCreditsOptions {
  // Either a static provider id, or a function that derives it from the request.
  provider: string | ((req: Request) => string | null | undefined);
  quality?: string | ((req: Request) => string | null | undefined);
  durationS?: number | ((req: Request) => number | null | undefined);
  // If true, do not block — just resolve cost and attach to req. Useful
  // for endpoints that should warn but not paywall (none in NC-01).
  warnOnly?: boolean;
}

declare module "express-serve-static-core" {
  interface Request {
    creditCost?: {
      provider: string;
      quality: string | null;
      durationS: number | null;
      gcCost: number;
    };
  }
}

function resolveOpt<T>(value: T | ((req: Request) => T | null | undefined) | undefined, req: Request): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "function") {
    const v = (value as (req: Request) => T | null | undefined)(req);
    return (v ?? null) as T | null;
  }
  return value as T;
}

export function requireCredits(opts: RequireCreditsOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
    }
    const reqUser = req.user as { id?: string } | undefined;
    const userId = reqUser?.id;
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const provider = resolveOpt(opts.provider, req);
    if (!provider) {
      return res.status(400).json({ error: "Generation provider is required", code: "PROVIDER_MISSING" });
    }
    const quality = resolveOpt(opts.quality, req) ?? null;
    const durationS = resolveOpt(opts.durationS, req) ?? null;

    try {
      // Admin-unlimited bypass — every provider is allowed, balance
      // checks are skipped, and we still resolve the cost so downstream
      // handlers can log the would-have-been spend.
      if (isAdminUnlimited(req.user as { role?: string | null })) {
        const gcCost = await getCreditCost(provider, quality, durationS);
        req.creditCost = { provider, quality, durationS, gcCost };
        return next();
      }

      const allowed = await canAccessProvider(userId, provider);
      if (!allowed) {
        const required = minimumTierForProvider(provider);
        return res.status(403).json({
          error: `Provider ${provider} not included in your plan`,
          code: "PROVIDER_NOT_IN_PLAN",
          provider,
          requiredPlan: required,
          upgradeUrl: "/billing",
        });
      }

      const gcCost = await getCreditCost(provider, quality, durationS);
      const aff = await canAfford(userId, gcCost);
      if (!aff.ok && !opts.warnOnly) {
        return res.status(402).json({
          error: "Insufficient generation credits",
          code: "INSUFFICIENT_CREDITS",
          required: aff.required,
          available: aff.available,
          shortfall: aff.shortfall,
          upgradeUrl: "/billing",
          topupUrl: "/billing?topup=1",
        });
      }

      req.creditCost = { provider, quality, durationS, gcCost };
      next();
    } catch (err: any) {
      console.error("[requireCredits] error:", err.message);
      return res.status(500).json({ error: "Credit check failed", code: "CREDIT_CHECK_FAILED" });
    }
  };
}
