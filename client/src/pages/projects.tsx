import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Grid3x3, List } from "lucide-react";

const allProjects = [
  { id: 1, name: "Product Launch Video", type: "product", status: "completed", date: "2026-02-15", gradient: "from-purple-600 to-indigo-600" },
  { id: 2, name: "Brand Story Series", type: "script-based", status: "rendering", date: "2026-02-14", gradient: "from-blue-600 to-cyan-600" },
  { id: 3, name: "Social Media Ads Pack", type: "product", status: "draft", date: "2026-02-13", gradient: "from-pink-600 to-rose-600" },
  { id: 4, name: "Tutorial Walkthrough", type: "script-based", status: "completed", date: "2026-02-12", gradient: "from-green-600 to-emerald-600" },
  { id: 5, name: "Q1 Promo Campaign", type: "product", status: "failed", date: "2026-02-10", gradient: "from-orange-600 to-red-600" },
  { id: 6, name: "Onboarding Video", type: "script-based", status: "draft", date: "2026-02-09", gradient: "from-violet-600 to-purple-600" },
];

const statusDotColor: Record<string, string> = {
  draft: "bg-gray-500",
  rendering: "bg-amber-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

const filters = ["all", "draft", "rendering", "completed", "failed"];

export default function Projects() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filtered = allProjects.filter((p) => {
    const matchesFilter = activeFilter === "all" || p.status === activeFilter;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
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
                  onMouseEnter={(e) => {
                    if (activeFilter !== f) {
                      e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeFilter !== f) {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }
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
                onMouseEnter={(e) => {
                  if (viewMode !== "grid") {
                    e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (viewMode !== "grid") {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
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
                onMouseEnter={(e) => {
                  if (viewMode !== "list") {
                    e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (viewMode !== "list") {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
                title="List view"
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4">📺</div>
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
            {filtered.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                asChild
              >
                <a className="group cursor-pointer">
                  <div className="border rounded-xl overflow-hidden transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg hover:shadow-purple-500/5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                    <div className={`h-36 bg-gradient-to-br ${project.gradient} relative overflow-hidden`}>
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors duration-300" />
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="space-y-1">
                        <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-purple-400 transition-colors" style={{ color: "var(--text-primary)" }}>
                          {project.name}
                        </h3>
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{project.date}</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <Badge className="text-xs" style={{ backgroundColor: "var(--surface-active)", color: "var(--text-secondary)" }}>
                          {project.type}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${statusDotColor[project.status]}`} />
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </a>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                asChild
              >
                <a className="group cursor-pointer block">
                  <div
                    className="border rounded-lg p-4 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/5"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold group-hover:text-purple-400 transition-colors line-clamp-1" style={{ color: "var(--text-primary)" }}>
                          {project.name}
                        </h3>
                        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{project.date}</p>
                      </div>

                      <div className="flex items-center gap-6">
                        <Badge className="text-xs flex-shrink-0" style={{ backgroundColor: "var(--surface-active)", color: "var(--text-secondary)" }}>
                          {project.type}
                        </Badge>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className={`w-2 h-2 rounded-full ${statusDotColor[project.status]}`} />
                          <span className="text-sm w-20 text-right" style={{ color: "var(--text-secondary)" }}>
                            {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
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
