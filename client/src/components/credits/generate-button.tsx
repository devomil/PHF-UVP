// Phase NC-02 — Shared "Generate (~N GC)" button used across all
// generation surfaces. Centralizes the cost preview, optimistic credit
// debit, and the canonical 402/403 error handler so individual call
// sites stay focused on their request payload.

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { useCredits, useCreditCost } from "@/hooks/use-credits";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GenerateButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  // Provider + quality + durationS feed the cost lookup. When provider
  // is null the cost preview is hidden but the button still renders.
  provider: string | null;
  quality?: string | null;
  durationS?: number | null;
  loading?: boolean;
  // Override the default "Generate" label.
  label?: string;
  // When true, renders a compact size suited to inline contexts.
  compact?: boolean;
}

export const GenerateButton = forwardRef<HTMLButtonElement, GenerateButtonProps>(function GenerateButton(
  { provider, quality, durationS, loading, label = "Generate", compact, className, disabled, ...rest },
  ref,
) {
  const { data: bal } = useCredits();
  const { data: cost } = useCreditCost(provider, quality, durationS);
  const insufficient = !!(cost && bal && bal.totalGC < cost.gcCost);
  const isDisabled = !!disabled || !!loading;

  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      data-testid="generate-button"
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all motion-reduce:transition-none",
        "bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 bg-[length:200%_100%]",
        "text-white shadow-[0_0_24px_-8px] shadow-purple-500/40",
        "hover:bg-[position:100%_0] hover:shadow-purple-500/60",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
        compact ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className={cn("animate-spin motion-reduce:animate-none", compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
      ) : (
        <Sparkles className={cn("opacity-90 group-hover:opacity-100", compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
      )}
      <span>{loading ? "Working…" : label}</span>
      {cost ? (
        <span
          className={cn(
            "ml-1 px-1.5 py-0.5 rounded-md text-[10px] tabular-nums font-medium",
            insufficient ? "bg-rose-500/30 text-rose-100" : "bg-white/15 text-white",
          )}
          data-testid="generate-button-cost"
        >
          ~{cost.gcCost} GC
        </span>
      ) : null}
    </button>
  );
});
