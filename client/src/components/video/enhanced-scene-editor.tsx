import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Play, Pause, Volume2, VolumeX, Maximize2, MoreVertical,
  RefreshCw, Upload, Image, Video, Save, X, Loader2,
  CheckCircle2, ImagePlus, ChevronDown, Edit2, FolderOpen
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const sceneTypes = [
  "hook", "problem", "agitation", "solution", "benefit",
  "proof", "product", "testimonial", "cta", "explanation",
  "process", "intro", "brand"
];

const VIDEO_PROVIDERS = [
  { id: "auto", label: "Auto-select (recommended)" },
  { id: "kling-2.6", label: "Kling 2.6" },
  { id: "kling-2.6-pro", label: "Kling 2.6 Pro" },
  { id: "hailuo", label: "Hailuo" },
  { id: "wan-2.6", label: "Wan 2.6" },
  { id: "wan-2.1", label: "Wan 2.1" },
  { id: "luma", label: "Luma" },
  { id: "runway", label: "RunwayML" },
  { id: "pika", label: "Pika" },
  { id: "veo-3.1", label: "Veo 3.1" },
  { id: "veo-3", label: "Veo 3" },
  { id: "sora-2", label: "Sora 2" },
  { id: "sora-2-pro", label: "Sora 2 Pro" },
];

interface EnhancedSceneEditorProps {
  scene: any;
  sceneIndex: number;
  projectId: string;
  onClose: () => void;
}

