import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Upload, FolderOpen, Trash2, Loader2, X,
  Minus, Move, Maximize2, Eye, EyeOff, GripVertical,
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Layers,
  Type, Image as ImageIcon, Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  Shield, Sparkles, Check, AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type {
  MicroSceneOverlayItem,
  EntranceAnimation,
  SceneOverlayItem,
  ImageOverlayItem,
  TextOverlayItem,
  TextOverlayEnterAnimation,
  TextOverlayExitAnimation,
  TextEmphasisAnimation,
  TextPresetType,
} from "@shared/video-types";

export type { SceneOverlayItem };

type AnyOverlayItem = SceneOverlayItem | MicroSceneOverlayItem;

const ENTRANCE_ANIMATIONS: { id: EntranceAnimation; label: string }[] = [
  { id: "fade", label: "Fade" },
  { id: "rise", label: "Rise" },
  { id: "pop", label: "Pop" },
  { id: "drift", label: "Drift" },
];

const ENTER_ANIMATIONS: { id: TextOverlayEnterAnimation; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "rise", label: "Rise" },
  { id: "drop", label: "Drop" },
  { id: "wipe-left", label: "Wipe Left" },
  { id: "wipe-right", label: "Wipe Right" },
  { id: "scale-pop", label: "Scale Pop" },
  { id: "typewriter", label: "Typewriter" },
  { id: "blur-in", label: "Blur In" },
];

const EXIT_ANIMATIONS: { id: TextOverlayExitAnimation; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide-out", label: "Slide Out" },
  { id: "scale-down", label: "Scale Down" },
];

const EMPHASIS_ANIMATIONS: { id: TextEmphasisAnimation; label: string }[] = [
  { id: "none", label: "None" },
  { id: "pulse", label: "Pulse" },
  { id: "float", label: "Float" },
  { id: "shimmer", label: "Shimmer" },
];

