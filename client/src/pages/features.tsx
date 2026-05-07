import { useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Brain,
  Video,
  Image as ImageIcon,
  Wand2,
  Music,
  Layers,
  Users,
  Palette,
  Shield,
  MessageSquare,
  Sparkles,
  Zap,
  Eye,
  Mic,
  FileText,
  Share2,
  BarChart3,
  Repeat,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import neuralcutFullLogo from "@/assets/neuralcut-full-logo.png";

interface FeatureGroup {
  title: string;
  blurb: string;
  features: { icon: typeof Brain; title: string; description: string; gradient: string }[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "Script & Creative Pipeline",
    blurb: "AI that thinks like a creative director — strategy, narrative, scene writing, and cinematic direction in one connected pipeline.",
    features: [
      {
        icon: Brain,
        title: "4-Stage Script Pipeline",
        description: "Creative strategy → narrative architecture → scene narration → cinematic prompt enhancement. Every stage tuned to your brand voice and trend signals.",
        gradient: "from-purple-500 to-indigo-500",
      },
      {
        icon: MessageSquare,
        title: "Ask Suzzie AI Assistant",
        description: "A conversational creative partner that suggests visual directions, recommends providers, and explains tradeoffs — grounded in our cinematic framework.",
        gradient: "from-fuchsia-500 to-purple-500",
      },
      {
        icon: FileText,
        title: "Custom Script Workflow",
        description: "Scene-by-scene editor for granular control over every line, beat, and visual cue when you want to drive the narrative yourself.",
        gradient: "from-indigo-500 to-blue-500",
      },
      {
        icon: BarChart3,
        title: "Trending Hook Intelligence",
        description: "AI-powered analysis of viral content patterns and keywords. Surface high-performing hooks before you write the first line.",
        gradient: "from-rose-500 to-orange-500",
      },
    ],
  },
  {
    title: "Video Generation",
    blurb: "An image-first I2V pipeline that prioritizes consistency, plus micro-scene architecture for granular regeneration.",
    features: [
      {
        icon: Video,
        title: "Multi-Provider Video AI",
        description: "60+ video, image, and audio models from Kling, Runway, Luma, Veo, Sora, Hailuo, Wan, Seedance and more. Scene-aware routing picks the best one automatically.",
        gradient: "from-pink-500 to-rose-500",
      },
      {
        icon: Layers,
        title: "Micro-Scene Architecture",
        description: "Complex scenes break automatically into independently editable, regenerable micro-scenes — fix one beat without touching the rest.",
        gradient: "from-cyan-500 to-blue-500",
      },
      {
        icon: Sparkles,
        title: "Image-First I2V Pipeline",
        description: "Every clip starts with an intermediate image (Flux Pro / Recraft / Nano Banana) so style stays locked across scenes, then animates with your chosen video model.",
        gradient: "from-violet-500 to-purple-500",
      },
      {
        icon: Eye,
        title: "Text-Aware I2V Routing",
        description: "Text-heavy scenes auto-route through GPT-Image-1 → I2V so on-screen copy renders accurately — no more garbled product names or CTAs.",
        gradient: "from-emerald-500 to-teal-500",
      },
    ],
  },
  {
    title: "Brand & Character Consistency",
    blurb: "Persistent character profiles, full brand integration, and visual art presets that keep every scene on-brand.",
    features: [
      {
        icon: Users,
        title: "Character Reference Pipeline",
        description: "Build persistent characters with reference images. Reuse them across projects with image-to-image generation — your hero stays your hero.",
        gradient: "from-emerald-500 to-teal-500",
      },
      {
        icon: Shield,
        title: "Brand Asset Management",
        description: "Logos, color palettes, fonts, custom intros and outros, and brand voice — automatically woven into every video without re-uploading.",
        gradient: "from-amber-500 to-orange-500",
      },
      {
        icon: Palette,
        title: "9 Visual Art Presets",
        description: "3D Illustration, Cinematic Realism, Watercolor, Neon Futuristic and more — each with tuned prompt engineering, provider routing, and per-scene overrides.",
        gradient: "from-blue-500 to-cyan-500",
      },
      {
        icon: Library,
        title: "Centralized Asset Library",
        description: "Every generated and uploaded asset, organized and searchable. Reuse anything across any project with advanced AI creation modes built in.",
        gradient: "from-slate-500 to-purple-500",
      },
    ],
  },
  {
    title: "Workflows & Production Modes",
    blurb: "From rapid one-shot creation to deep narrative production — a workflow for every story you tell.",
    features: [
      {
        icon: Zap,
        title: "Quick Create",
        description: "Rapid asset creation across T2I, T2V, I2I, I2V, and V2V with advanced image transformation. Spin up a hero shot in under a minute.",
        gradient: "from-yellow-500 to-orange-500",
      },
      {
        icon: Wand2,
        title: "Studio Polish",
        description: "Upload existing media for professional polishing, editing, and rendering. Two-stage rendering bypasses Lambda for raw clips when possible — dramatically faster.",
        gradient: "from-purple-500 to-pink-500",
      },
      {
        icon: FileText,
        title: "Long Story / Deep Dive Mode",
        description: "Document ingestion, chapter outlining, and multi-scene repurposing for podcasts, explainers, and serialized content. Ideal for long-form storytelling.",
        gradient: "from-indigo-500 to-violet-500",
      },
      {
        icon: Repeat,
        title: "Custom Script Workflow",
        description: "Hand-craft each scene with full control over narration, visuals, motion, audio, and overlays — perfect for hero campaigns and brand films.",
        gradient: "from-blue-500 to-indigo-500",
      },
    ],
  },
  {
    title: "Audio & Polish",
    blurb: "Cinematic sound, per-scene voiceovers with word-level captions, and a complete overlay system.",
    features: [
      {
        icon: Mic,
        title: "Per-Scene Voiceover & Captions",
        description: "ElevenLabs-powered voiceovers with word-level timing. Customizable text caption overlays that sync automatically to narration.",
        gradient: "from-rose-500 to-pink-500",
      },
      {
        icon: Music,
        title: "Sound Design & Music",
        description: "AI-composed background music, intelligent audio ducking under voiceovers, and quality evaluation that flags muddy mixes before render.",
        gradient: "from-violet-500 to-purple-500",
      },
      {
        icon: ImageIcon,
        title: "Overlay System",
        description: "Customizable image and text overlays with styling, animations, and a WYSIWYG preview. Pixel-control over end cards, lower thirds, and CTAs.",
        gradient: "from-cyan-500 to-blue-500",
      },
    ],
  },
  {
    title: "Distribution & Operations",
    blurb: "Render, sync, and publish to every channel — without leaving the studio.",
    features: [
      {
        icon: Share2,
        title: "Social Publishing Hub",
        description: "Ayrshare-powered scheduling and publishing to TikTok, Reels, Shorts, LinkedIn and more. AI caption generation tuned per channel.",
        gradient: "from-emerald-500 to-cyan-500",
      },
      {
        icon: Layers,
        title: "Canva Integration",
        description: "OAuth-based sync renders straight to your Canva workspace, where your team can finish, brand, and distribute on their existing canvas.",
        gradient: "from-blue-500 to-indigo-500",
      },
      {
        icon: BarChart3,
        title: "Admin Portal",
        description: "Dashboards for users, projects, costs, and activity — with cost telemetry, budget caps, and alerts so spend never surprises you.",
        gradient: "from-amber-500 to-rose-500",
      },
    ],
  },
];

export default function FeaturesPage() {
  useEffect(() => {
    document.title = "Features — NeuralCut.AI | Everything in one production studio";
    setMeta(
      "description",
      "60+ AI models, micro-scene architecture, character consistency, brand integration, sound design, and social publishing — all in one cinematic production pipeline.",
    );
    setLink("canonical", `${window.location.origin}/features`);
    setMeta("og:title", "Features — NeuralCut.AI", "property");
    setMeta(
      "og:description",
      "Everything you need to produce cinematic AI video — script to render to publish.",
      "property",
    );
    setMeta("og:type", "website", "property");
    setMeta("og:url", `${window.location.origin}/features`, "property");
  }, []);

  return (
    <div className="min-h-screen pt-24" style={{ backgroundColor: "var(--surface-base, #09090f)", color: "var(--text-primary, #f1f5f9)" }}>
      <MarketingNav active="features" />

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-6 pt-12 pb-16 text-center" aria-labelledby="features-hero">
        <div className="absolute inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-purple-900/20 via-indigo-900/10 to-transparent blur-2xl" />
        <p className="text-xs uppercase tracking-[0.2em] text-purple-300 mb-4">Product</p>
        <h1
          id="features-hero"
          className="text-4xl md:text-6xl font-bold mb-5 bg-gradient-to-r from-white via-purple-100 to-indigo-200 bg-clip-text text-transparent leading-tight"
        >
          Everything you need to produce <br className="hidden md:inline" />cinematic AI video.
        </h1>
        <p className="text-base md:text-lg max-w-2xl mx-auto" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
          From the first hook to the final render, NeuralCut.AI unifies the entire production pipeline — 60+ AI models, intelligent routing, brand controls, and one-click publishing.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8">
          <Link href="/auth">
            <Button
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-7 h-12 rounded-xl shadow-xl shadow-purple-600/20"
              data-testid="features-hero-cta"
            >
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/pricing">
            <Button variant="ghost" size="lg" className="h-12 px-6 text-sm" data-testid="features-pricing-cta">
              See pricing
            </Button>
          </Link>
        </div>
      </section>

      {/* Feature groups */}
      <main className="max-w-6xl mx-auto px-6 pb-24">
        {FEATURE_GROUPS.map((group, gi) => (
          <section
            key={group.title}
            className="py-12 border-t first:border-t-0"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
            aria-labelledby={`group-${gi}`}
          >
            <div className="md:grid md:grid-cols-12 md:gap-10">
              <div className="md:col-span-4 mb-8 md:mb-0 md:sticky md:top-28 md:self-start">
                <p className="text-[11px] uppercase tracking-[0.2em] text-purple-300 mb-2">
                  Pillar 0{gi + 1}
                </p>
                <h2
                  id={`group-${gi}`}
                  className="text-2xl md:text-3xl font-bold mb-3 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent"
                >
                  {group.title}
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary, #94a3b8)" }}>
                  {group.blurb}
                </p>
              </div>
              <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {group.features.map((f) => {
                  const Icon = f.icon;
                  return (
                    <div
                      key={f.title}
                      className="p-5 rounded-2xl border bg-gradient-to-br from-slate-950/80 to-purple-950/10 hover:border-purple-500/30 transition-all motion-reduce:transition-none group"
                      style={{ borderColor: "rgba(255,255,255,0.06)" }}
                      data-testid={`feature-${f.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform motion-reduce:transition-none`}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="text-base font-semibold mb-2 text-white">{f.title}</h3>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
                        {f.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ))}
      </main>

      {/* Cross-sell CTA */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/10 to-transparent" />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
            See the models powering it all
          </h2>
          <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
            60+ video, image, and audio models from the world's leading AI labs — unified under one billing meter and one cinematic framework.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/ai-models">
              <Button
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-7 h-12 rounded-xl"
                data-testid="features-models-cta"
              >
                Explore AI models
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost" size="lg" className="h-12 px-6 text-sm">
                See pricing
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

export function MarketingNav({ active }: { active: "features" | "ai-models" | "pricing" }) {
  const linkClass = (key: typeof active) =>
    `transition-colors ${active === key ? "text-white" : "hover:text-white"}`;
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
      style={{ backgroundColor: "rgba(9, 9, 15, 0.7)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img src={neuralcutFullLogo} alt="NeuralCut.AI" className="h-24 object-contain" />
        </Link>
        <div
          className="hidden md:flex items-center gap-6 text-sm"
          style={{ color: "var(--text-secondary, #94a3b8)" }}
        >
          <Link href="/features" className={linkClass("features")} data-testid="nav-features">Features</Link>
          <Link href="/ai-models" className={linkClass("ai-models")} data-testid="nav-ai-models">AI Models</Link>
          <Link href="/pricing" className={linkClass("pricing")} data-testid="nav-pricing">Pricing</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth">
            <Button variant="ghost" size="sm" className="text-sm">Log in</Button>
          </Link>
          <Link href="/auth">
            <Button
              size="sm"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm rounded-lg"
            >
              Get Started Free
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t py-10" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div
        className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs"
        style={{ color: "var(--text-muted, #64748b)" }}
      >
        <p>&copy; 2026 NeuralCut.AI. All rights reserved.</p>
        <div className="flex items-center gap-6">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <Link href="/features" className="hover:text-white transition-colors">Features</Link>
          <Link href="/ai-models" className="hover:text-white transition-colors">AI Models</Link>
          <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          <Link href="/contact-sales" className="hover:text-white transition-colors">Contact sales</Link>
        </div>
      </div>
    </footer>
  );
}
