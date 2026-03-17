import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Upload, FolderOpen, Trash2, Loader2, X,
  Minus, Move, Maximize2, Eye, EyeOff, GripVertical,
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Layers
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { MicroSceneOverlayItem, EntranceAnimation } from "@shared/video-types";

export interface SceneOverlayItem {
  id: string;
  url: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  locked: boolean;
}

type AnyOverlayItem = SceneOverlayItem | MicroSceneOverlayItem;

const ENTRANCE_ANIMATIONS: { id: EntranceAnimation; label: string }[] = [
  { id: "fade", label: "Fade" },
  { id: "rise", label: "Rise" },
  { id: "pop", label: "Pop" },
  { id: "drift", label: "Drift" },
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

  const addOverlay = useCallback((url: string, name: string) => {
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
      const newOverlay: SceneOverlayItem = {
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
  }, [currentOverlays, handleCurrentChange, isMicroSceneMode, nextZIndex]);

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
        addOverlay(url, file.name);
        toast({ title: "Overlay Added", description: file.name });
      } else {
        toast({ title: "Upload failed", description: "No URL returned", variant: "destructive" });
      }
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: (err as Error).message || "Unknown error", variant: "destructive" });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [addOverlay, toast]);

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
        <div className="flex gap-2">
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
            <Upload className="w-3.5 h-3.5" /> Upload
          </button>
          <button
            onClick={() => setShowLibrary(!showLibrary)}
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
                    if (url) addOverlay(url, asset.name || "Overlay");
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
                Upload or select an overlay to position it on {isMicroSceneMode ? `Micro-Scene ${activeMicroSceneIndex! + 1}` : "this scene"}
              </p>
            </div>
          </div>
        )}

        {currentOverlays.map((overlay) => (
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
            <img
              src={overlay.url}
              alt={overlay.name}
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
            {selectedId === overlay.id && !overlay.locked && (
              <>
                <div
                  className="absolute inset-0 border-2 border-purple-500 rounded pointer-events-none"
                  style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.3)" }}
                />
                <div
                  className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-purple-500 rounded-full cursor-se-resize border-2 border-white shadow-lg z-30"
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
        ))}

        {currentOverlays.length > 0 && (
          <div className="absolute bottom-1 left-1 right-1 flex gap-1 flex-wrap z-30 pointer-events-none">
            {currentOverlays.map((overlay) => (
              <span
                key={overlay.id}
                className={`text-[9px] px-1.5 py-0.5 rounded-full pointer-events-auto cursor-pointer transition-all ${
                  selectedId === overlay.id
                    ? "bg-purple-500 text-white"
                    : "bg-black/50 text-white/70 hover:bg-black/70"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(overlay.id);
                }}
              >
                {overlay.name.length > 12 ? overlay.name.slice(0, 12) + "..." : overlay.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {selectedOverlay && (
        <div className="border rounded-lg p-3 space-y-3" style={{ borderColor: "rgba(124,58,237,0.3)", backgroundColor: "rgba(124,58,237,0.03)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              {selectedOverlay.name}
            </span>
            <button
              onClick={() => removeOverlay(selectedOverlay.id)}
              className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>

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
              style={{ accentColor: "rgb(124,58,237)" }}
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

    </div>
  );
}
