import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const features = [
  {
    title: "Multi-Provider AI",
    description: "Generate videos using Kling, RunwayML, Luma, Pika, and Veo — choose the best provider for each scene.",
  },
  {
    title: "Brand Integration",
    description: "Maintain consistent brand identity across all your video content with automated asset management.",
  },
  {
    title: "Smart Quality Control",
    description: "AI-powered quality evaluation ensures every frame meets your production standards.",
  },
  {
    title: "Multi-Platform Export",
    description: "Optimize and export videos for YouTube, TikTok, Instagram, and more with one click.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            AI Video Production Studio
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
            Create professional videos at scale with AI-powered generation, intelligent quality control,
            and seamless brand integration across multiple providers.
          </p>
          <Link href="/auth">
            <Button size="lg" className="bg-purple-600 hover:bg-purple-700 px-8 py-3 text-lg">
              Get Started
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature) => (
            <div key={feature.title} className="p-6 rounded-xl bg-gray-900 border border-gray-800 hover:border-purple-800 transition-colors">
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-gray-400 text-sm">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-16 text-gray-600 text-sm">
          <p>Powered by cutting-edge AI video generation technology</p>
        </div>
      </div>
    </div>
  );
}
