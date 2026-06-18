import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Play, Pause, Volume2, VolumeX, Maximize2, MoreVertical,
  RefreshCw, Upload, Image, Video, Save, X, Loader2,
  CheckCircle2, ImagePlus, ChevronDown, ChevronRight, ChevronUp, Edit2, FolderOpen, Expand, Sparkles, Palette,
  Layers, AlertTriangle, Info
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SceneOverlayEditor, type SceneOverlayItem } from "./scene-overlay-editor";
import type { MicroSceneOverlayItem, ImageOverlayItem } from "@shared/video-types";
import { ProviderCapabilitySelector, getProviderRecommendationText } from "./ProviderCapabilityCard";
import { AskSuzziePanel } from "./ask-suzzie-panel";
import { VIDEO_PROVIDERS as PROVIDER_CONFIG, getMultiImageSupport, type MultiImageSupport } from "@shared/provider-config";
import { SCENE_CONTENT_TAGS, getSceneContentTag } from "@shared/config/scene-content-tags";
import { getVisualArtPreset, getAllVisualArtPresets } from "@shared/config/visual-art-presets";
import { CharacterProfilesPanel } from "./character-profiles-panel";
import { SceneDurationControl } from "./scene-duration-control";
import { NativeAudioToggle } from "./native-audio-toggle";
import { resolveSceneVideoProvider } from "./scene-provider-resolver";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import type { CharacterProfile } from "@shared/video-types";
import {
  useRoutingPreview,
  SceneIntentChips,
  ProviderPill,
  LogoGapCard,
  PromptInspectorDrawer,
  RoleAwareReferenceSlots,
} from "./scene-routing-ui";
import { BrandReferencePanel } from "./brand-reference-panel";
import { DeckSlidePicker } from "./deck-slide-picker";
import type { BrandReferenceInput, Scene } from "@shared/video-types";
import { RENDER_SYSTEM_TYPES, type RenderSystemType } from "@shared/video-types";
import {
  RenderTypeBadge,
  RENDER_TYPE_LABELS,
  RenderRouterPreviewHint,
  RenderedAsBadge,
  ManualClassifiedFallbackToast,
} from "./render-type-badge";
import {
  Select as RsSelect,
  SelectContent as RsSelectContent,
  SelectItem as RsSelectItem,
  SelectTrigger as RsSelectTrigger,
  SelectValue as RsSelectValue,
} from "@/components/ui/select";

const sceneTypes = [
  "hook", "problem", "agitation", "solution", "benefit",
  "proof", "product", "testimonial", "cta", "explanation",
  "process", "intro", "brand"
];

function formatEditorProviderName(raw: string): string {
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
    ['fal.ai', 'Flux (fal.ai)'],
    ['kling-2.6-pro', 'Kling 2.6 Pro'],
    ['kling-2.6', 'Kling 2.6'],
    ['hailuo', 'Hailuo'],
    ['wan-2.6', 'Wan 2.6'],
    ['wan-2.1', 'Wan 2.1'],
    ['veo-3.1', 'Veo 3.1'],
    ['veo-3', 'Veo 3'],
    ['sora-2-pro', 'Sora 2 Pro'],
    ['sora-2', 'Sora 2'],
    ['hunyuan', 'Hunyuan'],
  ];
  const lower = raw.toLowerCase();
  for (const [key, label] of mappings) {
    if (lower === key.toLowerCase() || lower.startsWith(key.toLowerCase())) return label;
  }
  return raw.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

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

const ART_PRESET_IMAGES: Record<string, string> = {
  '3d-illustration': '/art-presets/3d-illustration.png',
  'cinematic-realism': '/art-presets/cinematic-realism.png',
  '2d-line-art': '/art-presets/2d-line-art.png',
  'collage': '/art-presets/collage.png',
  'claymation': '/art-presets/claymation.png',
  'neon-futuristic': '/art-presets/neon-futuristic.png',
  'watercolor': '/art-presets/watercolor.png',
  'minimalist-flat': '/art-presets/minimalist-flat.png',
  'scientific-medical': '/art-presets/scientific-medical.png',
};

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
  artPresetId?: string;
  characters?: CharacterProfile[];
  onCharactersChange?: (characters: CharacterProfile[]) => void;
  brandColors?: string[];
  brand?: import("@shared/video-types").BrandSettings;
  projectMode?: string;
  projectPreferredProvider?: string;
  /** Task #185: Deck-to-Video slide images (progress.deckImages), if any. */
  deckImages?: Array<{ id: string; url: string; pageNumber?: number; label?: string }>;
  /** Task #198: all project scenes, used to show deck-slide usage hints in the picker. */
  allScenes?: any[];
}

