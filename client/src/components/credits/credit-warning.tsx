// Phase NC-01 + NC-02 — App-wide warning banner driven by the
// server-derived warningLevel.
//
// Per spec: only the WARNING tier (80–95% used) is dismissible, and
// the dismissal is persisted per session+cycle so we don't pester the
// user on every navigation. URGENT and EMPTY tiers are NEVER
// dismissible — those are the levels where action is unavoidable.

import { useEffect, useState } from "react";
import { useCredits } from "@/hooks/use-credits";
import { isAdminUnlimitedSnapshot } from "@/lib/admin-unlimited";
import { useCreditModals } from "@/components/credits/credit-modals-provider";
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

const STORAGE_PREFIX = "creditWarning.dismissed.";

export function CreditWarning() {
  const { data } = useCredits();
  const { openTopUp, openUpgrade } = useCreditModals();
  const [dismissed, setDismissed] = useState(false);

  // Restore dismissal scoped to the current billing cycle so a new
  // cycle re-arms the warning banner automatically.
  useEffect(() => {
    if (!data?.cycleStart) return;
    try {
      setDismissed(sessionStorage.getItem(STORAGE_PREFIX + data.cycleStart) === "1");
    } catch {
      /* sessionStorage may be blocked — ignore */
    }
  }, [data?.cycleStart]);

  if (!data) return null;
  if (isAdminUnlimitedSnapshot(data)) return null;
  const level = data.warningLevel ?? "calm";
  if (level === "calm") return null;
  if (level === "warning" && dismissed) return null;
  const tone = TONE[level];
  const Icon = tone.icon;
  const dismissible = level === "warning";
  const msg =
    level === "empty"
      ? "You're out of credits — generations are paused until you top up or upgrade."
      : level === "urgent"
        ? `Only ${data.totalGC} GC left this cycle. Top up to keep shipping.`
        : `${data.totalGC} GC remaining this cycle (${data.percentUsed ?? 0}% used).`;

  function handleDismiss() {
    setDismissed(true);
    if (data?.cycleStart) {
      try {
        sessionStorage.setItem(STORAGE_PREFIX + data.cycleStart, "1");
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div
      className={`px-4 py-2.5 border-b text-sm flex items-center justify-between gap-3 ${tone.wrap}`}
      data-testid="credit-warning"
      data-warning-level={level}
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
        <button
          onClick={() => openUpgrade({ currentPlan: data?.plan ?? null })}
          className="px-3 py-1 text-xs font-medium rounded-md bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500"
          data-testid="credit-warning-upgrade"
        >
          Upgrade plan
        </button>
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="p-1 rounded-md hover:bg-white/10 transition-colors"
            aria-label="Dismiss until next cycle"
            data-testid="credit-warning-dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
