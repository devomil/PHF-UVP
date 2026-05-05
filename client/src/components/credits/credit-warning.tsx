// Phase NC-01 — Non-blocking app-wide banner when balance is low.

import { Link } from "wouter";
import { useCredits } from "@/hooks/use-credits";

export function CreditWarning() {
  const { data } = useCredits();
  if (!data) return null;
  const monthly = data.monthlyGC || 0;
  const used = Math.max(0, monthly - data.subscriptionGC);
  const pct = monthly > 0 ? used / monthly : 0;
  const out = data.totalGC <= 0;
  const showOrange = pct >= 0.95 && !out;
  const showYellow = pct >= 0.8 && pct < 0.95 && !out;
  if (!out && !showOrange && !showYellow) return null;
  const tone = out
    ? "bg-red-500/10 border-red-500/30 text-red-300"
    : showOrange
      ? "bg-orange-500/10 border-orange-500/30 text-orange-300"
      : "bg-yellow-500/10 border-yellow-500/30 text-yellow-300";
  const msg = out
    ? "You're out of credits — generations are paused."
    : showOrange
      ? `Only ${data.totalGC} GC remaining — top up or upgrade soon.`
      : `${data.totalGC} GC remaining this cycle.`;
  return (
    <div className={`px-4 py-2 border-b text-sm flex items-center justify-between ${tone}`} data-testid="credit-warning">
      <span>{msg}</span>
      <Link href="/billing" className="underline font-medium" data-testid="credit-warning-link">
        Manage billing
      </Link>
    </div>
  );
}
