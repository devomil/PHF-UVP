import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Upload, FolderOpen, Trash2, Loader2, X,
  Minus, Move, Maximize2, Eye, EyeOff, GripVertical,
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Layers,
  Type, Image as ImageIcon, Bold, Italic, AlignLeft, AlignCenter, AlignRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type {
  MicroSceneOverlayItem,
  EntranceAnimation,
  SceneOverlayItem,
  ImageOverlayItem,
  TextOverlayItem,
  TextOverlayAnimation,
} from "@shared/video-types";

export type { SceneOverlayItem };

type AnyOverlayItem = SceneOverlayItem | MicroSceneOverlayItem;

const ENTRANCE_ANIMATIONS: { id: EntranceAnimation; label: string }[] = [
  { id: "fade", label: "Fade" },
  { id: "rise", label: "Rise" },
  { id: "pop", label: "Pop" },
  { id: "drift", label: "Drift" },
];

const ENTER_ANIMATIONS: { id: TextOverlayAnimation; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide-up", label: "Slide Up" },
  { id: "slide-down", label: "Slide Down" },
  { id: "slide-left", label: "Slide Left" },
  { id: "slide-right", label: "Slide Right" },
  { id: "pop", label: "Pop" },
  { id: "typewriter", label: "Typewriter" },
  { id: "blur-in", label: "Blur In" },
];

const EXIT_ANIMATIONS: { id: TextOverlayAnimation; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide-up", label: "Slide Up" },
  { id: "slide-down", label: "Slide Down" },
  { id: "slide-left", label: "Slide Left" },
  { id: "slide-right", label: "Slide Right" },
  { id: "pop", label: "Pop" },
];

