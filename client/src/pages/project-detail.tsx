import { Link } from "wouter";
import { ArrowLeft, Settings, Play, RefreshCw, Clock, Target, Monitor, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

const scenes = [
  { id: 1, name: "Opening Hook", duration: "5s", status: "completed" },
  { id: 2, name: "Problem Statement", duration: "8s", status: "completed" },
  { id: 3, name: "Solution Demo", duration: "12s", status: "rendering" },
  { id: 4, name: "Social Proof", duration: "6s", status: "pending" },
  { id: 5, name: "Call to Action", duration: "4s", status: "pending" },
];

const statusDot: Record<string, string> = {
  pending: "bg-gray-500",
  rendering: "bg-amber-400 animate-pulse",
  completed: "bg-emerald-400",
  failed: "bg-red-400",
};

const sceneGradients = [
  "from-purple-600/40 to-indigo-600/40",
  "from-blue-600/40 to-cyan-600/40",
  "from-indigo-600/40 to-purple-600/40",
  "from-violet-600/40 to-fuchsia-600/40",
  "from-cyan-600/40 to-blue-600/40",
];

export default function ProjectDetail({ params }: { params?: { id: string } }) {
  const projectId = params?.id || "1";

  return (
    <div className="p-6 lg:p-8 text-white">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/projects">
              <button className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Product Launch Video</h1>
              <p className="text-sm text-gray-400">Project #{projectId} · product · Created Feb 15, 2026</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-white/[0.1] text-gray-300 hover:bg-white/[0.05] gap-1.5">
              <Settings className="w-4 h-4" />
              Edit Settings
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 gap-1.5">
              <Play className="w-4 h-4" />
              Generate All
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-gray-500" />
              <p className="text-xs text-gray-400 uppercase tracking-wider">Status</p>
            </div>
            <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
              Rendering
            </span>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <p className="text-xs text-gray-400 uppercase tracking-wider">Duration</p>
            </div>
            <p className="text-xl font-bold text-white">35s</p>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-gray-500" />
              <p className="text-xs text-gray-400 uppercase tracking-wider">Quality Score</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <p className="text-xl font-bold text-white">87/100</p>
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Monitor className="w-4 h-4 text-gray-500" />
              <p className="text-xs text-gray-400 uppercase tracking-wider">Platform</p>
            </div>
            <p className="text-xl font-bold text-white">YouTube</p>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Scenes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenes.map((scene, index) => (
              <div key={scene.id} className="group bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden hover:border-purple-500/20 transition-colors">
                <div className={`h-24 bg-gradient-to-br ${sceneGradients[index % sceneGradients.length]} relative flex items-center justify-center`}>
                  <span className="text-2xl font-bold text-white/20">{scene.id}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity border-white/20 text-white bg-black/40 hover:bg-black/60 gap-1 text-xs h-7"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </Button>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white text-sm">{scene.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{scene.duration}</p>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${statusDot[scene.status]}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Quality Report</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Visual Quality", value: "--" },
              { label: "Brand Consistency", value: "--" },
              { label: "Scene Transitions", value: "--" },
              { label: "Overall Score", value: "--" },
            ].map((metric) => (
              <div key={metric.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{metric.label}</p>
                <p className="text-xl font-bold text-white">{metric.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
