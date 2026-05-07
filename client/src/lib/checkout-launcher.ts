// Phase NC-03 — Auth-aware CTA helper for the public pricing page.
// Signed-out → redirect to /auth?next=/billing&plan=... (or &topup=...)
// Signed-in  → POST upgrade-checkout / topup-checkout, redirect to Stripe.
// configured=false → caller renders "Contact us" instead of calling this.

export type LaunchResult = { ok: true; url: string } | { ok: false; error: string; code?: string };

export async function launchPlanCheckout(opts: {
  isAuthenticated: boolean;
  catalogKey: string;
  tier: "STARTER" | "GROWTH" | "STUDIO" | "ENTERPRISE";
  period: "monthly" | "annual";
}): Promise<LaunchResult> {
  if (!opts.isAuthenticated) {
    const url = `/auth?next=${encodeURIComponent("/billing")}&plan=${encodeURIComponent(opts.catalogKey)}`;
    return { ok: true, url };
  }
  try {
    const res = await fetch("/api/subscriptions/upgrade-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ plan: opts.tier, period: opts.period }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Checkout failed", code: data.code };
    return { ok: true, url: data.url };
  } catch (e: any) {
    return { ok: false, error: e.message || "Network error" };
  }
}

export async function launchTopUpCheckout(opts: {
  isAuthenticated: boolean;
  packId: string;
  catalogKey: string;
}): Promise<LaunchResult> {
  if (!opts.isAuthenticated) {
    const url = `/auth?next=${encodeURIComponent("/billing")}&topup=${encodeURIComponent(opts.catalogKey)}`;
    return { ok: true, url };
  }
  try {
    const res = await fetch("/api/credits/topup-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ packId: opts.packId }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Checkout failed", code: data.code };
    return { ok: true, url: data.url };
  } catch (e: any) {
    return { ok: false, error: e.message || "Network error" };
  }
}
