// Phase 23A: badge for the Claude Haiku scene classifier output.
// Inline reclassify with built-in spinner; "?" indicator when confidence < 0.6.

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { RenderSystemType } from "../../../../shared/video-types";

interface RenderTypeBadgeProps {
  renderSystemType?: RenderSystemType | string;
  classifierConfidence?: number;
  classifierReasoning?: string;
  manuallyClassified?: boolean;
  classifiedAt?: string;
  /** Async handler that fires when the user clicks the inline
   *  "Reclassify" link. The badge owns the in-flight spinner state so
   *  callers don't have to thread loading state through their own
   *  components — they just await their network call inside the
   *  handler. Errors should be surfaced by the caller via toast. */
  onReclassify?: () => Promise<void>;
  /** Optional extra inline content (rendered after the reclassify
   *  link). Kept for forward-compat with future per-scene actions. */
  trailingAction?: React.ReactNode;
}

const TYPE_LABELS: Record<RenderSystemType, string> = {
  ai_video: "AI Video",
  title_card: "Title Card",
  infographic: "Infographic",
  scientific_medical: "Scientific / Medical",
  brand_environment: "Brand Environment",
  product_showcase: "Product Showcase",
  ugc_avatar: "UGC Avatar",
};

// Tailwind color tokens chosen so each render system stays distinct in
// both light and dark mode without relying on the project CSS vars.
const TYPE_STYLES: Record<RenderSystemType, { fg: string; bg: string; border: string }> = {
  ai_video:           { fg: "rgb(167,139,250)", bg: "rgba(124,58,237,0.12)", border: "rgba(124,58,237,0.35)" },
  title_card:         { fg: "rgb(96,165,250)",  bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)" },
  infographic:        { fg: "rgb(45,212,191)",  bg: "rgba(20,184,166,0.12)", border: "rgba(20,184,166,0.35)" },
  scientific_medical: { fg: "rgb(244,114,182)", bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.35)" },
  brand_environment:  { fg: "rgb(251,191,36)",  bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)" },
  product_showcase:   { fg: "rgb(52,211,153)",  bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)" },
  ugc_avatar:         { fg: "rgb(248,113,113)", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)" },
};

const PENDING_STYLE = {
  fg: "var(--text-muted)",
  bg: "transparent",
  border: "var(--border-subtle)",
};

/** Low-confidence threshold (per Phase 23A spec). Any successful
 *  classification under this score gets a faint "?" indicator so the
 *  editor knows to double-check it before shipping. */
const LOW_CONFIDENCE_THRESHOLD = 0.6;

function formatConfidence(c?: number): string {
  if (typeof c !== "number" || !Number.isFinite(c)) return "—";
  return `${Math.round(Math.max(0, Math.min(1, c)) * 100)}%`;
}

export function RenderTypeBadge({
  renderSystemType,
  classifierConfidence,
  classifierReasoning,
  manuallyClassified,
  classifiedAt,
  onReclassify,
  trailingAction,
}: RenderTypeBadgeProps) {
  const [isReclassifying, setIsReclassifying] = useState(false);

  const isKnown = !!renderSystemType && renderSystemType in TYPE_LABELS;
  const style = isKnown ? TYPE_STYLES[renderSystemType as RenderSystemType] : PENDING_STYLE;
  const label = isKnown ? TYPE_LABELS[renderSystemType as RenderSystemType] : "Unclassified";

  // Confidence-of-zero is the documented "classifier error" sentinel; show
  // a clearer "classifier failed" state instead of a misleading "0%".
  const isErrorFallback = isKnown && classifierConfidence === 0
    && typeof classifierReasoning === "string"
    && classifierReasoning.startsWith("Classifier error:");

  // Low-confidence indicator: only show on auto-classified scenes (manual
  // overrides are by definition certain), and not on the error fallback
  // (already shows "fallback").
  const isLowConfidence =
    isKnown &&
    !manuallyClassified &&
    !isErrorFallback &&
    typeof classifierConfidence === "number" &&
    classifierConfidence < LOW_CONFIDENCE_THRESHOLD &&
    classifierConfidence > 0;

  const tooltipBody = [
    isKnown ? `Render system: ${label}` : "Render system not yet classified",
    classifierReasoning ? `Reason: ${classifierReasoning}` : null,
    typeof classifierConfidence === "number" ? `Confidence: ${formatConfidence(classifierConfidence)}` : null,
    isLowConfidence ? "Low confidence — review before generating." : null,
    classifiedAt ? `Classified: ${new Date(classifiedAt).toLocaleString()}` : null,
    manuallyClassified ? "Manually overridden by editor" : null,
  ].filter(Boolean).join("\n");

  const handleReclassify = async () => {
    if (!onReclassify || isReclassifying) return;
    setIsReclassifying(true);
    try {
      await onReclassify();
    } finally {
      setIsReclassifying(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
        style={{ backgroundColor: style.bg, borderColor: style.border, color: style.fg }}
        data-testid="render-type-badge"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5 cursor-default">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: style.fg }} />
              <span>{label}</span>
              {manuallyClassified ? (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[9px] uppercase tracking-wider border-current"
                  style={{ color: style.fg, borderColor: style.border }}
                >
                  Manual
                </Badge>
              ) : isKnown && !isErrorFallback ? (
                <span className="text-[9px] opacity-70 tabular-nums">
                  {formatConfidence(classifierConfidence)}
                </span>
              ) : isErrorFallback ? (
                <span className="text-[9px] uppercase tracking-wider opacity-70">fallback</span>
              ) : (
                <span className="text-[9px] uppercase tracking-wider opacity-70">pending</span>
              )}
              {isLowConfidence ? (
                <span
                  data-testid="render-type-badge-low-confidence"
                  className="text-[10px] opacity-50 select-none"
                  aria-label="Low confidence — review before generating"
                  title="Low confidence — review before generating"
                >
                  ?
                </span>
              ) : null}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-[11px]">
            {tooltipBody}
          </TooltipContent>
        </Tooltip>
        {onReclassify ? (
          <button
            type="button"
            onClick={handleReclassify}
            disabled={isReclassifying}
            data-testid="reclassify-scene-btn"
            className="ml-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-80 hover:opacity-100 disabled:opacity-50 disabled:cursor-wait transition-opacity"
            style={{ color: style.fg }}
            aria-label={isReclassifying ? "Reclassifying scene" : "Reclassify scene"}
          >
            {isReclassifying ? (
              <span
                data-testid="reclassify-spinner"
                className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-current border-t-transparent animate-spin"
                aria-hidden
              />
            ) : null}
            <span>{isReclassifying ? "…" : "Reclassify"}</span>
          </button>
        ) : null}
        {trailingAction}
      </div>
    </TooltipProvider>
  );
}

// Convenience constants exported for the override Select. Re-using them
// here keeps the dropdown labels in sync with the badge labels without a
// second source of truth.
export const RENDER_TYPE_LABELS = TYPE_LABELS;
