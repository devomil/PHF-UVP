// Phase 23A: badge for the Claude Haiku scene classifier output.
// Inline reclassify with built-in spinner; "?" indicator when confidence < 0.6.

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { RenderSystemType, SceneRenderRecord } from "../../../../shared/video-types";
import { useToast } from "@/hooks/use-toast";

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

// ─── Task #119: project-header render-type histogram ───────────────────
// Renders a single-line summary of how many scenes belong to each render
// system (e.g. "5 AI Video · 2 Title Card · 1 Infographic"), plus an
// optional "Reclassify all" button. Re-uses the same TYPE_STYLES color
// tokens as the per-scene badge so the histogram matches the inline
// chips at a glance.
//
// Behavior contract:
//  - Pills are only rendered for types that actually appear in the
//    project (zero-count types are hidden to avoid clutter).
//  - A trailing "Unclassified" pill is added when at least one scene has
//    no `renderSystemType` set yet — this is what tells the editor the
//    classifier hasn't finished (or the scene was added after the last
//    batch).
//  - The "Reclassify all" button owns its own in-flight spinner state,
//    matching the per-scene badge contract: callers just await their
//    network call inside the handler. Errors are surfaced by the caller
//    via toast.

interface SceneForHistogram {
  renderSystemType?: RenderSystemType | string | null;
}

/**
 * Compute the render-type histogram for a list of scenes. Exported so
 * unit tests can verify counts directly (the rendered chip order is
 * driven by this map's iteration order, which is the declaration order
 * of TYPE_LABELS — i.e. ai_video → ugc_avatar — so callers get a stable
 * left-to-right ordering across renders).
 *
 * Returns an object with:
 *  - counts: Record<RenderSystemType, number> for known types
 *  - unclassified: number of scenes with no/unknown renderSystemType
 */
export function computeRenderTypeHistogram(scenes: SceneForHistogram[]): {
  counts: Record<RenderSystemType, number>;
  unclassified: number;
} {
  const counts: Record<RenderSystemType, number> = {
    ai_video: 0,
    title_card: 0,
    infographic: 0,
    scientific_medical: 0,
    brand_environment: 0,
    product_showcase: 0,
    ugc_avatar: 0,
  };
  let unclassified = 0;
  for (const s of scenes) {
    const t = s?.renderSystemType;
    if (typeof t === "string" && t in counts) {
      counts[t as RenderSystemType] += 1;
    } else {
      unclassified += 1;
    }
  }
  return { counts, unclassified };
}

interface RenderTypeHistogramProps {
  scenes: SceneForHistogram[];
  /** Async handler fired when the user clicks "Reclassify all". The
   *  histogram owns the in-flight spinner state so callers don't have
   *  to thread loading state through. Errors should be surfaced by the
   *  caller via toast. Omit to hide the button entirely. */
  onReclassifyAll?: () => Promise<void>;
}

export function RenderTypeHistogram({
  scenes,
  onReclassifyAll,
}: RenderTypeHistogramProps) {
  const [isReclassifying, setIsReclassifying] = useState(false);
  const { counts, unclassified } = computeRenderTypeHistogram(scenes);

  // Stable left-to-right order: declaration order of TYPE_LABELS.
  const presentTypes = (Object.keys(TYPE_LABELS) as RenderSystemType[]).filter(
    (t) => counts[t] > 0,
  );

  const handleReclassify = async () => {
    if (!onReclassifyAll || isReclassifying) return;
    setIsReclassifying(true);
    try {
      await onReclassifyAll();
    } finally {
      setIsReclassifying(false);
    }
  };

  // Empty-state: no scenes at all. Rendering nothing keeps the header
  // compact when the user is still on the "generate script" step.
  if (scenes.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1.5 flex-wrap mt-2"
      data-testid="render-type-histogram"
    >
      <span
        className="text-[10px] uppercase tracking-wider mr-1"
        style={{ color: "var(--text-muted)" }}
      >
        Render mix
      </span>
      {presentTypes.length === 0 && unclassified === scenes.length ? (
        <span
          className="text-[11px] inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
          style={{
            color: PENDING_STYLE.fg,
            borderColor: PENDING_STYLE.border,
            backgroundColor: PENDING_STYLE.bg,
          }}
          data-testid="render-type-histogram-all-unclassified"
        >
          {unclassified} unclassified
        </span>
      ) : (
        <>
          {presentTypes.map((t) => {
            const style = TYPE_STYLES[t];
            return (
              <span
                key={t}
                className="text-[11px] inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium"
                style={{
                  color: style.fg,
                  borderColor: style.border,
                  backgroundColor: style.bg,
                }}
                data-testid={`render-type-histogram-pill-${t}`}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: style.fg }}
                />
                <span className="tabular-nums">{counts[t]}</span>
                <span>{TYPE_LABELS[t]}</span>
              </span>
            );
          })}
          {unclassified > 0 ? (
            <span
              className="text-[11px] inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
              style={{
                color: PENDING_STYLE.fg,
                borderColor: PENDING_STYLE.border,
                backgroundColor: PENDING_STYLE.bg,
              }}
              data-testid="render-type-histogram-pill-unclassified"
            >
              <span className="tabular-nums">{unclassified}</span>
              <span>Unclassified</span>
            </span>
          ) : null}
        </>
      )}
      {onReclassifyAll ? (
        <button
          type="button"
          onClick={handleReclassify}
          disabled={isReclassifying}
          data-testid="reclassify-all-btn"
          className="ml-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border opacity-80 hover:opacity-100 disabled:opacity-50 disabled:cursor-wait transition-opacity"
          style={{
            color: "var(--text-secondary)",
            borderColor: "var(--border-subtle)",
            backgroundColor: "transparent",
          }}
          aria-label={
            isReclassifying ? "Reclassifying all scenes" : "Reclassify all scenes"
          }
        >
          {isReclassifying ? (
            <span
              data-testid="reclassify-all-spinner"
              className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-current border-t-transparent animate-spin"
              aria-hidden
            />
          ) : null}
          <span>{isReclassifying ? "Reclassifying…" : "Reclassify all"}</span>
        </button>
      ) : null}
    </div>
  );
}

