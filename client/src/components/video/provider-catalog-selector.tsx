import { useState } from "react";
import { Sparkles, Video, Image, Volume2, Images } from "lucide-react";
import {
  getVideoProviders,
  getImageProviders,
  COST_TIER_LABELS,
  providerSupportsNativeAudio,
  providerSupportsMultiImage,
} from "@shared/provider-catalog";

interface ProviderCatalogSelectorProps {
  outputType: "video" | "image";
  provider: string;
  onProviderChange: (v: string) => void;
  label?: string;
  compact?: boolean;
}

export function ProviderCatalogSelector({ outputType, provider, onProviderChange, label = "Provider", compact = false }: ProviderCatalogSelectorProps) {
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
                {providerSupportsNativeAudio(selectedProvider.id) && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 whitespace-nowrap"
                    title="Generates audio inside the clip — no separate SFX or voiceover needed."
                    data-testid={`provider-native-audio-badge-selected-${selectedProvider.id}`}
                  >
                    <Volume2 className="w-3 h-3" />
                    Native audio
                  </span>
                )}
                {providerSupportsMultiImage(selectedProvider.id) && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 whitespace-nowrap"
                    title="Supports multiple image references via @image_1, @image_2, … syntax in your prompt."
                    data-testid={`provider-multi-image-badge-selected-${selectedProvider.id}`}
                  >
                    <Images className="w-3 h-3" />
                    Multi-image
                  </span>
                )}
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
                onClick={() => { onProviderChange("auto"); setExpanded(false); setSearchQuery(""); }}
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
                          onClick={() => { onProviderChange(p.id); setExpanded(false); setSearchQuery(""); }}
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
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 whitespace-nowrap"
                                  title="Generates audio inside the clip — no separate SFX or voiceover needed."
                                  data-testid={`provider-native-audio-badge-${p.id}`}
                                >
                                  <Volume2 className="w-3 h-3" />
                                  Native audio
                                </span>
                              )}
                              {providerSupportsMultiImage(p.id) && (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 whitespace-nowrap"
                                  title="Supports multiple image references via @image_1, @image_2, … syntax in your prompt."
                                  data-testid={`provider-multi-image-badge-${p.id}`}
                                >
                                  <Images className="w-3 h-3" />
                                  Multi-image
                                </span>
                              )}
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
