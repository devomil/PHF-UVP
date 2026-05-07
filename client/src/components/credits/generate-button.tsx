// Phase NC-02 — Shared "Generate (~N GC)" button used across all
// generation surfaces.
//
// State machine (derived from credits + cost + planLockedFor):
//   READY          — user has plenty of credits, normal CTA.
//   LOW            — credits remain but balance after spend < 5% of plan.
//   INSUFFICIENT   — bal.totalGC < cost.gcCost. Click opens TopUpModal.
//   PLAN_LOCKED    — provider isn't in the user's plan. Click opens
//                    upgrade flow. Disabled state for the underlying
//                    generation action, hijacked onClick instead.
//
// The button surfaces the cost badge and routes click to the right
// modal automatically when the action would fail. Callers don't need
// to wire useGenerationErrorHandler for the up-front blockers.

import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { useCredits, useCreditCost } from "@/hooks/use-credits";
import { isAdminUnlimitedSnapshot } from "@/lib/admin-unlimited";
import { useCreditModals } from "@/components/credits/credit-modals-provider";
import { Loader2, Sparkles, AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type GenerateButtonState = "ready" | "low" | "insufficient" | "plan-locked";

export interface GenerateButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  provider: string | null;
  quality?: string | null;
  durationS?: number | null;
  loading?: boolean;
  label?: string;
  compact?: boolean;
  // When set, the provider is gated behind a higher plan. Click opens
  // the upgrade flow instead of firing onClick.
  planLockedFor?: { requiredPlan: string | null } | null;
}

interface DerivedState {
  state: GenerateButtonState;
  gcCost: number | null;
  shortfall: number;
}

export const GenerateButton = forwardRef<HTMLButtonElement, GenerateButtonProps>(function GenerateButton(
  {
    provider,
    quality,
    durationS,
    loading,
    label = "Generate",
    compact,
    className,
    disabled,
    planLockedFor,
    onClick,
    ...rest
  },
  ref,
) {
  const { data: bal } = useCredits();
  const { data: cost } = useCreditCost(provider, quality, durationS);
  const { openTopUp, openUpgrade } = useCreditModals();

  const derived: DerivedState = (() => {
    // Admin-unlimited: every provider is allowed and balance is never
    // insufficient, so the button stays in READY regardless of caller-
    // supplied planLockedFor or cost vs balance comparisons.
    if (isAdminUnlimitedSnapshot(bal)) return { state: "ready", gcCost: cost?.gcCost ?? null, shortfall: 0 };
    if (planLockedFor) return { state: "plan-locked", gcCost: cost?.gcCost ?? null, shortfall: 0 };
    if (!cost || !bal) return { state: "ready", gcCost: cost?.gcCost ?? null, shortfall: 0 };
    if (bal.totalGC < cost.gcCost) {
      return { state: "insufficient", gcCost: cost.gcCost, shortfall: cost.gcCost - bal.totalGC };
    }
    const remainingAfter = bal.totalGC - cost.gcCost;
    const lowThreshold = (bal.monthlyGC || 1) * 0.05;
    if (remainingAfter < lowThreshold) {
      return { state: "low", gcCost: cost.gcCost, shortfall: 0 };
    }
    return { state: "ready", gcCost: cost.gcCost, shortfall: 0 };
  })();

  const isDisabledForBusiness = !!disabled || !!loading;
  // INSUFFICIENT and PLAN_LOCKED hijack the click but the *button itself*
  // remains clickable — the user needs to be able to open the modal.
  // Only LOADING and caller-disabled fully block interaction.
  const buttonDisabled = isDisabledForBusiness;

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (derived.state === "plan-locked") {
      e.preventDefault();
      openUpgrade({ provider, requiredPlan: planLockedFor?.requiredPlan ?? null });
      return;
    }
    if (derived.state === "insufficient") {
      e.preventDefault();
      openTopUp({ shortfall: derived.shortfall, required: derived.gcCost ?? undefined, provider });
      return;
    }
    onClick?.(e);
  }

  const stateClass = (() => {
    switch (derived.state) {
      case "insufficient":
        return "from-rose-600 via-rose-700 to-rose-600 hover:shadow-rose-500/40";
      case "plan-locked":
        return "from-purple-700 via-indigo-700 to-purple-700 hover:shadow-indigo-500/40";
      case "low":
        return "from-amber-600 via-orange-600 to-amber-600 hover:shadow-amber-500/40";
      default:
        return "from-purple-600 via-indigo-600 to-purple-600 hover:shadow-purple-500/60";
    }
  })();

  const StateIcon = (() => {
    if (loading) return Loader2;
    if (derived.state === "plan-locked") return Lock;
    if (derived.state === "insufficient") return AlertTriangle;
    return Sparkles;
  })();

  const labelOverride = (() => {
    if (loading) return "Working…";
    if (derived.state === "plan-locked") return "Upgrade to use";
    if (derived.state === "insufficient") return "Top up to generate";
    return label;
  })();

  return (
    <button
      ref={ref}
      type="button"
      disabled={buttonDisabled}
      onClick={handleClick}
      data-testid="generate-button"
      data-state={derived.state}
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all motion-reduce:transition-none",
        "bg-gradient-to-r bg-[length:200%_100%]",
        stateClass,
        "text-white shadow-[0_0_24px_-8px]",
        "hover:bg-[position:100%_0]",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
        compact ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        className,
      )}
      {...rest}
    >
      <StateIcon
        className={cn(
          loading && "animate-spin motion-reduce:animate-none",
          "opacity-90 group-hover:opacity-100",
          compact ? "w-3.5 h-3.5" : "w-4 h-4",
        )}
      />
      <span>{labelOverride}</span>
      {derived.gcCost != null && derived.state !== "plan-locked" && (
        <span
          className={cn(
            "ml-1 px-1.5 py-0.5 rounded-md text-[10px] tabular-nums font-medium",
            derived.state === "insufficient" ? "bg-rose-900/50 text-rose-100" : "bg-white/15 text-white",
          )}
          data-testid="generate-button-cost"
        >
          ~{derived.gcCost} GC
        </span>
      )}
    </button>
  );
});