interface TextPreset {
  label: string;
  presetType: TextOverlayItem['textPreset'];
  fontSize: number;
  fontWeight: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  backgroundColor?: string;
  backgroundOpacity?: number;
  textShadow: boolean;
  enterAnimation: TextOverlayEnterAnimation;
  exitAnimation: TextOverlayExitAnimation;
  defaultText: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

const TEXT_PRESETS: TextPreset[] = [
  {
    label: "Headline",
    presetType: "headline",
    fontSize: 72,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    textShadow: true,
    enterAnimation: "rise",
    exitAnimation: "fade",
    defaultText: "Big Headline",
    width: 50,
    height: 14,
    x: 25,
    y: 30,
  },
  {
    label: "Script Accent",
    presetType: "script-accent",
    fontSize: 36,
    fontWeight: "500",
    color: "#FFFFFF",
    textAlign: "center",
    textShadow: true,
    enterAnimation: "fade",
    exitAnimation: "fade",
    defaultText: "Emphasis Text",
    width: 40,
    height: 8,
    x: 30,
    y: 50,
  },
  {
    label: "Body",
    presetType: "body",
    fontSize: 24,
    fontWeight: "400",
    color: "#D1D5DB",
    textAlign: "left",
    textShadow: true,
    enterAnimation: "fade",
    exitAnimation: "fade",
    defaultText: "Body text paragraph for longer descriptions.",
    width: 45,
    height: 12,
    x: 10,
    y: 55,
  },
  {
    label: "Bullet List",
    presetType: "bullet-list",
    fontSize: 28,
    fontWeight: "500",
    color: "#FFFFFF",
    textAlign: "left",
    textShadow: true,
    enterAnimation: "rise",
    exitAnimation: "fade",
    defaultText: "Key Points",
    width: 35,
    height: 18,
    x: 10,
    y: 35,
  },
  {
    label: "Stat Callout",
    presetType: "stat-callout",
    fontSize: 56,
    fontWeight: "700",
    color: "#34D399",
    textAlign: "center",
    backgroundColor: "#000000",
    backgroundOpacity: 50,
    textShadow: false,
    enterAnimation: "scale-pop",
    exitAnimation: "scale-down",
    defaultText: "99%",
    width: 22,
    height: 12,
    x: 39,
    y: 35,
  },
  {
    label: "Lower Third",
    presetType: "lower-third",
    fontSize: 28,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "left",
    backgroundColor: "#000000",
    backgroundOpacity: 55,
    textShadow: false,
    enterAnimation: "wipe-left",
    exitAnimation: "fade",
    defaultText: "Lower Third Text",
    width: 40,
    height: 8,
    x: 5,
    y: 82,
  },
  {
    label: "CTA Badge",
    presetType: "cta-badge",
    fontSize: 32,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    backgroundColor: "#7C3AED",
    backgroundOpacity: 90,
    textShadow: false,
    enterAnimation: "scale-pop",
    exitAnimation: "fade",
    defaultText: "Get Started",
    width: 28,
    height: 8,
    x: 36,
    y: 78,
  },
  {
    label: "Caption Bar",
    presetType: "caption-bar",
    fontSize: 22,
    fontWeight: "400",
    color: "#E0E0E0",
    textAlign: "center",
    backgroundColor: "#000000",
    backgroundOpacity: 40,
    textShadow: false,
    enterAnimation: "fade",
    exitAnimation: "fade",
    defaultText: "Caption text goes here",
    width: 45,
    height: 6,
    x: 27,
    y: 88,
  },
];

const FONT_OPTIONS = [
  "Inter",
  "Arial",
  "Georgia",
  "Courier New",
  "Impact",
  "Verdana",
  "Trebuchet MS",
  "Palatino",
];

const DEFAULT_COLOR_SWATCHES = [
  "#FFFFFF", "#000000", "#FF0000", "#00FF00", "#0000FF",
  "#FACC15", "#F97316", "#EC4899", "#7C3AED", "#14B8A6",
];

interface MicroSceneOption {
  index: number;
  label: string;
  imageUrl?: string;
  videoUrl?: string;
  overlayItems?: MicroSceneOverlayItem[];
}

interface SafeZone {
  top: number;
  bottom: number;
  left: number;
  right: number;
  label: string;
}

function getSafeZones(aspectRatio: string): SafeZone[] {
  switch (aspectRatio) {
    case '9:16':
      return [
        { top: 0, left: 0, right: 100, bottom: 15, label: 'Top UI Zone (15%)' },
        { top: 80, left: 0, right: 100, bottom: 100, label: 'Bottom UI Zone (20%)' },
      ];
    case '1:1':
      return [
        { top: 0, left: 0, right: 100, bottom: 10, label: 'Top margin (10%)' },
        { top: 90, left: 0, right: 100, bottom: 100, label: 'Bottom margin (10%)' },
        { top: 10, left: 0, right: 5, bottom: 90, label: 'Left margin (5%)' },
        { top: 10, left: 95, right: 100, bottom: 90, label: 'Right margin (5%)' },
      ];
    default:
      return [
        { top: 0, left: 0, right: 100, bottom: 10, label: 'Top safe zone (10%)' },
        { top: 90, left: 0, right: 100, bottom: 100, label: 'Bottom safe zone (10%)' },
        { top: 10, left: 0, right: 5, bottom: 90, label: 'Left safe zone (5%)' },
        { top: 10, left: 95, right: 100, bottom: 90, label: 'Right safe zone (5%)' },
      ];
  }
}

function isOverlayInDangerZone(overlay: AnyOverlayItem, aspectRatio: string): boolean {
  const zones = getSafeZones(aspectRatio);
  const oLeft = overlay.x;
  const oTop = overlay.y;
  const oRight = overlay.x + overlay.width;
  const oBottom = overlay.y + overlay.height;

  for (const zone of zones) {
    const zLeft = zone.left;
    const zTop = zone.top;
    const zRight = zone.right;
    const zBottom = zone.bottom;

    if (oLeft < zRight && oRight > zLeft && oTop < zBottom && oBottom > zTop) {
      return true;
    }
  }
  return false;
}

const VALID_TEXT_PRESETS: TextPresetType[] = ['headline', 'script-accent', 'body', 'bullet-list', 'stat-callout', 'lower-third', 'cta-badge', 'caption-bar'];
const VALID_ENTER_ANIMATIONS: TextOverlayEnterAnimation[] = ['none', 'fade', 'rise', 'drop', 'wipe-left', 'wipe-right', 'scale-pop', 'typewriter', 'blur-in'];
const VALID_EXIT_ANIMATIONS: TextOverlayExitAnimation[] = ['none', 'fade', 'slide-out', 'scale-down'];

function toTextPreset(val: string | undefined): TextPresetType {
  if (val && VALID_TEXT_PRESETS.includes(val as TextPresetType)) return val as TextPresetType;
  return 'body';
}

function toEnterAnimation(val: string | undefined): TextOverlayEnterAnimation {
  if (val && VALID_ENTER_ANIMATIONS.includes(val as TextOverlayEnterAnimation)) return val as TextOverlayEnterAnimation;
  return 'fade';
}

function toExitAnimation(val: string | undefined): TextOverlayExitAnimation {
  if (val && VALID_EXIT_ANIMATIONS.includes(val as TextOverlayExitAnimation)) return val as TextOverlayExitAnimation;
  return 'fade';
}

interface AiSuggestion {
  type: 'text';
  id: string;
  name: string;
  text: string;
  textPreset: string;
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  locked: boolean;
  enterAnimation: string;
  exitAnimation: string;
  animationDuration: number;
  textShadow?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  bulletPoints?: string[];
  bulletDelay?: number;
  reason?: string;
}

interface SceneOverlayEditorProps {
  overlays: SceneOverlayItem[];
  onChange: (overlays: SceneOverlayItem[]) => void;
  previewWidth: number;
  previewHeight: number;
  backgroundUrl?: string;
  backgroundType?: "video" | "image";
  microScenes?: MicroSceneOption[];
  activeMicroSceneIndex?: number | null;
  onMicroSceneSelect?: (index: number | null) => void;
  onMicroSceneOverlayChange?: (msIdx: number, overlays: MicroSceneOverlayItem[]) => void;
  microSceneOverlays?: Record<number, MicroSceneOverlayItem[]>;
  sceneDurationSec?: number;
  brandColors?: string[];
  aspectRatio?: string;
  projectId?: string;
  sceneId?: string;
  narration?: string;
  sceneType?: string;
}

function generateId() {
  return `ovl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function isTextOverlay(o: AnyOverlayItem): o is TextOverlayItem {
  return 'type' in o && 'fontSize' in o;
}

function isImageOverlay(o: AnyOverlayItem): o is ImageOverlayItem {
  return !isTextOverlay(o);
}

export function SceneOverlayEditor({
  overlays,
  onChange,
  previewWidth,
  previewHeight,
  backgroundUrl,
  backgroundType,
  microScenes,
  activeMicroSceneIndex,
  onMicroSceneSelect,
  onMicroSceneOverlayChange,
  microSceneOverlays,
  sceneDurationSec,
  brandColors,
  aspectRatio = '16:9',
  projectId,
  sceneId,
  narration,
  sceneType,
}: SceneOverlayEditorProps) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showTextPresets, setShowTextPresets] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [resizing, setResizing] = useState<{
    id: string;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
    origFontSize?: number;
  } | null>(null);

  const isMicroSceneMode = activeMicroSceneIndex !== null && activeMicroSceneIndex !== undefined && activeMicroSceneIndex >= 0 && microScenes !== undefined && activeMicroSceneIndex < microScenes.length;
  const activeMs = isMicroSceneMode && microScenes ? microScenes[activeMicroSceneIndex!] : null;

  const currentOverlays: AnyOverlayItem[] = isMicroSceneMode
    ? (microSceneOverlays?.[activeMicroSceneIndex!] ?? activeMs?.overlayItems ?? [])
    : overlays;

  const currentBackgroundUrl = isMicroSceneMode && activeMs
    ? (activeMs.videoUrl || activeMs.imageUrl)
    : backgroundUrl;
  const currentBackgroundType = isMicroSceneMode && activeMs
    ? (activeMs.videoUrl ? "video" : activeMs.imageUrl ? "image" : undefined)
    : backgroundType;

  const handleCurrentChange = useCallback((newOverlays: AnyOverlayItem[]) => {
    if (isMicroSceneMode && onMicroSceneOverlayChange) {
      onMicroSceneOverlayChange(activeMicroSceneIndex!, newOverlays as MicroSceneOverlayItem[]);
    } else {
      onChange(newOverlays as SceneOverlayItem[]);
    }
  }, [isMicroSceneMode, activeMicroSceneIndex, onMicroSceneOverlayChange, onChange]);

  const libraryQuery = useQuery({
    queryKey: ["overlay-library-images"],
    queryFn: async () => {
      const res = await fetch("/api/asset-library?type=image", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.assets || [];
    },
    enabled: showLibrary,
  });

  const nextZIndex = useCallback(() => {
    if (currentOverlays.length === 0) return 1;
    return Math.max(...currentOverlays.map((o) => ('zIndex' in o ? o.zIndex : 0))) + 1;
  }, [currentOverlays]);

  const addImageOverlay = useCallback((url: string, name: string) => {
    if (isMicroSceneMode) {
      const newOverlay: MicroSceneOverlayItem = {
        id: generateId(),
        url,
        name,
        x: 5,
        y: 5,
        width: 15,
        height: 15,
        opacity: 100,
        locked: false,
        zIndex: nextZIndex(),
        entranceAnimation: "fade",
      };
      handleCurrentChange([...currentOverlays, newOverlay]);
      setSelectedId(newOverlay.id);
    } else {
      const newOverlay: ImageOverlayItem = {
        type: 'image',
        id: generateId(),
        url,
        name,
        x: 5,
        y: 5,
        width: 15,
        height: 15,
        opacity: 100,
        locked: false,
        layerOrder: currentOverlays.length,
      };
      handleCurrentChange([...currentOverlays, newOverlay]);
      setSelectedId(newOverlay.id);
    }
    setShowLibrary(false);
    setShowTextPresets(false);
  }, [currentOverlays, handleCurrentChange, isMicroSceneMode, nextZIndex]);

  const addTextOverlay = useCallback((preset: TextPreset) => {
    const newOverlay: TextOverlayItem = {
      type: 'text',
      id: generateId(),
      name: preset.label,
      text: preset.defaultText,
      textPreset: preset.presetType,
      x: preset.x,
      y: preset.y,
      width: preset.width,
      height: preset.height,
      opacity: 100,
      locked: false,
      fontSize: preset.fontSize,
      fontFamily: "Inter",
      fontWeight: preset.fontWeight,
      color: preset.color,
      textAlign: preset.textAlign,
      backgroundColor: preset.backgroundColor,
      backgroundOpacity: preset.backgroundOpacity,
      borderRadius: preset.backgroundColor ? 6 : 0,
      textShadow: preset.textShadow,
      enterAnimation: preset.enterAnimation,
      exitAnimation: preset.exitAnimation,
      animationDuration: 0.4,
      bulletPoints: preset.presetType === 'bullet-list' ? ['Point 1', 'Point 2', 'Point 3'] : undefined,
      bulletDelay: preset.presetType === 'bullet-list' ? 0.3 : undefined,
      layerOrder: currentOverlays.length,
    };
    handleCurrentChange([...currentOverlays, newOverlay]);
    setSelectedId(newOverlay.id);
    setShowTextPresets(false);
    setShowLibrary(false);
  }, [currentOverlays, handleCurrentChange]);

  const updateOverlay = useCallback((id: string, updates: Partial<AnyOverlayItem>) => {
    handleCurrentChange(currentOverlays.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  }, [currentOverlays, handleCurrentChange]);

  const removeOverlay = useCallback((id: string) => {
    handleCurrentChange(currentOverlays.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [currentOverlays, handleCurrentChange, selectedId]);

  const getZIndex = (o: AnyOverlayItem): number => ('zIndex' in o ? o.zIndex : 0);

  const moveLayerForward = useCallback((id: string) => {
    const sorted = [...currentOverlays].sort((a, b) => getZIndex(a) - getZIndex(b));
    const idx = sorted.findIndex((o) => o.id === id);
    if (idx < sorted.length - 1) {
      const swapA = sorted[idx];
      const swapB = sorted[idx + 1];
      handleCurrentChange(currentOverlays.map((o) => {
        if (o.id === swapA.id) return { ...o, zIndex: getZIndex(swapB) };
        if (o.id === swapB.id) return { ...o, zIndex: getZIndex(swapA) };
        return o;
      }));
    }
  }, [currentOverlays, handleCurrentChange]);

  const moveLayerBackward = useCallback((id: string) => {
    const sorted = [...currentOverlays].sort((a, b) => getZIndex(a) - getZIndex(b));
    const idx = sorted.findIndex((o) => o.id === id);
    if (idx > 0) {
      const swapA = sorted[idx];
      const swapB = sorted[idx - 1];
      handleCurrentChange(currentOverlays.map((o) => {
        if (o.id === swapA.id) return { ...o, zIndex: getZIndex(swapB) };
        if (o.id === swapB.id) return { ...o, zIndex: getZIndex(swapA) };
        return o;
      }));
    }
  }, [currentOverlays, handleCurrentChange]);

  const moveToFront = useCallback((id: string) => {
    const maxZ = Math.max(...currentOverlays.map(getZIndex));
    updateOverlay(id, { zIndex: maxZ + 1 });
  }, [currentOverlays, updateOverlay]);

  const moveToBack = useCallback((id: string) => {
    const minZ = Math.min(...currentOverlays.map(getZIndex));
    updateOverlay(id, { zIndex: minZ - 1 });
  }, [currentOverlays, updateOverlay]);

  const fetchAiSuggestions = useCallback(async () => {
    if (!projectId || !sceneId || !narration) {
      toast({ title: "Cannot generate suggestions", description: "Scene narration is required", variant: "destructive" });
      return;
    }
    setLoadingSuggestions(true);
    setShowSuggestions(true);
    try {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}/suggest-text-overlays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ narration, sceneType, brandColors }),
      });
      if (!res.ok) throw new Error('Failed to get suggestions');
      const data = await res.json();
      if (data.success && data.suggestions) {
        setAiSuggestions(data.suggestions);
      } else {
        throw new Error(data.error || 'No suggestions returned');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: "AI Suggestion Error", description: message, variant: "destructive" });
      setAiSuggestions(null);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [projectId, sceneId, narration, sceneType, brandColors, toast]);

  const acceptSuggestion = useCallback((suggestion: AiSuggestion) => {
    const overlay: TextOverlayItem = {
      type: 'text',
      id: generateId(),
      name: suggestion.name,
      text: suggestion.text,
      textPreset: toTextPreset(suggestion.textPreset),
      fontSize: suggestion.fontSize,
      fontFamily: suggestion.fontFamily || 'Inter',
      fontWeight: suggestion.fontWeight,
      color: suggestion.color,
      textAlign: suggestion.textAlign,
      x: suggestion.x,
      y: suggestion.y,
      width: suggestion.width,
      height: suggestion.height,
      opacity: suggestion.opacity,
      locked: false,
      enterAnimation: toEnterAnimation(suggestion.enterAnimation),
      exitAnimation: toExitAnimation(suggestion.exitAnimation),
      animationDuration: suggestion.animationDuration,
      textShadow: suggestion.textShadow,
      backgroundColor: suggestion.backgroundColor,
      backgroundOpacity: suggestion.backgroundOpacity,
      bulletPoints: suggestion.bulletPoints,
      bulletDelay: suggestion.bulletDelay,
      layerOrder: currentOverlays.length,
    };
    handleCurrentChange([...currentOverlays, overlay]);
    setSelectedId(overlay.id);
    setAiSuggestions(prev => prev?.filter(s => s.id !== suggestion.id) || null);
    toast({ title: "Overlay Added", description: `Added "${suggestion.name}" overlay` });
  }, [currentOverlays, handleCurrentChange, toast]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file", variant: "destructive" });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", file.name);
    formData.append("category", "overlay");

    try {
      const res = await fetch("/api/videos/uploads", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Upload failed");
      }
      const data = await res.json();
      const url = data.url;
      if (url) {
        addImageOverlay(url, file.name);
        toast({ title: "Overlay Added", description: file.name });
      } else {
        toast({ title: "Upload failed", description: "No URL returned", variant: "destructive" });
      }
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: (err as Error).message || "Unknown error", variant: "destructive" });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [addImageOverlay, toast]);

  const handleMouseDown = useCallback((e: React.MouseEvent, id: string, type: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    const overlay = currentOverlays.find((o) => o.id === id);
    if (!overlay || overlay.locked) return;

    setSelectedId(id);
    if (type === "move") {
      setDragging({
        id,
        startX: e.clientX,
        startY: e.clientY,
        origX: overlay.x,
        origY: overlay.y,
      });
    } else {
      setResizing({
        id,
        startX: e.clientX,
        startY: e.clientY,
        origW: overlay.width,
        origH: overlay.height,
        origFontSize: isTextOverlay(overlay) ? overlay.fontSize : undefined,
      });
    }
  }, [currentOverlays]);

  useEffect(() => {
    if (!dragging && !resizing) return;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const handleMouseMove = (e: MouseEvent) => {
      if (dragging) {
        const dx = ((e.clientX - dragging.startX) / rect.width) * 100;
        const dy = ((e.clientY - dragging.startY) / rect.height) * 100;
        const overlay = currentOverlays.find((o) => o.id === dragging.id);
        if (!overlay) return;
        const newX = Math.max(0, Math.min(100 - overlay.width, dragging.origX + dx));
        const newY = Math.max(0, Math.min(100 - overlay.height, dragging.origY + dy));
        const dragUpdates: Partial<AnyOverlayItem> = { x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 };
        if (isTextOverlay(overlay)) {
          (dragUpdates as Partial<TextOverlayItem>).snapPosition = 'custom';
        }
        updateOverlay(dragging.id, dragUpdates);
      }
      if (resizing) {
        const dx = ((e.clientX - resizing.startX) / rect.width) * 100;
        const dy = ((e.clientY - resizing.startY) / rect.height) * 100;
        const delta = Math.max(dx, dy);
        const newW = Math.max(3, Math.min(100, resizing.origW + delta));
        const newH = Math.max(3, Math.min(100, resizing.origH + delta));
        const updates: Partial<AnyOverlayItem> = {
          width: Math.round(newW * 10) / 10,
          height: Math.round(newH * 10) / 10,
        };
        if (resizing.origFontSize != null) {
          const scale = newW / resizing.origW;
          updates.fontSize = Math.max(12, Math.round(resizing.origFontSize * scale));
        }
        updateOverlay(resizing.id, updates);
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
      setResizing(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, resizing, currentOverlays, updateOverlay]);

  useEffect(() => {
    setSelectedId(null);
  }, [activeMicroSceneIndex]);

  const selectedOverlay = currentOverlays.find((o) => o.id === selectedId);
  const hasMicroScenes = microScenes && microScenes.length > 0;
  const isSelectedText = selectedOverlay && isTextOverlay(selectedOverlay);
  const selectedTextOverlay = isSelectedText ? (selectedOverlay as TextOverlayItem) : null;

  const hexToRgb = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '0, 0, 0';
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Move className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Scene Overlays
          </span>
          {currentOverlays.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25">
              {currentOverlays.length}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {!isMicroSceneMode && (
            <button
              onClick={() => { setShowTextPresets(!showTextPresets); setShowLibrary(false); }}
              className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors hover:border-purple-500/40 hover:bg-purple-500/10"
              style={{
                borderColor: showTextPresets ? "rgba(124,58,237,0.4)" : "var(--border-subtle)",
                color: showTextPresets ? "rgb(124,58,237)" : "var(--text-secondary)",
                backgroundColor: showTextPresets ? "rgba(124,58,237,0.1)" : "transparent",
              }}
              title="Add text overlay"
            >
              <Type className="w-3.5 h-3.5" /> Add Text
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors hover:border-purple-500/40 hover:bg-purple-500/10"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
            title="Upload overlay image"
          >
            <Upload className="w-3.5 h-3.5" /> Image
          </button>
          <button
            onClick={() => { setShowLibrary(!showLibrary); setShowTextPresets(false); }}
            className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors hover:border-purple-500/40 hover:bg-purple-500/10"
            style={{
              borderColor: showLibrary ? "rgba(124,58,237,0.4)" : "var(--border-subtle)",
              color: showLibrary ? "rgb(124,58,237)" : "var(--text-secondary)",
              backgroundColor: showLibrary ? "rgba(124,58,237,0.1)" : "transparent",
            }}
            title="Browse asset library"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Library
          </button>
          <button
            onClick={() => setShowSafeZones(!showSafeZones)}
            className="text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1 transition-colors"
            style={{
              borderColor: showSafeZones ? "rgba(245,158,11,0.5)" : "var(--border-subtle)",
              color: showSafeZones ? "rgb(245,158,11)" : "var(--text-secondary)",
              backgroundColor: showSafeZones ? "rgba(245,158,11,0.1)" : "transparent",
            }}
            title="Show safe zones"
          >
            <Shield className="w-3.5 h-3.5" />
          </button>
          {!isMicroSceneMode && narration && projectId && sceneId && (
            <button
              onClick={fetchAiSuggestions}
              disabled={loadingSuggestions}
              className="text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10"
              style={{
                borderColor: showSuggestions ? "rgba(16,185,129,0.5)" : "var(--border-subtle)",
                color: showSuggestions ? "rgb(16,185,129)" : "var(--text-secondary)",
                backgroundColor: showSuggestions ? "rgba(16,185,129,0.1)" : "transparent",
              }}
              title="AI-suggest text overlays"
            >
              {loadingSuggestions ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {hasMicroScenes && onMicroSceneSelect && (
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
          <select
            value={activeMicroSceneIndex === null || activeMicroSceneIndex === undefined ? "scene" : String(activeMicroSceneIndex)}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "scene") {
                onMicroSceneSelect(null);
              } else {
                onMicroSceneSelect(parseInt(val, 10));
              }
              setSelectedId(null);
            }}
            className="text-xs rounded-lg border px-2.5 py-1.5 bg-transparent outline-none cursor-pointer flex-1 appearance-none"
            style={{
              borderColor: isMicroSceneMode ? "rgba(124,58,237,0.4)" : "var(--border-subtle)",
              color: "var(--text-primary)",
              backgroundColor: isMicroSceneMode ? "rgba(124,58,237,0.06)" : "transparent",
            }}
          >
            <option value="scene">Full Scene</option>
            {microScenes!.map((ms, i) => (
              <option key={i} value={String(i)}>
                Micro-Scene {i + 1}{ms.label ? ` — ${ms.label.slice(0, 40)}` : ""}
                {(microSceneOverlays?.[i] ?? ms.overlayItems ?? []).length > 0
                  ? ` (${(microSceneOverlays?.[i] ?? ms.overlayItems ?? []).length} overlay${(microSceneOverlays?.[i] ?? ms.overlayItems ?? []).length !== 1 ? "s" : ""})`
                  : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {showTextPresets && (
        <div className="border rounded-lg p-2.5" style={{ borderColor: "rgba(124,58,237,0.3)", backgroundColor: "rgba(124,58,237,0.03)" }}>
          <p className="text-[10px] mb-2 uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
            Text Presets
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {TEXT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => addTextOverlay(preset)}
                className="text-left p-2 rounded-lg border transition-all hover:border-purple-500/50 hover:bg-purple-500/10 group"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div
                  className="text-xs font-medium mb-0.5 truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {preset.label}
                </div>
                <div
                  className="text-[9px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {preset.fontSize}px · {preset.enterAnimation}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showSuggestions && (
        <div className="border rounded-lg p-2.5" style={{ borderColor: "rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.03)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider font-medium flex items-center gap-1" style={{ color: "rgb(16,185,129)" }}>
              <Sparkles className="w-3 h-3" /> AI Suggestions
            </p>
            <button onClick={() => { setShowSuggestions(false); setAiSuggestions(null); }} className="text-[10px] p-0.5 rounded hover:bg-white/10">
              <X className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
            </button>
          </div>
          {loadingSuggestions ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "rgb(16,185,129)" }} />
              <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>Analyzing scene...</span>
            </div>
          ) : aiSuggestions && aiSuggestions.length > 0 ? (
            <div className="space-y-2">
              {aiSuggestions.map((sug) => (
                <div
                  key={sug.id}
                  className="border rounded-lg p-2 transition-colors hover:border-emerald-500/40"
                  style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.2)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                          {sug.textPreset}
                        </span>
                      </div>
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {sug.text}
                      </p>
                      {sug.bulletPoints && sug.bulletPoints.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {sug.bulletPoints.map((bp, i) => (
                            <p key={i} className="text-[10px] pl-2" style={{ color: "var(--text-muted)" }}>
                              - {bp}
                            </p>
                          ))}
                        </div>
                      )}
                      {sug.reason && (
                        <p className="text-[9px] mt-1 italic" style={{ color: "var(--text-muted)" }}>{sug.reason}</p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => acceptSuggestion(sug)}
                        className="p-1 rounded border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        title="Accept"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setAiSuggestions(prev => prev?.filter(s => s.id !== sug.id) || null)}
                        className="p-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                        title="Reject"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : aiSuggestions !== null ? (
            <p className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>No suggestions available.</p>
          ) : null}
        </div>
      )}

      {showLibrary && (
        <div className="border rounded-lg p-2 max-h-40 overflow-y-auto" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
          {libraryQuery.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />
            </div>
          ) : !libraryQuery.data || libraryQuery.data.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>No images in library. Upload one above.</p>
          ) : (
            <div className="grid grid-cols-6 gap-1.5">
              {libraryQuery.data.slice(0, 24).map((asset: { id: string; url?: string; thumbnailUrl?: string; name?: string }) => (
                <button
                  key={asset.id}
                  onClick={() => {
                    const url = asset.url || asset.thumbnailUrl;
                    if (url) addImageOverlay(url, asset.name || "Overlay");
                  }}
                  className="aspect-square rounded overflow-hidden border hover:border-purple-500/50 transition-all hover:ring-2 hover:ring-purple-500/30"
                  style={{ borderColor: "var(--border-subtle)" }}
                  title={asset.name || "Select"}
                >
                  <img src={asset.url || asset.thumbnailUrl} alt={asset.name || ""} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* WYSIWYG Canvas Preview */}
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border cursor-crosshair select-none"
        style={{
          borderColor: currentOverlays.length > 0 ? "rgba(124,58,237,0.3)" : "var(--border-subtle)",
          backgroundColor: "rgba(0,0,0,0.4)",
          aspectRatio: `${previewWidth} / ${previewHeight}`,
        }}
        onClick={() => setSelectedId(null)}
      >
        {currentBackgroundUrl && currentBackgroundType === "image" && (
          <img src={currentBackgroundUrl} alt="" className="w-full h-full object-contain absolute inset-0" />
        )}
        {currentBackgroundUrl && currentBackgroundType === "video" && (
          <video src={currentBackgroundUrl} className="w-full h-full object-contain absolute inset-0" muted />
        )}
        {showSafeZones && getSafeZones(aspectRatio).map((zone, idx) => {
          const zoneStyle: React.CSSProperties = {
            position: 'absolute',
            left: `${zone.left}%`,
            top: `${zone.top}%`,
            width: `${zone.right - zone.left}%`,
            height: `${zone.bottom - zone.top}%`,
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px dashed rgba(245, 158, 11, 0.5)',
            zIndex: 5,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          };
          return (
            <div key={idx} style={zoneStyle}>
              <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/30 text-amber-300 whitespace-nowrap">
                {zone.label}
              </span>
            </div>
          );
        })}
        {currentOverlays.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center bg-black/40 rounded-lg px-4 py-3 backdrop-blur-sm">
              <Move className="w-5 h-5 mx-auto mb-1" style={{ color: "var(--text-muted)" }} />
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Add a text or image overlay to position it on {isMicroSceneMode ? `Micro-Scene ${activeMicroSceneIndex! + 1}` : "this scene"}
              </p>
            </div>
          </div>
        )}

        {[...currentOverlays].sort((a, b) => (a.layerOrder ?? 0) - (b.layerOrder ?? 0)).map((overlay, sortedIdx) => {
          const isText = isTextOverlay(overlay);
          const textOvl = isText ? (overlay as TextOverlayItem) : null;
          const inDangerZone = isText && isOverlayInDangerZone(overlay, aspectRatio);

          return (
            <div
              key={overlay.id}
              className={`absolute group ${overlay.locked ? "pointer-events-none" : "cursor-move"}`}
              style={{
                left: `${overlay.x}%`,
                top: `${overlay.y}%`,
                width: `${overlay.width}%`,
                height: `${overlay.height}%`,
                opacity: overlay.opacity / 100,
                zIndex: selectedId === overlay.id ? 100 : (10 + sortedIdx),
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(overlay.id);
              }}
              onMouseDown={(e) => handleMouseDown(e, overlay.id, "move")}
            >
              {isText && textOvl ? (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: textOvl.textAlign === 'left' ? 'flex-start' : textOvl.textAlign === 'right' ? 'flex-end' : 'center',
                    backgroundColor: textOvl.backgroundColor && textOvl.backgroundOpacity
                      ? `rgba(${hexToRgb(textOvl.backgroundColor)}, ${(textOvl.backgroundOpacity ?? 0) / 100})`
                      : undefined,
                    borderRadius: textOvl.borderRadius ?? 0,
                    padding: '2%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      fontSize: `clamp(8px, ${textOvl.fontSize * 0.35}px, ${textOvl.fontSize * 0.5}px)`,
                      fontFamily: textOvl.fontFamily || 'Inter, sans-serif',
                      fontWeight: textOvl.fontWeight || '600',
                      color: textOvl.color || '#FFFFFF',
                      textAlign: textOvl.textAlign || 'center',
                      textShadow: textOvl.textShadow ? '1px 1px 3px rgba(0,0,0,0.7)' : undefined,
                      width: '100%',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      lineHeight: textOvl.lineHeight ?? 1.3,
                      letterSpacing: textOvl.letterSpacing != null ? `${textOvl.letterSpacing * 0.5}px` : undefined,
                      overflow: 'hidden',
                    }}
                  >
                    {textOvl.text || 'Text'}
                  </div>
                </div>
              ) : (
                <img
                  src={(overlay as ImageOverlayItem).url}
                  alt={(overlay as ImageOverlayItem).name}
                  className="w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
              )}
              {inDangerZone && selectedId !== overlay.id && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                  <AlertTriangle className="w-4 h-4 text-amber-400 drop-shadow-md" />
                </div>
              )}
              {selectedId === overlay.id && !overlay.locked && (
                <>
                  <div
                    className="absolute inset-0 border-2 rounded pointer-events-none"
                    style={{
                      borderColor: inDangerZone ? 'rgb(245, 158, 11)' : isText ? 'rgb(59, 130, 246)' : 'rgb(124, 58, 237)',
                      boxShadow: inDangerZone ? "0 0 8px rgba(245,158,11,0.4)" : "0 0 0 1px rgba(0,0,0,0.3)",
                    }}
                  />
                  <div
                    className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full cursor-se-resize border-2 border-white shadow-lg z-30"
                    style={{ backgroundColor: isText ? 'rgb(59, 130, 246)' : 'rgb(124, 58, 237)' }}
                    onMouseDown={(e) => handleMouseDown(e, overlay.id, "resize")}
                  />
                  <button
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg z-30 hover:bg-red-400 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeOverlay(overlay.id);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {currentOverlays.length > 0 && (
          <div className="absolute bottom-1 left-1 right-1 flex gap-1 flex-wrap z-30 pointer-events-none">
            {currentOverlays.map((overlay) => {
              const layerDanger = isTextOverlay(overlay) && isOverlayInDangerZone(overlay, aspectRatio);
              return (
                <span
                  key={overlay.id}
                  className={`text-[9px] px-1.5 py-0.5 rounded-full pointer-events-auto cursor-pointer transition-all flex items-center gap-1 ${
                    layerDanger
                      ? "bg-amber-500/80 text-white"
                      : selectedId === overlay.id
                        ? isTextOverlay(overlay) ? "bg-blue-500 text-white" : "bg-purple-500 text-white"
                        : "bg-black/50 text-white/70 hover:bg-black/70"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(overlay.id);
                  }}
                >
                  {layerDanger && <AlertTriangle className="w-2.5 h-2.5" />}
                  {isTextOverlay(overlay) ? <Type className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
                  {overlay.name.length > 12 ? overlay.name.slice(0, 12) + "..." : overlay.name}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {currentOverlays.length > 0 && (() => {
        const sceneTotal = sceneDurationSec ?? 10;
        const textOverlays = currentOverlays.filter(isTextOverlay);
        const imageOverlays = currentOverlays.filter(isImageOverlay);
        const allTimed = [
          ...textOverlays.map((o) => ({
            id: o.id,
            name: o.name,
            start: o.timingStart ?? 0,
            duration: o.timingDuration ?? sceneTotal,
            isText: true,
          })),
          ...imageOverlays.map((o) => ({
            id: o.id,
            name: o.name,
            start: 0,
            duration: sceneTotal,
            isText: false,
          })),
        ];
        if (allTimed.length === 0) return null;
        return (
          <div className="border rounded-lg p-2" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
            <p className="text-[10px] mb-1 uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
              Timeline ({sceneTotal.toFixed(0)}s)
            </p>
            <div className="space-y-1">
              {allTimed.map((item) => {
                const startPct = Math.min((item.start / sceneTotal) * 100, 100);
                const widthPct = Math.min((item.duration / sceneTotal) * 100, 100 - startPct);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-1.5 cursor-pointer ${selectedId === item.id ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="text-[9px] w-16 truncate flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                      {item.name}
                    </span>
                    <div
                      className="flex-1 h-2.5 rounded-sm relative overflow-hidden"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                    >
                      <div
                        className="absolute top-0 h-full rounded-sm"
                        style={{
                          left: `${startPct}%`,
                          width: `${Math.max(widthPct, 1)}%`,
                          backgroundColor: item.isText ? "rgba(59,130,246,0.5)" : "rgba(124,58,237,0.5)",
                          border: `1px solid ${item.isText ? "rgba(59,130,246,0.7)" : "rgba(124,58,237,0.7)"}`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[8px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              <span>0s</span>
              <span>{(sceneTotal / 2).toFixed(0)}s</span>
              <span>{sceneTotal.toFixed(0)}s</span>
            </div>
          </div>
        );
      })()}

      {selectedOverlay && (
        <div
          className="border rounded-lg p-3 space-y-3"
          style={{
            borderColor: isSelectedText ? "rgba(59,130,246,0.3)" : "rgba(124,58,237,0.3)",
            backgroundColor: isSelectedText ? "rgba(59,130,246,0.03)" : "rgba(124,58,237,0.03)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isSelectedText ? <Type className="w-3.5 h-3.5 text-blue-400" /> : <ImageIcon className="w-3.5 h-3.5 text-purple-400" />}
              <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                {selectedOverlay.name}
              </span>
            </div>
            <button
              onClick={() => removeOverlay(selectedOverlay.id)}
              className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>

          {/* Text-specific controls */}
          {selectedTextOverlay && (
            <>
              <div>
                <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Text Content</label>
                <textarea
                  value={selectedTextOverlay.text}
                  onChange={(e) => updateOverlay(selectedOverlay.id, { text: e.target.value })}
                  rows={2}
                  className="w-full text-xs rounded border px-2 py-1.5 bg-transparent outline-none resize-none"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  placeholder="Enter your text..."
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Font Size</label>
                  <input
                    type="number"
                    min={12}
                    max={120}
                    value={selectedTextOverlay.fontSize}
                    onChange={(e) => updateOverlay(selectedOverlay.id, { fontSize: parseInt(e.target.value) || 32 })}
                    className="w-full text-xs rounded border px-2 py-1 bg-transparent outline-none"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Weight</label>
                  <select
                    value={selectedTextOverlay.fontWeight}
                    onChange={(e) => updateOverlay(selectedOverlay.id, { fontWeight: e.target.value })}
                    className="w-full text-xs rounded border px-2 py-1 bg-transparent outline-none cursor-pointer"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  >
                    <option value="300">Light</option>
                    <option value="400">Regular</option>
                    <option value="500">Medium</option>
                    <option value="600">Semi-Bold</option>
                    <option value="700">Bold</option>
                    <option value="800">Extra Bold</option>
                    <option value="900">Black</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Font</label>
                  <select
                    value={selectedTextOverlay.fontFamily}
                    onChange={(e) => updateOverlay(selectedOverlay.id, { fontFamily: e.target.value })}
                    className="w-full text-xs rounded border px-2 py-1 bg-transparent outline-none cursor-pointer"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Text Color</label>
                  <div className="flex gap-1 items-center">
                    <input
                      type="color"
                      value={selectedTextOverlay.color}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { color: e.target.value })}
                      className="w-6 h-6 rounded border cursor-pointer"
                      style={{ borderColor: "var(--border-subtle)" }}
                    />
                    <div className="flex gap-0.5">
                      {(brandColors && brandColors.length > 0 ? brandColors : DEFAULT_COLOR_SWATCHES).slice(0, 5).map((c) => (
                        <button
                          key={c}
                          onClick={() => updateOverlay(selectedOverlay.id, { color: c })}
                          className="w-4 h-4 rounded-full border transition-transform hover:scale-125"
                          style={{
                            backgroundColor: c,
                            borderColor: selectedTextOverlay.color === c ? "rgb(59,130,246)" : "rgba(255,255,255,0.2)",
                            borderWidth: selectedTextOverlay.color === c ? 2 : 1,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Alignment</label>
                  <div className="flex gap-0.5">
                    {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([align, Icon]) => (
                      <button
                        key={align}
                        onClick={() => updateOverlay(selectedOverlay.id, { textAlign: align })}
                        className="p-1 rounded border transition-colors"
                        style={{
                          borderColor: selectedTextOverlay.textAlign === align ? "rgba(59,130,246,0.5)" : "var(--border-subtle)",
                          color: selectedTextOverlay.textAlign === align ? "rgb(59,130,246)" : "var(--text-secondary)",
                          backgroundColor: selectedTextOverlay.textAlign === align ? "rgba(59,130,246,0.1)" : "transparent",
                        }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <label className="text-[10px] flex items-center gap-1 cursor-pointer" style={{ color: "var(--text-muted)" }}>
                    <input
                      type="checkbox"
                      checked={selectedTextOverlay.textShadow ?? true}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { textShadow: e.target.checked })}
                      className="rounded"
                    />
                    Shadow
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Background Color</label>
                  <div className="flex gap-1 items-center">
                    <input
                      type="color"
                      value={selectedTextOverlay.backgroundColor || "#000000"}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { backgroundColor: e.target.value })}
                      className="w-6 h-6 rounded border cursor-pointer"
                      style={{ borderColor: "var(--border-subtle)" }}
                    />
                    <button
                      onClick={() => updateOverlay(selectedOverlay.id, { backgroundColor: undefined, backgroundOpacity: 0 })}
                      className="text-[9px] px-1.5 py-0.5 rounded border transition-colors"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                    >
                      None
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>
                    BG Opacity: {selectedTextOverlay.backgroundOpacity ?? 0}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={selectedTextOverlay.backgroundOpacity ?? 0}
                    onChange={(e) => updateOverlay(selectedOverlay.id, { backgroundOpacity: parseInt(e.target.value) })}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: "rgb(59,130,246)" }}
                  />
                </div>
              </div>

              <div className="border-t pt-2" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] flex items-center gap-1 cursor-pointer" style={{ color: "var(--text-muted)" }}>
                    <input
                      type="checkbox"
                      checked={selectedTextOverlay.autoBackground ?? false}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { autoBackground: e.target.checked })}
                      className="rounded"
                    />
                    Smart Contrast Background
                  </label>
                </div>
                {selectedTextOverlay.autoBackground && (
                  <div>
                    <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>
                      Contrast Opacity: {selectedTextOverlay.autoBackgroundOpacity ?? 50}%
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      value={selectedTextOverlay.autoBackgroundOpacity ?? 50}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { autoBackgroundOpacity: parseInt(e.target.value) })}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: "rgb(59,130,246)" }}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Enter Animation</label>
                  <select
                    value={selectedTextOverlay.enterAnimation}
                    onChange={(e) => updateOverlay(selectedOverlay.id, { enterAnimation: e.target.value as TextOverlayEnterAnimation })}
                    className="w-full text-xs rounded border px-2 py-1 bg-transparent outline-none cursor-pointer"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  >
                    {ENTER_ANIMATIONS.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Exit Animation</label>
                  <select
                    value={selectedTextOverlay.exitAnimation}
                    onChange={(e) => updateOverlay(selectedOverlay.id, { exitAnimation: e.target.value as TextOverlayExitAnimation })}
                    className="w-full text-xs rounded border px-2 py-1 bg-transparent outline-none cursor-pointer"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  >
                    {EXIT_ANIMATIONS.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>
                  Animation Duration: {(selectedTextOverlay.animationDuration ?? 0.4).toFixed(1)}s
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={2}
                  step={0.1}
                  value={selectedTextOverlay.animationDuration ?? 0.4}
                  onChange={(e) => updateOverlay(selectedOverlay.id, { animationDuration: parseFloat(e.target.value) })}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: "rgb(59,130,246)" }}
                />
              </div>

              <div>
                <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Emphasis Animation</label>
                <select
                  value={selectedTextOverlay.emphasisAnimation ?? 'none'}
                  onChange={(e) => updateOverlay(selectedOverlay.id, { emphasisAnimation: e.target.value as TextEmphasisAnimation })}
                  className="w-full text-xs rounded border px-2 py-1 bg-transparent outline-none cursor-pointer"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                >
                  {EMPHASIS_ANIMATIONS.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>
                    Start Time: {(selectedTextOverlay.timingStart ?? 0).toFixed(1)}s
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={0.1}
                    value={selectedTextOverlay.timingStart ?? 0}
                    onChange={(e) => updateOverlay(selectedOverlay.id, { timingStart: parseFloat(e.target.value) })}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: "rgb(59,130,246)" }}
                  />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>
                    Duration: {selectedTextOverlay.timingDuration != null ? `${selectedTextOverlay.timingDuration.toFixed(1)}s` : "Full Scene"}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0.5}
                      max={sceneDurationSec ?? 30}
                      step={0.1}
                      value={selectedTextOverlay.timingDuration ?? (sceneDurationSec ?? 10)}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { timingDuration: parseFloat(e.target.value) })}
                      className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: "rgb(59,130,246)" }}
                    />
                    <button
                      onClick={() => updateOverlay(selectedOverlay.id, { timingDuration: undefined })}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors flex-shrink-0 ${
                        selectedTextOverlay.timingDuration == null
                          ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                          : 'hover:border-blue-500/40 hover:bg-blue-500/10'
                      }`}
                      style={{
                        borderColor: selectedTextOverlay.timingDuration == null ? undefined : "var(--border-subtle)",
                        color: selectedTextOverlay.timingDuration == null ? undefined : "var(--text-muted)",
                      }}
                      title="Reset to full scene duration"
                    >
                      Full
                    </button>
                  </div>
                </div>
              </div>

              {(() => {
                const sceneTotal = sceneDurationSec ?? 10;
                const start = selectedTextOverlay.timingStart ?? 0;
                const dur = selectedTextOverlay.timingDuration ?? sceneTotal;
                const startPct = Math.min((start / sceneTotal) * 100, 100);
                const widthPct = Math.min((dur / sceneTotal) * 100, 100 - startPct);
                return (
                  <div>
                    <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Timing Bar</label>
                    <div
                      className="w-full h-3 rounded-full relative overflow-hidden"
                      style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                    >
                      <div
                        className="absolute top-0 h-full rounded-full"
                        style={{
                          left: `${startPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: "rgba(59,130,246,0.5)",
                          border: "1px solid rgba(59,130,246,0.8)",
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      <span>0s</span>
                      <span>{start.toFixed(1)}s – {(start + dur).toFixed(1)}s</span>
                      <span>{sceneTotal.toFixed(0)}s</span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>Bullet Points</label>
                  <button
                    onClick={() => {
                      const current = selectedTextOverlay.bulletPoints || [];
                      updateOverlay(selectedOverlay.id, { bulletPoints: [...current, `Point ${current.length + 1}`] });
                    }}
                    className="text-[9px] px-1.5 py-0.5 rounded border transition-colors hover:border-blue-500/40 hover:bg-blue-500/10"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                  >
                    <Plus className="w-2.5 h-2.5 inline mr-0.5" />Add
                  </button>
                </div>
                {(selectedTextOverlay.bulletPoints || []).map((bp, idx) => (
                  <div key={idx} className="flex items-center gap-1 mb-1">
                    <span className="text-[9px] w-3 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>{idx + 1}.</span>
                    <input
                      type="text"
                      value={bp}
                      onChange={(e) => {
                        const newBullets = [...(selectedTextOverlay.bulletPoints || [])];
                        newBullets[idx] = e.target.value;
                        updateOverlay(selectedOverlay.id, { bulletPoints: newBullets });
                      }}
                      className="flex-1 text-[10px] rounded border px-1.5 py-0.5 bg-transparent outline-none"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                    />
                    <button
                      onClick={() => {
                        const newBullets = (selectedTextOverlay.bulletPoints || []).filter((_, i) => i !== idx);
                        updateOverlay(selectedOverlay.id, { bulletPoints: newBullets.length > 0 ? newBullets : undefined });
                      }}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {(selectedTextOverlay.bulletPoints?.length ?? 0) > 0 && (
                  <div className="mt-1">
                    <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>
                      Stagger Delay: {(selectedTextOverlay.bulletDelay ?? 0.3).toFixed(1)}s
                    </label>
                    <input
                      type="range"
                      min={0.1}
                      max={2}
                      step={0.1}
                      value={selectedTextOverlay.bulletDelay ?? 0.3}
                      onChange={(e) => updateOverlay(selectedOverlay.id, { bulletDelay: parseFloat(e.target.value) })}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: "rgb(59,130,246)" }}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Common position/size controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>X Position (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={selectedOverlay.x}
                onChange={(e) => updateOverlay(selectedOverlay.id, { x: parseFloat(e.target.value) || 0 })}
                className="w-full text-xs rounded border px-2 py-1 bg-transparent outline-none"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Y Position (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={selectedOverlay.y}
                onChange={(e) => updateOverlay(selectedOverlay.id, { y: parseFloat(e.target.value) || 0 })}
                className="w-full text-xs rounded border px-2 py-1 bg-transparent outline-none"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Width (%)</label>
              <input
                type="number"
                min={3}
                max={100}
                step={0.5}
                value={selectedOverlay.width}
                onChange={(e) => updateOverlay(selectedOverlay.id, { width: parseFloat(e.target.value) || 10 })}
                className="w-full text-xs rounded border px-2 py-1 bg-transparent outline-none"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Height (%)</label>
              <input
                type="number"
                min={3}
                max={100}
                step={0.5}
                value={selectedOverlay.height}
                onChange={(e) => updateOverlay(selectedOverlay.id, { height: parseFloat(e.target.value) || 10 })}
                className="w-full text-xs rounded border px-2 py-1 bg-transparent outline-none"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
          </div>
          {isSelectedText && selectedTextOverlay && (
            <button
              onClick={() => {
                const text = selectedTextOverlay.text || '';
                const fontSize = selectedTextOverlay.fontSize || 24;
                const charWidth = fontSize * 0.55;
                const lineHeight = (selectedTextOverlay.lineHeight ?? 1.3) * fontSize;
                const renderWidth = 1920;
                const renderHeight = (() => {
                  const parts = (aspectRatio || '16:9').split(':');
                  const w = parseInt(parts[0]) || 16;
                  const h = parseInt(parts[1]) || 9;
                  return Math.round(renderWidth * h / w);
                })();
                const bulletCount = selectedTextOverlay.bulletPoints?.length || 0;
                const longestLine = text.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
                const bulletMaxLen = selectedTextOverlay.bulletPoints?.reduce((max, bp) => Math.max(max, bp.length), 0) || 0;
                const maxChars = Math.max(longestLine, bulletMaxLen);
                const textWidthPx = maxChars * charWidth + fontSize * 2;
                const lineCount = text.split('\n').length + bulletCount;
                const textHeightPx = lineCount * lineHeight + fontSize * 1.5;
                const newWidth = Math.min(90, Math.max(8, (textWidthPx / renderWidth) * 100));
                const newHeight = Math.min(80, Math.max(5, (textHeightPx / renderHeight) * 100));
                updateOverlay(selectedOverlay.id, { width: Math.round(newWidth * 2) / 2, height: Math.round(newHeight * 2) / 2 });
              }}
              className="w-full text-[10px] py-1 px-2 rounded border transition-colors hover:bg-blue-500/10 hover:border-blue-500/40"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
            >
              <Maximize2 className="w-3 h-3 inline mr-1" />
              Auto-fit to Text
            </button>
          )}

          {/* 9-Point Snap Grid */}
          {isSelectedText && (
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Quick Position</label>
              <div className="grid grid-cols-3 gap-1 w-24">
                {([
                  { label: "TL", x: 5, y: 5, snap: 'top-left' as const },
                  { label: "TC", x: 50 - (selectedOverlay.width / 2), y: 5, snap: 'top-center' as const },
                  { label: "TR", x: 95 - selectedOverlay.width, y: 5, snap: 'top-right' as const },
                  { label: "ML", x: 5, y: 50 - (selectedOverlay.height / 2), snap: 'middle-left' as const },
                  { label: "MC", x: 50 - (selectedOverlay.width / 2), y: 50 - (selectedOverlay.height / 2), snap: 'middle-center' as const },
                  { label: "MR", x: 95 - selectedOverlay.width, y: 50 - (selectedOverlay.height / 2), snap: 'middle-right' as const },
                  { label: "BL", x: 5, y: 85 - selectedOverlay.height, snap: 'bottom-left' as const },
                  { label: "BC", x: 50 - (selectedOverlay.width / 2), y: 85 - selectedOverlay.height, snap: 'bottom-center' as const },
                  { label: "BR", x: 95 - selectedOverlay.width, y: 85 - selectedOverlay.height, snap: 'bottom-right' as const },
                ]).map((pos) => (
                  <button
                    key={pos.label}
                    onClick={() => updateOverlay(selectedOverlay.id, { x: Math.max(0, pos.x), y: Math.max(0, pos.y), snapPosition: pos.snap })}
                    className="w-7 h-7 rounded border text-[9px] font-medium transition-colors hover:bg-blue-500/20 hover:border-blue-500/40"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>
              Opacity: {selectedOverlay.opacity}%
            </label>
            <input
              type="range"
              min={5}
              max={100}
              value={selectedOverlay.opacity}
              onChange={(e) => updateOverlay(selectedOverlay.id, { opacity: parseInt(e.target.value) })}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: isSelectedText ? "rgb(59,130,246)" : "rgb(124,58,237)" }}
            />
          </div>

          {isMicroSceneMode && 'entranceAnimation' in selectedOverlay && (
            <>
              <div>
                <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Entrance Animation</label>
                <div className="flex gap-1.5 flex-wrap">
                  {ENTRANCE_ANIMATIONS.map((anim) => (
                    <button
                      key={anim.id}
                      onClick={() => updateOverlay(selectedOverlay.id, { entranceAnimation: anim.id })}
                      className="text-[10px] px-2 py-1 rounded-md border transition-colors"
                      style={{
                        borderColor: (selectedOverlay as MicroSceneOverlayItem).entranceAnimation === anim.id ? "rgba(124,58,237,0.5)" : "var(--border-subtle)",
                        color: (selectedOverlay as MicroSceneOverlayItem).entranceAnimation === anim.id ? "rgb(124,58,237)" : "var(--text-secondary)",
                        backgroundColor: (selectedOverlay as MicroSceneOverlayItem).entranceAnimation === anim.id ? "rgba(124,58,237,0.1)" : "transparent",
                      }}
                    >
                      {anim.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Layer Order</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => moveToBack(selectedOverlay.id)}
                    className="text-[10px] px-1.5 py-1 rounded border transition-colors hover:border-purple-500/40 hover:bg-purple-500/10"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                    title="Move to back"
                  >
                    <ChevronsDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => moveLayerBackward(selectedOverlay.id)}
                    className="text-[10px] px-1.5 py-1 rounded border transition-colors hover:border-purple-500/40 hover:bg-purple-500/10"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                    title="Move backward"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => moveLayerForward(selectedOverlay.id)}
                    className="text-[10px] px-1.5 py-1 rounded border transition-colors hover:border-purple-500/40 hover:bg-purple-500/10"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                    title="Move forward"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => moveToFront(selectedOverlay.id)}
                    className="text-[10px] px-1.5 py-1 rounded border transition-colors hover:border-purple-500/40 hover:bg-purple-500/10"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                    title="Move to front"
                  >
                    <ChevronsUp className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => updateOverlay(selectedOverlay.id, { locked: !selectedOverlay.locked })}
              className="text-[10px] px-2 py-1 rounded border flex items-center gap-1 transition-colors"
              style={{
                borderColor: selectedOverlay.locked ? "rgba(124,58,237,0.3)" : "var(--border-subtle)",
                color: selectedOverlay.locked ? "rgb(124,58,237)" : "var(--text-secondary)",
              }}
            >
              {selectedOverlay.locked ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {selectedOverlay.locked ? "Locked" : "Lock Position"}
            </button>
          </div>
        </div>
      )}

      {currentOverlays.length > 1 && (
        <div className="border rounded-lg p-2" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
          <p className="text-[10px] mb-1.5 uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
            Layers ({currentOverlays.length})
          </p>
          <div className="space-y-0.5">
            {[...currentOverlays].reverse().map((overlay, displayIdx) => (
              <div
                key={overlay.id}
                className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors group ${
                  selectedId === overlay.id ? "bg-purple-500/15" : "hover:bg-white/5"
                }`}
                onClick={() => setSelectedId(overlay.id)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", overlay.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dragId = e.dataTransfer.getData("text/plain");
                  if (dragId === overlay.id) return;
                  const reversed = [...currentOverlays].reverse();
                  const fromIdx = reversed.findIndex((o) => o.id === dragId);
                  const toIdx = displayIdx;
                  if (fromIdx < 0) return;
                  const reordered = [...reversed];
                  const [moved] = reordered.splice(fromIdx, 1);
                  reordered.splice(toIdx, 0, moved);
                  const withOrder = reordered.reverse().map((o, idx) => ({ ...o, layerOrder: idx }));
                  handleCurrentChange(withOrder);
                }}
              >
                <GripVertical className="w-3 h-3 flex-shrink-0 cursor-grab opacity-30 group-hover:opacity-70" style={{ color: "var(--text-muted)" }} />
                {isTextOverlay(overlay) ? (
                  <Type className="w-3 h-3 text-blue-400 flex-shrink-0" />
                ) : (
                  <ImageIcon className="w-3 h-3 text-purple-400 flex-shrink-0" />
                )}
                <span className="text-[10px] truncate flex-1" style={{ color: "var(--text-primary)" }}>
                  {overlay.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateOverlay(overlay.id, { opacity: overlay.opacity > 0 ? 0 : 100 });
                  }}
                  className="transition-colors flex-shrink-0"
                  title={overlay.opacity > 0 ? "Hide" : "Show"}
                >
                  {overlay.opacity > 0
                    ? <Eye className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                    : <EyeOff className="w-3 h-3" style={{ color: "var(--text-muted)" }} />}
                </button>
                {overlay.locked && <EyeOff className="w-2.5 h-2.5" style={{ color: "rgba(234,179,8,0.6)" }} title="Locked" />}
                <button
                  onClick={(e) => { e.stopPropagation(); removeOverlay(overlay.id); }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity flex-shrink-0"
                >
                  <X className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
