import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Sparkles, Palette, Shield, Share2, Play, ArrowRight } from "lucide-react";

const features = [
  {
    title: "Multi-Provider AI",
    description: "Generate videos using Kling, RunwayML, Luma, Pika, and Veo — choose the best provider for each scene.",
    icon: Sparkles,
    color: "from-purple-500 to-indigo-500",
  },
  {
    title: "Brand Integration",
    description: "Maintain consistent brand identity across all your video content with automated asset management.",
    icon: Palette,
    color: "from-pink-500 to-rose-500",
  },
  {
    title: "Smart Quality Control",
    description: "AI-powered quality evaluation ensures every frame meets your production standards.",
    icon: Shield,
    color: "from-emerald-500 to-teal-500",
  },
  {
    title: "Multi-Platform Export",
    description: "Optimize and export videos for YouTube, TikTok, Instagram, and more with one click.",
    icon: Share2,
    color: "from-blue-500 to-cyan-500",
  },
];

const providers = ["Kling", "RunwayML", "Luma", "Pika", "Veo"];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-[#0a0a0f] to-indigo-900/20" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse [animation-delay:2s]" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-br from-white via-purple-200 to-purple-400 bg-clip-text text-transparent leading-tight">
            Create. Generate. Produce.
          </h1>
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            The all-in-one AI video production studio. Generate professional videos at scale
            with intelligent quality control and seamless brand integration.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/auth">
              <Button size="lg" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-8 py-3 text-lg rounded-xl h-auto">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="border-white/10 text-white hover:bg-white/5 px-8 py-3 text-lg rounded-xl h-auto">
              <Play className="mr-2 h-5 w-5" />
              Watch Demo
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-24">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
          Everything you need to produce AI videos
        </h2>
        <p className="text-gray-400 text-center mb-12 max-w-xl mx-auto">
          From script to screen, our platform handles every step of the production pipeline.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-colors"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16 text-center">
        <p className="text-gray-500 text-sm mb-6">Powered by leading AI providers</p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {providers.map((name) => (
            <span
              key={name}
              className="px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-gray-400 text-sm"
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-white/[0.06] py-8 text-center">
        <p className="text-gray-600 text-sm">&copy; 2026 AI Video Production Studio. All rights reserved.</p>
      </div>
    </div>
  );
}