interface TextPreset {
  label: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  backgroundColor?: string;
  backgroundOpacity?: number;
  textShadow: boolean;
  enterAnimation: TextOverlayAnimation;
  exitAnimation: TextOverlayAnimation;
  defaultText: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

const TEXT_PRESETS: TextPreset[] = [
  {
    label: "Title",
    fontSize: 64,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    textShadow: true,
    enterAnimation: "fade",
    exitAnimation: "fade",
    defaultText: "Your Title Here",
    width: 80,
    height: 15,
    x: 10,
    y: 35,
  },
  {
    label: "Subtitle",
    fontSize: 36,
    fontWeight: "500",
    color: "#FFFFFF",
    textAlign: "center",
    textShadow: true,
    enterAnimation: "slide-up",
    exitAnimation: "fade",
    defaultText: "Subtitle Text",
    width: 70,
    height: 10,
    x: 15,
    y: 50,
  },
  {
    label: "Lower Third",
    fontSize: 28,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "left",
    backgroundColor: "#000000",
    backgroundOpacity: 55,
    textShadow: false,
    enterAnimation: "slide-left",
    exitAnimation: "fade",
    defaultText: "Lower Third Text",
    width: 50,
    height: 8,
    x: 5,
    y: 82,
  },
  {
    label: "CTA Button",
    fontSize: 32,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    backgroundColor: "#7C3AED",
    backgroundOpacity: 90,
    textShadow: false,
    enterAnimation: "pop",
    exitAnimation: "fade",
    defaultText: "Get Started",
    width: 35,
    height: 8,
    x: 32,
    y: 78,
  },
  {
    label: "Caption",
    fontSize: 22,
    fontWeight: "400",
    color: "#E0E0E0",
    textAlign: "center",
    textShadow: true,
    enterAnimation: "fade",
    exitAnimation: "fade",
    defaultText: "Caption text goes here",
    width: 60,
    height: 6,
    x: 20,
    y: 88,
  },
  {
    label: "Bold Statement",
    fontSize: 48,
    fontWeight: "800",
    color: "#FACC15",
    textAlign: "center",
    textShadow: true,
    enterAnimation: "pop",
    exitAnimation: "fade",
    defaultText: "KEY MESSAGE",
    width: 70,
    height: 12,
    x: 15,
    y: 40,
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

const COLOR_SWATCHES = [
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
}

function generateId() {
  return `ovl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function isTextOverlay(o: AnyOverlayItem): o is TextOverlayItem {
  return 'type' in o && (o as any).type === 'text';
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
}: SceneOverlayEditorProps) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showTextPresets, setShowTextPresets] = useState(false);
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
        updateOverlay(dragging.id, { x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 });
      }
      if (resizing) {
        const dx = ((e.clientX - resizing.startX) / rect.width) * 100;
        const dy = ((e.clientY - resizing.startY) / rect.height) * 100;
        const delta = Math.max(dx, dy);
        const newW = Math.max(3, Math.min(100, resizing.origW + delta));
        const newH = Math.max(3, Math.min(100, resizing.origH + delta));
        updateOverlay(resizing.id, {
          width: Math.round(newW * 10) / 10,
          height: Math.round(newH * 10) / 10,
        });
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
            <Type className="w-3.5 h-3.5" /> Text
          </button>
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

        {currentOverlays.map((overlay) => {
          const isText = isTextOverlay(overlay);
          const textOvl = isText ? (overlay as TextOverlayItem) : null;

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
                zIndex: selectedId === overlay.id ? 20 : (getZIndex(overlay) || 10),
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
              {selectedId === overlay.id && !overlay.locked && (
                <>
                  <div
                    className="absolute inset-0 border-2 rounded pointer-events-none"
                    style={{
                      borderColor: isText ? 'rgb(59, 130, 246)' : 'rgb(124, 58, 237)',
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
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
            {currentOverlays.map((overlay) => (
              <span
                key={overlay.id}
                className={`text-[9px] px-1.5 py-0.5 rounded-full pointer-events-auto cursor-pointer transition-all flex items-center gap-1 ${
                  selectedId === overlay.id
                    ? isTextOverlay(overlay) ? "bg-blue-500 text-white" : "bg-purple-500 text-white"
                    : "bg-black/50 text-white/70 hover:bg-black/70"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(overlay.id);
                }}
              >
                {isTextOverlay(overlay) ? <Type className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
                {overlay.name.length > 12 ? overlay.name.slice(0, 12) + "..." : overlay.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Property Editor for selected overlay */}
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
                      {COLOR_SWATCHES.slice(0, 5).map((c) => (
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Enter Animation</label>
                  <select
                    value={selectedTextOverlay.enterAnimation}
                    onChange={(e) => updateOverlay(selectedOverlay.id, { enterAnimation: e.target.value as TextOverlayAnimation })}
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
                    onChange={(e) => updateOverlay(selectedOverlay.id, { exitAnimation: e.target.value as TextOverlayAnimation })}
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

          {/* 9-Point Snap Grid */}
          {isSelectedText && (
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Quick Position</label>
              <div className="grid grid-cols-3 gap-1 w-24">
                {[
                  { label: "TL", x: 5, y: 5 },
                  { label: "TC", x: 50 - (selectedOverlay.width / 2), y: 5 },
                  { label: "TR", x: 95 - selectedOverlay.width, y: 5 },
                  { label: "ML", x: 5, y: 50 - (selectedOverlay.height / 2) },
                  { label: "MC", x: 50 - (selectedOverlay.width / 2), y: 50 - (selectedOverlay.height / 2) },
                  { label: "MR", x: 95 - selectedOverlay.width, y: 50 - (selectedOverlay.height / 2) },
                  { label: "BL", x: 5, y: 85 - selectedOverlay.height },
                  { label: "BC", x: 50 - (selectedOverlay.width / 2), y: 85 - selectedOverlay.height },
                  { label: "BR", x: 95 - selectedOverlay.width, y: 85 - selectedOverlay.height },
                ].map((pos) => (
                  <button
                    key={pos.label}
                    onClick={() => updateOverlay(selectedOverlay.id, { x: Math.max(0, pos.x), y: Math.max(0, pos.y) })}
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

      {/* Layers Panel */}
      {currentOverlays.length > 1 && (
        <div className="border rounded-lg p-2" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
          <p className="text-[10px] mb-1.5 uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
            Layers ({currentOverlays.length})
          </p>
          <div className="space-y-0.5">
            {[...currentOverlays].reverse().map((overlay) => (
              <div
                key={overlay.id}
                className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${
                  selectedId === overlay.id ? "bg-purple-500/15" : "hover:bg-white/5"
                }`}
                onClick={() => setSelectedId(overlay.id)}
              >
                {isTextOverlay(overlay) ? (
                  <Type className="w-3 h-3 text-blue-400 flex-shrink-0" />
                ) : (
                  <ImageIcon className="w-3 h-3 text-purple-400 flex-shrink-0" />
                )}
                <span className="text-[10px] truncate flex-1" style={{ color: "var(--text-primary)" }}>
                  {overlay.name}
                </span>
                {overlay.locked && <EyeOff className="w-2.5 h-2.5" style={{ color: "var(--text-muted)" }} />}
                <button
                  onClick={(e) => { e.stopPropagation(); removeOverlay(overlay.id); }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
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
