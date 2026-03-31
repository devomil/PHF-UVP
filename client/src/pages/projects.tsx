import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Grid3x3, List, Loader2, Video, Image } from "lucide-react";

const statusDotColor: Record<string, string> = {
  draft: "bg-gray-500",
  generating: "bg-purple-500 animate-pulse",
  rendering: "bg-amber-500 animate-pulse",
  processing: "bg-amber-500 animate-pulse",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

const projectGradients = [
  "from-purple-600/40 to-indigo-600/40",
  "from-blue-600/40 to-cyan-600/40",
  "from-pink-600/40 to-rose-600/40",
  "from-green-600/40 to-emerald-600/40",
  "from-orange-600/40 to-red-600/40",
  "from-violet-600/40 to-purple-600/40",
  "from-cyan-600/40 to-teal-600/40",
  "from-indigo-600/40 to-blue-600/40",
];

const filters = ["all", "draft", "generating", "completed", "failed"];

function getProjectThumbnail(project: any): string | null {
  try {
    if (project.assets) {
      const assets = typeof project.assets === "string" ? JSON.parse(project.assets) : project.assets;
      if (assets && typeof assets === "object") {
        if (assets.productMediaUrl) return assets.productMediaUrl;
        if (assets.logoUrl) return assets.logoUrl;
      }
    }
    if (project.scenes && Array.isArray(project.scenes)) {
      for (const scene of project.scenes) {
        if (scene.thumbnailUrl) return scene.thumbnailUrl;
        if (scene.imageUrl) return scene.imageUrl;
        const sa = scene.assets;
        if (sa) {
          if (sa.videoUrl) return sa.videoUrl;
          if (sa.imageUrl) return sa.imageUrl;
          if (sa.backgroundUrl) return sa.backgroundUrl;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Projects() {
  const searchString = useSearch();
  const urlStatus = new URLSearchParams(searchString).get("status");
  const [activeFilter, setActiveFilter] = useState(urlStatus && filters.includes(urlStatus) ? urlStatus : "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    if (urlStatus && filters.includes(urlStatus)) {
      setActiveFilter(urlStatus);
    }
  }, [urlStatus]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      return data.projects || data || [];
    },
  });

  const filtered = projects.filter((p: any) => {
    const matchesFilter = activeFilter === "all" || p.status === activeFilter;
    const matchesSearch = (p.title || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Projects</h1>
            <p className="mt-2" style={{ color: "var(--text-secondary)" }}>Manage and create your video productions</p>
          </div>
          <Link href="/projects/new" asChild>
            <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white gap-2 whitespace-nowrap">
              <Plus size={18} />
              New Project
            </Button>
          </Link>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-3 border rounded-lg px-4 py-2" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <Search size={18} style={{ color: "var(--text-secondary)" }} />
            <Input
              placeholder="Search projects..."
              className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              style={{ color: "var(--text-primary)" }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-all"
                  style={{
                    backgroundColor: activeFilter === f ? "var(--surface-active)" : "transparent",
                    color: activeFilter === f ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setViewMode("grid")}
                className="p-2 rounded-lg transition-all"
                style={{
                  backgroundColor: viewMode === "grid" ? "var(--surface-active)" : "transparent",
                  color: viewMode === "grid" ? "var(--text-primary)" : "var(--text-secondary)",
                }}
                title="Grid view"
              >
                <Grid3x3 size={18} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className="p-2 rounded-lg transition-all"
                style={{
                  backgroundColor: viewMode === "list" ? "var(--surface-active)" : "transparent",
                  color: viewMode === "list" ? "var(--text-primary)" : "var(--text-secondary)",
                }}
                title="List view"
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--text-muted)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Video className="w-12 h-12 mb-4" style={{ color: "var(--text-muted)" }} />
            <h3 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>No projects found</h3>
            <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
              {searchQuery
                ? "Try adjusting your search criteria"
                : "Create your first video project to get started"}
            </p>
            {!searchQuery && (
              <Link href="/projects/new" asChild>
                <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white gap-2">
                  <Plus size={18} />
                  Create Project
                </Button>
              </Link>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((project: any, index: number) => {
              const thumbnail = getProjectThumbnail(project);
              return (
              <Link
                key={project.projectId}
                href={`/projects/${project.projectId}`}
                asChild
              >
                <a className="group cursor-pointer">
                  <div className="border rounded-xl overflow-hidden transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg hover:shadow-purple-500/5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                    <div className={`h-36 bg-gradient-to-br ${projectGradients[index % projectGradients.length]} relative overflow-hidden`}>
                      {thumbnail && (
                        <img
                          src={thumbnail}
                          alt={project.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors duration-300" />
                      <div className="absolute bottom-3 left-3">
                        {project.mediaMode === "image" ? (
                          <Image className="w-5 h-5 text-white/60" />
                        ) : (
                          <Video className="w-5 h-5 text-white/60" />
                        )}
                      </div>
                      {project.totalDuration ? (
                        <div className="absolute bottom-3 right-3 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                          {project.totalDuration >= 60 ? `${Math.floor(project.totalDuration / 60)}:${String(Math.round(project.totalDuration % 60)).padStart(2, "0")}` : `0:${String(Math.round(project.totalDuration)).padStart(2, "0")}`}
                        </div>
                      ) : null}
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="space-y-1">
                        <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-purple-400 transition-colors" style={{ color: "var(--text-primary)" }}>
                          {project.title}
                        </h3>
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatDate(project.createdAt)}</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <Badge className="text-xs" style={{ backgroundColor: "var(--surface-active)", color: "var(--text-secondary)" }}>
                          {project.type}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${statusDotColor[project.status] || "bg-gray-500"}`} />
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            {(project.status || "draft").charAt(0).toUpperCase() + (project.status || "draft").slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </a>
              </Link>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((project: any) => (
              <Link
                key={project.projectId}
                href={`/projects/${project.projectId}`}
                asChild
              >
                <a className="group cursor-pointer block">
                  <div
                    className="border rounded-lg p-4 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/5"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold group-hover:text-purple-400 transition-colors line-clamp-1" style={{ color: "var(--text-primary)" }}>
                          {project.title}
                        </h3>
                        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                          {formatDate(project.createdAt)}
                          {project.description && (
                            <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                              — {project.description.substring(0, 60)}{project.description.length > 60 ? "..." : ""}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-6">
                        <Badge className="text-xs flex-shrink-0" style={{ backgroundColor: "var(--surface-active)", color: "var(--text-secondary)" }}>
                          {project.type}
                        </Badge>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className={`w-2 h-2 rounded-full ${statusDotColor[project.status] || "bg-gray-500"}`} />
                          <span className="text-sm w-20 text-right" style={{ color: "var(--text-secondary)" }}>
                            {(project.status || "draft").charAt(0).toUpperCase() + (project.status || "draft").slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </a>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
