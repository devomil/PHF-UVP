import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  Search,
  Sparkles,
  Upload,
  Video,
  Loader2,
  Palette,
  ArrowRight,
  MessageSquare,
  FolderOpen,
  Activity,
  CheckCircle,
  FileEdit,
  ChevronRight,
  Zap,
  Film,
  FileText,
  Presentation,
} from "lucide-react";

const projectGradients = [
  "from-blue-600/40 to-blue-900/20",
  "from-pink-600/40 to-pink-900/20",
  "from-orange-600/40 to-orange-900/20",
  "from-indigo-600/40 to-indigo-900/20",
  "from-purple-600/40 to-purple-900/20",
  "from-cyan-600/40 to-cyan-900/20",
];

function getProjectThumbnail(project: any): string | null {
  try {
    if (project.scenes && Array.isArray(project.scenes)) {
      for (const scene of project.scenes) {
        if (scene.thumbnailUrl) return scene.thumbnailUrl;
        if (scene.imageUrl) return scene.imageUrl;
      }
    }
    if (project.assets) {
      const assets = typeof project.assets === "string" ? JSON.parse(project.assets) : project.assets;
      if (assets && typeof assets === "object") {
        if (assets.productMediaUrl) return assets.productMediaUrl;
        if (assets.logoUrl) return assets.logoUrl;
      }
    }
  } catch {
    return null;
  }
  return null;
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-gray-500", text: "text-white", label: "Draft" },
  generating: { bg: "bg-purple-500", text: "text-purple-100", label: "Generating" },
  rendering: { bg: "bg-amber-500", text: "text-amber-100", label: "Rendering" },
  processing: { bg: "bg-amber-500", text: "text-amber-100", label: "Processing" },
  completed: { bg: "bg-emerald-500", text: "text-emerald-100", label: "Completed" },
  failed: { bg: "bg-red-500", text: "text-red-100", label: "Failed" },
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeTime(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

const creationModes = [
  {
    id: "ai-script",
    icon: Sparkles,
    title: "AI-Generated Script",
    description: "Describe your vision and let AI create a complete script with scenes, narration, and visual directions",
    bestFor: "Full productions, multi-scene videos, marketing campaigns",
    gradient: "from-purple-500/20 to-purple-600/5",
    border: "border-purple-500/20 hover:border-purple-500/50",
    glow: "hover:shadow-purple-500/10",
    iconColor: "text-purple-400",
    iconBg: "bg-purple-500/15",
  },
  {
    id: "custom-script",
    icon: FileText,
    title: "Custom Script",
    description: "Write your own script and break it into scenes with full control over every detail",
    bestFor: "Precise control, existing scripts, specific requirements",
    gradient: "from-blue-500/20 to-blue-600/5",
    border: "border-blue-500/20 hover:border-blue-500/50",
    glow: "hover:shadow-blue-500/10",
    iconColor: "text-blue-400",
    iconBg: "bg-blue-500/15",
  },
  {
    id: "quick-create",
    icon: Zap,
    title: "Quick Create",
    description: "Generate a single video clip or image instantly. Perfect for social media or adding to your asset library",
    bestFor: "Single clips, social posts, quick assets, images",
    gradient: "from-cyan-500/20 to-teal-600/5",
    border: "border-cyan-500/20 hover:border-cyan-500/50",
    glow: "hover:shadow-cyan-500/10",
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/15",
  },
  {
    id: "studio-polish",
    icon: Film,
    title: "Studio Polish",
    description: "Upload your existing videos or images and apply professional finishing — intros, outros, captions, voiceover, music, and cinematic treatments",
    bestFor: "Manufacturer videos, raw footage, brand content, multi-clip productions",
    gradient: "from-amber-500/20 to-yellow-600/5",
    border: "border-amber-500/20 hover:border-amber-500/50",
    glow: "hover:shadow-amber-500/10",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/15",
  },
  {
    id: "deck-to-video",
    icon: Presentation,
    title: "Deck to Video",
    description: "Upload a PDF pitch or concept deck and we'll analyze its message and visuals to auto-draft a brand-consistent marketing video",
    bestFor: "Pitch decks, concept decks, sales one-pagers, marketing slides",
    gradient: "from-pink-500/20 to-rose-600/5",
    border: "border-pink-500/20 hover:border-pink-500/50",
    glow: "hover:shadow-pink-500/10",
    iconColor: "text-pink-400",
    iconBg: "bg-pink-500/15",
  },
];

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

  const inProgressProject = projects.find((p: any) =>
    ["generating", "rendering", "processing", "draft"].includes(p.status)
  );

  const isNewUser = totalProjects === 0;

  return (
    <div className="w-full p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-bold">Welcome back, {firstName}</h1>
            <p className="mt-2" style={{ color: "var(--text-secondary)" }}>
              {isNewUser ? "Let's get your first video created" : "Manage your video projects and assets"}
            </p>
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

        {inProgressProject && !isNewUser && (
          <Link href={`/projects/${inProgressProject.projectId}`}>
            <div
              className="relative overflow-hidden rounded-xl border p-5 cursor-pointer group hover:shadow-lg transition-all"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-indigo-600/5 group-hover:from-purple-600/10 group-hover:to-indigo-600/10 transition-colors" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600/20 to-indigo-600/20 flex items-center justify-center flex-shrink-0">
                    {["generating", "rendering", "processing"].includes(inProgressProject.status) ? (
                      <Activity className="w-5 h-5 text-amber-400 animate-pulse" />
                    ) : (
                      <FileEdit className="w-5 h-5 text-purple-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-purple-400 mb-0.5">
                      {["generating", "rendering", "processing"].includes(inProgressProject.status)
                        ? "Currently rendering"
                        : "Continue where you left off"}
                    </p>
                    <h3 className="font-semibold group-hover:text-purple-300 transition-colors" style={{ color: "var(--text-primary)" }}>
                      {inProgressProject.title}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Last updated {formatRelativeTime(inProgressProject.updatedAt || inProgressProject.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={`${statusConfig[inProgressProject.status]?.bg || "bg-gray-500"} ${statusConfig[inProgressProject.status]?.text || "text-white"}`}>
                    {statusConfig[inProgressProject.status]?.label || inProgressProject.status}
                  </Badge>
                  <ChevronRight className="w-5 h-5 text-purple-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Create New Project */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Create New Project</h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Choose how you want to create your video</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {creationModes.map((mode) => {
              const Icon = mode.icon;
              return (
                <Link key={mode.id} href={`/projects/new?mode=${mode.id}`}>
                  <div
                    className={`relative rounded-xl border bg-gradient-to-br ${mode.gradient} ${mode.border} ${mode.glow} hover:shadow-lg p-4 cursor-pointer group transition-all h-full flex flex-col`}
                    style={{ borderColor: undefined }}
                  >
                    <div className={`w-9 h-9 rounded-lg ${mode.iconBg} flex items-center justify-center mb-3 shrink-0`}>
                      <Icon className={`w-4.5 h-4.5 ${mode.iconColor}`} />
                    </div>
                    <h3 className={`text-sm font-semibold mb-1.5 group-hover:opacity-90 transition-opacity leading-snug`} style={{ color: "var(--text-primary)" }}>
                      {mode.title}
                    </h3>
                    <p className="text-xs leading-relaxed flex-1" style={{ color: "var(--text-secondary)" }}>
                      {mode.description}
                    </p>
                    <p className="text-[10px] mt-2.5 font-medium" style={{ color: "var(--text-muted)" }}>
                      Best for: {mode.bestFor}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Stats + secondary actions */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Link href="/projects">
            <div
              className="p-5 rounded-lg backdrop-blur border transition-all hover:border-purple-500/30 cursor-pointer group col-span-1"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Projects</p>
                <FolderOpen className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-purple-400" />
              </div>
              <p className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>{totalProjects}</p>
            </div>
          </Link>
          <Link href="/render-queue">
            <div
              className={`p-5 rounded-lg backdrop-blur border transition-all hover:border-amber-500/30 cursor-pointer group relative overflow-hidden col-span-1 ${activeRenders > 0 ? "border-amber-500/20" : ""}`}
              style={{ backgroundColor: "var(--surface)", borderColor: activeRenders > 0 ? undefined : "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Rendering</p>
                  {activeRenders > 0 && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                    </span>
                  )}
                </div>
                <Activity className={`w-4 h-4 transition-opacity text-amber-400 ${activeRenders > 0 ? "opacity-100 animate-pulse" : "opacity-0 group-hover:opacity-100"}`} />
              </div>
              <p className="text-3xl font-bold text-amber-400">{activeRenders}</p>
              {activeRenders > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500/20 overflow-hidden">
                  <div className="h-full w-1/3 bg-amber-500" style={{ animation: "shimmer 1.5s ease-in-out infinite" }} />
                </div>
              )}
            </div>
          </Link>
          <Link href="/projects?status=completed">
            <div
              className="p-5 rounded-lg backdrop-blur border transition-all hover:border-emerald-500/30 cursor-pointer group col-span-1"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Completed</p>
                <CheckCircle className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400" />
              </div>
              <p className="text-3xl font-bold text-emerald-400">{completedCount}</p>
            </div>
          </Link>
          <Link href="/projects?status=draft">
            <div
              className="p-5 rounded-lg backdrop-blur border transition-all hover:border-blue-500/30 cursor-pointer group col-span-1"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Drafts</p>
                <FileEdit className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400" />
              </div>
              <p className="text-3xl font-bold text-blue-400">{draftCount}</p>
            </div>
          </Link>
          <Link href="/brand">
            <div className="p-5 rounded-lg bg-gradient-to-br from-cyan-600/20 to-cyan-900/20 border border-cyan-500/20 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10 transition-all cursor-pointer group col-span-1">
              <div className="flex items-start justify-between mb-2">
                <Palette className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
              </div>
              <p className="text-sm font-semibold group-hover:text-cyan-100 transition-colors" style={{ color: "var(--text-primary)" }}>Brand</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Logo & colors</p>
            </div>
          </Link>
          <Link href="/assets">
            <div className="p-5 rounded-lg bg-gradient-to-br from-emerald-600/20 to-emerald-900/20 border border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10 transition-all cursor-pointer group col-span-1">
              <div className="flex items-start justify-between mb-2">
                <Upload className="w-5 h-5 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
              </div>
              <p className="text-sm font-semibold group-hover:text-emerald-100 transition-colors" style={{ color: "var(--text-primary)" }}>Assets</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Upload media</p>
            </div>
          </Link>
        </div>

        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Recent Projects</h2>
            {projects.length > 4 && (
              <Link href="/projects" className="text-sm text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--text-muted)" }} />
            </div>
          ) : recentProjects.length === 0 ? (
            <div
              className="rounded-xl border overflow-hidden"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/20 to-indigo-600/20 flex items-center justify-center mx-auto mb-5">
                  <Video className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                  No projects yet
                </h3>
                <p className="text-sm mb-4 max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
                  Pick a creation mode above to get started with your first video.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {recentProjects.map((project: any, index: number) => {
                const status = statusConfig[project.status] || statusConfig.draft;
                const thumbnail = getProjectThumbnail(project);
                return (
                  <Link key={project.projectId} href={`/projects/${project.projectId}`}>
                    <div
                      className="rounded-lg overflow-hidden border hover:shadow-xl transition-all hover:scale-[1.02] cursor-pointer group"
                      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
                    >
                      <div
                        className={`h-36 relative overflow-hidden bg-gradient-to-br ${projectGradients[index % projectGradients.length]}`}
                      >
                        {thumbnail && (
                          <img
                            src={thumbnail}
                            alt={project.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        )}
                        {["generating", "rendering", "processing"].includes(project.status) && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30 overflow-hidden">
                            <div className="h-full bg-purple-500 w-1/3" style={{ animation: "shimmer 1.5s ease-in-out infinite" }} />
                          </div>
                        )}
                        {thumbnail && (
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <h3 className="font-medium group-hover:text-purple-300 transition-colors line-clamp-1" style={{ color: "var(--text-primary)" }}>
                            {project.title}
                          </h3>
                          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                            {(project.progress as any)?.projectMode === 'studio-polish' ? 'Studio Polish' : project.type} · {formatRelativeTime(project.updatedAt || project.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {(project.progress as any)?.projectMode === 'studio-polish' && (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 hover:opacity-90">
                              Studio Polish
                            </Badge>
                          )}
                          <Badge
                            className={`w-fit ${status.bg} ${status.text} hover:opacity-90`}
                          >
                            {status.label}
                          </Badge>
                        </div>
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
