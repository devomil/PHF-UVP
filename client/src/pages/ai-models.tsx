import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Video,
  Image as ImageIcon,
  Wand2,
  Music,
  Brain,
  Eye,
  Layers,
  Users,
  Palette,
  Zap,
  Search,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketingNav, MarketingFooter } from "./features";
import { VIDEO_PROVIDER_CATALOG } from "@shared/provider-catalog";

type ProviderStatus = "active" | "coming-soon";
interface CapModel {
  name: string;
  provider: string;
  status: ProviderStatus;
}
interface Capability {
  key: string;
  name: string;
  count: string;
  icon: typeof Video;
  description: string;
  models: CapModel[];
}

// Mirrors the landing-page capability data so the AI Models page stays the
// source of truth for the public model catalog. Update both lists when we
// add a model — there's a single test in landing.tsx.
const CAPABILITIES: Capability[] = [
  {
    key: "t2v",
    name: "Video Generation (T2V)",
    count: "23 models",
    icon: Video,
    description: "Generate cinematic video from text prompts using the world's best AI video models.",
    models: [
      { name: "Kling 2.6", provider: "Kling", status: "active" },
      { name: "Kling 3.0 Omni", provider: "Kling", status: "active" },
      { name: "Kling 2.5", provider: "Kling", status: "active" },
      { name: "Kling Effects (VFX)", provider: "Kling", status: "active" },
      { name: "Kling AI Avatar", provider: "Kling", status: "active" },
      { name: "Hailuo v2.3", provider: "Hailuo", status: "active" },
      { name: "Hunyuan", provider: "Tencent", status: "active" },
      { name: "Luma Ray v2", provider: "Luma", status: "coming-soon" },
      { name: "Wan 2.6", provider: "Wan", status: "active" },
      { name: "Wan 2.2", provider: "Wan", status: "active" },
      { name: "Wan 2.1", provider: "Wan", status: "active" },
      { name: "Seedance 2", provider: "Seedance", status: "active" },
      { name: "Seedance 2 Fast", provider: "Seedance", status: "active" },
      { name: "Veo 3", provider: "Google", status: "active" },
      { name: "Veo 3.1", provider: "Google", status: "active" },
      { name: "Runway 4.5", provider: "Runway", status: "active" },
      { name: "Runway Gen-4", provider: "Runway", status: "active" },
      { name: "Runway Gen-4 Aleph", provider: "Runway", status: "active" },
      { name: "Runway Act Two", provider: "Runway", status: "active" },
      { name: "Sora 2", provider: "OpenAI", status: "active" },
      { name: "Sora 2 Pro", provider: "OpenAI", status: "active" },
      { name: "OmniHuman 1.5", provider: "OmniHuman", status: "coming-soon" },
      { name: "OmniAvatar", provider: "OmniAvatar", status: "coming-soon" },
    ],
  },
  {
    key: "i2v",
    name: "Image-to-Video (I2V)",
    count: "11 models",
    icon: Zap,
    description: "Animate any image into cinematic video with character consistency and motion control.",
    models: [
      { name: "Kling 2.6 I2V", provider: "Kling", status: "active" },
      { name: "Kling 2.5 I2V", provider: "Kling", status: "active" },
      { name: "Hailuo I2V", provider: "Hailuo", status: "active" },
      { name: "Hailuo Director I2V", provider: "Hailuo", status: "active" },
      { name: "Wan 2.6 I2V", provider: "Wan", status: "active" },
      { name: "Luma I2V", provider: "Luma", status: "active" },
      { name: "Veo 3 I2V", provider: "Google", status: "active" },
      { name: "Veo 3.1 I2V", provider: "Google", status: "active" },
      { name: "Seedance 2 I2V", provider: "Seedance", status: "active" },
      { name: "Seedance 2 Fast I2V", provider: "Seedance", status: "active" },
      { name: "Skyreels I2V", provider: "Skyreels", status: "active" },
    ],
  },
  {
    key: "v2v",
    name: "Video-to-Video (V2V)",
    count: "2 models",
    icon: Layers,
    description: "Transform existing footage with style transfer, object replacement, and re-rendering.",
    models: [
      { name: "Runway Gen-4 Aleph V2V", provider: "Runway", status: "active" },
      { name: "Kling V2V Object Replace", provider: "Kling", status: "active" },
    ],
  },
  {
    key: "performance",
    name: "Character Performance",
    count: "1 model",
    icon: Users,
    description: "Drive character performances from reference videos — animate any portrait with natural motion.",
    models: [{ name: "Runway Act Two", provider: "Runway", status: "active" }],
  },
  {
    key: "t2i",
    name: "Image Generation (T2I)",
    count: "8 models",
    icon: ImageIcon,
    description: "Generate hero images, scene references, product shots and creative assets from text.",
    models: [
      { name: "Flux Schnell", provider: "Flux", status: "active" },
      { name: "Flux Dev", provider: "Flux", status: "active" },
      { name: "Qwen Image", provider: "Qwen", status: "active" },
      { name: "Gemini 2.5 Flash", provider: "Google", status: "active" },
      { name: "Nano Banana Pro", provider: "Google", status: "active" },
      { name: "Z Image Turbo", provider: "Qubico", status: "active" },
      { name: "GPT-Image-1", provider: "OpenAI", status: "coming-soon" },
      { name: "Seedream 4.0", provider: "ByteDance", status: "coming-soon" },
    ],
  },
  {
    key: "i2i",
    name: "Image-to-Image (I2I)",
    count: "4 models",
    icon: Palette,
    description: "Style transfer, image editing, and creative transformation with AI-powered tools.",
    models: [
      { name: "Flux Schnell I2I", provider: "Flux", status: "active" },
      { name: "Flux Dev I2I", provider: "Flux", status: "active" },
      { name: "Qwen Image I2I", provider: "Qwen", status: "active" },
      { name: "Seedream 4.0 I2I", provider: "ByteDance", status: "coming-soon" },
    ],
  },
  {
    key: "toolkit",
    name: "Toolkit (Upscale & BG Remove)",
    count: "4 tools",
    icon: Wand2,
    description: "Upscale images and video to 4K, remove backgrounds, and enhance quality.",
    models: [
      { name: "Image Upscale", provider: "Qubico", status: "active" },
      { name: "Video Upscale", provider: "Qubico", status: "active" },
      { name: "Image BG Removal", provider: "Qubico", status: "active" },
      { name: "Video BG Removal", provider: "Qubico", status: "active" },
    ],
  },
  {
    key: "audio",
    name: "Audio Generation",
    count: "5 services",
    icon: Music,
    description: "AI music composition, voice cloning, text-to-speech, and video-to-audio generation.",
    models: [
      { name: "DiffRhythm", provider: "DiffRhythm", status: "active" },
      { name: "Udio", provider: "Udio", status: "active" },
      { name: "ACE Step AI", provider: "ACE", status: "active" },
      { name: "F5 TTS", provider: "F5", status: "active" },
      { name: "MMAudio", provider: "MMAudio", status: "coming-soon" },
    ],
  },
  {
    key: "creative",
    name: "AI Script & Creative Pipeline",
    count: "6 services",
    icon: Brain,
    description: "4-stage intelligent writing pipeline with strategy, narrative, scene writing, and visual direction.",
    models: [
      { name: "Script Generation", provider: "Claude / GPT-4o", status: "active" },
      { name: "Visual Direction", provider: "Claude / GPT-4o", status: "active" },
      { name: "Prompt Enhancement", provider: "Claude / GPT-4o", status: "active" },
      { name: "Provider Selection", provider: "Claude / GPT-4o", status: "active" },
      { name: "Text Label Extraction", provider: "Claude / GPT-4o", status: "active" },
      { name: "Ask Suzzie Assistant", provider: "Claude / GPT-4o", status: "active" },
    ],
  },
  {
    key: "llm",
    name: "LLM Models",
    count: "4 models",
    icon: Eye,
    description: "Production LLM backbone for script writing, content analysis, and intelligent routing.",
    models: [
      { name: "Claude Sonnet 4", provider: "Anthropic", status: "active" },
      { name: "GPT-4o", provider: "OpenAI", status: "active" },
      { name: "DeepSeek", provider: "DeepSeek", status: "active" },
      { name: "Deep Research", provider: "Deep Research", status: "active" },
    ],
  },
];

