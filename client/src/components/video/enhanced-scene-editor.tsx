import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Play, Pause, Volume2, VolumeX, Maximize2, MoreVertical,
  RefreshCw, Upload, Image, Video, Save, X, Loader2,
  CheckCircle2, ImagePlus, ChevronDown, ChevronRight, Edit2, FolderOpen, Expand
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SceneOverlayEditor, type SceneOverlayItem } from "./scene-overlay-editor";

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
  { id: "veo-3.1", label: "Veo 3.1" },
  { id: "veo-3", label: "Veo 3" },
  { id: "sora-2", label: "Sora 2" },
  { id: "sora-2-pro", label: "Sora 2 Pro" },
  { id: "hunyuan", label: "Hunyuan" },
];

const GENERATION_MODES = [
  { id: "auto", label: "Auto", description: "Automatically choose based on available assets" },
  { id: "t2v", label: "T2V", description: "Text-to-Video: Generate video from text prompt" },
  { id: "i2v", label: "I2V", description: "Image-to-Video: Animate a reference image" },
  { id: "t2i", label: "T2I", description: "Text-to-Image: Generate a still image from text" },
  { id: "i2i", label: "I2I", description: "Image-to-Image: Transform an existing image" },
];

interface EnhancedSceneEditorProps {
  scene: any;
  sceneIndex: number;
  projectId: string;
  onClose: () => void;
  aspectRatio?: string;
}

