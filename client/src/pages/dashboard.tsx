import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Search, Sparkles, Zap, Upload, Video, Loader2 } from "lucide-react";

const projectGradients = [
  "from-blue-600/40 to-blue-900/20",
  "from-pink-600/40 to-pink-900/20",
  "from-orange-600/40 to-orange-900/20",
  "from-indigo-600/40 to-indigo-900/20",
  "from-purple-600/40 to-purple-900/20",
  "from-cyan-600/40 to-cyan-900/20",
];

const statusConfig: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-gray-500", text: "text-white" },
  generating: { bg: "bg-purple-500", text: "text-purple-100" },
  rendering: { bg: "bg-amber-500", text: "text-amber-100" },
  processing: { bg: "bg-amber-500", text: "text-amber-100" },
  completed: { bg: "bg-emerald-500", text: "text-emerald-100" },
  failed: { bg: "bg-red-500", text: "text-red-100" },
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.firstName || user?.email?.split("@")[0] || "User";

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  const recentProjects = projects.slice(0, 4);
  const totalProjects = projects.length;
  const activeRenders = projects.filter((p: any) => ["generating", "rendering", "processing"].includes(p.status)).length;
  const completedCount = projects.filter((p: any) => p.status === "completed").length;
  const draftCount = projects.filter((p: any) => p.status === "draft").length;

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
          >
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Total Projects</p>
            <p className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>{totalProjects}</p>
          </div>
          <div
            className="p-5 rounded-lg backdrop-blur border transition-all"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
          >
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Active Renders</p>
            <p className="text-3xl font-bold text-amber-400">{activeRenders}</p>
          </div>
          <div
            className="p-5 rounded-lg backdrop-blur border transition-all"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
          >
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Completed</p>
            <p className="text-3xl font-bold text-emerald-400">{completedCount}</p>
          </div>
          <div
            className="p-5 rounded-lg backdrop-blur border transition-all"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
          >
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Drafts</p>
            <p className="text-3xl font-bold text-blue-400">{draftCount}</p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Recent Projects</h2>
            {projects.length > 4 && (
              <Link href="/projects" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
                View all
              </Link>
            )}
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--text-muted)" }} />
            </div>
          ) : recentProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border rounded-xl" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <Video className="w-12 h-12 mb-4" style={{ color: "var(--text-muted)" }} />
              <h3 className="text-lg font-medium mb-2" style={{ color: "var(--text-primary)" }}>No projects yet</h3>
              <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>Create your first video project to get started</p>
              <Link href="/projects/new">
                <span className="text-purple-400 hover:text-purple-300 text-sm font-medium cursor-pointer">Create Project</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {recentProjects.map((project: any, index: number) => {
                const status = statusConfig[project.status] || statusConfig.draft;
                return (
                  <Link key={project.projectId} href={`/projects/${project.projectId}`}>
                    <div
                      className="rounded-lg overflow-hidden border hover:shadow-xl transition-all hover:scale-105 cursor-pointer group"
                      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
                    >
                      <div
                        className={`h-32 bg-gradient-to-br ${projectGradients[index % projectGradients.length]} group-hover:opacity-80 transition-opacity`}
                      />
                      <div className="p-4 space-y-3">
                        <div>
                          <h3 className="font-medium group-hover:text-purple-300 transition-colors line-clamp-1" style={{ color: "var(--text-primary)" }}>
                            {project.title}
                          </h3>
                          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                            {project.type} · {formatDate(project.createdAt)}
                          </p>
                        </div>
                        <Badge
                          className={`w-fit ${status.bg} ${status.text} hover:opacity-90`}
                        >
                          {project.status}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
