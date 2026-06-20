import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Settings, Play, RefreshCw, Clock, Target, Monitor, BarChart3, Loader2, AlertCircle, AlertTriangle, Zap, Video, Image, Image as ImageIcon, Download, RotateCcw, Save, Trash2, ExternalLink, CheckCircle2, XCircle, X, Type, Film, ChevronDown, ChevronUp, CloudUpload, Mic, Music, Volume2, Palette, Shuffle, Sliders, Wand2, Sparkles, ImagePlus, Upload, Edit2, FileText, Plus, GripVertical, Eye, EyeOff, Layers, Maximize2, BookOpen, GripHorizontal, Star, Info } from "lucide-react";
import { getVisualArtPreset, getAllVisualArtPresets } from "@shared/config/visual-art-presets";
import { SCENE_CONTENT_TAGS } from "@shared/config/scene-content-tags";
// Task #111: shared NB2 price source — same helper the server's estimator
// uses, so the live cost preview never drifts from the PiAPI invoice.
import { getNB2CostPerImage } from "@shared/nb2-pricing";
import { Button } from "@/components/ui/button";
import { ProviderCatalogSelector } from "@/components/video/provider-catalog-selector";
import { SlotTile } from "@/components/video/scene-routing-ui";
import { VIDEO_PROVIDERS as PROVIDER_CONFIG, type VideoProvider } from "@shared/provider-config";
import type { BrandSettings, BrandReferenceInput, Scene } from "@shared/video-types";

// Normalize the loosely-typed `project.brand` blob (the project shape is
// `any` because it is hydrated from a generic JSON API) into a typed
// BrandSettings object suitable for the overlay editor and renderers.
// Returns undefined if the brand kit is missing or malformed.
function normalizeProjectBrand(project: any): BrandSettings | undefined {
  const brand = project?.brand;
  if (!brand || typeof brand !== 'object') return undefined;
  const colors = brand.colors;
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) return undefined;
  return brand as BrandSettings;
}
import { useToast } from "@/hooks/use-toast";
import { ProjectSceneDefaultsSection } from "@/components/video/project-scene-defaults-section";
import { EnhancedSceneEditor } from "@/components/video/enhanced-scene-editor";
import { DeckSlideOverview } from "@/components/video/deck-slide-overview";
import { SceneOverlayEditor, SceneOverlayItem } from "@/components/video/scene-overlay-editor";
import { SceneImageActions } from "@/components/video/scene-image-actions";
import { S3BackgroundPicker } from "@/components/video/S3BackgroundPicker";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EndCardPreview } from "@/components/video/EndCardPreview";
import { AskSuzziePanel } from "@/components/video/ask-suzzie-panel";
import { AssetSuzzieChat } from "@/components/video/AssetSuzzieChat";
import { CanvaSyncCard } from "@/components/canva/CanvaSyncCard";
// Task #119: project-header render-type histogram + per-scene badge.
// `RenderTypeHistogram` shows the count of each render system across
// the current project's scenes (with a built-in "Reclassify all" button
// that calls POST /classify-scenes); `RenderTypeBadge` is reused inside
// each scene-list card so the model assignment is visible without
// opening the editor.
import {
  RenderTypeHistogram,
  RenderTypeBadge,
  ReRenderUpgradedScenesButton,
} from "@/components/video/render-type-badge";

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

