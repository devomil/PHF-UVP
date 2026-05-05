// Phase NC-01 — Stripe implementation of BillingProvider.
// All Stripe SDK calls are isolated to this file. Other layers import only
// the BillingProvider interface from `./types`.

import Stripe from "stripe";
import {
  type BillingProvider,
  BillingNotConfiguredError,
  type CheckoutSessionResult,
  type CreateCheckoutParams,
  type CustomerPortalParams,
  type CustomerPortalResult,
  type ParsedBillingEvent,
} from "./types";
import { getCatalogEntry, getStripePriceId } from "../../config/billing-catalog";
import { TOPUP_PACKS } from "../../config/plans";

class StripeProvider implements BillingProvider {
  readonly name = "stripe";
  readonly signatureHeader = "stripe-signature";
  private client: Stripe | null = null;

  private getClient(): Stripe {
    if (!this.client) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        throw new BillingNotConfiguredError("STRIPE_SECRET_KEY is not set");
      }
      // No `apiVersion` override: we want the Stripe SDK to use whichever
      // version it was compiled against. Pinning a literal here would
      // require a manual bump on every SDK upgrade and previously forced
      // a `as any` type-escape — both bad for long-term maintenance.
      this.client = new Stripe(key);
    }
    return this.client;
  }

  isConfigured(): boolean {
    return !!process.env.STRIPE_SECRET_KEY;
  }

  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSessionResult> {
    const stripe = this.getClient();
    const entry = getCatalogEntry(params.catalogKey);
    if (!entry) throw new BillingNotConfiguredError(`Unknown catalog key: ${params.catalogKey}`);
    const priceId = getStripePriceId(params.catalogKey);
    if (!priceId) {
      throw new BillingNotConfiguredError(`Stripe price ID for ${params.catalogKey} is not set (env STRIPE_PRICE_${params.catalogKey})`);
    }

    const sharedMetadata = {
      userId: params.userId,
      catalogKey: params.catalogKey,
      kind: params.kind,
    };

    if (params.kind === "subscription") {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer: params.customerId || undefined,
        customer_email: params.customerId ? undefined : params.userEmail,
        client_reference_id: params.userId,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: sharedMetadata,
        subscription_data: { metadata: sharedMetadata },
      });
      return { url: session.url!, sessionId: session.id };
    }

    // top-up: one-time payment
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: params.customerId || undefined,
      customer_email: params.customerId ? undefined : params.userEmail,
      client_reference_id: params.userId,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: sharedMetadata,
      payment_intent_data: { metadata: sharedMetadata },
    });
    return { url: session.url!, sessionId: session.id };
  }

  async createCustomerPortalSession(params: CustomerPortalParams): Promise<CustomerPortalResult> {
    const stripe = this.getClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  async verifyAndParseWebhook(rawBody: Buffer | string, signatureHeader: string): Promise<ParsedBillingEvent> {
    const stripe = this.getClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new BillingNotConfiguredError("STRIPE_WEBHOOK_SECRET is not set");

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
    } catch (err: any) {
      throw new Error(`Stripe webhook signature verification failed: ${err.message}`);
    }

    const eventId = event.id;

    // Stripe SDK type drift: `current_period_{start,end}` may live on the
    // subscription itself OR on its first item depending on the API
    // version the account is pinned to. Read both shapes safely from one
    // helper so the call sites stay type-clean.
    const extractPeriod = (
      sub: Stripe.Subscription,
      which: "start" | "end",
    ): number => {
      const subView = sub as Stripe.Subscription & {
        current_period_start?: number;
        current_period_end?: number;
      };
      const itemView = sub.items?.data?.[0] as
        | (Stripe.SubscriptionItem & {
            current_period_start?: number;
            current_period_end?: number;
          })
        | undefined;
      const key = which === "start" ? "current_period_start" : "current_period_end";
      return subView[key] ?? itemView?.[key] ?? 0;
    };

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        // `metadata` is `Stripe.Metadata` (Record<string,string>) — no cast needed.
        const userId = sub.metadata?.userId ?? null;
        const catalogKey = sub.metadata?.catalogKey ?? null;
        const status = mapSubStatus(sub.status);
        return {
          type: "subscription.updated",
          eventId,
          data: {
            subscriptionId: sub.id,
            customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
            userId,
            catalogKey,
            // current_period_{start,end} moved onto subscription items in
            // recent Stripe API versions. Read top-level for older accounts
            // and fall back to the first item for newer ones. The narrow
            // `SubscriptionPeriodFields` type isolates the SDK version drift
            // to one place instead of leaking `as any` across the file.
            currentPeriodStart: new Date(extractPeriod(sub, "start") * 1000),
            currentPeriodEnd: new Date(extractPeriod(sub, "end") * 1000),
            status,
          },
        };
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        return {
          type: "subscription.deleted",
          eventId,
          data: {
            subscriptionId: sub.id,
            customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
            userId: sub.metadata?.userId ?? null,
          },
        };
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        // `Invoice.subscription` was renamed across SDK majors — narrow
        // the unknown shape with a typed view rather than a blanket `any`.
        const invView = inv as Stripe.Invoice & {
          subscription?: string | { id: string } | null;
        };
        const invSub = invView.subscription;
        const subId = typeof invSub === "string" ? invSub : invSub?.id;
        return {
          type: "invoice.paid",
          eventId,
          data: {
            subscriptionId: subId ?? "",
            customerId: typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? "",
            userId: inv.metadata?.userId ?? null,
          },
        };
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const meta = pi.metadata;
        if (meta?.kind !== "topup" || !meta?.catalogKey) {
          return { type: "ignored", eventId, nativeType: event.type };
        }
        const pack = TOPUP_PACKS.find((p) => p.catalogKey === meta.catalogKey);
        if (!pack) return { type: "ignored", eventId, nativeType: event.type };
        return {
          type: "topup.paid",
          eventId,
          data: {
            customerId: typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? "",
            userId: meta.userId ?? null,
            catalogKey: meta.catalogKey,
            gcAmount: pack.gc,
          },
        };
      }
      default:
        return { type: "ignored", eventId, nativeType: event.type };
    }
  }
}

function mapSubStatus(s: Stripe.Subscription.Status): "active" | "past_due" | "canceled" | "trialing" | "paused" {
  switch (s) {
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "trialing":
      return "trialing";
    case "paused":
    case "incomplete":
      return "paused";
    default:
      return "paused";
  }
}

export const stripeProvider = new StripeProvider();
