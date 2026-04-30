// Phase 23A (Task #118): Compact badge surfacing the Claude Haiku scene
// classifier output. Stays purposely small (one row, ~28px tall) so it can
// sit inline next to the existing "Scene Type" select without re-flowing
// the editor layout.
//
// Visual contract:
//   - Color is keyed by `renderSystemType` (matches the planned renderer
//     palette so users get the same color in editor + storyboard preview).
//   - "Manual" pill replaces the confidence pill when the user has
//     overridden the auto pick.
//   - "Pending" empty-state shows when the classifier hasn't run yet
//     (e.g. project predates Phase 23A or auto-classify is still in
//     flight).
//   - Hover tooltip shows the model's reasoning (truncated to 160 chars
//     server-side, but we use `whitespace-pre-wrap` so a longer string
//     coming from a manual override still renders cleanly).

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { RenderSystemType } from "../../../../shared/video-types";

interface RenderTypeBadgeProps {
  renderSystemType?: RenderSystemType | string;
  classifierConfidence?: number;
  classifierReasoning?: string;
  manuallyClassified?: boolean;
  classifiedAt?: string;
  /** Optional inline action button — used to host "Reclassify". */
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
  trailingAction,
}: RenderTypeBadgeProps) {
  const isKnown = !!renderSystemType && renderSystemType in TYPE_LABELS;
  const style = isKnown ? TYPE_STYLES[renderSystemType as RenderSystemType] : PENDING_STYLE;
  const label = isKnown ? TYPE_LABELS[renderSystemType as RenderSystemType] : "Unclassified";

  // Confidence-of-zero is the documented "classifier error" sentinel; show
  // a clearer "classifier failed" state instead of a misleading "0%".
  const isErrorFallback = isKnown && classifierConfidence === 0
    && typeof classifierReasoning === "string"
    && classifierReasoning.startsWith("Classifier error:");

  const tooltipBody = [
    isKnown ? `Render system: ${label}` : "Render system not yet classified",
    classifierReasoning ? `Reason: ${classifierReasoning}` : null,
    typeof classifierConfidence === "number" ? `Confidence: ${formatConfidence(classifierConfidence)}` : null,
    classifiedAt ? `Classified: ${new Date(classifiedAt).toLocaleString()}` : null,
    manuallyClassified ? "Manually overridden by editor" : null,
  ].filter(Boolean).join("\n");

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
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-[11px]">
            {tooltipBody}
          </TooltipContent>
        </Tooltip>
        {trailingAction}
      </div>
    </TooltipProvider>
  );
}

// Convenience constants exported for the override Select. Re-using them
// here keeps the dropdown labels in sync with the badge labels without a
// second source of truth.
export const RENDER_TYPE_LABELS = TYPE_LABELS;
