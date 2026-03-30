import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Play,
  ChevronDown,
  Video,
  Image,
  Wand2,
  Music,
  Brain,
  Eye,
  Sparkles,
  Users,
  Palette,
  Shield,
  Layers,
  MessageSquare,
  Zap,
  Check,
} from "lucide-react";
import neuralcutFullLogo from "@/assets/neuralcut-full-logo.png";
import landingSceneEditor from "@/assets/landing-scene-editor.png";
import landingMicroScenes from "@/assets/landing-micro-scenes.png";
import landingFilmAudio from "@/assets/landing-film-audio.png";
import landingBrandAssets from "@/assets/landing-brand-assets.png";

const capabilities = [
  { name: "Video Generation (T2V)", providers: "19 models", icon: Video, description: "Generate videos from text prompts using Kling, Runway, Luma, Veo, Pika, Hailuo, Sora, Wan, and Seedance models." },
  { name: "Image-to-Video (I2V)", providers: "15 models", icon: Zap, description: "Animate any image into cinematic video with character consistency and product-aware scene generation." },
  { name: "Video-to-Video (V2V)", providers: "3 models", icon: Layers, description: "Transform existing videos with object replacement, style transfer, and character performance capture." },
  { name: "Character Performance", providers: "1 model", icon: Users, description: "Bring characters to life with Runway Act Two — drive performances from reference videos and images." },
  { name: "Image Generation (T2I)", providers: "5 models", icon: Image, description: "Generate stunning images from text with Flux Pro, DALL-E, and Stable Diffusion for scene references and assets." },
  { name: "Image-to-Image (I2I)", providers: "4 modes", icon: Palette, description: "Style transfer, background generation, scene integration, and product placement with AI-powered image editing." },
  { name: "Toolkit (Upscale / BG Remove)", providers: "4 tools", icon: Wand2, description: "Upscale images to 4K, remove backgrounds, and enhance quality with the Qubic Image Toolkit." },
  { name: "Audio Generation", providers: "3 services", icon: Music, description: "AI music composition, ElevenLabs voiceover with word-level timing, and intelligent sound design." },
  { name: "LLM", providers: "Multiple", icon: Brain, description: "Claude-powered script pipeline with 4-stage intelligent writing, creative strategy, and cinematic visual direction." },
  { name: "LLM Vision Integration", providers: "Active", icon: Eye, description: "AI scene classification, content-aware provider routing, quality evaluation, and smart text overlay extraction." },
];

const valueProps = [
  { title: "Built for Small Businesses & Content Creators", description: "Professional video production without the agency price tag. Create scroll-stopping content in minutes." },
  { title: "Cost Transparency — No Tokens", description: "Predictable pricing with no hidden token costs. Know exactly what you'll pay before you generate." },
  { title: "71+ AI Generation Services", description: "Access the world's best AI video, image, and audio models — all in one studio." },
];

const productFeatures = [
  { title: "Image Generator & Editor", description: "T2I, I2I, style transfer, upscaling, and background removal." },
  { title: "Video Generator & Editor", description: "T2V, I2V, V2V with scene-by-scene editing and micro-scene control." },
  { title: "Prompt & Script Generation", description: "4-stage AI pipeline: strategy, narrative, scene writing, cinematic direction." },
];

const trustPoints = [
  "No credit card required",
  "Generate your first video in minutes",
  "Full brand integration from day one",
  "Professional cinematic output",
];

