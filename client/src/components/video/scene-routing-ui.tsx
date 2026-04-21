import { useEffect, useState, useRef } from "react";
import { Sparkles, Type, Image as ImageIcon, User, BadgeCheck, Lock, X, Info, AlertTriangle, ExternalLink, Plus } from "lucide-react";
import { ProviderCapabilitySelector } from "./ProviderCapabilityCard";
import { VIDEO_PROVIDERS as PROVIDER_CONFIG } from "@shared/provider-config";

export interface RoutingPreview {
  routing: {
    useRecraft: boolean;
    needsTextInjection: boolean;
    needsLogoComposition: boolean;
    suggestedTextElement?: string;
    reason: string;
  };
  recommendedProvider: string | null;
  recommendedReason: string;
  providerLock: string | null;
  videoProviderLock: string | null;
  references: {
    product: string | null;
    character: string | null;
    brandLogo: string | null;
    hasLogoGap: boolean;
  };
}

export interface PromptPreview {
  sceneType: string;
  originalPrompt: string;
  cleanPrompt: string;
  removedElements: string[];
  extractedText: string[];
  extractedLogos: string[];
  warnings: string[];
  routingReason: string;
  references: { url: string; role: string }[];
}

const IMAGE_PROVIDER_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "nano-banana-2", label: "Nano Banana 2", hint: "Best for brand logos, product refs, reference-grounded" },
  { id: "recraft-v3-text", label: "Recraft V3 (Text)", hint: "Accurate in-scene text rendering" },
  { id: "recraft-v4-pro", label: "Recraft V4 Pro", hint: "Photoreal product & lifestyle" },
  { id: "recraft-v4", label: "Recraft V4", hint: "General purpose Recraft" },
  { id: "flux-1.1-pro", label: "Flux 1.1 Pro", hint: "Cinematic, photoreal scenes" },
  { id: "flux", label: "Flux.1", hint: "Clean compositions, product shots" },
  { id: "midjourney", label: "Midjourney", hint: "Premium artistic / cinematic" },
  { id: "gpt-image-1", label: "GPT-Image-1", hint: "Text-heavy scenes, chapter cards" },
];

function fmtProvider(id: string): string {
  const p = PROVIDER_CONFIG[id];
  if (p) return p.displayName;
  const opt = IMAGE_PROVIDER_OPTIONS.find((o) => o.id === id);
  return opt?.label || id;
}

/**
 * Hook: fetch routing preview for a scene draft, debounced on visualDirection.
 */
