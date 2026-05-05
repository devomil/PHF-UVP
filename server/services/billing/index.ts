// Phase NC-01 — Billing provider registry.
// Returns the active BillingProvider implementation. Default is Stripe.
// To swap to e.g. Paddle later: add `paddle-provider.ts`, register it
// here, and (optionally) flip `BILLING_PROVIDER=paddle`.

import { stripeProvider } from "./stripe-provider";
import type { BillingProvider } from "./types";

const PROVIDERS: Record<string, BillingProvider> = {
  stripe: stripeProvider,
};

export function getActiveBillingProvider(): BillingProvider {
  const requested = (process.env.BILLING_PROVIDER || "stripe").toLowerCase();
  return PROVIDERS[requested] ?? stripeProvider;
}

export function getBillingProviderByName(name: string): BillingProvider | null {
  return PROVIDERS[name.toLowerCase()] ?? null;
}

export * from "./types";