export function EnhancedSceneEditor({ scene, sceneIndex, projectId, onClose, aspectRatio = "16:9", artPresetId, characters = [], onCharactersChange, brandColors, brand, projectMode, projectPreferredProvider, deckImages = [], allScenes = [] }: EnhancedSceneEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const refVideoInputRef = useRef<HTMLInputElement>(null);

  const [regeneratingVisualDirection, setRegeneratingVisualDirection] = useState(false);
  const [refLightboxUrl, setRefLightboxUrl] = useState<string | null>(null);
  const [rawLlmResponse, setRawLlmResponse] = useState<{visualDirection: string; microScenes: any[]} | null>(null);
  const [showRawResponse, setShowRawResponse] = useState(false);

  const sceneId = scene.id || `scene-${sceneIndex}`;
  const rawVideoUrl = scene.assets?.videoUrl;
  const imageUrl = scene.assets?.imageUrl || scene.background?.url || scene.textImageUrl;
  // Task 45: cache-bust marker so the browser refetches media after a regen even
  // if the asset URL is reused. The server stamps lastRegenAt on regen.
  const assetCacheKey = scene.assets?.lastRegenAt || scene.assets?.videoProvider || scene.assets?.imageProvider || '';
  const withCacheBust = (url?: string | null) =>
    url ? (assetCacheKey ? `${url}${url.includes('?') ? '&' : '?'}cb=${encodeURIComponent(assetCacheKey)}` : url) : url;
  const hasRawVideo = !!rawVideoUrl;
  const brandAssetUrl = scene.brandAssetUrl as string | undefined;
  const isProductScene = ['product', 'solution', 'hero', 'benefit', 'proof'].includes(scene.type);
  const hasImage = !!imageUrl;
  const assembledClipUrl = scene.assemblyManifest?.assembledClipUrl;
  const assembledClipValid = scene.assemblyManifest && !scene.assemblyManifest.assemblyFailed && scene.assemblyManifest.assembledClipValid !== false && !!assembledClipUrl;
  const videoUrl = assembledClipValid ? assembledClipUrl : rawVideoUrl;
  const hasVideo = !!videoUrl;
  const assetReady = hasVideo || hasImage;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [provider, setProvider] = useState("auto");
  const [generationMode, setGenerationMode] = useState("auto");
  const [brandAssetDismissed, setBrandAssetDismissed] = useState(false);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>(
    () => {
      const existing = scene.assets?.referenceImages || [];
      if (scene.brandAssetUrl && !existing.includes(scene.brandAssetUrl)) {
        return [scene.brandAssetUrl, ...existing];
      }
      return existing;
    }
  );
  const [referenceVideoUrl, setReferenceVideoUrl] = useState<string>(
    () => scene.assets?.referenceVideoUrl || ''
  );
  const [showLibrary, setShowLibrary] = useState(false);
  const [showEditLibrary, setShowEditLibrary] = useState(false);
  const [showMultiImageTip, setShowMultiImageTip] = useState(false);
  const [regeneratingType, setRegeneratingType] = useState<'video' | 'image' | null>(null);
  const [providerMismatchOpen, setProviderMismatchOpen] = useState(false);
  const [providerMismatchInfo, setProviderMismatchInfo] = useState<{
    providerLabel: string;
    referenceCount: number;
  } | null>(null);
  const [regenStartedAt, setRegenStartedAt] = useState<number | null>(null);
  const [regenElapsed, setRegenElapsed] = useState(0);
  const [sceneOverlays, setSceneOverlays] = useState<SceneOverlayItem[]>(
    () => (scene.overlayItems || []).map((o: SceneOverlayItem) =>
      o.type ? o : { ...o, type: 'image' as const } as ImageOverlayItem
    )
  );
  const [editingMicroScene, setEditingMicroScene] = useState<number | null>(null);
  const [microSceneEditValue, setMicroSceneEditValue] = useState("");
  const [regeneratingMicroScenes, setRegeneratingMicroScenes] = useState<Set<number>>(new Set());
  const regeneratingRef = useRef<Set<number>>(new Set());
  const [msRegenStartedAt, setMsRegenStartedAt] = useState<number | null>(null);
  const [msRegenElapsed, setMsRegenElapsed] = useState(0);
  const msRegenTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [allMsMode, setAllMsMode] = useState("auto");
  const [allMsProvider, setAllMsProvider] = useState("auto");
  const prevMicroSceneVideos = useRef<Record<number, string | undefined>>({});
  const [isAssembling, setIsAssembling] = useState(false);
  const [showMicroScenesExpanded, setShowMicroScenesExpanded] = useState(true);
  const assembledVideoRef = useRef<HTMLVideoElement>(null);
  const allJobsDonePolls = useRef(0);
  const reconcileInFlight = useRef(false);
  const [expandedMicroScene, setExpandedMicroScene] = useState<number | null>(null);
  const [fullscreenMicroScene, setFullscreenMicroScene] = useState<number | null>(null);
  const [sceneImageFidelity, setSceneImageFidelity] = useState<number | null>(() => scene.imageFidelity ?? null);
  const [msModalPrompt, setMsModalPrompt] = useState("");
  const [msModalEditingPrompt, setMsModalEditingPrompt] = useState(false);
  const [msModalProvider, setMsModalProvider] = useState("auto");
  const [msModalMode, setMsModalMode] = useState("auto");
  const [msModalImageFidelity, setMsModalImageFidelity] = useState<number | null>(null);
  const [msModalRefImages, setMsModalRefImages] = useState<string[]>([]);
  const [msModalShowLibrary, setMsModalShowLibrary] = useState(false);
  const [msModalShowMultiRefExpander, setMsModalShowMultiRefExpander] = useState(false);
  const msModalFileRef = useRef<HTMLInputElement>(null);
  const [msInlineRefImages, setMsInlineRefImages] = useState<Record<number, string[]>>({});
  const [msInlineShowExpander, setMsInlineShowExpander] = useState<Record<number, boolean>>({});
  const [msInlineShowLibrary, setMsInlineShowLibrary] = useState<Record<number, boolean>>({});
  const msInlineFileRef = useRef<HTMLInputElement>(null);
  const msInlineUploadTarget = useRef<number | null>(null);
  const overlayDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const msOverlayDebounceRefs = useRef<Record<number, NodeJS.Timeout>>({});
  const [msOverlayState, setMsOverlayState] = useState<Record<number, MicroSceneOverlayItem[]>>({});
  const [activeMsOverlayScope, setActiveMsOverlayScope] = useState<number | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const msPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const visualDirectionRef = useRef<HTMLTextAreaElement>(null);
  const narrationRef = useRef<HTMLTextAreaElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevVideoUrl = useRef(videoUrl);
  const prevImageUrl = useRef(imageUrl);

  useEffect(() => {
    setBrandAssetDismissed(false);
  }, [scene.id]);

  useEffect(() => {
    const incoming = scene.assets?.referenceImages || [];
    const withBrand = scene.brandAssetUrl && !brandAssetDismissed && !incoming.includes(scene.brandAssetUrl)
      ? [scene.brandAssetUrl, ...incoming]
      : incoming;
    if (JSON.stringify(withBrand) !== JSON.stringify(referenceImageUrls)) {
      setReferenceImageUrls(withBrand);
    }
  }, [scene.brandAssetUrl, scene.assets?.referenceImages, brandAssetDismissed]);

  const handleRegenerateVisualDirection = async () => {
    setRegeneratingVisualDirection(true);
    toast({ title: "Regenerating visual direction..." });
    try {
      const url = `/api/universal-video/projects/${projectId}/scenes/${sceneId}/regenerate-visual-direction`;
      console.log('[RegenVD] Calling:', url);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      console.log('[RegenVD] Response status:', response.status);
      if (!response.ok) {
        let errMsg = `Server returned ${response.status}`;
        try {
          const text = await response.text();
          console.log('[RegenVD] Error body:', text);
          if (text) {
            try { errMsg = JSON.parse(text).error || errMsg; } catch { errMsg = text.substring(0, 200); }
          }
        } catch {}
        throw new Error(errMsg);
      }
      const data = await response.json();
      console.log('[RegenVD] Success:', data.success, 'visualDirection length:', data.visualDirection?.length);
      if (data.success && data.visualDirection) {
        setEditValues(prev => ({ ...prev, visualDirection: data.visualDirection }));
        setRawLlmResponse({ visualDirection: data.visualDirection, microScenes: data.microScenes || [] });
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        toast({ title: "Visual direction regenerated" });
      }
    } catch (error: any) {
      console.error('[RegenVD] Failed:', error);
      toast({ title: "Failed to regenerate", description: error.message, variant: "destructive" });
    } finally {
      setRegeneratingVisualDirection(false);
    }
  };

  const pendingOverlaySaveRef = useRef<SceneOverlayItem[] | null>(null);

  const flushOverlaySave = useCallback(() => {
    const pending = pendingOverlaySaveRef.current;
    if (pending === null) return;
    pendingOverlaySaveRef.current = null;
    if (overlayDebounceRef.current) {
      clearTimeout(overlayDebounceRef.current);
      overlayDebounceRef.current = null;
    }
    fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ overlayItems: pending }),
    }).then((res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      } else {
        toast({ title: "Failed to save overlays", variant: "destructive" });
      }
    }).catch(() => {
      toast({ title: "Failed to save overlays", variant: "destructive" });
    });
  }, [projectId, sceneId, queryClient, toast]);

  const handleOverlayChange = useCallback((newOverlays: SceneOverlayItem[]) => {
    setSceneOverlays(newOverlays);
    pendingOverlaySaveRef.current = newOverlays;
    if (overlayDebounceRef.current) clearTimeout(overlayDebounceRef.current);
    overlayDebounceRef.current = setTimeout(() => {
      flushOverlaySave();
    }, 800);
  }, [flushOverlaySave]);

  const handleMicroSceneOverlayChange = useCallback((msIdx: number, newOverlays: MicroSceneOverlayItem[]) => {
    setMsOverlayState(prev => ({ ...prev, [msIdx]: newOverlays }));

    if (msOverlayDebounceRefs.current[msIdx]) clearTimeout(msOverlayDebounceRefs.current[msIdx]);
    msOverlayDebounceRefs.current[msIdx] = setTimeout(() => {
      fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}/micro-scenes/${msIdx}/overlays`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ overlayItems: newOverlays }),
      }).then((res) => {
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        } else {
          toast({ title: "Failed to save micro-scene overlays", variant: "destructive" });
        }
      }).catch(() => {
        toast({ title: "Failed to save micro-scene overlays", variant: "destructive" });
      });
    }, 800);
  }, [projectId, sceneId, queryClient, toast]);

  useEffect(() => {
    return () => {
      flushOverlaySave();
      Object.values(msOverlayDebounceRefs.current).forEach(t => clearTimeout(t));
    };
  }, [flushOverlaySave]);

  useEffect(() => {
    if (pendingOverlaySaveRef.current !== null) return;
    const incoming: SceneOverlayItem[] = (scene.overlayItems || []).map((o: SceneOverlayItem) =>
      o.type ? o : { ...o, type: 'image' as const } as ImageOverlayItem
    );
    if (JSON.stringify(incoming) !== JSON.stringify(sceneOverlays)) {
      setSceneOverlays(incoming);
    }
  }, [scene.overlayItems]);

  useEffect(() => {
    setMsOverlayState({});
    setActiveMsOverlayScope(prev => {
      const msCount = (scene.microScenes || []).length;
      if (msCount === 0) return null;
      if (prev !== null && prev < msCount) return prev;
      return null;
    });
  }, [scene.microScenes]);

  useEffect(() => {
    const checkActiveMsJobs = async () => {
      try {
        const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/micro-scene-jobs`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.activeJobs) {
          const indices = Object.keys(data.activeJobs).map(Number);
          if (indices.length > 0) {
            const activeSet = new Set(indices);
            regeneratingRef.current = activeSet;
            setRegeneratingMicroScenes(activeSet);
            const oldestJob = Object.values(data.activeJobs as Record<string, any>).reduce((oldest: any, job: any) => {
              const age = Date.now() - new Date(job.createdAt).getTime();
              return !oldest || age > oldest.age ? { age, job } : oldest;
            }, null as any);
            if (oldestJob) {
              setMsRegenStartedAt(Date.now() - oldestJob.age);
              setMsRegenElapsed(Math.floor(oldestJob.age / 1000));
            }
          } else {
            regeneratingRef.current = new Set();
            setRegeneratingMicroScenes(new Set());
            setMsRegenStartedAt(null);
            setMsRegenElapsed(0);
            if (msRegenTimerRef.current) clearInterval(msRegenTimerRef.current);
          }
        }
      } catch {}
    };
    checkActiveMsJobs();
  }, [projectId, sceneId]);

  useEffect(() => {
    if (regeneratingMicroScenes.size === 0) {
      allJobsDonePolls.current = 0;
      return;
    }
    const reconcileWithServer = async () => {
      if (reconcileInFlight.current) return;
      reconcileInFlight.current = true;
      try {
        const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/micro-scene-jobs`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
          const activeIndices = new Set(Object.keys(data.activeJobs || {}).map(Number));
          const prev = regeneratingRef.current;
          const next = new Set<number>();
          prev.forEach(idx => { if (activeIndices.has(idx)) next.add(idx); });

          let shouldRefresh = false;

          if (next.size < prev.size) {
            shouldRefresh = true;
          }

          if (next.size === 0 && prev.size > 0) {
            allJobsDonePolls.current++;
            shouldRefresh = true;
            if (allJobsDonePolls.current >= 3) {
              await queryClient.refetchQueries({ queryKey: ["project", projectId] });
              const prevIndices = Array.from(prev);
              const freshProject = queryClient.getQueryData<any>(["project", projectId]);
              const freshScene = freshProject?.scenes?.find((s: any) => s.id === sceneId);
              const allHaveVideo = prevIndices.every((idx: number) => freshScene?.microScenes?.[idx]?.videoUrl);
              allJobsDonePolls.current = 0;
              // Always clear spinners once all jobs are done — even if some
              // failed (e.g. provider 502s). Otherwise the UI spins forever
              // and the user is forced to hard-refresh.
              regeneratingRef.current = new Set<number>();
              setRegeneratingMicroScenes(new Set<number>());
              setMsRegenStartedAt(null);
              setMsRegenElapsed(0);
              if (msRegenTimerRef.current) clearInterval(msRegenTimerRef.current);
              if (!allHaveVideo) {
                const failedIndices = prevIndices.filter(
                  (idx: number) => !freshScene?.microScenes?.[idx]?.videoUrl,
                );
                const failedLabel = failedIndices.map((i: number) => i + 1).join(', ');
                toast({
                  title: failedIndices.length === 1
                    ? `Micro-scene ${failedLabel} failed to generate`
                    : `${failedIndices.length} micro-scenes failed (${failedLabel})`,
                  description: 'The video provider returned an error (often a temporary 502). Try regenerating again or pick a different provider.',
                  variant: 'destructive',
                });
              }
              return;
            }
          } else {
            allJobsDonePolls.current = 0;
            if (next.size !== prev.size) {
              regeneratingRef.current = next;
              setRegeneratingMicroScenes(next);
            }
          }

          if (shouldRefresh) {
            await queryClient.refetchQueries({ queryKey: ["project", projectId] });
          }
        }
      } catch {} finally {
        reconcileInFlight.current = false;
      }
    };
    reconcileWithServer();
    const staleCheck = setInterval(reconcileWithServer, 5000);
    return () => clearInterval(staleCheck);
  }, [regeneratingMicroScenes.size > 0, projectId, sceneId]);

  useEffect(() => {
    if (fullscreenMicroScene !== null && scene.microScenes?.[fullscreenMicroScene]) {
      const ms = scene.microScenes[fullscreenMicroScene];
      setMsModalPrompt(ms.visualDirection || "");
      setMsModalEditingPrompt(false);
      setMsModalProvider("auto");
      setMsModalMode("auto");
      setMsModalRefImages((ms as any).referenceImages || []);
      setMsModalShowLibrary(false);
      setMsModalShowMultiRefExpander(false);
      queryClient.refetchQueries({ queryKey: ["project", projectId] });
    }
  }, [fullscreenMicroScene]);

  useEffect(() => {
    if (expandedMicroScene !== null && scene.microScenes?.[expandedMicroScene]) {
      const ms = scene.microScenes[expandedMicroScene];
      setMsInlineRefImages(prev => ({ ...prev, [expandedMicroScene]: (ms as any).referenceImages || [] }));
    }
  }, [expandedMicroScene]);

  useEffect(() => {
    if (regeneratingMicroScenes.size > 0 && scene.microScenes) {
      const completed: number[] = [];
      regeneratingMicroScenes.forEach(msIdx => {
        const currentUrl = scene.microScenes[msIdx]?.videoUrl;
        const prevUrl = prevMicroSceneVideos.current[msIdx];
        if (currentUrl && currentUrl !== prevUrl) {
          completed.push(msIdx);
        }
      });
      if (completed.length > 0) {
        const next = new Set(regeneratingRef.current);
        completed.forEach(idx => next.delete(idx));
        regeneratingRef.current = next;
        setRegeneratingMicroScenes(next);
        if (next.size === 0) {
          setMsRegenStartedAt(null);
          setMsRegenElapsed(0);
          if (msRegenTimerRef.current) clearInterval(msRegenTimerRef.current);
          setTimeout(() => queryClient.refetchQueries({ queryKey: ["project", projectId] }), 2000);
        }
        toast({
          title: completed.length === 1 ? "Micro-scene video ready" : `${completed.length} micro-scene videos ready`,
          description: completed.length === 1 ? "New video has been generated." : `${completed.length} videos completed.`,
        });
      }
    }
    if (scene.microScenes) {
      scene.microScenes.forEach((ms: any, i: number) => {
        prevMicroSceneVideos.current[i] = ms.videoUrl;
      });
    }
  }, [scene.microScenes, regeneratingMicroScenes]);

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
        const elapsed = Math.floor((Date.now() - regenStartedAt) / 1000);
        setRegenElapsed(elapsed);
        if (elapsed > 300 && regeneratingType) {
          setRegeneratingType(null);
          setRegenStartedAt(null);
          setRegenElapsed(0);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          toast({ title: "Generation timed out", description: "The generation appears stuck. Check the scene — your video may already be ready.", variant: "destructive" });
        }
      }, 1000);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [regenStartedAt, regeneratingType]);

  useEffect(() => {
    if (regeneratingType) {
      const regenStartTime = Date.now();
      pollIntervalRef.current = setInterval(async () => {
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        if (regeneratingType !== 'video') return;
        try {
          const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/active-jobs`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.jobs.length === 0) {
              const latestRes = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/latest-job-status?since=${regenStartTime}`, { credentials: "include" });
              if (latestRes.ok) {
                const latest = await latestRes.json();
                if (latest.success && latest.status === 'failed') {
                  setRegeneratingType(null);
                  setRegenStartedAt(null);
                  setRegenElapsed(0);
                  if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                  toast({ title: "Generation failed", description: latest.error || "The video provider returned an error. Try a different provider or shorter prompt.", variant: "destructive" });
                }
              }
            }
          }
        } catch {}
      }, 5000);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [regeneratingType, projectId, sceneId, queryClient]);

  useEffect(() => {
    if (regeneratingMicroScenes.size > 0) {
      msPollIntervalRef.current = setInterval(() => {
        queryClient.refetchQueries({ queryKey: ["project", projectId] });
      }, 5000);
    } else {
      if (msPollIntervalRef.current) {
        clearInterval(msPollIntervalRef.current);
        msPollIntervalRef.current = null;
      }
    }
    return () => {
      if (msPollIntervalRef.current) clearInterval(msPollIntervalRef.current);
    };
  }, [regeneratingMicroScenes.size, projectId, queryClient]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (msPollIntervalRef.current) clearInterval(msPollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const [editValues, setEditValues] = useState({
    type: scene.type || "scene",
    duration: scene.duration || 5,
    narration: scene.narration || "",
    visualDirection: scene.visualDirection || "",
    generateNativeAudio: Boolean(scene.generateNativeAudio),
  });

  // Phase 20C: brand references for Seedance 2 omni_reference. Local state is
  // mirrored to the server via a debounced PATCH so drag-reorder/add/remove
  // feel instant while still persisting.
  const [brandReferences, setBrandReferences] = useState<BrandReferenceInput[]>(
    (scene as Scene).brandReferences || [],
  );
  const brandRefsDebounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    // Re-sync from server when the underlying scene changes (e.g. after bulk-apply).
    setBrandReferences((scene as Scene).brandReferences || []);
  }, [scene.id, JSON.stringify((scene as Scene).brandReferences || [])]);

  const persistBrandReferences = useCallback((next: BrandReferenceInput[]) => {
    if (brandRefsDebounceRef.current) clearTimeout(brandRefsDebounceRef.current);
    brandRefsDebounceRef.current = setTimeout(() => {
      fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ brandReferences: next, useOmniReference: next.length > 0 }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to save brand references');
          queryClient.invalidateQueries({ queryKey: ['project', projectId] });
        })
        .catch((err) => {
          toast({ title: 'Failed to save brand references', description: err.message, variant: 'destructive' });
        });
    }, 500);
  }, [projectId, sceneId, queryClient, toast]);

  const handleBrandReferencesChange = useCallback((next: BrandReferenceInput[]) => {
    setBrandReferences(next);
    persistBrandReferences(next);
  }, [persistBrandReferences]);

  // Task 56: smart-routing transparency
  const { data: routingPreview, refetch: refetchRouting } = useRoutingPreview(
    projectId,
    sceneId,
    editValues.visualDirection,
  );
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const imageProviderLock = scene.assets?.imageProviderLock || routingPreview?.providerLock || null;
  const videoProviderLock = scene.assets?.videoProviderLock || routingPreview?.videoProviderLock || null;

  const setProviderLockMutation = useMutation({
    mutationFn: async (payload: { imageProviderLock?: string | null; videoProviderLock?: string | null }) => {
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/provider-lock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update provider pin");
      return res.json();
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      refetchRouting();
      const which = vars.imageProviderLock !== undefined ? "image" : "video";
      const val = vars.imageProviderLock ?? vars.videoProviderLock;
      toast({
        title: val ? `Pinned ${which} provider` : `Cleared ${which} provider pin`,
        description: val ? `This scene now uses ${val}.` : "Returned to auto-select.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
  const [contentTag, setContentTag] = useState<string | null>(scene.contentTag || null);
  const [autoAssignedContentTag] = useState<string | null>(scene.assignedContentTag || null);
  const isContentTagAutoAssigned = autoAssignedContentTag !== null && contentTag === autoAssignedContentTag;
  const [sceneArtPreset, setSceneArtPreset] = useState<string>(scene.artPresetId || 'project');
  const [pipelineAssignedStyle] = useState<string | null>(scene.assignedStyleId || null);

  const { data: projectData } = useQuery<{ qualityTier?: string }>({
    queryKey: ["project", projectId],
  });
  const [qualityTier, setQualityTier] = useState<string>(projectData?.qualityTier || 'premium');

  useEffect(() => {
    if (projectData?.qualityTier) {
      setQualityTier(projectData.qualityTier);
    }
  }, [projectData?.qualityTier]);

  const qualityTierDescriptions: Record<string, string> = {
    draft: 'Fast previews with Seedance — speed and cost priority',
    standard: 'Good quality for social media, quick turnaround',
    premium: 'Broadcast quality — best model variants per style',
    ultra: 'Cinema-grade with multi-pass, 4K upscaling, color grading',
  };
  const qualityTierDescription = qualityTierDescriptions[qualityTier] || '';

  const handleQualityTierChange = async (tier: string) => {
    const previousTier = qualityTier;
    setQualityTier(tier);
    try {
      const res = await fetch(`/api/universal-video/projects/${projectId}/quality-tier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ qualityTier: tier }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        toast({ title: `Quality set to ${tier.charAt(0).toUpperCase() + tier.slice(1)}` });
      } else {
        setQualityTier(previousTier);
        toast({ title: 'Failed to update quality tier', variant: 'destructive' });
      }
    } catch {
      setQualityTier(previousTier);
      toast({ title: 'Failed to update quality tier', variant: 'destructive' });
    }
  };

  const effectiveArtPresetId = sceneArtPreset === 'project' ? artPresetId : sceneArtPreset === 'auto' ? undefined : sceneArtPreset;
  const activeTag = contentTag ? getSceneContentTag(contentTag) : null;
  const activePreset = effectiveArtPresetId ? getVisualArtPreset(effectiveArtPresetId) : null;
  const styleRecProviders = activeTag?.recommendedProviders?.video || activePreset?.recommendedProviders?.video || [];
  const styleRecLabel = activeTag ? `Recommended for ${activeTag.label}` : activePreset ? `Recommended for ${activePreset.name}` : undefined;

  const libraryQuery = useQuery({
    queryKey: ["asset-library-all-images"],
    queryFn: async () => {
      const [uploadedRes, generatedRes] = await Promise.all([
        fetch("/api/asset-library?type=image", { credentials: "include" }),
        fetch("/api/asset-library", { credentials: "include" }),
      ]);
      const uploaded = uploadedRes.ok ? await uploadedRes.json() : [];
      const uploadedArr: any[] = Array.isArray(uploaded) ? uploaded : uploaded.assets || [];
      const generated = generatedRes.ok ? await generatedRes.json() : [];
      const generatedArr: any[] = (Array.isArray(generated) ? generated : [])
        .filter((a: any) => a.assetType === 'image' || a.assetType === 'video')
        .map((a: any) => ({
          id: `gen-${a.id}`,
          url: a.assetUrl,
          thumbnailUrl: a.thumbnailUrl || a.assetUrl,
          name: a.prompt?.substring(0, 40) || 'Generated asset',
          type: a.assetType,
          source: a.provider || 'ai-generated',
        }));
      return [...generatedArr, ...uploadedArr];
    },
    enabled: showLibrary || showEditLibrary,
  });

  const rawProvider = scene.assets?.videoProvider || scene.assets?.imageProvider || null;
  const providerUsed = rawProvider && !['t2i', 't2v', 'i2v', 'auto'].includes(rawProvider.toLowerCase()) ? rawProvider : null;

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

  const persistMsRefImages = async (msIdx: number, images: string[]) => {
    try {
      const updatedMicroScenes = [...(scene.microScenes || [])];
      updatedMicroScenes[msIdx] = { ...updatedMicroScenes[msIdx], referenceImages: images };
      await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ microScenes: updatedMicroScenes }),
      });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    } catch (err) {
      console.error("[MsRefImages] Failed to persist micro-scene reference images:", err);
    }
  };

  const persistReferenceVideo = async (videoUrl: string) => {
    try {
      await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ referenceVideoUrl: videoUrl }),
      });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    } catch (err) {
      console.error("[RefVideo] Failed to persist reference video:", err);
    }
  };

  const handleRefVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setReferenceVideoUrl(url);
        persistReferenceVideo(url);
        toast({ title: "Reference Video Added", description: "Video will be used as style reference for generation." });
      }
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    }
    if (refVideoInputRef.current) refVideoInputRef.current.value = "";
  };

  const [saveSuccess, setSaveSuccess] = useState(false);

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
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      toast({ title: "Scene Updated", description: "Your changes have been saved successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    },
  });

  const silentSaveMutation = useMutation({
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
          prompt: editValues.visualDirection,
          generationMode: activeMode,
          sourceImageUrl: activeMode === "i2i" ? sourceImage : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to regenerate image");
      return res.json();
    },
    onMutate: () => {
      // The regenerate-image endpoint is synchronous (awaits Recraft/Flux
      // and only responds once the new URL is written to DB). Show the
      // "Generating New Image..." overlay for the duration of the request.
      setRegeneratingType('image');
      setRegenStartedAt(Date.now());
      setRegenElapsed(0);
    },
    onSuccess: async () => {
      // Force-refetch the project so the new imageUrl + lastRegenAt
      // (cache-bust key) flow into props before we drop the overlay.
      await queryClient.refetchQueries({ queryKey: ["project", projectId] });
      setRegeneratingType(null);
      setRegenStartedAt(null);
      setRegenElapsed(0);
      toast({ title: "Image Ready", description: "Your new image is ready." });
    },
    onError: (err: Error) => {
      setRegeneratingType(null);
      setRegenStartedAt(null);
      setRegenElapsed(0);
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
          query: editValues.visualDirection,
          provider: provider === "auto" ? undefined : provider,
          sourceImageUrl: useSourceImage ? sourceImage : undefined,
          sourceImageUrls: useSourceImage && referenceImageUrls.length > 1 ? referenceImageUrls : undefined,
          referenceImages: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
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

  const regenMicroSceneVideo = async (msIdx: number, opts?: { query?: string; provider?: string; generationMode?: string; sourceImageUrl?: string; sourceImageUrls?: string[]; skipProviderFallback?: boolean }) => {
    if (!(msIdx in prevMicroSceneVideos.current)) {
      prevMicroSceneVideos.current[msIdx] = scene.microScenes?.[msIdx]?.videoUrl;
    }
    const updated = new Set(regeneratingRef.current);
    updated.add(msIdx);
    regeneratingRef.current = updated;
    setRegeneratingMicroScenes(updated);
    if (!msRegenStartedAt) {
      setMsRegenStartedAt(Date.now());
      setMsRegenElapsed(0);
    }
    try {
      const selectedProvider = opts?.skipProviderFallback
        ? opts?.provider
        : (opts?.provider || (provider === "auto" ? undefined : provider));
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/micro-scene/${msIdx}/regenerate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: selectedProvider,
          query: opts?.query,
          generationMode: opts?.generationMode,
          sourceImageUrl: opts?.sourceImageUrl,
          sourceImageUrls: opts?.sourceImageUrls,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to regenerate micro-scene video");
      }
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Micro-scene video regenerating", description: "This may take 1-3 minutes." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      const errNext = new Set(regeneratingRef.current);
      errNext.delete(msIdx);
      regeneratingRef.current = errNext;
      setRegeneratingMicroScenes(errNext);
      if (errNext.size === 0) {
        setMsRegenStartedAt(null);
        setMsRegenElapsed(0);
      }
    }
  };

  const regenAllMicroSceneVideos = async () => {
    if (!scene.microScenes || scene.microScenes.length === 0) return;
    // Task 56: use the scene's unified Mode/Provider (no duplicated control block)
    const selectedProvider = (!provider || provider === "auto") ? undefined : provider;
    const selectedMode = generationMode === "auto" ? undefined : generationMode;
    const count = scene.microScenes.length;
    toast({ title: `Generating ${count} micro-scene videos...`, description: "All micro-scenes will generate with consistent style." });

    const allIndices = Array.from({ length: count }, (_, i) => i);
    for (const i of allIndices) {
      if (!(i in prevMicroSceneVideos.current)) {
        prevMicroSceneVideos.current[i] = scene.microScenes?.[i]?.videoUrl;
      }
      const updated = new Set(regeneratingRef.current);
      updated.add(i);
      regeneratingRef.current = updated;
      setRegeneratingMicroScenes(new Set(updated));
    }
    if (!msRegenStartedAt) {
      setMsRegenStartedAt(Date.now());
      setMsRegenElapsed(0);
    }

    try {
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/regenerate-all-micro-scene-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: selectedProvider,
          generationMode: selectedMode,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to regenerate all micro-scene videos");
      }
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "All micro-scene videos regenerating", description: "This may take 2-5 minutes." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      for (const i of allIndices) {
        const errNext = new Set(regeneratingRef.current);
        errNext.delete(i);
        regeneratingRef.current = errNext;
        setRegeneratingMicroScenes(new Set(errNext));
      }
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
      const res = await fetch("/api/videos/uploads", { method: "POST", credentials: "include", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url = data.url || data.fileUrl;
      if (url) {
        setMsModalRefImages(prev => {
          const next = [...prev, url];
          if (fullscreenMicroScene !== null) {
            persistMsRefImages(fullscreenMicroScene, next);
          }
          return next;
        });
        toast({ title: "Reference image added", description: "Image will be used for I2V generation." });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  const handleMsInlineRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const msIdx = msInlineUploadTarget.current;
    if (msIdx === null) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/videos/uploads", { method: "POST", credentials: "include", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url = data.url || data.fileUrl;
      if (url) {
        setMsInlineRefImages(prev => {
          const next = [...(prev[msIdx] || []), url];
          persistMsRefImages(msIdx, next);
          return { ...prev, [msIdx]: next };
        });
        toast({ title: "Reference image added", description: "Image will be used for I2V generation." });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  const setMediaMutation = useMutation({
    mutationFn: async ({ mediaUrl, mediaType }: { mediaUrl: string; mediaType: 'image' | 'video' }) => {
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/set-media`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mediaUrl, mediaType, source: "upload" }),
      });
      if (!res.ok) throw new Error("Failed to set media");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: variables.mediaType === 'video' ? "Video Set" : "Image Set", description: variables.mediaType === 'video' ? "Custom video is now the scene visual." : "Image set as scene visual. Use I2V mode to add motion." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const assembleSceneMutation = useMutation({
    mutationFn: async () => {
      setIsAssembling(true);
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneIndex}/assemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Assembly failed" }));
        throw new Error(err.error || "Assembly failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setIsAssembling(false);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      if (data.success) {
        toast({ title: "Scene Assembled", description: `${data.manifest?.clips?.length || 0} clips assembled (${data.manifest?.totalDurationSec?.toFixed(1) || '?'}s)` });
      } else {
        toast({ title: "Assembly Failed", description: data.manifest?.error || "Assembly could not complete", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      setIsAssembling(false);
      toast({ title: "Assembly Error", description: err.message, variant: "destructive" });
    },
  });

  const handleAssemblyVideoError = useCallback(async () => {
    try {
      await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneIndex}/assembly-invalidate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
    } catch {}
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    toast({
      title: "Assembled Clip Expired",
      description: "Assembled clip expired — please reassemble before rendering.",
      variant: "destructive",
    });
  }, [queryClient, projectId, sceneIndex, toast]);

  const msWithVideo = (scene.microScenes || []).filter((ms: any) => !!ms.videoUrl);
  const canAssemble = msWithVideo.length >= 2;
  const isAssembled = scene.assemblyManifest && !scene.assemblyManifest.assemblyFailed && scene.assemblyManifest.assembledClipValid !== false && !!scene.assemblyManifest.assembledClipUrl;
  const assemblyFailed = scene.assemblyManifest?.assemblyFailed;
  const assemblyStale = scene.assemblyManifest && !scene.assemblyManifest.assemblyFailed && scene.assemblyManifest.assembledClipValid === false;

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
      if (url) {
        const isVideo = file.type.startsWith('video/');
        setMediaMutation.mutate({ mediaUrl: url, mediaType: isVideo ? 'video' : 'image' });
        if (!isVideo) {
          addReferenceImage(url);
          setGenerationMode("i2v");
        }
      }
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
        addReferenceImage(url);
        toast({ title: "Reference Image Added", description: "Image will be used for I2V video generation." });
      }
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    }
    if (refFileInputRef.current) refFileInputRef.current.value = "";
  };

  const saveChanges = () => {
    const artPresetValue = sceneArtPreset === 'project' ? null : sceneArtPreset;
    updateSceneMutation.mutate({ ...editValues, contentTag: contentTag || null, artPresetId: artPresetValue });
  };

  const [multiImageTipDismissed, setMultiImageTipDismissed] = useState(false);
  const [showMultiRefExpander, setShowMultiRefExpander] = useState(() => {
    const existing = scene.assets?.referenceImages || [];
    const initialImages =
      scene.brandAssetUrl && !existing.includes(scene.brandAssetUrl)
        ? [scene.brandAssetUrl, ...existing]
        : existing;
    return initialImages.length > 0;
  });

  useEffect(() => {
    const resolvedProv = (videoProviderLock || (provider !== 'auto' ? provider : null) || scene.assets?.videoProvider || '').toString().toLowerCase();
    const isMultiRef = resolvedProv.startsWith('seedance-2') || resolvedProv.startsWith('kling-2');
    if (isMultiRef && referenceImageUrls.length > 0) {
      setShowMultiRefExpander(true);
    }
  }, [videoProviderLock, provider, scene.assets?.videoProvider, referenceImageUrls.length]);

  const addReferenceImage = useCallback((url: string) => {
    setReferenceImageUrls(prev => {
      const newImages = [...prev, url];
      persistReferenceImages(newImages);
      if (newImages.length >= 2 && !multiImageTipDismissed) {
        setShowMultiImageTip(true);
      }
      return newImages;
    });
  }, [multiImageTipDismissed]);

  const dismissMultiImageTip = () => {
    setShowMultiImageTip(false);
    setMultiImageTipDismissed(true);
  };

  const isRegenerating = regenImageMutation.isPending || regenVideoMutation.isPending || !!regeneratingType;

  return (
    <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleUpload} />
      <input type="file" ref={refFileInputRef} className="hidden" accept="image/*" onChange={handleRefUpload} />
      <input type="file" ref={refVideoInputRef} className="hidden" accept="video/*" onChange={handleRefVideoUpload} />

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
          ) : assembledClipValid ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
              <Layers className="w-3 h-3" /> Assembled {scene.assemblyManifest?.totalDurationSec?.toFixed(1)}s
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
                key={withCacheBust(videoUrl) || videoUrl}
                ref={videoRef}
                src={withCacheBust(videoUrl) || undefined}
                className="w-full object-cover bg-black mx-auto"
                style={{ aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '1:1' ? '1/1' : '16/9', maxHeight: aspectRatio === '9:16' ? '500px' : undefined }}
                playsInline
                preload="auto"
                onError={assembledClipValid ? handleAssemblyVideoError : undefined}
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
              <img key={withCacheBust(imageUrl) || imageUrl} src={withCacheBust(imageUrl) || undefined} alt={`Scene ${sceneIndex + 1}`} className="w-full object-cover bg-black mx-auto" style={{ aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '1:1' ? '1/1' : '16/9', maxHeight: aspectRatio === '9:16' ? '500px' : undefined }} />
              <div className="absolute top-2 right-2">
                {scene.background?.type === 'motion-graphic' ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Motion Graphic
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white/70 border border-white/10">
                    Image Only
                  </span>
                )}
              </div>
            </div>
          ) : scene.microScenes && scene.microScenes.length > 0 ? (
            <div className="flex items-center justify-center" style={{ aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '1:1' ? '1/1' : '16/9' }}>
              <div className="text-center px-4">
                <Layers className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
                <p className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  {scene.microScenes.filter((ms: any) => ms.videoUrl).length}/{scene.microScenes.length} micro-scenes generated
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {scene.microScenes.every((ms: any) => ms.videoUrl)
                    ? "All clips ready — assemble to create scene video"
                    : "Generate micro-scene videos below, then assemble"}
                </p>
              </div>
            </div>
          ) : scene.background?.type === 'motion-graphic' ? (
            <div className="relative flex items-center justify-center bg-gradient-to-br from-purple-900/30 via-indigo-900/20 to-blue-900/30" style={{ aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '1:1' ? '1/1' : '16/9' }}>
              <div className="text-center px-4">
                <Sparkles className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                <p className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  {scene.type === 'chapter-title' ? (scene.chapterTitle || 'Chapter Title') : 'Motion Graphic'}
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Rendered during final assembly
                </p>
              </div>
              <div className="absolute top-2 right-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Motion Graphic
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center" style={{ aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '1:1' ? '1/1' : '16/9' }}>
              <div className="text-center">
                <ImagePlus className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>No visual asset generated yet</p>
              </div>
            </div>
          )}
        </div>

        {projectMode === 'studio-polish' && hasVideo && (
          <div className="mt-2 flex items-center gap-3 px-3 py-2 rounded-lg border" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}>
            <Volume2 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
            <span className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>Original Audio</span>
            <button
              onClick={async () => {
                const ms = scene.microScenes?.[0];
                if (!ms) return;
                const currentVol = ms.originalAudioVolume ?? 1.0;
                const newVol = currentVol > 0 ? 0 : 1.0;
                try {
                  await fetch(`/api/universal-video/projects/${projectId}/scenes/${scene.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                      microScenes: scene.microScenes.map((m, i) =>
                        i === 0 ? { ...m, originalAudioVolume: newVol } : m
                      ),
                    }),
                  });
                  queryClient.invalidateQueries({ queryKey: ["project", projectId] });
                } catch (err) {
                  toast({ title: "Failed to update audio setting", variant: "destructive" });
                }
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${(scene.microScenes?.[0]?.originalAudioVolume ?? 1) > 0 ? 'bg-amber-500' : 'bg-gray-600'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${(scene.microScenes?.[0]?.originalAudioVolume ?? 1) > 0 ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-[10px] min-w-[80px]" style={{ color: "var(--text-muted)" }}>
              {(scene.microScenes?.[0]?.originalAudioVolume ?? 1) > 0 ? 'Keep original' : 'Use voiceover'}
            </span>
          </div>
        )}

        {/* Provider Info + Reference Images + Regenerate Controls */}
        <div className="mt-3 grid grid-cols-[minmax(190px,1fr)_auto_auto] gap-3 items-start">
          {/* Provider & Prompt Info */}
          <div className="min-w-0">
            {providerUsed && (
              <div className="mb-1">
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Provider: <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    {(() => { const p = PROVIDER_CONFIG[providerUsed]; return p ? p.displayName : providerUsed; })()}
                  </span>
                </p>
                <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "rgb(192,132,252)" }}>
                  <Sparkles className="w-2.5 h-2.5 flex-shrink-0" />
                  {getProviderRecommendationText(providerUsed, scene.type)}
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {(scene as any).imagePrompt && (
                <span className="text-[9px] px-2 py-0.5 rounded-full font-medium border"
                  style={{ backgroundColor: "rgba(168,85,247,0.12)", color: "rgb(192,132,252)", borderColor: "rgba(168,85,247,0.25)" }}>
                  I2V Pipeline
                </span>
              )}
              {(scene as any).providerHint && (
                <span className="text-[9px] px-2 py-0.5 rounded-full font-medium border"
                  style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "rgb(74,222,128)", borderColor: "rgba(34,197,94,0.25)" }}>
                  {(() => { const p = PROVIDER_CONFIG[(scene as any).providerHint]; return p ? p.displayName : (scene as any).providerHint; })()}
                </span>
              )}
              {(scene.assets?.imageProvider || routingPreview?.recommendedProvider) && (() => {
                const lastUsed = scene.assets?.imageProvider;
                const recommended = routingPreview?.recommendedProvider;
                // When not pinned, prefer the live recommendation so the pill, popover header,
                // and reason all describe the same provider. Surface the previously-used
                // provider as a small "prev:" hint when it differs.
                const effective = imageProviderLock || recommended || lastUsed || 'auto';
                const previous = !imageProviderLock && recommended && lastUsed && recommended !== lastUsed
                  ? lastUsed
                  : undefined;
                return (
                  <ProviderPill
                    label="T2I"
                    providerId={effective}
                    recommendedReason={routingPreview?.recommendedReason}
                    isLocked={!!imageProviderLock}
                    scope="image"
                    onPin={(p) => setProviderLockMutation.mutate({ imageProviderLock: p })}
                    onClear={() => setProviderLockMutation.mutate({ imageProviderLock: null })}
                    styleRecProviders={styleRecProviders}
                    styleRecLabel={styleRecLabel}
                    tone="blue"
                    previousProviderId={previous}
                  />
                );
              })()}
              {scene.assets?.videoProvider && (
                <ProviderPill
                  label="Video"
                  providerId={videoProviderLock || scene.assets.videoProvider}
                  recommendedReason={undefined}
                  isLocked={!!videoProviderLock}
                  scope="video"
                  onPin={(p) => setProviderLockMutation.mutate({ videoProviderLock: p })}
                  onClear={() => setProviderLockMutation.mutate({ videoProviderLock: null })}
                  styleRecProviders={styleRecProviders}
                  styleRecLabel={styleRecLabel}
                  tone="green"
                />
              )}
              {(scene.type === 'chapter-title' || scene.type === 'infographic' || scene.type === 'infographic_diagram' || (scene as any).textImageEnabled) && (
                <>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-medium border"
                    style={{ backgroundColor: "rgba(59,130,246,0.12)", color: "rgb(96,165,250)", borderColor: "rgba(59,130,246,0.25)" }}>
                    Text Image Pipeline
                  </span>
                  {(scene as any).textImageUrl && (
                    <a href={(scene as any).textImageUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[9px] underline" style={{ color: "rgb(96,165,250)" }}>
                      View Generated Image
                    </a>
                  )}
                </>
              )}
            </div>

            {/* Task 56: routing intent chips — reconcile refs with local dismissal state */}
            {(() => {
              const sp = routingPreview?.references.product;
              const sc = routingPreview?.references.character;
              const effProd = sp && !brandAssetDismissed && (referenceImageUrls.includes(sp) || sp === scene.brandAssetUrl) ? sp : null;
              const effChar = sc && (referenceImageUrls.includes(sc) || sc === scene.characterRefImageUrl) ? sc : null;
              return (
                <SceneIntentChips
                  preview={routingPreview}
                  hasGenericRefs={referenceImageUrls.length > 0}
                  effectiveProductUrl={effProd}
                  effectiveCharacterUrl={effChar}
                />
              );
            })()}

            {/* Task 56: prompt inspector trigger */}
            <button
              type="button"
              onClick={() => setShowPromptInspector(true)}
              className="mt-2 inline-flex items-center gap-1 text-[10px] underline-offset-2 hover:underline"
              style={{ color: "var(--text-muted)" }}
              data-testid="open-prompt-inspector"
            >
              <Info className="w-3 h-3" /> What gets sent to the model
            </button>

            {/* Task 56: amber CTA when logo intent detected but no logo */}
            {routingPreview?.references.hasLogoGap && <LogoGapCard />}
          </div>

          {/* Use Own Media */}
          <div className="mb-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full text-xs px-3 py-2 rounded-lg border border-dashed flex items-center justify-center gap-2 transition-colors hover:border-purple-500/40 hover:bg-purple-500/5"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Own Image or Video
            </button>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Upload your own image (AI adds motion via I2V) or video to use directly
            </p>
          </div>

          {/* Task #185: Deck-to-Video — per-scene deck slide picker (only for
              deck projects). Lets the user choose/swap/remove which slide
              anchors this scene; persists an override that survives regen. */}
          {deckImages.length > 0 && (
            <div className="col-span-3">
              <DeckSlidePicker
                projectId={projectId}
                sceneId={sceneId}
                deckImages={deckImages}
                currentAnchorUrl={brandReferences[0]?.assetUrl || null}
                allScenes={allScenes}
                currentSceneIndex={sceneIndex}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ['project', projectId] })}
              />
            </div>
          )}

          {/* Phase 20C: Brand References (Seedance 2 omni_reference) */}
          <div className="mb-3 col-span-3">
            <BrandReferencePanel
              references={brandReferences}
              onChange={handleBrandReferencesChange}
              basePrompt={editValues.visualDirection}
              onPromptChange={(next) => setEditValues({ ...editValues, visualDirection: next })}
              projectAspectRatio={aspectRatio}
              providerSupportsOmniRef={
                (videoProviderLock || scene.assets?.videoProvider || '').toLowerCase().startsWith('seedance-2')
              }
              providerLabel={videoProviderLock || scene.assets?.videoProvider || undefined}
              onSwitchProvider={() =>
                setProviderLockMutation.mutate({ videoProviderLock: 'seedance-2.0' })
              }
              lastVideoUrl={scene.videoUrl || null}
              onRegenerateWithStrongerAnchoring={() => {
                // Append a stronger anchoring phrase to the prompt — keeps the
                // user's edits intact while nudging Seedance harder toward the
                // exact label/packaging in @image1.
                const tag = brandReferences[0]?.tag || 'image1';
                const anchor = ` Show @${tag} clearly with the exact label, packaging, and colorway preserved frame-to-frame.`;
                if (!editValues.visualDirection.includes(anchor)) {
                  setEditValues({ ...editValues, visualDirection: editValues.visualDirection.trimEnd() + anchor });
                }
                setTimeout(() => regenVideoMutation.mutate(), 600);
              }}
              onApplySetToAllProductScenes={async (set) => {
                // Task 91: bulk-apply a saved set to every product/solution
                // scene in this project. The server skips scenes that already
                // have brand references unless replaceExisting is sent.
                try {
                  const res = await fetch(
                    `/api/universal-video/projects/${projectId}/apply-brand-reference-set`,
                    {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ setId: set.id }),
                    },
                  );
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data?.error || 'Failed to apply set');
                  toast({
                    title: data.attachedCount > 0 ? 'Set applied to scenes' : 'Nothing to apply',
                    description: data.message,
                  });
                  queryClient.invalidateQueries({ queryKey: ['project', projectId] });
                } catch (e: any) {
                  toast({
                    title: 'Failed to apply set',
                    description: e?.message || 'Unknown error',
                    variant: 'destructive',
                  });
                }
              }}
            />
          </div>

          {/* Reference Images — col-span-3 so it spans the full grid width and the tiles flow horizontally */}
          {(() => {
            const resolvedProv = (videoProviderLock || (provider !== 'auto' ? provider : null) || scene.assets?.videoProvider || '').toString().toLowerCase();
            const multiRefProviderName = resolvedProv.startsWith('seedance-2') ? 'Seedance 2' : resolvedProv.startsWith('kling-2') ? 'Kling 2.x' : null;
            const isMultiRefProvider = multiRefProviderName !== null;
            const maxImages = getMultiImageSupport(provider === 'auto' ? '' : provider)?.maxImages || 4;

            if (isMultiRefProvider) {
              return (
                <div className="col-span-3">
                  {/* Additional reference images expander — Seedance 2.x / Kling 2.x */}
                  <button
                    type="button"
                    onClick={() => setShowMultiRefExpander(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors hover:border-purple-500/30"
                    style={{
                      borderColor: showMultiRefExpander ? 'rgba(124,58,237,0.35)' : 'var(--border-subtle)',
                      backgroundColor: showMultiRefExpander ? 'rgba(124,58,237,0.04)' : 'transparent',
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <ImagePlus className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgb(167,139,250)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        Additional reference images
                      </span>
                      {referenceImageUrls.length > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/20 font-medium" style={{ color: 'rgb(167,139,250)' }}>
                          {referenceImageUrls.length}/{maxImages}
                        </span>
                      )}
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        @image_1, @image_2&hellip; &mdash; {multiRefProviderName}
                      </span>
                    </div>
                    {showMultiRefExpander
                      ? <ChevronUp className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                      : <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />}
                  </button>

                  {showMultiRefExpander && (
                    <div
                      className="mt-2 rounded-lg border p-3 space-y-2.5"
                      style={{ borderColor: 'rgba(124,58,237,0.2)', backgroundColor: 'rgba(124,58,237,0.03)' }}
                    >
                      {isProductScene && !brandAssetUrl && referenceImageUrls.length === 0 && !imageUrl && (
                        <div
                          className="px-2.5 py-2 rounded-lg border border-dashed cursor-pointer transition-colors hover:border-amber-500/40 hover:bg-amber-500/5"
                          style={{ borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.03)' }}
                          onClick={() => refFileInputRef.current?.click()}
                        >
                          <p className="text-[10px] font-medium flex items-center gap-1.5" style={{ color: 'rgb(245,158,11)' }}>
                            <ImagePlus className="w-3 h-3 shrink-0" />
                            Upload your product image for this scene
                          </p>
                          <p className="text-[9px] mt-0.5 ml-[18px]" style={{ color: 'var(--text-muted)' }}>
                            Becomes @image_1 — the anchor image for AI video generation.
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 items-start">
                        {referenceImageUrls.map((url, i) => (
                          <div
                            key={`multi-ref-${i}`}
                            className="relative w-16 h-16 rounded-lg overflow-hidden border group"
                            style={{ borderColor: 'rgba(124,58,237,0.3)' }}
                          >
                            <button
                              type="button"
                              onClick={() => setRefLightboxUrl(url)}
                              className="block w-full h-full"
                              title="Click to expand"
                              aria-label={`Open reference image ${i + 1}`}
                            >
                              <img src={url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]" />
                              <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                                <Maximize2 className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </span>
                            </button>
                            <div className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-purple-600 text-white flex items-center justify-center text-[9px] font-bold pointer-events-none shadow-sm">
                              {i + 1}
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 text-[7px] text-center py-0.5 bg-black/60 text-white font-mono pointer-events-none">
                              @image_{i + 1}
                            </div>
                            <button
                              onClick={() => {
                                if (url === scene.brandAssetUrl) setBrandAssetDismissed(true);
                                const newImages = referenceImageUrls.filter((_, idx) => idx !== i);
                                setReferenceImageUrls(newImages);
                                persistReferenceImages(newImages);
                              }}
                              className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}

                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => refFileInputRef.current?.click()}
                            disabled={referenceImageUrls.length >= maxImages}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed text-[11px] transition-colors hover:border-purple-500/40 disabled:opacity-50"
                            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                          >
                            <Upload className="w-3 h-3" />
                            Upload{referenceImageUrls.length > 0 ? ` (${referenceImageUrls.length}/${maxImages})` : ''}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowLibrary(!showLibrary); }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed text-[11px] transition-colors hover:border-purple-500/40"
                            style={{
                              borderColor: showLibrary ? 'rgba(124,58,237,0.4)' : 'var(--border-subtle)',
                              color: showLibrary ? 'rgb(124,58,237)' : 'var(--text-muted)',
                            }}
                          >
                            <FolderOpen className="w-3 h-3" />
                            Library
                          </button>
                        </div>
                      </div>

                      {showLibrary && (
                        <div
                          className="border rounded-lg p-2 max-h-32 overflow-y-auto"
                          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface)' }}
                        >
                          {libraryQuery.isLoading ? (
                            <div className="flex items-center justify-center py-3">
                              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
                            </div>
                          ) : !libraryQuery.data || libraryQuery.data.length === 0 ? (
                            <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>No images in library</p>
                          ) : (
                            <div className="grid grid-cols-6 gap-1.5">
                              {libraryQuery.data.slice(0, 18).map((asset: any) => {
                                const assetUrl = asset.url || asset.thumbnailUrl;
                                if (asset.type === 'video') return null;
                                return (
                                  <button
                                    key={asset.id}
                                    onClick={() => {
                                      if (assetUrl) {
                                        addReferenceImage(assetUrl);
                                        setShowLibrary(false);
                                        toast({ title: 'Reference Added' });
                                      }
                                    }}
                                    className="relative aspect-square rounded overflow-hidden border hover:border-purple-500/50 transition-colors"
                                    style={{ borderColor: 'var(--border-subtle)' }}
                                    title={asset.name || ''}
                                  >
                                    <img src={asset.thumbnailUrl || assetUrl} alt={asset.name || ''} className="w-full h-full object-cover" />
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Use{' '}
                        <code className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono text-[9px]">@image_1</code>,{' '}
                        <code className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono text-[9px]">@image_2</code>{' '}
                        etc. in your visual direction to anchor specific images.{' '}
                        {multiRefProviderName} supports up to {maxImages} reference images.
                      </p>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div className="col-span-3">
                <p className="text-[11px] font-medium flex items-center gap-1 mb-1" style={{ color: "var(--text-secondary)" }}>
                  <Image className="w-3 h-3" /> Reference Images
                  {brandAssetUrl && (
                    <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                      Product Image Attached
                    </span>
                  )}
                </p>
                {isProductScene && !brandAssetUrl && referenceImageUrls.length === 0 && !imageUrl && (
                  <div
                    className="mb-2 px-2.5 py-2 rounded-lg border border-dashed cursor-pointer transition-colors hover:border-amber-500/40 hover:bg-amber-500/5"
                    style={{ borderColor: "rgba(245,158,11,0.3)", backgroundColor: "rgba(245,158,11,0.03)" }}
                    onClick={() => refFileInputRef.current?.click()}
                  >
                    <p className="text-[10px] font-medium flex items-center gap-1.5" style={{ color: "rgb(245,158,11)" }}>
                      <ImagePlus className="w-3 h-3 flex-shrink-0" />
                      Upload your product image for this scene
                    </p>
                    <p className="text-[9px] mt-0.5 ml-[18px]" style={{ color: "var(--text-muted)" }}>
                      This scene is designed to showcase your product. Upload a photo to use as the starting frame for AI video generation (I2V).
                    </p>
                  </div>
                )}
                <p className="text-[10px] mb-1.5" style={{ color: "var(--text-muted)" }}>For I2V (image-to-video)</p>

                {/* Task 56: role-aware overview row (Product / Character / Logo) — reconciled with local state */}
                {routingPreview && (() => {
                  const serverProduct = routingPreview.references.product;
                  const productStillLocal = serverProduct
                    ? (!brandAssetDismissed && (referenceImageUrls.includes(serverProduct) || serverProduct === scene.brandAssetUrl))
                    : false;
                  const effectiveProductUrl = productStillLocal ? serverProduct : null;
                  const serverCharacter = routingPreview.references.character;
                  const characterStillLocal = serverCharacter
                    ? (referenceImageUrls.includes(serverCharacter) || serverCharacter === scene.characterRefImageUrl)
                    : false;
                  const effectiveCharacterUrl = characterStillLocal ? serverCharacter : null;
                  return (
                    <div className="mb-2 p-2 rounded-lg border" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(255,255,255,0.02)" }}>
                      <RoleAwareReferenceSlots
                        productUrl={effectiveProductUrl}
                        characterUrl={effectiveCharacterUrl}
                        brandLogoUrl={routingPreview.references.brandLogo}
                        hasLogoIntent={routingPreview.routing.needsLogoComposition}
                        hasLogoGap={routingPreview.references.hasLogoGap}
                        uploads={referenceImageUrls.filter(u => u !== effectiveProductUrl && u !== effectiveCharacterUrl)}
                        onPreview={(u) => setRefLightboxUrl(u)}
                        onRemoveUpload={(url) => {
                          const newImages = referenceImageUrls.filter(u => u !== url);
                          setReferenceImageUrls(newImages);
                          persistReferenceImages(newImages);
                        }}
                        onAddUpload={() => refFileInputRef.current?.click()}
                        onRemoveProduct={() => {
                          setBrandAssetDismissed(true);
                          const newImages = referenceImageUrls.filter(u => u !== routingPreview.references.product);
                          setReferenceImageUrls(newImages);
                          persistReferenceImages(newImages);
                        }}
                      />
                    </div>
                  );
                })()}

                <div className="flex items-center gap-1.5 flex-wrap">
                  {imageUrl && (
                    <div className="relative w-16 h-16 rounded-md overflow-hidden border group" style={{ borderColor: "var(--border-subtle)" }}>
                      <button
                        type="button"
                        onClick={() => setRefLightboxUrl(imageUrl)}
                        className="block w-full h-full"
                        title="Click to expand"
                        aria-label="Open reference image full size"
                      >
                        <img src={imageUrl} alt="Reference" className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                          <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                      </button>
                      <button
                        onClick={() => { updateSceneMutation.mutate({ clearImage: true }); }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Remove reference image"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                  {referenceImageUrls.map((url, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border group" style={{ borderColor: "rgba(124,58,237,0.3)" }}>
                      <button
                        type="button"
                        onClick={() => setRefLightboxUrl(url)}
                        className="block w-full h-full"
                        title="Click to expand"
                        aria-label={`Open reference image ${i + 1} full size`}
                      >
                        <img src={url} alt={`Reference ${i + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                          <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                      </button>
                      <div className="absolute top-0 left-0 w-3.5 h-3.5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[7px] font-bold pointer-events-none">
                        {i + 1}
                      </div>
                      <button
                        onClick={() => {
                          if (url === scene.brandAssetUrl) setBrandAssetDismissed(true);
                          const newImages = referenceImageUrls.filter((_, idx) => idx !== i);
                          setReferenceImageUrls(newImages);
                          persistReferenceImages(newImages);
                        }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => refFileInputRef.current?.click()}
                    className="w-16 h-16 rounded-md border border-dashed flex items-center justify-center transition-colors hover:border-purple-500/40"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                    title="Upload from computer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowLibrary(!showLibrary); }}
                    className="w-16 h-16 rounded-md border border-dashed flex items-center justify-center transition-colors hover:border-purple-500/40"
                    style={{ borderColor: showLibrary ? "rgba(124,58,237,0.4)" : "var(--border-subtle)", color: showLibrary ? "rgb(124,58,237)" : "var(--text-muted)" }}
                    title="Browse asset library"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => regenImageMutation.mutate()}
                    disabled={isRegenerating}
                    className="w-16 h-16 rounded-md border border-dashed flex flex-col items-center justify-center gap-0.5 transition-colors hover:border-purple-500/40 disabled:opacity-50"
                    style={{ borderColor: "rgba(124,58,237,0.3)", color: "rgb(192,132,252)" }}
                    title="Generate a new reference image with AI from the visual direction"
                  >
                    {regenImageMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span className="text-[8px] font-medium leading-none">AI {imageUrl || referenceImageUrls.length > 0 ? "Regen" : "Gen"}</span>
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
                        {libraryQuery.data.slice(0, 18).map((asset: any) => {
                          const assetUrl = asset.url || asset.thumbnailUrl;
                          const isVid = asset.type === 'video';
                          return (
                            <button
                              key={asset.id}
                              onClick={() => {
                                if (assetUrl) {
                                  addReferenceImage(assetUrl);
                                  setShowLibrary(false);
                                  toast({ title: "Reference Added" });
                                }
                              }}
                              className="relative aspect-square rounded overflow-hidden border hover:border-purple-500/50 transition-colors"
                              style={{ borderColor: "var(--border-subtle)" }}
                              title={asset.name || ''}
                            >
                              {isVid ? (
                                <video src={assetUrl} className="w-full h-full object-cover" muted />
                              ) : (
                                <img src={asset.thumbnailUrl || assetUrl} alt={asset.name || ""} className="w-full h-full object-cover" />
                              )}
                              {isVid && (
                                <div className="absolute top-0.5 left-0.5">
                                  <span className="text-[7px] px-0.5 rounded bg-black/60 text-white">VID</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {projectMode !== 'studio-polish' && (
          <div className="col-span-3 flex flex-col items-end gap-2">
            <div
              className="flex flex-wrap items-center justify-end gap-1.5 rounded-lg border px-2 py-1.5"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(255,255,255,0.02)" }}
              data-testid="scene-controls-row"
            >
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Mode</span>
                <select
                  value={generationMode}
                  onChange={(e) => setGenerationMode(e.target.value)}
                  className="text-xs rounded-md border px-1.5 py-1 bg-transparent outline-none w-[72px]"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  data-testid="select-generation-mode"
                >
                  {GENERATION_MODES.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Provider</span>
                <div className="w-44">
                  <ProviderCapabilitySelector
                    selectedProvider={provider}
                    onSelectProvider={setProvider}
                    recommendedProvider={providerUsed || undefined}
                    recommendationReason={providerUsed ? getProviderRecommendationText(providerUsed, scene.type) : undefined}
                    compact
                    styleRecommendedProviders={styleRecProviders}
                    styleLabel={styleRecLabel}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Quality</span>
                <select
                  value={qualityTier}
                  onChange={(e) => handleQualityTierChange(e.target.value)}
                  className="text-xs rounded-md border px-1.5 py-1 bg-transparent outline-none w-[88px]"
                  style={{
                    borderColor: qualityTier === 'draft' ? 'rgba(251, 191, 36, 0.4)' : qualityTier === 'premium' ? 'rgba(168, 85, 247, 0.4)' : qualityTier === 'ultra' ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-subtle)',
                    color: qualityTier === 'draft' ? 'rgb(251, 191, 36)' : qualityTier === 'premium' ? 'rgb(168, 85, 247)' : qualityTier === 'ultra' ? 'rgb(239, 68, 68)' : 'var(--text-primary)',
                  }}
                  title={qualityTierDescription}
                  data-testid="select-quality-tier"
                >
                  <option value="draft">Draft</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                  <option value="ultra">Ultra</option>
                </select>
              </div>
              {(scene.microScenes?.length ?? 0) > 0 && (
                <>
                  <span className="mx-0.5 h-4 w-px" style={{ backgroundColor: "var(--border-subtle)" }} />
                  <button
                    type="button"
                    onClick={async () => {
                      const updated = (scene.microScenes || []).map((ms: any) => ({
                        ...ms,
                        generationMode: generationMode === "auto" ? undefined : generationMode,
                        provider: (!provider || provider === "auto") ? undefined : provider,
                        qualityTier,
                      }));
                      try {
                        const [sceneRes, qualityRes] = await Promise.all([
                          fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ microScenes: updated }),
                          }),
                          fetch(`/api/universal-video/projects/${projectId}/quality-tier`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ qualityTier }),
                          }),
                        ]);
                        if (!sceneRes.ok || !qualityRes.ok) {
                          throw new Error(`Server returned ${!sceneRes.ok ? sceneRes.status : qualityRes.status}`);
                        }
                        queryClient.invalidateQueries({ queryKey: [`/api/universal-video/projects/${projectId}`] });
                        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
                        toast({ title: `Applied Mode, Provider & Quality to ${updated.length} micro-scene${updated.length === 1 ? "" : "s"}` });
                      } catch (err: any) {
                        toast({ title: "Failed to apply to micro-scenes", description: err?.message, variant: "destructive" });
                      }
                    }}
                    className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:bg-purple-500/10 whitespace-nowrap"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                    data-testid="apply-to-all-microscenes"
                    title="Copy Mode, Provider, and Quality to every micro-scene"
                  >
                    Apply to all micro-scenes
                  </button>
                </>
              )}
            </div>
            <p className="text-[10px] text-right max-w-[320px]" style={{ color: (() => {
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
                onClick={() => {
                  // Phase 20C — HARD pre-flight guardrail. Whenever this scene
                  // has brand references attached AND the provider is not
                  // explicitly resolved to Seedance 2, we block generation
                  // until the user explicitly acknowledges. This includes the
                  // unresolved/auto case ('') because the server's auto-router
                  // may pick a non-Seedance provider that silently ignores
                  // omni_reference, and we never want a "looks anchored, isn't"
                  // surprise.
                  const resolvedProvider = (videoProviderLock || (provider !== 'auto' ? provider : null) || scene.assets?.videoProvider || '').toString().toLowerCase();
                  const isSeedance2 = resolvedProvider.startsWith('seedance-2');
                  if (brandReferences.length > 0 && !isSeedance2) {
                    setProviderMismatchInfo({
                      providerLabel: resolvedProvider === ''
                        ? 'auto-routing (not yet resolved to Seedance 2)'
                        : formatEditorProviderName(resolvedProvider),
                      referenceCount: brandReferences.length,
                    });
                    setProviderMismatchOpen(true);
                    return;
                  }
                  regenVideoMutation.mutate();
                }}
                disabled={isRegenerating}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 disabled:opacity-50 transition-colors ${
                  regeneratingType ? 'bg-purple-600/60 text-white/80' : 'bg-purple-600 text-white hover:bg-purple-500'
                }`}
                data-testid="regen-video-button"
              >
                {(regenVideoMutation.isPending || regeneratingType === 'video') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {regeneratingType === 'video' ? 'Generating...' : regeneratingType === 'image' ? 'Working...' : 'Regenerate'}
              </button>
            </div>
          </div>
          )}
        </div>

        {scene.microScenes && scene.microScenes.length > 0 && projectMode !== 'studio-polish' && (
          <div className="mt-3 flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "rgba(124,58,237,0.04)", border: "1px solid rgba(124,58,237,0.12)" }}>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>Generate All Micro Scenes</p>
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                Uses the scene&apos;s Mode + Provider above. Use &quot;Apply to all micro-scenes&quot; to also override each micro-scene&apos;s own settings.
              </p>
            </div>
            <button
              onClick={regenAllMicroSceneVideos}
              disabled={regeneratingMicroScenes.size > 0}
              className={`text-xs px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 disabled:opacity-50 transition-colors whitespace-nowrap ${
                regeneratingMicroScenes.size > 0
                  ? 'bg-purple-600/60 text-white/80'
                  : 'bg-purple-600 text-white hover:bg-purple-500'
              }`}
            >
              {regeneratingMicroScenes.size > 0 ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {`Generating ${regeneratingMicroScenes.size}/${scene.microScenes.length}...`}
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  {scene.microScenes.every((ms: any) => ms.videoUrl) ? 'Regenerate All' : 'Generate All'}
                </>
              )}
            </button>
          </div>
        )}

        {referenceImageUrls.length >= 2 && !isEditing && provider !== "auto" && !getMultiImageSupport(provider) && (
          <div
            className="mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 animate-in slide-in-from-top-2 duration-300"
            style={{
              borderColor: "rgba(217,119,6,0.35)",
              backgroundColor: "rgba(217,119,6,0.08)",
            }}
          >
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "rgb(251,191,36)" }} />
            <p className="text-[11px] leading-relaxed" style={{ color: "rgb(251,191,36)" }}>
              This provider only uses the first image — additional images are ignored.
            </p>
          </div>
        )}

        {showMultiImageTip && referenceImageUrls.length >= 2 && !isEditing && !!getMultiImageSupport(provider === "auto" ? "" : provider) && (
          <div
            className="mt-3 rounded-xl border p-3.5 relative animate-in slide-in-from-top-2 duration-300"
            style={{
              borderColor: "rgba(124,58,237,0.3)",
              backgroundColor: "rgba(124,58,237,0.06)",
              boxShadow: "0 4px 24px rgba(124,58,237,0.08)",
            }}
          >
            <button
              onClick={dismissMultiImageTip}
              className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-start gap-2.5 mb-2.5">
              <Sparkles className="w-4 h-4 mt-0.5 text-purple-400 shrink-0" />
              <div>
                <h4 className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  Multi-Image Reference Tips
                </h4>
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                  You have {referenceImageUrls.length} reference images attached. Use <code className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono text-[10px]">@image_1</code>, <code className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono text-[10px]">@image_2</code> syntax in your prompt to reference specific images.
                </p>
              </div>
            </div>

            <div className="ml-6 space-y-1.5">
              <div className="rounded-md p-2" style={{ backgroundColor: "rgba(0,0,0,0.15)" }}>
                <p className="text-[10px] font-medium mb-1" style={{ color: "rgb(167,139,250)" }}>Example prompt</p>
                <p className="text-[9px] font-mono leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  "Show @image_1 as the background scene. Place @image_2 product in the center with a gentle zoom."
                </p>
              </div>
              <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                <span className="font-semibold text-purple-300">Kling</span> providers support multi-image (up to 4). Other providers use only the first image as the starting frame.
              </p>
            </div>

            <div className="flex items-center gap-2 mt-2.5 ml-6">
              <button
                onClick={() => { dismissMultiImageTip(); setIsEditing(true); }}
                className="text-[10px] px-3 py-1 rounded-md font-medium transition-colors bg-purple-600 hover:bg-purple-500 text-white"
              >
                Edit Prompt
              </button>
              <button
                onClick={dismissMultiImageTip}
                className="text-[10px] px-3 py-1 rounded-md transition-colors hover:bg-purple-500/20"
                style={{ color: "rgb(167,139,250)", border: "1px solid rgba(124,58,237,0.2)" }}
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>


      {/* Divider */}
      <div className="border-t mt-4 pt-4" style={{ borderColor: "var(--border-subtle)" }} />

      {/* Scene Metadata Section */}
      <div className="space-y-3">
        {/* Narration */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
            Narration
          </label>
          <textarea
            ref={narrationRef}
            value={editValues.narration}
            onChange={(e) => {
              if (!isEditing) setIsEditing(true);
              setEditValues({ ...editValues, narration: e.target.value });
            }}
            rows={3}
            className="w-full text-sm rounded-lg border px-3 py-2 bg-transparent outline-none resize-none"
            style={{
              borderColor: "rgba(124,58,237,0.3)",
              color: "var(--text-primary)",
              backgroundColor: "rgba(124,58,237,0.05)",
              cursor: "text",
            }}
            placeholder="Enter the voiceover narration for this scene..."
          />
        </div>


        {/* Visual Direction */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Visual Direction (AI prompt for video generation)
          </label>
            <button
              type="button"
              onClick={handleRegenerateVisualDirection}
              disabled={regeneratingVisualDirection}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors hover:bg-purple-600/20"
              style={{ color: "rgb(167,139,250)" }}
              title="Regenerate visual direction with AI"
            >
              {regeneratingVisualDirection ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {regeneratingVisualDirection ? 'Regenerating...' : 'Regenerate'}
            </button>
            {rawLlmResponse && (
              <button
                type="button"
                onClick={() => setShowRawResponse(!showRawResponse)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors hover:bg-purple-600/20"
                style={{ color: "rgb(167,139,250)" }}
                title="View full AI response with micro-scenes"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showRawResponse ? 'rotate-180' : ''}`} />
                {showRawResponse ? 'Hide Raw' : 'View Raw'}
              </button>
            )}
          </div>
          {showRawResponse && rawLlmResponse && (
            <div className="mt-2 rounded-lg border p-3 text-xs font-mono overflow-auto max-h-[300px]"
              style={{ borderColor: "rgba(124,58,237,0.2)", backgroundColor: "rgba(124,58,237,0.03)", color: "var(--text-secondary)" }}>
              <pre className="whitespace-pre-wrap break-words">{JSON.stringify(rawLlmResponse, null, 2)}</pre>
            </div>
          )}
          <textarea
            ref={visualDirectionRef}
            value={editValues.visualDirection}
            onChange={(e) => {
              if (!isEditing) setIsEditing(true);
              setEditValues({ ...editValues, visualDirection: e.target.value });
            }}
            rows={3}
            className="w-full text-sm rounded-lg border px-3 py-2 bg-transparent outline-none resize-none"
            style={{
              borderColor: "rgba(124,58,237,0.3)",
              color: "var(--text-primary)",
              backgroundColor: "rgba(124,58,237,0.05)",
              cursor: "text",
            }}
            placeholder="Describe what should appear in this video scene..."
          />
          {isEditing && referenceImageUrls.length > 0 && (() => {
            const multiImg = getMultiImageSupport(provider === "auto" ? "" : provider);
            if (multiImg && multiImg.promptSyntax) {
              return (
                <div className="mt-1.5 rounded-md px-2.5 py-2" style={{ backgroundColor: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.15)" }}>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {referenceImageUrls.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const ta = visualDirectionRef.current;
                          if (!ta) return;
                          const tag = `@image_${i + 1}`;
                          const start = ta.selectionStart;
                          const end = ta.selectionEnd;
                          const val = editValues.visualDirection || '';
                          const newVal = val.substring(0, start) + tag + val.substring(end);
                          setEditValues({ ...editValues, visualDirection: newVal });
                          setTimeout(() => {
                            ta.focus();
                            ta.setSelectionRange(start + tag.length, start + tag.length);
                          }, 0);
                        }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold transition-colors hover:bg-purple-600 hover:text-white"
                        style={{ backgroundColor: "rgba(124,58,237,0.15)", color: "rgb(167,139,250)" }}
                      >
                        @image_{i + 1}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {multiImg.hint}
                  </p>
                </div>
              );
            }
            return (
              <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                {provider === "auto"
                  ? "Auto-selected providers typically use image #1 as the starting frame. Kling providers support multi-image references."
                  : "This provider uses image #1 as the starting frame for animation. Additional images are ignored."}
              </p>
            );
          })()}
          {scene.cinematicNotes && (
            <details className="mt-2 rounded-lg border overflow-hidden" style={{ borderColor: "rgba(124,58,237,0.15)" }}>
              <summary className="px-3 py-1.5 text-[11px] font-medium cursor-pointer select-none flex items-center gap-1.5"
                style={{ backgroundColor: "rgba(124,58,237,0.04)", color: "var(--text-secondary)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                Cinematic Notes
              </summary>
              <div className="px-3 py-2 text-xs leading-relaxed" style={{ color: "var(--text-muted)", backgroundColor: "rgba(124,58,237,0.02)" }}>
                {scene.cinematicNotes}
              </div>
            </details>
          )}
        </div>



        {/* Phase 23A (Task #118): Render-system classifier row.
            Sits ABOVE the narrative Scene Type so the editor sees the
            high-level "how this scene gets rendered" decision before the
            "what story beat is this" tag. Uses shadcn Select for the
            override dropdown (matches the rest of Sprint 3). */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 flex items-center gap-2 flex-wrap" style={{ color: "var(--text-secondary)" }}>
            Render System
            {/* The reclassify action lives INSIDE the badge (with its own
                in-flight spinner) so the editor doesn't have to thread
                loading state through. The badge owns the lifecycle; we
                just await our network call inside `onReclassify` and
                surface failures via toast. */}
            <RenderTypeBadge
              renderSystemType={(scene as Scene).renderSystemType}
              classifierConfidence={(scene as Scene).classifierConfidence}
              classifierReasoning={(scene as Scene).classifierReasoning}
              manuallyClassified={(scene as Scene).manuallyClassified}
              classifiedAt={(scene as Scene).classifiedAt}
              onReclassify={async () => {
                try {
                  const res = await fetch(
                    `/api/universal-video/projects/${projectId}/scenes/${sceneId}/classify`,
                    { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" },
                  );
                  if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    throw new Error(errBody.error || "Reclassify failed");
                  }
                  await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
                  toast({ title: "Reclassified", description: "Scene re-evaluated by Claude Haiku." });
                } catch (err: any) {
                  toast({ title: "Reclassify failed", description: err?.message || String(err), variant: "destructive" });
                }
              }}
            />
            {/* Phase 23B (Task #174): "Will render as" hint for stub
                handlers — surfaces that the visible classification is
                not yet implemented and will silently fall back to the
                AI Video pipeline at generate time. */}
            <RenderRouterPreviewHint renderSystemType={(scene as Scene).renderSystemType} />
            {/* Phase 23B (Task #174): "Rendered as" pill summarizing the
                most recent dispatch for this scene. Shows the resolved
                handler + a [Fallback] chip when the router fell back. */}
            <RenderedAsBadge lastRender={(scene as Scene).lastRender} />
          </label>
          {/* Phase 23B (Task #174): one-shot toast when a manually
              classified scene's render fell back to a stub. */}
          <ManualClassifiedFallbackToast
            sceneId={sceneId}
            lastRender={(scene as Scene).lastRender}
          />
          <RsSelect
            value={(scene as Scene).renderSystemType || ""}
            onValueChange={(value: string) => {
              if (!value) return;
              // Send only renderSystemType — the server stamps
              // manuallyClassified + confidence + reasoning + timestamp
              // automatically inside the PATCH override block.
              silentSaveMutation.mutate({ renderSystemType: value });
            }}
          >
            <RsSelectTrigger
              className="w-full text-sm"
              data-testid="render-system-override-select"
            >
              <RsSelectValue placeholder="Auto (waiting for classifier)" />
            </RsSelectTrigger>
            <RsSelectContent>
              {RENDER_SYSTEM_TYPES.map((t) => (
                <RsSelectItem key={t} value={t}>
                  {RENDER_TYPE_LABELS[t as RenderSystemType]}
                </RsSelectItem>
              ))}
            </RsSelectContent>
          </RsSelect>
        </div>

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
              Duration
            </label>
            <SceneDurationControl
              provider={resolveSceneVideoProvider(scene, projectPreferredProvider)}
              value={editValues.duration}
              disabled={!isEditing}
              onChange={(next) => {
                setEditValues({ ...editValues, duration: next });
                silentSaveMutation.mutate({ duration: next });
              }}
            />
          </div>
        </div>

        <div className="mt-3">
          <NativeAudioToggle
            provider={resolveSceneVideoProvider(scene, projectPreferredProvider)}
            value={editValues.generateNativeAudio}
            hasVoiceover={Boolean(editValues.narration.trim())}
            disabled={!isEditing}
            onChange={(next) => {
              setEditValues({ ...editValues, generateNativeAudio: next });
              silentSaveMutation.mutate({ generateNativeAudio: next });
            }}
            onMuteVoiceover={async () => {
              setEditValues({ ...editValues, narration: "" });
              await silentSaveMutation.mutateAsync({ narration: "" });
            }}
          />
        </div>

        {isEditing && (
          <div className="flex items-center justify-between px-1">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Text Image Pipeline (GPT-Image-1 → I2V)
              </label>
              <p className="text-[9px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                Generates a text-accurate image first, then animates it
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const newVal = !(scene as any).textImageEnabled;
                updateSceneMutation.mutate({ textImageEnabled: newVal });
              }}
              className="relative w-9 h-5 rounded-full transition-colors"
              style={{
                backgroundColor: (scene as any).textImageEnabled ? "rgb(59,130,246)" : "var(--border-subtle)",
              }}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                style={{
                  left: (scene as any).textImageEnabled ? "18px" : "2px",
                }}
              />
            </button>
          </div>
        )}

        {/* Content Tag */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            Content Tag
            {isContentTagAutoAssigned && <span className="text-[9px] normal-case tracking-normal px-1.5 py-0.5 rounded-full" style={{ color: 'rgb(52,211,153)', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>Auto</span>}
            {contentTag && !isContentTagAutoAssigned && <span className="ml-1 text-[10px] normal-case tracking-normal" style={{ color: activeTag?.color || 'var(--text-muted)' }}>(manual override)</span>}
            {contentTag && isContentTagAutoAssigned && <span className="ml-1 text-[10px] normal-case tracking-normal" style={{ color: activeTag?.color || 'var(--text-muted)' }}>(overrides art style)</span>}
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => { if (isEditing) { setContentTag(null); updateSceneMutation.mutate({ contentTag: null }); } }}
              disabled={!isEditing}
              className="text-[11px] px-2.5 py-1 rounded-full border transition-all disabled:opacity-70"
              style={{
                borderColor: contentTag === null ? 'rgba(124,58,237,0.5)' : 'var(--border-subtle)',
                backgroundColor: contentTag === null ? 'rgba(124,58,237,0.1)' : 'transparent',
                color: contentTag === null ? 'rgb(167,139,250)' : 'var(--text-secondary)',
              }}
            >
              None
            </button>
            {Object.values(SCENE_CONTENT_TAGS).map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => { if (isEditing) { const newTag = contentTag === tag.id ? null : tag.id; setContentTag(newTag); updateSceneMutation.mutate({ contentTag: newTag }); } }}
                disabled={!isEditing}
                className="text-[11px] px-2.5 py-1 rounded-full border transition-all disabled:opacity-70"
                style={{
                  borderColor: contentTag === tag.id ? `${tag.color}80` : 'var(--border-subtle)',
                  backgroundColor: contentTag === tag.id ? `${tag.color}1a` : 'transparent',
                  color: contentTag === tag.id ? tag.color : 'var(--text-secondary)',
                }}
                title={tag.description}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>



        {/* Art Style Override */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            <Palette className="w-3 h-3" />
            Art Style
            {pipelineAssignedStyle && sceneArtPreset === pipelineAssignedStyle && <span className="text-[10px] normal-case tracking-normal px-1.5 py-0.5 rounded-full" style={{ color: 'rgb(129,230,217)', background: 'rgba(129,230,217,0.1)', border: '1px solid rgba(129,230,217,0.2)' }}>Smart Mix</span>}
            {pipelineAssignedStyle && sceneArtPreset !== pipelineAssignedStyle && <span className="text-[10px] normal-case tracking-normal" style={{ color: 'rgb(167,139,250)' }}>(overridden)</span>}
            {!pipelineAssignedStyle && sceneArtPreset !== 'project' && <span className="text-[10px] normal-case tracking-normal" style={{ color: 'rgb(167,139,250)' }}>(scene override)</span>}
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
            <button
              type="button"
              onClick={() => isEditing && setSceneArtPreset('project')}
              disabled={!isEditing}
              className="flex-shrink-0 w-[80px] rounded-lg border-2 p-1.5 transition-all disabled:opacity-70"
              style={{
                backgroundColor: sceneArtPreset === 'project' ? 'rgba(139,92,246,0.15)' : 'transparent',
                borderColor: sceneArtPreset === 'project' ? 'rgb(139,92,246)' : 'var(--border-subtle)',
              }}
            >
              <div className="w-full h-10 rounded flex items-center justify-center mb-1" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))' }}>
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <span className="text-[10px] font-medium block truncate" style={{ color: 'var(--text-primary)' }}>Project</span>
              {artPresetId && getVisualArtPreset(artPresetId) && (
                <span className="text-[8px] block truncate" style={{ color: 'var(--text-muted)' }}>
                  ({getVisualArtPreset(artPresetId)!.name})
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => isEditing && setSceneArtPreset('auto')}
              disabled={!isEditing}
              className="flex-shrink-0 w-[80px] rounded-lg border-2 p-1.5 transition-all disabled:opacity-70"
              style={{
                backgroundColor: sceneArtPreset === 'auto' ? 'rgba(139,92,246,0.15)' : 'transparent',
                borderColor: sceneArtPreset === 'auto' ? 'rgb(139,92,246)' : 'var(--border-subtle)',
              }}
            >
              <div className="w-full h-10 rounded flex items-center justify-center mb-1" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))' }}>
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <span className="text-[10px] font-medium block truncate" style={{ color: 'var(--text-primary)' }}>Auto</span>
            </button>
            {getAllVisualArtPresets().map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => isEditing && setSceneArtPreset(preset.id)}
                disabled={!isEditing}
                className="flex-shrink-0 w-[80px] rounded-lg border-2 p-1.5 transition-all disabled:opacity-70"
                style={{
                  backgroundColor: sceneArtPreset === preset.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                  borderColor: sceneArtPreset === preset.id ? 'rgb(139,92,246)' : 'var(--border-subtle)',
                }}
                title={preset.description}
              >
                {ART_PRESET_IMAGES[preset.id] ? (
                  <img
                    src={ART_PRESET_IMAGES[preset.id]}
                    alt={preset.name}
                    className="w-full h-10 rounded object-cover mb-1"
                  />
                ) : (
                  <div
                    className="w-full h-10 rounded mb-1"
                    style={{ background: `linear-gradient(135deg, ${preset.thumbnailColors[0]}, ${preset.thumbnailColors[1]}, ${preset.thumbnailColors[2]})` }}
                  />
                )}
                <span className="text-[10px] font-medium block truncate" style={{ color: 'var(--text-primary)' }}>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>



        {/* Reference Media */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 flex items-center gap-2 block" style={{ color: "var(--text-secondary)" }}>
            <ImagePlus className="w-3.5 h-3.5" />
            Reference Media
            <span className="text-[10px] font-normal normal-case tracking-normal" style={{ color: "var(--text-muted)" }}>
              (guides AI generation toward your brand look)
            </span>
          </label>

          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(124,58,237,0.03)" }}>
            <div className="flex flex-wrap gap-2 items-start">
              {referenceImageUrls.map((url, i) => (
                <div key={`ref-img-${i}`} className="relative w-16 h-16 rounded-lg overflow-hidden border group" style={{ borderColor: "rgba(124,58,237,0.3)" }}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => {
                      if (url === scene.brandAssetUrl) {
                        setBrandAssetDismissed(true);
                      }
                      const newImages = referenceImageUrls.filter((_, idx) => idx !== i);
                      setReferenceImageUrls(newImages);
                      persistReferenceImages(newImages);
                    }}
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                  <div className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-purple-600 text-white flex items-center justify-center text-[9px] font-bold shadow-sm">
                    {i + 1}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 text-[8px] text-center py-0.5 bg-black/60 text-white">@image_{i + 1}</div>
                </div>
              ))}

              {referenceVideoUrl && (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border group" style={{ borderColor: "rgba(59,130,246,0.4)" }}>
                  <video src={referenceVideoUrl} className="w-full h-full object-cover" muted />
                  <button
                    onClick={() => {
                      setReferenceVideoUrl('');
                      persistReferenceVideo('');
                    }}
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 text-[8px] text-center py-0.5 bg-blue-600/80 text-white">VID</div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => refFileInputRef.current?.click()}
                  disabled={!isEditing || (() => {
                    const multi = getMultiImageSupport(provider === "auto" ? "" : provider);
                    const max = multi?.maxImages || 4;
                    return referenceImageUrls.length >= max;
                  })()}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed text-[11px] transition-colors hover:border-purple-500/40 disabled:opacity-50"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                >
                  <Image className="w-3 h-3" />
                  Add Image{(() => {
                    const multi = getMultiImageSupport(provider === "auto" ? "" : provider);
                    const max = multi?.maxImages || 4;
                    return referenceImageUrls.length > 0 ? ` (${referenceImageUrls.length}/${max})` : '';
                  })()}
                </button>
                <button
                  type="button"
                  onClick={() => refVideoInputRef.current?.click()}
                  disabled={!isEditing || !!referenceVideoUrl}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed text-[11px] transition-colors hover:border-blue-500/40 disabled:opacity-50"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                >
                  <Video className="w-3 h-3" />
                  Add Video
                </button>
              </div>

              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowEditLibrary(!showEditLibrary); }}
                disabled={!isEditing}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed text-[11px] transition-colors hover:border-purple-500/40 disabled:opacity-50 self-center"
                style={{ borderColor: showEditLibrary ? "rgba(124,58,237,0.4)" : "var(--border-subtle)", color: showEditLibrary ? "rgb(124,58,237)" : "var(--text-muted)" }}
              >
                <FolderOpen className="w-3 h-3" />
                Library
              </button>
            </div>

            {(() => {
              const resolvedProvider = provider === "auto" ? "" : provider;
              const multiSupport = getMultiImageSupport(resolvedProvider);
              if (referenceImageUrls.length >= 2 && multiSupport) {
                const tags = referenceImageUrls.map((_, i) => `@image${i + 1}`).join(', ');
                return (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md px-2.5 py-2 text-[11px]" style={{ backgroundColor: "rgba(124,58,237,0.08)", color: "var(--text-secondary)" }}>
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "rgb(124,58,237)" }} />
                    <span>This provider supports {tags} syntax — reference them in your visual direction.</span>
                  </div>
                );
              }
              return null;
            })()}

            {showEditLibrary && (
              <div className="border rounded-lg p-2 mt-2 max-h-32 overflow-y-auto" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
                {libraryQuery.isLoading ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />
                  </div>
                ) : !libraryQuery.data || libraryQuery.data.length === 0 ? (
                  <p className="text-xs text-center py-3" style={{ color: "var(--text-muted)" }}>No images in library</p>
                ) : (
                  <div className="grid grid-cols-6 gap-2">
                    {libraryQuery.data.slice(0, 24).map((asset: any) => {
                      const assetUrl = asset.url || asset.thumbnailUrl;
                      const isVideo = asset.type === 'video';
                      return (
                        <button
                          key={asset.id}
                          onClick={() => {
                            if (assetUrl) {
                              if (isVideo) {
                                setReferenceVideoUrl(assetUrl);
                                persistReferenceVideo(assetUrl);
                              } else {
                                addReferenceImage(assetUrl);
                              }
                              setShowEditLibrary(false);
                              toast({ title: `Reference ${isVideo ? 'Video' : 'Image'} Added` });
                            }
                          }}
                          className="relative aspect-video rounded-md overflow-hidden border hover:border-purple-500/50 transition-colors group"
                          style={{ borderColor: "var(--border-subtle)" }}
                          title={asset.name || ''}
                        >
                          {isVideo ? (
                            <video
                              src={assetUrl}
                              className="w-full h-full object-cover"
                              muted
                              onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                              onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                            />
                          ) : (
                            <img src={asset.thumbnailUrl || assetUrl} alt={asset.name || ""} className="w-full h-full object-cover" />
                          )}
                          <div className="absolute top-0.5 left-0.5">
                            <span className="text-[8px] px-1 py-0.5 rounded bg-black/60 text-white font-medium">
                              {isVideo ? 'VID' : 'IMG'}
                            </span>
                          </div>
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <span className="text-[9px] text-white font-medium">Use</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {referenceImageUrls.length === 0 && !referenceVideoUrl && (
              <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
                Add product photos, brand images, or style reference videos to guide AI generation. Images trigger I2V mode for better brand consistency.
              </p>
            )}
          </div>

          {referenceImageUrls.length >= 2 && provider !== "auto" && !getMultiImageSupport(provider) && (
            <div
              className="mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 animate-in slide-in-from-top-2 duration-300"
              style={{
                borderColor: "rgba(217,119,6,0.35)",
                backgroundColor: "rgba(217,119,6,0.08)",
              }}
            >
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "rgb(251,191,36)" }} />
              <p className="text-[11px] leading-relaxed" style={{ color: "rgb(251,191,36)" }}>
                This provider only uses the first image — additional images are ignored.
              </p>
            </div>
          )}

          {showMultiImageTip && referenceImageUrls.length >= 2 && !!getMultiImageSupport(provider === "auto" ? "" : provider) && (
            <div
              className="mt-3 rounded-xl border p-4 relative animate-in slide-in-from-top-2 duration-300"
              style={{
                borderColor: "rgba(124,58,237,0.3)",
                backgroundColor: "rgba(124,58,237,0.06)",
                boxShadow: "0 4px 24px rgba(124,58,237,0.08)",
              }}
            >
              <button
                onClick={dismissMultiImageTip}
                className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-start gap-2.5 mb-3">
                <Sparkles className="w-4 h-4 mt-0.5 text-purple-400 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Multi-Image Reference Tips
                  </h4>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    You have {referenceImageUrls.length} reference images attached. Here's how to get the best results:
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 ml-7">
                <div className="rounded-lg p-2.5" style={{ backgroundColor: "rgba(124,58,237,0.06)" }}>
                  <p className="text-[11px] font-medium mb-1" style={{ color: "rgb(167,139,250)" }}>
                    Use @image tags in your Visual Direction prompt
                  </p>
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    Reference each image by number: <code className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">@image_1</code>, <code className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">@image_2</code>, etc.
                  </p>
                </div>

                <div className="rounded-lg p-2.5" style={{ backgroundColor: "rgba(124,58,237,0.06)" }}>
                  <p className="text-[11px] font-medium mb-1" style={{ color: "rgb(167,139,250)" }}>
                    Example prompts
                  </p>
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono leading-relaxed px-2 py-1 rounded" style={{ color: "var(--text-muted)", backgroundColor: "rgba(0,0,0,0.2)" }}>
                      "Use @image_1 as the background. Place @image_2 product in the center with gentle zoom."
                    </p>
                    <p className="text-[10px] font-mono leading-relaxed px-2 py-1 rounded" style={{ color: "var(--text-muted)", backgroundColor: "rgba(0,0,0,0.2)" }}>
                      "@image_1 as start frame, transition to @image_2 as end frame."
                    </p>
                  </div>
                </div>

                <div className="rounded-lg p-2.5" style={{ backgroundColor: "rgba(59,130,246,0.06)" }}>
                  <p className="text-[11px] font-medium mb-1" style={{ color: "rgb(147,197,253)" }}>
                    Supported providers
                  </p>
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    <span className="font-semibold text-purple-300">Kling</span> providers (2.0, 2.1, 2.5, 2.6, etc.) support up to 4 reference images via the <code className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">@image_N</code> syntax.
                    Other providers (Runway, Luma, Hailuo, etc.) will use only the first image as the starting frame.
                  </p>
                </div>
              </div>

              <button
                onClick={dismissMultiImageTip}
                className="mt-3 ml-7 text-[10px] px-3 py-1 rounded-md transition-colors hover:bg-purple-500/20"
                style={{ color: "rgb(167,139,250)", border: "1px solid rgba(124,58,237,0.2)" }}
              >
                Got it
              </button>
            </div>
          )}
        </div>


        {/* Micro-Scenes */}
        {scene.microScenes && scene.microScenes.length >= 1 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] font-medium uppercase tracking-wider flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                Micro-Scenes
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25">
                  {scene.microScenes.length}
                </span>
                {regeneratingMicroScenes.size > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    {regeneratingMicroScenes.size}/{scene.microScenes.length}
                  </span>
                )}
              </label>
              <div className="flex items-center gap-1.5">
                {canAssemble && (
                  <button
                    onClick={() => assembleSceneMutation.mutate()}
                    disabled={isAssembling}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors hover:bg-emerald-600/20 disabled:opacity-50"
                    style={{ color: "rgb(134,239,172)" }}
                  >
                    {isAssembling ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Layers className="w-3 h-3" />
                    )}
                    {isAssembling ? 'Assembling...' : isAssembled ? 'Re-assemble' : 'Assemble Scene'}
                  </button>
                )}
                <button
                  onClick={regenAllMicroSceneVideos}
                  disabled={regeneratingMicroScenes.size > 0}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors hover:bg-purple-600/20 disabled:opacity-50"
                  style={{ color: "rgb(167,139,250)" }}
                >
                  {regeneratingMicroScenes.size > 0 ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {regeneratingMicroScenes.size > 0
                    ? `Generating ${regeneratingMicroScenes.size}/${scene.microScenes.length}...`
                    : scene.microScenes.every((ms: any) => ms.videoUrl) ? 'Regenerate All' : 'Generate All'}
                </button>
              </div>
            </div>

            {/* Assembly Status Indicator */}
            {isAssembling && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-md text-[11px]" style={{ backgroundColor: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", color: "rgb(192,132,252)" }}>
                <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                <span>Assembling micro-scenes...</span>
              </div>
            )}
            {!isAssembling && assemblyFailed && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-md text-[11px]" style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "rgb(248,113,113)" }}>
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>Assembly failed — using raw clips. {scene.assemblyManifest?.error || ''}</span>
              </div>
            )}
            {!isAssembling && assemblyStale && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-md text-[11px]" style={{ backgroundColor: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", color: "rgb(250,204,21)" }}>
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>Assembly outdated (micro-scenes changed). Reassemble or render will auto-assemble.</span>
              </div>
            )}
            {!isAssembling && isAssembled && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-md text-[11px]" style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "rgb(134,239,172)" }}>
                <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                <span>Assembled {scene.assemblyManifest.totalDurationSec?.toFixed(1)}s</span>
              </div>
            )}
            {!isAssembling && !isAssembled && !assemblyFailed && !assemblyStale && msWithVideo.length >= 2 && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-md text-[11px]" style={{ backgroundColor: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.15)", color: "rgb(250,204,21)" }}>
                <Layers className="w-3 h-3 flex-shrink-0" />
                <span>{msWithVideo.length} micro-scenes — ready to assemble</span>
              </div>
            )}

            {/* Timeline Bar — unified when assembled, segmented when not */}
            {isAssembled ? (
              <div className="mb-3">
                <div className="flex items-center gap-1 rounded-lg p-2" style={{ backgroundColor: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <div className="flex w-full">
                    <div
                      className="relative rounded-md overflow-hidden flex items-center justify-center w-full"
                      style={{
                        height: "24px",
                        backgroundColor: "rgba(34,197,94,0.2)",
                        border: "1px solid rgba(34,197,94,0.3)",
                      }}
                    >
                      <span className="text-[9px] font-medium" style={{ color: "rgb(134,239,172)" }}>
                        {scene.assemblyManifest.totalDurationSec?.toFixed(1)}s assembled
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowMicroScenesExpanded(!showMicroScenesExpanded)}
                  className="flex items-center gap-1 mt-1.5 px-2 py-0.5 text-[10px] font-medium transition-colors hover:bg-white/5 rounded-md"
                  style={{ color: "var(--text-muted)" }}
                >
                  {showMicroScenesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showMicroScenesExpanded ? 'Hide micro-scenes' : 'Show micro-scenes'}
                </button>
              </div>
            ) : (
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
            )}

            {(!isAssembled || showMicroScenesExpanded) && (
              <div className="relative">
                <div className="sticky top-0 z-10 flex items-center justify-between py-1.5 mb-1" style={{ backgroundColor: "var(--bg-primary)" }}>
                  <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                    {scene.microScenes.length} micro-scene{scene.microScenes.length !== 1 ? 's' : ''}
                  </span>
                  {isAssembled && showMicroScenesExpanded && (
                    <button
                      onClick={() => setShowMicroScenesExpanded(false)}
                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium transition-colors hover:bg-white/5 rounded-md"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <ChevronUp className="w-3 h-3" /> Collapse
                    </button>
                  )}
                </div>
            {sceneOverlays.length > 0 && (
              <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-md text-[10px]" style={{ backgroundColor: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "rgb(252,211,77)" }}>
                <Maximize2 className="w-3 h-3 flex-shrink-0" />
                Scene overlay active — overlays span all micro-scenes during render
              </div>
            )}

            <div className="space-y-3" style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: "4px" }}>
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
                      {ms.videoUrl ? (
                        <div className="w-10 h-7 rounded overflow-hidden flex-shrink-0 border" style={{ borderColor: "var(--border-subtle)" }}>
                          <video src={ms.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
                        </div>
                      ) : ms.imageUrl ? (
                        <div className="w-10 h-7 rounded overflow-hidden flex-shrink-0 border" style={{ borderColor: "rgba(59,130,246,0.3)" }}>
                          <img src={ms.imageUrl} className="w-full h-full object-cover" alt={`Micro-scene ${msIdx + 1} reference`} loading="lazy" />
                        </div>
                      ) : null}
                      <p className="text-xs truncate flex-1" style={{ color: "var(--text-primary)" }}>
                        {ms.narration}
                      </p>
                      {(ms.originalAudioVolume || 0) > 0 && (
                        <Volume2 className="w-3 h-3 flex-shrink-0 text-blue-400" title="Native audio enabled" />
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: "rgba(124,58,237,0.1)", color: "rgb(192,132,252)" }}>
                        {ms.duration != null ? `${ms.duration}s` : '—'}
                      </span>
                      {regeneratingMicroScenes.has(msIdx) ? (
                        <Loader2 className="w-3.5 h-3.5 flex-shrink-0 text-purple-400 animate-spin" />
                      ) : ms.videoUrl ? (
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-green-400" />
                      ) : ms.imageUrl ? (
                        <span className="w-3.5 h-3.5 flex-shrink-0 rounded-full bg-blue-500/30 border border-blue-500/50" title="Reference image ready" />
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

                        {ms.imageUrl && !ms.videoUrl && (
                          <div className="relative">
                            <span className="text-[10px] font-medium uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Reference Image (I2V)</span>
                            <img
                              src={ms.imageUrl}
                              alt={`Micro-scene ${msIdx + 1} reference`}
                              className="w-full rounded-lg"
                              style={{ maxHeight: '140px', objectFit: 'cover', border: '1px solid rgba(59,130,246,0.25)' }}
                              loading="lazy"
                            />
                          </div>
                        )}

                        {(() => {
                          const inlineProv = (provider !== 'auto' ? provider : '').toLowerCase();
                          const inlineMultiRefName = inlineProv.startsWith('seedance-2') ? 'Seedance 2' : inlineProv.startsWith('kling-2') ? 'Kling 2.x' : null;
                          if (!inlineMultiRefName) return null;
                          const inlineMaxImages = getMultiImageSupport(provider !== 'auto' ? provider : '')?.maxImages || 4;
                          const inlineRefs = msInlineRefImages[msIdx] || [];
                          const inlineOpen = !!msInlineShowExpander[msIdx];
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => setMsInlineShowExpander(prev => ({ ...prev, [msIdx]: !prev[msIdx] }))}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors"
                                style={{
                                  borderColor: inlineOpen ? 'rgba(124,58,237,0.45)' : 'var(--border-subtle)',
                                  backgroundColor: inlineOpen ? 'rgba(124,58,237,0.06)' : 'transparent',
                                }}
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <ImagePlus className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgb(167,139,250)' }} />
                                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Additional reference images</span>
                                  {inlineRefs.length > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 font-medium text-purple-300">
                                      {inlineRefs.length}/{inlineMaxImages}
                                    </span>
                                  )}
                                  <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>@image_1, @image_2… — {inlineMultiRefName}</span>
                                </div>
                                {inlineOpen
                                  ? <ChevronUp className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                                  : <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />}
                              </button>

                              {inlineOpen && (
                                <div className="rounded-lg border p-3 space-y-2.5" style={{ borderColor: 'rgba(124,58,237,0.25)', backgroundColor: 'rgba(124,58,237,0.04)' }}>
                                  <div className="flex flex-wrap gap-2 items-start">
                                    {inlineRefs.map((url, i) => (
                                      <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border group" style={{ borderColor: 'rgba(124,58,237,0.35)' }}>
                                        <img src={url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]" />
                                        <div className="absolute top-0.5 left-0.5 w-[16px] h-[16px] rounded-full bg-purple-600 text-white flex items-center justify-center text-[8px] font-bold pointer-events-none shadow-sm">
                                          {i + 1}
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 text-[7px] text-center py-0.5 bg-black/60 text-white font-mono pointer-events-none">
                                          @image_{i + 1}
                                        </div>
                                        <button
                                          onClick={() => {
                                            const next = inlineRefs.filter((_, idx) => idx !== i);
                                            setMsInlineRefImages(prev => ({ ...prev, [msIdx]: next }));
                                            persistMsRefImages(msIdx, next);
                                          }}
                                          className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                        >
                                          <X className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    ))}
                                    <div className="flex flex-col gap-1.5">
                                      <input type="file" ref={msInlineFileRef} className="hidden" accept="image/*" onChange={handleMsInlineRefUpload} />
                                      <button
                                        onClick={() => { msInlineUploadTarget.current = msIdx; msInlineFileRef.current?.click(); }}
                                        disabled={inlineRefs.length >= inlineMaxImages}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed text-[11px] transition-colors hover:border-purple-500/40 disabled:opacity-50"
                                        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                                      >
                                        <Upload className="w-3 h-3" />
                                        Upload{inlineRefs.length > 0 ? ` (${inlineRefs.length}/${inlineMaxImages})` : ''}
                                      </button>
                                      <button
                                        onClick={() => setMsInlineShowLibrary(prev => ({ ...prev, [msIdx]: !prev[msIdx] }))}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed text-[11px] transition-colors hover:border-purple-500/40"
                                        style={{
                                          borderColor: msInlineShowLibrary[msIdx] ? 'rgba(124,58,237,0.5)' : 'var(--border-subtle)',
                                          color: msInlineShowLibrary[msIdx] ? 'rgb(124,58,237)' : 'var(--text-muted)',
                                        }}
                                      >
                                        <FolderOpen className="w-3 h-3" />
                                        Library
                                      </button>
                                    </div>
                                  </div>

                                  {msInlineShowLibrary[msIdx] && (
                                    <div className="border rounded-lg p-2 max-h-32 overflow-y-auto" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                      {libraryQuery.isLoading ? (
                                        <div className="flex items-center justify-center py-3"><Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
                                      ) : !libraryQuery.data || libraryQuery.data.length === 0 ? (
                                        <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>No images in library</p>
                                      ) : (
                                        <div className="grid grid-cols-8 gap-1.5">
                                          {libraryQuery.data.slice(0, 24).map((asset: any) => {
                                            const assetUrl = asset.url || asset.thumbnailUrl;
                                            if (asset.type === 'video') return null;
                                            return (
                                              <button
                                                key={asset.id}
                                                onClick={() => {
                                                  if (assetUrl) {
                                                    setMsInlineRefImages(prev => {
                                                      const next = [...(prev[msIdx] || []), assetUrl];
                                                      persistMsRefImages(msIdx, next);
                                                      return { ...prev, [msIdx]: next };
                                                    });
                                                    setMsInlineShowLibrary(prev => ({ ...prev, [msIdx]: false }));
                                                    toast({ title: 'Reference Added' });
                                                  }
                                                }}
                                                className="aspect-square rounded overflow-hidden border hover:border-purple-500/50 transition-colors"
                                                style={{ borderColor: 'var(--border-subtle)' }}
                                              >
                                                <img src={asset.thumbnailUrl || assetUrl} alt={asset.name || ''} className="w-full h-full object-cover" />
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  <p className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                                    Use{' '}
                                    <code className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono text-[9px]">@image_1</code>,{' '}
                                    <code className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono text-[9px]">@image_2</code>{' '}
                                    etc. in your visual direction to anchor specific images.{' '}
                                    {inlineMultiRefName} supports up to {inlineMaxImages} reference images.
                                  </p>
                                </div>
                              )}
                            </>
                          );
                        })()}

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
                                onClick={() => { const refs = msInlineRefImages[msIdx] || []; regenMicroSceneVideo(msIdx, { sourceImageUrl: refs.length > 0 ? refs[0] : undefined, sourceImageUrls: refs.length > 0 ? refs : undefined }); }}
                                disabled={regeneratingMicroScenes.has(msIdx)}
                                className="text-[10px] px-2 py-1.5 rounded-lg bg-black/70 text-white font-medium flex items-center gap-1 hover:bg-black/90 disabled:opacity-50 backdrop-blur-sm"
                              >
                                {regeneratingMicroScenes.has(msIdx) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                Regen
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { const refs = msInlineRefImages[msIdx] || []; regenMicroSceneVideo(msIdx, { sourceImageUrl: refs.length > 0 ? refs[0] : undefined, sourceImageUrls: refs.length > 0 ? refs : undefined }); }}
                            disabled={regeneratingMicroScenes.has(msIdx)}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed transition-colors hover:border-purple-500/40 hover:bg-purple-500/05 disabled:opacity-50"
                            style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                          >
                            {regeneratingMicroScenes.has(msIdx) ? (
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
              </div>
            )}

            {fullscreenMicroScene !== null && scene.microScenes[fullscreenMicroScene] && (() => {
              const fsMs = scene.microScenes[fullscreenMicroScene];
              const msActiveMode = msModalMode === "auto" ? (msModalRefImages.length > 0 ? "i2v" : "t2v") : msModalMode;
              const msModeInfo = GENERATION_MODES.find(m => m.id === msActiveMode);
              return (
                <div
                  className="fixed inset-0 z-[9999] flex flex-col"
                  style={{ backgroundColor: "rgba(0,0,0,0.9)", backdropFilter: "blur(12px)" }}
                  onClick={() => setFullscreenMicroScene(null)}
                >
                  <div className="flex-shrink-0 w-full max-w-4xl mx-auto px-4 pt-4 pb-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {fullscreenMicroScene + 1}
                        </span>
                        <span className="text-sm font-medium text-white">Micro-Scene {fullscreenMicroScene + 1}</span>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300">
                          {fsMs.duration != null ? `${fsMs.duration}s` : ''}
                        </span>
                        {regeneratingMicroScenes.has(fullscreenMicroScene) ? (
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
                  </div>
                  <div
                    className="flex-1 min-h-0 overflow-y-auto px-4 pb-8"
                    onClick={(e) => e.stopPropagation()}
                  >
                  <div
                    className="relative w-full max-w-4xl mx-auto"
                  >

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
                                rows={8}
                                autoFocus
                                className="w-full text-xs rounded-lg border px-2.5 py-2 outline-none resize-y"
                                style={{ borderColor: "rgba(124,58,237,0.3)", color: "white", backgroundColor: "rgba(124,58,237,0.08)", minHeight: "120px", maxHeight: "300px" }}
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
                            <div
                              className="text-xs leading-relaxed text-white/60 cursor-pointer hover:text-purple-300 transition-colors overflow-y-auto"
                              style={{ maxHeight: "120px" }}
                              onClick={() => setMsModalEditingPrompt(true)}
                            >
                              {msModalPrompt || "No prompt — click to add"}
                            </div>
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
                              <div className="w-48">
                                <ProviderCapabilitySelector
                                  selectedProvider={msModalProvider}
                                  onSelectProvider={setMsModalProvider}
                                  recommendedProvider={providerUsed || undefined}
                                  recommendationReason={providerUsed ? getProviderRecommendationText(providerUsed, scene.type) : undefined}
                                  darkMode
                                  compact
                                  styleRecommendedProviders={styleRecProviders}
                                  styleLabel={styleRecLabel}
                                />
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] text-right max-w-[260px]" style={{ color: msActiveMode === "i2v" || msActiveMode === "i2i" ? "rgb(192,132,252)" : "rgba(255,255,255,0.4)" }}>
                            {msModeInfo?.description || "Select a generation mode"}
                          </span>
                          <div className="mt-1">
                            <span className="text-[11px] font-medium text-white/50 block mb-1 text-right">Content Tag</span>
                            <div className="flex flex-wrap gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => { setContentTag(null); updateSceneMutation.mutate({ contentTag: null }); }}
                                className="text-[10px] px-2 py-0.5 rounded-full border transition-all"
                                style={{
                                  borderColor: contentTag === null ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.12)',
                                  backgroundColor: contentTag === null ? 'rgba(124,58,237,0.15)' : 'transparent',
                                  color: contentTag === null ? 'rgb(167,139,250)' : 'rgba(255,255,255,0.5)',
                                }}
                              >
                                None
                              </button>
                              {Object.values(SCENE_CONTENT_TAGS).map((tag) => (
                                <button
                                  key={tag.id}
                                  type="button"
                                  onClick={() => {
                                    const newTag = contentTag === tag.id ? null : tag.id;
                                    setContentTag(newTag);
                                    updateSceneMutation.mutate({ contentTag: newTag });
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded-full border transition-all"
                                  style={{
                                    borderColor: contentTag === tag.id ? `${tag.color}80` : 'rgba(255,255,255,0.12)',
                                    backgroundColor: contentTag === tag.id ? `${tag.color}20` : 'transparent',
                                    color: contentTag === tag.id ? tag.color : 'rgba(255,255,255,0.5)',
                                  }}
                                  title={tag.description}
                                >
                                  {tag.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Palette className="w-3 h-3 text-white/50" />
                          <span className="text-[11px] font-medium text-white/50">Art Style</span>
                          {pipelineAssignedStyle && sceneArtPreset === pipelineAssignedStyle && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ color: 'rgb(129,230,217)', background: 'rgba(129,230,217,0.1)', border: '1px solid rgba(129,230,217,0.2)' }}>Smart Mix</span>}
                          {pipelineAssignedStyle && sceneArtPreset !== pipelineAssignedStyle && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25">Overridden</span>}
                          {!pipelineAssignedStyle && sceneArtPreset !== 'project' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25">Override</span>}
                        </div>
                        <div className="flex gap-1.5 overflow-x-auto pb-1.5" style={{ scrollbarWidth: "thin" }}>
                          <button
                            type="button"
                            onClick={() => { setSceneArtPreset('project'); updateSceneMutation.mutate({ artPresetId: null }); }}
                            className="flex-shrink-0 w-[60px] rounded-lg border p-1 transition-all"
                            style={{
                              borderColor: sceneArtPreset === 'project' ? 'rgb(139,92,246)' : 'rgba(255,255,255,0.1)',
                              backgroundColor: sceneArtPreset === 'project' ? 'rgba(139,92,246,0.15)' : 'transparent',
                            }}
                          >
                            <div className="w-full h-8 rounded flex items-center justify-center mb-0.5" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))' }}>
                              <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                            </div>
                            <span className="text-[8px] font-medium block truncate text-white/70">Project</span>
                            {artPresetId && getVisualArtPreset(artPresetId) && (
                              <span className="text-[7px] block truncate text-white/40">
                                ({getVisualArtPreset(artPresetId)!.name})
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSceneArtPreset('auto'); updateSceneMutation.mutate({ artPresetId: 'auto' }); }}
                            className="flex-shrink-0 w-[60px] rounded-lg border p-1 transition-all"
                            style={{
                              borderColor: sceneArtPreset === 'auto' ? 'rgb(139,92,246)' : 'rgba(255,255,255,0.1)',
                              backgroundColor: sceneArtPreset === 'auto' ? 'rgba(139,92,246,0.15)' : 'transparent',
                            }}
                          >
                            <div className="w-full h-8 rounded flex items-center justify-center mb-0.5" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))' }}>
                              <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                            </div>
                            <span className="text-[8px] font-medium block truncate text-white/70">Auto</span>
                          </button>
                          {getAllVisualArtPresets().map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => { setSceneArtPreset(preset.id); updateSceneMutation.mutate({ artPresetId: preset.id }); }}
                              className="flex-shrink-0 w-[60px] rounded-lg border p-1 transition-all"
                              style={{
                                borderColor: sceneArtPreset === preset.id ? 'rgb(139,92,246)' : 'rgba(255,255,255,0.1)',
                                backgroundColor: sceneArtPreset === preset.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                              }}
                              title={preset.description}
                            >
                              {ART_PRESET_IMAGES[preset.id] ? (
                                <img src={ART_PRESET_IMAGES[preset.id]} alt={preset.name} className="w-full h-8 rounded object-cover mb-0.5" />
                              ) : (
                                <div className="w-full h-8 rounded mb-0.5" style={{ background: `linear-gradient(135deg, ${preset.thumbnailColors[0]}, ${preset.thumbnailColors[1]}, ${preset.thumbnailColors[2]})` }} />
                              )}
                              <span className="text-[8px] font-medium block truncate text-white/70">{preset.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        {(() => {
                          const msProv = (msModalProvider !== 'auto' ? msModalProvider : '').toLowerCase();
                          const msMultiRefName = msProv.startsWith('seedance-2') ? 'Seedance 2' : msProv.startsWith('kling-2') ? 'Kling 2.x' : null;
                          const msMaxImages = getMultiImageSupport(msModalProvider !== 'auto' ? msModalProvider : '')?.maxImages || 4;
                          if (msMultiRefName) {
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setMsModalShowMultiRefExpander(v => !v)}
                                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors"
                                  style={{
                                    borderColor: msModalShowMultiRefExpander ? 'rgba(124,58,237,0.45)' : 'rgba(255,255,255,0.12)',
                                    backgroundColor: msModalShowMultiRefExpander ? 'rgba(124,58,237,0.08)' : 'transparent',
                                  }}
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <ImagePlus className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgb(167,139,250)' }} />
                                    <span className="text-xs font-medium text-white/60">Additional reference images</span>
                                    {msModalRefImages.length > 0 && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 font-medium text-purple-300">
                                        {msModalRefImages.length}/{msMaxImages}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-white/30">@image_1, @image_2… — {msMultiRefName}</span>
                                  </div>
                                  {msModalShowMultiRefExpander
                                    ? <ChevronUp className="w-3.5 h-3.5 shrink-0 text-white/40" />
                                    : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-white/40" />}
                                </button>

                                {msModalShowMultiRefExpander && (
                                  <div className="mt-2 rounded-lg border p-3 space-y-2.5" style={{ borderColor: 'rgba(124,58,237,0.25)', backgroundColor: 'rgba(124,58,237,0.04)' }}>
                                    <div className="flex flex-wrap gap-2 items-start">
                                      {msModalRefImages.map((url, i) => (
                                        <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border group" style={{ borderColor: 'rgba(124,58,237,0.35)' }}>
                                          <img src={url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]" />
                                          <div className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-purple-600 text-white flex items-center justify-center text-[9px] font-bold pointer-events-none shadow-sm">
                                            {i + 1}
                                          </div>
                                          <div className="absolute bottom-0 left-0 right-0 text-[7px] text-center py-0.5 bg-black/60 text-white font-mono pointer-events-none">
                                            @image_{i + 1}
                                          </div>
                                          <button
                                            onClick={() => {
                                              const next = msModalRefImages.filter((_, idx) => idx !== i);
                                              setMsModalRefImages(next);
                                              if (fullscreenMicroScene !== null) persistMsRefImages(fullscreenMicroScene, next);
                                            }}
                                            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                          >
                                            <X className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                      ))}
                                      <div className="flex flex-col gap-1.5">
                                        <input type="file" ref={msModalFileRef} className="hidden" accept="image/*,video/*" onChange={handleMsModalRefUpload} />
                                        <button
                                          onClick={() => msModalFileRef.current?.click()}
                                          disabled={msModalRefImages.length >= msMaxImages}
                                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed text-[11px] transition-colors hover:border-purple-500/40 disabled:opacity-50"
                                          style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)' }}
                                        >
                                          <Upload className="w-3 h-3" />
                                          Upload{msModalRefImages.length > 0 ? ` (${msModalRefImages.length}/${msMaxImages})` : ''}
                                        </button>
                                        <button
                                          onClick={() => setMsModalShowLibrary(v => !v)}
                                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed text-[11px] transition-colors hover:border-purple-500/40"
                                          style={{
                                            borderColor: msModalShowLibrary ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.2)',
                                            color: msModalShowLibrary ? 'rgb(124,58,237)' : 'rgba(255,255,255,0.5)',
                                          }}
                                        >
                                          <FolderOpen className="w-3 h-3" />
                                          Library
                                        </button>
                                      </div>
                                    </div>

                                    {msModalShowLibrary && (
                                      <div className="border rounded-lg p-2 max-h-32 overflow-y-auto" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                                        {libraryQuery.isLoading ? (
                                          <div className="flex items-center justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-white/40" /></div>
                                        ) : !libraryQuery.data || libraryQuery.data.length === 0 ? (
                                          <p className="text-xs text-center py-3 text-white/30">No images in library</p>
                                        ) : (
                                          <div className="grid grid-cols-8 gap-1.5">
                                            {libraryQuery.data.slice(0, 24).map((asset: any) => {
                                              const assetUrl = asset.url || asset.thumbnailUrl;
                                              if (asset.type === 'video') return null;
                                              return (
                                                <button key={asset.id} onClick={() => { if (assetUrl) { setMsModalRefImages(prev => { const next = [...prev, assetUrl]; if (fullscreenMicroScene !== null) persistMsRefImages(fullscreenMicroScene, next); return next; }); setMsModalShowLibrary(false); toast({ title: 'Reference Added' }); } }} className="aspect-square rounded overflow-hidden border hover:border-purple-500/50 transition-colors" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                                                  <img src={asset.thumbnailUrl || assetUrl} alt={asset.name || ''} className="w-full h-full object-cover" />
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <p className="text-[10px] text-white/30">
                                      Use{' '}
                                      <code className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono text-[9px]">@image_1</code>,{' '}
                                      <code className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono text-[9px]">@image_2</code>{' '}
                                      etc. in your visual direction to anchor specific images.{' '}
                                      {msMultiRefName} supports up to {msMaxImages} reference images.
                                    </p>
                                  </div>
                                )}
                              </>
                            );
                          }
                          return (
                            <>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-medium text-white/50 flex items-center gap-1">
                                  <Image className="w-3 h-3" /> Reference Images
                                  <span className="text-[10px] text-white/30">For I2V (image-to-video)</span>
                                </span>
                              </div>
                              {msModalRefImages.length > 0 && (
                                <div className="mb-2 space-y-1.5">
                                  {msModalRefImages.map((url, i) => (
                                    <div key={i} className="relative rounded-lg overflow-hidden border group" style={{ borderColor: "rgba(124,58,237,0.3)" }}>
                                      <img src={url} alt={`Reference ${i + 1}`} className="w-full h-24 object-cover" />
                                      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent">
                                        <span className="text-[10px] text-white/70">Reference {i + 1}</span>
                                      </div>
                                      <button onClick={() => setMsModalRefImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <input type="file" ref={msModalFileRef} className="hidden" accept="image/*,video/*" onChange={handleMsModalRefUpload} />
                                <button onClick={() => msModalFileRef.current?.click()} className="flex-1 text-[11px] px-3 py-2 rounded-lg border border-dashed flex items-center justify-center gap-1.5 transition-colors hover:border-purple-500/40 hover:bg-purple-500/5" style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }} title="Upload reference image">
                                  <Upload className="w-3.5 h-3.5" />
                                  Upload Image
                                </button>
                                <button onClick={() => setMsModalShowLibrary(!msModalShowLibrary)} className="flex-1 text-[11px] px-3 py-2 rounded-lg border border-dashed flex items-center justify-center gap-1.5 transition-colors hover:border-purple-500/40 hover:bg-purple-500/5" style={{ borderColor: msModalShowLibrary ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.15)", color: msModalShowLibrary ? "rgb(124,58,237)" : "rgba(255,255,255,0.5)" }} title="Browse asset library">
                                  <FolderOpen className="w-3.5 h-3.5" />
                                  Library
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
                            </>
                          );
                        })()}
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
                        {regeneratingMicroScenes.has(fullscreenMicroScene) && msRegenStartedAt && (
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
                                sourceImageUrls: msModalRefImages.length > 1 ? msModalRefImages : undefined,
                              });
                            }}
                            disabled={regeneratingMicroScenes.has(fullscreenMicroScene)}
                            className={`text-xs px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                              regeneratingMicroScenes.has(fullscreenMicroScene)
                                ? 'bg-purple-600/50 text-white/70 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-500 text-white'
                            }`}
                          >
                            {regeneratingMicroScenes.has(fullscreenMicroScene) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            {regeneratingMicroScenes.has(fullscreenMicroScene) ? 'Generating...' : 'Regenerate Video'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                  <AskSuzziePanel
                    sceneContext={{
                      narration: fsMs.narration,
                      sceneType: scene.type,
                      artPresetId: effectiveArtPresetId || undefined,
                      artPresetName: activePreset?.name,
                      visualDirection: msModalPrompt,
                      provider: msModalProvider !== "auto" ? msModalProvider : undefined,
                      hasReferenceImage: referenceImageUrls.length > 0 || !!brandAssetUrl,
                    }}
                    onApplyVisualDirection={(prompt) => {
                      setMsModalPrompt(prompt);
                      setMsModalEditingPrompt(true);
                    }}
                    onApplyProvider={(providerId) => {
                      setMsModalProvider(providerId);
                    }}
                    onApplyArtStyle={(artStyleId) => {
                      setSceneArtPreset(artStyleId);
                      updateSceneMutation.mutate({ artPresetId: artStyleId });
                    }}
                    onApplyCfgScale={(val) => {
                      setMsModalImageFidelity(val);
                    }}
                    zIndex={10001}
                  />
                </div>
              );
            })()}
          </div>
        )}



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
          microScenes={(scene.microScenes || []).map((ms: any, i: number) => ({
            index: i,
            label: ms.prompt?.slice(0, 50) || ms.visualDirection?.slice(0, 50) || "",
            imageUrl: ms.imageUrl,
            videoUrl: ms.videoUrl,
            overlayItems: ms.overlayItems,
          }))}
          activeMicroSceneIndex={activeMsOverlayScope}
          onMicroSceneSelect={setActiveMsOverlayScope}
          onMicroSceneOverlayChange={handleMicroSceneOverlayChange}
          microSceneOverlays={msOverlayState}
          sceneDurationSec={scene.duration || 5}
          brandColors={brandColors}
          brand={brand}
          aspectRatio={aspectRatio}
          projectId={projectId}
          sceneId={sceneId}
          narration={editValues.narration || scene.narration || ""}
          sceneType={editValues.type || scene.type || "scene"}
        />

        {/* Character Profiles - visible only for 3D Illustration art style */}
        {(effectiveArtPresetId === '3d-illustration') && (
          <CharacterProfilesPanel
            projectId={projectId}
            characters={characters}
            onCharactersChange={onCharactersChange || (() => {})}
            narrationTextareaRef={narrationRef}
            onInsertCharacterName={(name) => {
              const ta = narrationRef.current;
              if (!ta) return;
              const start = ta.selectionStart;
              const end = ta.selectionEnd;
              const val = editValues.narration;
              const newVal = val.substring(0, start) + name + val.substring(end);
              setEditValues({ ...editValues, narration: newVal });
              setTimeout(() => {
                ta.focus();
                const newPos = start + name.length;
                ta.setSelectionRange(newPos, newPos);
              }, 0);
            }}
          />
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
                      generateNativeAudio: Boolean(scene.generateNativeAudio),
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
                  {updateSceneMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <span className="text-xs flex items-center gap-1 text-green-400 animate-in fade-in duration-300">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Saved
                  </span>
                )}
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:border-purple-500/30 flex items-center gap-1.5"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <AskSuzziePanel
        sceneContext={{
          narration: editValues.narration,
          sceneType: editValues.type,
          artPresetId: effectiveArtPresetId || undefined,
          artPresetName: activePreset?.name,
          visualDirection: editValues.visualDirection,
          provider: provider !== "auto" ? provider : undefined,
          hasReferenceImage: referenceImageUrls.length > 0 || !!brandAssetUrl,
        }}
        onApplyVisualDirection={(prompt) => {
          setEditValues(prev => ({ ...prev, visualDirection: prompt }));
          silentSaveMutation.mutate({ visualDirection: prompt });
        }}
        onApplyProvider={(providerId) => {
          setProvider(providerId);
        }}
        onApplyArtStyle={(artStyleId) => {
          setSceneArtPreset(artStyleId);
          silentSaveMutation.mutate({ artPresetId: artStyleId });
        }}
        onApplyCfgScale={(val) => {
          setSceneImageFidelity(val);
          silentSaveMutation.mutate({ imageFidelity: val });
        }}
      />
      <Dialog open={!!refLightboxUrl} onOpenChange={(open) => { if (!open) setRefLightboxUrl(null); }}>
        <DialogContent className="max-w-4xl p-2 bg-black/95 border-none">
          {refLightboxUrl && (
            <img
              src={refLightboxUrl}
              alt="Reference (full size)"
              className="w-full h-auto max-h-[85vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Task 56: prompt inspector drawer */}
      <PromptInspectorDrawer
        projectId={projectId}
        sceneId={sceneId}
        visualDirection={editValues.visualDirection}
        open={showPromptInspector}
        onClose={() => setShowPromptInspector(false)}
      />

      {/* Phase 20C: Provider mismatch confirmation (replaces window.confirm) */}
      <AlertDialog open={providerMismatchOpen} onOpenChange={setProviderMismatchOpen}>
        <AlertDialogContent data-testid="provider-mismatch-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Brand references won&apos;t be anchored
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This scene has{" "}
                  <span className="font-medium text-white">
                    {providerMismatchInfo?.referenceCount ?? 0} brand reference
                    {(providerMismatchInfo?.referenceCount ?? 0) === 1 ? "" : "s"}
                  </span>{" "}
                  attached, but the selected provider doesn&apos;t support{" "}
                  <code className="text-xs px-1 py-0.5 rounded bg-gray-800 text-gray-200">
                    omni_reference
                  </code>{" "}
                  brand anchoring.
                </p>
                <div className="rounded-md border border-gray-800 bg-gray-900/60 p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-400">Selected provider</span>
                    <span className="font-medium text-white truncate">
                      {providerMismatchInfo?.providerLabel || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-400">Anchors brand refs?</span>
                    <span className="font-medium text-red-300">No</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-400">Recommended</span>
                    <span className="font-medium text-emerald-300">Seedance 2</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  If you continue, your references will either be passed as a single generic
                  image or ignored entirely — the model may not preserve your label or
                  packaging frame-to-frame.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setProviderMismatchOpen(false)}
              data-testid="provider-mismatch-dismiss"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-gray-800 text-gray-200 hover:bg-gray-700"
              onClick={() => {
                setProviderMismatchOpen(false);
                regenVideoMutation.mutate();
              }}
              data-testid="provider-mismatch-generate-anyway"
            >
              Generate anyway
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                setProviderMismatchOpen(false);
                setProviderLockMutation.mutate(
                  { videoProviderLock: "seedance-2.0" },
                  {
                    onSuccess: () => {
                      regenVideoMutation.mutate();
                    },
                  },
                );
              }}
              data-testid="provider-mismatch-switch-and-generate"
            >
              Switch to Seedance 2 and generate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
