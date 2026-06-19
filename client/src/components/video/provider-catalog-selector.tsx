import { useState, useEffect } from "react";
import { Sparkles, Video, Image, Volume2, Images } from "lucide-react";
import {
  getVideoProviders,
  getImageProviders,
  COST_TIER_LABELS,
  providerSupportsNativeAudio,
  providerSupportsMultiImage,
} from "@shared/provider-catalog";
import { getMultiImageSupport } from "@shared/provider-config";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ProviderCatalogSelectorProps {
  outputType: "video" | "image";
  provider: string;
  onProviderChange: (v: string) => void;
  label?: string;
  compact?: boolean;
  suzzieRationale?: string;
  onClearRationale?: () => void;
}

export function ProviderCatalogSelector({ outputType, provider, onProviderChange, label = "Provider", compact = false, suzzieRationale, onClearRationale }: ProviderCatalogSelectorProps) {
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleRationale, setVisibleRationale] = useState<string | undefined>(suzzieRationale);

  useEffect(() => {
    setVisibleRationale(suzzieRationale);
  }, [suzzieRationale]);

  function handleProviderChange(v: string) {
    setVisibleRationale(undefined);
    onClearRationale?.();
    onProviderChange(v);
  }

  const providers = outputType === "video" ? getVideoProviders() : getImageProviders();
  const families = Array.from(new Set(providers.map(p => p.family)));

  const filteredProviders = searchQuery
    ? providers.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.family.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : providers;

  const selectedProvider = providers.find(p => p.id === provider);

  return (
    <div>
      {label && <label className={`block ${compact ? "text-xs mb-1" : "text-sm font-medium mb-1.5"}`} style={{ color: "var(--text-muted)" }}>{label}</label>}
      <div className="space-y-2">
        <div
          className="flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer transition-colors"
          style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)" }}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {provider === "auto" ? (
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Auto-select (recommended)</span>
            ) : selectedProvider ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{selectedProvider.name}</span>
                {selectedProvider.highlight && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 whitespace-nowrap">{selectedProvider.highlight}</span>
                )}
                {visibleRationale && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          data-testid="provider-catalog-suzzie-badge"
                          className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full cursor-default flex-shrink-0 bg-green-500/15 text-green-300 border border-green-500/30"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                          Why?
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-left" side="bottom">
                        <p className="text-xs font-semibold mb-0.5 text-green-300">Suzzie's reasoning</p>
                        <p className="text-xs">{visibleRationale}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {providerSupportsNativeAudio(selectedProvider.id) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 whitespace-nowrap cursor-default"
                          data-testid={`provider-native-audio-badge-selected-${selectedProvider.id}`}
                        >
                          <Volume2 className="w-3 h-3" />
                          Native audio
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-left" side="bottom">
                        Generates audio inside the clip — no separate SFX or voiceover needed.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {providerSupportsMultiImage(selectedProvider.id) && (() => {
                  const support = getMultiImageSupport(selectedProvider.id);
                  const hint = support?.hint ?? "Supports multiple image references via @image_N syntax in your prompt.";
                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 whitespace-nowrap cursor-default"
                            data-testid={`provider-multi-image-badge-selected-${selectedProvider.id}`}
                          >
                            <Images className="w-3 h-3" />
                            Multi-image
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-left" side="bottom">
                          {hint}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}
                {!compact && (
                  <span className="text-xs truncate hidden sm:inline" style={{ color: "var(--text-muted)" }}>{selectedProvider.capabilities.join(" · ")}</span>
                )}
              </div>
            ) : (
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{provider}</span>
            )}
          </div>
          <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>

        {expanded && (
          <div className="border rounded-lg overflow-hidden relative z-50" style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
            <div className="p-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
              <input
                type="text"
                placeholder="Search providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 rounded text-sm bg-transparent outline-none"
                style={{ color: "var(--text-primary)" }}
                autoFocus
              />
            </div>
            <div className="max-h-80 overflow-y-auto">
              <button
                type="button"
                className="w-full text-left px-3 py-2.5 transition-colors flex items-center gap-3"
                style={{
                  backgroundColor: provider === "auto" ? "var(--surface-active)" : "transparent",
                  color: "var(--text-primary)",
                }}
                onClick={() => { handleProviderChange("auto"); setExpanded(false); setSearchQuery(""); }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-active)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = provider === "auto" ? "var(--surface-active)" : "transparent")}
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/30 to-indigo-500/30 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Auto-select</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">Recommended</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Intelligently picks the best provider based on your prompt, duration, and aspect ratio
                  </p>
                </div>
              </button>

              {families.map(family => {
                const familyProviders = filteredProviders.filter(p => p.family === family);
                if (familyProviders.length === 0) return null;
                return (
                  <div key={family}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)", backgroundColor: "var(--surface)" }}>
                      {family}
                    </div>
                    {familyProviders.map(p => {
                      const costInfo = COST_TIER_LABELS[p.costTier];
                      return (
                        <button
                          type="button"
                          key={p.id}
                          className="w-full text-left px-3 py-2.5 transition-colors flex items-start gap-3"
                          style={{
                            backgroundColor: provider === p.id ? "var(--surface-active)" : "transparent",
                            color: "var(--text-primary)",
                          }}
                          onClick={() => { handleProviderChange(p.id); setExpanded(false); setSearchQuery(""); }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-active)")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = provider === p.id ? "var(--surface-active)" : "transparent")}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--surface)" }}>
                            {p.type === "video" ? <Video className="w-4 h-4" style={{ color: "var(--text-muted)" }} /> : <Image className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{p.name}</span>
                              {p.highlight && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 whitespace-nowrap">{p.highlight}</span>
                              )}
                              {providerSupportsNativeAudio(p.id) && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 whitespace-nowrap cursor-default"
                                        data-testid={`provider-native-audio-badge-${p.id}`}
                                      >
                                        <Volume2 className="w-3 h-3" />
                                        Native audio
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-left" side="top">
                                      Generates audio inside the clip — no separate SFX or voiceover needed.
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {providerSupportsMultiImage(p.id) && (() => {
                                const support = getMultiImageSupport(p.id);
                                const hint = support?.hint ?? "Supports multiple image references via @image_N syntax in your prompt.";
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span
                                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 whitespace-nowrap cursor-default"
                                          data-testid={`provider-multi-image-badge-${p.id}`}
                                        >
                                          <Images className="w-3 h-3" />
                                          Multi-image
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-left" side="top">
                                        {hint}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
                              <span className="text-[10px] font-medium ml-auto" style={{ color: costInfo.color }}>{costInfo.label}</span>
                            </div>
                            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                              {p.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {p.capabilities.map(cap => (
                                <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>{cap}</span>
                              ))}
                              {p.maxDuration > 0 && (
                                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Up to {p.maxDuration}s</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
