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
  draft: { bg: "bg-gray-500", text: "text-white" },
  rendering: { bg: "bg-amber-500", text: "text-amber-100" },
  completed: { bg: "bg-emerald-500", text: "text-emerald-100" },
  failed: { bg: "bg-red-500", text: "text-red-100" },
};

export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.firstName || user?.email?.split("@")[0] || "User";

  return (
    <div className="w-full p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-bold">Welcome back, {firstName}</h1>
            <p className="mt-2" style={{ color: "var(--text-secondary)" }}>Manage your video projects and assets</p>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
            <Input
              placeholder="Search projects, assets..."
              className="pl-10 border"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/projects/new">
            <div className="p-5 rounded-lg bg-gradient-to-br from-purple-600/20 to-purple-900/20 border border-purple-500/20 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/10 transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <Sparkles className="w-6 h-6 text-purple-400 group-hover:text-purple-300 transition-colors" />
              </div>
              <h3 className="font-semibold group-hover:text-purple-100 transition-colors" style={{ color: "var(--text-primary)" }}>AI Video</h3>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Create with AI</p>
            </div>
          </Link>

          <Link href="/projects/new">
            <div className="p-5 rounded-lg bg-gradient-to-br from-cyan-600/20 to-cyan-900/20 border border-cyan-500/20 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10 transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <Zap className="w-6 h-6 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
              </div>
              <h3 className="font-semibold group-hover:text-cyan-100 transition-colors" style={{ color: "var(--text-primary)" }}>Quick Clip</h3>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Fast creation</p>
            </div>
          </Link>

          <Link href="/assets">
            <div className="p-5 rounded-lg bg-gradient-to-br from-emerald-600/20 to-emerald-900/20 border border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10 transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <Upload className="w-6 h-6 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
              </div>
              <h3 className="font-semibold group-hover:text-emerald-100 transition-colors" style={{ color: "var(--text-primary)" }}>Upload Asset</h3>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Add media</p>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            className="p-5 rounded-lg backdrop-blur border transition-all"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
          >
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Total Projects</p>
            <p className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>24</p>
          </div>
          <div
            className="p-5 rounded-lg backdrop-blur border transition-all"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
          >
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Active Renders</p>
            <p className="text-3xl font-bold text-amber-400">3</p>
          </div>
          <div
            className="p-5 rounded-lg backdrop-blur border transition-all"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
          >
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Completed</p>
            <p className="text-3xl font-bold text-emerald-400">18</p>
          </div>
          <div
            className="p-5 rounded-lg backdrop-blur border transition-all"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
          >
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Storage Used</p>
            <p className="text-3xl font-bold text-blue-400">142 GB</p>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-6">Recent Projects</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {recentProjects.map((project, index) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <div
                  className="rounded-lg overflow-hidden border hover:shadow-xl transition-all hover:scale-105 cursor-pointer group"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-medium)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                >
                  <div
                    className={`h-32 bg-gradient-to-br ${projectGradients[index % projectGradients.length]} group-hover:opacity-80 transition-opacity`}
                  />
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-medium group-hover:text-purple-300 transition-colors" style={{ color: "var(--text-primary)" }}>{project.name}</h3>
                      <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
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