// ─── Phase 23B (Task #174): render-router UI helpers ──────────────────────
//
// Three small components consumed by `enhanced-scene-editor.tsx`:
//  1. RenderRouterPreviewHint — "Will render as: AI Video (stub)" warning
//     for scene types that don't have a real handler yet. Sources the
//     stub list from the server via /api/universal-video/render-router/handlers
//     (cached by react-query) so it stays in sync as new handlers ship.
//  2. RenderedAsBadge — "Rendered as: …" pill summarizing scene.lastRender,
//     with an inline "Fallback" chip when the dispatcher fell back.
//  3. ManualClassifiedFallbackToast — fires a one-shot toast (acked via
//     localStorage by renderedAt) when a manually classified scene's
//     render silently fell back to a stub.
//
// Kept in this file so the existing label/style maps can be reused.

import { useQuery } from "@tanstack/react-query";

interface RenderHandlerAvailability {
  type: RenderSystemType;
  registered: boolean;
  available: boolean;
}

function useHandlerAvailability(): RenderHandlerAvailability[] {
  const { data } = useQuery<{ success: boolean; handlers: RenderHandlerAvailability[] }>({
    queryKey: ["render-router/handlers"],
    queryFn: async () => {
      const res = await fetch("/api/universal-video/render-router/handlers", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return data?.handlers ?? [];
}

function isKnownRenderType(t: string | undefined): t is RenderSystemType {
  return !!t && t in TYPE_LABELS;
}
function labelFor(t: string | undefined): string {
  return isKnownRenderType(t) ? TYPE_LABELS[t] : t ?? "Unknown";
}
function styleFor(t: string | undefined) {
  return isKnownRenderType(t) ? TYPE_STYLES[t] : PENDING_STYLE;
}

export function RenderRouterPreviewHint({
  renderSystemType,
}: {
  renderSystemType?: RenderSystemType | string;
}) {
  const handlers = useHandlerAvailability();
  if (!renderSystemType) return null;
  const entry = handlers.find((h) => h.type === renderSystemType);
  // Hide while the catalog is still loading — avoid a brief flash of
  // "Will render as AI Video" on real handlers when react-query hasn't
  // resolved yet.
  if (handlers.length === 0) return null;
  if (!entry || entry.available) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
      style={{
        color: "rgb(251,191,36)",
        backgroundColor: "rgba(245,158,11,0.10)",
        border: "1px solid rgba(245,158,11,0.35)",
      }}
      title="This render system is not yet implemented and will fall back to AI Video at generate time."
      data-testid="render-router-preview-hint"
    >
      Will render as AI Video
    </span>
  );
}

export function RenderedAsBadge({
  lastRender,
}: {
  lastRender?: SceneRenderRecord;
}) {
  if (!lastRender) return null;
  const resolved = lastRender.resolvedHandler;
  const style = styleFor(resolved);
  const label = labelFor(resolved);
  const fallback = lastRender.fallback;
  const tooltip = fallback
    ? `Fell back from ${labelFor(fallback.from)}: ${fallback.reason}`
    : `Last rendered ${new Date(lastRender.renderedAt).toLocaleString()}${lastRender.provider ? ` (${lastRender.provider})` : ""}`;
  return (
    <TooltipProvider delayDuration={200}>
      <span className="inline-flex items-center gap-1" data-testid="rendered-as-badge">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider cursor-default"
              style={{
                color: style.fg,
                backgroundColor: style.bg,
                border: `1px solid ${style.border}`,
              }}
            >
              Rendered: {label}
            </span>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
        {fallback ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider cursor-default"
                style={{
                  color: "rgb(248,113,113)",
                  backgroundColor: "rgba(239,68,68,0.10)",
                  border: "1px solid rgba(239,68,68,0.35)",
                }}
                data-testid="rendered-as-fallback-pill"
              >
                Fallback
              </span>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
    </TooltipProvider>
  );
}

export function ManualClassifiedFallbackToast({
  sceneId,
  lastRender,
}: {
  sceneId: string;
  lastRender?: SceneRenderRecord;
}) {
  const { toast } = useToast();
  useEffect(() => {
    if (!lastRender?.manualClassifiedFallback || !lastRender.fallback) return;
    const ackKey = `manualFallbackAck:${sceneId}:${lastRender.renderedAt}`;
    try {
      if (typeof window === "undefined") return;
      if (window.localStorage.getItem(ackKey)) return;
      window.localStorage.setItem(ackKey, "1");
    } catch {
      // localStorage unavailable (private mode) — fall through and toast
      // anyway. Worst case is duplicate toasts on remount.
    }
    const fromLabel = labelFor(lastRender.fallback.from);
    const toLabel = labelFor(lastRender.fallback.to);
    toast({
      title: `Manual choice fell back: ${fromLabel} → ${toLabel}`,
      description: lastRender.fallback.reason,
    });
  }, [sceneId, lastRender?.renderedAt, lastRender?.manualClassifiedFallback, lastRender?.fallback, toast]);
  return null;
}

/** Phase 23B (Task #174): "Re-render upgraded scenes" — small inline
 *  button that POSTs to /re-render-upgraded-scenes for the current
 *  project after the user confirms a per-type breakdown in the
 *  AlertDialog (shadcn-themed; no native confirm). Hidden when no
 *  scenes qualify (none have been rendered yet, or all classifications
 *  still match their last handler). */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ReRenderUpgradeRow {
  sceneId: string;
  from: string;
  to: string;
}

export function ReRenderUpgradedScenesButton({
  scenes,
  projectId,
}: {
  scenes: Array<{ id?: string; renderSystemType?: string; lastRender?: SceneRenderRecord }>;
  projectId: string;
}) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const handlers = useHandlerAvailability();
  const availabilityMap = new Map(handlers.map((h) => [h.type, h.available]));

  // A scene is "upgraded" only if re-rendering today would actually
  // produce a different handler than last time. If the current
  // renderSystemType is still unavailable (stub), re-rendering would
  // just fall back to ai_video again — exclude those to avoid
  // repeatedly charging the user for an identical fallback render.
  const upgradedRows: ReRenderUpgradeRow[] = scenes
    .filter((s) => {
      const last = s?.lastRender;
      if (!last?.resolvedHandler) return false;
      const current = s?.renderSystemType ?? "ai_video";
      if (current === last.resolvedHandler) return false;
      // Only flag if the current type has an available handler — i.e.
      // re-rendering will actually upgrade away from the previous
      // fallback rather than re-trigger the same fallback chain.
      const available = availabilityMap.get(current as RenderSystemType);
      if (available === false) return false;
      return true;
    })
    .map((s) => ({
      sceneId: s.id ?? "",
      from: s.lastRender?.resolvedHandler ?? "unknown",
      to: s.renderSystemType ?? "ai_video",
    }));

  if (upgradedRows.length === 0) return null;

  const breakdown = upgradedRows.reduce<Record<string, number>>((acc, r) => {
    const key = `${labelFor(r.from)} → ${labelFor(r.to)}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/universal-video/projects/${projectId}/re-render-upgraded-scenes`,
        { method: "POST", credentials: "include" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        queued?: number;
        breakdown?: Record<string, number>;
        error?: string;
      };
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      toast({
        title: `Queued ${body.queued ?? 0} scene${body.queued === 1 ? "" : "s"}`,
        description: "Upgraded scenes are re-rendering with their new handlers.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Re-render failed", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => setConfirmOpen(true)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-60"
        style={{
          color: "rgb(167,139,250)",
          backgroundColor: "rgba(124,58,237,0.10)",
          borderColor: "rgba(124,58,237,0.35)",
        }}
        data-testid="re-render-upgraded-scenes-button"
      >
        {isLoading ? (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-current border-t-transparent animate-spin"
            aria-hidden
          />
        ) : null}
        <span>
          {isLoading
            ? "Re-rendering…"
            : `Re-render ${upgradedRows.length} upgraded scene${upgradedRows.length === 1 ? "" : "s"}`}
        </span>
      </button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Re-render {upgradedRows.length} upgraded scene
              {upgradedRows.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Each scene below will be re-rendered with its new render system.
                  This consumes credits per scene.
                </p>
                <ul
                  className="text-xs space-y-1 mt-2"
                  data-testid="re-render-upgraded-breakdown"
                >
                  {Object.entries(breakdown).map(([k, v]) => (
                    <li key={k}>
                      <span className="font-medium">{v}</span>
                      <span className="opacity-70"> · {k}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isLoading}>
              {isLoading ? "Queuing…" : "Re-render"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