const CATEGORY_FILTERS = [
  { key: "all", label: "All" },
  { key: "video", label: "Video" },
  { key: "image", label: "Image" },
  { key: "audio", label: "Audio" },
  { key: "intelligence", label: "Intelligence" },
] as const;

const CATEGORY_KEYS: Record<(typeof CATEGORY_FILTERS)[number]["key"], string[]> = {
  all: CAPABILITIES.map((c) => c.key),
  video: ["t2v", "i2v", "v2v", "performance"],
  image: ["t2i", "i2i", "toolkit"],
  audio: ["audio"],
  intelligence: ["creative", "llm"],
};

export default function AIModelsPage() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] =
    useState<(typeof CATEGORY_FILTERS)[number]["key"]>("all");

  const totals = useMemo(() => {
    const allModels = CAPABILITIES.flatMap((c) => c.models);
    return {
      total: allModels.length,
      active: allModels.filter((m) => m.status === "active").length,
      providers: new Set(allModels.map((m) => m.provider)).size,
      catalog: VIDEO_PROVIDER_CATALOG.length,
    };
  }, []);

  const visibleCaps = useMemo(() => {
    const allowed = new Set(CATEGORY_KEYS[activeFilter]);
    const q = query.trim().toLowerCase();
    return CAPABILITIES.filter((c) => allowed.has(c.key))
      .map((c) => ({
        ...c,
        models: q
          ? c.models.filter(
              (m) => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
            )
          : c.models,
      }))
      .filter((c) => c.models.length > 0);
  }, [activeFilter, query]);

  useEffect(() => {
    document.title = "AI Models — NeuralCut.AI | 60+ video, image & audio models";
    setMeta(
      "description",
      "Every AI model NeuralCut.AI ships with — Kling, Runway, Veo, Sora, Luma, Hailuo, Wan, Flux, ElevenLabs and more. Unified billing, intelligent routing.",
    );
    setLink("canonical", `${window.location.origin}/ai-models`);
    setMeta("og:title", "AI Models — NeuralCut.AI", "property");
    setMeta(
      "og:description",
      "60+ AI video, image, and audio models in one production studio.",
      "property",
    );
    setMeta("og:type", "website", "property");
    setMeta("og:url", `${window.location.origin}/ai-models`, "property");
  }, []);

  return (
    <div
      className="min-h-screen pt-24"
      style={{ backgroundColor: "var(--surface-base, #09090f)", color: "var(--text-primary, #f1f5f9)" }}
    >
      <MarketingNav active="ai-models" />

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-6 pt-12 pb-12 text-center" aria-labelledby="models-hero">
        <div className="absolute inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-purple-900/20 via-indigo-900/10 to-transparent blur-2xl" />
        <p className="text-xs uppercase tracking-[0.2em] text-purple-300 mb-4">AI Models</p>
        <h1
          id="models-hero"
          className="text-4xl md:text-6xl font-bold mb-5 bg-gradient-to-r from-white via-purple-100 to-indigo-200 bg-clip-text text-transparent leading-tight"
        >
          The world's best AI models. <br className="hidden md:inline" />One studio.
        </h1>
        <p className="text-base md:text-lg max-w-2xl mx-auto" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
          {totals.total}+ video, image, and audio models from {totals.providers}+ leading AI labs — unified under one billing meter, one creative framework, and one intelligent router.
        </p>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto mt-10">
          {[
            { label: "Total models", value: `${totals.total}+` },
            { label: "Active today", value: totals.active },
            { label: "AI labs", value: totals.providers },
            { label: "Video providers", value: totals.catalog },
          ].map((s) => (
            <div
              key={s.label}
              className="p-4 rounded-xl border bg-gradient-to-br from-slate-950/80 to-purple-950/10"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
              data-testid={`models-stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="text-2xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
                {s.value}
              </div>
              <div className="text-[11px] uppercase tracking-wider mt-1" style={{ color: "var(--text-muted, #64748b)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Filters + search */}
      <section className="sticky top-20 z-40 backdrop-blur-md border-y" style={{ backgroundColor: "rgba(9,9,15,0.7)", borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Model categories">
            {CATEGORY_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                role="tab"
                aria-selected={activeFilter === f.key}
                data-testid={`filter-${f.key}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all motion-reduce:transition-none ${
                  activeFilter === f.key
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow shadow-purple-600/30"
                    : "border border-white/10 hover:border-purple-500/40 text-slate-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models or providers…"
              data-testid="models-search"
              className="pl-9 h-9 bg-slate-950/60 border-white/10 text-sm placeholder:text-slate-500"
            />
          </div>
        </div>
      </section>

      {/* Capability sections */}
      <main className="max-w-6xl mx-auto px-6 py-16 space-y-12">
        {visibleCaps.length === 0 && (
          <p className="text-center text-sm py-12" style={{ color: "var(--text-muted, #64748b)" }} data-testid="models-empty">
            No models match your search. Try a different term.
          </p>
        )}
        {visibleCaps.map((cap) => {
          const Icon = cap.icon;
          const activeCount = cap.models.filter((m) => m.status === "active").length;
          const comingSoon = cap.models.length - activeCount;
          return (
            <section
              key={cap.key}
              data-testid={`capability-${cap.key}`}
              aria-labelledby={`cap-${cap.key}`}
              className="rounded-2xl border overflow-hidden"
              style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(12,12,20,0.6)" }}
            >
              <header
                className="px-5 md:px-6 py-5 flex items-start gap-4 border-b"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 id={`cap-${cap.key}`} className="text-lg md:text-xl font-semibold text-white">
                      {cap.name}
                    </h2>
                    <span
                      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/15 text-purple-200 border border-purple-500/20"
                      data-testid={`capability-${cap.key}-count`}
                    >
                      {activeCount} active{comingSoon > 0 ? ` · ${comingSoon} coming soon` : ""}
                    </span>
                  </div>
                  <p className="text-sm mt-1.5 max-w-2xl" style={{ color: "var(--text-secondary, #94a3b8)" }}>
                    {cap.description}
                  </p>
                </div>
              </header>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5">
                {cap.models.map((m) => (
                  <li
                    key={`${cap.key}-${m.name}`}
                    data-testid={`model-${m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    className="px-5 py-4 bg-[rgba(12,12,20,0.85)] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-white truncate">{m.name}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted, #64748b)" }}>
                        {m.provider}
                      </div>
                    </div>
                    {m.status === "active" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-300 shrink-0">
                        <Check className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-amber-300 shrink-0">
                        Coming soon
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>

      {/* Routing explainer */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: "Scene-aware routing",
              body: "We pick the best model for each scene type — text-heavy, photoreal, motion-driven — so you don't have to memorize the catalog.",
            },
            {
              title: "Image-first I2V",
              body: "Hero images render first (Flux Pro / Recraft / Nano Banana 2), then animate. Style stays locked across every scene.",
            },
            {
              title: "One billing meter",
              body: "Every model bills in Generation Credits — no per-provider tokens, no surprise overages. Transparent costs before you click Generate.",
            },
          ].map((b) => (
            <div
              key={b.title}
              className="p-5 rounded-2xl border bg-gradient-to-br from-slate-950/80 to-purple-950/10"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              <h3 className="text-base font-semibold mb-2 text-white">{b.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/10 to-transparent" />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
            One subscription. Every model.
          </h2>
          <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
            Pick a plan, get Generation Credits, and use any model in the catalog — gated only by tier, never by token cost.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/pricing">
              <Button
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-7 h-12 rounded-xl shadow-xl shadow-purple-600/20"
                data-testid="models-pricing-cta"
              >
                See pricing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/auth">
              <Button variant="ghost" size="lg" className="h-12 px-6 text-sm" data-testid="models-trial-cta">
                Start free trial
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}
