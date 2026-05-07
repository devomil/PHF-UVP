// Phase NC-01 + NC-02 — Non-blocking app-wide banner driven by the
// server-derived warningLevel. Dismissible per-session so the user
// isn't yelled at on every navigation.

import { useState } from "react";
import { useCredits } from "@/hooks/use-credits";
import { useCreditModals } from "@/components/credits/credit-modals-provider";
import { Link } from "wouter";
import { X, AlertTriangle, AlertCircle, Zap } from "lucide-react";

const TONE: Record<string, { wrap: string; icon: typeof AlertTriangle; iconColor: string }> = {
  warning: {
    wrap: "border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent text-amber-200",
    icon: AlertTriangle,
    iconColor: "text-amber-300",
  },
  urgent: {
    wrap: "border-orange-500/40 bg-gradient-to-r from-orange-500/15 via-orange-500/5 to-transparent text-orange-200",
    icon: AlertCircle,
    iconColor: "text-orange-300",
  },
  empty: {
    wrap: "border-rose-500/50 bg-gradient-to-r from-rose-500/20 via-rose-500/10 to-transparent text-rose-200",
    icon: Zap,
    iconColor: "text-rose-300",
  },
};

export function CreditWarning() {
  const { data } = useCredits();
  const { openTopUp } = useCreditModals();
  const [dismissed, setDismissed] = useState(false);
  if (!data) return null;
  const level = data.warningLevel ?? "calm";
  if (level === "calm" || dismissed) return null;
  const tone = TONE[level];
  const Icon = tone.icon;
  const msg =
    level === "empty"
      ? "You're out of credits — generations are paused until you top up or upgrade."
      : level === "urgent"
        ? `Only ${data.totalGC} GC left this cycle. Top up to keep shipping.`
        : `${data.totalGC} GC remaining this cycle (${data.percentUsed ?? 0}% used).`;

  return (
    <div
      className={`px-4 py-2.5 border-b text-sm flex items-center justify-between gap-3 ${tone.wrap}`}
      data-testid="credit-warning"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${tone.iconColor}`} />
        <span className="truncate">{msg}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => openTopUp({ shortfall: 0, provider: null })}
          className="px-3 py-1 text-xs font-medium rounded-md bg-white/10 hover:bg-white/20 transition-colors"
          data-testid="credit-warning-topup"
        >
          Top up
        </button>
        <Link
          href="/billing"
          className="px-3 py-1 text-xs font-medium rounded-md bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500"
          data-testid="credit-warning-link"
        >
          Manage plan
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-md hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
          data-testid="credit-warning-dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