function computeJobEtaSeconds(job: any, progressPct: number | null): number | null {
  if (progressPct == null || progressPct < 5 || progressPct >= 100) return null;
  const startRaw = job?.startedAt || job?.createdAt;
  if (!startRaw) return null;
  const startMs = new Date(startRaw).getTime();
  if (!Number.isFinite(startMs) || startMs <= 0) return null;
  const elapsedMs = Date.now() - startMs;
  if (elapsedMs <= 0) return null;
  const totalMs = elapsedMs / (progressPct / 100);
  const remainingMs = totalMs - elapsedMs;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  return Math.round(remainingMs / 1000);
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${seconds}s left`;
  const mins = Math.round(seconds / 60);
  return `~${mins}m left`;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "Unknown";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatProviderName(raw: string): string {
  if (!raw) return raw;
  const mappings: [string, string][] = [
    ['fal.ai flux-pro/v1.1', 'Flux Pro'],
    ['fal.ai/flux-pro (content)', 'Flux Pro'],
    ['fal.ai/flux-pro', 'Flux Pro'],
    ['fal.ai flux/dev', 'Flux Dev'],
    ['fal.ai flux/schnell', 'Flux Schnell'],
    ['gpt-image-1 (text-heavy)', 'GPT-Image-1'],
    ['gpt-image-1', 'GPT-Image-1'],
    ['piapi-flux', 'Flux (PiAPI)'],
    ['huggingface', 'HuggingFace'],
    ['ai-background', 'AI Background'],
    ['stock', 'Stock'],
    ['i2i', 'Image-to-Image'],
    ['midjourney', 'Midjourney'],
    ['fal.ai', 'Flux (fal.ai)'],
  ];
  const lower = raw.toLowerCase();
  for (const [key, label] of mappings) {
    if (lower === key.toLowerCase() || lower.startsWith(key.toLowerCase())) return label;
  }
  return raw.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
  const [suzzieProviderRationale, setSuzzieProviderRationale] = useState<string | undefined>(undefined);
  const [uploadingSceneId, setUploadingSceneId] = useState<string | null>(null);
  const [librarySceneId, setLibrarySceneId] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState(project.voiceoverSettings?.voiceId || project.voiceId || "");
  const [referenceImages, setReferenceImages] = useState<string[]>(() => {
    const existing = (project as any).referenceImages || (project as any).assets?.referenceImages || [];
    const productMedia = (project as any).assets?.productMediaUrl;
    if (productMedia && !existing.includes(productMedia)) {
      return [productMedia, ...existing];
    }
    return existing;
  });
  const [showRefLibrary, setShowRefLibrary] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [seamlessTransitions, setSeamlessTransitions] = useState<boolean>(
    Boolean((project as any).seamlessTransitions)
  );
  // Sync from server when project payload refreshes
  useEffect(() => {
    setSeamlessTransitions(Boolean((project as any).seamlessTransitions));
  }, [(project as any).seamlessTransitions]);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
  // Phase 44: Creative brief — visual style rationale
  const [briefRationale, setBriefRationale] = useState<string>(((project as any).visualStyleRationale) || "");
  const [editingRationale, setEditingRationale] = useState(false);
  useEffect(() => {
    setBriefRationale(((project as any).visualStyleRationale) || "");
  }, [(project as any).visualStyleRationale]);
  const saveRationaleMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/visual-style-rationale`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ visualStyleRationale: value }),
      });
      if (!res.ok) throw new Error("Failed to save style rationale");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setEditingRationale(false);
      toast({ title: "Brief saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
  const [projectCharacters, setProjectCharacters] = useState<any[]>(project.characters || []);
  useEffect(() => {
    if (project.characters) setProjectCharacters(project.characters);
  }, [project.characters]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const activeSceneRef = useRef<string | null>(null);
  const [generationTriggered, setGenerationTriggered] = useState(false);

  const progress = project.progress || {};
  const serverIsGenerating = ["generating", "queued", "processing"].includes(project.status);
  const isGenerating = serverIsGenerating || generationTriggered;

  useEffect(() => {
    if (serverIsGenerating) {
      setGenerationTriggered(false);
    }
  }, [serverIsGenerating]);

  useEffect(() => {
    if (!generationTriggered) return;
    const timeout = setTimeout(() => setGenerationTriggered(false), 15000);
    return () => clearTimeout(timeout);
  }, [generationTriggered]);

  // ──────────────────────────────────────────────────────────────
  // Seamless Transitions auto-trigger
  // When parallel generation finishes AND the user enabled the toggle,
  // automatically fire cinematic-flow-regenerate to chain scenes together.
  // Idempotency: we set seamlessAutoFiredRef so a single generation run
  // only triggers continuity once (resets when generation restarts).
  // ──────────────────────────────────────────────────────────────
  const prevIsGeneratingRef = useRef<boolean>(false);
  const seamlessAutoFiredRef = useRef<boolean>(false);

  // Cinematic-flow status polling — drives the cancel UI
  const cinematicFlowQuery = useQuery({
    queryKey: ["cinematic-flow-status", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/universal-video/${projectId}/cinematic-flow-regenerate/status`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: (q) => {
      const data: any = q.state.data;
      return data?.status === "running" ? 3000 : false;
    },
    refetchIntervalInBackground: false,
  });
  const cinematicFlowStatus = cinematicFlowQuery.data as any;
  const cinematicFlowRunning = cinematicFlowStatus?.status === "running";
  const cinematicFlowCancelPending = cinematicFlowRunning && !!cinematicFlowStatus?.cancelRequested;

  const cancelCinematicFlowMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/universal-video/${projectId}/cinematic-flow-regenerate/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to cancel");
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Cancellation requested",
        description: "The seamless transitions flow will stop after the current step.",
      });
      cinematicFlowQuery.refetch();
    },
    onError: (err: Error) => {
      toast({ title: "Could not cancel", description: err.message, variant: "destructive" });
    },
  });

  // Kick the status query when seamless transitions auto-fires so polling starts
  useEffect(() => {
    if (cinematicFlowRunning) return;
    const t = setTimeout(() => cinematicFlowQuery.refetch(), 2000);
    return () => clearTimeout(t);
  }, [seamlessTransitions, serverIsGenerating]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (serverIsGenerating) {
      // New generation cycle started — re-arm the auto-trigger
      seamlessAutoFiredRef.current = false;
      prevIsGeneratingRef.current = true;
      return;
    }
    const justFinished = prevIsGeneratingRef.current && !serverIsGenerating;
    prevIsGeneratingRef.current = false;
    if (!justFinished) return;
    if (!seamlessTransitions) return;
    if (seamlessAutoFiredRef.current) return;

    const contentScenes = (scenes || []).filter((s: any) => s.type !== 'chapter-title');
    const allHaveVideo = contentScenes.length > 0 && contentScenes.every((s: any) => s.videoUrl);
    if (!allHaveVideo) return;

    seamlessAutoFiredRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/universal-video/${projectId}/cinematic-flow-regenerate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        if (res.ok) {
          toast({
            title: "✨ Applying seamless transitions",
            description: `Chaining ${contentScenes.length} scenes for continuity. This runs sequentially and may take a while.`,
          });
          cinematicFlowQuery.refetch();
        }
      } catch (err) {
        console.error("[SeamlessTransitions] Auto-trigger failed:", err);
      }
    })();
  }, [serverIsGenerating, seamlessTransitions, scenes, projectId, toast]);

  const currentStep = progress.currentStep || null;
  const hasScenes = scenes.length > 0;
  const scriptReady = hasScenes && (project.status === "draft" || progress.phase === "script_ready");
  const isStudioPolish = (project.progress as any)?.projectMode === 'studio-polish';

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

  const persistProjectReferenceImages = async (images: string[]) => {
    try {
      await fetch(`/api/universal-video/projects/${projectId}/reference-images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ referenceImages: images }),
      });
    } catch (err) {
      console.error("[RefImages] Failed to persist project reference images:", err);
    }
  };

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
      if (url) {
        setReferenceImages((prev) => {
          const updated = [...prev, url];
          persistProjectReferenceImages(updated);
          return updated;
        });
      }
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    }
    setUploadingRef(false);
    if (refFileInputRef.current) refFileInputRef.current.value = "";
  };

  const generateScriptMutation = useMutation({
    mutationFn: async (vars: { requiredDeckImageIds?: string[] } | void) => {
      const slideIds = vars && 'requiredDeckImageIds' in vars ? vars.requiredDeckImageIds : undefined;
      const body = slideIds?.length ? { requiredDeckImageIds: slideIds } : {};
      const res = await fetch(`/api/universal-video/projects/${projectId}/generate-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate script");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      const slideCount = (vars && typeof vars === 'object' && 'requiredDeckImageIds' in vars)
        ? (vars.requiredDeckImageIds?.length ?? 0)
        : 0;
      if (slideCount > 0) {
        toast({
          title: "Script Rebuilt",
          description: `All scenes rebuilt with ${slideCount} selected slide${slideCount !== 1 ? 's' : ''} woven in.`,
        });
      } else {
        toast({ title: "Script Generated", description: "Review and edit your scenes below, then generate assets." });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isLongStory = (project.progress as any)?.projectType === 'long-story';
  const chapterOutline = (project.progress as any)?.chapterOutline || null;
  const approvedOutline = (project.progress as any)?.approvedOutline || null;
  const outlinePhase = (project.progress as any)?.phase;
  const [editableChapters, setEditableChapters] = useState<any[]>([]);
  const [editingChapterIdx, setEditingChapterIdx] = useState<number | null>(null);

  useEffect(() => {
    if (chapterOutline?.chapters) {
      setEditableChapters(chapterOutline.chapters);
    }
  }, [chapterOutline]);

  const outlineAutoTriggered = useRef(false);

  const generateOutlineMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/generate-outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate outline");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      if (data.outline?.chapters) {
        setEditableChapters(data.outline.chapters);
      }
      toast({ title: "Outline Generated", description: `${data.outline?.chapters?.length || 0} chapters ready for review.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const hasOutlineAlready = chapterOutline || outlinePhase === 'outline_review' || outlinePhase === 'outline_approved' || outlinePhase === 'script_ready';
    if (isLongStory && !hasOutlineAlready && !generateOutlineMutation.isPending && !outlineAutoTriggered.current && scenes.length === 0) {
      outlineAutoTriggered.current = true;
      generateOutlineMutation.mutate();
    }
  }, [isLongStory, chapterOutline, outlinePhase, scenes.length]);

  // Task #184: Deck-to-Video projects auto-draft their script on first open
  // (the deck analysis already lives in progress; the generate-script route
  // anchors the deck images onto the resulting scenes).
  const deckScriptAutoTriggered = useRef(false);
  const deckAnalysisPresent = !!(project.progress as any)?.deckAnalysis;

  useEffect(() => {
    const alreadyHasScript = outlinePhase === 'script_ready' || scenes.length > 0;
    if (deckAnalysisPresent && !isLongStory && !alreadyHasScript && !generateScriptMutation.isPending && !deckScriptAutoTriggered.current) {
      deckScriptAutoTriggered.current = true;
      generateScriptMutation.mutate();
    }
  }, [deckAnalysisPresent, isLongStory, outlinePhase, scenes.length]);

  const approveOutlineMutation = useMutation({
    mutationFn: async (chapters: any[]) => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/approve-outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ chapters }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to approve outline");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Outline Approved", description: "Now generating your chapter-structured script..." });
      generateScriptMutation.mutate();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const moveChapter = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= editableChapters.length) return;
    const updated = [...editableChapters];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setEditableChapters(updated);
  };

  const removeChapter = (idx: number) => {
    setEditableChapters(prev => prev.filter((_, i) => i !== idx));
  };

  const updateChapterTitle = (idx: number, title: string) => {
    setEditableChapters(prev => prev.map((ch, i) => i === idx ? { ...ch, title } : ch));
  };

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

  const moveSceneMutation = useMutation({
    mutationFn: async ({ fromIndex, toIndex }: { fromIndex: number; toIndex: number }) => {
      const reordered = [...scenes];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      const withOrder = reordered.map((s: any, i: number) => ({ ...s, order: i }));
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scenes: withOrder }),
      });
      if (!res.ok) throw new Error("Failed to reorder scenes");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
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
      body.seamlessTransitions = seamlessTransitions;
      const res = await fetch(`/api/universal-video/projects/${projectId}/generate-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: any = new Error(data?.error || "Failed to start asset generation");
        err.status = res.status;
        throw err;
      }
      return data;
    },
    onSuccess: () => {
      setGenerationTriggered(true);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Generation Started", description: "All assets are being generated. Suzzie is working on your project." });
    },
    onError: (err: any) => {
      if (err?.status === 409) {
        setGenerationTriggered(true);
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        toast({ title: "Already in progress", description: "This project is already generating assets." });
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
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

  const generateThumbnailMutation = useMutation({
    mutationFn: async (sceneId: string) => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}/generate-thumbnail`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to generate thumbnail");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err: Error) => {
      toast({ title: "Thumbnail failed", description: err.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });

  // Phase 21B (Task #106): NB2 storyboard pipeline — 3 candidates per scene,
  // Claude Vision QA picks the winner, persists as both thumbnailUrl AND
  // seedImageUrl so omni_reference can prepend it as @image1.
  // Dialog state lives here in `ScriptGenerationPanel` because both the
  // mutations below and the trigger badges/buttons (regen badge, header
  // bulk button) are also defined inside this component.
  const [storyRegenDialog, setStoryRegenDialog] = useState<{ open: boolean; sceneId: string | null }>({ open: false, sceneId: null });
  const [budgetConfirmDialog, setBudgetConfirmDialog] = useState<{ open: boolean; estimate: any }>({ open: false, estimate: null });

  // Task #111: per-project NB2 storyboard resolution picker.
  //
  // We deliberately distinguish "no explicit choice" (null) from an
  // explicit 1K pick. When the project has never set a tier and the user
  // has not picked one, generate calls omit `resolution` so the server's
  // `getStoryboardResolution(undefined)` can fall back to the operator's
  // STORYBOARD_NB2_RESOLUTION env override (or 1K default). The picker
  // still visually highlights the *effective* tier — i.e. the persisted
  // value if set, otherwise 1K — so the UI is never blank, but it does
  // not coerce that visual default into the request body.
  const projectStoryRes = ((project as any).storyboardResolution ?? null) as '1K' | '2K' | '4K' | null;
  const [chosenResolution, setChosenResolution] = useState<'1K' | '2K' | '4K' | null>(projectStoryRes);
  useEffect(() => {
    setChosenResolution(((project as any).storyboardResolution ?? null) as '1K' | '2K' | '4K' | null);
  }, [(project as any).storyboardResolution]);
  // Server echoes the *effective* tier it would use right now (project >
  // env > default). Falling back to '1K' here only happens during the
  // first render before the project payload arrives — once it does, the
  // env-aware value takes over so an operator's STORYBOARD_NB2_RESOLUTION
  // is honored visually instead of silently overridden by a client-side
  // 1K assumption.
  const effectiveServerResolution = (((project as any).storyboardResolutionEffective ?? null) as '1K' | '2K' | '4K' | null);
  const storyboardResolution: '1K' | '2K' | '4K' = chosenResolution ?? effectiveServerResolution ?? '1K';
  const setStoryboardResolution = (next: '1K' | '2K' | '4K' | null) => setChosenResolution(next);
  const setStoryboardResolutionMutation = useMutation({
    // Task #111: capture the previous tier in onMutate so rollback is
    // deterministic during rapid toggles — otherwise the picker could
    // settle on a value the server didn't accept and the next batch run
    // would diverge from what the user sees.
    mutationFn: async (next: '1K' | '2K' | '4K') => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/storyboard-resolution`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to save resolution');
      return data;
    },
    onMutate: () => {
      // Capture the *current local* tier (the value at the time the
      // picker click triggered this mutation, before the optimistic
      // update is committed) so rapid toggles roll back to what the
      // user actually saw last, not the older persisted project value.
      // `null` means "no explicit choice yet" — preserved on rollback
      // so we don't accidentally promote 1K to a real selection.
      const previous = chosenResolution;
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: (err: Error, _next, context) => {
      const previous = (context as { previous?: '1K' | '2K' | '4K' | null } | undefined)?.previous
        ?? (((project as any).storyboardResolution ?? null) as '1K' | '2K' | '4K' | null);
      setChosenResolution(previous);
      toast({ title: 'Could not save resolution', description: err.message, variant: 'destructive' });
    },
  });
  const generateStorySceneMutation = useMutation({
    mutationFn: async (sceneId: string) => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}/generate-thumbnail?mode=nb2-candidates`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // Task #111: forward the chosen tier so single-scene regens honor it.
        // Only send `resolution` if the user (or project) explicitly picked
        // a tier — otherwise the server falls back to env > default, which
        // lets operators set STORYBOARD_NB2_RESOLUTION globally.
        body: JSON.stringify({
          numCandidates: 3,
          ...(chosenResolution ? { resolution: chosenResolution } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to generate storyboard image");
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      if (data?.cost) {
        toast({
          title: "Storyboard frame ready",
          description: `${data.candidates?.length || 1} candidate(s) — best pick by ${data.model}`,
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Storyboard generation failed", description: err.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });

  const generateStoryboardBatchMutation = useMutation({
    mutationFn: async (confirmOverCap?: boolean) => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/generate-storyboard`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // Task #111: send the per-batch tier; the server also persists it.
        // Omit `resolution` when no explicit tier has been chosen yet so
        // the server can fall back to STORYBOARD_NB2_RESOLUTION env or
        // the 1K default — preserves the documented unset semantics.
        body: JSON.stringify({
          skipExisting: true,
          numCandidates: 3,
          confirmOverCap: !!confirmOverCap,
          ...(chosenResolution ? { resolution: chosenResolution } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: any = new Error(data?.message || data?.error || "Storyboard batch failed");
        err.payload = data;
        throw err;
      }
      return data;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Storyboard generation started",
        description: `${data?.estimate?.scenesToGenerate || 0} scene(s) queued (~$${(data?.estimate?.estimatedCost || 0).toFixed(2)})`,
      });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err: any) => {
      if (err?.payload?.error === "BUDGET_EXCEEDED") {
        setBudgetConfirmDialog({ open: true, estimate: err.payload.estimate });
        return;
      }
      toast({ title: "Storyboard batch failed", description: err.message, variant: "destructive" });
    },
  });

  // Task #112: live storyboard batch progress (cumulative cost, near-cap
  // warning, scene counters). Written by `generateAllSceneImages` via
  // `mergeRenderSettingsToDb` and surfaced through the existing 5s polling
  // on the project query — no new transport required.
  // Counter contract documented in `universal-video-routes.ts /generate-storyboard`:
  //   completedCount / totalToGenerate           — worker-pool denominator
  //   runtimeSkippedCount                        — in-flight stale-write skips (in pool)
  //   scenesSkippedByPlan                        — pre-flight plan skips (NOT in pool)
  // The two skip counters are intentionally separate; never sum them.
  const storyboardBatchProgress = (project?.progress as any)?.storyboardBatchProgress as
    | {
        status?: 'running' | 'complete' | 'failed';
        totalToGenerate?: number;
        completedCount?: number;
        generatedCount?: number;
        failedCount?: number;
        runtimeSkippedCount?: number;
        scenesSkippedByPlan?: number;
        cumulativeCost?: number;
        estimatedCost?: number;
        budgetCap?: number;
        nearCap?: boolean;
        lastNb2Resolution?: string;
        lastSceneCost?: number;
      }
    | undefined;
  const isStoryboardBatchRunning = storyboardBatchProgress?.status === 'running';
  // Refetch once every 2.5s while a batch is running so the cost counter
  // ticks faster than the global 5s project polling cadence.
  useEffect(() => {
    if (!isStoryboardBatchRunning) return;
    const t = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    }, 2500);
    return () => clearInterval(t);
  }, [isStoryboardBatchRunning, projectId, queryClient]);

  // Pick a different candidate as the winner: PATCH the scene's thumbnailUrl,
  // seedImageUrl, and update imageCandidates[i].selected so the strip stays
  // consistent. The PATCH allowlist already includes those fields.
  const pickStoryboardCandidateMutation = useMutation({
    mutationFn: async (args: { sceneId: string; candidateUrl: string; candidates: any[] }) => {
      const newCandidates = args.candidates.map((c) => ({
        ...c,
        selected: c.url === args.candidateUrl,
      }));
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${args.sceneId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thumbnailUrl: args.candidateUrl,
          seedImageUrl: args.candidateUrl,
          imageCandidates: newCandidates,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to pick candidate");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't update pick", description: err.message, variant: "destructive" });
    },
  });

  // Task 63: Batch "Generate all thumbnails" — one-click cost-aware preview
  // for every scene in the brief. Mirrors the per-scene fingerprint logic in
  // server/services/universal-video-routes.ts so we skip scenes whose
  // existing thumbnail already matches the current style/prompt.
  const FLUX_SCHNELL_COST_PER_IMAGE = 0.003;
  const computeSceneFingerprint = useCallback((scene: any): string => {
    const presetId = scene.assignedStyleId
      || scene.artPresetId
      || (project?.progress as any)?.artPresetId
      || (project as any)?.artPresetId;
    const basePrompt = (scene.imagePrompt || scene.visualDirection || scene.narration || '').toString().trim();
    return `${presetId || 'auto'}::${basePrompt.substring(0, 80)}`;
  }, [project]);
  const scenesNeedingThumbnail = scenes.filter((s: any) => {
    const basePrompt = (s.imagePrompt || s.visualDirection || s.narration || '').toString().trim();
    if (!basePrompt) return false;
    if (s.thumbnailStatus === 'generating') return false;
    const fingerprint = computeSceneFingerprint(s);
    if (s.thumbnailUrl && s.thumbnailGeneratedFor === fingerprint) return false;
    return true;
  });
  const estimatedBatchCost = scenesNeedingThumbnail.length * FLUX_SCHNELL_COST_PER_IMAGE;
  // Task #111: NB2 storyboard skip rule must mirror the server's
  // `estimateBatchCost`/`generateAllSceneImages` logic — only scenes that
  // already have an NB2-generated thumbnail are skipped. Counting against
  // `scenesNeedingThumbnail` (which uses Flux fingerprint logic) would
  // under-count when a scene has a Flux/Recraft thumbnail and make the
  // live estimate disagree with the server's preflight & invoice.
  const scenesNeedingStoryboard = scenes.filter((s: any) => {
    const basePrompt = (s.imagePrompt || s.visualDirection || s.narration || '').toString().trim();
    if (!basePrompt) return false;
    if (s.thumbnailStatus === 'generating') return false;
    if (s.thumbnailUrl && s.imageGenerationModel === 'nano-banana-2') return false;
    return true;
  });
  const [batchThumbProgress, setBatchThumbProgress] = useState<
    { total: number; completed: number; failed: number } | null
  >(null);
  const isBatchThumbRunning = batchThumbProgress !== null;
  const handleGenerateAllThumbnails = useCallback(async () => {
    const targets = scenes.filter((s: any) => {
      const basePrompt = (s.imagePrompt || s.visualDirection || s.narration || '').toString().trim();
      if (!basePrompt) return false;
      if (s.thumbnailStatus === 'generating') return false;
      const fingerprint = computeSceneFingerprint(s);
      if (s.thumbnailUrl && s.thumbnailGeneratedFor === fingerprint) return false;
      return true;
    });
    if (targets.length === 0) return;
    setBatchThumbProgress({ total: targets.length, completed: 0, failed: 0 });
    let completed = 0;
    let failed = 0;
    await Promise.all(targets.map(async (s: any) => {
      try {
        const res = await fetch(
          `/api/universal-video/projects/${projectId}/scenes/${s.id}/generate-thumbnail`,
          { method: "POST", credentials: "include" }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        completed++;
      } catch (err) {
        failed++;
      } finally {
        setBatchThumbProgress((p) => p ? { ...p, completed, failed } : p);
      }
    }));
    await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    toast({
      title: "Thumbnails generated",
      description: failed > 0
        ? `${completed} succeeded, ${failed} failed`
        : `${completed} scene${completed === 1 ? '' : 's'} ready to preview`,
      variant: failed > 0 && completed === 0 ? "destructive" : undefined,
    });
    setBatchThumbProgress(null);
  }, [scenes, projectId, computeSceneFingerprint, queryClient, toast]);

  // Task 61: when a scene's Creative Brief panel becomes visible (expanded),
  // auto-generate a thumbnail for that scene if it doesn't already have one.
  // Throttled per-scene-per-session via a ref so we never re-fire automatically
  // for a scene we've already attempted; manual Regenerate stays unaffected.
  const autoThumbnailAttemptedRef = useRef<Set<string>>(new Set());
  const isStudioPolishProject = (project?.progress as any)?.projectMode === 'studio-polish';
  const isScriptReadyForBrief = ((project?.progress as any)?.scriptGeneration?.status === 'completed') ||
    ((project as any)?.scenes?.length ?? 0) > 0;
  useEffect(() => {
    if (!expandedSceneId || !isScriptReadyForBrief || isStudioPolishProject) return;
    const scene: any = (project as any)?.scenes?.find((s: any) => s.id === expandedSceneId);
    if (!scene) return;
    if (scene.thumbnailUrl) return;
    if (scene.thumbnailStatus === 'generating') return;
    // Phase 21B (Task #106): never auto-fire the cheap Flux thumbnail for a scene
    // whose user-chosen winner came from the NB2 storyboard pipeline.
    if (scene.imageGenerationModel === 'nano-banana-2') return;
    if (autoThumbnailAttemptedRef.current.has(expandedSceneId)) return;
    autoThumbnailAttemptedRef.current.add(expandedSceneId);
    generateThumbnailMutation.mutate(expandedSceneId);
  }, [expandedSceneId, project, isScriptReadyForBrief, isStudioPolishProject, generateThumbnailMutation]);

  // Task 64: auto-refresh thumbnail when narration / visualDirection / imagePrompt
  // change, mirroring today's style-change behavior. We only fire for scenes that
  // already have a thumbnail (so first-time generation is still user-initiated)
  // and dedupe by fingerprint to avoid retry storms when generation fails.
  const autoRestaleAttemptedRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!isScriptReadyForBrief || isStudioPolishProject) return;
    const allScenes: any[] = (project as any)?.scenes || [];
    for (const s of allScenes) {
      if (!s?.thumbnailUrl) continue;
      if (s.thumbnailStatus === 'generating') continue;
      // Phase 21B (Task #106): NB2 storyboard winners are explicit user choices —
      // never silently overwrite them with Flux when the prompt drifts. The user
      // can hit "Storyboard (3-candidate)" or the stale-regenerate badge to refresh
      // intentionally.
      if (s.imageGenerationModel === 'nano-banana-2') continue;
      const fingerprint = computeSceneFingerprint(s);
      if (s.thumbnailGeneratedFor === fingerprint) continue;
      if (autoRestaleAttemptedRef.current.get(s.id) === fingerprint) continue;
      const basePrompt = (s.imagePrompt || s.visualDirection || s.narration || '').toString().trim();
      if (!basePrompt) continue;
      autoRestaleAttemptedRef.current.set(s.id, fingerprint);
      generateThumbnailMutation.mutate(s.id);
    }
  }, [project, isScriptReadyForBrief, isStudioPolishProject, computeSceneFingerprint, generateThumbnailMutation]);

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

  // Phase 20C — one-click "Switch to Seedance 2" affordance on the scene-card
  // amber chip. Persists `videoProviderLock: 'seedance-2.0'` for the scene so
  // the next regen runs the omni_reference path. Mirrors the editor-level
  // setProviderLockMutation but is scene-scoped from the project page.
  const switchProviderLockMutation = useMutation({
    mutationFn: async ({ sceneId, provider }: { sceneId: string; provider: string }) => {
      const res = await fetch(
        `/api/universal-video/${projectId}/scenes/${sceneId}/provider-lock`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ videoProviderLock: provider }),
        },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || 'Failed to switch provider');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast({
        title: 'Switched to Seedance 2',
        description: 'Scene locked to Seedance 2. Hit Re-anchor or regenerate to render with your brand references.',
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not switch provider', description: err.message, variant: 'destructive' });
    },
  });

  const regenVideoMutation = useMutation({
    mutationFn: async (
      params: string | { sceneId: string; strongAnchor?: boolean },
    ) => {
      // Phase 20C: callers may pass a plain sceneId (legacy) OR an object that
      // also requests stronger brand anchoring on the regen pass. The server
      // appends an explicit anchoring phrase to the effective prompt before
      // building the omni_reference payload when strongAnchor is true.
      const { sceneId, strongAnchor } =
        typeof params === 'string' ? { sceneId: params, strongAnchor: false } : params;
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/regenerate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: selectedProvider, strongAnchor: !!strongAnchor }),
      });
      if (!res.ok) throw new Error("Failed to regenerate video");
      return res.json();
    },
    onSuccess: (_data, params) => {
      const strong = typeof params !== 'string' && params.strongAnchor;
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({
        title: strong ? "Re-anchoring Video" : "Regenerating Video",
        description: strong
          ? "Re-running this scene with a stronger brand anchoring prompt."
          : "Scene video is being regenerated.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const regenerateAllVideosMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/universal-video/${projectId}/regenerate-all-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to regenerate all videos");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Regenerating All Scenes", description: "All scene videos are being regenerated." });
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
          {isGenerating && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-purple-300">
                  {currentStep === 'voiceover' ? 'Generating voiceovers...' :
                   currentStep === 'images' ? 'Creating scene images...' :
                   currentStep === 'videos' ? 'Generating AI videos — this may take 2-5 minutes...' :
                   currentStep === 'music' ? 'Composing background music...' :
                   currentStep === 'assembly' ? 'Assembling final video...' :
                   'Processing assets...'}
                </p>
                <p className="text-xs text-purple-400/70 mt-0.5">
                  {progress.steps?.[currentStep]?.message || (progress.overallPercent > 0 ? `${progress.overallPercent}% complete` : 'Starting pipeline...')}
                </p>
              </div>
            </div>
          )}
          {(isGenerating || progress.overallPercent > 0) && (
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(progress.overallPercent || 0, isGenerating ? 2 : 0)}%` }}
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
        {!hasScenes && !isGenerating && !isStudioPolish && (
          <div className="space-y-4">
            {/* Long Story: Outline Review Flow */}
            {isLongStory && outlinePhase === 'outline_review' && editableChapters.length > 0 ? (
              <div className="space-y-4">
                <div className="text-center py-4 space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
                    <BookOpen className="w-7 h-7 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                    Review Chapter Outline
                  </h3>
                  <p className="text-sm max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
                    Reorder, rename, or remove chapters. When ready, approve to generate the full script.
                  </p>
                </div>

                <div className="space-y-2">
                  {editableChapters.map((ch, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border p-3 transition-all"
                      style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col gap-0.5 mt-1">
                          <button type="button" onClick={() => moveChapter(idx, idx - 1)} disabled={idx === 0} className="p-0.5 rounded hover:bg-white/5 disabled:opacity-20">
                            <ChevronUp className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                          </button>
                          <button type="button" onClick={() => moveChapter(idx, idx + 1)} disabled={idx === editableChapters.length - 1} className="p-0.5 rounded hover:bg-white/5 disabled:opacity-20">
                            <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(139, 92, 246, 0.15)", color: "rgb(139, 92, 246)" }}>CH {idx + 1}</span>
                            {editingChapterIdx === idx ? (
                              <input
                                type="text"
                                value={ch.title}
                                onChange={(e) => updateChapterTitle(idx, e.target.value)}
                                onBlur={() => setEditingChapterIdx(null)}
                                onKeyDown={(e) => { if (e.key === 'Enter') setEditingChapterIdx(null); }}
                                autoFocus
                                className="flex-1 text-sm font-medium px-2 py-0.5 rounded border outline-none"
                                style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}
                              />
                            ) : (
                              <span
                                className="text-sm font-medium cursor-pointer hover:underline"
                                style={{ color: "var(--text-primary)" }}
                                onClick={() => setEditingChapterIdx(idx)}
                              >
                                {ch.title}
                              </span>
                            )}
                          </div>
                          <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>{ch.summary}</p>
                          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
                            <span>{ch.recommendedSceneCount} scenes</span>
                            <span>{ch.estimatedDuration}s</span>
                            <span className="flex items-center gap-0.5">
                              <Star className="w-3 h-3 text-amber-400" />
                              {ch.visualStorytellingScore}/10
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeChapter(idx)}
                          disabled={editableChapters.length <= 4}
                          className="p-1 rounded hover:bg-red-500/10 transition-colors disabled:opacity-20"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs p-2 rounded-lg" style={{ backgroundColor: "var(--surface-elevated)", color: "var(--text-muted)" }}>
                  <span>{editableChapters.length} chapters</span>
                  <span>{editableChapters.reduce((s, c) => s + (c.estimatedDuration || 0), 0)}s total</span>
                  <span>{editableChapters.reduce((s, c) => s + (c.recommendedSceneCount || 0), 0)} scenes</span>
                </div>

                <button
                  onClick={() => approveOutlineMutation.mutate(editableChapters)}
                  disabled={approveOutlineMutation.isPending || generateScriptMutation.isPending}
                  className="w-full py-4 rounded-xl font-semibold text-white text-base flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                >
                  {approveOutlineMutation.isPending || generateScriptMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  {approveOutlineMutation.isPending ? "Approving..." : generateScriptMutation.isPending ? "Generating Script..." : "Approve & Generate Script"}
                </button>
              </div>
            ) : (
              <>
                <div className="text-center py-6 space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
                    {isLongStory ? <BookOpen className="w-8 h-8 text-purple-400" /> : <FileText className="w-8 h-8 text-purple-400" />}
                  </div>
                  <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                    {isLongStory ? "Step 1: Generate Chapter Outline" : "Step 1: Generate Your Script"}
                  </h3>
                  <p className="text-sm max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
                    {isLongStory
                      ? "AI will analyze your document and break it into chapters. You'll review the outline before generating the full script."
                      : "AI will create scenes from your script with narration, visual directions, and timing. You can review and edit everything before generating visual assets."
                    }
                  </p>
                </div>
                <button
                  onClick={() => isLongStory ? generateOutlineMutation.mutate() : generateScriptMutation.mutate()}
                  disabled={generateScriptMutation.isPending || generateOutlineMutation.isPending}
                  className="w-full py-4 rounded-xl font-semibold text-white text-base flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                >
                  {(generateScriptMutation.isPending || generateOutlineMutation.isPending) ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : isLongStory ? (
                    <BookOpen className="w-5 h-5" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                  {generateOutlineMutation.isPending ? "Analyzing Document..." : generateScriptMutation.isPending ? "Generating Script..." : isLongStory ? "Generate Chapter Outline" : "Generate Script"}
                </button>
              </>
            )}
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

            {scriptReady && !isStudioPolish && (
              <div
                className="rounded-xl border p-4 space-y-3"
                style={{ backgroundColor: "rgba(124,58,237,0.06)", borderColor: "rgba(124,58,237,0.25)" }}
                data-testid="creative-brief-panel"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Creative Brief</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 uppercase tracking-wider">
                      Director's note
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Task #112: live storyboard batch cost counter. */}
                    {isStoryboardBatchRunning && storyboardBatchProgress && (() => {
                      const spent = storyboardBatchProgress.cumulativeCost ?? 0;
                      const cap = storyboardBatchProgress.budgetCap ?? 0;
                      const total = storyboardBatchProgress.totalToGenerate ?? 0;
                      const done = storyboardBatchProgress.completedCount ?? 0;
                      const nearCap = !!storyboardBatchProgress.nearCap;
                      const lastRes = storyboardBatchProgress.lastNb2Resolution;
                      return (
                        <div
                          className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-2"
                          style={
                            nearCap
                              ? { borderColor: "rgba(245,158,11,0.5)", backgroundColor: "rgba(245,158,11,0.10)", color: "rgb(252,211,77)" }
                              : { borderColor: "rgba(124,58,237,0.4)", backgroundColor: "rgba(124,58,237,0.08)", color: "rgb(216,180,254)" }
                          }
                          data-testid="storyboard-batch-progress"
                          title={
                            nearCap
                              ? `Live spend has crossed 80% of the $${cap.toFixed(2)} budget cap.`
                              : 'Live storyboard spend updates after each scene completes.'
                          }
                        >
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>
                            Storyboard {done}/{total} —{' '}
                            <span data-testid="storyboard-batch-spent">
                              Spent ${spent.toFixed(2)} of ${cap.toFixed(2)}
                            </span>
                            {lastRes ? <span className="ml-1 opacity-80">· {lastRes}</span> : null}
                          </span>
                          {nearCap && (
                            <AlertTriangle className="w-3 h-3" data-testid="storyboard-batch-near-cap" />
                          )}
                        </div>
                      );
                    })()}
                    {/* Task 63: One-click batch thumbnail generation */}
                    {scenes.length > 0 && (
                      isBatchThumbRunning ? (
                        <div
                          className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5"
                          style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                          data-testid="batch-thumbnail-progress"
                        >
                          <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                          Generating thumbnails… {(batchThumbProgress!.completed + batchThumbProgress!.failed)}/{batchThumbProgress!.total}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          {scenesNeedingThumbnail.length > 0 ? (
                            <>
                              <span
                                className="text-[11px]"
                                style={{ color: "var(--text-muted)" }}
                                data-testid="batch-thumbnail-estimate"
                              >
                                ~${estimatedBatchCost.toFixed(2)} for {scenesNeedingThumbnail.length} scene{scenesNeedingThumbnail.length === 1 ? '' : 's'}
                              </span>
                              <button
                                onClick={handleGenerateAllThumbnails}
                                className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-colors hover:border-purple-500/40"
                                style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                                data-testid="button-generate-all-thumbnails"
                              >
                                <ImagePlus className="w-3 h-3" />
                                Generate all thumbnails
                              </button>
                            </>
                          ) : (
                            <span
                              className="text-[11px] flex items-center gap-1"
                              style={{ color: "var(--text-muted)" }}
                              data-testid="batch-thumbnail-uptodate"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Thumbnails up to date
                            </span>
                          )}
                          {/* Task #111: NB2 storyboard resolution picker.
                              Persists per-project (PATCH /storyboard-resolution)
                              and is forwarded into the batch + per-scene calls
                              so the bill matches what's shown here. Rendered
                              alongside (not nested inside) the Flux thumbnail
                              flow so users can preselect tier even when their
                              base thumbnails are already up to date. */}
                          <div
                            className="inline-flex items-center rounded-lg border overflow-hidden"
                            style={{ borderColor: "var(--border-subtle)" }}
                            role="group"
                            aria-label="Storyboard resolution"
                            data-testid="storyboard-resolution-picker"
                          >
                            {(['1K','2K','4K'] as const).map((tier) => {
                              // Visual selection follows the *effective* tier
                              // (chosen or default), but the click handler
                              // compares against the explicit choice so that
                              // clicking the visually-active default (e.g. 1K
                              // when nothing is persisted) still triggers
                              // persistence and pins the request body
                              // resolution — without that, env defaults of
                              // 2K/4K would silently override what the user
                              // clearly clicked.
                              const active = storyboardResolution === tier;
                              return (
                                <button
                                  key={tier}
                                  type="button"
                                  onClick={() => {
                                    if (chosenResolution === tier) return;
                                    setStoryboardResolution(tier);
                                    setStoryboardResolutionMutation.mutate(tier);
                                  }}
                                  className="text-[11px] px-2 py-1 transition-colors"
                                  style={{
                                    backgroundColor: active ? "rgba(124,58,237,0.18)" : "transparent",
                                    color: active ? "rgb(216,180,254)" : "var(--text-secondary)",
                                  }}
                                  data-testid={`storyboard-resolution-${tier.toLowerCase()}`}
                                  title={`${tier} preview — $${getNB2CostPerImage(tier).toFixed(2)} per image`}
                                  aria-pressed={active}
                                >
                                  {tier}
                                </button>
                              );
                            })}
                          </div>
                          {/* Live cost estimate that uses the same per-image
                              price helper the server uses, so what users see
                              tracks PiAPI's invoice. When every scene already
                              has an NB2 thumbnail the count drops to 0 — show
                              an explicit up-to-date badge instead of "$0 for
                              0 scenes" so the picker still reads as actionable
                              for next-time tier choices. */}
                          {scenesNeedingStoryboard.length > 0 ? (
                            <span
                              className="text-[11px]"
                              style={{ color: "var(--text-muted)" }}
                              data-testid="storyboard-batch-estimate"
                            >
                              ~${(scenesNeedingStoryboard.length * 3 * getNB2CostPerImage(storyboardResolution)).toFixed(2)} for {scenesNeedingStoryboard.length} scene{scenesNeedingStoryboard.length === 1 ? '' : 's'} × 3 @ {storyboardResolution}
                            </span>
                          ) : (
                            <span
                              className="text-[11px] flex items-center gap-1"
                              style={{ color: "var(--text-muted)" }}
                              data-testid="storyboard-batch-uptodate"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Storyboard up to date @ {storyboardResolution}
                            </span>
                          )}
                          {/* Phase 21B (Task #106): Bulk NB2 storyboard generator. */}
                          <button
                            onClick={() => generateStoryboardBatchMutation.mutate(false)}
                            disabled={generateStoryboardBatchMutation.isPending || isStoryboardBatchRunning || scenesNeedingStoryboard.length === 0}
                            className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-colors hover:border-purple-500/40 disabled:opacity-50"
                            style={{ borderColor: "rgba(124,58,237,0.4)", color: "rgb(216,180,254)", backgroundColor: "rgba(124,58,237,0.08)" }}
                            data-testid="button-generate-storyboard"
                            title={`Generate 3 NB2 candidates per scene + Vision QA at ${storyboardResolution} ($${(3 * getNB2CostPerImage(storyboardResolution)).toFixed(2)}/scene).`}
                          >
                            {(generateStoryboardBatchMutation.isPending || isStoryboardBatchRunning) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            Generate storyboard
                          </button>
                        </div>
                      )
                    )}
                  {!editingRationale ? (
                    <button
                      onClick={() => setEditingRationale(true)}
                      className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-colors hover:border-purple-500/40"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                    >
                      <Edit2 className="w-3 h-3" /> Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setBriefRationale(((project as any).visualStyleRationale) || ""); setEditingRationale(false); }}
                        className="text-xs px-2.5 py-1 rounded-lg border" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveRationaleMutation.mutate(briefRationale)}
                        disabled={saveRationaleMutation.isPending}
                        className="text-xs px-2.5 py-1 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                      >
                        {saveRationaleMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save
                      </button>
                    </div>
                  )}
                  </div>
                </div>
                {editingRationale ? (
                  <textarea
                    value={briefRationale}
                    onChange={(e) => setBriefRationale(e.target.value)}
                    rows={4}
                    placeholder="Why this visual treatment fits the brand and narrative — chosen styles, lighting, color, pacing, per-scene mixing decisions."
                    className="w-full text-sm rounded-lg border px-3 py-2 bg-transparent outline-none resize-y"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  />
                ) : briefRationale ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                    {briefRationale}
                  </p>
                ) : (
                  <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>
                    No style rationale yet. Generate or regenerate the script to produce one — or click Edit to write your own.
                  </p>
                )}
                <div className="text-[11px] flex items-center gap-3 pt-1" style={{ color: "var(--text-muted)" }}>
                  <span className="flex items-center gap-1"><Palette className="w-3 h-3" /> Per-scene styles, shot types, on-screen text & lower-thirds are editable inside each scene below.</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                {isStudioPolish ? 'Clips' : 'Scenes'} ({scenes.length})
              </h3>
              <div className="flex items-center gap-2">
                {isStudioPolish && (
                  <label className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors hover:border-amber-500/30 cursor-pointer"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                    <Upload className="w-3 h-3" />
                    Add More Clips
                    <input type="file" accept=".mp4,.mov,.avi,.mkv,.webm,.jpg,.jpeg,.png,.webp" multiple className="hidden"
                      onChange={async (e) => {
                        if (!e.target.files?.length) return;
                        let currentScenes = [...scenes];
                        for (const file of Array.from(e.target.files)) {
                          if (file.size > 500 * 1024 * 1024) {
                            toast({ title: "File too large", description: `${file.name} exceeds 500MB limit`, variant: "destructive" });
                            continue;
                          }
                          const formData = new FormData();
                          formData.append('file', file);
                          formData.append('aspectRatio', project.outputFormat?.aspectRatio || '16:9');
                          try {
                            const uploadRes = await fetch('/api/studio-polish/upload', { method: 'POST', credentials: 'include', body: formData });
                            if (!uploadRes.ok) {
                              const err = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
                              toast({ title: "Upload failed", description: err.error || 'Unknown error', variant: "destructive" });
                              continue;
                            }
                            const data = await uploadRes.json();
                            const isVideo = data.fileType === 'video';
                            const newScene = {
                              id: crypto.randomUUID(),
                              type: "content" as const,
                              title: data.fileName || `Scene ${currentScenes.length + 1}`,
                              narration: "",
                              visualDirection: "",
                              duration: data.duration || 5,
                              order: currentScenes.length,
                              sourceType: "upload" as const,
                              microScenes: [{
                                id: crypto.randomUUID(),
                                videoUrl: isVideo ? data.s3Url : null,
                                imageUrl: isVideo ? (data.thumbnailUrl || null) : data.s3Url,
                                status: "ready" as const,
                                duration: data.duration || 5,
                                originalAudioVolume: isVideo ? 1.0 : 0,
                                prompt: "",
                                sourceType: "upload" as const,
                              }],
                            };
                            currentScenes = [...currentScenes, newScene];
                          } catch (err) {
                            toast({ title: "Upload error", description: `Failed to upload ${file.name}`, variant: "destructive" });
                          }
                        }
                        if (currentScenes.length > scenes.length) {
                          try {
                            const patchRes = await fetch(`/api/projects/${project.projectId}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify({ scenes: currentScenes }),
                            });
                            if (patchRes.ok) {
                              queryClient.invalidateQueries({ queryKey: ["project", project.projectId] });
                              toast({ title: "Clips added", description: `${currentScenes.length - scenes.length} clip(s) added successfully` });
                            } else {
                              toast({ title: "Save failed", description: "Clips uploaded but could not save to project", variant: "destructive" });
                            }
                          } catch (err) {
                            toast({ title: "Save error", description: "Failed to save clips to project", variant: "destructive" });
                          }
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
                {!isStudioPolish && (
                <button
                  onClick={() => regenerateAllVideosMutation.mutate()}
                  disabled={regenerateAllVideosMutation.isPending || isGenerating}
                  className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors hover:border-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                >
                  {regenerateAllVideosMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Video className="w-3 h-3" />
                  )}
                  {regenerateAllVideosMutation.isPending ? "Regenerating..." : "Regenerate All Scenes"}
                </button>
                )}
                {!isStudioPolish && scriptReady && (
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

            {/* Task #195: Deck slide coverage overview (Deck-to-Video only) */}
            {scriptReady && !isStudioPolish && ((project?.progress as any)?.deckImages?.length > 0) && (
              <DeckSlideOverview
                deckImages={(project?.progress as any)?.deckImages || []}
                scenes={scenes}
                onOpenScene={(id) => {
                  setExpandedSceneId(id);
                  if (typeof window !== 'undefined') {
                    requestAnimationFrame(() => {
                      document
                        .getElementById(`scene-card-${id}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                  }
                }}
                onRegenerateWithSlides={(ids) =>
                  generateScriptMutation.mutate({ requiredDeckImageIds: ids })
                }
                isRegenerating={generateScriptMutation.isPending}
              />
            )}

            {/* Scene Cards */}
            <div className="space-y-3">
              {scenes.map((scene: any, index: number) => {
                const sceneId = scene.id || `scene-${index}`;
                const activeJobStatuses = new Set([
                  "pending",
                  "running",
                  "queued",
                  "processing",
                  "rendering",
                  "generating",
                  "render_queued",
                  "lambda_pending",
                ]);
                const activeJobsForScene = Array.isArray(project?.jobs)
                  ? project.jobs.filter((j: any) =>
                      j.sceneId === sceneId && activeJobStatuses.has(j.status)
                    )
                  : [];
                const activeImageJob = activeJobsForScene.find((j: any) => j.sceneType === "image");
                const activeVideoJob = activeJobsForScene.find((j: any) => j.sceneType === "video");
                const isEditing = editingSceneId === sceneId;
                const isExpanded = expandedSceneId === sceneId;
                const thumbCandidate = scene.assets?.imageUrl || scene.background?.imageUrl || scene.background?.url || scene.textImageUrl || null;
                // Task 45: cache-bust thumbnail when a regen has happened so the browser
                // doesn't keep showing the previous image at the same URL.
                const thumbCacheKey = scene.assets?.lastRegenAt || scene.assets?.imageProvider || '';
                const thumbBase = thumbCandidate && !thumbCandidate.endsWith('.mp4') ? thumbCandidate : null;
                const thumb = thumbBase
                  ? (thumbCacheKey ? `${thumbBase}${thumbBase.includes('?') ? '&' : '?'}cb=${encodeURIComponent(thumbCacheKey)}` : thumbBase)
                  : null;
                const narration = scene.narration || scene.voiceover?.text || "";
                const isUploading = uploadingSceneId === sceneId;
                const showLibrary = librarySceneId === sceneId;

                const showChapterHeader = scene.chapterTitle && (
                  index === 0 || scenes[index - 1]?.chapterIndex !== scene.chapterIndex
                );

                return (
                  <div key={sceneId} id={`scene-card-${sceneId}`}>
                    {showChapterHeader && (
                      <div className="flex items-center gap-2 mb-2 mt-3 first:mt-0">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ backgroundColor: "rgba(139, 92, 246, 0.12)" }}>
                          <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-xs font-semibold text-purple-400">Chapter {(scene.chapterIndex ?? 0) + 1}</span>
                        </div>
                        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{scene.chapterTitle}</span>
                        <div className="flex-1 border-t" style={{ borderColor: "var(--border-subtle)" }} />
                      </div>
                    )}
                  <div
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
                          <img key={thumb} src={thumb} alt="" className="w-full h-full object-cover rounded-lg" />
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
                          {/* Task #119: per-scene render-system badge.
                              Display-only (no `onReclassify` handler).
                              We deliberately do NOT stopPropagation —
                              clicking the badge falls through to the
                              card-expand toggle (which is what users
                              expect from the rest of the chip row);
                              the tooltip is hover-driven so it's still
                              readable without expanding the card. The
                              editor retains the inline reclassify
                              affordance for per-scene overrides. */}
                          <span data-testid={`scene-list-render-type-${sceneId}`}>
                            <RenderTypeBadge
                              renderSystemType={(scene as Scene).renderSystemType}
                              classifierConfidence={(scene as Scene).classifierConfidence}
                              classifierReasoning={(scene as Scene).classifierReasoning}
                              manuallyClassified={(scene as Scene).manuallyClassified}
                              classifiedAt={(scene as Scene).classifiedAt}
                            />
                          </span>
                          {scene.duration && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                              {scene.duration}s
                            </span>
                          )}
                          {scene.microScenes && scene.microScenes.length > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                              {scene.microScenes.length} micro
                            </span>
                          )}
                          {scene.contentTag && SCENE_CONTENT_TAGS[scene.contentTag] && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full border"
                              style={{
                                borderColor: `${SCENE_CONTENT_TAGS[scene.contentTag].color}40`,
                                backgroundColor: `${SCENE_CONTENT_TAGS[scene.contentTag].color}15`,
                                color: SCENE_CONTENT_TAGS[scene.contentTag].color,
                              }}
                            >
                              {SCENE_CONTENT_TAGS[scene.contentTag].label}
                            </span>
                          )}
                          {scene.artPresetId && scene.artPresetId !== 'auto' && (() => {
                            const preset = getVisualArtPreset(scene.artPresetId);
                            if (!preset) return null;
                            return (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-0.5" style={{ borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.1)', color: 'rgb(167,139,250)' }}>
                                <Palette className="w-2.5 h-2.5" /> {preset.name}
                              </span>
                            );
                          })()}
                          {activeImageJob ? (() => {
                            const rawProgress = Number.isFinite(activeImageJob.progress) ? activeImageJob.progress : null;
                            const pct = rawProgress != null ? Math.max(0, Math.min(100, Math.round(rawProgress))) : null;
                            const etaSec = computeJobEtaSeconds(activeImageJob, pct);
                            const etaText = etaSec != null ? formatEta(etaSec) : null;
                            const label = `Regenerating image with ${formatProviderName(activeImageJob.provider)}${pct != null ? ` - ${pct}%` : ''}`;
                            const titleText = etaText ? `${label} (${etaText})` : label;
                            return (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-1 animate-pulse"
                                style={{ borderColor: 'rgba(59,130,246,0.4)', backgroundColor: 'rgba(59,130,246,0.15)', color: 'rgb(96,165,250)' }}
                                data-testid={`scene-regen-image-${sceneId}`}
                                title={titleText}
                              >
                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> {label}
                                {pct != null && (
                                  <span
                                    className="ml-1 inline-block h-1 w-8 rounded-full overflow-hidden"
                                    style={{ backgroundColor: 'rgba(59,130,246,0.2)' }}
                                    data-testid={`scene-regen-image-progress-${sceneId}`}
                                  >
                                    <span
                                      className="block h-full transition-all"
                                      style={{ width: `${pct}%`, backgroundColor: 'rgb(96,165,250)' }}
                                    />
                                  </span>
                                )}
                                {etaText && (
                                  <span
                                    className="ml-1 opacity-80"
                                    data-testid={`scene-regen-image-eta-${sceneId}`}
                                  >
                                    {etaText}
                                  </span>
                                )}
                              </span>
                            );
                          })() : scene.assets?.imageProvider && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-0.5" style={{ borderColor: 'rgba(59,130,246,0.3)', backgroundColor: 'rgba(59,130,246,0.1)', color: 'rgb(96,165,250)' }}>
                              <ImagePlus className="w-2.5 h-2.5" /> {formatProviderName(scene.assets.imageProvider)}
                            </span>
                          )}
                          {activeVideoJob ? (() => {
                            const rawProgress = Number.isFinite(activeVideoJob.progress) ? activeVideoJob.progress : null;
                            const pct = rawProgress != null ? Math.max(0, Math.min(100, Math.round(rawProgress))) : null;
                            const etaSec = computeJobEtaSeconds(activeVideoJob, pct);
                            const etaText = etaSec != null ? formatEta(etaSec) : null;
                            const label = `Regenerating video with ${formatProviderName(activeVideoJob.provider)}${pct != null ? ` - ${pct}%` : ''}`;
                            const titleText = etaText ? `${label} (${etaText})` : label;
                            return (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-1 animate-pulse"
                                style={{ borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.15)', color: 'rgb(52,211,153)' }}
                                data-testid={`scene-regen-video-${sceneId}`}
                                title={titleText}
                              >
                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> {label}
                                {pct != null && (
                                  <span
                                    className="ml-1 inline-block h-1 w-8 rounded-full overflow-hidden"
                                    style={{ backgroundColor: 'rgba(16,185,129,0.2)' }}
                                    data-testid={`scene-regen-video-progress-${sceneId}`}
                                  >
                                    <span
                                      className="block h-full transition-all"
                                      style={{ width: `${pct}%`, backgroundColor: 'rgb(52,211,153)' }}
                                    />
                                  </span>
                                )}
                                {etaText && (
                                  <span
                                    className="ml-1 opacity-80"
                                    data-testid={`scene-regen-video-eta-${sceneId}`}
                                  >
                                    {etaText}
                                  </span>
                                )}
                              </span>
                            );
                          })() : scene.assets?.videoProvider && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-0.5" style={{ borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.1)', color: 'rgb(52,211,153)' }}>
                              <Video className="w-2.5 h-2.5" /> {formatProviderName(scene.assets.videoProvider)}
                            </span>
                          )}
                          {/* Phase 20C: brand-reference compatibility badge on the scene card.
                              Green when refs attached + provider is Seedance 2 (anchored).
                              Amber when refs attached but provider is incompatible. */}
                          {(() => {
                            const sceneTyped = scene as Scene;
                            const refs: BrandReferenceInput[] = sceneTyped.brandReferences || [];
                            if (refs.length === 0) return null;
                            const provider = (sceneTyped.assets?.videoProvider || sceneTyped.assets?.requestedProvider || '').toLowerCase();
                            const isSeedance2 = provider.startsWith('seedance-2') || provider === 'seedance-2.0' || provider === 'seedance-2.0-fast';
                            // No render yet — show neutral pending chip.
                            if (!provider) {
                              return (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-0.5"
                                  style={{ borderColor: 'rgba(99,102,241,0.3)', backgroundColor: 'rgba(99,102,241,0.1)', color: 'rgb(165,180,252)' }}
                                  title={`${refs.length} brand reference${refs.length === 1 ? '' : 's'} attached — will anchor on Seedance 2`}
                                  data-testid={`scene-brand-ref-pending-${sceneId}`}
                                >
                                  <ImageIcon className="w-2.5 h-2.5" /> {refs.length} ref{refs.length === 1 ? '' : 's'}
                                </span>
                              );
                            }
                            return isSeedance2 ? (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-0.5"
                                style={{ borderColor: 'rgba(34,197,94,0.35)', backgroundColor: 'rgba(34,197,94,0.1)', color: 'rgb(74,222,128)' }}
                                title={`Anchored with ${refs.length} brand reference${refs.length === 1 ? '' : 's'} via Seedance 2 omni_reference`}
                                data-testid={`scene-brand-ref-anchored-${sceneId}`}
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" /> Anchored · {refs.length}
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-0.5 transition-colors hover:bg-amber-500/20 hover:border-amber-500/60 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                                style={{ borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.12)', color: 'rgb(252,211,77)' }}
                                title={`${refs.length} brand reference${refs.length === 1 ? '' : 's'} attached but rendered with ${formatProviderName(scene.assets?.videoProvider || '')} — click to switch this scene to Seedance 2 and anchor your brand`}
                                data-testid={`scene-brand-ref-mismatch-switcher-${sceneId}`}
                                disabled={switchProviderLockMutation.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Phase 20C — one-click switcher on the scene-card
                                  // amber chip. Mirrors the editor-level
                                  // onSwitchProvider path: locks this scene to
                                  // seedance-2.0 so the omni_reference path is
                                  // armed on the next render. Does NOT auto-regen
                                  // — user can then hit "Re-anchor" or the regen
                                  // affordance to actually run with refs.
                                  switchProviderLockMutation.mutate({ sceneId, provider: 'seedance-2.0' });
                                }}
                              >
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {switchProviderLockMutation.isPending && switchProviderLockMutation.variables?.sceneId === sceneId ? 'Switching…' : 'Switch to Seedance 2'}
                              </button>
                            );
                          })()}
                        </div>
                        <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {narration.substring(0, 80)}{narration.length > 80 ? "..." : ""}
                        </p>
                        {/* Phase 20C: post-gen verification row on the scene card.
                            When refs are attached AND a video has been rendered, show
                            a tiny "ref → first frame" strip with a Re-anchor action. */}
                        {(() => {
                          const sceneTyped = scene as Scene;
                          const refs: BrandReferenceInput[] = sceneTyped.brandReferences || [];
                          const renderedVideoUrl = sceneTyped.background?.videoUrl || sceneTyped.assets?.videoUrl;
                          if (refs.length === 0 || !renderedVideoUrl) return null;
                          return (
                            <div
                              className="mt-1 flex items-center gap-1.5"
                              data-testid={`scene-card-postgen-verification-${sceneId}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                                Anchoring:
                              </span>
                              <div className="flex items-center gap-0.5">
                                {refs.slice(0, 3).map((r, i) => (
                                  <img
                                    key={`pgv-${i}`}
                                    src={r.assetUrl}
                                    alt={r.label || r.tag || `image${i + 1}`}
                                    className="w-5 h-5 object-cover rounded border"
                                    style={{ borderColor: 'var(--border-subtle)' }}
                                    title={`@${r.tag || `image${i + 1}`}`}
                                  />
                                ))}
                                {refs.length > 3 && (
                                  <span className="text-[9px] ml-0.5" style={{ color: 'var(--text-muted)' }}>+{refs.length - 3}</span>
                                )}
                              </div>
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>→</span>
                              <video
                                src={renderedVideoUrl}
                                className="w-9 h-5 object-cover rounded border"
                                style={{ borderColor: 'var(--border-subtle)' }}
                                muted
                                playsInline
                                preload="metadata"
                                title="First frame of last render"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Phase 20C: directly trigger a STRONGER-anchoring
                                  // regen for this scene. Sends `strongAnchor: true`
                                  // so the server appends the explicit anchoring
                                  // phrase ("The exact product shown in @image1,
                                  // identical packaging frame-to-frame…") to the
                                  // effective prompt before building the
                                  // omni_reference payload. No editor open required.
                                  if (regenVideoMutation.isPending) return;
                                  regenVideoMutation.mutate({ sceneId, strongAnchor: true });
                                }}
                                disabled={regenVideoMutation.isPending}
                                className="text-[10px] px-1.5 py-0.5 rounded hover:bg-green-500/15 transition-colors underline-offset-2 hover:underline disabled:opacity-50"
                                style={{ color: 'rgb(74,222,128)' }}
                                data-testid={`scene-card-reanchor-${sceneId}`}
                                title="Re-generate this scene with the attached brand references for stronger anchoring"
                              >
                                {regenVideoMutation.isPending ? 'Re-anchoring…' : 'Re-anchor'}
                              </button>
                            </div>
                          );
                        })()}
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
                        {(scriptReady || isStudioPolish) && scenes.length > 1 && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); if (index > 0) moveSceneMutation.mutate({ fromIndex: index, toIndex: index - 1 }); }}
                              disabled={index === 0 || moveSceneMutation.isPending}
                              className="p-1.5 rounded-lg border transition-colors hover:border-amber-500/30 disabled:opacity-30"
                              style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                              title="Move scene up"
                              data-testid={`button-move-scene-up-${sceneId}`}
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); if (index < scenes.length - 1) moveSceneMutation.mutate({ fromIndex: index, toIndex: index + 1 }); }}
                              disabled={index === scenes.length - 1 || moveSceneMutation.isPending}
                              className="p-1.5 rounded-lg border transition-colors hover:border-amber-500/30 disabled:opacity-30"
                              style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                              title="Move scene down"
                              data-testid={`button-move-scene-down-${sceneId}`}
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {(scriptReady || isStudioPolish) && (
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

                    {/* Phase 44: Creative Brief — per-scene editable summary */}
                    {isExpanded && scriptReady && !isStudioPolish && (
                      <div
                        className="px-4 py-3 border-t space-y-3"
                        style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(124,58,237,0.04)" }}
                        data-testid={`scene-brief-${sceneId}`}
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Scene Brief</span>
                        </div>
                        {/* Task 61: Storyboard thumbnail preview */}
                        {(() => {
                          const thumbStatus = (scene as any).thumbnailStatus as string | undefined;
                          const thumbUrl = (scene as any).thumbnailUrl as string | undefined;
                          const thumbErr = (scene as any).thumbnailError as string | undefined;
                          const thumbGeneratedFor = (scene as any).thumbnailGeneratedFor as string | undefined;
                          const isGenerating =
                            thumbStatus === 'generating' ||
                            (generateThumbnailMutation.isPending && generateThumbnailMutation.variables === sceneId);
                          const currentFingerprint = computeSceneFingerprint(scene);
                          const isStale = !!thumbUrl && !isGenerating && thumbGeneratedFor !== currentFingerprint;
                          const aspectRatio = project?.outputFormat?.aspectRatio || '16:9';
                          const aspectClass = aspectRatio === '9:16' ? 'aspect-[9/16] w-24' : aspectRatio === '1:1' ? 'aspect-square w-32' : 'aspect-video w-44';
                          return (
                            <div className="flex items-start gap-3">
                              <div
                                className={`${aspectClass} rounded-lg border overflow-hidden flex items-center justify-center flex-shrink-0`}
                                style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(124,58,237,0.08)" }}
                                data-testid={`scene-thumbnail-${sceneId}`}
                              >
                                {isGenerating ? (
                                  <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                                ) : thumbUrl ? (
                                  <img src={thumbUrl} alt="Scene preview" className="w-full h-full object-cover" />
                                ) : (
                                  <Sparkles className="w-5 h-5 text-purple-400/40" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); generateThumbnailMutation.mutate(sceneId); }}
                                    disabled={isGenerating}
                                    className="self-start text-xs px-2.5 py-1 rounded-md border transition-colors hover:border-purple-400/50 disabled:opacity-50 inline-flex items-center gap-1.5"
                                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                                    data-testid={`button-regen-thumbnail-${sceneId}`}
                                  >
                                    {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                    {thumbUrl ? 'Regenerate thumbnail' : 'Generate thumbnail'}
                                  </button>
                                  {/* Phase 21B (Task #106): NB2 storyboard regen — themed AlertDialog confirm. */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setStoryRegenDialog({ open: true, sceneId }); }}
                                    disabled={generateStorySceneMutation.isPending && generateStorySceneMutation.variables === sceneId}
                                    className="self-start text-xs px-2.5 py-1 rounded-md border transition-colors hover:border-purple-400/50 disabled:opacity-50 inline-flex items-center gap-1.5"
                                    style={{ borderColor: "rgba(124,58,237,0.4)", color: "rgb(216,180,254)", backgroundColor: "rgba(124,58,237,0.08)" }}
                                    data-testid={`button-regen-storyboard-${sceneId}`}
                                    title="Generate 3 NB2 candidates and let Vision QA pick the best one."
                                  >
                                    {generateStorySceneMutation.isPending && generateStorySceneMutation.variables === sceneId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                    Storyboard (3-candidate)
                                  </button>
                                  {/* Model badge */}
                                  {(scene as any).imageGenerationModel && (
                                    <span
                                      className="text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1"
                                      style={(scene as any).imageGenerationModel === 'nano-banana-2'
                                        ? { borderColor: "rgba(124,58,237,0.4)", backgroundColor: "rgba(124,58,237,0.12)", color: "rgb(216,180,254)" }
                                        : (scene as any).imageGenerationModel === 'recraft-v4-pro'
                                          ? { borderColor: "rgba(245,158,11,0.4)", backgroundColor: "rgba(245,158,11,0.12)", color: "rgb(252,211,77)" }
                                          : { borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                                      data-testid={`badge-image-model-${sceneId}`}
                                    >
                                      {(scene as any).imageGenerationModel === 'nano-banana-2' ? 'NB2' : (scene as any).imageGenerationModel === 'recraft-v4-pro' ? 'Recraft Pro' : 'Flux'}
                                    </span>
                                  )}
                                  {/* Task #112: NB2 resolution-tier badge — shows
                                       which billing tier this scene was generated at
                                       (1K $0.06, 2K $0.08, 4K $0.12 per image). */}
                                  {(scene as any).imageGenerationModel === 'nano-banana-2' && (scene as any).nb2Resolution && (
                                    <span
                                      className="text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center"
                                      style={{ borderColor: "rgba(124,58,237,0.3)", backgroundColor: "rgba(124,58,237,0.06)", color: "rgb(196,181,253)" }}
                                      data-testid={`badge-nb2-resolution-${sceneId}`}
                                      title={`Billed at NB2 ${(scene as any).nb2Resolution} tier — change via STORYBOARD_NB2_RESOLUTION.`}
                                    >
                                      {(scene as any).nb2Resolution}
                                    </span>
                                  )}
                                  {isStale && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); generateThumbnailMutation.mutate(sceneId); }}
                                      disabled={isGenerating}
                                      className="text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                                      title="The narration or visual prompt changed since this thumbnail was generated."
                                      data-testid={`badge-thumbnail-stale-${sceneId}`}
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                      Stale — regenerate
                                    </button>
                                  )}
                                </div>
                                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                  {isGenerating
                                    ? 'Rendering preview…'
                                    : thumbErr
                                      ? `Error: ${thumbErr}`
                                      : isStale
                                        ? 'Preview is out of date — narration or prompt changed.'
                                        : thumbUrl
                                          ? 'Cheap preview — final video may differ.'
                                          : 'Sanity-check the visual style before generating.'}
                                </span>
                                {/* Phase 21B (Task #106): NB2 candidate strip — click to override the auto-pick. */}
                                {Array.isArray((scene as any).imageCandidates) && (scene as any).imageCandidates.length > 1 && (
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap" data-testid={`candidates-strip-${sceneId}`}>
                                    <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Candidates:</span>
                                    {(scene as any).imageCandidates.map((cand: any, ci: number) => (
                                      <button
                                        key={`${cand.url}-${ci}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (cand.selected) return;
                                          pickStoryboardCandidateMutation.mutate({
                                            sceneId,
                                            candidateUrl: cand.url,
                                            candidates: (scene as any).imageCandidates,
                                          });
                                        }}
                                        disabled={pickStoryboardCandidateMutation.isPending}
                                        className={`relative h-10 w-14 rounded-md border overflow-hidden transition-all ${cand.selected ? 'ring-2 ring-purple-400' : 'opacity-70 hover:opacity-100'} disabled:cursor-wait`}
                                        style={{ borderColor: cand.selected ? "rgb(192,132,252)" : "var(--border-subtle)" }}
                                        title={`Score ${(cand.score ?? 0).toFixed(2)}${cand.reason ? ` — ${cand.reason}` : ''}`}
                                        data-testid={`candidate-${sceneId}-${ci}`}
                                      >
                                        <img src={cand.url} alt="" className="w-full h-full object-cover" />
                                        <span className="absolute bottom-0 right-0 text-[8px] px-1 bg-black/60 text-white rounded-tl-md">
                                          {(cand.score ?? 0).toFixed(2)}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Visual Style</label>
                            <select
                              value={scene.artPresetId || ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                const updates = !v
                                  ? { artPresetId: null, assignedStyleId: null }
                                  : { artPresetId: v, assignedStyleId: v };
                                updateSceneMutation.mutate(
                                  { sceneId, updates },
                                  {
                                    onSuccess: () => {
                                      // Task 61: always refresh thumbnail when assigned style changes
                                      generateThumbnailMutation.mutate(sceneId);
                                    },
                                  }
                                );
                              }}
                              className="w-full text-sm rounded-lg border px-2.5 py-1.5 bg-transparent outline-none"
                              style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                              data-testid={`scene-style-${sceneId}`}
                            >
                              <option value="">Auto / inherit project</option>
                              {getAllVisualArtPresets().map((p: any) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Shot Type</label>
                            <select
                              value={scene.shotType || ""}
                              onChange={(e) => updateSceneMutation.mutate({ sceneId, updates: { shotType: e.target.value } })}
                              className="w-full text-sm rounded-lg border px-2.5 py-1.5 bg-transparent outline-none"
                              style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                              data-testid={`scene-shot-${sceneId}`}
                            >
                              <option value="">— pick shot —</option>
                              {["ECU","CU","MS","WS","EWS","POV","OTS","aerial","macro"].map(st => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>On-screen Text</label>
                            <input
                              type="text"
                              defaultValue={scene.onScreenText || ""}
                              placeholder="Short caption (3–8 words)"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v !== (scene.onScreenText || "")) {
                                  updateSceneMutation.mutate({ sceneId, updates: { onScreenText: v } });
                                }
                              }}
                              className="w-full text-sm rounded-lg border px-2.5 py-1.5 bg-transparent outline-none"
                              style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                              data-testid={`scene-onscreen-${sceneId}`}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Lower-third</label>
                            <input
                              type="text"
                              defaultValue={scene.lowerThird || ""}
                              placeholder="Speaker / location / stat"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v !== (scene.lowerThird || "")) {
                                  updateSceneMutation.mutate({ sceneId, updates: { lowerThird: v } });
                                }
                              }}
                              className="w-full text-sm rounded-lg border px-2.5 py-1.5 bg-transparent outline-none"
                              style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                              data-testid={`scene-lowerthird-${sceneId}`}
                            />
                          </div>
                        </div>
                        {scene.cinematicNotes && (
                          <p className="text-[11px] italic leading-relaxed" style={{ color: "var(--text-muted)" }}>
                            <span className="font-semibold">Director's note:</span> {scene.cinematicNotes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Expanded Scene Content - Enhanced Editor */}
                    {isExpanded && (
                      <EnhancedSceneEditor
                        scene={scene}
                        sceneIndex={index}
                        projectId={projectId}
                        onClose={() => setExpandedSceneId(null)}
                        aspectRatio={project?.outputFormat?.aspectRatio || "16:9"}
                        artPresetId={project?.progress?.artPresetId || (project as any)?.artPresetId}
                        characters={projectCharacters}
                        onCharactersChange={setProjectCharacters}
                        projectMode={(project?.progress as any)?.projectMode}
                        projectPreferredProvider={project?.preferredProvider}
                        deckImages={(project?.progress as any)?.deckImages || []}
                        allScenes={scenes}
                        brandColors={(() => {
                          const bc = project?.brand?.colors;
                          if (bc && typeof bc === 'object' && !Array.isArray(bc)) {
                            return [bc.primary, bc.secondary, bc.accent, bc.text, bc.textLight].filter(Boolean);
                          }
                          const vc = project?.brandSettings?.colors;
                          return Array.isArray(vc) ? vc : undefined;
                        })()}
                        brand={normalizeProjectBrand(project)}
                      />
                    )}
                  </div>
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
                        onClick={() => {
                          setReferenceImages((prev) => {
                            const updated = prev.filter((_, idx) => idx !== i);
                            persistProjectReferenceImages(updated);
                            return updated;
                          });
                        }}
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
                                setReferenceImages((prev) => {
                                  const updated = [...prev, url];
                                  persistProjectReferenceImages(updated);
                                  return updated;
                                });
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

              {!isStudioPolish && (
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
              )}
            </div>

            {!isStudioPolish && (
            <div
              className="flex items-start gap-3 p-3 rounded-xl border"
              style={{ backgroundColor: "rgba(124, 58, 237, 0.06)", borderColor: "rgba(124, 58, 237, 0.25)" }}
              data-testid="seamless-transitions-toggle"
            >
              <Film className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Seamless transitions
                  </p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={seamlessTransitions}
                    onClick={() => setSeamlessTransitions((v) => !v)}
                    disabled={isGenerating || generateAllMutation.isPending}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${
                      seamlessTransitions
                        ? "bg-purple-500 border-purple-500"
                        : "bg-muted border-border"
                    }`}
                    data-testid="switch-seamless-transitions"
                  >
                    <span
                      className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${
                        seamlessTransitions ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Each scene starts where the last one ended — same subject, lighting, and environment carry over for cinematic continuity. Seedance 2 scenes use native first/last-frame anchoring.
                </p>
                {seamlessTransitions && (
                  <p className="text-[11px] mt-1 flex items-center gap-1 text-amber-500">
                    <AlertTriangle className="w-3 h-3" />
                    Continuity is applied sequentially after parallel generation — adds roughly 1× generation time per scene ({scenes.length} scenes ≈ +{scenes.length}× wait).
                  </p>
                )}
              </div>
            </div>
            )}

            {cinematicFlowRunning && (
              <div
                className="flex items-start gap-3 p-3 rounded-xl border"
                style={{ backgroundColor: "rgba(124, 58, 237, 0.08)", borderColor: "rgba(124, 58, 237, 0.35)" }}
                data-testid="cinematic-flow-status"
              >
                <Loader2 className="w-4 h-4 text-purple-400 mt-0.5 shrink-0 animate-spin" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      Seamless transitions in progress
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => cancelCinematicFlowMutation.mutate()}
                      disabled={cinematicFlowCancelPending || cancelCinematicFlowMutation.isPending}
                      data-testid="button-cancel-cinematic-flow"
                      className="h-7 px-3 text-xs"
                    >
                      {cinematicFlowCancelPending || cancelCinematicFlowMutation.isPending ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Cancelling…
                        </>
                      ) : (
                        <>
                          <X className="w-3 h-3 mr-1" />
                          Cancel
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    Scene {Math.min((cinematicFlowStatus?.completed ?? 0) + (cinematicFlowStatus?.failed ?? 0) + 1, cinematicFlowStatus?.total ?? 0)} of {cinematicFlowStatus?.total ?? 0}
                    {cinematicFlowStatus?.completed ? ` · ${cinematicFlowStatus.completed} done` : ""}
                    {cinematicFlowStatus?.failed ? ` · ${cinematicFlowStatus.failed} failed` : ""}
                  </p>
                  {cinematicFlowCancelPending && (
                    <p className="text-[11px] mt-1 text-amber-500">
                      Stopping after the current scene finishes or its provider task is aborted.
                    </p>
                  )}
                </div>
              </div>
            )}

            {!isStudioPolish && (
            <>
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
              <span className="text-xs px-3 py-1" style={{ color: "var(--text-muted)" }}>
                or generate individually
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PIPELINE_STEPS.filter(s => s.key !== "assembly" && s.key !== "script").map((step) => {
                const status = getStepStatus(step.key);
                const Icon = step.icon;
                const isCompleted = status === "completed";
                const isInProgress = status === "in-progress";
                return (
                  <button
                    key={step.key}
                    onClick={() => generateStepMutation.mutate(step.key)}
                    disabled={isGenerating || generateStepMutation.isPending}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      borderColor: isCompleted ? "rgba(16,185,129,0.3)" : isInProgress ? "rgba(96,165,250,0.3)" : "var(--border-medium)",
                      color: isCompleted ? "var(--text-muted)" : "var(--text-primary)",
                      backgroundColor: isCompleted ? "rgba(16,185,129,0.05)" : isInProgress ? "rgba(96,165,250,0.05)" : "transparent",
                    }}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isInProgress ? (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    ) : (
                      <Icon className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                    )}
                    {step.label}
                  </button>
                );
              })}
            </div>
            </>
            )}
          </div>
        )}
      </div>

      {/* Phase 21B (Task #106): NB2 storyboard regen confirmation. */}
      <AlertDialog
        open={storyRegenDialog.open}
        onOpenChange={(open) => setStoryRegenDialog({ open, sceneId: open ? storyRegenDialog.sceneId : null })}
      >
        <AlertDialogContent data-testid="storyboard-regen-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Generate 3 storyboard candidates?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This generates 3 NB2 candidates at {storyboardResolution} (~${(3 * getNB2CostPerImage(storyboardResolution)).toFixed(2)}) and uses Claude Vision QA to pick the best one. The winner becomes both the scene thumbnail and the seed image used to anchor the final video render.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setStoryRegenDialog({ open: false, sceneId: null })}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const sId = storyRegenDialog.sceneId;
                setStoryRegenDialog({ open: false, sceneId: null });
                if (sId) generateStorySceneMutation.mutate(sId);
              }}
              data-testid="storyboard-regen-confirm"
            >
              Generate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase 21B (Task #106): Budget over-cap confirmation. */}
      <AlertDialog
        open={budgetConfirmDialog.open}
        onOpenChange={(open) => setBudgetConfirmDialog({ open, estimate: open ? budgetConfirmDialog.estimate : null })}
      >
        <AlertDialogContent data-testid="storyboard-budget-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Storyboard exceeds budget cap
            </AlertDialogTitle>
            <AlertDialogDescription>
              Estimated cost ${(budgetConfirmDialog.estimate?.estimatedCost ?? 0).toFixed(2)} for {budgetConfirmDialog.estimate?.scenesToGenerate ?? 0} scene(s) at {budgetConfirmDialog.estimate?.resolution ?? storyboardResolution}{' '}
              (${(budgetConfirmDialog.estimate?.perImageCost ?? getNB2CostPerImage(storyboardResolution)).toFixed(2)}/image) is above the cap of ${(budgetConfirmDialog.estimate?.budgetCap ?? 0).toFixed(2)}. Higher tiers like 2K/4K hit the cap faster — continue anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBudgetConfirmDialog({ open: false, estimate: null })}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setBudgetConfirmDialog({ open: false, estimate: null });
                generateStoryboardBatchMutation.mutate(true);
              }}
              data-testid="storyboard-budget-confirm"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function CreativeStrategyPanel({ strategy }: { strategy: any }) {
  const [expanded, setExpanded] = useState(false);
  if (!strategy) return null;

  const items = [
    { label: "Narrative Framework", value: strategy.narrativeFramework },
    { label: "Core Message", value: strategy.coreMessage },
    { label: "Primary Emotion", value: strategy.primaryEmotion },
    { label: "Opening Hook", value: strategy.openingHook },
    { label: "Tone", value: strategy.toneGuidance },
    { label: "Audience Insight", value: strategy.targetAudienceInsight },
    { label: "Production Notes", value: strategy.productionNotes },
  ].filter((i) => i.value);

  if (items.length === 0) return null;

  return (
    <div className="border rounded-xl mb-8 overflow-hidden" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
      <button
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Creative Strategy</span>
          {!expanded && strategy.narrativeFramework && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--purple-subtle, rgba(147,51,234,0.1))", color: "var(--text-secondary)" }}>
              {strategy.narrativeFramework}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" style={{ color: "var(--text-muted)" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          {items.map((item) => (
            <div key={item.label} className="pt-3">
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{item.label}</p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{item.value}</p>
            </div>
          ))}
          {strategy.hooks?.length > 0 && (
            <div className="pt-3">
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Generated Hooks</p>
              <div className="space-y-1">
                {strategy.hooks.map((hook: string, i: number) => (
                  <p key={i} className="text-sm" style={{ color: "var(--text-secondary)" }}>"{hook}"</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProjectDetail({ params }: { params?: { id: string } }) {
  const projectId = params?.id || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);

  const { data: project, isLoading, error } = useQuery<any, Error & { status?: number }>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) {
        // Preserve the real HTTP status on the thrown error so the
        // empty-state UI can distinguish "actually missing" (404) from
        // "session expired" (401), "not your project" (403) and
        // "server crashed" (500). Otherwise every failure looks like
        // a deletion to the user, which is what motivated this fix.
        let body: any = null;
        try { body = await res.json(); } catch { /* non-JSON */ }
        const err: Error & { status?: number } = new Error(
          body?.error || body?.message || `Request failed (${res.status})`
        );
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    enabled: !!projectId,
    retry: (failureCount, err) => {
      const status = (err as any)?.status;
      // Don't retry on hard client errors — they won't fix themselves.
      if (status === 404 || status === 403 || status === 401) return false;
      return failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5000;
      const activeStatuses = ["generating", "queued", "processing", "rendering", "render_queued", "lambda_pending"];
      if (activeStatuses.includes(data.status)) return 5000;
      if (data.jobs?.some((j: any) => j.status === "pending" || j.status === "running")) return 5000;
      return false;
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

  // Task #119: bulk-reclassify every scene's render system. The
  // server-side endpoint already exists (POST /classify-scenes); we
  // pass `force: true` so previously auto-classified scenes are
  // re-evaluated (manually-overridden scenes stay locked — that skip
  // is enforced inside `scene-classifier.service.shouldSkip`).
  // The histogram component owns the in-flight spinner; we just await
  // the network call and surface failures via toast.
  const reclassifyAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/universal-video/projects/${projectId}/classify-scenes`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to reclassify scenes');
      return data as {
        success: true;
        classified: number;
        skipped: number;
        distribution: Record<string, number>;
        missingKey?: boolean;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      const desc = data.missingKey
        ? 'No ANTHROPIC_API_KEY configured — scenes received the neutral fallback. Ask an admin to set the key.'
        : `${data.classified} scene${data.classified === 1 ? '' : 's'} reclassified, ${data.skipped} skipped (manual overrides preserved).`;
      toast({
        title: data.missingKey ? 'Reclassify completed (fallback)' : 'Reclassified',
        description: desc,
        variant: data.missingKey ? 'destructive' : undefined,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Reclassify failed', description: err.message, variant: 'destructive' });
    },
  });

  // Phase 20C: bulk-attach the project's primary product image to every
  // product/solution scene that has no brand references yet. Idempotent.
  const applyProductReferencesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/universal-video/projects/${projectId}/apply-product-references`,
        { method: 'POST', credentials: 'include' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to apply product references');
      return data as { attachedCount: number; skippedAlreadyHasRefs: number; message: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast({
        title: data.attachedCount > 0 ? 'Brand references applied' : 'Nothing to apply',
        description: data.message,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
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

  if (!project && (error || !isLoading)) {
    // Map the preserved HTTP status onto an honest empty state. The
    // previous implementation always claimed "Project Not Found" which
    // misled users whose session had simply expired or whose request
    // 500ed transiently — they thought their work had been deleted.
    const status = (error as any)?.status as number | undefined;
    const errMsg = error?.message;
    const heading =
      status === 404 ? "Project Not Found"
      : status === 403 ? "You don't have access to this project"
      : status === 401 ? "Please log in again"
      : status && status >= 500 ? "We couldn't load this project"
      : "Couldn't load this project";
    const detail =
      status === 404 ? "The project you're looking for doesn't exist or has been deleted."
      : status === 403 ? "This project belongs to a different account. Switch accounts or open it from that workspace."
      : status === 401 ? "Your session expired while you were away. Log in to pick up where you left off."
      : status && status >= 500 ? `Something went wrong on our end${errMsg ? ` (${errMsg})` : ""}. Try again in a moment — your project is safe.`
      : `Something went wrong${errMsg ? `: ${errMsg}` : ""}. Check your connection and try again.`;
    return (
      <div className="p-6 lg:p-8">
        <Link href="/projects" className="text-sm inline-flex items-center gap-1 mb-6" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </Link>
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{heading}</h2>
          <p className="max-w-md text-center" style={{ color: "var(--text-secondary)" }}>{detail}</p>
          <div className="flex items-center gap-2 mt-2">
            {status === 401 ? (
              <Button asChild variant="default">
                <a href="/auth">Log in</a>
              </Button>
            ) : status !== 404 && status !== 403 ? (
              <Button onClick={() => window.location.reload()} variant="default">
                Try again
              </Button>
            ) : null}
            <Link href="/projects">
              <Button variant="outline">Back to Projects</Button>
            </Link>
          </div>
          {projectId ? (
            <p className="text-[10px] mt-4 font-mono opacity-60" style={{ color: "var(--text-muted)" }}>
              {status ? `HTTP ${status} · ` : ""}id: {projectId}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const outputFormat = project.outputFormat || {};
  const progress = project.progress || {};
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  const jobs = Array.isArray(project.jobs) ? project.jobs : [];
  const isQuickCreate = outputFormat.platform === "quick-create";
  const isLongStory = (project.progress as any)?.projectType === 'long-story';
  const isStudioPolish = (project.progress as any)?.projectMode === 'studio-polish';
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
                {isStudioPolish ? (
                  <span className="inline-flex items-center gap-1 text-amber-400 font-medium mr-1">
                    Studio Polish
                  </span>
                ) : project.type} · Created {formatDate(project.createdAt)}
                {(() => {
                  const artPresetId = project.progress?.artPresetId || (project as any).artPresetId;
                  const artPreset = artPresetId ? getVisualArtPreset(artPresetId) : null;
                  if (!artPreset) return null;
                  return (
                    <span className="inline-flex items-center gap-1 ml-2">
                      · <Palette className="w-3 h-3 inline" /> {artPreset.name}
                    </span>
                  );
                })()}
              </p>
              {/* Task #119: project-wide render-mix at a glance. Hidden
                  while there are no scenes yet (the component returns
                  null in that case); when scenes exist, an inline
                  "Reclassify all" button calls POST /classify-scenes
                  with `force: true` and refreshes the project. */}
              {!isStudioPolish && (
                <RenderTypeHistogram
                  scenes={scenes}
                  onReclassifyAll={async () => {
                    // Swallow the rejection: the mutation's `onError`
                    // already surfaces the failure via toast. Re-throwing
                    // would just bubble up as an unhandled promise
                    // rejection because React's onClick doesn't await.
                    try {
                      await reclassifyAllMutation.mutateAsync();
                    } catch {
                      /* toast already fired in mutation onError */
                    }
                  }}
                />
              )}
              {/* Phase 23B (Task #174): "Re-render upgraded scenes" — pick
                  every scene whose current renderSystemType no longer
                  matches the handler that ran last time, and enqueue
                  fresh generation jobs for each. Hidden when no scenes
                  qualify so the row stays clean. */}
              {!isStudioPolish && (
                <ReRenderUpgradedScenesButton
                  scenes={scenes}
                  projectId={project.id}
                />
              )}
              <ProjectSceneDefaultsSection
                isStudioPolish={isStudioPolish}
                projectId={project.id}
                scenes={scenes}
                projectPreferredProvider={project.preferredProvider}
                onUpdated={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["project", projectId],
                  })
                }
              />
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
            {/* Phase 20C: bulk-apply primary product image as @image1 reference
                to every product/solution scene that lacks brand references.
                Always rendered — the backend resolves the source itself,
                falling back to a global default brand-media image when the
                project has no productImages. UX matches the auto-apply path. */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              style={{ borderColor: 'var(--border-medium)', color: 'var(--text-secondary)' }}
              onClick={() => applyProductReferencesMutation.mutate()}
              disabled={applyProductReferencesMutation.isPending}
              data-testid="apply-product-references-button"
              title={
                ((project as any)?.assets?.productImages?.length || 0) > 0
                  ? "Attach your primary product image as @image1 to every product/solution scene that doesn't already have a brand reference. Idempotent."
                  : "No product images on this project — will try to use the global default brand image (mark one as default in your brand library). Idempotent."
              }
            >
              <ImagePlus className="w-4 h-4" />
              {applyProductReferencesMutation.isPending
                ? 'Applying...'
                : 'Apply product to scenes'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-400 hover:text-red-300"
              style={{ borderColor: "var(--border-medium)" }}
              onClick={() => setDeleteProjectDialogOpen(true)}
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
          {project.outputUrl && (
            <CanvaSyncCard projectId={project.projectId} hasOutput={!!project.outputUrl} />
          )}
        </div>

        {project.description && (
          <div className="border rounded-xl p-5 mb-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
              {isQuickCreate ? "Prompt" : "Description"}
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "var(--text-primary)" }}>{project.description}</p>
          </div>
        )}

        <CreativeStrategyPanel strategy={project.scriptStrategy} />

        {progress.currentStep && !isQuickCreate && (() => {
          const stepSt = progress.steps?.[progress.currentStep]?.status;
          const running = stepSt === 'in-progress' || stepSt === 'pending';
          const done = stepSt === 'completed' || stepSt === 'complete' ||
            (Array.isArray(progress.completedSteps) && progress.completedSteps.includes(progress.currentStep));
          const projectIsGenerating = ["generating", "queued", "processing"].includes(project.status);
          if (done || (!running && !projectIsGenerating)) return null;
          return (
            <div className="border rounded-xl p-5 mb-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {progress.currentStep === 'assembly' ? 'Finalizing Assets' : progress.currentStep}
                  </p>
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
          );
        })()}

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
                      <img
                        key={scene.thumbnailUrl}
                        src={`${scene.thumbnailUrl}${scene.thumbnailUrl.includes('?') ? '&' : '?'}cb=${encodeURIComponent(scene.assets?.lastRegenAt || '')}`}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
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

        {isLongStory && (project.status === 'completed' || project.outputUrl) && scenes.length > 0 && (
          <RepurposePanel projectId={projectId} scenes={scenes} />
        )}

        <RenderConfigPanel projectId={projectId} projectOutputUrl={project.outputUrl} projectStatus={project.status} projectScenes={project.scenes} projectRenderId={project.renderId} projectAspectRatio={project?.outputFormat?.aspectRatio || '16:9'} projectTotalDuration={project?.totalDuration} />
      </div>

      <AlertDialog
        open={deleteProjectDialogOpen}
        onOpenChange={setDeleteProjectDialogOpen}
      >
        <AlertDialogContent data-testid="delete-project-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              Delete this project?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the project, its scenes, and any rendered videos. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDeleteProjectDialogOpen(false)}
              data-testid="delete-project-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteProjectDialogOpen(false);
                deleteMutation.mutate();
              }}
              className="bg-red-600 hover:bg-red-500"
              data-testid="delete-project-confirm"
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RepurposePanel({ projectId, scenes }: { projectId: string; scenes: any[] }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [repurposeType, setRepurposeType] = useState<'highlight' | 'clips' | null>(null);

  const repurposeMutation = useMutation({
    mutationFn: async (type: 'highlight' | 'clips') => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/repurpose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create repurposed project");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Project Created", description: `Repurposed project ready for editing.` });
      if (data.projectId) {
        navigate(`/projects/${data.projectId}`);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="border rounded-xl p-4 mt-4" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
      <h3 className="text-sm font-medium flex items-center gap-2 mb-3" style={{ color: "var(--text-primary)" }}>
        <Shuffle className="w-4 h-4 text-purple-400" />
        Repurpose Content
      </h3>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Turn your long-form video into shorter content for other platforms.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { setRepurposeType('highlight'); repurposeMutation.mutate('highlight'); }}
          disabled={repurposeMutation.isPending}
          className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all hover:border-purple-400/50"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
        >
          {repurposeMutation.isPending && repurposeType === 'highlight' ? (
            <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
          ) : (
            <Zap className="w-5 h-5 text-amber-400" />
          )}
          <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>60s Highlight Reel</span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Best moments condensed</span>
        </button>
        <button
          onClick={() => { setRepurposeType('clips'); repurposeMutation.mutate('clips'); }}
          disabled={repurposeMutation.isPending}
          className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all hover:border-purple-400/50"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
        >
          {repurposeMutation.isPending && repurposeType === 'clips' ? (
            <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
          ) : (
            <Layers className="w-5 h-5 text-blue-400" />
          )}
          <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>5 Social Clips</span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>TikTok / Reels / Shorts</span>
        </button>
      </div>
    </div>
  );
}

function DebouncedTextInput({ label, value, placeholder, onSave }: { label: string; value: string; placeholder: string; onSave: (val: string) => void }) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedValue = useRef(value);

  useEffect(() => {
    if (mountedValue.current !== value && !timerRef.current) {
      setLocal(value);
    }
    mountedValue.current = value;
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocal(newVal);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onSave(newVal);
    }, 600);
  };

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (local !== value) {
      onSave(local);
    }
  };

  return (
    <div>
      <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
      <input
        type="text"
        value={local}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 rounded-md border text-xs"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
      />
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

function IntroPreviewCard({ backgroundUrl, aspectRatio = '16/9' }: { backgroundUrl: string; aspectRatio?: string }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      <div className="relative group rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-subtle)' }}>
        <div style={{ aspectRatio, width: '100%' }}>
          <img src={backgroundUrl} alt="Intro background" className="w-full h-full object-cover" />
        </div>
        <div
          className="absolute top-1 left-1 px-1 py-0.5 rounded text-[7px] font-medium"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.7)' }}
        >
          Preview
        </div>
        <button
          onClick={() => setZoomed(true)}
          className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          title="Zoom preview"
        >
          <Maximize2 className="w-3 h-3 text-white/80" />
        </button>
      </div>
      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setZoomed(false)}
        >
          <div
            className="relative"
            style={{ maxWidth: 720, maxHeight: '85vh', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-subtle)', aspectRatio, width: '100%' }}>
              <img src={backgroundUrl} alt="Intro background" className="w-full h-full object-cover" />
            </div>
            <button
              onClick={() => setZoomed(false)}
              className="absolute -top-3 -right-3 p-1.5 rounded-full"
              style={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <X className="w-4 h-4 text-white" />
            </button>
            <div
              className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[10px]"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.6)' }}
            >
              {aspectRatio.replace('/', ':')} · Click outside to close
            </div>
          </div>
        </div>
      )}
    </>
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
      ) : renderStatus === "rendering" || startRenderMutation.isPending ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {startRenderMutation.isPending && renderStatus !== "rendering" ? "Preparing render..." : "Rendering..."}
              </span>
            </div>
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
              {startRenderMutation.isPending && renderStatus !== "rendering" ? "—" : `${Math.round(renderProgress)}%`}
            </span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--progress-track)" }}>
            {startRenderMutation.isPending && renderStatus !== "rendering" ? (
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-500 animate-pulse"
                style={{ width: "100%" }}
              />
            ) : (
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-500"
                style={{ width: `${renderProgress}%` }}
              />
            )}
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {startRenderMutation.isPending && renderStatus !== "rendering"
              ? "Caching assets and assembling micro-scenes for Lambda... This may take 1-3 minutes."
              : renderMessage || "Starting render..."}
          </p>
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

function RenderConfigPanel({ projectId, projectOutputUrl, projectStatus, projectScenes, projectRenderId, projectAspectRatio = '16:9', projectTotalDuration }: { projectId: string; projectOutputUrl?: string | null; projectStatus?: string; projectScenes?: any[]; projectRenderId?: string | null; projectAspectRatio?: string; projectTotalDuration?: number }) {
  const [expanded, setExpanded] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isProjectGenerating = ["generating", "queued", "processing"].includes(projectStatus || "");

  const settingsQuery = useQuery({
    queryKey: ["render-settings", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/universal-video/projects/${projectId}/render-settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch render settings");
      return res.json();
    },
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  const assetsQuery = useQuery({
    queryKey: ["quick-create-assets-render", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/quick-create/assets`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data) {
        const activeStatuses = ["generating", "queued", "processing"];
        const voActive = data.voiceover?.status && activeStatuses.includes(data.voiceover.status);
        const musicActive = data.music?.status && activeStatuses.includes(data.music.status);
        if (voActive || musicActive) return 5000;
      }
      return false;
    },
  });

  const quickAssets = assetsQuery.data || {};
  const voiceoverReady = quickAssets.voiceover?.status === "completed" && !!quickAssets.voiceover?.url;
  const musicReady = quickAssets.music?.status === "completed" && !!quickAssets.music?.url;

  const scenesFromProps = Array.isArray(projectScenes) ? projectScenes : [];
  const perSceneVoiceoverReady = scenesFromProps.length > 0 && scenesFromProps.some((s: any) => s.voiceoverUrl);
  const scenesHaveVideoFromProps = scenesFromProps.some((s: any) => s.assets?.videoUrl || s.background?.videoUrl || (s.microScenes && s.microScenes.some((ms: any) => ms.videoUrl || ms.imageUrl)));
  const scenesHaveVideoFromSettings = settingsQuery.data?.hasSceneVideos === true;
  const scenesHaveVideo = scenesHaveVideoFromProps || scenesHaveVideoFromSettings;

  const rawSettings = settingsQuery.data?.settings || {
    voiceover: { enabled: true, voiceId: null, hasGenerated: false },
    music: { enabled: true, volume: 0.18, hasGenerated: false },
    nativeVideoAudio: { enabled: false, volume: 0.8 },
    soundDesign: { enabled: true, transitionSounds: true, impactSounds: true, ambientLayer: true, ambientType: "nature", masterVolume: 1.0 },
    filmTreatment: { enabled: true, colorGrade: "warm-cinematic", grainIntensity: 0.03, vignetteIntensity: 0.2, letterbox: "none" },
    transitions: { enabled: true, style: "crossfade", duration: 0.5 },
    captions: { enabled: false, style: { preset: "capcut", fontSize: 52, position: "bottom" } },
    introEnabled: true,
    introTemplate: "classic-glow",
    outroEnabled: true,
    outroTemplate: "classic-glow",
    introBackgroundRandom: false,
    introBackgroundUrl: null as string | null,
    endCard: { enabled: true, duration: 5, taglineText: '', logoUrl: null as string | null, logoSize: 25, logoAnimation: 'scale-bounce', taglineAnimation: 'typewriter', contactAnimation: 'stagger', contactWebsite: '', contactPhone: '', contactEmail: '', ambientEffect: 'bokeh', backgroundUrl: null as string | null, logoPositionY: 32, taglinePositionY: 55, websitePositionY: 75, taglineFontSize: 28, taglineColor: '#E8D5B7', taglineFontFamily: 'Great Vibes', taglineBold: false, taglineFontWeight: 400, websiteFontSize: 22, websiteColor: '#FFFFFF', websiteBold: false, websiteFontWeight: 500, websiteFontFamily: 'Inter' },
    introCard: { enabled: true, duration: 4, taglineText: '', logoUrl: null as string | null, logoSize: 30, logoAnimation: 'scale-bounce', taglineAnimation: 'fade', contactAnimation: 'stagger', contactWebsite: '', contactPhone: '', contactEmail: '', ambientEffect: 'bokeh', backgroundUrl: null as string | null, logoPositionY: 32, taglinePositionY: 50, websitePositionY: 75, taglineFontSize: 28, taglineColor: '#E8D5B7', taglineFontFamily: 'Great Vibes', taglineBold: false, taglineFontWeight: 400, websiteFontSize: 22, websiteColor: '#FFFFFF', websiteBold: false, websiteFontWeight: 500, websiteFontFamily: 'Inter' },
  };

  const settings = {
    ...rawSettings,
    voiceover: {
      ...rawSettings.voiceover,
      hasGenerated: rawSettings.voiceover.hasGenerated || voiceoverReady || perSceneVoiceoverReady,
      duration: rawSettings.voiceover.duration || (voiceoverReady ? quickAssets.voiceover?.duration : undefined),
      url: rawSettings.voiceover.url || (voiceoverReady ? quickAssets.voiceover?.url : undefined),
    },
    music: {
      ...rawSettings.music,
      hasGenerated: rawSettings.music.hasGenerated || musicReady,
      url: rawSettings.music.url || (musicReady ? quickAssets.music?.url : undefined),
    },
  };

  const generateStepMutation = useMutation({
    mutationFn: async (args: string | { step: string; silentToast?: boolean }) => {
      const step = typeof args === "string" ? args : args.step;
      const res = await fetch(`/api/universal-video/projects/${projectId}/generate-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ step }),
      });
      if (!res.ok) throw new Error(`Failed to generate ${step}`);
      return res.json();
    },
    onSuccess: (_data, args) => {
      const step = typeof args === "string" ? args : args.step;
      const silent = typeof args === "object" && !!args.silentToast;
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["render-settings", projectId] });
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets-render", projectId] });
      if (!silent) {
        toast({ title: "Generation Started", description: `${step.charAt(0).toUpperCase() + step.slice(1)} generation started.` });
      }
    },
    onError: (err: Error, args) => {
      // When chained from "Shorten narration & re-record", the caller surfaces
      // its own combined recovery toast — don't double up.
      const silent = typeof args === "object" && !!args.silentToast;
      if (silent) return;
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateDurationMutation = useMutation({
    mutationFn: async (totalDuration: number) => {
      const res = await fetch(`/api/projects/${projectId}/quick-create/duration`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ totalDuration }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to update video length");
      return data as { totalDuration: number };
    },
    onSuccess: (data) => {
      // Mirror the QuickCreateAssetPanel invalidations so both panels refresh.
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["render-settings", projectId] });
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets-render", projectId] });
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets", projectId] });
      toast({ title: "Video length updated", description: `Set to ${data?.totalDuration}s.` });
    },
    onError: (err: Error) => {
      toast({ title: "Could not update video length", description: err.message, variant: "destructive" });
    },
  });

  // "Shorten narration to fit" from the Render Config tile. Persists script
  // server-side so the Voiceover editor picks up the rewrite. When `auto` is
  // set, the chained "Shorten narration & re-record" caller suppresses the
  // per-step toast and shows a single combined toast instead.
  const suggestNarrationMutation = useMutation({
    mutationFn: async (args: { durationSec?: number; tone?: "punchy" | "educational" | "story"; auto?: boolean }) => {
      const body: Record<string, unknown> = { persist: true };
      if (args.durationSec && Number.isFinite(args.durationSec)) body.durationSec = args.durationSec;
      if (args.tone === "punchy" || args.tone === "educational" || args.tone === "story") body.tone = args.tone;
      const res = await fetch(`/api/projects/${projectId}/quick-create/suggest-narration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to shorten narration");
      return data as { script: string; wordCount: number; targetWords?: number; persisted?: boolean };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets", projectId] });
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets-render", projectId] });
      queryClient.invalidateQueries({ queryKey: ["render-settings", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      if (!variables?.auto) {
        toast({
          title: "Narration shortened",
          description: `New script is ${data?.wordCount} words${data?.targetWords ? ` (target ~${data.targetWords})` : ""}. The Voiceover editor was updated — click Regenerate Voiceover to re-record.`,
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Could not shorten narration", description: err.message, variant: "destructive" });
    },
  });

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
    onMutate: async (patch: any) => {
      await queryClient.cancelQueries({ queryKey: ["render-settings", projectId] });
      const previousData = queryClient.getQueryData(["render-settings", projectId]);
      queryClient.setQueryData(["render-settings", projectId], (old: any) => {
        if (!old) return old;
        const oldSettings = old.settings || {};
        const mergedSettings = { ...oldSettings };
        for (const key of Object.keys(patch)) {
          if (typeof patch[key] === "object" && patch[key] !== null && typeof mergedSettings[key] === "object") {
            mergedSettings[key] = { ...mergedSettings[key], ...patch[key] };
          } else {
            mergedSettings[key] = patch[key];
          }
        }
        return { ...old, settings: mergedSettings };
      });
      return { previousData };
    },
    onSuccess: (data: any, patch: any) => {
      if (data?.settings) {
        queryClient.setQueryData(["render-settings", projectId], (old: any) => {
          if (!old) return old;
          const oldSettings = old.settings || {};
          const merged = { ...oldSettings };
          const patchKeys = Object.keys(patch || {});
          for (const key of patchKeys) {
            if (data.settings[key] !== undefined) {
              if (typeof data.settings[key] === 'object' && data.settings[key] !== null && typeof merged[key] === 'object' && merged[key] !== null) {
                merged[key] = { ...merged[key], ...data.settings[key] };
              } else {
                merged[key] = data.settings[key];
              }
            }
          }
          return { ...old, settings: merged };
        });
      }
    },
    onError: (err: Error, _patch, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["render-settings", projectId], context.previousData);
      }
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
                  <div className="flex items-center justify-between gap-2">
                    {settings.voiceover.hasGenerated ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> Ready{settings.voiceover.duration ? ` (${Math.round(settings.voiceover.duration)}s)` : ""}
                      </span>
                    ) : ["generating", "queued", "processing"].includes(quickAssets.voiceover?.status) ? (
                      <span className="flex items-center gap-1 text-xs text-blue-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <AlertCircle className="w-3 h-3" /> Not generated yet
                      </span>
                    )}
                    {!settings.voiceover.hasGenerated && !["generating", "queued", "processing"].includes(quickAssets.voiceover?.status) && (
                      <button
                        onClick={() => generateStepMutation.mutate("voiceover")}
                        disabled={generateStepMutation.isPending || isProjectGenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                        title={isProjectGenerating ? "Generation already in progress" : "Generate voiceover for all scenes"}
                      >
                        {generateStepMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        Generate
                      </button>
                    )}
                  </div>
                  {(() => {
                    const audioDur = Number(settings.voiceover?.duration) || 0;
                    const videoDur = Number(projectTotalDuration) || 0;
                    if (!settings.voiceover.hasGenerated || audioDur <= 0 || videoDur <= 0) return null;
                    const drift = Math.abs(audioDur - videoDur);
                    if (drift <= QC_DURATION_TOLERANCE_SEC) return null;
                    const audioLonger = audioDur > videoDur;
                    const matchTarget = snapDurationUp(audioDur);
                    const matchWouldChange = matchTarget !== videoDur;
                    const exceedsCap = audioDur > QC_MAX_VIDEO_DURATION + QC_DURATION_TOLERANCE_SEC;
                    return (
                      <div
                        className="rounded-md border p-2.5 text-[11px] leading-relaxed"
                        data-testid="render-voiceover-duration-warning"
                        style={{
                          backgroundColor: audioLonger ? "rgba(245, 158, 11, 0.08)" : "rgba(59, 130, 246, 0.08)",
                          borderColor: audioLonger ? "rgba(245, 158, 11, 0.35)" : "rgba(59, 130, 246, 0.35)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${audioLonger ? "text-amber-400" : "text-blue-400"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">
                              {audioLonger
                                ? `Voiceover is ${Math.round(audioDur)}s but video length is ${videoDur}s — only the first ${videoDur}s will be heard.`
                                : `Voiceover is ${Math.round(audioDur)}s but video length is ${videoDur}s — video will end with ${Math.round(videoDur - audioDur)}s of silence.`}
                            </p>
                            {audioLonger && exceedsCap && (
                              <p className="mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                Even at the {QC_MAX_VIDEO_DURATION}s max, the last {Math.max(0, Math.round(audioDur - QC_MAX_VIDEO_DURATION))}s won't be heard. Shorten the script to fit.
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {matchWouldChange && (
                                <button
                                  type="button"
                                  onClick={() => updateDurationMutation.mutate(matchTarget)}
                                  disabled={updateDurationMutation.isPending || isProjectGenerating}
                                  data-testid="render-match-video-to-narration"
                                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border transition-colors disabled:opacity-50"
                                  style={{
                                    borderColor: "rgba(139, 92, 246, 0.5)",
                                    color: "rgb(216, 201, 253)",
                                    backgroundColor: "rgba(139, 92, 246, 0.12)",
                                  }}
                                >
                                  {updateDurationMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Clock className="w-3 h-3" />
                                  )}
                                  {audioLonger ? `Match video (${matchTarget}s)` : `Trim video (${matchTarget}s)`}
                                </button>
                              )}
                              {audioLonger && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    // Single click should resolve the mismatch end-to-end:
                                    // (1) shorten the script (persisted server-side), then
                                    // (2) immediately re-record the voiceover using the
                                    // project's currently selected voice and tone.
                                    toast({
                                      title: "Shortening script and re-recording voiceover…",
                                      description: "We're rewriting the narration to fit the video, then regenerating the voiceover.",
                                    });
                                    let suggested: { script: string; wordCount: number; targetWords?: number } | undefined;
                                    try {
                                      suggested = await suggestNarrationMutation.mutateAsync({
                                        durationSec: videoDur,
                                        tone: quickAssets.voiceover?.tone || "punchy",
                                        auto: true,
                                      });
                                    } catch {
                                      // Error toast already shown by suggestNarrationMutation.onError.
                                      return;
                                    }
                                    if (!suggested?.script) return;
                                    try {
                                      await generateStepMutation.mutateAsync({ step: "voiceover", silentToast: true });
                                      toast({
                                        title: "Narration shortened, voiceover re-recording",
                                        description: `New script is ${suggested.wordCount} words${suggested.targetWords ? ` (target ~${suggested.targetWords})` : ""}. The voiceover is being regenerated.`,
                                      });
                                    } catch {
                                      // The script shortening already succeeded — surface a
                                      // recovery hint so the user can retry the regenerate.
                                      toast({
                                        title: "Voiceover regeneration failed",
                                        description: "The script was shortened, but we couldn't kick off the new voiceover. Click Regenerate Voiceover to try again.",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                  disabled={suggestNarrationMutation.isPending || generateStepMutation.isPending || isProjectGenerating}
                                  data-testid="render-shorten-narration-to-fit"
                                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border transition-colors disabled:opacity-50"
                                  style={{
                                    borderColor: "rgba(139, 92, 246, 0.5)",
                                    color: "rgb(216, 201, 253)",
                                    backgroundColor: "rgba(139, 92, 246, 0.12)",
                                  }}
                                  title="Re-write the narration script to fit the current video length and automatically re-record the voiceover."
                                >
                                  {(suggestNarrationMutation.isPending || generateStepMutation.isPending) ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="w-3 h-3" />
                                  )}
                                  Shorten narration
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
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
                  <div className="flex items-center justify-between gap-2">
                    {settings.music.hasGenerated ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> Music ready
                      </span>
                    ) : ["generating", "queued", "processing"].includes(quickAssets.music?.status) ? (
                      <span className="flex items-center gap-1 text-xs text-blue-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <AlertCircle className="w-3 h-3" /> Not generated yet
                      </span>
                    )}
                    {!settings.music.hasGenerated && !["generating", "queued", "processing"].includes(quickAssets.music?.status) && (
                      <button
                        onClick={() => generateStepMutation.mutate("music")}
                        disabled={generateStepMutation.isPending || isProjectGenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                        title={isProjectGenerating ? "Generation already in progress" : "Generate background music"}
                      >
                        {generateStepMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        Generate
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {(scenesHaveVideo || !!quickAssets.visual?.url) && (
            <div className="border rounded-lg p-4 space-y-3" style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-teal-400" />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Native Video Audio</span>
                </div>
                <ToggleSwitch
                  enabled={settings.nativeVideoAudio?.enabled ?? false}
                  onChange={(v) => saveMutation.mutate({ nativeVideoAudio: { ...settings.nativeVideoAudio, enabled: v } })}
                  label=""
                />
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Preserve the original audio from the generated video in the final render.
              </p>
              {settings.nativeVideoAudio?.enabled && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Volume</span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                      {Math.round((settings.nativeVideoAudio?.volume ?? 0.8) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round((settings.nativeVideoAudio?.volume ?? 0.8) * 100)}
                    onChange={(e) => saveMutation.mutate({ nativeVideoAudio: { ...settings.nativeVideoAudio, volume: parseInt(e.target.value) / 100 } })}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(to right, rgb(20 184 166) ${Math.round((settings.nativeVideoAudio?.volume ?? 0.8) * 100)}%, var(--border-subtle) ${Math.round((settings.nativeVideoAudio?.volume ?? 0.8) * 100)}%)` }}
                  />
                </div>
              )}
            </div>
          )}

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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shuffle className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Transitions</span>
                </div>
                <ToggleSwitch
                  enabled={settings.transitions.enabled ?? true}
                  onChange={(v) => saveMutation.mutate({ transitions: { ...settings.transitions, enabled: v } })}
                  label=""
                />
              </div>
              {(settings.transitions.enabled ?? true) && (
                <>
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
                </>
              )}
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
                <div className="space-y-3">
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

                  <div className="border-t pt-3 space-y-2.5" style={{ borderColor: "var(--border-subtle)" }}>
                    <span className="text-xs font-medium block" style={{ color: "var(--text-secondary)" }}>Intro Card Content</span>
                    <DebouncedTextInput
                      label="Tagline"
                      value={settings.introCard?.taglineText || ''}
                      placeholder="e.g. Welcome to Our World"
                      onSave={(val) => saveMutation.mutate({ introCard: { ...settings.introCard, taglineText: val } })}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Font</label>
                        <select
                          value={settings.introCard?.taglineFontFamily || 'Great Vibes'}
                          onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, taglineFontFamily: e.target.value } })}
                          className="w-full px-1.5 py-1 rounded-md border text-[10px]"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <optgroup label="Script / Handwritten">
                            <option value="Great Vibes">Great Vibes</option>
                            <option value="Dancing Script">Dancing Script</option>
                            <option value="Sacramento">Sacramento</option>
                            <option value="Pacifico">Pacifico</option>
                            <option value="Caveat">Caveat</option>
                            <option value="Satisfy">Satisfy</option>
                            <option value="Kaushan Script">Kaushan Script</option>
                            <option value="Allura">Allura</option>
                          </optgroup>
                          <optgroup label="Elegant / Serif">
                            <option value="Playfair Display">Playfair Display</option>
                            <option value="Lora">Lora</option>
                            <option value="Cormorant Garamond">Cormorant Garamond</option>
                            <option value="Libre Baskerville">Libre Baskerville</option>
                            <option value="EB Garamond">EB Garamond</option>
                          </optgroup>
                          <optgroup label="Modern / Sans-Serif">
                            <option value="Poppins">Poppins</option>
                            <option value="Montserrat">Montserrat</option>
                            <option value="Raleway">Raleway</option>
                            <option value="Inter">Inter</option>
                            <option value="Oswald">Oswald</option>
                            <option value="Quicksand">Quicksand</option>
                            <option value="Nunito">Nunito</option>
                            <option value="Open Sans">Open Sans</option>
                          </optgroup>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Weight</label>
                        <select
                          value={(settings.introCard?.taglineFontWeight ?? (settings.introCard?.taglineBold ? 700 : 400)).toString()}
                          onChange={(e) => {
                            const w = parseInt(e.target.value);
                            saveMutation.mutate({ introCard: { ...settings.introCard, taglineFontWeight: w, taglineBold: w >= 600 } });
                          }}
                          className="w-full px-1.5 py-1 rounded-md border text-[10px]"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <option value="300">Light</option>
                          <option value="400">Regular</option>
                          <option value="500">Medium</option>
                          <option value="600">Semi-Bold</option>
                          <option value="700">Bold</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Size</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="range"
                            min="14"
                            max="72"
                            value={settings.introCard?.taglineFontSize || 28}
                            onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, taglineFontSize: parseInt(e.target.value) } })}
                            className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                            style={{ background: `linear-gradient(to right, rgb(168 85 247) ${((settings.introCard?.taglineFontSize || 28) - 14) / 0.58}%, var(--border-subtle) ${((settings.introCard?.taglineFontSize || 28) - 14) / 0.58}%)` }}
                          />
                          <span className="text-[9px] w-5 text-right" style={{ color: "var(--text-muted)" }}>{settings.introCard?.taglineFontSize || 28}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Color</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={settings.introCard?.taglineColor || '#E8D5B7'}
                            onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, taglineColor: e.target.value } })}
                            className="w-6 h-6 rounded border-0 cursor-pointer p-0"
                            style={{ backgroundColor: 'transparent' }}
                          />
                          <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{settings.introCard?.taglineColor || '#E8D5B7'}</span>
                        </div>
                      </div>
                    </div>

                    <DebouncedTextInput
                      label="Website"
                      value={settings.introCard?.contactWebsite || ''}
                      placeholder="e.g. PineHillFarm.com"
                      onSave={(val) => saveMutation.mutate({ introCard: { ...settings.introCard, contactWebsite: val } })}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Font</label>
                        <select
                          value={settings.introCard?.websiteFontFamily || 'Inter'}
                          onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, websiteFontFamily: e.target.value } })}
                          className="w-full px-1.5 py-1 rounded-md border text-[10px]"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <optgroup label="Modern / Sans-Serif">
                            <option value="Inter">Inter</option>
                            <option value="Poppins">Poppins</option>
                            <option value="Montserrat">Montserrat</option>
                            <option value="Raleway">Raleway</option>
                            <option value="Oswald">Oswald</option>
                            <option value="Quicksand">Quicksand</option>
                            <option value="Nunito">Nunito</option>
                            <option value="Open Sans">Open Sans</option>
                          </optgroup>
                          <optgroup label="Elegant / Serif">
                            <option value="Playfair Display">Playfair Display</option>
                            <option value="Lora">Lora</option>
                            <option value="Cormorant Garamond">Cormorant Garamond</option>
                            <option value="Libre Baskerville">Libre Baskerville</option>
                          </optgroup>
                          <optgroup label="Script / Handwritten">
                            <option value="Great Vibes">Great Vibes</option>
                            <option value="Dancing Script">Dancing Script</option>
                            <option value="Sacramento">Sacramento</option>
                          </optgroup>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Weight</label>
                        <select
                          value={(settings.introCard?.websiteFontWeight ?? (settings.introCard?.websiteBold ? 700 : 500)).toString()}
                          onChange={(e) => {
                            const w = parseInt(e.target.value);
                            saveMutation.mutate({ introCard: { ...settings.introCard, websiteFontWeight: w, websiteBold: w >= 600 } });
                          }}
                          className="w-full px-1.5 py-1 rounded-md border text-[10px]"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <option value="300">Light</option>
                          <option value="400">Regular</option>
                          <option value="500">Medium</option>
                          <option value="600">Semi-Bold</option>
                          <option value="700">Bold</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Size</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="range"
                            min="12"
                            max="48"
                            value={settings.introCard?.websiteFontSize || 22}
                            onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, websiteFontSize: parseInt(e.target.value) } })}
                            className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                            style={{ background: `linear-gradient(to right, rgb(168 85 247) ${((settings.introCard?.websiteFontSize || 22) - 12) / 0.36}%, var(--border-subtle) ${((settings.introCard?.websiteFontSize || 22) - 12) / 0.36}%)` }}
                          />
                          <span className="text-[9px] w-5 text-right" style={{ color: "var(--text-muted)" }}>{settings.introCard?.websiteFontSize || 22}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Color</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={settings.introCard?.websiteColor || '#FFFFFF'}
                            onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, websiteColor: e.target.value } })}
                            className="w-6 h-6 rounded border-0 cursor-pointer p-0"
                            style={{ backgroundColor: 'transparent' }}
                          />
                          <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{settings.introCard?.websiteColor || '#FFFFFF'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <DebouncedTextInput
                        label="Phone"
                        value={settings.introCard?.contactPhone || ''}
                        placeholder="e.g. (555) 123-4567"
                        onSave={(val) => saveMutation.mutate({ introCard: { ...settings.introCard, contactPhone: val } })}
                      />
                      <DebouncedTextInput
                        label="Email"
                        value={settings.introCard?.contactEmail || ''}
                        placeholder="e.g. hello@brand.com"
                        onSave={(val) => saveMutation.mutate({ introCard: { ...settings.introCard, contactEmail: val } })}
                      />
                    </div>

                    <S3BackgroundPicker
                      category="logos"
                      selectedUrl={settings.introCard?.logoUrl}
                      onSelect={(url) => saveMutation.mutate({ introCard: { ...settings.introCard, logoUrl: url } })}
                      accentColor="rgb(168 85 247)"
                      label="Logo"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Logo Size</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="10"
                            max="60"
                            value={settings.introCard?.logoSize || 30}
                            onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, logoSize: parseInt(e.target.value) } })}
                            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                            style={{ background: `linear-gradient(to right, rgb(168 85 247) ${((settings.introCard?.logoSize || 30) - 10) * 2}%, var(--border-subtle) ${((settings.introCard?.logoSize || 30) - 10) * 2}%)` }}
                          />
                          <span className="text-[10px] w-6 text-right" style={{ color: "var(--text-muted)" }}>{settings.introCard?.logoSize || 30}%</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Duration</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="3"
                            max="10"
                            value={settings.introCard?.duration || 4}
                            onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, duration: parseInt(e.target.value) } })}
                            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                            style={{ background: `linear-gradient(to right, rgb(168 85 247) ${((settings.introCard?.duration || 4) - 3) * 14.3}%, var(--border-subtle) ${((settings.introCard?.duration || 4) - 3) * 14.3}%)` }}
                          />
                          <span className="text-[10px] w-6 text-right" style={{ color: "var(--text-muted)" }}>{settings.introCard?.duration || 4}s</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Logo Animation</label>
                        <select
                          value={settings.introCard?.logoAnimation || 'scale-bounce'}
                          onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, logoAnimation: e.target.value } })}
                          className="w-full px-2 py-1.5 rounded-md border text-xs"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <option value="scale-bounce">Scale Bounce</option>
                          <option value="fade">Fade In</option>
                          <option value="slide-up">Slide Up</option>
                          <option value="zoom-blur">Zoom Blur</option>
                          <option value="spin-in">Spin In</option>
                          <option value="elastic-pop">Elastic Pop</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Tagline Animation</label>
                        <select
                          value={settings.introCard?.taglineAnimation || 'fade'}
                          onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, taglineAnimation: e.target.value } })}
                          className="w-full px-2 py-1.5 rounded-md border text-xs"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <option value="typewriter">Typewriter</option>
                          <option value="fade">Fade In</option>
                          <option value="slide-up">Slide Up</option>
                          <option value="letter-cascade">Letter Cascade</option>
                          <option value="word-reveal">Word Reveal</option>
                          <option value="glow-pulse">Glow Pulse</option>
                          <option value="cinematic-rise">Cinematic Rise</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Contact Animation</label>
                        <select
                          value={settings.introCard?.contactAnimation || 'stagger'}
                          onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, contactAnimation: e.target.value } })}
                          className="w-full px-2 py-1.5 rounded-md border text-xs"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <option value="stagger">Stagger</option>
                          <option value="fade">Fade In</option>
                          <option value="slide-up">Slide Up</option>
                          <option value="slide-left">Slide Left</option>
                          <option value="stagger-slide">Stagger + Slide</option>
                          <option value="stagger-scale">Stagger + Scale</option>
                          <option value="cascade-blur">Cascade Blur</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                    </div>

                    <div className="border-t pt-3 space-y-2.5" style={{ borderColor: "var(--border-subtle)" }}>
                      <span className="text-xs font-medium block" style={{ color: "var(--text-secondary)" }}>Background &amp; Layout</span>

                      {settings.introTemplate === 'cinematic' && (
                        <div className="space-y-2">
                          <ToggleSwitch
                            enabled={settings.introBackgroundRandom ?? false}
                            onChange={(v) => {
                              if (v && settings.introBackgroundUrl) {
                                saveMutation.mutate({ introBackgroundRandom: v, introBackgroundUrl: null });
                              } else {
                                saveMutation.mutate({ introBackgroundRandom: v });
                              }
                            }}
                            label="Random background"
                          />
                        </div>
                      )}

                      <S3BackgroundPicker
                        category="intro-backgrounds"
                        selectedUrl={settings.introCard?.backgroundUrl || settings.introBackgroundUrl}
                        onSelect={(url) => saveMutation.mutate({ introCard: { ...settings.introCard, backgroundUrl: url }, introBackgroundUrl: url })}
                        accentColor="rgb(168 85 247)"
                        label="Intro Background"
                      />

                      <EndCardPreview
                        backgroundUrl={settings.introCard?.backgroundUrl || settings.introBackgroundUrl}
                        logoUrl={settings.introCard?.logoUrl || null}
                        logoSize={settings.introCard?.logoSize || 30}
                        logoPositionY={settings.introCard?.logoPositionY || 32}
                        taglineText={settings.introCard?.taglineText || ''}
                        taglinePositionY={settings.introCard?.taglinePositionY || 50}
                        taglineFontSize={settings.introCard?.taglineFontSize || 28}
                        taglineColor={settings.introCard?.taglineColor || '#E8D5B7'}
                        taglineFontFamily={settings.introCard?.taglineFontFamily || 'Great Vibes'}
                        taglineFontWeight={settings.introCard?.taglineFontWeight ?? 400}
                        websiteText={settings.introCard?.contactWebsite || ''}
                        phoneText={settings.introCard?.contactPhone || ''}
                        emailText={settings.introCard?.contactEmail || ''}
                        websitePositionY={settings.introCard?.websitePositionY || 75}
                        websiteFontSize={settings.introCard?.websiteFontSize || 22}
                        websiteColor={settings.introCard?.websiteColor || '#FFFFFF'}
                        websiteFontFamily={settings.introCard?.websiteFontFamily || 'Inter'}
                        websiteFontWeight={settings.introCard?.websiteFontWeight ?? 500}
                        aspectRatio={projectAspectRatio.replace(':', '/')}
                      />

                      <div className="space-y-1.5">
                        <div>
                          <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Logo Position (Y)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="10"
                              max="90"
                              value={settings.introCard?.logoPositionY || 32}
                              onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, logoPositionY: parseInt(e.target.value) } })}
                              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                              style={{ background: `linear-gradient(to right, rgb(168 85 247) ${((settings.introCard?.logoPositionY || 32) - 10) / 0.8}%, var(--border-subtle) ${((settings.introCard?.logoPositionY || 32) - 10) / 0.8}%)` }}
                            />
                            <span className="text-[10px] w-6 text-right" style={{ color: "var(--text-muted)" }}>{settings.introCard?.logoPositionY || 32}%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Tagline Position (Y)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="15"
                              max="95"
                              value={settings.introCard?.taglinePositionY || 50}
                              onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, taglinePositionY: parseInt(e.target.value) } })}
                              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                              style={{ background: `linear-gradient(to right, rgb(168 85 247) ${((settings.introCard?.taglinePositionY || 50) - 15) / 0.8}%, var(--border-subtle) ${((settings.introCard?.taglinePositionY || 50) - 15) / 0.8}%)` }}
                            />
                            <span className="text-[10px] w-6 text-right" style={{ color: "var(--text-muted)" }}>{settings.introCard?.taglinePositionY || 50}%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Website Position (Y)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="20"
                              max="95"
                              value={settings.introCard?.websitePositionY || 75}
                              onChange={(e) => saveMutation.mutate({ introCard: { ...settings.introCard, websitePositionY: parseInt(e.target.value) } })}
                              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                              style={{ background: `linear-gradient(to right, rgb(168 85 247) ${((settings.introCard?.websitePositionY || 75) - 20) / 0.75}%, var(--border-subtle) ${((settings.introCard?.websitePositionY || 75) - 20) / 0.75}%)` }}
                            />
                            <span className="text-[10px] w-6 text-right" style={{ color: "var(--text-muted)" }}>{settings.introCard?.websitePositionY || 75}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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
                <div className="space-y-3">
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

                  <div className="border-t pt-3 space-y-2.5" style={{ borderColor: "var(--border-subtle)" }}>
                    <span className="text-xs font-medium block" style={{ color: "var(--text-secondary)" }}>End Card Content</span>
                    <DebouncedTextInput
                      label="Tagline"
                      value={settings.endCard?.taglineText || ''}
                      placeholder="e.g. Rooted in Nature, Grown with Care"
                      onSave={(val) => saveMutation.mutate({ endCard: { ...settings.endCard, taglineText: val } })}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Font</label>
                        <select
                          value={settings.endCard?.taglineFontFamily || 'Great Vibes'}
                          onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, taglineFontFamily: e.target.value } })}
                          className="w-full px-1.5 py-1 rounded-md border text-[10px]"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <optgroup label="Script / Handwritten">
                            <option value="Great Vibes">Great Vibes</option>
                            <option value="Dancing Script">Dancing Script</option>
                            <option value="Sacramento">Sacramento</option>
                            <option value="Pacifico">Pacifico</option>
                            <option value="Caveat">Caveat</option>
                            <option value="Satisfy">Satisfy</option>
                            <option value="Kaushan Script">Kaushan Script</option>
                            <option value="Allura">Allura</option>
                          </optgroup>
                          <optgroup label="Elegant / Serif">
                            <option value="Playfair Display">Playfair Display</option>
                            <option value="Lora">Lora</option>
                            <option value="Cormorant Garamond">Cormorant Garamond</option>
                            <option value="Libre Baskerville">Libre Baskerville</option>
                            <option value="EB Garamond">EB Garamond</option>
                          </optgroup>
                          <optgroup label="Modern / Sans-Serif">
                            <option value="Poppins">Poppins</option>
                            <option value="Montserrat">Montserrat</option>
                            <option value="Raleway">Raleway</option>
                            <option value="Inter">Inter</option>
                            <option value="Oswald">Oswald</option>
                            <option value="Quicksand">Quicksand</option>
                            <option value="Nunito">Nunito</option>
                            <option value="Open Sans">Open Sans</option>
                          </optgroup>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Weight</label>
                        <select
                          value={(settings.endCard?.taglineFontWeight ?? (settings.endCard?.taglineBold ? 700 : 400)).toString()}
                          onChange={(e) => {
                            const w = parseInt(e.target.value);
                            saveMutation.mutate({ endCard: { ...settings.endCard, taglineFontWeight: w, taglineBold: w >= 600 } });
                          }}
                          className="w-full px-1.5 py-1 rounded-md border text-[10px]"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <option value="300">Light</option>
                          <option value="400">Regular</option>
                          <option value="500">Medium</option>
                          <option value="600">Semi-Bold</option>
                          <option value="700">Bold</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Size</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="range"
                            min="14"
                            max="72"
                            value={settings.endCard?.taglineFontSize || 28}
                            onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, taglineFontSize: parseInt(e.target.value) } })}
                            className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                            style={{ background: `linear-gradient(to right, rgb(99 102 241) ${((settings.endCard?.taglineFontSize || 28) - 14) / 0.58}%, var(--border-subtle) ${((settings.endCard?.taglineFontSize || 28) - 14) / 0.58}%)` }}
                          />
                          <span className="text-[9px] w-5 text-right" style={{ color: "var(--text-muted)" }}>{settings.endCard?.taglineFontSize || 28}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Color</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={settings.endCard?.taglineColor || '#E8D5B7'}
                            onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, taglineColor: e.target.value } })}
                            className="w-6 h-6 rounded border-0 cursor-pointer p-0"
                            style={{ backgroundColor: 'transparent' }}
                          />
                          <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{settings.endCard?.taglineColor || '#E8D5B7'}</span>
                        </div>
                      </div>
                    </div>

                    <DebouncedTextInput
                      label="Website"
                      value={settings.endCard?.contactWebsite || ''}
                      placeholder="e.g. PineHillFarm.com"
                      onSave={(val) => saveMutation.mutate({ endCard: { ...settings.endCard, contactWebsite: val } })}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Font</label>
                        <select
                          value={settings.endCard?.websiteFontFamily || 'Inter'}
                          onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, websiteFontFamily: e.target.value } })}
                          className="w-full px-1.5 py-1 rounded-md border text-[10px]"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <optgroup label="Modern / Sans-Serif">
                            <option value="Inter">Inter</option>
                            <option value="Poppins">Poppins</option>
                            <option value="Montserrat">Montserrat</option>
                            <option value="Raleway">Raleway</option>
                            <option value="Oswald">Oswald</option>
                            <option value="Quicksand">Quicksand</option>
                            <option value="Nunito">Nunito</option>
                            <option value="Open Sans">Open Sans</option>
                          </optgroup>
                          <optgroup label="Elegant / Serif">
                            <option value="Playfair Display">Playfair Display</option>
                            <option value="Lora">Lora</option>
                            <option value="Cormorant Garamond">Cormorant Garamond</option>
                            <option value="Libre Baskerville">Libre Baskerville</option>
                          </optgroup>
                          <optgroup label="Script / Handwritten">
                            <option value="Great Vibes">Great Vibes</option>
                            <option value="Dancing Script">Dancing Script</option>
                            <option value="Sacramento">Sacramento</option>
                          </optgroup>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Weight</label>
                        <select
                          value={(settings.endCard?.websiteFontWeight ?? (settings.endCard?.websiteBold ? 700 : 500)).toString()}
                          onChange={(e) => {
                            const w = parseInt(e.target.value);
                            saveMutation.mutate({ endCard: { ...settings.endCard, websiteFontWeight: w, websiteBold: w >= 600 } });
                          }}
                          className="w-full px-1.5 py-1 rounded-md border text-[10px]"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <option value="300">Light</option>
                          <option value="400">Regular</option>
                          <option value="500">Medium</option>
                          <option value="600">Semi-Bold</option>
                          <option value="700">Bold</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Size</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="range"
                            min="12"
                            max="48"
                            value={settings.endCard?.websiteFontSize || 22}
                            onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, websiteFontSize: parseInt(e.target.value) } })}
                            className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                            style={{ background: `linear-gradient(to right, rgb(99 102 241) ${((settings.endCard?.websiteFontSize || 22) - 12) / 0.36}%, var(--border-subtle) ${((settings.endCard?.websiteFontSize || 22) - 12) / 0.36}%)` }}
                          />
                          <span className="text-[9px] w-5 text-right" style={{ color: "var(--text-muted)" }}>{settings.endCard?.websiteFontSize || 22}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Color</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={settings.endCard?.websiteColor || '#FFFFFF'}
                            onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, websiteColor: e.target.value } })}
                            className="w-6 h-6 rounded border-0 cursor-pointer p-0"
                            style={{ backgroundColor: 'transparent' }}
                          />
                          <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{settings.endCard?.websiteColor || '#FFFFFF'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <DebouncedTextInput
                        label="Phone"
                        value={settings.endCard?.contactPhone || ''}
                        placeholder="e.g. (555) 123-4567"
                        onSave={(val) => saveMutation.mutate({ endCard: { ...settings.endCard, contactPhone: val } })}
                      />
                      <DebouncedTextInput
                        label="Email"
                        value={settings.endCard?.contactEmail || ''}
                        placeholder="e.g. hello@brand.com"
                        onSave={(val) => saveMutation.mutate({ endCard: { ...settings.endCard, contactEmail: val } })}
                      />
                    </div>

                    <S3BackgroundPicker
                      category="logos"
                      selectedUrl={settings.endCard?.logoUrl}
                      onSelect={(url) => saveMutation.mutate({ endCard: { ...settings.endCard, logoUrl: url } })}
                      accentColor="rgb(99 102 241)"
                      label="Logo"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Logo Size</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="10"
                            max="60"
                            value={settings.endCard?.logoSize || 25}
                            onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, logoSize: parseInt(e.target.value) } })}
                            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                            style={{ background: `linear-gradient(to right, rgb(99 102 241) ${((settings.endCard?.logoSize || 25) - 10) * 2}%, var(--border-subtle) ${((settings.endCard?.logoSize || 25) - 10) * 2}%)` }}
                          />
                          <span className="text-[10px] w-6 text-right" style={{ color: "var(--text-muted)" }}>{settings.endCard?.logoSize || 25}%</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Duration</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="3"
                            max="10"
                            value={settings.endCard?.duration || 5}
                            onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, duration: parseInt(e.target.value) } })}
                            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                            style={{ background: `linear-gradient(to right, rgb(99 102 241) ${((settings.endCard?.duration || 5) - 3) * 14.3}%, var(--border-subtle) ${((settings.endCard?.duration || 5) - 3) * 14.3}%)` }}
                          />
                          <span className="text-[10px] w-6 text-right" style={{ color: "var(--text-muted)" }}>{settings.endCard?.duration || 5}s</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Logo Animation</label>
                        <select
                          value={settings.endCard?.logoAnimation || 'scale-bounce'}
                          onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, logoAnimation: e.target.value } })}
                          className="w-full px-2 py-1.5 rounded-md border text-xs"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <option value="scale-bounce">Scale Bounce</option>
                          <option value="fade">Fade In</option>
                          <option value="slide-up">Slide Up</option>
                          <option value="zoom-blur">Zoom Blur</option>
                          <option value="spin-in">Spin In</option>
                          <option value="elastic-pop">Elastic Pop</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Tagline Animation</label>
                        <select
                          value={settings.endCard?.taglineAnimation || 'typewriter'}
                          onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, taglineAnimation: e.target.value } })}
                          className="w-full px-2 py-1.5 rounded-md border text-xs"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <option value="typewriter">Typewriter</option>
                          <option value="fade">Fade In</option>
                          <option value="slide-up">Slide Up</option>
                          <option value="letter-cascade">Letter Cascade</option>
                          <option value="word-reveal">Word Reveal</option>
                          <option value="glow-pulse">Glow Pulse</option>
                          <option value="cinematic-rise">Cinematic Rise</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Contact Animation</label>
                        <select
                          value={settings.endCard?.contactAnimation || 'stagger'}
                          onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, contactAnimation: e.target.value } })}
                          className="w-full px-2 py-1.5 rounded-md border text-xs"
                          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                        >
                          <option value="stagger">Stagger</option>
                          <option value="fade">Fade In</option>
                          <option value="slide-up">Slide Up</option>
                          <option value="slide-left">Slide Left</option>
                          <option value="stagger-slide">Stagger + Slide</option>
                          <option value="stagger-scale">Stagger + Scale</option>
                          <option value="cascade-blur">Cascade Blur</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                    </div>

                    <div className="border-t pt-3 space-y-2.5" style={{ borderColor: "var(--border-subtle)" }}>
                      <span className="text-xs font-medium block" style={{ color: "var(--text-secondary)" }}>Background &amp; Layout</span>

                      <S3BackgroundPicker
                        category="end-cards"
                        selectedUrl={settings.endCard?.backgroundUrl}
                        onSelect={(url) => saveMutation.mutate({ endCard: { ...settings.endCard, backgroundUrl: url } })}
                        accentColor="rgb(99 102 241)"
                        label="End Card Background"
                      />

                      <EndCardPreview
                        backgroundUrl={settings.endCard?.backgroundUrl}
                        logoUrl={settings.endCard?.logoUrl || null}
                        logoSize={settings.endCard?.logoSize || 25}
                        logoPositionY={settings.endCard?.logoPositionY || 32}
                        taglineText={settings.endCard?.taglineText || ''}
                        taglinePositionY={settings.endCard?.taglinePositionY || 55}
                        taglineFontSize={settings.endCard?.taglineFontSize || 28}
                        taglineColor={settings.endCard?.taglineColor || '#E8D5B7'}
                        taglineFontFamily={settings.endCard?.taglineFontFamily || 'Great Vibes'}
                        taglineBold={settings.endCard?.taglineBold || false}
                        taglineFontWeight={settings.endCard?.taglineFontWeight}
                        websiteText={settings.endCard?.contactWebsite || ''}
                        websitePositionY={settings.endCard?.websitePositionY || 75}
                        websiteFontSize={settings.endCard?.websiteFontSize || 22}
                        websiteColor={settings.endCard?.websiteColor || '#FFFFFF'}
                        websiteBold={settings.endCard?.websiteBold || false}
                        websiteFontWeight={settings.endCard?.websiteFontWeight}
                        websiteFontFamily={settings.endCard?.websiteFontFamily || 'Inter'}
                        phoneText={settings.endCard?.contactPhone || ''}
                        emailText={settings.endCard?.contactEmail || ''}
                        aspectRatio={projectAspectRatio.replace(':', '/')}
                      />

                      <div className="space-y-1.5">
                        <div>
                          <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Logo Position (Y)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="10"
                              max="90"
                              value={settings.endCard?.logoPositionY || 32}
                              onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, logoPositionY: parseInt(e.target.value) } })}
                              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                              style={{ background: `linear-gradient(to right, rgb(99 102 241) ${((settings.endCard?.logoPositionY || 32) - 10) / 0.8}%, var(--border-subtle) ${((settings.endCard?.logoPositionY || 32) - 10) / 0.8}%)` }}
                            />
                            <span className="text-[10px] w-6 text-right" style={{ color: "var(--text-muted)" }}>{settings.endCard?.logoPositionY || 32}%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Tagline Position (Y)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="15"
                              max="95"
                              value={settings.endCard?.taglinePositionY || 55}
                              onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, taglinePositionY: parseInt(e.target.value) } })}
                              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                              style={{ background: `linear-gradient(to right, rgb(99 102 241) ${((settings.endCard?.taglinePositionY || 55) - 15) / 0.8}%, var(--border-subtle) ${((settings.endCard?.taglinePositionY || 55) - 15) / 0.8}%)` }}
                            />
                            <span className="text-[10px] w-6 text-right" style={{ color: "var(--text-muted)" }}>{settings.endCard?.taglinePositionY || 55}%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Website Position (Y)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="20"
                              max="95"
                              value={settings.endCard?.websitePositionY || 75}
                              onChange={(e) => saveMutation.mutate({ endCard: { ...settings.endCard, websitePositionY: parseInt(e.target.value) } })}
                              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                              style={{ background: `linear-gradient(to right, rgb(99 102 241) ${((settings.endCard?.websitePositionY || 75) - 20) / 0.75}%, var(--border-subtle) ${((settings.endCard?.websitePositionY || 75) - 20) / 0.75}%)` }}
                            />
                            <span className="text-[10px] w-6 text-right" style={{ color: "var(--text-muted)" }}>{settings.endCard?.websitePositionY || 75}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-3" style={{ backgroundColor: "var(--app-bg)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Captions</span>
              </div>
              <ToggleSwitch
                enabled={settings.captions?.enabled ?? false}
                onChange={(v) => saveMutation.mutate({ captions: { ...settings.captions, enabled: v, style: settings.captions?.style } })}
                label=""
              />
            </div>
            {settings.captions?.enabled && (
              <div className="space-y-3">
                <div>
                  <span className="text-xs block mb-1.5" style={{ color: "var(--text-secondary)" }}>Style Preset</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { value: 'capcut', label: 'CapCut', desc: 'Bold pop animation' },
                      { value: 'hormozi', label: 'Hormozi', desc: 'Large bold, one word' },
                      { value: 'glossy', label: 'Glossy', desc: 'Glass background + glow' },
                      { value: 'neon', label: 'Neon', desc: 'Electric neon glow' },
                      { value: 'glitch', label: 'Glitch', desc: 'Cyber distortion effect' },
                      { value: 'typewriter', label: 'Typewriter', desc: 'Words appear with cursor' },
                      { value: 'karaoke', label: 'Karaoke', desc: 'Words highlight as spoken' },
                      { value: 'broadcast', label: 'Broadcast', desc: 'Lower-third bar' },
                      { value: 'minimal', label: 'Minimal', desc: 'Simple subtitles' },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => saveMutation.mutate({ captions: { ...settings.captions, style: { ...settings.captions?.style, preset: preset.value } } })}
                        className={`p-2 rounded-lg border text-left transition-all ${
                          (settings.captions?.style?.preset || 'capcut') === preset.value
                            ? 'border-yellow-500 bg-yellow-500/10 ring-1 ring-yellow-500'
                            : 'hover:border-yellow-500/40'
                        }`}
                        style={{ borderColor: (settings.captions?.style?.preset || 'capcut') === preset.value ? undefined : "var(--border-subtle)" }}
                      >
                        <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{preset.label}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{preset.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Font Size</span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                      {settings.captions?.style?.fontSize || 52}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="96"
                    value={settings.captions?.style?.fontSize || 52}
                    onChange={(e) => saveMutation.mutate({ captions: { ...settings.captions, style: { ...settings.captions?.style, fontSize: parseInt(e.target.value) } } })}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(to right, rgb(234 179 8) ${Math.round(((settings.captions?.style?.fontSize || 52) - 20) / 76 * 100)}%, var(--border-subtle) ${Math.round(((settings.captions?.style?.fontSize || 52) - 20) / 76 * 100)}%)` }}
                  />
                </div>
                <div>
                  <span className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Position</span>
                  <select
                    value={settings.captions?.style?.position || 'bottom'}
                    onChange={(e) => saveMutation.mutate({ captions: { ...settings.captions, style: { ...settings.captions?.style, position: e.target.value } } })}
                    className="w-full text-xs rounded-md border p-1.5 appearance-none"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  >
                    <option value="bottom">Bottom</option>
                    <option value="center">Center</option>
                    <option value="top">Top</option>
                  </select>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Synced captions will overlay on the video, highlighting words as they are spoken.
                </p>
              </div>
            )}
          </div>

          <AssembleAllButton projectId={projectId} scenes={scenesFromProps} />
          <RenderButton projectId={projectId} hasVisual={!!quickAssets.visual?.url || scenesHaveVideo} hasVoiceover={voiceoverReady || settings.voiceover.hasGenerated} hasMusic={musicReady || settings.music.hasGenerated} initialOutputUrl={projectOutputUrl} initialStatus={projectStatus} initialRenderId={projectRenderId} />
        </div>
      )}
    </div>
  );
}

function AssembleAllButton({ projectId, scenes }: { projectId: string; scenes: any[] }) {
  const [isAssembling, setIsAssembling] = useState(false);
  const [assemblyProgress, setAssemblyProgress] = useState({ current: 0, total: 0 });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const scenesWithMicroScenes = scenes.filter((s: any) =>
    s.microScenes && s.microScenes.filter((ms: any) => !!ms.videoUrl).length >= 2
  );

  const alreadyAssembled = scenes.filter((s: any) =>
    s.assemblyManifest && !s.assemblyManifest.assemblyFailed && s.assemblyManifest.assembledClipValid !== false && !!s.assemblyManifest.assembledClipUrl
  ).length;

  if (scenesWithMicroScenes.length === 0) return null;

  const eligibleSceneIndices = scenes.reduce<number[]>((acc, s, i) => {
    const msWithVid = (s.microScenes || []).filter((ms: any) => !!ms.videoUrl);
    if (msWithVid.length >= 2) acc.push(i);
    return acc;
  }, []);

  const handleAssembleAll = async () => {
    setIsAssembling(true);
    const total = eligibleSceneIndices.length;
    setAssemblyProgress({ current: 0, total });
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < eligibleSceneIndices.length; i++) {
      const sceneIdx = eligibleSceneIndices[i];
      setAssemblyProgress({ current: i, total });
      try {
        const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneIdx}/assemble`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            succeeded++;
          } else {
            failed++;
          }
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    }

    setAssemblyProgress({ current: total, total });
    if (failed === 0) {
      toast({ title: "All Scenes Assembled", description: `${succeeded} of ${total} scenes assembled successfully.` });
    } else {
      toast({ title: "Assembly Partial", description: `${succeeded} of ${total} scenes assembled. ${failed} failed — raw clips will be used.`, variant: "destructive" });
    }
    setIsAssembling(false);
  };

  return (
    <div className="mb-4">
      <button
        onClick={handleAssembleAll}
        disabled={isAssembling}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
        style={{
          backgroundColor: "rgba(34,197,94,0.1)",
          border: "1px solid rgba(34,197,94,0.3)",
          color: "rgb(134,239,172)",
        }}
      >
        {isAssembling ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Assembling scene {assemblyProgress.current + 1} of {assemblyProgress.total}...
          </>
        ) : (
          <>
            <Layers className="w-4 h-4" />
            Assemble All Scenes
            <span className="text-[10px] opacity-70">
              ({alreadyAssembled}/{scenesWithMicroScenes.length} done)
            </span>
          </>
        )}
      </button>
      {isAssembling && assemblyProgress.total > 0 && (
        <div className="mt-2 w-full rounded-full overflow-hidden h-1.5" style={{ backgroundColor: "rgba(34,197,94,0.15)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(assemblyProgress.current / assemblyProgress.total) * 100}%`,
              backgroundColor: "rgb(34,197,94)",
            }}
          />
        </div>
      )}
      <p className="text-[10px] mt-1.5 text-center" style={{ color: "var(--text-muted)" }}>
        Pre-assemble micro-scenes before rendering for smoother results
      </p>
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

// Quick Create video-length picker steps (mirrors UI + server word budget).
const QC_VIDEO_DURATION_STEPS = [5, 6, 8, 10] as const;
const QC_MAX_VIDEO_DURATION = 10;
const QC_DURATION_TOLERANCE_SEC = 0.5;

function snapDurationUp(seconds: number): number {
  const ceil = Math.max(1, Math.ceil(seconds));
  for (const step of QC_VIDEO_DURATION_STEPS) {
    if (step >= ceil) return step;
  }
  return QC_MAX_VIDEO_DURATION;
}

// Mirrors server suggest-narration WPS (vertical denser than horizontal).
function readWordsPerSecond(aspectRatio: string | undefined): number {
  const isVertical = aspectRatio === "9:16" || aspectRatio === "1:1";
  return isVertical ? 2.7 : 2.3;
}

// Predict how long it would take to read the given script aloud, in seconds.
// Returns 0 for empty input. Used live as the user types/edits.
function estimateReadTimeSec(script: string, aspectRatio: string | undefined): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return words / readWordsPerSecond(aspectRatio);
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

export function QuickCreateAssetPanel({ projectId, project }: { projectId: string; project: any }) {
  const [expanded, setExpanded] = useState(true);
  const [promptText, setPromptText] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("auto");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<number>(6);
  const [visualGenerating, setVisualGenerating] = useState(false);
  const [editNegativePrompt, setEditNegativePrompt] = useState(false);
  const [imageFidelity, setImageFidelity] = useState<number | null>(null);
  const [suzzieSuggestedFidelity, setSuzzieSuggestedFidelity] = useState<number | null>(null);
  const [suzzieProviderRationale, setSuzzieProviderRationale] = useState<string | undefined>(undefined);
  const [artPresetId, setArtPresetId] = useState("");
  const [overrideSourceImage, setOverrideSourceImage] = useState<string | null | undefined>(undefined);
  const [overrideCharacter, setOverrideCharacter] = useState<string | null | undefined>(undefined);
  const [overrideExtras, setOverrideExtras] = useState<string[] | undefined>(undefined);
  // Logo override: undefined = inherit brand bible, null = exclude for this run,
  // string = use this custom URL instead of the brand bible logo.
  const [overrideLogo, setOverrideLogo] = useState<string | null | undefined>(undefined);
  // Routes the next file-picker selection into the correct typed slot.
  const pendingUploadSlotRef = useRef<"product" | "character" | "extra" | "logo">("product");
  const [uploadingSourceImage, setUploadingSourceImage] = useState(false);
  const [generatingSourceImage, setGeneratingSourceImage] = useState(false);
  const [referenceLightboxOpen, setReferenceLightboxOpen] = useState(false);
  const [referenceLightboxUrl, setReferenceLightboxUrl] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState("21m00Tcm4TlvDq8ikWAM");
  const [voiceFilter, setVoiceFilter] = useState<"all" | "male" | "female">("all");
  const [narrationText, setNarrationText] = useState("");
  const [musicMood, setMusicMood] = useState("auto");
  const [musicGenerator, setMusicGenerator] = useState("auto");
  const [overlayItems, setOverlayItems] = useState<SceneOverlayItem[]>([]);
  const [overlaysLoaded, setOverlaysLoaded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const handleSourceImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const slot = pendingUploadSlotRef.current;
    setUploadingSourceImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/videos/uploads", { method: "POST", credentials: "include", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed: " + uploadRes.status);
      const data = await uploadRes.json();
      const url = data.url || data.fileUrl;
      if (url) {
        if (slot === "character") {
          setOverrideCharacter(url);
          toast({ title: "Character reference set", description: "Click Regenerate to apply." });
        } else if (slot === "logo") {
          setOverrideLogo(url);
          toast({ title: "Logo replaced", description: "Click Regenerate to apply. Brand bible is unchanged." });
        } else if (slot === "extra") {
          // First add: seed from CURRENT server-side extras (read fresh from
          // the query cache, not from a possibly-stale closure) so we never
          // drop already-existing extras when the user adds another one.
          const freshAssets = queryClient.getQueryData<any>(["quick-create-assets", projectId]);
          const serverExtras: string[] = Array.isArray(freshAssets?.generationInfo?.referenceImages)
            ? (freshAssets.generationInfo.referenceImages as string[])
            : [];
          setOverrideExtras((prev) => {
            const base = prev !== undefined ? prev : serverExtras;
            return [...base, url];
          });
          toast({ title: "Reference image added", description: "Click Regenerate to apply." });
        } else {
          setOverrideSourceImage(url);
          toast({ title: "Product reference set", description: "Click Regenerate to apply." });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Upload Error", description: msg, variant: "destructive" });
    }
    setUploadingSourceImage(false);
    pendingUploadSlotRef.current = "product";
    e.target.value = "";
  }, [toast, queryClient, projectId]);

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
      if (anyGenerating || visualGenerating) return 3000;
      return false;
    },
  });

  // Sync local picker with persisted duration changed elsewhere (e.g. RenderConfig "Match").
  useEffect(() => {
    const persisted = Number(project?.totalDuration);
    if (Number.isFinite(persisted) && persisted > 0 && persisted !== selectedDuration) {
      setSelectedDuration(persisted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.totalDuration]);

  // Sync editor when narration is rewritten server-side (RenderConfig shorten).
  const lastServerNarrationRef = useRef<string | null>(null);
  useEffect(() => {
    const serverNarration = assetsQuery.data?.voiceover?.narrationText ?? null;
    if (serverNarration && serverNarration !== lastServerNarrationRef.current) {
      const isFirstSync = lastServerNarrationRef.current === null;
      if (!isFirstSync && serverNarration !== narrationText) {
        setNarrationText(serverNarration);
      }
      lastServerNarrationRef.current = serverNarration;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsQuery.data?.voiceover?.narrationText]);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (assetsQuery.data?.project?.prompt && !promptText) {
      setPromptText(assetsQuery.data.project.prompt);
    }
    if (!initializedRef.current && assetsQuery.data) {
      if (assetsQuery.data.visual?.provider) {
        setSelectedProvider(assetsQuery.data.visual.provider);
      }
      const genInfo = assetsQuery.data.generationInfo;
      if (genInfo) {
        if (genInfo.negativePrompt) setNegativePrompt(genInfo.negativePrompt);
        setImageFidelity(genInfo.imageFidelity ?? (genInfo.sceneType === "i2v" ? 0.5 : null));
        if (genInfo.artPresetId) setArtPresetId(genInfo.artPresetId);
      }
      setSelectedAspectRatio(assetsQuery.data.generationInfo?.aspectRatio || project?.outputFormat?.aspectRatio || "16:9");
      const hydratedDuration =
        Number(assetsQuery.data.project?.totalDuration) ||
        Number(project?.totalDuration) ||
        6;
      setSelectedDuration(Math.max(3, Math.min(30, Math.round(hydratedDuration))));
      const savedTone = assetsQuery.data.voiceover?.tone;
      if (savedTone === "punchy" || savedTone === "educational" || savedTone === "story") {
        setNarrationTone(savedTone);
      }
      const savedNarration = assetsQuery.data.voiceover?.narrationText;
      if (savedNarration) {
        setNarrationText(savedNarration);
      } else {
        const fallbackNarration =
          assetsQuery.data.project?.prompt ||
          (project as any)?.description ||
          "";
        if (fallbackNarration) setNarrationText(fallbackNarration);
      }
      initializedRef.current = true;
    }
    if (assetsQuery.data?.overlayItems && !overlaysLoaded) {
      setOverlayItems(assetsQuery.data.overlayItems);
      setOverlaysLoaded(true);
    }
  }, [assetsQuery.data]);

  const visualGenStartTimeRef = useRef<number>(0);
  useEffect(() => {
    if (visualGenerating && assetsQuery.data) {
      const vs = assetsQuery.data.visual?.status;
      const elapsed = Date.now() - visualGenStartTimeRef.current;
      if (elapsed > 5000 && (vs === "completed" || vs === "failed")) {
        setVisualGenerating(false);
      }
    }
  }, [assetsQuery.data, visualGenerating]);

  const isI2V = assetsQuery.data?.generationInfo?.sceneType === "i2v";
  const allPresets = getAllVisualArtPresets();

  const generateVisualMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        prompt: promptText || undefined,
        provider: selectedProvider,
        negativePrompt: negativePrompt,
        aspectRatio: selectedAspectRatio || undefined,
      };
      if (project.mediaMode !== "image" && Number.isFinite(selectedDuration) && selectedDuration > 0) {
        body.duration = selectedDuration;
      }
      if (imageFidelity !== null) {
        body.imageFidelity = imageFidelity;
      }
      if (artPresetId) {
        body.artPresetId = artPresetId;
      }
      if (overrideSourceImage === null) {
        body.removeSourceImage = true;
      } else if (overrideSourceImage) {
        body.sourceImageUrl = overrideSourceImage;
      }
      // Task 69: typed reference slots.
      if (overrideCharacter !== undefined) {
        body.characterRefImageUrl = overrideCharacter || "";
      }
      if (overrideExtras !== undefined) {
        body.referenceImages = overrideExtras;
      }
      // Logo override: explicit null = exclude for this run, string = custom URL
      if (overrideLogo === null) {
        body.excludeLogo = true;
      } else if (overrideLogo) {
        body.customLogoUrl = overrideLogo;
      }
      const res = await fetch(`/api/projects/${projectId}/quick-create/generate-visual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to start visual generation");
      return res.json();
    },
    onSuccess: () => {
      visualGenStartTimeRef.current = Date.now();
      setVisualGenerating(true);
      setOverrideSourceImage(undefined);
      setOverrideCharacter(undefined);
      setOverrideExtras(undefined);
      setOverrideLogo(undefined);
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Visual Generation Started", description: "Your visual asset is being generated." });
    },
    onError: (err: Error) => {
      setVisualGenerating(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const [narrationTone, setNarrationTone] = useState<"punchy" | "educational" | "story">("punchy");

  const suggestNarrationMutation = useMutation({
    mutationFn: async (opts?: { tone?: "punchy" | "educational" | "story"; durationSec?: number; auto?: boolean }) => {
      const tone = opts?.tone || narrationTone;
      const body: Record<string, unknown> = { tone };
      if (opts?.durationSec && Number.isFinite(opts.durationSec)) {
        body.durationSec = opts.durationSec;
      }
      const res = await fetch(`/api/projects/${projectId}/quick-create/suggest-narration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to suggest narration");
      return data as { script: string; wordCount: number; targetWords?: number };
    },
    onSuccess: (data, variables) => {
      if (data?.script) {
        setNarrationText(data.script);
        // When chained from "Shorten narration to fit", suppress the per-step
        // toast because the caller already shows a combined toast and will
        // immediately kick off voiceover regeneration.
        if (!variables?.auto) {
          toast({
            title: "Narration suggested",
            description: `${data.wordCount} words${data.targetWords ? ` (target ~${data.targetWords})` : ""}. Edit freely, then click Generate Voiceover.`,
          });
        }
      }
    },
    onError: (err: Error) => {
      toast({ title: "Could not suggest narration", description: err.message, variant: "destructive" });
    },
  });

  const updateDurationMutation = useMutation({
    mutationFn: async (totalDuration: number) => {
      const res = await fetch(`/api/projects/${projectId}/quick-create/duration`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ totalDuration }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to update video length");
      return data as { totalDuration: number };
    },
    onSuccess: (data) => {
      if (data?.totalDuration) {
        setSelectedDuration(data.totalDuration);
      }
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets", projectId] });
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets-render", projectId] });
      queryClient.invalidateQueries({ queryKey: ["render-settings", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Video length updated", description: `Set to ${data?.totalDuration}s.` });
    },
    onError: (err: Error) => {
      toast({ title: "Could not update video length", description: err.message, variant: "destructive" });
    },
  });

  const generateVoiceoverMutation = useMutation({
    mutationFn: async (opts?: { narrationText?: string; silentToast?: boolean }) => {
      // Allow callers to pass an explicit script (e.g. when chaining after
      // "Shorten narration to fit") because React state updates are async and
      // the local `narrationText` may not yet reflect the freshly suggested
      // script when this mutation is invoked.
      const text = (opts?.narrationText ?? narrationText).trim() || promptText;
      const res = await fetch(`/api/projects/${projectId}/quick-create/generate-voiceover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ narrationText: text, voiceId: selectedVoiceId, tone: narrationTone }),
      });
      if (!res.ok) throw new Error("Failed to start voiceover generation");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets", projectId] });
      queryClient.invalidateQueries({ queryKey: ["quick-create-assets-render", projectId] });
      queryClient.invalidateQueries({ queryKey: ["render-settings", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      if (!variables?.silentToast) {
        toast({ title: "Voiceover Generation Started", description: "Your voiceover is being generated." });
      }
    },
    onError: (err: Error, variables) => {
      // When called from the chained "Shorten narration & re-record" flow,
      // the caller surfaces its own combined recovery toast — don't double up.
      if (variables?.silentToast) return;
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

  const previewSizing = (() => {
    const ar = selectedAspectRatio || "16:9";
    const aspectRatio = ar.replace(":", "/");
    const [w, h] = ar.split(":").map(Number);
    const pw = ar === "9:16" ? 1080 : ar === "1:1" ? 1024 : ar === "4:3" ? 1440 : 1920;
    const ph = ar === "9:16" ? 1920 : ar === "1:1" ? 1024 : ar === "4:3" ? 1080 : 1080;
    const label = ar === "9:16" ? "9:16 · Reels/TikTok" : ar === "1:1" ? "1:1 · Square" : ar === "4:3" ? "4:3 · Standard" : "16:9 · YouTube";
    const isVertical = ar === "9:16";
    const isSquare = ar === "1:1";
    const containerStyle: Record<string, string> = {
      aspectRatio,
      ...(isVertical
        ? { maxHeight: "70vh", width: `min(100%, calc(70vh * ${w} / ${h}))`, margin: "0 auto" }
        : isSquare
        ? { maxWidth: "60%", margin: "0 auto" }
        : { width: "100%" }),
    };
    return { aspectRatio, pw, ph, label, isVertical, isSquare, containerStyle };
  })();

  const overlaySection = assets.visual?.status === "completed" && assets.visual?.url ? (
    <div className="border rounded-xl p-4" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.15)" }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <ImagePlus className="w-5 h-5 text-cyan-400 flex-shrink-0" />
          <h3 className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>Scene Overlays</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            {overlayItems.length} overlay{overlayItems.length !== 1 ? "s" : ""}
          </span>
        </div>
        {assets.visual?.url && (
          <SceneImageActions
            variant="compact"
            imageUrl={assets.visual.url}
            mediaType={project?.mediaMode === "image" ? "image" : (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(assets.visual.url) ? "video" : "image")}
            projectId={projectId}
            projectTitle={project?.title}
            visualDirection={project?.visualDirection || project?.title}
            width={previewSizing.pw}
            height={previewSizing.ph}
          />
        )}
      </div>
      <div style={{
        ...(previewSizing.isVertical
          ? { width: `min(100%, calc(60vh * 9 / 16))`, margin: "0 auto" }
          : previewSizing.isSquare
          ? { maxWidth: "60%", margin: "0 auto" }
          : { width: "100%" }),
      }}>
        <SceneOverlayEditor
          overlays={overlayItems}
          onChange={handleOverlayChange}
          previewWidth={previewSizing.pw}
          previewHeight={previewSizing.ph}
          backgroundUrl={assets.visual!.url}
          backgroundType={project.mediaMode === "image" ? "image" : "video"}
          brand={normalizeProjectBrand(project)}
        />
      </div>
    </div>
  ) : null;

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
    <>
    <input
      id="qc-source-image-upload"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      onChange={handleSourceImageChange}
      disabled={uploadingSourceImage}
      style={{ position: "fixed", top: "-100px", left: "-100px", width: "1px", height: "1px", opacity: 0 }}
    />
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
                {(() => {
                  const genInfo = assetsQuery.data?.generationInfo;
                  if (!genInfo) return null;
                  const modeLabels: Record<string, { label: string; color: string }> = {
                    i2v: { label: "Image-to-Video", color: "text-cyan-400" },
                    v2v: { label: "Video-to-Video", color: "text-green-400" },
                    image: { label: "Text-to-Image", color: "text-amber-400" },
                    video: { label: "Text-to-Video", color: "text-purple-400" },
                  };
                  const mode = modeLabels[genInfo.sceneType || ""] || null;
                  return mode ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${mode.color}`} style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      {mode.label}
                    </span>
                  ) : null;
                })()}
                {(() => {
                  const genInfo = assetsQuery.data?.generationInfo;
                  const presetId = genInfo?.artPresetId;
                  if (!presetId || presetId === "auto") return null;
                  const preset = getVisualArtPreset(presetId);
                  if (!preset) return null;
                  return (
                    <span className="text-[10px] px-1.5 py-0.5 rounded text-violet-400" style={{ backgroundColor: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
                      <Palette className="w-3 h-3 inline mr-0.5" /> {preset.name}
                    </span>
                  );
                })()}
              </div>
              {assetStatusBadge(assets.visual?.status)}
            </div>

            <div className={selectedAspectRatio === "9:16" ? "flex gap-4 items-start" : ""}>
            <div className={selectedAspectRatio === "9:16" ? "w-[35%] flex-shrink-0" : ""}>
            {assets.visual?.url && (
              <div
                className="mb-3 rounded-lg overflow-hidden border bg-black flex justify-center relative"
                style={{
                  borderColor: "var(--border-subtle)",
                  ...previewSizing.containerStyle,
                }}
              >
                {project.mediaMode === "image" ? (
                  <img src={assets.visual.url} alt="Generated visual" className="w-full h-full object-contain" />
                ) : (
                  <video key={assets.visual.url} src={assets.visual.url} controls className="w-full h-full object-contain" />
                )}
                <span
                  className="absolute top-2 left-2 text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm"
                  style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  {previewSizing.label}
                </span>
              </div>
            )}

            {assets.visual?.error && (
              <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                {assets.visual.error}
              </div>
            )}

            {assets.visual?.provider && assets.visual.status === "completed" && (
              <div className="flex flex-wrap gap-3 mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>Provider: <strong style={{ color: "var(--text-secondary)" }}>{assets.visual.provider}</strong></span>
                {assets.visual.generationTimeMs && (
                  <span>Time: <strong style={{ color: "var(--text-secondary)" }}>{(assets.visual.generationTimeMs / 1000).toFixed(1)}s</strong></span>
                )}
                {assets.visual.cost && (
                  <span>Cost: <strong style={{ color: "var(--text-secondary)" }}>${assets.visual.cost.toFixed(3)}</strong></span>
                )}
              </div>
            )}
            </div>

            <div className={selectedAspectRatio === "9:16" ? "flex-1 min-w-0 space-y-3" : ""}>
            {(() => {
              const genInfo = assetsQuery.data?.generationInfo;
              if (!genInfo) return null;
              // Resolve effective per-slot URLs: override (null = removed) || server value.
              // Step 3: Project-level Product default flows in as the effective
              // value when there is no per-scene override and the latest job
              // has no source image of its own. This mirrors the server-side
              // regenerate fallback so the panel shows what will actually be
              // used at generation time.
              const projectProductUrl: string | null = genInfo.projectProductMediaUrl || null;
              const effProduct =
                overrideSourceImage === null
                  ? null
                  : (overrideSourceImage || genInfo.sourceImageUrl || projectProductUrl || null);
              const effCharacter = overrideCharacter === null ? null : (overrideCharacter || genInfo.characterRefImageUrl || null);
              // Logo: client-side override wins (null = excluded, string = custom),
              // otherwise the server-resolved effective logo (which already accounts
              // for any persisted exclude/custom override from the last job).
              const effLogo = overrideLogo === null
                ? null
                : (overrideLogo || genInfo.brandLogoUrl || null);
              const serverExtras: string[] = Array.isArray(genInfo.referenceImages) ? genInfo.referenceImages : [];
              const effExtras: string[] = overrideExtras !== undefined ? overrideExtras : serverExtras;

              // "From project" hint shows when the effective product is the
              // project default and the user hasn't overridden it for this scene.
              const productInherited =
                overrideSourceImage === undefined &&
                !!effProduct &&
                !!projectProductUrl &&
                effProduct === projectProductUrl;
              // Logo always inherits from the brand bible — it has no per-scene
              // override path in Quick Create, so flag it as inherited when present.
              const logoInherited = !!effLogo;

              // Provider-aware slot enable/disable.
              // "auto" means the user hasn't pinned a provider yet — fall back to
              // whatever the most recent job ran on so we don't over-disable.
              // visual.provider is the post-resolution provider returned by /assets.
              const visualProvider = assetsQuery.data?.visual?.provider as string | null | undefined;
              const rawProvider = (selectedProvider && selectedProvider !== "auto")
                ? selectedProvider
                : (genInfo.provider || visualProvider || "");
              const providerKey = String(rawProvider).toLowerCase();
              const providers = PROVIDER_CONFIG as Record<string, VideoProvider>;
              const providerCfg: VideoProvider | undefined =
                providers[providerKey] || providers[providerKey.split('-')[0]];
              // multiImageSupport is an OBJECT (max images, syntax, hint) when the
              // provider supports multi-image, undefined otherwise. Coerce to bool.
              const supportsMulti = Boolean(providerCfg?.multiImageSupport);
              // Character is a single ref (used in place of product when set), so it's
              // safe even on single-image providers. Only LOGO and ADD compose a
              // SECOND image alongside product, which truly needs multi-image support.
              const slotsEnabled = {
                product: true,
                character: true,
                logo: supportsMulti,
                add: supportsMulti,
              };

              // Stale fingerprint vs last completed job.
              // Logo is included so changing brand bible logo also surfaces the
              // "regenerate to apply" hint, even though the slot itself is read-only.
              // The product baseline mirrors the server-side fallback chain
              // (latest job source image → project default) so the pill clears
              // correctly after hydration when the slot inherits the default.
              const lastFingerprint = JSON.stringify({
                p: genInfo.sourceImageUrl || projectProductUrl || null,
                c: genInfo.characterRefImageUrl || null,
                l: genInfo.brandLogoUrl || null,
                e: serverExtras.slice().sort(),
              });
              const currentFingerprint = JSON.stringify({
                p: effProduct,
                c: effCharacter,
                l: effLogo,
                e: effExtras.slice().sort(),
              });
              const isStale = lastFingerprint !== currentFingerprint;
              const isRemoved = overrideSourceImage === null;

              const removeExtra = (url: string) => {
                const base = overrideExtras !== undefined ? overrideExtras : serverExtras;
                setOverrideExtras(base.filter((u) => u !== url));
              };

              return (
                <div className="mb-3 border rounded-lg p-3 space-y-3" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.2)" }}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-medium block" style={{ color: "var(--text-muted)" }}>
                      Reference Images
                    </label>
                    <div className="flex items-center gap-2">
                      {isStale && (
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
                          style={{ backgroundColor: "rgba(234, 179, 8, 0.15)", color: "rgb(234, 179, 8)", border: "1px solid rgba(234, 179, 8, 0.4)" }}
                          data-testid="badge-references-stale"
                        >
                          <RefreshCw className="w-3 h-3" />
                          References changed — regenerate to apply
                        </span>
                      )}
                      <button
                        className="text-[10px] text-purple-400 hover:text-purple-300 disabled:opacity-50 flex items-center gap-1"
                        disabled={generatingSourceImage || uploadingSourceImage}
                        onClick={async () => {
                          try {
                            setGeneratingSourceImage(true);
                            const res = await fetch(`/api/projects/${projectId}/quick-create/generate-source-image`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({ prompt: promptText, artPresetId: artPresetId || undefined }),
                            });
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({}));
                              throw new Error(err.error || "Generation failed");
                            }
                            const data = await res.json();
                            if (data?.url) {
                              setOverrideSourceImage(data.url);
                              toast({ title: "Reference image generated", description: "New AI-generated reference is set. Click Regenerate to use it." });
                            }
                          } catch (e: any) {
                            toast({ title: "Generation failed", description: e?.message || "Could not generate image", variant: "destructive" });
                          } finally {
                            setGeneratingSourceImage(false);
                          }
                        }}
                        title="Generate a new product reference with AI"
                      >
                        {generatingSourceImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        AI {effProduct ? "Regen" : "Generate"} Product
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-start gap-3">
                    <SlotTile
                      label="Product"
                      url={effProduct}
                      emptyAction={() => {
                        pendingUploadSlotRef.current = "product";
                        (document.getElementById("qc-source-image-upload") as HTMLInputElement | null)?.click();
                      }}
                      emptyHint="Upload a product photo"
                      badgeColor="rgba(16,185,129,0.4)"
                      onClick={() => effProduct && (setReferenceLightboxUrl(effProduct), setReferenceLightboxOpen(true))}
                      onRemove={effProduct ? () => setOverrideSourceImage(null) : undefined}
                      inherited={productInherited}
                    />
                    <SlotTile
                      label="Character"
                      url={slotsEnabled.character ? effCharacter : null}
                      emptyAction={() => {
                        if (!slotsEnabled.character) {
                          toast({ title: "Single-image provider", description: `${providerCfg?.label || providerKey} only accepts one reference.`, variant: "destructive" });
                          return;
                        }
                        pendingUploadSlotRef.current = "character";
                        (document.getElementById("qc-source-image-upload") as HTMLInputElement | null)?.click();
                      }}
                      emptyHint={slotsEnabled.character ? "Upload a character reference" : "Not supported by this provider"}
                      badgeColor="rgba(244,114,182,0.4)"
                      onClick={() => effCharacter && (setReferenceLightboxUrl(effCharacter), setReferenceLightboxOpen(true))}
                      onRemove={effCharacter ? () => setOverrideCharacter(null) : undefined}
                    />
                    <SlotTile
                      label="Logo"
                      url={slotsEnabled.logo ? effLogo : null}
                      disabled={!slotsEnabled.logo}
                      emptyAction={() => {
                        if (!slotsEnabled.logo) return;
                        // Empty state: offer upload of a custom logo for this run.
                        // Brand bible can still be edited separately.
                        pendingUploadSlotRef.current = "logo";
                        (document.getElementById("qc-source-image-upload") as HTMLInputElement | null)?.click();
                      }}
                      emptyHint={slotsEnabled.logo
                        ? "Upload a logo for this run (or add one to your brand bible)"
                        : `${providerCfg?.displayName || providerKey} only accepts one reference image — switch to Kling 2.x, Veo 3.1, Luma, Hailuo, or Runway to use a logo.`}
                      badgeColor="rgba(168,85,247,0.4)"
                      onClick={() => effLogo && (setReferenceLightboxUrl(effLogo), setReferenceLightboxOpen(true))}
                      onRemove={slotsEnabled.logo && effLogo ? () => setOverrideLogo(null) : undefined}
                      onReplace={slotsEnabled.logo && effLogo ? () => {
                        pendingUploadSlotRef.current = "logo";
                        (document.getElementById("qc-source-image-upload") as HTMLInputElement | null)?.click();
                      } : undefined}
                      inherited={slotsEnabled.logo && logoInherited}
                    />
                    {effExtras.map((url, i) => (
                      <SlotTile
                        key={`qc-extra-${i}`}
                        label={`Extra ${i + 1}`}
                        url={url}
                        badgeColor="rgba(124,58,237,0.4)"
                        onClick={() => { setReferenceLightboxUrl(url); setReferenceLightboxOpen(true); }}
                        onRemove={() => removeExtra(url)}
                      />
                    ))}
                    <SlotTile
                      label="Add"
                      empty
                      disabled={!slotsEnabled.add}
                      emptyAction={() => {
                        if (!slotsEnabled.add) return;
                        pendingUploadSlotRef.current = "extra";
                        (document.getElementById("qc-source-image-upload") as HTMLInputElement | null)?.click();
                      }}
                      emptyHint={slotsEnabled.add
                        ? "Add a reference image"
                        : `${providerCfg?.displayName || providerKey} only accepts one reference image — switch to Kling 2.x, Veo 3.1, Luma, Hailuo, or Runway to add more.`}
                      badgeColor="rgba(124,58,237,0.4)"
                    />
                  </div>

                  {!supportsMulti && (
                    <p className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>
                      {(providerCfg?.label || providerKey || "This provider")} only accepts a single reference image. Use Product OR Character — Logo and Extras are disabled.
                    </p>
                  )}
                  {isRemoved && (
                    <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>Product image removed — will generate text-to-video on next run</p>
                  )}
                  {genInfo.referenceVideoUrl && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                      <Film className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{genInfo.referenceVideoUrl.split('/').pop()}</span>
                    </div>
                  )}
                  {imageFidelity != null && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Image Fidelity</span>
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="w-3 h-3 cursor-help" style={{ color: "var(--text-muted)" }} />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[240px] text-left space-y-1.5 p-3">
                                <p className="font-medium text-xs">CFG Scale (Image Fidelity)</p>
                                <p className="text-xs opacity-90">Controls how closely the video follows the reference image. Higher = product label stays sharper. Lower = more creative movement.</p>
                                <div className="text-[10px] opacity-75 space-y-0.5 pt-0.5 border-t border-white/20">
                                  <p>🏷️ Product / label scenes: 85–95%</p>
                                  <p>👤 Character identity: 60–75%</p>
                                  <p>🎨 Creative / abstract: 40–60%</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <span className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>{Math.round(imageFidelity * 100)}%</span>
                      </div>
                      <div className="relative">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(imageFidelity * 100)}
                          onChange={(e) => setImageFidelity(parseInt(e.target.value) / 100)}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                          style={{ background: `linear-gradient(to right, rgb(168 85 247) ${Math.round(imageFidelity * 100)}%, var(--border-subtle) ${Math.round(imageFidelity * 100)}%)` }}
                        />
                        {suzzieSuggestedFidelity !== null && (
                          <div
                            className="absolute top-full pointer-events-none flex flex-col items-center"
                            style={{ left: `${suzzieSuggestedFidelity * 100}%`, transform: 'translateX(-50%)' }}
                          >
                            <div className="w-px h-2 bg-cyan-400/60" />
                            <span className={`text-[9px] font-semibold whitespace-nowrap transition-colors ${Math.abs((imageFidelity ?? 0) - suzzieSuggestedFidelity) < 0.026 ? 'text-cyan-400' : 'text-cyan-600/60'}`}>
                              Suzzie ✦
                            </span>
                          </div>
                        )}
                      </div>
                      <div className={`flex justify-between ${suzzieSuggestedFidelity !== null ? 'mt-5' : 'mt-0.5'}`}>
                        <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>Creative</span>
                        <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>Faithful</span>
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Negative Prompt</span>
                      {!editNegativePrompt && (
                        <button className="text-[10px] text-purple-400 hover:text-purple-300" onClick={() => setEditNegativePrompt(true)}>Edit</button>
                      )}
                    </div>
                    {editNegativePrompt ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={negativePrompt}
                          onChange={(e) => setNegativePrompt(e.target.value)}
                          rows={2}
                          placeholder="Things to avoid in generation..."
                          className="w-full rounded-lg border p-2 text-xs resize-none"
                          style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}
                        />
                        <button className="text-[10px] text-purple-400 hover:text-purple-300" onClick={() => setEditNegativePrompt(false)}>Done</button>
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{negativePrompt || "None"}</p>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Art Style</span>
                </div>
                {artPresetId && artPresetId !== "auto" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    {allPresets.find(p => p.id === artPresetId)?.name || artPresetId}
                  </span>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
                <button
                  type="button"
                  onClick={() => setArtPresetId("auto")}
                  className="flex-shrink-0 w-[72px] rounded-lg border-2 p-1.5 transition-all"
                  style={{
                    backgroundColor: (!artPresetId || artPresetId === "auto") ? "rgba(139, 92, 246, 0.15)" : "var(--surface)",
                    borderColor: (!artPresetId || artPresetId === "auto") ? "rgb(139, 92, 246)" : "var(--border-subtle)",
                  }}
                >
                  <div className="w-full h-10 rounded mb-1 flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.3))" }}>
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <span className="text-[10px] font-medium block" style={{ color: "var(--text-primary)" }}>Auto</span>
                </button>
                {allPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setArtPresetId(preset.id)}
                    className="flex-shrink-0 w-[72px] rounded-lg border-2 p-1.5 transition-all"
                    style={{
                      backgroundColor: artPresetId === preset.id ? "rgba(139, 92, 246, 0.15)" : "var(--surface)",
                      borderColor: artPresetId === preset.id ? "rgb(139, 92, 246)" : "var(--border-subtle)",
                    }}
                  >
                    <div className="w-full h-10 rounded mb-1 overflow-hidden" style={{ border: `1px solid ${preset.thumbnailColors[0]}33` }}>
                      <img src={`/art-presets/${preset.id}.png`} alt={preset.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <span className="text-[10px] font-medium block truncate" style={{ color: "var(--text-primary)" }}>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Monitor className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Aspect Ratio</span>
              </div>
              <div className="flex gap-2">
                {([
                  { value: "16:9", label: "16:9", sublabel: "YouTube", icon: "▬" },
                  { value: "9:16", label: "9:16", sublabel: "Reels/TikTok", icon: "▮" },
                  { value: "1:1", label: "1:1", sublabel: "Square", icon: "■" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedAspectRatio(opt.value)}
                    className="flex-1 rounded-lg border-2 py-2 px-2 transition-all text-center"
                    style={{
                      backgroundColor: selectedAspectRatio === opt.value ? "rgba(139, 92, 246, 0.15)" : "var(--surface)",
                      borderColor: selectedAspectRatio === opt.value ? "rgb(139, 92, 246)" : "var(--border-subtle)",
                    }}
                  >
                    <span className="text-base block mb-0.5">{opt.icon}</span>
                    <span className="text-[11px] font-medium block" style={{ color: "var(--text-primary)" }}>{opt.label}</span>
                    <span className="text-[9px] block" style={{ color: "var(--text-muted)" }}>{opt.sublabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {project.mediaMode !== "image" && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Video Length</span>
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Longer clips cost more and take longer to render
                  </span>
                </div>
                <div className="flex gap-2">
                  {([
                    { value: 5, label: "5s", sublabel: "Snappy" },
                    { value: 6, label: "6s", sublabel: "Default" },
                    { value: 8, label: "8s", sublabel: "Detailed" },
                    { value: 10, label: "10s", sublabel: "Extended" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const prior = selectedDuration;
                        setSelectedDuration(opt.value);
                        if (opt.value !== (project?.totalDuration || 0)) {
                          updateDurationMutation.mutate(opt.value, {
                            onError: () => {
                              setSelectedDuration(Number(project?.totalDuration) || prior);
                            },
                          });
                        }
                      }}
                      disabled={updateDurationMutation.isPending}
                      className="flex-1 rounded-lg border-2 py-2 px-2 transition-all text-center disabled:opacity-60"
                      data-testid={`duration-${opt.value}`}
                      style={{
                        backgroundColor: selectedDuration === opt.value ? "rgba(139, 92, 246, 0.15)" : "var(--surface)",
                        borderColor: selectedDuration === opt.value ? "rgb(139, 92, 246)" : "var(--border-subtle)",
                      }}
                    >
                      <span className="text-[13px] font-semibold block" style={{ color: "var(--text-primary)" }}>{opt.label}</span>
                      <span className="text-[9px] block" style={{ color: "var(--text-muted)" }}>{opt.sublabel}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Visual Prompt</label>
                  </div>
                  <AssetSuzzieChat
                    mode={isI2V ? 'i2v' : (project?.mediaMode === 'image' ? 't2i' : 't2v')}
                    provider={selectedProvider}
                    prompt={promptText}
                    hasReferenceImage={!!(overrideSourceImage || assetsQuery.data?.generationInfo?.sourceImageUrl)}
                    aspectRatio={selectedAspectRatio}
                    duration={selectedDuration}
                    style={artPresetId || ''}
                    validProviderIds={[]}
                    onApplyPrompt={setPromptText}
                    onApplyProvider={setSelectedProvider}
                    onApplyNegativePrompt={setNegativePrompt}
                    onApplyCfgScale={(val) => { setImageFidelity(val); setSuzzieSuggestedFidelity(val); }}
                  />
                </div>
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="Describe the visual direction for your video..."
                  rows={3}
                  className="w-full rounded-lg border p-3 text-sm resize-none transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/50"
                  style={{ backgroundColor: "rgba(0,0,0,0.2)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                />
                <AskSuzziePanel
                  sceneContext={{
                    narration: narrationText || promptText,
                    sceneType: 'product',
                    artPresetId: artPresetId || 'auto',
                    artPresetName: artPresetId ? (getVisualArtPreset(artPresetId)?.name || artPresetId) : 'Auto',
                    visualDirection: promptText,
                    provider: selectedProvider,
                    projectTitle: assetsQuery.data?.project?.title || '',
                    hasReferenceImage: !!(overrideSourceImage || assetsQuery.data?.generationInfo?.sourceImageUrl),
                  }}
                  onApplyVisualDirection={(newPrompt) => setPromptText(newPrompt)}
                  onApplyProvider={(providerId, rationale) => { setSelectedProvider(providerId); setSuzzieProviderRationale(rationale); }}
                  onApplyArtStyle={(artStyleId) => setArtPresetId(artStyleId)}
                  onApplyCfgScale={(val) => { setImageFidelity(val); setSuzzieSuggestedFidelity(val); }}
                />
              </div>

              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <ProviderCatalogSelector
                    outputType={outputType}
                    provider={selectedProvider}
                    onProviderChange={(v) => { setSelectedProvider(v); setSuzzieProviderRationale(undefined); }}
                    label="Provider"
                    compact
                    suzzieRationale={suzzieProviderRationale}
                  />
                </div>
                <Button
                  onClick={() => generateVisualMutation.mutate()}
                  disabled={generateVisualMutation.isPending || visualGenerating || assets.visual?.status === "generating" || assets.visual?.status === "processing" || assets.visual?.status === "queued"}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white gap-1.5 text-sm"
                  size="sm"
                >
                  {(generateVisualMutation.isPending || visualGenerating || assets.visual?.status === "generating" || assets.visual?.status === "processing" || assets.visual?.status === "queued") ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {assets.visual?.status === "completed" ? "Regenerate" : "Generate"}
                    </>
                  )}
                </Button>
              </div>
            </div>
            </div>
            </div>
          </div>

          {overlaySection}

          {assets.visual?.status === "completed" && assets.visual?.url && (
            <SceneImageActions
              imageUrl={assets.visual.url}
              mediaType={project?.mediaMode === "image" ? "image" : (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(assets.visual.url) ? "video" : "image")}
              projectId={projectId}
              projectTitle={project?.title}
              visualDirection={project?.visualDirection || project?.title}
              width={previewSizing.pw}
              height={previewSizing.ph}
            />
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
                  <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Narration Script</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {assets.voiceover?.narrationText && narrationText !== assets.voiceover.narrationText && (
                        <span className="text-[10px] text-amber-400">Edited — regenerate to apply</span>
                      )}
                      <div className="flex items-center gap-1 rounded-md p-0.5" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} role="radiogroup" aria-label="Narration tone">
                        {(["punchy", "educational", "story"] as const).map((t) => {
                          const active = narrationTone === t;
                          const label = t === "punchy" ? "Punchy" : t === "educational" ? "Educational" : "Story";
                          return (
                            <button
                              key={t}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setNarrationTone(t)}
                              data-testid={`tone-${t}`}
                              className="text-[10px] font-medium px-2 py-0.5 rounded transition-colors"
                              style={{
                                backgroundColor: active ? "rgba(139, 92, 246, 0.25)" : "transparent",
                                color: active ? "rgb(216, 201, 253)" : "var(--text-secondary)",
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => suggestNarrationMutation.mutate({ durationSec: selectedDuration })}
                        disabled={suggestNarrationMutation.isPending || !(promptText || (project as any)?.description)}
                        title="Have AI write an on-brand narration script from your visual prompt"
                        data-testid="suggest-narration"
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          borderColor: "rgba(139, 92, 246, 0.4)",
                          color: "rgb(196, 181, 253)",
                          backgroundColor: "rgba(139, 92, 246, 0.08)",
                        }}
                      >
                        {suggestNarrationMutation.isPending ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Writing…
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" />
                            AI Suggest
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={narrationText}
                    onChange={(e) => setNarrationText(e.target.value)}
                    placeholder="Type what the narrator should say... (e.g. &quot;Welcome to Pine Hill&quot;)"
                    rows={5}
                    data-testid="narration-script"
                    className="w-full rounded-lg border px-3 py-2 text-sm leading-relaxed resize-y"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-medium)", color: "var(--text-primary)", minHeight: "5rem" }}
                  />
                  {(() => {
                    const trimmed = narrationText.trim();
                    if (!trimmed) {
                      return (
                        <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                          Leave empty to use the visual prompt as narration
                        </p>
                      );
                    }
                    const words = trimmed.split(/\s+/).length;
                    const aspect = selectedAspectRatio || (project as any)?.outputFormat?.aspectRatio || "16:9";
                    const readSec = estimateReadTimeSec(trimmed, aspect);
                    const readSecRounded = Math.round(readSec);
                    const overflowsPicker = readSec > selectedDuration + QC_DURATION_TOLERANCE_SEC;
                    const overflowsCap = readSec > QC_MAX_VIDEO_DURATION + QC_DURATION_TOLERANCE_SEC;
                    const color = overflowsCap
                      ? "rgb(248,113,113)"
                      : overflowsPicker
                      ? "rgb(251,191,36)"
                      : "var(--text-muted)";
                    return (
                      <p className="text-[10px] mt-1" style={{ color }} data-testid="narration-readtime-hint">
                        {words} words · ~{readSecRounded}s read time (video is {selectedDuration}s)
                        {overflowsPicker && !overflowsCap && " — will overflow the selected video length"}
                        {overflowsCap && ` — exceeds the ${QC_MAX_VIDEO_DURATION}s max video length`}
                      </p>
                    );
                  })()}
                </div>

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

                {(() => {
                  const audioDur = Number(assets.voiceover?.duration) || 0;
                  if (assets.voiceover?.status !== "completed" || audioDur <= 0) return null;
                  const videoDur = selectedDuration;
                  const drift = Math.abs(audioDur - videoDur);
                  if (drift <= QC_DURATION_TOLERANCE_SEC) return null;
                  const audioLonger = audioDur > videoDur;
                  const matchTarget = snapDurationUp(audioDur);
                  const matchWouldChange = matchTarget !== videoDur;
                  const exceedsCap = audioDur > QC_MAX_VIDEO_DURATION + QC_DURATION_TOLERANCE_SEC;
                  return (
                    <div
                      className="mb-3 rounded-lg border p-3 text-xs"
                      data-testid="voiceover-duration-warning"
                      style={{
                        backgroundColor: audioLonger ? "rgba(245, 158, 11, 0.08)" : "rgba(59, 130, 246, 0.08)",
                        borderColor: audioLonger ? "rgba(245, 158, 11, 0.35)" : "rgba(59, 130, 246, 0.35)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${audioLonger ? "text-amber-400" : "text-blue-400"}`} />
                        <div className="flex-1">
                          <p className="font-medium mb-1">
                            {audioLonger
                              ? `Voiceover is ${Math.round(audioDur)}s but video length is ${videoDur}s`
                              : `Voiceover is ${Math.round(audioDur)}s but video length is ${videoDur}s`}
                          </p>
                          <p style={{ color: "var(--text-secondary)" }}>
                            {audioLonger
                              ? exceedsCap
                                ? `Even at the ${QC_MAX_VIDEO_DURATION}s max video length, the last ${Math.max(0, Math.round(audioDur - QC_MAX_VIDEO_DURATION))}s of narration won't be heard. Shorten the script to fit.`
                                : `Only the first ${videoDur}s of narration will be heard.`
                              : `The video will have ${Math.round(videoDur - audioDur)}s of silence at the end.`}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {matchWouldChange && (
                              <button
                                type="button"
                                onClick={() => updateDurationMutation.mutate(matchTarget)}
                                disabled={updateDurationMutation.isPending}
                                data-testid="match-video-to-narration"
                                className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors disabled:opacity-50"
                                style={{
                                  borderColor: "rgba(139, 92, 246, 0.5)",
                                  color: "rgb(216, 201, 253)",
                                  backgroundColor: "rgba(139, 92, 246, 0.12)",
                                }}
                              >
                                {updateDurationMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Clock className="w-3 h-3" />
                                )}
                                {audioLonger
                                  ? `Match video to narration (${matchTarget}s)`
                                  : `Trim video to narration (${matchTarget}s)`}
                              </button>
                            )}
                            {audioLonger && (
                              <button
                                type="button"
                                onClick={async () => {
                                  // Single click should resolve the mismatch end-to-end:
                                  // (1) shorten the script, then (2) immediately
                                  // re-record the voiceover with the new script.
                                  toast({
                                    title: "Shortening script and re-recording voiceover…",
                                    description: "We're rewriting the narration to fit the video, then regenerating the voiceover.",
                                  });
                                  let suggested: { script: string; wordCount: number; targetWords?: number } | undefined;
                                  try {
                                    suggested = await suggestNarrationMutation.mutateAsync({
                                      tone: narrationTone,
                                      durationSec: videoDur,
                                      auto: true,
                                    });
                                  } catch {
                                    // Error toast already shown by suggestNarrationMutation.onError.
                                    return;
                                  }
                                  if (!suggested?.script) return;
                                  try {
                                    await generateVoiceoverMutation.mutateAsync({
                                      narrationText: suggested.script,
                                      silentToast: true,
                                    });
                                    toast({
                                      title: "Narration shortened, voiceover re-recording",
                                      description: `New script is ${suggested.wordCount} words${suggested.targetWords ? ` (target ~${suggested.targetWords})` : ""}. The voiceover is being regenerated.`,
                                    });
                                  } catch {
                                    // The script shortening already succeeded — surface a
                                    // recovery hint so the user can retry the regenerate.
                                    toast({
                                      title: "Voiceover regeneration failed",
                                      description: "The script was shortened, but we couldn't kick off the new voiceover. Click Regenerate Voiceover to try again.",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                                disabled={suggestNarrationMutation.isPending || generateVoiceoverMutation.isPending || assets.voiceover?.status === "generating"}
                                data-testid="shorten-narration-to-fit"
                                className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors disabled:opacity-50"
                                style={{
                                  borderColor: "rgba(139, 92, 246, 0.5)",
                                  color: "rgb(216, 201, 253)",
                                  backgroundColor: "rgba(139, 92, 246, 0.12)",
                                }}
                              >
                                {(suggestNarrationMutation.isPending || generateVoiceoverMutation.isPending) ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3 h-3" />
                                )}
                                Shorten narration & re-record
                              </button>
                            )}
                          </div>
                          {audioLonger && (
                            <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
                              Tip: shortening the script will automatically re-record the voiceover with your selected voice.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <Button
                  onClick={() => generateVoiceoverMutation.mutate(undefined)}
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
    <Dialog
      open={referenceLightboxOpen}
      onOpenChange={(open) => {
        setReferenceLightboxOpen(open);
        if (!open) setReferenceLightboxUrl(null);
      }}
    >
      <DialogContent className="max-w-4xl p-2 bg-black/95 border-none">
        {(() => {
          // Prefer the per-slot URL set by SlotTile clicks; fall back to product
          // for legacy callers that opened the dialog without setting a URL.
          const genInfo = assetsQuery.data?.generationInfo;
          const fallback = overrideSourceImage === null ? null : (overrideSourceImage || genInfo?.sourceImageUrl || null);
          const src = referenceLightboxUrl || fallback;
          if (!src) return null;
          return (
            <img
              src={src}
              alt="Reference (full size)"
              className="w-full h-auto max-h-[85vh] object-contain rounded"
            />
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
}