export function EnhancedSceneEditor({ scene, sceneIndex, projectId, onClose, aspectRatio = "16:9" }: EnhancedSceneEditorProps) {
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
  const [generationMode, setGenerationMode] = useState("auto");
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>(
    () => scene.assets?.referenceImages || []
  );
  const [showLibrary, setShowLibrary] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [inlinePrompt, setInlinePrompt] = useState(scene.assets?.prompt || scene.visualDirection || "");
  const [regeneratingType, setRegeneratingType] = useState<'video' | 'image' | null>(null);
  const [regenStartedAt, setRegenStartedAt] = useState<number | null>(null);
  const [regenElapsed, setRegenElapsed] = useState(0);
  const [sceneOverlays, setSceneOverlays] = useState<SceneOverlayItem[]>(
    () => scene.overlayItems || []
  );
  const [editingMicroScene, setEditingMicroScene] = useState<number | null>(null);
  const [microSceneEditValue, setMicroSceneEditValue] = useState("");
  const [regeneratingMicroScene, setRegeneratingMicroScene] = useState<number | null>(null);
  const [msRegenStartedAt, setMsRegenStartedAt] = useState<number | null>(null);
  const [msRegenElapsed, setMsRegenElapsed] = useState(0);
  const msRegenTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevMicroSceneVideos = useRef<Record<number, string | undefined>>({});
  const [expandedMicroScene, setExpandedMicroScene] = useState<number | null>(null);
  const [fullscreenMicroScene, setFullscreenMicroScene] = useState<number | null>(null);
  const [msModalPrompt, setMsModalPrompt] = useState("");
  const [msModalEditingPrompt, setMsModalEditingPrompt] = useState(false);
  const [msModalProvider, setMsModalProvider] = useState("auto");
  const [msModalMode, setMsModalMode] = useState("auto");
  const [msModalRefImages, setMsModalRefImages] = useState<string[]>([]);
  const [msModalShowLibrary, setMsModalShowLibrary] = useState(false);
  const msModalFileRef = useRef<HTMLInputElement>(null);
  const overlayDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevVideoUrl = useRef(videoUrl);
  const prevImageUrl = useRef(imageUrl);

  const handleOverlayChange = useCallback((newOverlays: SceneOverlayItem[]) => {
    setSceneOverlays(newOverlays);
    if (overlayDebounceRef.current) clearTimeout(overlayDebounceRef.current);
    overlayDebounceRef.current = setTimeout(() => {
      fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ overlayItems: newOverlays }),
      }).then((res) => {
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        } else {
          toast({ title: "Failed to save overlays", variant: "destructive" });
        }
      }).catch(() => {
        toast({ title: "Failed to save overlays", variant: "destructive" });
      });
    }, 800);
  }, [projectId, sceneId, queryClient, toast]);

  useEffect(() => {
    return () => {
      if (overlayDebounceRef.current) clearTimeout(overlayDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    const incoming = scene.overlayItems || [];
    if (JSON.stringify(incoming) !== JSON.stringify(sceneOverlays)) {
      setSceneOverlays(incoming);
    }
  }, [scene.overlayItems]);

  useEffect(() => {
    const checkActiveMsJobs = async () => {
      try {
        const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/micro-scene-jobs`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.activeJobs) {
          const indices = Object.keys(data.activeJobs).map(Number);
          if (indices.length > 0) {
            const idx = indices[0];
            const job = data.activeJobs[idx];
            const jobAge = Date.now() - new Date(job.createdAt).getTime();
            setRegeneratingMicroScene(idx);
            setMsRegenStartedAt(Date.now() - jobAge);
            setMsRegenElapsed(Math.floor(jobAge / 1000));
          }
        }
      } catch {}
    };
    checkActiveMsJobs();
  }, [projectId, sceneId]);

  useEffect(() => {
    if (fullscreenMicroScene !== null && scene.microScenes?.[fullscreenMicroScene]) {
      const ms = scene.microScenes[fullscreenMicroScene];
      setMsModalPrompt(ms.visualDirection || "");
      setMsModalEditingPrompt(false);
      setMsModalProvider("auto");
      setMsModalMode("auto");
      setMsModalRefImages([]);
      setMsModalShowLibrary(false);
    }
  }, [fullscreenMicroScene]);

  useEffect(() => {
    if (regeneratingMicroScene !== null && scene.microScenes) {
      const currentUrl = scene.microScenes[regeneratingMicroScene]?.videoUrl;
      const prevUrl = prevMicroSceneVideos.current[regeneratingMicroScene];
      if (currentUrl && currentUrl !== prevUrl && prevUrl !== undefined) {
        setRegeneratingMicroScene(null);
        setMsRegenStartedAt(null);
        setMsRegenElapsed(0);
        if (msRegenTimerRef.current) clearInterval(msRegenTimerRef.current);
        toast({ title: "Micro-scene video ready", description: "New video has been generated." });
      }
    }
    if (scene.microScenes) {
      scene.microScenes.forEach((ms: any, i: number) => {
        prevMicroSceneVideos.current[i] = ms.videoUrl;
      });
    }
  }, [scene.microScenes]);

  useEffect(() => {
    if (msRegenStartedAt) {
      msRegenTimerRef.current = setInterval(() => {
        setMsRegenElapsed(Math.floor((Date.now() - msRegenStartedAt) / 1000));
      }, 1000);
    }
    return () => { if (msRegenTimerRef.current) clearInterval(msRegenTimerRef.current); };
  }, [msRegenStartedAt]);

  useEffect(() => {
    if (regeneratingType && (
      (regeneratingType === 'video' && videoUrl && videoUrl !== prevVideoUrl.current) ||
      (regeneratingType === 'image' && imageUrl && imageUrl !== prevImageUrl.current)
    )) {
      setRegeneratingType(null);
      setRegenStartedAt(null);
      setRegenElapsed(0);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      toast({ title: regeneratingType === 'video' ? "Video Ready" : "Image Ready", description: "Your new asset has been generated." });
    }
    prevVideoUrl.current = videoUrl;
    prevImageUrl.current = imageUrl;
  }, [videoUrl, imageUrl, regeneratingType]);

  useEffect(() => {
    if (regenStartedAt) {
      timerIntervalRef.current = setInterval(() => {
        setRegenElapsed(Math.floor((Date.now() - regenStartedAt) / 1000));
      }, 1000);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [regenStartedAt]);

  useEffect(() => {
    if (regeneratingType) {
      pollIntervalRef.current = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      }, 5000);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [regeneratingType, projectId, queryClient]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const newPrompt = scene.assets?.prompt || scene.visualDirection || "";
    if (!isEditingPrompt) {
      setInlinePrompt(newPrompt);
    }
  }, [scene.assets?.prompt, scene.visualDirection, sceneId]);
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

  const rawProvider = scene.assets?.videoProvider || scene.assets?.imageProvider || null;
  const providerUsed = rawProvider && !['t2i', 't2v', 'i2v', 'auto'].includes(rawProvider.toLowerCase()) ? rawProvider : null;
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

  const persistReferenceImages = async (images: string[]) => {
    try {
      await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ referenceImages: images }),
      });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    } catch (err) {
      console.error("[RefImages] Failed to persist reference images:", err);
    }
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
      const activeMode = generationMode === "auto"
        ? (referenceImageUrls.length > 0 ? "i2i" : "t2i")
        : generationMode;
      const sourceImage = referenceImageUrls.length > 0 ? referenceImageUrls[0] : imageUrl;
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/regenerate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          prompt: inlinePrompt || editValues.visualDirection,
          generationMode: activeMode,
          sourceImageUrl: activeMode === "i2i" ? sourceImage : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to regenerate image");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setRegeneratingType('image');
      setRegenStartedAt(Date.now());
      setRegenElapsed(0);
      toast({ title: "Image Regenerating", description: "New image is being generated for this scene." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const regenVideoMutation = useMutation({
    mutationFn: async () => {
      const activeMode = generationMode === "auto"
        ? (referenceImageUrls.length > 0 ? "i2v" : "t2v")
        : generationMode;
      const sourceImage = referenceImageUrls.length > 0 ? referenceImageUrls[0] : imageUrl;
      const useSourceImage = activeMode === "i2v" || activeMode === "i2i";
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/regenerate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          query: inlinePrompt || editValues.visualDirection,
          provider: provider === "auto" ? undefined : provider,
          sourceImageUrl: useSourceImage ? sourceImage : undefined,
          generationMode: activeMode,
        }),
      });
      if (!res.ok) throw new Error("Failed to regenerate video");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setRegeneratingType('video');
      setRegenStartedAt(Date.now());
      setRegenElapsed(0);
      toast({ title: "Video Regenerating", description: "New video is being generated. This may take 1-3 minutes." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveMicroSceneDirection = async (msIdx: number, newDirection: string) => {
    const updatedMicroScenes = [...(scene.microScenes || [])];
    updatedMicroScenes[msIdx] = { ...updatedMicroScenes[msIdx], visualDirection: newDirection };
    try {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ microScenes: updatedMicroScenes }),
      });
      if (!res.ok) throw new Error("Failed to save");
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setEditingMicroScene(null);
      toast({ title: "Micro-scene updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const regenMicroSceneVideo = async (msIdx: number, opts?: { query?: string; provider?: string; generationMode?: string; sourceImageUrl?: string }) => {
    setRegeneratingMicroScene(msIdx);
    setMsRegenStartedAt(Date.now());
    setMsRegenElapsed(0);
    try {
      const selectedProvider = opts?.provider || (provider === "auto" ? undefined : provider);
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/micro-scene/${msIdx}/regenerate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: selectedProvider,
          query: opts?.query,
          generationMode: opts?.generationMode,
          sourceImageUrl: opts?.sourceImageUrl,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to regenerate micro-scene video");
      }
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Micro-scene video regenerating", description: "This may take 1-3 minutes." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setRegeneratingMicroScene(null);
      setMsRegenStartedAt(null);
      setMsRegenElapsed(0);
    }
  };

  const handleMsModalRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", credentials: "include", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      if (data.url) {
        setMsModalRefImages(prev => [...prev, data.url]);
        toast({ title: "Reference image added" });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

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
        const newImages = [...referenceImageUrls, url];
        setReferenceImageUrls(newImages);
        persistReferenceImages(newImages);
        toast({ title: "Reference Image Added", description: "Image will be used for I2V video generation." });
      }
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    }
    if (refFileInputRef.current) refFileInputRef.current.value = "";
  };

  const saveChanges = () => {
    updateSceneMutation.mutate(editValues);
    if (editValues.visualDirection) {
      setInlinePrompt(editValues.visualDirection);
    }
  };

  const isRegenerating = regenImageMutation.isPending || regenVideoMutation.isPending || !!regeneratingType;

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
          {isRegenerating ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/25 text-purple-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> {regeneratingType === 'video' ? 'Generating Video...' : regeneratingType === 'image' ? 'Generating Image...' : 'Submitting...'}
            </span>
          ) : assetReady ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Ready
            </span>
          ) : null}
        </div>

        {/* Video/Image Preview */}
        <div className="rounded-xl overflow-hidden border relative" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.3)" }}>
          {regeneratingType && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="relative mb-4">
                <div className="w-16 h-16 rounded-full border-3 border-purple-500/30 border-t-purple-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  {regeneratingType === 'video' ? (
                    <Video className="w-6 h-6 text-purple-400" />
                  ) : (
                    <Image className="w-6 h-6 text-purple-400" />
                  )}
                </div>
              </div>
              <p className="text-sm font-medium text-white mb-1">
                {regeneratingType === 'video' ? 'Generating New Video...' : 'Generating New Image...'}
              </p>
              <p className="text-xs text-white/60 mb-3">
                {regeneratingType === 'video' ? 'This typically takes 1-3 minutes' : 'This typically takes 15-30 seconds'}
              </p>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10">
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-xs text-white/80 font-mono">
                  {Math.floor(regenElapsed / 60)}:{(regenElapsed % 60).toString().padStart(2, '0')} elapsed
                </span>
              </div>
            </div>
          )}
          {hasVideo ? (
            <div className="relative">
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full aspect-video object-contain bg-black"
                playsInline
                preload="auto"
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
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Prompt</p>
                {!isEditingPrompt && (
                  <button
                    onClick={() => setIsEditingPrompt(true)}
                    className="p-0.5 rounded hover:bg-purple-500/10 transition-colors"
                    title="Edit prompt"
                  >
                    <Edit2 className="w-2.5 h-2.5" style={{ color: "var(--text-muted)" }} />
                  </button>
                )}
              </div>
              {isEditingPrompt ? (
                <div className="mt-1 space-y-1.5">
                  <textarea
                    value={inlinePrompt}
                    onChange={(e) => setInlinePrompt(e.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full text-xs rounded-lg border px-2 py-1.5 bg-transparent outline-none resize-none"
                    style={{
                      borderColor: "rgba(124,58,237,0.3)",
                      color: "var(--text-primary)",
                      backgroundColor: "rgba(124,58,237,0.05)",
                    }}
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => {
                        setEditValues((prev) => ({ ...prev, visualDirection: inlinePrompt }));
                        updateSceneMutation.mutate({ visualDirection: inlinePrompt });
                        setIsEditingPrompt(false);
                      }}
                      disabled={updateSceneMutation.isPending}
                      className="text-[10px] px-2 py-1 rounded bg-purple-600 text-white font-medium flex items-center gap-1 hover:bg-purple-500 disabled:opacity-50 transition-colors"
                    >
                      {updateSceneMutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Save className="w-2.5 h-2.5" />}
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setInlinePrompt(promptUsed);
                        setIsEditingPrompt(false);
                      }}
                      className="text-[10px] px-2 py-1 rounded border transition-colors"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  className="text-xs mt-0.5 line-clamp-2 cursor-pointer hover:text-purple-400 transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => setIsEditingPrompt(true)}
                  title="Click to edit prompt"
                >
                  {inlinePrompt || promptUsed || "No prompt set — click to add"}
                </p>
              )}
            </div>
          </div>

          {/* Reference Images */}
          <div>
            <p className="text-[11px] font-medium flex items-center gap-1 mb-1" style={{ color: "var(--text-secondary)" }}>
              <Image className="w-3 h-3" /> Reference Images
            </p>
            <p className="text-[10px] mb-1.5" style={{ color: "var(--text-muted)" }}>For I2V (image-to-video)</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {imageUrl && (
                <div className="relative w-10 h-10 rounded-md overflow-hidden border group" style={{ borderColor: "var(--border-subtle)" }}>
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => {
                      updateSceneMutation.mutate({ clearImage: true });
                    }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove reference image"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              {referenceImageUrls.map((url, i) => (
                <div key={i} className="relative w-10 h-10 rounded-md overflow-hidden border group" style={{ borderColor: "rgba(124,58,237,0.3)" }}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => {
                      const newImages = referenceImageUrls.filter((_, idx) => idx !== i);
                      setReferenceImageUrls(newImages);
                      persistReferenceImages(newImages);
                    }}
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
                            const newImages = [...referenceImageUrls, url];
                            setReferenceImageUrls(newImages);
                            persistReferenceImages(newImages);
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

          {/* Provider + Mode Selectors + Regenerate */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <div>
                <p className="text-[11px] font-medium mb-1 text-right" style={{ color: "var(--text-secondary)" }}>Mode</p>
                <select
                  value={generationMode}
                  onChange={(e) => setGenerationMode(e.target.value)}
                  className="text-xs rounded-lg border px-2 py-1.5 bg-transparent outline-none w-24"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                >
                  {GENERATION_MODES.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[11px] font-medium mb-1 text-right" style={{ color: "var(--text-secondary)" }}>Provider</p>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="text-xs rounded-lg border px-2 py-1.5 bg-transparent outline-none w-44"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                >
                  {VIDEO_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[10px] text-right max-w-[280px]" style={{ color: (() => {
              const activeMode = generationMode === "auto"
                ? (referenceImageUrls.length > 0 ? "i2v" : "t2v")
                : generationMode;
              return activeMode === "i2v" || activeMode === "i2i" ? "rgb(124,58,237)" : "var(--text-muted)";
            })() }}>
              {(() => {
                const activeMode = generationMode === "auto"
                  ? (referenceImageUrls.length > 0 ? "i2v" : "t2v")
                  : generationMode;
                const modeInfo = GENERATION_MODES.find(m => m.id === activeMode);
                return modeInfo?.description || "Select a generation mode";
              })()}
            </p>
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
                className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 disabled:opacity-50 transition-colors ${
                  regeneratingType ? 'bg-purple-600/60 text-white/80' : 'bg-purple-600 text-white hover:bg-purple-500'
                }`}
              >
                {(regenVideoMutation.isPending || regeneratingType === 'video') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {regeneratingType === 'video' ? 'Generating...' : regeneratingType === 'image' ? 'Working...' : 'Regenerate'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Divider between video controls and overlays */}
      <div className="border-t mt-4 pt-4" style={{ borderColor: "var(--border-subtle)" }} />

      {/* Scene Overlays Section */}
      <SceneOverlayEditor
        overlays={sceneOverlays}
        onChange={handleOverlayChange}
        previewWidth={(() => {
          const parts = aspectRatio.split(":");
          return parseInt(parts[0]) || 16;
        })()}
        previewHeight={(() => {
          const parts = aspectRatio.split(":");
          return parseInt(parts[1]) || 9;
        })()}
        backgroundUrl={hasVideo ? videoUrl : hasImage ? imageUrl : undefined}
        backgroundType={hasVideo ? "video" : hasImage ? "image" : undefined}
      />

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

        {/* Micro-Scenes */}
        {scene.microScenes && scene.microScenes.length > 1 && (
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
              Micro-Scenes
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25">
                {scene.microScenes.length}
              </span>
            </label>

            <div className="flex items-center gap-1 mb-3 rounded-lg p-2" style={{ backgroundColor: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.15)" }}>
              <div className="flex w-full gap-0.5">
                {scene.microScenes.map((ms: any, msIdx: number) => {
                  const totalDuration = scene.microScenes.reduce((sum: number, m: any) => sum + (m.duration || 0), 0) || 1;
                  const widthPct = ((ms.duration || 0) / totalDuration) * 100;
                  return (
                    <div
                      key={ms.id || msIdx}
                      className="relative rounded-md overflow-hidden flex items-center justify-center"
                      style={{
                        width: `${Math.max(widthPct, 10)}%`,
                        height: "24px",
                        backgroundColor: ms.videoUrl ? "rgba(34,197,94,0.2)" : "rgba(124,58,237,0.15)",
                        border: ms.videoUrl ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(124,58,237,0.25)",
                      }}
                    >
                      <span className="text-[9px] font-medium" style={{ color: ms.videoUrl ? "rgb(134,239,172)" : "rgb(192,132,252)" }}>
                        {msIdx + 1} · {ms.duration != null ? `${ms.duration}s` : '?'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {sceneOverlays.length > 0 && (
              <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-md text-[10px]" style={{ backgroundColor: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "rgb(252,211,77)" }}>
                <Maximize2 className="w-3 h-3 flex-shrink-0" />
                Scene overlay active — overlays span all micro-scenes during render
              </div>
            )}

            <div className="space-y-1.5">
              {scene.microScenes.map((ms: any, msIdx: number) => {
                const isExpanded = expandedMicroScene === msIdx;
                return (
                  <div
                    key={ms.id || msIdx}
                    className="rounded-xl border overflow-hidden transition-all duration-200"
                    style={{ borderColor: isExpanded ? "rgba(124,58,237,0.3)" : "var(--border-subtle)", backgroundColor: "rgba(124,58,237,0.03)" }}
                  >
                    <button
                      onClick={() => setExpandedMicroScene(isExpanded ? null : msIdx)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-purple-500/05"
                    >
                      <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: ms.videoUrl ? "rgba(34,197,94,0.2)" : "rgba(124,58,237,0.2)", color: ms.videoUrl ? "rgb(134,239,172)" : "rgb(192,132,252)", border: ms.videoUrl ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(124,58,237,0.3)" }}>
                        {msIdx + 1}
                      </span>
                      {ms.videoUrl && (
                        <div className="w-10 h-7 rounded overflow-hidden flex-shrink-0 border" style={{ borderColor: "var(--border-subtle)" }}>
                          <video src={ms.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
                        </div>
                      )}
                      <p className="text-xs truncate flex-1" style={{ color: "var(--text-primary)" }}>
                        {ms.narration}
                      </p>
                      {(ms.originalAudioVolume || 0) > 0 && (
                        <Volume2 className="w-3 h-3 flex-shrink-0 text-blue-400" title="Native audio enabled" />
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: "rgba(124,58,237,0.1)", color: "rgb(192,132,252)" }}>
                        {ms.duration != null ? `${ms.duration}s` : '—'}
                      </span>
                      {regeneratingMicroScene === msIdx ? (
                        <Loader2 className="w-3.5 h-3.5 flex-shrink-0 text-purple-400 animate-spin" />
                      ) : ms.videoUrl ? (
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-green-400" />
                      ) : (
                        <span className="w-3.5 h-3.5 flex-shrink-0 rounded-full border border-yellow-500/40" />
                      )}
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 space-y-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                          "{ms.narration}"
                        </p>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Visual Direction</span>
                            {editingMicroScene !== msIdx && (
                              <button
                                onClick={() => { setEditingMicroScene(msIdx); setMicroSceneEditValue(ms.visualDirection || ""); }}
                                className="text-[10px] px-1.5 py-0.5 rounded hover:bg-purple-500/10 transition-colors flex items-center gap-1"
                                style={{ color: "rgb(192,132,252)" }}
                              >
                                <Edit2 className="w-2.5 h-2.5" /> Edit
                              </button>
                            )}
                          </div>
                          {editingMicroScene === msIdx ? (
                            <div className="space-y-2">
                              <textarea
                                value={microSceneEditValue}
                                onChange={(e) => setMicroSceneEditValue(e.target.value)}
                                className="w-full text-xs rounded-lg border p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500"
                                style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", minHeight: "60px" }}
                                rows={2}
                              />
                              <div className="flex gap-1.5 justify-end">
                                <button
                                  onClick={() => setEditingMicroScene(null)}
                                  className="text-[10px] px-2.5 py-1 rounded-md border transition-colors"
                                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => saveMicroSceneDirection(msIdx, microSceneEditValue)}
                                  className="text-[10px] px-2.5 py-1 rounded-md bg-purple-600 text-white font-medium flex items-center gap-1 hover:bg-purple-500 transition-colors"
                                >
                                  <Save className="w-2.5 h-2.5" /> Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                              {ms.visualDirection}
                            </p>
                          )}
                        </div>

                        {ms.videoUrl ? (
                          <div className="relative group">
                            <video
                              src={ms.videoUrl}
                              className="w-full rounded-lg"
                              style={{ maxHeight: '180px', objectFit: 'cover' }}
                              muted
                              playsInline
                              preload="metadata"
                              onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                              onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                            />
                            <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setFullscreenMicroScene(msIdx)}
                                className="text-[10px] px-2 py-1.5 rounded-lg bg-black/70 text-white font-medium flex items-center gap-1 hover:bg-black/90 backdrop-blur-sm"
                              >
                                <Expand className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => regenMicroSceneVideo(msIdx)}
                                disabled={regeneratingMicroScene === msIdx}
                                className="text-[10px] px-2 py-1.5 rounded-lg bg-black/70 text-white font-medium flex items-center gap-1 hover:bg-black/90 disabled:opacity-50 backdrop-blur-sm"
                              >
                                {regeneratingMicroScene === msIdx ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                Regen
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => regenMicroSceneVideo(msIdx)}
                            disabled={regeneratingMicroScene === msIdx}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed transition-colors hover:border-purple-500/40 hover:bg-purple-500/05 disabled:opacity-50"
                            style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                          >
                            {regeneratingMicroScene === msIdx ? (
                              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> <span className="text-xs">Generating...</span></>
                            ) : (
                              <><Video className="w-3.5 h-3.5" /> <span className="text-xs">Generate Video</span></>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {fullscreenMicroScene !== null && scene.microScenes[fullscreenMicroScene] && (() => {
              const fsMs = scene.microScenes[fullscreenMicroScene];
              const msActiveMode = msModalMode === "auto" ? (msModalRefImages.length > 0 ? "i2v" : "t2v") : msModalMode;
              const msModeInfo = GENERATION_MODES.find(m => m.id === msActiveMode);
              return (
                <div
                  className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto py-8"
                  style={{ backgroundColor: "rgba(0,0,0,0.9)", backdropFilter: "blur(12px)" }}
                  onClick={() => setFullscreenMicroScene(null)}
                >
                  <div
                    className="relative w-full max-w-4xl mx-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {fullscreenMicroScene + 1}
                        </span>
                        <span className="text-sm font-medium text-white">Micro-Scene {fullscreenMicroScene + 1}</span>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300">
                          {fsMs.duration != null ? `${fsMs.duration}s` : ''}
                        </span>
                        {regeneratingMicroScene === fullscreenMicroScene ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25 flex items-center gap-1">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Generating...
                          </span>
                        ) : fsMs.videoUrl ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Ready
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400/70 border border-yellow-500/20">No Video</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {fullscreenMicroScene > 0 && (
                            <button onClick={() => setFullscreenMicroScene(fullscreenMicroScene - 1)} className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">Prev</button>
                          )}
                          {fullscreenMicroScene < scene.microScenes.length - 1 && (
                            <button onClick={() => setFullscreenMicroScene(fullscreenMicroScene + 1)} className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">Next</button>
                          )}
                        </div>
                        <button onClick={() => setFullscreenMicroScene(null)} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {fsMs.videoUrl ? (
                      <video src={fsMs.videoUrl} className="w-full rounded-xl" style={{ maxHeight: '60vh' }} controls autoPlay playsInline />
                    ) : (
                      <div className="w-full rounded-xl flex items-center justify-center py-20" style={{ backgroundColor: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)" }}>
                        <div className="text-center">
                          <Video className="w-8 h-8 mx-auto mb-2 text-purple-400/50" />
                          <span className="text-sm text-white/40">No video generated yet</span>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="text-sm leading-relaxed text-white/90 mb-3">"{fsMs.narration}"</p>

                      <div className="grid grid-cols-[1fr_auto] gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[11px] font-medium text-white/50">Prompt</span>
                            {!msModalEditingPrompt && (
                              <button onClick={() => setMsModalEditingPrompt(true)} className="p-0.5 rounded hover:bg-purple-500/10 transition-colors">
                                <Edit2 className="w-2.5 h-2.5 text-white/40" />
                              </button>
                            )}
                          </div>
                          {msModalEditingPrompt ? (
                            <div className="space-y-1.5">
                              <textarea
                                value={msModalPrompt}
                                onChange={(e) => setMsModalPrompt(e.target.value)}
                                rows={3}
                                autoFocus
                                className="w-full text-xs rounded-lg border px-2.5 py-2 outline-none resize-none"
                                style={{ borderColor: "rgba(124,58,237,0.3)", color: "white", backgroundColor: "rgba(124,58,237,0.08)" }}
                              />
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => { saveMicroSceneDirection(fullscreenMicroScene, msModalPrompt); setMsModalEditingPrompt(false); }}
                                  className="text-[10px] px-2.5 py-1 rounded-md bg-purple-600 text-white font-medium flex items-center gap-1 hover:bg-purple-500 transition-colors"
                                >
                                  <Save className="w-2.5 h-2.5" /> Save
                                </button>
                                <button
                                  onClick={() => { setMsModalPrompt(fsMs.visualDirection || ""); setMsModalEditingPrompt(false); }}
                                  className="text-[10px] px-2.5 py-1 rounded-md bg-white/10 text-white/70 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs leading-relaxed text-white/60 cursor-pointer hover:text-purple-300 transition-colors" onClick={() => setMsModalEditingPrompt(true)}>
                              {msModalPrompt || "No prompt — click to add"}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <div className="flex gap-2">
                            <div>
                              <span className="text-[11px] font-medium text-white/50 block mb-1 text-right">Mode</span>
                              <select value={msModalMode} onChange={(e) => setMsModalMode(e.target.value)} className="text-xs rounded-lg border px-2 py-1.5 bg-transparent outline-none w-24" style={{ borderColor: "rgba(255,255,255,0.15)", color: "white" }}>
                                {GENERATION_MODES.map((m) => (<option key={m.id} value={m.id} style={{ backgroundColor: "#1a1a2e" }}>{m.label}</option>))}
                              </select>
                            </div>
                            <div>
                              <span className="text-[11px] font-medium text-white/50 block mb-1 text-right">Provider</span>
                              <select value={msModalProvider} onChange={(e) => setMsModalProvider(e.target.value)} className="text-xs rounded-lg border px-2 py-1.5 bg-transparent outline-none w-44" style={{ borderColor: "rgba(255,255,255,0.15)", color: "white" }}>
                                {VIDEO_PROVIDERS.map((p) => (<option key={p.id} value={p.id} style={{ backgroundColor: "#1a1a2e" }}>{p.label}</option>))}
                              </select>
                            </div>
                          </div>
                          <span className="text-[10px] text-right max-w-[260px]" style={{ color: msActiveMode === "i2v" || msActiveMode === "i2i" ? "rgb(192,132,252)" : "rgba(255,255,255,0.4)" }}>
                            {msModeInfo?.description || "Select a generation mode"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-medium text-white/50 flex items-center gap-1">
                            <Image className="w-3 h-3" /> Reference Images
                            <span className="text-[10px] text-white/30">For I2V (image-to-video)</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {msModalRefImages.map((url, i) => (
                            <div key={i} className="relative w-10 h-10 rounded-md overflow-hidden border group" style={{ borderColor: "rgba(124,58,237,0.3)" }}>
                              <img src={url} alt="" className="w-full h-full object-cover" />
                              <button onClick={() => setMsModalRefImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                          <input type="file" ref={msModalFileRef} className="hidden" accept="image/*" onChange={handleMsModalRefUpload} />
                          <button onClick={() => msModalFileRef.current?.click()} className="w-10 h-10 rounded-md border border-dashed flex items-center justify-center transition-colors hover:border-purple-500/40" style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)" }} title="Upload reference">
                            <Upload className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setMsModalShowLibrary(!msModalShowLibrary)} className="w-10 h-10 rounded-md border border-dashed flex items-center justify-center transition-colors hover:border-purple-500/40" style={{ borderColor: msModalShowLibrary ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.15)", color: msModalShowLibrary ? "rgb(124,58,237)" : "rgba(255,255,255,0.4)" }} title="Browse library">
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {msModalShowLibrary && (
                          <div className="border rounded-lg p-2 mt-2 max-h-32 overflow-y-auto" style={{ borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(0,0,0,0.3)" }}>
                            {libraryQuery.isLoading ? (
                              <div className="flex items-center justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-white/40" /></div>
                            ) : !libraryQuery.data || libraryQuery.data.length === 0 ? (
                              <p className="text-xs text-center py-3 text-white/30">No images in library</p>
                            ) : (
                              <div className="grid grid-cols-8 gap-1.5">
                                {libraryQuery.data.slice(0, 24).map((asset: any) => (
                                  <button key={asset.id} onClick={() => { const url = asset.url || asset.thumbnailUrl; if (url) { setMsModalRefImages(prev => [...prev, url]); setMsModalShowLibrary(false); toast({ title: "Reference Added" }); } }} className="aspect-square rounded overflow-hidden border hover:border-purple-500/50 transition-colors" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                                    <img src={asset.url || asset.thumbnailUrl} alt={asset.name || ""} className="w-full h-full object-cover" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-medium text-white/50 flex items-center gap-1.5">
                            {(fsMs.originalAudioVolume || 0) > 0 ? <Volume2 className="w-3 h-3 text-blue-400" /> : <VolumeX className="w-3 h-3" />}
                            Original Audio
                          </span>
                        </div>
                        <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="text-xs text-white/80">Include native video audio</span>
                              <p className="text-[10px] text-white/30 mt-0.5">Fade in the AI-generated audio from this clip during rendering</p>
                            </div>
                            <button
                              onClick={async () => {
                                const currentVol = fsMs.originalAudioVolume || 0;
                                const newVol = currentVol > 0 ? 0 : 0.4;
                                const updatedMicroScenes = [...(scene.microScenes || [])];
                                updatedMicroScenes[fullscreenMicroScene] = { ...updatedMicroScenes[fullscreenMicroScene], originalAudioVolume: newVol };
                                try {
                                  const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
                                    method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
                                    body: JSON.stringify({ microScenes: updatedMicroScenes }),
                                  });
                                  if (!res.ok) throw new Error("Failed to save");
                                  queryClient.invalidateQueries({ queryKey: ["project", projectId] });
                                  toast({ title: newVol > 0 ? "Native audio enabled" : "Native audio disabled" });
                                } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
                              }}
                              className={`relative w-9 h-5 rounded-full transition-colors ${(fsMs.originalAudioVolume || 0) > 0 ? 'bg-blue-500' : 'bg-white/20'}`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${(fsMs.originalAudioVolume || 0) > 0 ? 'left-[18px]' : 'left-0.5'}`} />
                            </button>
                          </div>
                          {(fsMs.originalAudioVolume || 0) > 0 && (
                            <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(59,130,246,0.1)" }}>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] text-white/40 w-12">Volume</span>
                                <input
                                  type="range" min="0" max="100" step="5"
                                  value={Math.round((fsMs.originalAudioVolume || 0.4) * 100)}
                                  onChange={async (e) => {
                                    const newVol = parseInt(e.target.value) / 100;
                                    const updatedMicroScenes = [...(scene.microScenes || [])];
                                    updatedMicroScenes[fullscreenMicroScene] = { ...updatedMicroScenes[fullscreenMicroScene], originalAudioVolume: newVol };
                                    try {
                                      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
                                        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
                                        body: JSON.stringify({ microScenes: updatedMicroScenes }),
                                      });
                                      if (!res.ok) throw new Error("Failed to save");
                                      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
                                    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
                                  }}
                                  className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
                                  style={{ background: `linear-gradient(to right, rgb(59,130,246) ${Math.round((fsMs.originalAudioVolume || 0.4) * 100)}%, rgba(255,255,255,0.15) ${Math.round((fsMs.originalAudioVolume || 0.4) * 100)}%)` }}
                                />
                                <span className="text-[10px] text-blue-300 w-8 text-right font-mono">{Math.round((fsMs.originalAudioVolume || 0.4) * 100)}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        {regeneratingMicroScene === fullscreenMicroScene && msRegenStartedAt && (
                          <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)" }}>
                            <div className="flex items-center gap-2 mb-2">
                              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                              <span className="text-xs font-medium text-purple-300">Generating new video...</span>
                              <span className="text-[10px] text-white/40 ml-auto">
                                {Math.floor(msRegenElapsed / 60)}:{(msRegenElapsed % 60).toString().padStart(2, '0')}
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(124,58,237,0.2)" }}>
                              <div
                                className="h-full rounded-full transition-all duration-1000"
                                style={{
                                  width: `${Math.min(95, (msRegenElapsed / 120) * 100)}%`,
                                  background: "linear-gradient(90deg, rgb(124,58,237), rgb(168,85,247))",
                                }}
                              />
                            </div>
                            <p className="text-[10px] text-white/30 mt-1.5">
                              Video generation typically takes 1-3 minutes. The video will appear automatically when ready.
                            </p>
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              regenMicroSceneVideo(fullscreenMicroScene, {
                                query: msModalPrompt || undefined,
                                provider: msModalProvider === "auto" ? undefined : msModalProvider,
                                generationMode: msModalMode === "auto" ? undefined : msModalMode,
                                sourceImageUrl: msModalRefImages.length > 0 ? msModalRefImages[0] : undefined,
                              });
                            }}
                            disabled={regeneratingMicroScene === fullscreenMicroScene}
                            className={`text-xs px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                              regeneratingMicroScene === fullscreenMicroScene
                                ? 'bg-purple-600/50 text-white/70 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-500 text-white'
                            }`}
                          >
                            {regeneratingMicroScene === fullscreenMicroScene ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            {regeneratingMicroScene === fullscreenMicroScene ? 'Generating...' : 'Regenerate Video'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

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