export function useRoutingPreview(projectId: string, sceneId: string, draftVisualDirection: string | undefined) {
  const [data, setData] = useState<RoutingPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (draftVisualDirection) params.set("visualDirection", draftVisualDirection);
        const res = await fetch(
          `/api/universal-video/${projectId}/scenes/${sceneId}/routing-preview?${params.toString()}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error("routing-preview failed");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // silent — chips simply won't render
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [projectId, sceneId, draftVisualDirection, bump]);

  const refetch = () => setBump((n) => n + 1);

  return { data, loading, refetch };
}

/* ─────────────────────────  Intent Chips  ───────────────────────── */

interface ChipDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  tooltip: string;
  bg: string;
  fg: string;
  border: string;
}

export function SceneIntentChips({ preview }: { preview: RoutingPreview | null }) {
  if (!preview) return null;
  const chips: ChipDef[] = [];

  if (preview.routing.needsLogoComposition) {
    chips.push({
      key: "logo",
      label: "Logo",
      icon: <BadgeCheck className="w-3 h-3" />,
      tooltip: preview.references.brandLogo
        ? "Logo detected — your brand logo will be composited via Nano Banana 2."
        : "Logo detected — but no brand logo found in your brand bible. Add one for accurate rendering.",
      bg: "rgba(168,85,247,0.12)",
      fg: "rgb(192,132,252)",
      border: "rgba(168,85,247,0.28)",
    });
  }
  if (preview.routing.needsTextInjection) {
    chips.push({
      key: "brand-text",
      label: "Brand text",
      icon: <Type className="w-3 h-3" />,
      tooltip: `Brand name detected — ${preview.routing.suggestedTextElement || "environmental signage will be added"}.`,
      bg: "rgba(34,197,94,0.12)",
      fg: "rgb(74,222,128)",
      border: "rgba(34,197,94,0.28)",
    });
  } else if (preview.routing.useRecraft) {
    chips.push({
      key: "text",
      label: "Text scene",
      icon: <Type className="w-3 h-3" />,
      tooltip: `Routing to Recraft V3 — ${preview.routing.reason}.`,
      bg: "rgba(59,130,246,0.12)",
      fg: "rgb(96,165,250)",
      border: "rgba(59,130,246,0.28)",
    });
  }
  if (preview.references.product) {
    chips.push({
      key: "product",
      label: "Product ref",
      icon: <ImageIcon className="w-3 h-3" />,
      tooltip: "Product photo attached — Nano Banana 2 will ground generation in your image.",
      bg: "rgba(16,185,129,0.12)",
      fg: "rgb(52,211,153)",
      border: "rgba(16,185,129,0.28)",
    });
  }
  if (preview.references.character) {
    chips.push({
      key: "char",
      label: "Character ref",
      icon: <User className="w-3 h-3" />,
      tooltip: "Character reference attached — appearance kept consistent across scenes.",
      bg: "rgba(244,114,182,0.12)",
      fg: "rgb(244,114,182)",
      border: "rgba(244,114,182,0.28)",
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2" data-testid="scene-intent-chips">
      <span className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Detected
      </span>
      {chips.map((c) => (
        <span
          key={c.key}
          title={c.tooltip}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium border cursor-help"
          style={{ backgroundColor: c.bg, color: c.fg, borderColor: c.border }}
        >
          {c.icon}
          {c.label}
        </span>
      ))}
    </div>
  );
}

/* ─────────────────────  Provider Pill (popover) ───────────────────── */

export function ProviderPill({
  label,
  providerId,
  recommendedReason,
  isLocked,
  scope,
  onPin,
  onClear,
  styleRecProviders,
  styleRecLabel,
  tone = "blue",
}: {
  label: string;
  providerId: string;
  recommendedReason?: string;
  isLocked: boolean;
  scope: "image" | "video";
  onPin: (provider: string) => void;
  onClear: () => void;
  styleRecProviders?: string[];
  styleRecLabel?: string;
  tone?: "blue" | "green";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const palette =
    tone === "green"
      ? { bg: "rgba(16,185,129,0.12)", fg: "rgb(52,211,153)", border: "rgba(16,185,129,0.28)" }
      : { bg: "rgba(59,130,246,0.12)", fg: "rgb(96,165,250)", border: "rgba(59,130,246,0.28)" };

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border transition-colors hover:brightness-125"
        style={{ backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }}
        data-testid={`provider-pill-${scope}`}
        title="Click to see why this was chosen or override"
      >
        {label}: {fmtProvider(providerId)}
        {isLocked && <Lock className="w-2.5 h-2.5 ml-0.5" />}
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 w-72 rounded-xl border shadow-xl p-3"
          style={{ backgroundColor: "#1a1a2e", borderColor: "rgba(255,255,255,0.1)" }}
        >
          <div className="flex items-start gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-white">
                {isLocked ? "Pinned by you" : "Auto-selected"}: {fmtProvider(providerId)}
              </p>
              {recommendedReason && (
                <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {recommendedReason}
                </p>
              )}
            </div>
          </div>

          <p className="text-[9px] uppercase tracking-wide mt-3 mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Override for this scene
          </p>
          {scope === "image" ? (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false); }}
                className="text-left text-[11px] px-2 py-1.5 rounded-lg border transition-colors hover:bg-white/5"
                style={{
                  borderColor: !isLocked ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.12)",
                  backgroundColor: !isLocked ? "rgba(168,85,247,0.08)" : "transparent",
                  color: "rgba(255,255,255,0.85)",
                }}
                data-testid="image-provider-auto"
              >
                <span className="font-medium">Auto (recommended)</span>
                <span className="block text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  Route based on scene content — currently {fmtProvider(providerId)}
                </span>
              </button>
              {IMAGE_PROVIDER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { onPin(opt.id); setOpen(false); }}
                  className="text-left text-[11px] px-2 py-1.5 rounded-lg border transition-colors hover:bg-white/5"
                  style={{
                    borderColor: isLocked && providerId === opt.id ? "rgba(168,85,247,0.45)" : "rgba(255,255,255,0.08)",
                    backgroundColor: isLocked && providerId === opt.id ? "rgba(168,85,247,0.1)" : "transparent",
                    color: "rgba(255,255,255,0.85)",
                  }}
                  data-testid={`image-provider-${opt.id}`}
                >
                  <span className="font-medium">{opt.label}</span>
                  <span className="block text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                    {opt.hint}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <ProviderCapabilitySelector
              selectedProvider={isLocked ? providerId : "auto"}
              onSelectProvider={(p) => {
                if (p === "auto") onClear();
                else onPin(p);
                setOpen(false);
              }}
              recommendedProvider={providerId}
              recommendationReason={recommendedReason}
              compact
              darkMode
              styleRecommendedProviders={styleRecProviders}
              styleLabel={styleRecLabel}
            />
          )}
          {isLocked && (
            <button
              type="button"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className="mt-2 w-full text-[10px] px-2 py-1.5 rounded-lg border text-center transition-colors hover:bg-white/5"
              style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
            >
              Clear pin (return to auto)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────  Logo Gap CTA  ───────────────────── */

export function LogoGapCard() {
  return (
    <a
      href="/brand-bible#assets"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 mt-2 px-2.5 py-2 rounded-lg border transition-colors hover:bg-amber-500/5"
      style={{ borderColor: "rgba(245,158,11,0.35)", backgroundColor: "rgba(245,158,11,0.06)" }}
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "rgb(245,158,11)" }} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium" style={{ color: "rgb(245,158,11)" }}>
          Logo intent detected — but your brand bible has no logo.
        </p>
        <p className="text-[10px] mt-0.5 inline-flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          Add a logo to your brand bible <ExternalLink className="w-2.5 h-2.5" />
        </p>
      </div>
    </a>
  );
}

/* ─────────────────────  Prompt Inspector Drawer  ───────────────────── */

export function PromptInspectorDrawer({
  projectId,
  sceneId,
  visualDirection,
  open,
  onClose,
}: {
  projectId: string;
  sceneId: string;
  visualDirection?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<PromptPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (visualDirection) params.set("visualDirection", visualDirection);
        const res = await fetch(
          `/api/universal-video/${projectId}/scenes/${sceneId}/prompt-preview?${params.toString()}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error("prompt-preview failed");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, sceneId, visualDirection, open]);

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[60] bg-black/40 transition-opacity ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        aria-hidden="true"
      />
      {/* right-side drawer */}
      <aside
        role="dialog"
        aria-label="What gets sent to the model"
        className={`fixed top-0 right-0 z-[61] h-full w-full max-w-md bg-[#0f0f1a] border-l border-white/10 text-white shadow-2xl transform transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold">What gets sent to the model</h3>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 h-[calc(100%-49px)] overflow-y-auto space-y-4">
          {loading && <p className="text-xs text-white/50">Loading…</p>}
          {!loading && data && (
            <>
              <Section title="Routing reason">
                <p className="text-[12px] text-white/70">{data.routingReason || "—"}</p>
              </Section>
              <Section title="Cleaned prompt (sent to model)">
                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-white/80 bg-black/30 rounded-lg p-2.5 border border-white/5">
                  {data.cleanPrompt || "—"}
                </pre>
              </Section>
              {data.extractedText.length > 0 && (
                <Section title="Extracted text (becomes overlay or signage)">
                  <ul className="text-[11px] text-white/70 list-disc ml-4">
                    {data.extractedText.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </Section>
              )}
              {data.extractedLogos.length > 0 && (
                <Section title="Extracted logos">
                  <ul className="text-[11px] text-white/70 list-disc ml-4">
                    {data.extractedLogos.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </Section>
              )}
              {data.references.length > 0 && (
                <Section title="Reference images sent">
                  <div className="grid grid-cols-4 gap-2">
                    {data.references.map((r, i) => (
                      <div key={i} className="space-y-1">
                        <div className="aspect-square rounded-md overflow-hidden border border-white/10 bg-black/30">
                          <img src={r.url} alt={r.role} className="w-full h-full object-cover" />
                        </div>
                        <p className="text-[9px] text-center text-white/50 uppercase tracking-wide">{r.role}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
              {data.removedElements.length > 0 && (
                <Section title={`Removed by sanitizer (${data.removedElements.length})`}>
                  <p className="text-[10px] text-white/50 leading-relaxed">
                    {data.removedElements.slice(0, 12).map((e, i) => (
                      <span key={i} className="inline-block mr-1 mb-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                        {e.length > 60 ? e.slice(0, 60) + "…" : e}
                      </span>
                    ))}
                    {data.removedElements.length > 12 && <span className="text-white/30">…and more</span>}
                  </p>
                </Section>
              )}
              {data.warnings.length > 0 && (
                <Section title="Warnings">
                  <ul className="text-[11px] text-amber-300 list-disc ml-4">
                    {data.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </Section>
              )}
              <p className="text-[10px] text-white/40 pt-2 border-t border-white/5">
                Read-only preview. Edits to the visual direction reflect here after a short debounce.
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">{title}</p>
      {children}
    </div>
  );
}

/* ─────────────────────  Role-aware Reference Slots  ───────────────────── */

export interface ReferenceSlotsProps {
  productUrl: string | null;
  characterUrl: string | null;
  brandLogoUrl: string | null;
  hasLogoIntent: boolean;
  hasLogoGap: boolean;
  uploads: string[];
  onPreview: (url: string) => void;
  onRemoveUpload: (url: string) => void;
  onAddUpload: () => void;
  onRemoveProduct?: () => void;
}

function SlotTile({
  label,
  url,
  empty,
  emptyAction,
  emptyHint,
  badgeColor,
  onClick,
  onRemove,
  amber,
}: {
  label: string;
  url?: string | null;
  empty?: boolean;
  emptyAction?: () => void;
  emptyHint?: string;
  badgeColor: string;
  onClick?: () => void;
  onRemove?: () => void;
  amber?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {url ? (
        <div className="relative w-16 h-16 rounded-md overflow-hidden border group" style={{ borderColor: badgeColor }}>
          <button
            type="button"
            onClick={onClick}
            className="block w-full h-full"
            title="Expand"
          >
            <img src={url} alt={label} className="w-full h-full object-cover" />
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100"
              title="Remove"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={emptyAction}
          className="w-16 h-16 rounded-md border border-dashed flex flex-col items-center justify-center gap-0.5 transition-colors hover:bg-white/5"
          style={{
            borderColor: amber ? "rgba(245,158,11,0.45)" : "var(--border-subtle)",
            color: amber ? "rgb(245,158,11)" : "var(--text-muted)",
          }}
          title={emptyHint || `Add ${label}`}
        >
          {amber ? <AlertTriangle className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span className="text-[8px] leading-none">{empty ? "Add" : ""}</span>
        </button>
      )}
      <span
        className="text-[9px] uppercase tracking-wide font-medium"
        style={{ color: amber && !url ? "rgb(245,158,11)" : "var(--text-muted)" }}
      >
        {label}
      </span>
    </div>
  );
}

export function RoleAwareReferenceSlots(props: ReferenceSlotsProps) {
  const {
    productUrl,
    characterUrl,
    brandLogoUrl,
    hasLogoIntent,
    hasLogoGap,
    uploads,
    onPreview,
    onRemoveUpload,
    onAddUpload,
    onRemoveProduct,
  } = props;

  return (
    <div className="flex flex-wrap items-start gap-3">
      <SlotTile
        label="Product"
        url={productUrl}
        emptyAction={onAddUpload}
        emptyHint="Upload a product photo for this scene"
        badgeColor="rgba(16,185,129,0.4)"
        onClick={() => productUrl && onPreview(productUrl)}
        onRemove={productUrl && onRemoveProduct ? onRemoveProduct : undefined}
      />
      <SlotTile
        label="Character"
        url={characterUrl}
        emptyAction={onAddUpload}
        emptyHint="Upload a character reference"
        badgeColor="rgba(244,114,182,0.4)"
        onClick={() => characterUrl && onPreview(characterUrl)}
      />
      <SlotTile
        label="Logo"
        url={hasLogoIntent ? brandLogoUrl : null}
        emptyAction={() => {
          if (hasLogoGap) window.open("/brand-bible#assets", "_blank");
        }}
        emptyHint={hasLogoGap ? "Add a logo to your brand bible" : "No logo intent in this scene"}
        badgeColor="rgba(168,85,247,0.4)"
        onClick={() => brandLogoUrl && onPreview(brandLogoUrl)}
        amber={hasLogoGap}
      />
      {uploads.map((url, i) => (
        <SlotTile
          key={`upl-${i}`}
          label={`Upload ${i + 1}`}
          url={url}
          badgeColor="rgba(124,58,237,0.4)"
          onClick={() => onPreview(url)}
          onRemove={() => onRemoveUpload(url)}
        />
      ))}
      <SlotTile
        label="Add"
        empty
        emptyAction={onAddUpload}
        badgeColor="rgba(124,58,237,0.4)"
      />
    </div>
  );
}
