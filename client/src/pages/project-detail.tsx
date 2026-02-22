import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Settings, Play, RefreshCw, Clock, Target, Monitor, BarChart3, Loader2, AlertCircle, Zap, Video, Image, Download, RotateCcw, Save, Trash2, ExternalLink, CheckCircle2, XCircle, X, Type, Film, ChevronDown, ChevronUp, CloudUpload, Mic, Music, Volume2, Palette, Shuffle, Sliders, Wand2, Sparkles, ImagePlus, Upload, Edit2, FileText, Plus, GripVertical, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProviderCatalogSelector } from "@/components/video/provider-catalog-selector";
import { useToast } from "@/hooks/use-toast";
import { EnhancedSceneEditor } from "@/components/video/enhanced-scene-editor";
import { SceneOverlayEditor, SceneOverlayItem } from "@/components/video/scene-overlay-editor";

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

const PIPELINE_STEPS = [
  { key: "script", label: "Script", icon: FileText },
  { key: "voiceover", label: "Voiceover", icon: Mic },
  { key: "images", label: "Images", icon: ImagePlus },
  { key: "videos", label: "Videos", icon: Video },
  { key: "music", label: "Music", icon: Music },
  { key: "assembly", label: "Assembly", icon: Film },
] as const;

function ScriptGenerationPanel({ projectId, project, scenes }: { projectId: string; project: any; scenes: any[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProvider, setSelectedProvider] = useState("auto");
  const [showStepButtons, setShowStepButtons] = useState(false);
  const [uploadingSceneId, setUploadingSceneId] = useState<string | null>(null);
  const [librarySceneId, setLibrarySceneId] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState(project.voiceoverSettings?.voiceId || project.voiceId || "");
  const [referenceImages, setReferenceImages] = useState<string[]>((project as any).referenceImages || (project as any).assets?.referenceImages || []);
  const [showRefLibrary, setShowRefLibrary] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const activeSceneRef = useRef<string | null>(null);

  const progress = project.progress || {};
  const isGenerating = ["generating", "queued", "processing"].includes(project.status);
  const currentStep = progress.currentStep || null;
  const hasScenes = scenes.length > 0;
  const scriptReady = hasScenes && (project.status === "draft" || progress.phase === "script_ready");

  const voicesQuery = useQuery({
    queryKey: ["voices"],
    queryFn: async () => {
      const res = await fetch("/api/universal-video/voices", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.voices || data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const refLibraryQuery = useQuery({
    queryKey: ["asset-library-ref-images"],
    queryFn: async () => {
      const res = await fetch("/api/asset-library?type=image", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.assets || [];
    },
    enabled: showRefLibrary,
  });

  const libraryQuery = useQuery({
    queryKey: ["asset-library-images"],
    queryFn: async () => {
      const res = await fetch("/api/asset-library?type=image", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.assets || [];
    },
    enabled: !!librarySceneId,
  });

  const handleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingRef(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/videos/uploads", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const data = await uploadRes.json();
      const url = data.url || data.fileUrl;
      if (url) setReferenceImages((prev) => [...prev, url]);
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    }
    setUploadingRef(false);
    if (refFileInputRef.current) refFileInputRef.current.value = "";
  };

  const generateScriptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/generate-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate script");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Script Generated", description: "Review and edit your scenes below, then generate assets." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateSceneMutation = useMutation({
    mutationFn: async ({ sceneId, updates }: { sceneId: string; updates: any }) => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update scene");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setEditingSceneId(null);
      setEditValues({});
      toast({ title: "Scene Updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteSceneMutation = useMutation({
    mutationFn: async (sceneId: string) => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete scene");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Scene Deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const generateAllMutation = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (selectedVoice) body.voiceId = selectedVoice;
      if (referenceImages.length > 0) body.referenceImages = referenceImages;
      if (selectedProvider && selectedProvider !== "auto") body.videoProvider = selectedProvider;
      const res = await fetch(`/api/universal-video/projects/${projectId}/generate-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to start asset generation");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Generation Started", description: "All assets are being generated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const generateStepMutation = useMutation({
    mutationFn: async (step: string) => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/generate-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ step }),
      });
      if (!res.ok) throw new Error(`Failed to generate ${step}`);
      return res.json();
    },
    onSuccess: (_data, step) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Step Started", description: `${step} generation started.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const regenImageMutation = useMutation({
    mutationFn: async (sceneId: string) => {
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/regenerate-image`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to regenerate image");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Regenerating Image", description: "Scene image is being regenerated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const regenVideoMutation = useMutation({
    mutationFn: async (sceneId: string) => {
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/regenerate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: selectedProvider }),
      });
      if (!res.ok) throw new Error("Failed to regenerate video");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Regenerating Video", description: "Scene video is being regenerated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const setMediaMutation = useMutation({
    mutationFn: async ({ sceneId, mediaUrl }: { sceneId: string; mediaUrl: string }) => {
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/set-media`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mediaUrl, mediaType: "image", source: "upload" }),
      });
      if (!res.ok) throw new Error("Failed to set media");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setUploadingSceneId(null);
      toast({ title: "Image Set", description: "Scene image has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setUploadingSceneId(null);
    },
  });

  const assignImageMutation = useMutation({
    mutationFn: async ({ sceneId, imageId }: { sceneId: string; imageId: string }) => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}/assign-image`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageId }),
      });
      if (!res.ok) throw new Error("Failed to assign image");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setLibrarySceneId(null);
      toast({ title: "Image Assigned", description: "Library image assigned to scene." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const sceneId = activeSceneRef.current;
    if (!file || !sceneId) return;
    setUploadingSceneId(sceneId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/videos/uploads", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const uploadData = await uploadRes.json();
      const mediaUrl = uploadData.url || uploadData.fileUrl;
      if (!mediaUrl) throw new Error("No URL returned from upload");
      setMediaMutation.mutate({ sceneId, mediaUrl });
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
      setUploadingSceneId(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getStepStatus = (stepKey: string) => {
    if (stepKey === "script" && hasScenes) return "completed";
    if (!isGenerating && !progress.completedSteps) return "pending";
    const completed = Array.isArray(progress.completedSteps) ? progress.completedSteps : [];
    if (completed.includes(stepKey)) return "completed";
    if (currentStep === stepKey) return "in-progress";
    const failed = Array.isArray(progress.errors) && progress.errors.some((e: any) => e.step === stepKey);
    if (failed) return "failed";
    return "pending";
  };

  const stepStatusStyles: Record<string, { dot: string; text: string }> = {
    "pending": { dot: "bg-gray-500", text: "text-gray-400" },
    "in-progress": { dot: "bg-amber-400 animate-pulse", text: "text-amber-400" },
    "completed": { dot: "bg-emerald-400", text: "text-emerald-400" },
    "failed": { dot: "bg-red-400", text: "text-red-400" },
  };

  const sceneTypes = ["hook", "problem", "agitation", "solution", "benefit", "proof", "product", "testimonial", "cta", "explanation", "process", "intro", "brand"];

  const startEditing = (scene: any) => {
    setEditingSceneId(scene.id);
    setEditValues({
      narration: scene.narration || "",
      visualDirection: scene.visualDirection || "",
      duration: scene.duration || 5,
      type: scene.type || "benefit",
    });
  };

  const saveEdit = (sceneId: string) => {
    updateSceneMutation.mutate({ sceneId, updates: editValues });
  };

  const totalDuration = scenes.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);

  return (
    <div className="border rounded-xl mb-8 overflow-hidden" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
      <div className="px-5 py-4 flex items-center gap-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <Sparkles className="w-5 h-5 text-purple-400" />
        <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>
          Script & Asset Generation
        </h2>
        {hasScenes && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400">
            {scenes.length} scenes &middot; {totalDuration}s
          </span>
        )}
      </div>

      <div className="px-5 py-5 space-y-5">
        {/* Pipeline Progress Tracker */}
        <div className="space-y-3">
          {(isGenerating || progress.overallPercent > 0) && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Pipeline Progress</span>
              <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{progress.overallPercent || 0}%</span>
            </div>
          )}
          {(isGenerating || progress.overallPercent > 0) && (
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress.overallPercent || 0}%` }}
              />
            </div>
          )}
          <div className="grid grid-cols-6 gap-2">
            {PIPELINE_STEPS.map((step) => {
              const status = getStepStatus(step.key);
              const styles = stepStatusStyles[status];
              const Icon = step.icon;
              return (
                <div key={step.key} className="flex flex-col items-center gap-1.5 p-2 rounded-lg" style={{ backgroundColor: "rgba(0,0,0,0.15)" }}>
                  <div className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} />
                  <Icon className={`w-4 h-4 ${styles.text}`} />
                  <span className={`text-[10px] font-medium ${styles.text}`}>{step.label}</span>
                </div>
              );
            })}
          </div>
          {Array.isArray(progress.errors) && progress.errors.length > 0 && (
            <div className="space-y-1">
              {progress.errors.map((err: any, i: number) => (
                <div key={i} className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{err.message || err.error || String(err)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PHASE 1: Generate Script (no scenes yet) */}
        {!hasScenes && !isGenerating && (
          <div className="space-y-4">
            <div className="text-center py-6 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
                <FileText className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Step 1: Generate Your Script
              </h3>
              <p className="text-sm max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
                AI will create scenes from your script with narration, visual directions, and timing. You can review and edit everything before generating visual assets.
              </p>
            </div>
            <button
              onClick={() => generateScriptMutation.mutate()}
              disabled={generateScriptMutation.isPending}
              className="w-full py-4 rounded-xl font-semibold text-white text-base flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
            >
              {generateScriptMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
              {generateScriptMutation.isPending ? "Generating Script..." : "Generate Script"}
            </button>
          </div>
        )}

        {/* PHASE 2: Scene Editor (scenes exist, not yet generating assets) */}
        {hasScenes && (
          <div className="space-y-4">
            {scriptReady && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-sm text-emerald-400">Script generated! Review and edit your scenes below, then generate visual assets.</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Scenes ({scenes.length})
              </h3>
              <div className="flex items-center gap-2">
                {scriptReady && (
                  <button
                    onClick={() => generateScriptMutation.mutate()}
                    disabled={generateScriptMutation.isPending}
                    className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors hover:border-purple-500/30"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                  >
                    <RefreshCw className={`w-3 h-3 ${generateScriptMutation.isPending ? "animate-spin" : ""}`} />
                    Regenerate Script
                  </button>
                )}
              </div>
            </div>

            {/* Scene Cards */}
            <div className="space-y-3">
              {scenes.map((scene: any, index: number) => {
                const sceneId = scene.id || `scene-${index}`;
                const isEditing = editingSceneId === sceneId;
                const isExpanded = expandedSceneId === sceneId;
                const thumbCandidate = scene.assets?.imageUrl || scene.background?.imageUrl || scene.background?.url || null;
                const thumb = thumbCandidate && !thumbCandidate.endsWith('.mp4') ? thumbCandidate : null;
                const narration = scene.narration || scene.voiceover?.text || "";
                const isUploading = uploadingSceneId === sceneId;
                const showLibrary = librarySceneId === sceneId;

                return (
                  <div
                    key={sceneId}
                    className="border rounded-xl overflow-hidden transition-all"
                    style={{ backgroundColor: "rgba(0,0,0,0.15)", borderColor: isEditing ? "rgba(124,58,237,0.4)" : "var(--border-subtle)" }}
                  >
                    {/* Scene Header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => setExpandedSceneId(isExpanded ? null : sceneId)}
                    >
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${sceneGradients[index % sceneGradients.length]} flex items-center justify-center flex-shrink-0`}>
                        {thumb ? (
                          <img src={thumb} alt="" className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <span className="text-xs font-bold text-white/70">{index + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                            {scene.name || scene.title || `Scene ${index + 1}`}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 uppercase tracking-wider font-medium">
                            {scene.type || "scene"}
                          </span>
                          {scene.duration && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                              {scene.duration}s
                            </span>
                          )}
                        </div>
                        <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {narration.substring(0, 80)}{narration.length > 80 ? "..." : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {scriptReady && (
                          <button
                            onClick={(e) => { e.stopPropagation(); isEditing ? saveEdit(sceneId) : startEditing(scene); }}
                            className="p-1.5 rounded-lg border transition-colors hover:border-purple-500/30"
                            style={{ borderColor: "var(--border-subtle)", color: isEditing ? "#a78bfa" : "var(--text-muted)" }}
                            title={isEditing ? "Save" : "Edit"}
                          >
                            {isEditing ? <Save className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {scriptReady && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteSceneMutation.mutate(sceneId); }}
                            className="p-1.5 rounded-lg border transition-colors hover:border-red-500/30"
                            style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                            title="Delete scene"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isExpanded ? <ChevronUp className="w-4 h-4" style={{ color: "var(--text-muted)" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
                      </div>
                    </div>

                    {/* Expanded Scene Content - Enhanced Editor */}
                    {isExpanded && (
                      <EnhancedSceneEditor
                        scene={scene}
                        sceneIndex={index}
                        projectId={projectId}
                        onClose={() => setExpandedSceneId(null)}
                        aspectRatio={project?.outputFormat?.aspectRatio || "16:9"}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        )}

        {/* PHASE 3: Asset Generation Config (scenes exist, ready to generate) */}
        {scriptReady && !isGenerating && (
          <div className="space-y-4 border-t pt-5" style={{ borderColor: "var(--border-subtle)" }}>
            <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Step 2: Configure & Generate Assets
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="border rounded-xl p-4 space-y-2" style={{ backgroundColor: "rgba(0,0,0,0.15)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Mic className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Voice Actor</span>
                </div>
                {voicesQuery.isLoading ? (
                  <div className="flex items-center gap-2 py-1">
                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--text-muted)" }} />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Loading voices...</span>
                  </div>
                ) : (
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full text-sm rounded-lg border px-3 py-2 bg-transparent outline-none"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  >
                    <option value="">Auto (default)</option>
                    {(voicesQuery.data || []).map((v: any) => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name}{v.labels?.gender ? ` (${v.labels.gender})` : ""}{v.labels?.accent ? ` - ${v.labels.accent}` : ""}
                      </option>
                    ))}
                  </select>
                )}
                {selectedVoice && (voicesQuery.data || []).find((v: any) => v.voice_id === selectedVoice)?.preview_url && (
                  <audio
                    src={(voicesQuery.data || []).find((v: any) => v.voice_id === selectedVoice)?.preview_url}
                    controls
                    className="w-full h-8 mt-1"
                    style={{ filter: "invert(1) hue-rotate(180deg)", opacity: 0.8 }}
                  />
                )}
              </div>

              <div className="border rounded-xl p-4 space-y-2" style={{ backgroundColor: "rgba(0,0,0,0.15)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <ImagePlus className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Reference Images</span>
                </div>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Add images for I2V (image-to-video) generation. Best results: use landscape (16:9) images at 1920×1080px or larger.</p>
                <input
                  ref={refFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleRefUpload}
                />
                <div className="flex gap-2 flex-wrap">
                  {referenceImages.map((url, i) => (
                    <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border group" style={{ borderColor: "var(--border-subtle)" }}>
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setReferenceImages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 text-[10px] rounded-bl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        x
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => refFileInputRef.current?.click()}
                      disabled={uploadingRef}
                      className="w-14 h-14 rounded-lg border-2 border-dashed flex items-center justify-center transition-colors hover:border-purple-500/30"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                    >
                      {uploadingRef ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setShowRefLibrary(!showRefLibrary)}
                      className="w-14 h-14 rounded-lg border-2 border-dashed flex items-center justify-center transition-colors hover:border-purple-500/30"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                      title="Pick from library"
                    >
                      <Image className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {showRefLibrary && (
                  <div className="border rounded-lg p-2 max-h-32 overflow-y-auto" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
                    {refLibraryQuery.isLoading ? (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />
                      </div>
                    ) : !refLibraryQuery.data || refLibraryQuery.data.length === 0 ? (
                      <p className="text-xs text-center py-3" style={{ color: "var(--text-muted)" }}>No images in library</p>
                    ) : (
                      <div className="grid grid-cols-5 gap-1.5">
                        {refLibraryQuery.data.slice(0, 15).map((asset: any) => (
                          <button
                            key={asset.id}
                            onClick={() => {
                              const url = asset.url || asset.thumbnailUrl;
                              if (url && !referenceImages.includes(url)) {
                                setReferenceImages((prev) => [...prev, url]);
                              }
                              setShowRefLibrary(false);
                            }}
                            className="aspect-square rounded overflow-hidden border hover:border-purple-500/50 transition-colors"
                            style={{ borderColor: "var(--border-subtle)" }}
                          >
                            <img src={asset.url || asset.thumbnailUrl} alt={asset.name || ""} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border rounded-xl p-4 space-y-2" style={{ backgroundColor: "rgba(0,0,0,0.15)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Video className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Video Provider</span>
                </div>
                <ProviderCatalogSelector
                  outputType="video"
                  provider={selectedProvider}
                  onProviderChange={setSelectedProvider}
                  label=""
                  compact
                />
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {referenceImages.length > 0
                    ? "I2V mode: Reference images will be used for video generation"
                    : "T2V mode: Videos generated from visual direction prompts"}
                </p>
              </div>
            </div>

            <button
              onClick={() => generateAllMutation.mutate()}
              disabled={isGenerating || generateAllMutation.isPending}
              className="w-full py-4 rounded-xl font-semibold text-white text-base flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
            >
              {(isGenerating || generateAllMutation.isPending) ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
              {isGenerating ? "Generating..." : generateAllMutation.isPending ? "Starting..." : `Generate All Assets (${scenes.length} scenes)`}
            </button>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
              <button
                onClick={() => setShowStepButtons(!showStepButtons)}
                className="text-xs px-3 py-1 rounded-full border transition-colors"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
              >
                {showStepButtons ? "Hide Steps" : "Step-by-step"}
              </button>
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
            </div>

            {showStepButtons && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {PIPELINE_STEPS.filter(s => s.key !== "assembly" && s.key !== "script").map((step) => {
                  const status = getStepStatus(step.key);
                  const Icon = step.icon;
                  const isCompleted = status === "completed";
                  return (
                    <button
                      key={step.key}
                      onClick={() => generateStepMutation.mutate(step.key)}
                      disabled={isGenerating || generateStepMutation.isPending}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        borderColor: isCompleted ? "var(--border-subtle)" : "var(--border-medium)",
                        color: isCompleted ? "var(--text-muted)" : "var(--text-primary)",
                        backgroundColor: isCompleted ? "rgba(16,185,129,0.05)" : "transparent",
                      }}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Icon className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                      )}
                      {step.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GenerationJobsPanel({ jobs, projectId }: { jobs: any[]; projectId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const COLLAPSED_COUNT = 2;
  const hasMore = jobs.length > COLLAPSED_COUNT;
  const displayJobs = expanded ? jobs : jobs.slice(0, COLLAPSED_COUNT);
  const failedCount = jobs.filter((j: any) => j.status === "failed").length;
  const completedCount = jobs.filter((j: any) => j.status === "succeeded" || j.status === "completed").length;

  const deleteJob = async (jobId: string) => {
    setDeletingIds(prev => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/video-generation-jobs/${jobId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/quick-create`] });
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete job", variant: "destructive" });
    } finally {
      setDeletingIds(prev => { const s = new Set(prev); s.delete(jobId); return s; });
    }
  };

  const clearJobs = async (statuses: string[]) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/video-generation-jobs?statuses=${statuses.join(",")}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/quick-create`] });
        toast({ title: "Cleared", description: "Jobs removed" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to clear jobs", variant: "destructive" });
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Generation Jobs
          </h2>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400">{jobs.length}</span>
          {hasMore && (
            expanded
              ? <ChevronUp className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              : <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          )}
        </button>
        <div className="flex items-center gap-2">
          {failedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={() => clearJobs(["failed"])}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear Failed ({failedCount})
            </Button>
          )}
          {completedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 hover:bg-gray-500/10"
              style={{ color: "var(--text-muted)" }}
              onClick={() => clearJobs(["succeeded", "completed"])}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear Completed ({completedCount})
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {displayJobs.map((job: any) => {
          const jobStatus = getStatusInfo(job.status);
          const isDeleting = deletingIds.has(job.jobId);
          return (
            <div
              key={job.jobId}
              className={`border rounded-lg p-3 flex items-center gap-3 group transition-opacity ${isDeleting ? "opacity-40" : ""}`}
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot[job.status] || "bg-gray-500"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    {job.sceneType === "image" ? "Image" : "Video"} Generation
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${jobStatus.color} ${jobStatus.bg}`}>
                    {jobStatus.text}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    {job.provider}
                  </span>
                </div>
                {job.prompt && (
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>{job.prompt}</p>
                )}
                {job.errorMessage && (
                  <p className="text-xs text-red-400 mt-0.5 truncate">{job.errorMessage}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {job.duration && (
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{job.duration}s</span>
                )}
                {job.aspectRatio && (
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{job.aspectRatio}</span>
                )}
                <button
                  onClick={() => deleteJob(job.jobId)}
                  disabled={isDeleting}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400"
                  title="Remove job"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          Show {jobs.length - COLLAPSED_COUNT} more jobs...
        </button>
      )}
    </div>
  );
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
                <p className="text-xl font-bold" style={{ color: "var(--text-muted)" }}>--</p>
              </div>
            )}
          </div>
          <div className="border rounded-xl p-4 group relative" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Monitor className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Aspect Ratio
              </p>
            </div>
            <div className="relative">
              <select
                className="text-xl font-bold bg-transparent border-none outline-none cursor-pointer appearance-none w-full pr-8"
                style={{ color: "var(--text-primary)" }}
                value={outputFormat.aspectRatio || "16:9"}
                onChange={async (e) => {
                  const newRatio = e.target.value;
                  try {
                    const res = await fetch(`/api/universal-video/projects/${project.id}/aspect-ratio`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ aspectRatio: newRatio }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
                      toast({ title: "Aspect Ratio Updated", description: `Set to ${newRatio}` });
                    }
                  } catch (err) {
                    toast({ title: "Error", description: "Failed to update aspect ratio", variant: "destructive" });
                  }
                }}
              >
                <option value="16:9" style={{ backgroundColor: "var(--surface)", color: "var(--text-primary)" }}>16:9</option>
                <option value="9:16" style={{ backgroundColor: "var(--surface)", color: "var(--text-primary)" }}>9:16</option>
                <option value="1:1" style={{ backgroundColor: "var(--surface)", color: "var(--text-primary)" }}>1:1</option>
                <option value="4:3" style={{ backgroundColor: "var(--surface)", color: "var(--text-primary)" }}>4:3</option>
              </select>
              <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} />
            </div>
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
          <GenerationJobsPanel jobs={jobs} projectId={projectId} />
        )}

        {!isQuickCreate && (
          <ScriptGenerationPanel projectId={projectId} project={project} scenes={scenes} />
        )}

        {isQuickCreate && scenes.length > 0 && (
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

        {isQuickCreate && scenes.length === 0 && jobs.length === 0 && (
          <div className="border rounded-xl p-12 text-center mb-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <Zap className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
            <h3 className="text-lg font-medium mb-2" style={{ color: "var(--text-primary)" }}>No content yet</h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Your generation job has been queued. Results will appear here once processing begins.
            </p>
          </div>
        )}


        {isQuickCreate && (
          <QuickCreateAssetPanel projectId={projectId} project={project} />
        )}

        {!isQuickCreate && project.outputUrl && (
          <div className="border rounded-xl p-5 mt-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Output</h2>
            {project.mediaMode === "image" ? (
              <img src={project.outputUrl} alt="Generated output" className="max-w-full rounded-lg" />
            ) : (
              <video src={project.outputUrl} controls className="max-w-full rounded-lg" />
            )}
          </div>
        )}

        <RenderConfigPanel projectId={projectId} projectOutputUrl={project.outputUrl} projectStatus={project.status} projectScenes={project.scenes} projectRenderId={project.renderId} />
      </div>
    </div>
  );
}

function ToggleSwitch({ enabled, onChange, label }: { enabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className="flex items-center gap-2"
    >
      <div className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? "bg-purple-600" : "bg-gray-600"}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? "left-[18px]" : "left-0.5"}`} />
      </div>
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
    </button>
  );
}

function RenderButton({ projectId, hasVisual, hasVoiceover, hasMusic, initialOutputUrl, initialStatus, initialRenderId }: { projectId: string; hasVisual: boolean; hasVoiceover: boolean; hasMusic: boolean; initialOutputUrl?: string | null; initialStatus?: string; initialRenderId?: string | null }) {
  const { toast } = useToast();
  const isAlreadyCompleted = (initialStatus === 'completed' || initialStatus === 'complete') && !!initialOutputUrl;
  const isAlreadyRendering = initialStatus === 'rendering' || initialStatus === 'render_queued' || initialStatus === 'lambda_pending';
  const [renderStatus, setRenderStatus] = useState<"idle" | "rendering" | "completed" | "failed">(isAlreadyCompleted ? "completed" : isAlreadyRendering ? "rendering" : "idle");
  const [renderProgress, setRenderProgress] = useState(isAlreadyCompleted ? 100 : 0);
  const [renderMessage, setRenderMessage] = useState(isAlreadyCompleted ? "Render complete!" : isAlreadyRendering ? "Resuming render progress..." : "");
  const [renderId, setRenderId] = useState<string | null>(initialRenderId || null);
  const [outputUrl, setOutputUrl] = useState<string | null>(initialOutputUrl || null);

  const startRenderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Render failed" }));
        throw new Error(err.error || "Render failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRenderStatus("rendering");
      setRenderProgress(0);
      setRenderMessage("Render started...");
      if (data.renderId) setRenderId(data.renderId);
      toast({ title: "Render Started", description: "Your video is being rendered." });
    },
    onError: (err: Error) => {
      setRenderStatus("failed");
      setRenderMessage(err.message);
      toast({ title: "Render Failed", description: err.message, variant: "destructive" });
    },
  });

  useQuery({
    queryKey: ["render-status", projectId, renderId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (renderId) params.set("renderId", renderId);
      const res = await fetch(`/api/universal-video/projects/${projectId}/render-status?${params}`, { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.progress !== undefined) setRenderProgress(Math.round(data.progress * 100));
      if (data.message) setRenderMessage(data.message);
      if (data.done && data.outputUrl) {
        setRenderStatus("completed");
        setOutputUrl(data.outputUrl);
        setRenderMessage("Render complete!");
      } else if (data.done && !data.success) {
        setRenderStatus("failed");
        setRenderMessage(data.errors?.[0] || data.error || "Render failed");
      } else if (!data.done) {
        setRenderMessage(data.message || `Rendering... ${Math.round((data.progress || 0) * 100)}%`);
      }
      return data;
    },
    enabled: renderStatus === "rendering",
    refetchInterval: 3000,
  });

  const canRender = hasVisual;

  return (
    <div className="border rounded-lg p-4 mt-2" style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}>
      {renderStatus === "completed" && outputUrl ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">Render Complete</span>
          </div>
          <div className="flex gap-2">
            <a
              href={outputUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all"
            >
              <ExternalLink className="w-4 h-4" /> View Rendered Video
            </a>
            <a
              href={outputUrl}
              download
              className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium border transition-colors"
              style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
            >
              <Download className="w-4 h-4" /> Download
            </a>
          </div>
          <button
            onClick={() => { setRenderStatus("idle"); setOutputUrl(null); setRenderProgress(0); setRenderMessage(""); }}
            className="w-full text-xs text-center py-1"
            style={{ color: "var(--text-muted)" }}
          >
            Render again
          </button>
        </div>
      ) : renderStatus === "rendering" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Rendering...</span>
            </div>
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{Math.round(renderProgress)}%</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--progress-track)" }}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-500"
              style={{ width: `${renderProgress}%` }}
            />
          </div>
          {renderMessage && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{renderMessage}</p>}
        </div>
      ) : renderStatus === "failed" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Render Failed</span>
          </div>
          {renderMessage && <p className="text-xs text-red-400/80">{renderMessage}</p>}
          <button
            onClick={() => startRenderMutation.mutate()}
            disabled={startRenderMutation.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" /> Retry Render
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!canRender && (
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Generate a visual asset before rendering.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => startRenderMutation.mutate()}
              disabled={!canRender || startRenderMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
            >
              {startRenderMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Film className="w-4 h-4" />
              )}
              Start Render
            </button>
          </div>
          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span className={`flex items-center gap-1 ${hasVisual ? "text-emerald-400" : ""}`}>
              {hasVisual ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />} Visual
            </span>
            <span className={`flex items-center gap-1 ${hasVoiceover ? "text-emerald-400" : ""}`}>
              {hasVoiceover ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />} Voiceover
            </span>
            <span className={`flex items-center gap-1 ${hasMusic ? "text-emerald-400" : ""}`}>
              {hasMusic ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />} Music
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function RenderConfigPanel({ projectId, projectOutputUrl, projectStatus, projectScenes, projectRenderId }: { projectId: string; projectOutputUrl?: string | null; projectStatus?: string; projectScenes?: any[]; projectRenderId?: string | null }) {
  const [expanded, setExpanded] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["render-settings", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/render-settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch render settings");
      return res.json();
    },
  });

  const assetsQuery = useQuery({
    queryKey: ["quick-create-assets-render", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/quick-create/assets`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    refetchInterval: 5000,
  });

  const quickAssets = assetsQuery.data || {};
  const voiceoverReady = quickAssets.voiceover?.status === "completed" && !!quickAssets.voiceover?.url;
  const musicReady = quickAssets.music?.status === "completed" && !!quickAssets.music?.url;

  const scenesFromProps = Array.isArray(projectScenes) ? projectScenes : [];
  const scenesHaveVideoFromProps = scenesFromProps.some((s: any) => s.assets?.videoUrl || s.background?.videoUrl);
  const scenesHaveVideoFromSettings = settingsQuery.data?.hasSceneVideos === true;
  const scenesHaveVideo = scenesHaveVideoFromProps || scenesHaveVideoFromSettings;

  const rawSettings = settingsQuery.data?.settings || {
    voiceover: { enabled: true, voiceId: null, hasGenerated: false },
    music: { enabled: true, volume: 0.18, hasGenerated: false },
    soundDesign: { enabled: true, transitionSounds: true, impactSounds: true, ambientLayer: true, ambientType: "nature", masterVolume: 1.0 },
    filmTreatment: { enabled: true, colorGrade: "warm-cinematic", grainIntensity: 0.03, vignetteIntensity: 0.2, letterbox: "none" },
    transitions: { style: "crossfade", duration: 0.5 },
    introEnabled: true,
    introTemplate: "classic-glow",
    outroEnabled: true,
    outroTemplate: "classic-glow",
    introBackgroundRandom: false,
  };

  const settings = {
    ...rawSettings,
    voiceover: {
      ...rawSettings.voiceover,
      hasGenerated: rawSettings.voiceover.hasGenerated || voiceoverReady,
      duration: rawSettings.voiceover.duration || (voiceoverReady ? quickAssets.voiceover?.duration : undefined),
      url: rawSettings.voiceover.url || (voiceoverReady ? quickAssets.voiceover?.url : undefined),
    },
    music: {
      ...rawSettings.music,
      hasGenerated: rawSettings.music.hasGenerated || musicReady,
      url: rawSettings.music.url || (musicReady ? quickAssets.music?.url : undefined),
    },
  };

  const saveMutation = useMutation({
    mutationFn: async (patch: any) => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/render-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["render-settings", projectId] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateSetting = (category: string, key: string, value: any) => {
    saveMutation.mutate({ [category]: { ...settings[category], [key]: value } });
  };

  const colorGradeOptions = [
    { value: "warm-cinematic", label: "Warm Cinematic" },
    { value: "cool-corporate", label: "Cool Corporate" },
    { value: "natural-organic", label: "Natural Organic" },
    { value: "vibrant-lifestyle", label: "Vibrant Lifestyle" },
    { value: "luxury-elegant", label: "Luxury Elegant" },
    { value: "moody-dramatic", label: "Moody Dramatic" },
  ];

  const transitionOptions = [
    { value: "crossfade", label: "Crossfade" },
    { value: "fade", label: "Fade" },
    { value: "dissolve", label: "Dissolve" },
    { value: "slide-left", label: "Slide Left" },
    { value: "slide-right", label: "Slide Right" },
    { value: "wipe-left", label: "Wipe Left" },
    { value: "wipe-right", label: "Wipe Right" },
    { value: "zoom", label: "Zoom" },
    { value: "none", label: "None (Cut)" },
  ];

  const ambientOptions = [
    { value: "nature", label: "Nature" },
    { value: "warm", label: "Warm Room" },
  ];

  if (settingsQuery.isLoading) {
    return (
      <div className="border rounded-xl mt-6 p-5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Loading render settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-xl mt-6 overflow-hidden" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 text-left hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-3">
          <Sliders className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>
            Render Configuration
          </h2>
          {saveMutation.isPending && (
            <span className="flex items-center gap-1 text-xs text-purple-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving...
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronDown className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 space-y-3" style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Voiceover</span>
                </div>
                <ToggleSwitch
                  enabled={settings.voiceover.enabled}
                  onChange={(v) => updateSetting("voiceover", "enabled", v)}
                  label=""
                />
              </div>
              {settings.voiceover.enabled && (
                <>
                  <div className="flex items-center gap-2">
                    {settings.voiceover.hasGenerated ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> Ready{settings.voiceover.duration ? ` (${Math.round(settings.voiceover.duration)}s)` : ""}
                      </span>
                    ) : quickAssets.voiceover?.status === "generating" ? (
                      <span className="flex items-center gap-1 text-xs text-blue-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <AlertCircle className="w-3 h-3" /> Not generated yet
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {settings.voiceover.hasGenerated
                      ? "Voiceover audio is ready for rendering."
                      : "Generate a voiceover in the Asset Creation panel above."}
                  </p>
                </>
              )}
            </div>

            <div className="border rounded-lg p-4 space-y-3" style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-pink-400" />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Background Music</span>
                </div>
                <ToggleSwitch
                  enabled={settings.music.enabled}
                  onChange={(v) => updateSetting("music", "enabled", v)}
                  label=""
                />
              </div>
              {settings.music.enabled && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Volume</span>
                      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                        {Math.round((settings.music.volume || 0.18) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round((settings.music.volume || 0.18) * 100)}
                      onChange={(e) => updateSetting("music", "volume", parseInt(e.target.value) / 100)}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ background: `linear-gradient(to right, rgb(168 85 247) ${Math.round((settings.music.volume || 0.18) * 100)}%, var(--border-subtle) ${Math.round((settings.music.volume || 0.18) * 100)}%)` }}
                    />
                  </div>
                  {settings.music.hasGenerated ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> Music ready
                    </span>
                  ) : quickAssets.music?.status === "generating" ? (
                    <span className="flex items-center gap-1 text-xs text-blue-400">
                      <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-amber-400">
                      <AlertCircle className="w-3 h-3" /> Not generated yet
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-3" style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Sound Design</span>
              </div>
              <ToggleSwitch
                enabled={settings.soundDesign.enabled}
                onChange={(v) => updateSetting("soundDesign", "enabled", v)}
                label=""
              />
            </div>
            {settings.soundDesign.enabled && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <ToggleSwitch
                  enabled={settings.soundDesign.transitionSounds}
                  onChange={(v) => saveMutation.mutate({ soundDesign: { ...settings.soundDesign, transitionSounds: v } })}
                  label="Transitions"
                />
                <ToggleSwitch
                  enabled={settings.soundDesign.impactSounds}
                  onChange={(v) => saveMutation.mutate({ soundDesign: { ...settings.soundDesign, impactSounds: v } })}
                  label="Impacts"
                />
                <ToggleSwitch
                  enabled={settings.soundDesign.ambientLayer}
                  onChange={(v) => saveMutation.mutate({ soundDesign: { ...settings.soundDesign, ambientLayer: v } })}
                  label="Ambient"
                />
                <div>
                  <span className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Ambient Type</span>
                  <select
                    value={settings.soundDesign.ambientType}
                    onChange={(e) => saveMutation.mutate({ soundDesign: { ...settings.soundDesign, ambientType: e.target.value } })}
                    className="w-full text-xs rounded-md border p-1.5 appearance-none"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  >
                    {ambientOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 space-y-3" style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Film Treatment</span>
                </div>
                <ToggleSwitch
                  enabled={settings.filmTreatment.enabled}
                  onChange={(v) => updateSetting("filmTreatment", "enabled", v)}
                  label=""
                />
              </div>
              {settings.filmTreatment.enabled && (
                <>
                  <div>
                    <span className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Color Grade</span>
                    <select
                      value={settings.filmTreatment.colorGrade}
                      onChange={(e) => saveMutation.mutate({ filmTreatment: { ...settings.filmTreatment, colorGrade: e.target.value } })}
                      className="w-full text-xs rounded-md border p-1.5 appearance-none"
                      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                    >
                      {colorGradeOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Film Grain</span>
                      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                        {Math.round((settings.filmTreatment.grainIntensity || 0) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={Math.round((settings.filmTreatment.grainIntensity || 0) * 100)}
                      onChange={(e) => saveMutation.mutate({ filmTreatment: { ...settings.filmTreatment, grainIntensity: parseInt(e.target.value) / 100 } })}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ background: `linear-gradient(to right, rgb(245 158 11) ${Math.round((settings.filmTreatment.grainIntensity || 0) * 1000)}%, var(--border-subtle) ${Math.round((settings.filmTreatment.grainIntensity || 0) * 1000)}%)` }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Vignette</span>
                      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                        {Math.round((settings.filmTreatment.vignetteIntensity || 0) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={Math.round((settings.filmTreatment.vignetteIntensity || 0) * 100)}
                      onChange={(e) => saveMutation.mutate({ filmTreatment: { ...settings.filmTreatment, vignetteIntensity: parseInt(e.target.value) / 100 } })}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ background: `linear-gradient(to right, rgb(245 158 11) ${Math.round((settings.filmTreatment.vignetteIntensity || 0) * 200)}%, var(--border-subtle) ${Math.round((settings.filmTreatment.vignetteIntensity || 0) * 200)}%)` }}
                    />
                  </div>
                  <div>
                    <span className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Letterbox</span>
                    <select
                      value={settings.filmTreatment.letterbox}
                      onChange={(e) => saveMutation.mutate({ filmTreatment: { ...settings.filmTreatment, letterbox: e.target.value } })}
                      className="w-full text-xs rounded-md border p-1.5 appearance-none"
                      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                    >
                      <option value="none">None</option>
                      <option value="2.39:1">Cinematic (2.39:1)</option>
                      <option value="1.85:1">Widescreen (1.85:1)</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="border rounded-lg p-4 space-y-3" style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Transitions</span>
              </div>
              <div>
                <span className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Style</span>
                <select
                  value={settings.transitions.style}
                  onChange={(e) => saveMutation.mutate({ transitions: { ...settings.transitions, style: e.target.value } })}
                  className="w-full text-xs rounded-md border p-1.5 appearance-none"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                >
                  {transitionOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Duration</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    {(settings.transitions.duration || 0.5).toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={Math.round((settings.transitions.duration || 0.5) * 10)}
                  onChange={(e) => saveMutation.mutate({ transitions: { ...settings.transitions, duration: parseInt(e.target.value) / 10 } })}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, rgb(34 197 94) ${Math.round((settings.transitions.duration || 0.5) * 50)}%, var(--border-subtle) ${Math.round((settings.transitions.duration || 0.5) * 50)}%)` }}
                />
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Applied between scenes during final render composition.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 space-y-3" style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Intro</span>
                </div>
                <ToggleSwitch
                  enabled={settings.introEnabled ?? true}
                  onChange={(v) => saveMutation.mutate({ introEnabled: v })}
                  label=""
                />
              </div>
              {settings.introEnabled !== false && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'classic-glow', label: 'Classic Glow', desc: 'Radiant glow behind logo' },
                      { value: 'minimal', label: 'Minimal', desc: 'Clean fade-in' },
                      { value: 'cinematic', label: 'Cinematic', desc: 'Full-screen background' },
                      { value: 'elegant-fade', label: 'Elegant Fade', desc: 'Gradient sweep' },
                    ].map((t) => (
                      <button
                        key={t.value}
                        onClick={() => saveMutation.mutate({ introTemplate: t.value })}
                        className={`p-2 rounded-lg border text-left transition-all ${
                          settings.introTemplate === t.value
                            ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500'
                            : 'hover:border-purple-500/40'
                        }`}
                        style={{ borderColor: settings.introTemplate === t.value ? undefined : "var(--border-subtle)" }}
                      >
                        <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{t.label}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{t.desc}</p>
                      </button>
                    ))}
                  </div>
                  {settings.introTemplate === 'cinematic' && (
                    <ToggleSwitch
                      enabled={settings.introBackgroundRandom ?? false}
                      onChange={(v) => saveMutation.mutate({ introBackgroundRandom: v })}
                      label="Random background"
                    />
                  )}
                </>
              )}
            </div>

            <div className="border rounded-lg p-4 space-y-3" style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Outro</span>
                </div>
                <ToggleSwitch
                  enabled={settings.outroEnabled ?? true}
                  onChange={(v) => saveMutation.mutate({ outroEnabled: v })}
                  label=""
                />
              </div>
              {settings.outroEnabled !== false && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'classic-glow', label: 'Classic Glow', desc: 'Radiant glow behind logo' },
                    { value: 'minimal', label: 'Minimal', desc: 'Clean fade-in' },
                    { value: 'cinematic', label: 'Cinematic', desc: 'Full-screen background' },
                    { value: 'elegant-fade', label: 'Elegant Fade', desc: 'Gradient sweep' },
                  ].map((t) => (
                    <button
                      key={t.value}
                      onClick={() => saveMutation.mutate({ outroTemplate: t.value })}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        settings.outroTemplate === t.value
                          ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
                          : 'hover:border-indigo-500/40'
                      }`}
                      style={{ borderColor: settings.outroTemplate === t.value ? undefined : "var(--border-subtle)" }}
                    >
                      <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{t.label}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{t.desc}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <RenderButton projectId={projectId} hasVisual={!!quickAssets.visual?.url || scenesHaveVideo} hasVoiceover={voiceoverReady || settings.voiceover.hasGenerated} hasMusic={musicReady || settings.music.hasGenerated} initialOutputUrl={projectOutputUrl} initialStatus={projectStatus} initialRenderId={projectRenderId} />
        </div>
      )}
    </div>
  );
}

function TextOverlayControls({ projectId, project }: { projectId: string; project: any }) {
  const [overlayText, setOverlayText] = useState("");
  const [position, setPosition] = useState<"top" | "center" | "bottom">("bottom");
  const [fontSize, setFontSize] = useState(48);
  const [overlays, setOverlays] = useState<Array<{ text: string; position: string; fontSize: number }>>([]);
  const { toast } = useToast();

  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  const [selectedScene, setSelectedScene] = useState(0);

  const textStylesQuery = useQuery({
    queryKey: ["text-styles"],
    queryFn: async () => {
      const res = await fetch("/api/universal-video/text-placement/styles", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load text styles");
      return res.json();
    },
    staleTime: 300000,
  });

  const calculatePlacementsMutation = useMutation({
    mutationFn: async () => {
      const overlayPayload = overlays.map((o) => ({
        text: o.text,
        type: "caption" as const,
        style: "modern" as const,
        position: o.position,
        fontSize: o.fontSize,
      }));

      const res = await fetch(
        `/api/universal-video/projects/${projectId}/scenes/${selectedScene}/calculate-text-placements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            overlays: overlayPayload,
            sceneDuration: scenes[selectedScene]?.duration || 5,
            fps: 30,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to calculate placements");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Placements Calculated",
        description: `${data.placements?.length || 0} text placements computed for Scene ${selectedScene + 1}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addOverlay = () => {
    if (!overlayText.trim()) return;
    setOverlays((prev) => [...prev, { text: overlayText.trim(), position, fontSize }]);
    setOverlayText("");
  };

  const removeOverlay = (index: number) => {
    setOverlays((prev) => prev.filter((_, i) => i !== index));
  };

  if (scenes.length === 0) {
    return (
      <div
        className="border rounded-lg p-6 text-center"
        style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}
      >
        <Type className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Text overlays are available for multi-scene projects (AI-Generated Script or Custom Script).
        </p>
      </div>
    );
  }

  return (
    <div
      className="border rounded-lg p-4 space-y-4"
      style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Scene:</label>
        <select
          value={selectedScene}
          onChange={(e) => setSelectedScene(Number(e.target.value))}
          className="text-sm rounded-lg border px-3 py-1.5"
          style={{
            backgroundColor: "var(--input-bg)",
            borderColor: "var(--input-border)",
            color: "var(--text-primary)",
          }}
        >
          {scenes.map((_: any, i: number) => (
            <option key={i} value={i}>Scene {i + 1}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={overlayText}
          onChange={(e) => setOverlayText(e.target.value)}
          placeholder="Enter text overlay..."
          className="flex-1 text-sm rounded-lg border px-3 py-2"
          style={{
            backgroundColor: "var(--input-bg)",
            borderColor: "var(--input-border)",
            color: "var(--text-primary)",
          }}
          onKeyDown={(e) => e.key === "Enter" && addOverlay()}
        />
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value as "top" | "center" | "bottom")}
          className="text-sm rounded-lg border px-3 py-2"
          style={{
            backgroundColor: "var(--input-bg)",
            borderColor: "var(--input-border)",
            color: "var(--text-primary)",
          }}
        >
          <option value="top">Top</option>
          <option value="center">Center</option>
          <option value="bottom">Bottom</option>
        </select>
        <input
          type="number"
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          min={12}
          max={120}
          className="w-20 text-sm rounded-lg border px-3 py-2"
          style={{
            backgroundColor: "var(--input-bg)",
            borderColor: "var(--input-border)",
            color: "var(--text-primary)",
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={addOverlay}
          disabled={!overlayText.trim()}
          style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
        >
          Add
        </Button>
      </div>

      {overlays.length > 0 && (
        <div className="space-y-2">
          {overlays.map((o, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Type className="w-3.5 h-3.5 flex-shrink-0 text-purple-400" />
                <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{o.text}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 flex-shrink-0">
                  {o.position}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{o.fontSize}px</span>
              </div>
              <button
                onClick={() => removeOverlay(i)}
                className="text-red-400 hover:text-red-300 p-1"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          ))}

          <Button
            size="sm"
            onClick={() => calculatePlacementsMutation.mutate()}
            disabled={calculatePlacementsMutation.isPending}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white gap-2"
          >
            {calculatePlacementsMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Type className="w-4 h-4" />
            )}
            Calculate Placements
          </Button>
        </div>
      )}

      {textStylesQuery.data?.styles && (
        <div className="pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Available styles:</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(textStylesQuery.data.styles).map((style: string) => (
              <span
                key={style}
                className="text-xs px-2 py-0.5 rounded-full border"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                  backgroundColor: "var(--surface)",
                }}
              >
                {style}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const ELEVENLABS_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "female", description: "Calm, warm", accent: "American", useCase: "Narration" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", gender: "male", description: "Deep, trustworthy", accent: "American", useCase: "Narration" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", gender: "male", description: "Deep, professional", accent: "American", useCase: "Narration" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female", description: "Soft, friendly", accent: "American", useCase: "News" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", gender: "female", description: "Warm, seductive", accent: "English-Swedish", useCase: "Video Games" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", gender: "female", description: "Warm, friendly", accent: "American", useCase: "Audiobook" },
  { id: "GBv7mTt0atIp3Br8iCZE", name: "Thomas", gender: "male", description: "Calm, professional", accent: "American", useCase: "Meditation" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", gender: "male", description: "Casual, natural", accent: "Australian", useCase: "Conversational" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", gender: "male", description: "Deep, authoritative", accent: "British", useCase: "News" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female", description: "Confident, clear", accent: "British", useCase: "News" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", gender: "male", description: "Well-rounded", accent: "American", useCase: "Narration" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", gender: "male", description: "Crisp, clear", accent: "American", useCase: "Narration" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", gender: "male", description: "Strong, documentary", accent: "American", useCase: "Documentary" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", gender: "male", description: "Hoarse, rugged", accent: "American", useCase: "Video Games" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris", gender: "male", description: "Casual, friendly", accent: "American", useCase: "Conversational" },
  { id: "2EiwWnXFnvU5JabPnv8n", name: "Clyde", gender: "male", description: "War veteran, gruff", accent: "American", useCase: "Video Games" },
  { id: "CYw3kZ02Hs0563khs1Fj", name: "Dave", gender: "male", description: "Conversational", accent: "British-Essex", useCase: "Video Games" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", gender: "female", description: "Strong, confident", accent: "American", useCase: "Narration" },
  { id: "ThT5KcBeYPX3keUQqHPh", name: "Dorothy", gender: "female", description: "Pleasant, warm", accent: "British", useCase: "Children's Stories" },
  { id: "29vD33N1CtxCmqQRPOHJ", name: "Drew", gender: "male", description: "Well-rounded", accent: "American", useCase: "News" },
  { id: "LcfcDJNUP1GQjkzn1xUU", name: "Emily", gender: "female", description: "Calm, soothing", accent: "American", useCase: "Meditation" },
  { id: "g5CIjZEefAph4nQFvHAz", name: "Ethan", gender: "male", description: "Soft, ASMR", accent: "American", useCase: "ASMR" },
  { id: "D38z5RcWu1voky8WS1ja", name: "Fin", gender: "male", description: "Sailor, rugged", accent: "Irish", useCase: "Video Games" },
  { id: "jsCqWAovK2LkecY7zXl4", name: "Freya", gender: "female", description: "Expressive", accent: "American", useCase: "General" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "male", description: "Raspy, warm", accent: "British", useCase: "Narration" },
  { id: "jBpfuIE2acCO8z3wKNLl", name: "Gigi", gender: "female", description: "Childish, playful", accent: "American", useCase: "Animation" },
  { id: "zcAOhNBS3c14rBihAFp1", name: "Giovanni", gender: "male", description: "Foreign charm", accent: "English-Italian", useCase: "Audiobook" },
  { id: "z9fAnlkpzviPz146aGWa", name: "Glinda", gender: "female", description: "Mystical, witch", accent: "American", useCase: "Video Games" },
  { id: "oWAxZDx7w5VEj9dCyTzz", name: "Grace", gender: "female", description: "Southern charm", accent: "American-Southern", useCase: "Audiobook" },
  { id: "SOYHLrjzK2X1ezoPC6cr", name: "Harry", gender: "male", description: "Anxious, young", accent: "American", useCase: "Video Games" },
  { id: "ZQe5CZNOzWyzPSCn5a3c", name: "James", gender: "male", description: "Calm, mature", accent: "Australian", useCase: "News" },
  { id: "bVMeCyTHy58xNoL34h3p", name: "Jeremy", gender: "male", description: "Excited, energetic", accent: "American-Irish", useCase: "Narration" },
  { id: "t0jbNlBVZ17f02VDIeMI", name: "Jessie", gender: "male", description: "Raspy, old", accent: "American", useCase: "Video Games" },
  { id: "Zlb1dXrM653N07WRdFW3", name: "Joseph", gender: "male", description: "Professional", accent: "British", useCase: "News" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", gender: "male", description: "Deep, young", accent: "American", useCase: "Narration" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", gender: "male", description: "Natural, clear", accent: "American", useCase: "Narration" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", gender: "female", description: "Raspy, mature", accent: "British", useCase: "Narration" },
  { id: "flq6f7yk4E4fJM5XTYuZ", name: "Michael", gender: "male", description: "Mature, warm", accent: "American", useCase: "Audiobook" },
  { id: "zrHiDhphv9ZnVXBqCLjz", name: "Mimi", gender: "female", description: "Childish, cute", accent: "English-Swedish", useCase: "Animation" },
  { id: "piTKgcLEGmPE4e6mEKli", name: "Nicole", gender: "female", description: "Whisper, soft", accent: "American", useCase: "Audiobook" },
  { id: "ODq5zmih8GrVes37Dizd", name: "Patrick", gender: "male", description: "Shouty, bold", accent: "American", useCase: "Video Games" },
  { id: "5Q0t7uMcjvnagumLfvZi", name: "Paul", gender: "male", description: "Ground reporter", accent: "American", useCase: "News" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", gender: "male", description: "Raspy, young", accent: "American", useCase: "Narration" },
  { id: "pMsXgVXv3BLzUgSXRplE", name: "Serena", gender: "female", description: "Pleasant, calm", accent: "American", useCase: "Interactive" },
  { id: "knrPHWnBmmDHMoiMeP3l", name: "Santa Claus", gender: "male", description: "Jolly, festive", accent: "American", useCase: "Christmas" },
];

function QuickCreateAssetPanel({ projectId, project }: { projectId: string; project: any }) {
  const [expanded, setExpanded] = useState(true);
  const [editPrompt, setEditPrompt] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("auto");
  const [selectedVoiceId, setSelectedVoiceId] = useState("21m00Tcm4TlvDq8ikWAM");
  const [voiceFilter, setVoiceFilter] = useState<"all" | "male" | "female">("all");
  const [musicMood, setMusicMood] = useState("auto");
  const [musicGenerator, setMusicGenerator] = useState("auto");
  const [overlayItems, setOverlayItems] = useState<SceneOverlayItem[]>([]);
  const [overlaysLoaded, setOverlaysLoaded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const assetsQuery = useQuery({
    queryKey: ["quick-create-assets", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/quick-create/assets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5000;
      const anyGenerating = [data.visual?.status, data.voiceover?.status, data.music?.status].some(
        (s) => s === "generating" || s === "queued" || s === "processing"
      );
      return anyGenerating ? 3000 : false;
    },
  });

  useEffect(() => {
    if (assetsQuery.data?.project?.prompt && !promptText) {
      setPromptText(assetsQuery.data.project.prompt);
    }
    if (assetsQuery.data?.visual?.provider) {
      setSelectedProvider(assetsQuery.data.visual.provider);
    }
    if (assetsQuery.data?.overlayItems && !overlaysLoaded) {
      setOverlayItems(assetsQuery.data.overlayItems);
      setOverlaysLoaded(true);
    }
  }, [assetsQuery.data]);

  const generateVisualMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/quick-create/generate-visual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          prompt: promptText || undefined,
          provider: selectedProvider,
        }),
      });
      if (!res.ok) throw new Error("Failed to start visual generation");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Visual Generation Started", description: "Your visual asset is being generated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const generateVoiceoverMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/quick-create/generate-voiceover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ narrationText: promptText, voiceId: selectedVoiceId }),
      });
      if (!res.ok) throw new Error("Failed to start voiceover generation");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets", projectId] });
      toast({ title: "Voiceover Generation Started", description: "Your voiceover is being generated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const generateMusicMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/quick-create/generate-music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mood: musicMood, style: musicGenerator, generator: musicGenerator }),
      });
      if (!res.ok) throw new Error("Failed to start music generation");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets", projectId] });
      toast({ title: "Music Generation Started", description: "Your background music is being generated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveOverlayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleOverlayChange = useCallback((items: SceneOverlayItem[]) => {
    setOverlayItems(items);
    if (saveOverlayTimeout.current) clearTimeout(saveOverlayTimeout.current);
    saveOverlayTimeout.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}/quick-create/overlays`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ overlayItems: items }),
      }).catch(() => {});
    }, 800);
  }, [projectId]);

  const assets = assetsQuery.data || { visual: { status: "pending" }, voiceover: { status: "pending" }, music: { status: "pending" } };
  const isVideoMode = project.mediaMode !== "image";

  const assetStatusBadge = (status: string) => {
    const configs: Record<string, { text: string; color: string; bg: string }> = {
      pending: { text: "Not Generated", color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/20" },
      queued: { text: "Queued", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
      generating: { text: "Generating...", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
      processing: { text: "Processing...", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
      completed: { text: "Ready", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
      failed: { text: "Failed", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
    };
    const cfg = configs[status] || configs.pending;
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${cfg.color} ${cfg.bg}`}>
        {(status === "generating" || status === "processing" || status === "queued") && <Loader2 className="w-3 h-3 animate-spin" />}
        {status === "completed" && <CheckCircle2 className="w-3 h-3" />}
        {status === "failed" && <XCircle className="w-3 h-3" />}
        {cfg.text}
      </span>
    );
  };

  const outputType: "video" | "image" = project?.mediaMode === "image" ? "image" : "video";

  const moodOptions = [
    { value: "auto", label: "Auto" },
    { value: "uplifting", label: "Uplifting" },
    { value: "calm", label: "Calm" },
    { value: "intense", label: "Intense" },
    { value: "playful", label: "Playful" },
  ];

  const generatorOptions = [
    { value: "auto", label: "Auto", desc: "Best for style" },
    { value: "udio", label: "Udio", desc: "Professional-grade, versatile", price: "$0.05" },
    { value: "suno-v5", label: "Suno V5", desc: "Adaptive, structured songs", price: "Variable" },
    { value: "diffrhythm", label: "DiffRhythm", desc: "Full songs with vocals, fast", price: "$0.02" },
    { value: "kling-sound", label: "Kling Sound", desc: "Sound effects & ambient", price: "$0.07" },
  ];

  return (
    <div className="border rounded-xl mt-8 overflow-hidden" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Wand2 className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>
            Asset Creation
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">Quick Create</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" style={{ color: "var(--text-muted)" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          <div className="border rounded-xl p-4" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.15)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {project.mediaMode === "image" ? (
                  <ImagePlus className="w-5 h-5 text-purple-400" />
                ) : (
                  <Video className="w-5 h-5 text-purple-400" />
                )}
                <h3 className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                  Visual Asset
                </h3>
              </div>
              {assetStatusBadge(assets.visual?.status)}
            </div>

            {assets.visual?.url && (
              <div className="mb-3 rounded-lg overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }}>
                {project.mediaMode === "image" ? (
                  <img src={assets.visual.url} alt="Generated visual" className="w-full max-h-64 object-contain bg-black" />
                ) : (
                  <video src={assets.visual.url} controls className="w-full max-h-64" />
                )}
              </div>
            )}

            {assets.visual?.error && (
              <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                {assets.visual.error}
              </div>
            )}

            {assets.visual?.provider && assets.visual.status === "completed" && (
              <div className="flex gap-3 mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>Provider: <strong style={{ color: "var(--text-secondary)" }}>{assets.visual.provider}</strong></span>
                {assets.visual.generationTimeMs && (
                  <span>Time: <strong style={{ color: "var(--text-secondary)" }}>{(assets.visual.generationTimeMs / 1000).toFixed(1)}s</strong></span>
                )}
                {assets.visual.cost && (
                  <span>Cost: <strong style={{ color: "var(--text-secondary)" }}>${assets.visual.cost.toFixed(3)}</strong></span>
                )}
              </div>
            )}

            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Prompt</label>
                  {!editPrompt && (
                    <button className="text-xs text-purple-400 hover:text-purple-300" onClick={() => setEditPrompt(true)}>Edit</button>
                  )}
                </div>
                {editPrompt ? (
                  <div className="space-y-2">
                    <textarea
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border p-2.5 text-sm resize-none"
                      style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}
                    />
                    <button className="text-xs text-purple-400 hover:text-purple-300" onClick={() => setEditPrompt(false)}>Done editing</button>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{promptText || project.description || "No prompt"}</p>
                )}
              </div>

              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <ProviderCatalogSelector
                    outputType={outputType}
                    provider={selectedProvider}
                    onProviderChange={setSelectedProvider}
                    label="Provider"
                    compact
                  />
                </div>
                <Button
                  onClick={() => generateVisualMutation.mutate()}
                  disabled={generateVisualMutation.isPending || assets.visual?.status === "generating" || assets.visual?.status === "processing" || assets.visual?.status === "queued"}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white gap-1.5 text-sm"
                  size="sm"
                >
                  {(generateVisualMutation.isPending || assets.visual?.status === "generating" || assets.visual?.status === "queued") ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {assets.visual?.status === "completed" ? "Regenerate" : "Generate"}
                </Button>
              </div>
            </div>
          </div>

          {assets.visual?.status === "completed" && assets.visual?.url && (
            <div className="border rounded-xl p-4" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.15)" }}>
              <div className="flex items-center gap-2 mb-3">
                <ImagePlus className="w-5 h-5 text-cyan-400" />
                <h3 className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>Scene Overlays</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  {overlayItems.length} overlay{overlayItems.length !== 1 ? "s" : ""}
                </span>
              </div>
              <SceneOverlayEditor
                overlays={overlayItems}
                onChange={handleOverlayChange}
                previewWidth={(() => {
                  const ar = (project.outputFormat?.aspectRatio || "16:9");
                  if (ar === "9:16") return 1080;
                  if (ar === "1:1") return 1024;
                  if (ar === "4:3") return 1440;
                  return 1920;
                })()}
                previewHeight={(() => {
                  const ar = (project.outputFormat?.aspectRatio || "16:9");
                  if (ar === "9:16") return 1920;
                  if (ar === "1:1") return 1024;
                  if (ar === "4:3") return 1080;
                  return 1080;
                })()}
                backgroundUrl={assets.visual.url}
                backgroundType={project.mediaMode === "image" ? "image" : "video"}
              />
            </div>
          )}

          {isVideoMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-xl p-4" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.15)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Mic className="w-5 h-5 text-amber-400" />
                    <h3 className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>Voiceover</h3>
                  </div>
                  {assetStatusBadge(assets.voiceover?.status)}
                </div>

                {assets.voiceover?.url && (
                  <div className="mb-3">
                    <audio src={assets.voiceover.url} controls className="w-full h-8" />
                    {assets.voiceover.duration && (
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Duration: {assets.voiceover.duration}s</p>
                    )}
                  </div>
                )}

                {assets.voiceover?.error && (
                  <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                    {assets.voiceover.error}
                  </div>
                )}

                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Narrator Voice</label>
                    <div className="flex gap-1 ml-auto">
                      {(["all", "female", "male"] as const).map((g) => (
                        <button
                          key={g}
                          onClick={() => setVoiceFilter(g)}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${voiceFilter === g ? "border-purple-500/50 text-purple-300 bg-purple-500/10" : "border-transparent text-gray-500 hover:text-gray-300"}`}
                        >
                          {g === "all" ? "All" : g === "female" ? "Female" : "Male"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <select
                    value={selectedVoiceId}
                    onChange={(e) => setSelectedVoiceId(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-medium)", color: "var(--text-primary)" }}
                  >
                    {ELEVENLABS_VOICES
                      .filter((v) => voiceFilter === "all" || v.gender === voiceFilter)
                      .map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.name} — {voice.description} ({voice.accent})
                        </option>
                      ))}
                  </select>
                  {(() => {
                    const selected = ELEVENLABS_VOICES.find((v) => v.id === selectedVoiceId);
                    return selected ? (
                      <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                        {selected.gender === "female" ? "♀" : "♂"} {selected.name} · {selected.description} · Best for: {selected.useCase}
                      </p>
                    ) : null;
                  })()}
                </div>

                <Button
                  onClick={() => generateVoiceoverMutation.mutate()}
                  disabled={generateVoiceoverMutation.isPending || assets.voiceover?.status === "generating"}
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-sm"
                  style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                >
                  {(generateVoiceoverMutation.isPending || assets.voiceover?.status === "generating") ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                  {assets.voiceover?.status === "completed" ? "Regenerate Voiceover" : "Generate Voiceover"}
                </Button>
              </div>

              <div className="border rounded-xl p-4" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.15)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Music className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>Background Music</h3>
                  </div>
                  {assetStatusBadge(assets.music?.status)}
                </div>

                {assets.music?.url && (
                  <div className="mb-3">
                    <audio src={assets.music.url} controls className="w-full h-8" />
                    <div className="flex gap-3 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      {assets.music.mood && <span>Mood: {assets.music.mood}</span>}
                      {assets.music.duration && <span>Duration: {assets.music.duration}s</span>}
                    </div>
                  </div>
                )}

                {assets.music?.error && (
                  <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                    {assets.music.error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Mood</label>
                    <select
                      value={musicMood}
                      onChange={(e) => setMusicMood(e.target.value)}
                      className="w-full rounded-lg border p-1.5 text-xs"
                      style={{ backgroundColor: "var(--surface)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}
                    >
                      {moodOptions.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Music Generator</label>
                    <select
                      value={musicGenerator}
                      onChange={(e) => setMusicGenerator(e.target.value)}
                      className="w-full rounded-lg border p-1.5 text-xs"
                      style={{ backgroundColor: "var(--surface)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}
                    >
                      {generatorOptions.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}{g.price ? ` — ${g.price}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <Button
                  onClick={() => generateMusicMutation.mutate()}
                  disabled={generateMusicMutation.isPending || assets.music?.status === "generating"}
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-sm"
                  style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                >
                  {(generateMusicMutation.isPending || assets.music?.status === "generating") ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Music className="w-4 h-4" />
                  )}
                  {assets.music?.status === "completed" ? "Regenerate Music" : "Generate Music"}
                </Button>
              </div>
            </div>
          )}

          {!isVideoMode && (
            <div className="text-xs rounded-lg p-3 border" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)", backgroundColor: "rgba(0,0,0,0.1)" }}>
              Voiceover and music are available for video projects only. Switch to video mode to enable audio asset generation.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
