import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Search, Sparkles, Zap, Upload } from "lucide-react";

const recentProjects = [
  { id: 1, name: "Product Launch Video", type: "product", status: "completed", date: "2026-02-15" },
  { id: 2, name: "Brand Story Series", type: "script-based", status: "rendering", date: "2026-02-14" },
  { id: 3, name: "Social Media Ads Pack", type: "product", status: "draft", date: "2026-02-13" },
  { id: 4, name: "Tutorial Walkthrough", type: "script-based", status: "completed", date: "2026-02-12" },
];

const projectGradients = [
  "from-blue-600/40 to-blue-900/20",
  "from-pink-600/40 to-pink-900/20",
  "from-orange-600/40 to-orange-900/20",
  "from-indigo-600/40 to-indigo-900/20",
];

const statusConfig: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-gray-600", text: "text-gray-300" },
  rendering: { bg: "bg-amber-500", text: "text-amber-100" },
  completed: { bg: "bg-emerald-500", text: "text-emerald-100" },
  failed: { bg: "bg-red-500", text: "text-red-100" },
};

export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.firstName || user?.email?.split("@")[0] || "User";

  return (
    <div className="w-full text-white p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-bold">Welcome back, {firstName}</h1>
            <p className="text-gray-400 mt-2">Manage your video projects and assets</p>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search projects, assets..."
              className="pl-10 bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-500 focus:bg-white/[0.05] focus:border-white/[0.1]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/projects/new">
            <div className="p-5 rounded-lg bg-gradient-to-br from-purple-600/20 to-purple-900/20 border border-purple-500/20 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/10 transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <Sparkles className="w-6 h-6 text-purple-400 group-hover:text-purple-300 transition-colors" />
              </div>
              <h3 className="font-semibold text-white group-hover:text-purple-100 transition-colors">AI Video</h3>
              <p className="text-sm text-gray-400 mt-1">Create with AI</p>
            </div>
          </Link>

          <Link href="/projects/new">
            <div className="p-5 rounded-lg bg-gradient-to-br from-cyan-600/20 to-cyan-900/20 border border-cyan-500/20 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10 transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <Zap className="w-6 h-6 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
              </div>
              <h3 className="font-semibold text-white group-hover:text-cyan-100 transition-colors">Quick Clip</h3>
              <p className="text-sm text-gray-400 mt-1">Fast creation</p>
            </div>
          </Link>

          <Link href="/assets">
            <div className="p-5 rounded-lg bg-gradient-to-br from-emerald-600/20 to-emerald-900/20 border border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10 transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <Upload className="w-6 h-6 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
              </div>
              <h3 className="font-semibold text-white group-hover:text-emerald-100 transition-colors">Upload Asset</h3>
              <p className="text-sm text-gray-400 mt-1">Add media</p>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-lg bg-white/[0.03] backdrop-blur border border-white/[0.06] hover:bg-white/[0.05] transition-all">
            <p className="text-gray-400 text-sm mb-2">Total Projects</p>
            <p className="text-3xl font-bold text-white">24</p>
          </div>
          <div className="p-5 rounded-lg bg-white/[0.03] backdrop-blur border border-white/[0.06] hover:bg-white/[0.05] transition-all">
            <p className="text-gray-400 text-sm mb-2">Active Renders</p>
            <p className="text-3xl font-bold text-amber-400">3</p>
          </div>
          <div className="p-5 rounded-lg bg-white/[0.03] backdrop-blur border border-white/[0.06] hover:bg-white/[0.05] transition-all">
            <p className="text-gray-400 text-sm mb-2">Completed</p>
            <p className="text-3xl font-bold text-emerald-400">18</p>
          </div>
          <div className="p-5 rounded-lg bg-white/[0.03] backdrop-blur border border-white/[0.06] hover:bg-white/[0.05] transition-all">
            <p className="text-gray-400 text-sm mb-2">Storage Used</p>
            <p className="text-3xl font-bold text-blue-400">142 GB</p>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-6">Recent Projects</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {recentProjects.map((project, index) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <div className="rounded-lg overflow-hidden bg-gray-900/50 border border-white/[0.06] hover:border-white/[0.12] hover:shadow-xl transition-all hover:scale-105 cursor-pointer group">
                  <div
                    className={`h-32 bg-gradient-to-br ${projectGradients[index % projectGradients.length]} group-hover:opacity-80 transition-opacity`}
                  />
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-medium text-white group-hover:text-purple-300 transition-colors">{project.name}</h3>
                      <p className="text-xs text-gray-400 mt-1">
                        {project.type} · {project.date}
                      </p>
                    </div>
                    <Badge
                      className={`w-fit ${statusConfig[project.status].bg} ${statusConfig[project.status].text} hover:opacity-90`}
                    >
                      {project.status}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
