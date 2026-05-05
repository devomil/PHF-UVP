// Phase NC-01 — BillingProvider abstraction.
//
// All processor-specific code (Stripe SDK, Paddle SDK, etc.) lives behind
// this interface. The credit engine, routes, and webhook handler import
// only from `server/services/billing` and never from a vendor SDK directly,
// so swapping processors later is a one-file change in `server/services/billing/`.

export type CheckoutKind = "subscription" | "topup";

export interface CreateCheckoutParams {
  kind: CheckoutKind;
  catalogKey: string; // STARTER_MONTHLY, PACK_500, etc.
  userId: string;
  userEmail: string;
  // Optional existing customer id from a previous purchase. If absent, the
  // provider creates a new customer and writes back the id via the webhook.
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

export interface CustomerPortalParams {
  customerId: string;
  returnUrl: string;
}

export interface CustomerPortalResult {
  url: string;
}

// Normalized event shape that the webhook handler consumes. Each
// implementation translates its native event types into this union.
export type ParsedBillingEvent =
  | {
      type: "subscription.activated" | "subscription.updated";
      eventId: string;
      data: {
        subscriptionId: string;
        customerId: string;
        userId: string | null; // resolved from metadata if available
        catalogKey: string | null; // STARTER_MONTHLY etc.
        currentPeriodStart: Date;
        currentPeriodEnd: Date;
        status: "active" | "past_due" | "canceled" | "trialing" | "paused";
      };
    }
  | {
      type: "subscription.deleted";
      eventId: string;
      data: { subscriptionId: string; customerId: string; userId: string | null };
    }
  | {
      type: "invoice.paid";
      eventId: string;
      data: { subscriptionId: string; customerId: string; userId: string | null };
    }
  | {
      type: "topup.paid";
      eventId: string;
      data: { customerId: string; userId: string | null; catalogKey: string; gcAmount: number };
    }
  | { type: "ignored"; eventId: string; nativeType: string };

export interface BillingProvider {
  readonly name: string;
  // Lower-case HTTP header name where this provider transports its
  // webhook signature (e.g. Stripe → "stripe-signature"). The webhook
  // route reads exactly this header — no silent fallbacks — so a missing
  // signature is always rejected as 400 instead of being smuggled past
  // verification under a different header name.
  readonly signatureHeader: string;
  isConfigured(): boolean;
  createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSessionResult>;
  createCustomerPortalSession(params: CustomerPortalParams): Promise<CustomerPortalResult>;
  // The handler is given the raw request body and the signature header.
  // Implementations verify, parse, and return a normalized event.
  verifyAndParseWebhook(rawBody: Buffer | string, signatureHeader: string): Promise<ParsedBillingEvent>;
}

export class BillingNotConfiguredError extends Error {
  code = "BILLING_NOT_CONFIGURED" as const;
  constructor(message = "Billing provider is not configured") {
    super(message);
    this.name = "BillingNotConfiguredError";
  }
}