function CapabilityAccordion({ cap, isOpen, onToggle }: { cap: typeof capabilities[0]; isOpen: boolean; onToggle: () => void }) {
  const Icon = cap.icon;
  return (
    <div
      className="border-b transition-colors"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 px-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600/20 to-indigo-600/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-purple-400" />
          </div>
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>{cap.name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">{cap.providers}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          style={{ color: "var(--text-muted)" }}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pl-15">
          <p className="text-sm leading-relaxed ml-11" style={{ color: "var(--text-secondary)" }}>
            {cap.description}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const [openAccordion, setOpenAccordion] = useState<number | null>(null);

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: "#0a0a0f", color: "var(--text-primary)" }}>

      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0f]/80 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={neuralcutFullLogo} alt="NeuralCut.AI" className="h-20 object-contain" />
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm" style={{ color: "var(--text-secondary)" }}>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#capabilities" className="hover:text-white transition-colors">AI Models</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth">
              <Button variant="ghost" size="sm" className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Log in
              </Button>
            </Link>
            <Link href="/auth">
              <Button size="sm" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm rounded-lg">
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/15 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-purple-600/8 rounded-full blur-[120px]" />
        <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-indigo-600/8 rounded-full blur-[120px]" />

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start mb-16">
            <div className="space-y-6 pt-8">
              {valueProps.map((vp, i) => (
                <div key={i} className="group">
                  <h3 className="text-sm font-bold tracking-wide text-white/90 mb-1">{vp.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{vp.description}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <div className="relative w-full max-w-sm">
                <div className="absolute -inset-4 bg-gradient-to-br from-purple-600/20 via-indigo-600/10 to-transparent rounded-3xl blur-2xl" />
                <div className="relative rounded-2xl overflow-hidden border" style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(15,15,25,0.9)" }}>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                        <MessageSquare className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Ask Suzzie</p>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Your AI creative director</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-purple-500/10 rounded-xl p-3 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        "Help me create a product showcase video for my organic supplements brand with cinematic B-roll and on-screen captions."
                      </div>
                      <div className="bg-white/[0.03] rounded-xl p-3 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        I'll help you build that! I recommend Kling 2.6 Pro for the product shots with I2V to keep your product consistent, and a warm cinematic film treatment. Let me set up the visual directions...
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 pt-8">
              {productFeatures.map((pf, i) => (
                <div key={i} className="group text-right">
                  <h3 className="text-sm font-bold tracking-wide text-white/90 mb-1">{pf.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{pf.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-4 overflow-hidden">
        <div className="max-w-5xl mx-auto px-6">
          <div className="relative rounded-2xl overflow-hidden border" style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(12,12,20,0.8)" }}>
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 to-indigo-900/5" />
            <div className="relative p-6 md:p-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[10px] ml-2" style={{ color: "var(--text-muted)" }}>AI Editing Tools</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Scene Editor", img: landingSceneEditor },
                  { label: "Micro-Scenes", img: landingMicroScenes },
                  { label: "Film & Audio", img: landingFilmAudio },
                  { label: "Brand Assets", img: landingBrandAssets },
                ].map(({ label, img }) => (
                  <div key={label} className="rounded-lg p-3 text-center" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="w-full h-28 rounded overflow-hidden mb-2">
                      <img src={img} alt={label} className="w-full h-full object-cover rounded" loading="lazy" />
                    </div>
                    <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/5 to-transparent" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-br from-white via-purple-200 to-purple-400 bg-clip-text text-transparent">
              Create. Generate.
            </span>
            <br />
            <span className="bg-gradient-to-br from-purple-300 via-indigo-300 to-indigo-500 bg-clip-text text-transparent">
              Produce.
            </span>
          </h1>
          <p className="text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            The all-in-one AI video production studio. Generate professional videos at scale
            with intelligent quality control and seamless brand integration.
          </p>
          <div className="flex items-center justify-center gap-4 mb-12">
            <Link href="/auth">
              <Button size="lg" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-8 py-3 text-lg rounded-xl h-auto shadow-lg shadow-purple-600/20">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="px-8 py-3 text-lg rounded-xl h-auto border-white/10 text-white/80 hover:bg-white/5">
              <Play className="mr-2 h-5 w-5" />
              Watch Demo
            </Button>
          </div>
          <div className="flex items-center justify-center gap-6 flex-wrap">
            {trustPoints.map((point) => (
              <div key={point} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="capabilities" className="max-w-3xl mx-auto px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
          71+ AI Generation Services
        </h2>
        <p className="text-center mb-10 text-sm" style={{ color: "var(--text-muted)" }}>
          Every model you need, unified in one production pipeline
        </p>
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(12,12,20,0.6)" }}>
          {capabilities.map((cap, i) => (
            <CapabilityAccordion
              key={cap.name}
              cap={cap}
              isOpen={openAccordion === i}
              onToggle={() => setOpenAccordion(openAccordion === i ? null : i)}
            />
          ))}
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
          Everything you need to produce AI videos
        </h2>
        <p className="text-center mb-12 text-sm max-w-xl mx-auto" style={{ color: "var(--text-muted)" }}>
          From script to screen, our platform handles every step of the production pipeline.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: Brain, title: "4-Stage Script Pipeline", description: "AI writes creative strategy, narrative architecture, scene narrations, and cinematic visual directions — all personalized to your brand.", gradient: "from-purple-500 to-indigo-500" },
            { icon: Video, title: "Multi-Provider Video AI", description: "19 video models from Kling, Runway, Luma, Veo, Pika, Hailuo, and Sora. Scene-type-aware routing picks the best model automatically.", gradient: "from-pink-500 to-rose-500" },
            { icon: Users, title: "Character Consistency", description: "Create persistent character profiles with reference images. Characters appear consistently across every scene using I2V references.", gradient: "from-emerald-500 to-teal-500" },
            { icon: Palette, title: "9 Visual Art Presets", description: "3D Illustration, Cinematic Realism, Watercolor, Neon Futuristic, and more — each with tuned prompt engineering and provider routing.", gradient: "from-blue-500 to-cyan-500" },
            { icon: Shield, title: "Brand Integration", description: "Logo overlays, custom intros/outros, color palettes, and brand voice — automatically woven into every video you create.", gradient: "from-amber-500 to-orange-500" },
            { icon: Music, title: "Sound Design & Music", description: "AI-composed background music, per-scene voiceover with word-level sync, and intelligent audio ducking.", gradient: "from-violet-500 to-purple-500" },
          ].map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="p-5 rounded-2xl border transition-all duration-200 hover:border-purple-500/20 group"
                style={{ backgroundColor: "rgba(12,12,20,0.6)", borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-base font-semibold mb-2 text-white">{feature.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-8">
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Powered by the world's leading AI providers</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {["Kling", "Runway", "Luma", "Veo", "Pika", "Hailuo", "Sora", "Wan", "Seedance", "ElevenLabs", "Flux", "Claude"].map((name) => (
              <span
                key={name}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/10 to-transparent" />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
            Ready to create your first AI video?
          </h2>
          <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            Join content creators and small businesses who are already producing professional
            videos with NeuralCut.AI. No tokens, no complexity — just results.
          </p>
          <Link href="/auth">
            <Button size="lg" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-10 py-4 text-lg rounded-xl h-auto shadow-xl shadow-purple-600/20">
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <p className="text-xs mt-4" style={{ color: "var(--text-muted)" }}>No credit card required</p>
        </div>
      </section>

      <footer className="border-t py-12" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src={neuralcutFullLogo} alt="NeuralCut.AI" className="h-14 object-contain" />
            </div>
            <div className="flex items-center gap-6 text-xs" style={{ color: "var(--text-muted)" }}>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#capabilities" className="hover:text-white transition-colors">AI Models</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <Link href="/auth" className="hover:text-white transition-colors">Sign In</Link>
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>&copy; 2026 NeuralCut.AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