export function EnhancedSceneEditor({ scene, sceneIndex, projectId, onClose }: EnhancedSceneEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  const sceneId = scene.id || `scene-${sceneIndex}`;
  const videoUrl = scene.assets?.videoUrl;
  const imageUrl = scene.assets?.imageUrl || scene.background?.url;
  const hasVideo = !!videoUrl;
  const hasImage = !!imageUrl;
  const assetReady = hasVideo || hasImage;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [provider, setProvider] = useState("auto");
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [editValues, setEditValues] = useState({
    type: scene.type || "scene",
    duration: scene.duration || 5,
    narration: scene.narration || "",
    visualDirection: scene.visualDirection || "",
  });

  const libraryQuery = useQuery({
    queryKey: ["asset-library-images"],
    queryFn: async () => {
      const res = await fetch("/api/asset-library?type=image", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.assets || [];
    },
    enabled: showLibrary,
  });

  const providerUsed = scene.assets?.videoProvider || scene.assets?.imageProvider || scene.generationMethod || null;
  const promptUsed = scene.assets?.prompt || scene.visualDirection || "";

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => setCurrentTime(vid.currentTime);
    const onDur = () => setVideoDuration(vid.duration);
    const onEnd = () => setIsPlaying(false);
    vid.addEventListener("timeupdate", onTime);
    vid.addEventListener("loadedmetadata", onDur);
    vid.addEventListener("ended", onEnd);
    return () => {
      vid.removeEventListener("timeupdate", onTime);
      vid.removeEventListener("loadedmetadata", onDur);
      vid.removeEventListener("ended", onEnd);
    };
  }, [videoUrl]);

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPlaying) { vid.pause(); } else { vid.play(); }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const vid = videoRef.current;
    if (!vid || !videoDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    vid.currentTime = pct * videoDuration;
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const updateSceneMutation = useMutation({
    mutationFn: async (updates: any) => {
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
      setIsEditing(false);
      toast({ title: "Scene Updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const regenImageMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/regenerate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: editValues.visualDirection }),
      });
      if (!res.ok) throw new Error("Failed to regenerate image");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Image Regenerating", description: "New image is being generated for this scene." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const regenVideoMutation = useMutation({
    mutationFn: async () => {
      const sourceImage = referenceImageUrls.length > 0 ? referenceImageUrls[0] : imageUrl;
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/regenerate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          query: editValues.visualDirection,
          provider: provider === "auto" ? undefined : provider,
          sourceImageUrl: sourceImage,
        }),
      });
      if (!res.ok) throw new Error("Failed to regenerate video");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Video Regenerating", description: "New video is being generated for this scene." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const setMediaMutation = useMutation({
    mutationFn: async (mediaUrl: string) => {
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
      toast({ title: "Image Updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      if (url) setMediaMutation.mutate(url);
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      if (url) {
        setReferenceImageUrls((prev) => [...prev, url]);
        toast({ title: "Reference Image Added", description: "Image will be used for I2V video generation." });
      }
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    }
    if (refFileInputRef.current) refFileInputRef.current.value = "";
  };

  const saveChanges = () => {
    updateSceneMutation.mutate(editValues);
  };

  const isRegenerating = regenImageMutation.isPending || regenVideoMutation.isPending;

  return (
    <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleUpload} />
      <input type="file" ref={refFileInputRef} className="hidden" accept="image/*" onChange={handleRefUpload} />

      {/* Visual Asset Section */}
      <div className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Visual Asset</span>
          </div>
          {assetReady && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Ready
            </span>
          )}
          {isRegenerating && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Generating...
            </span>
          )}
        </div>

        {/* Video/Image Preview */}
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.3)" }}>
          {hasVideo ? (
            <div className="relative">
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full aspect-video object-contain bg-black"
                playsInline
                poster={imageUrl}
              />
              {/* Video Controls Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <div
                  className="w-full h-1 rounded-full bg-white/20 cursor-pointer mb-2 group"
                  onClick={seekTo}
                >
                  <div
                    className="h-full rounded-full bg-purple-500 relative"
                    style={{ width: videoDuration ? `${(currentTime / videoDuration) * 100}%` : "0%" }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={togglePlay} className="text-white hover:text-purple-300 transition-colors">
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <span className="text-xs text-white/70">
                      {formatTime(currentTime)} / {formatTime(videoDuration || scene.duration || 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={toggleMute} className="text-white hover:text-purple-300 transition-colors">
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => videoRef.current?.requestFullscreen?.()}
                      className="text-white hover:text-purple-300 transition-colors"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : hasImage ? (
            <div className="relative">
              <img src={imageUrl} alt={`Scene ${sceneIndex + 1}`} className="w-full aspect-video object-contain bg-black" />
              <div className="absolute top-2 right-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white/70 border border-white/10">
                  Image Only
                </span>
              </div>
            </div>
          ) : (
            <div className="aspect-video flex items-center justify-center">
              <div className="text-center">
                <ImagePlus className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>No visual asset generated yet</p>
              </div>
            </div>
          )}
        </div>

        {/* Provider Info + Reference Images + Regenerate Controls */}
        <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-3 items-start">
          {/* Provider & Prompt Info */}
          <div className="min-w-0">
            {providerUsed && (
              <p className="text-[11px] mb-0.5" style={{ color: "var(--text-muted)" }}>
                Provider: <span className="font-medium" style={{ color: "var(--text-secondary)" }}>{providerUsed}</span>
              </p>
            )}
            {promptUsed && (
              <>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Prompt</p>
                <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{promptUsed}</p>
              </>
            )}
          </div>

          {/* Reference Images */}
          <div>
            <p className="text-[11px] font-medium flex items-center gap-1 mb-1" style={{ color: "var(--text-secondary)" }}>
              <Image className="w-3 h-3" /> Reference Images
            </p>
            <p className="text-[10px] mb-1.5" style={{ color: "var(--text-muted)" }}>For I2V (image-to-video)</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {imageUrl && (
                <div className="w-10 h-10 rounded-md overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }}>
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              {referenceImageUrls.map((url, i) => (
                <div key={i} className="relative w-10 h-10 rounded-md overflow-hidden border group" style={{ borderColor: "rgba(124,58,237,0.3)" }}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setReferenceImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => refFileInputRef.current?.click()}
                className="w-10 h-10 rounded-md border border-dashed flex items-center justify-center transition-colors hover:border-purple-500/40"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                title="Upload from computer"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowLibrary(!showLibrary); }}
                className="w-10 h-10 rounded-md border border-dashed flex items-center justify-center transition-colors hover:border-purple-500/40"
                style={{ borderColor: showLibrary ? "rgba(124,58,237,0.4)" : "var(--border-subtle)", color: showLibrary ? "rgb(124,58,237)" : "var(--text-muted)" }}
                title="Browse asset library"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
            </div>
            {showLibrary && (
              <div className="border rounded-lg p-2 mt-2 max-h-32 overflow-y-auto" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
                {libraryQuery.isLoading ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />
                  </div>
                ) : !libraryQuery.data || libraryQuery.data.length === 0 ? (
                  <p className="text-xs text-center py-3" style={{ color: "var(--text-muted)" }}>No images in library</p>
                ) : (
                  <div className="grid grid-cols-6 gap-1.5">
                    {libraryQuery.data.slice(0, 18).map((asset: any) => (
                      <button
                        key={asset.id}
                        onClick={() => {
                          const url = asset.url || asset.thumbnailUrl;
                          if (url) {
                            setReferenceImageUrls((prev) => [...prev, url]);
                            setShowLibrary(false);
                            toast({ title: "Reference Added" });
                          }
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

          {/* Provider Selector + Regenerate */}
          <div className="flex flex-col items-end gap-2">
            <div>
              <p className="text-[11px] font-medium mb-1 text-right" style={{ color: "var(--text-secondary)" }}>Video Provider</p>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="text-xs rounded-lg border px-2 py-1.5 bg-transparent outline-none w-48"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              >
                {VIDEO_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {(referenceImageUrls.length > 0 || imageUrl) && (
                <p className="text-[10px] mt-0.5 text-right" style={{ color: "var(--text-muted)" }}>
                  I2V mode: Reference image will be used
                </p>
              )}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => regenImageMutation.mutate()}
                disabled={isRegenerating}
                className="text-[11px] px-2.5 py-1.5 rounded-lg border font-medium flex items-center gap-1 hover:border-purple-500/30 disabled:opacity-50 transition-colors"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
              >
                {regenImageMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                Image
              </button>
              <button
                onClick={() => regenVideoMutation.mutate()}
                disabled={isRegenerating}
                className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white font-medium flex items-center gap-1.5 hover:bg-purple-500 disabled:opacity-50 transition-colors"
              >
                {regenVideoMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Regenerate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t" style={{ borderColor: "var(--border-subtle)" }} />

      {/* Scene Metadata Section */}
      <div className="space-y-3">
        {/* Scene Type + Duration Row */}
        <div className="grid grid-cols-[1fr_200px] gap-3">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              Scene Type
            </label>
            <select
              value={editValues.type}
              onChange={(e) => setEditValues({ ...editValues, type: e.target.value })}
              disabled={!isEditing}
              className="w-full text-sm rounded-lg border px-3 py-2 bg-transparent outline-none disabled:opacity-70"
              style={{
                borderColor: isEditing ? "rgba(124,58,237,0.3)" : "var(--border-subtle)",
                color: "var(--text-primary)",
                backgroundColor: isEditing ? "rgba(124,58,237,0.05)" : "transparent",
              }}
            >
              {sceneTypes.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              Duration (seconds)
            </label>
            <input
              type="number"
              min={2}
              max={60}
              value={editValues.duration}
              onChange={(e) => setEditValues({ ...editValues, duration: parseInt(e.target.value) || 5 })}
              disabled={!isEditing}
              className="w-full text-sm rounded-lg border px-3 py-2 bg-transparent outline-none disabled:opacity-70"
              style={{
                borderColor: isEditing ? "rgba(124,58,237,0.3)" : "var(--border-subtle)",
                color: "var(--text-primary)",
                backgroundColor: isEditing ? "rgba(124,58,237,0.05)" : "transparent",
              }}
            />
          </div>
        </div>

        {/* Narration */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
            Narration
          </label>
          <textarea
            value={editValues.narration}
            onChange={(e) => setEditValues({ ...editValues, narration: e.target.value })}
            disabled={!isEditing}
            rows={3}
            className="w-full text-sm rounded-lg border px-3 py-2 bg-transparent outline-none resize-none disabled:opacity-70"
            style={{
              borderColor: isEditing ? "rgba(124,58,237,0.3)" : "var(--border-subtle)",
              color: "var(--text-primary)",
              backgroundColor: isEditing ? "rgba(124,58,237,0.05)" : "transparent",
            }}
          />
        </div>

        {/* Visual Direction */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
            Visual Direction (AI prompt for video generation)
          </label>
          <textarea
            value={editValues.visualDirection}
            onChange={(e) => setEditValues({ ...editValues, visualDirection: e.target.value })}
            disabled={!isEditing}
            rows={3}
            className="w-full text-sm rounded-lg border px-3 py-2 bg-transparent outline-none resize-none disabled:opacity-70"
            style={{
              borderColor: isEditing ? "rgba(124,58,237,0.3)" : "var(--border-subtle)",
              color: "var(--text-primary)",
              backgroundColor: isEditing ? "rgba(124,58,237,0.05)" : "transparent",
            }}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end pt-1">
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditValues({
                      type: scene.type || "scene",
                      duration: scene.duration || 5,
                      narration: scene.narration || "",
                      visualDirection: scene.visualDirection || "",
                    });
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveChanges}
                  disabled={updateSceneMutation.isPending}
                  className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white font-medium flex items-center gap-1.5 disabled:opacity-50 hover:bg-purple-500 transition-colors"
                >
                  {updateSceneMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save Changes
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:border-purple-500/30 flex items-center gap-1.5"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
              >
                <Edit2 className="w-3 h-3" /> Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
