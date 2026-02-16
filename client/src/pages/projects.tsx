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
    <div className="text-white p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Projects</h1>
            <p className="text-gray-400 mt-2">Manage and create your video productions</p>
          </div>
          <Link href="/projects/new" asChild>
            <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white gap-2 whitespace-nowrap">
              <Plus size={18} />
              New Project
            </Button>
          </Link>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2">
            <Search size={18} className="text-gray-400" />
            <Input
              placeholder="Search projects..."
              className="bg-transparent border-0 text-white placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0"
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
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    activeFilter === f
                      ? "bg-white/10 text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/[0.05]"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === "grid"
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/[0.05]"
                }`}
                title="Grid view"
              >
                <Grid3x3 size={18} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === "list"
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/[0.05]"
                }`}
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
            <h3 className="text-xl font-semibold text-white mb-2">No projects found</h3>
            <p className="text-gray-400 mb-6">
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
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg hover:shadow-purple-500/5">
                    <div className={`h-36 bg-gradient-to-br ${project.gradient} relative overflow-hidden`}>
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors duration-300" />
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="space-y-1">
                        <h3 className="font-semibold text-white text-sm line-clamp-2 group-hover:text-purple-400 transition-colors">
                          {project.name}
                        </h3>
                        <p className="text-xs text-gray-400">{project.date}</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <Badge className="bg-white/10 text-gray-300 text-xs">
                          {project.type}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${statusDotColor[project.status]}`} />
                          <span className="text-xs text-gray-400">
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
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 transition-all duration-300 hover:bg-white/[0.05] hover:shadow-lg hover:shadow-purple-500/5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white group-hover:text-purple-400 transition-colors line-clamp-1">
                          {project.name}
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">{project.date}</p>
                      </div>

                      <div className="flex items-center gap-6">
                        <Badge className="bg-white/10 text-gray-300 text-xs flex-shrink-0">
                          {project.type}
                        </Badge>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className={`w-2 h-2 rounded-full ${statusDotColor[project.status]}`} />
                          <span className="text-sm text-gray-400 w-20 text-right">
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
