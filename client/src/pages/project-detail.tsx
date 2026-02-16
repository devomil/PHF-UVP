import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Settings, Play, RefreshCw, Clock, Target, Monitor, BarChart3, Loader2, AlertCircle, Zap, Video, Image, Download, RotateCcw, Save, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const statusDot: Record<string, string> = {
  pending: "bg-gray-500",
  queued: "bg-gray-500",
  processing: "bg-amber-400 animate-pulse",
  rendering: "bg-amber-400 animate-pulse",
  generating: "bg-amber-400 animate-pulse",
  completed: "bg-emerald-400",
  failed: "bg-red-400",
  draft: "bg-gray-500",
};

const statusLabel: Record<string, { text: string; color: string; bg: string }> = {
  draft: { text: "Draft", color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/20" },
  pending: { text: "Pending", color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/20" },
  queued: { text: "Queued", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  processing: { text: "Processing", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  rendering: { text: "Rendering", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  generating: { text: "Generating", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  completed: { text: "Completed", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  failed: { text: "Failed", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
};

const sceneGradients = [
  "from-purple-600/40 to-indigo-600/40",
  "from-blue-600/40 to-cyan-600/40",
  "from-indigo-600/40 to-purple-600/40",
  "from-violet-600/40 to-fuchsia-600/40",
  "from-cyan-600/40 to-blue-600/40",
];

function getStatusInfo(status: string) {
  return statusLabel[status] || statusLabel.draft;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "Unknown";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ProjectDetail({ params }: { params?: { id: string } }) {
  const projectId = params?.id || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Project not found");
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && ["completed", "failed"].includes(data.status)) return false;
      return 5000;
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/regenerate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to regenerate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Regenerating", description: "A new generation job has been queued." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Deleted", description: "Project has been deleted." });
      setLocation("/projects");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleDownload = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast({ title: "Download started", description: `Saving ${filename}` });
    } catch {
      window.open(url, "_blank");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6 lg:p-8">
        <Link href="/projects" className="text-sm inline-flex items-center gap-1 mb-6" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </Link>
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Project Not Found</h2>
          <p style={{ color: "var(--text-secondary)" }}>The project you're looking for doesn't exist or has been deleted.</p>
        </div>
      </div>
    );
  }

  const outputFormat = project.outputFormat || {};
  const progress = project.progress || {};
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  const jobs = Array.isArray(project.jobs) ? project.jobs : [];
  const qualityReport = project.qualityReport || {};
  const isQuickCreate = outputFormat.platform === "quick-create";
  const projectStatus = getStatusInfo(project.status);

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/projects">
              <button
                className="p-2 rounded-lg border transition-colors"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
              >
                <ArrowLeft className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
              </button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {project.type} · Created {formatDate(project.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {project.outputUrl && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                onClick={() => handleDownload(
                  project.outputUrl,
                  `${(project.title || "output").replace(/[^a-zA-Z0-9]/g, "_")}.${project.mediaMode === "image" ? "png" : "mp4"}`
                )}
              >
                <Download className="w-4 h-4" />
                Download
              </Button>
            )}
            {project.outputUrl && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                onClick={() => window.open(project.outputUrl, "_blank")}
              >
                <ExternalLink className="w-4 h-4" />
                Open
              </Button>
            )}
            {isQuickCreate && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending || project.status === "generating" || project.status === "processing"}
              >
                <RotateCcw className="w-4 h-4" />
                {regenerateMutation.isPending ? "Queuing..." : "Regenerate"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-400 hover:text-red-300"
              style={{ borderColor: "var(--border-medium)" }}
              onClick={() => {
                if (confirm("Are you sure you want to delete this project?")) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="border rounded-xl p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Status</p>
            </div>
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full border font-medium ${projectStatus.color} ${projectStatus.bg}`}>
              {projectStatus.text}
            </span>
          </div>
          <div className="border rounded-xl p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Duration</p>
            </div>
            <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{formatDuration(project.totalDuration || 0)}</p>
          </div>
          <div className="border rounded-xl p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                {isQuickCreate ? "Type" : "Quality Score"}
              </p>
            </div>
            {isQuickCreate ? (
              <div className="flex items-center gap-2">
                {project.mediaMode === "image" ? (
                  <Image className="w-5 h-5 text-purple-400" />
                ) : (
                  <Video className="w-5 h-5 text-cyan-400" />
                )}
                <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                  {project.mediaMode === "image" ? "Image" : "Video"}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {qualityReport.overallScore ? (
                  <>
                    <div className={`w-3 h-3 rounded-full ${(qualityReport.overallScore || 0) >= 70 ? "bg-emerald-400" : "bg-amber-400"}`} />
                    <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{qualityReport.overallScore}/100</p>
                  </>
                ) : (
                  <p className="text-xl font-bold" style={{ color: "var(--text-muted)" }}>--</p>
                )}
              </div>
            )}
          </div>
          <div className="border rounded-xl p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Monitor className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                {isQuickCreate ? "Aspect Ratio" : "Platform"}
              </p>
            </div>
            <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {isQuickCreate ? (outputFormat.aspectRatio || "16:9") : (outputFormat.platform || "YouTube")}
            </p>
          </div>
        </div>

        {project.description && (
          <div className="border rounded-xl p-5 mb-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
              {isQuickCreate ? "Prompt" : "Description"}
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "var(--text-primary)" }}>{project.description}</p>
          </div>
        )}

        {progress.currentStep && (
          <div className="border rounded-xl p-5 mb-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{progress.currentStep}</p>
                {progress.percentage > 0 && (
                  <div className="mt-2 w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {jobs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>
              Generation Jobs
            </h2>
            <div className="space-y-3">
              {jobs.map((job: any) => {
                const jobStatus = getStatusInfo(job.status);
                return (
                  <div
                    key={job.jobId}
                    className="border rounded-xl p-4 flex items-center gap-4"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
                  >
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${statusDot[job.status] || "bg-gray-500"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                          {job.sceneType === "image" ? "Image" : "Video"} Generation
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${jobStatus.color} ${jobStatus.bg}`}>
                          {jobStatus.text}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400">
                          {job.provider}
                        </span>
                      </div>
                      {job.prompt && (
                        <p className="text-sm truncate" style={{ color: "var(--text-muted)" }}>{job.prompt}</p>
                      )}
                      {job.errorMessage && (
                        <p className="text-sm text-red-400 mt-1">{job.errorMessage}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {job.duration && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{job.duration}s</span>
                      )}
                      {job.aspectRatio && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{job.aspectRatio}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {scenes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Scenes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenes.map((scene: any, index: number) => (
                <div
                  key={scene.id || index}
                  className="group border rounded-xl overflow-hidden hover:border-purple-500/20 transition-colors"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
                >
                  <div className={`h-24 bg-gradient-to-br ${sceneGradients[index % sceneGradients.length]} relative flex items-center justify-center`}>
                    <span className="text-2xl font-bold text-white/20">{index + 1}</span>
                    {scene.thumbnailUrl && (
                      <img src={scene.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    )}
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
                        <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{scene.name || scene.title || `Scene ${index + 1}`}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{scene.duration ? `${scene.duration}s` : ""}</p>
                      </div>
                      <div className={`w-2.5 h-2.5 rounded-full ${statusDot[scene.status] || "bg-gray-500"}`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {scenes.length === 0 && jobs.length === 0 && (
          <div className="border rounded-xl p-12 text-center mb-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <Zap className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
            <h3 className="text-lg font-medium mb-2" style={{ color: "var(--text-primary)" }}>No content yet</h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {isQuickCreate
                ? "Your generation job has been queued. Results will appear here once processing begins."
                : "Add scenes to your project or generate content to get started."}
            </p>
          </div>
        )}

        {!isQuickCreate && (
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Quality Report</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Visual Quality", value: qualityReport.visualQuality },
                { label: "Brand Consistency", value: qualityReport.brandConsistency },
                { label: "Scene Transitions", value: qualityReport.sceneTransitions },
                { label: "Overall Score", value: qualityReport.overallScore },
              ].map((metric) => (
                <div key={metric.label} className="border rounded-xl p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                  <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{metric.label}</p>
                  <p className="text-xl font-bold" style={{ color: metric.value ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {metric.value ?? "--"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {project.outputUrl && (
          <div className="border rounded-xl p-5 mt-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Output</h2>
            {project.mediaMode === "image" ? (
              <img src={project.outputUrl} alt="Generated output" className="max-w-full rounded-lg" />
            ) : (
              <video src={project.outputUrl} controls className="max-w-full rounded-lg" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
