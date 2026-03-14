import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Upload, FolderOpen, Trash2, Loader2, X,
  Eye, EyeOff, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown,
  Layers
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { MicroSceneOverlayItem, EntranceAnimation } from "@shared/video-types";

const ENTRANCE_ANIMATIONS: { id: EntranceAnimation; label: string }[] = [
  { id: "fade", label: "Fade" },
  { id: "rise", label: "Rise" },
  { id: "pop", label: "Pop" },
  { id: "drift", label: "Drift" },
];

function generateId() {
  return `msovl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

interface MicroSceneOverlayEditorProps {
  overlays: MicroSceneOverlayItem[];
  onChange: (overlays: MicroSceneOverlayItem[]) => void;
  backgroundUrl?: string;
  backgroundType?: "video" | "image";
}

export function MicroSceneOverlayEditor({
  overlays,
  onChange,
  backgroundUrl,
  backgroundType,
}: MicroSceneOverlayEditorProps) {
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

  const libraryQuery = useQuery({
    queryKey: ["ms-overlay-library-images"],
    queryFn: async () => {
      const res = await fetch("/api/asset-library?type=image", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.assets || [];
    },
    enabled: showLibrary,
  });

  const nextZIndex = useCallback(() => {
    if (overlays.length === 0) return 1;
    return Math.max(...overlays.map(o => o.zIndex)) + 1;
  }, [overlays]);

  const addOverlay = useCallback((url: string, name: string) => {
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
    onChange([...overlays, newOverlay]);
    setSelectedId(newOverlay.id);
    setShowLibrary(false);
  }, [overlays, onChange, nextZIndex]);

  const updateOverlay = useCallback((id: string, updates: Partial<MicroSceneOverlayItem>) => {
    onChange(overlays.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  }, [overlays, onChange]);

  const removeOverlay = useCallback((id: string) => {
    onChange(overlays.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [overlays, onChange, selectedId]);

  const moveLayerForward = useCallback((id: string) => {
    const sorted = [...overlays].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex(o => o.id === id);
    if (idx < sorted.length - 1) {
      const swapA = sorted[idx];
      const swapB = sorted[idx + 1];
      onChange(overlays.map(o => {
        if (o.id === swapA.id) return { ...o, zIndex: swapB.zIndex };
        if (o.id === swapB.id) return { ...o, zIndex: swapA.zIndex };
        return o;
      }));
    }
  }, [overlays, onChange]);

  const moveLayerBackward = useCallback((id: string) => {
    const sorted = [...overlays].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex(o => o.id === id);
    if (idx > 0) {
      const swapA = sorted[idx];
      const swapB = sorted[idx - 1];
      onChange(overlays.map(o => {
        if (o.id === swapA.id) return { ...o, zIndex: swapB.zIndex };
        if (o.id === swapB.id) return { ...o, zIndex: swapA.zIndex };
        return o;
      }));
    }
  }, [overlays, onChange]);

  const moveToFront = useCallback((id: string) => {
    const maxZ = Math.max(...overlays.map(o => o.zIndex));
    updateOverlay(id, { zIndex: maxZ + 1 });
  }, [overlays, updateOverlay]);

  const moveToBack = useCallback((id: string) => {
    const minZ = Math.min(...overlays.map(o => o.zIndex));
    updateOverlay(id, { zIndex: minZ - 1 });
  }, [overlays, updateOverlay]);

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
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "Unknown error", variant: "destructive" });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [addOverlay, toast]);

  const handleMouseDown = useCallback((e: React.MouseEvent, id: string, type: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    const overlay = overlays.find((o) => o.id === id);
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
  }, [overlays]);

  useEffect(() => {
    if (!dragging && !resizing) return;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const handleMouseMove = (e: MouseEvent) => {
      if (dragging) {
        const dx = ((e.clientX - dragging.startX) / rect.width) * 100;
        const dy = ((e.clientY - dragging.startY) / rect.height) * 100;
        const overlay = overlays.find((o) => o.id === dragging.id);
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
  }, [dragging, resizing, overlays, updateOverlay]);

  const selectedOverlay = overlays.find((o) => o.id === selectedId);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Overlays
          </span>
          {overlays.length > 0 && (
            <span className="text-[9px] px-1 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25">
              {overlays.length}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] px-2 py-1 rounded-md border flex items-center gap-1 transition-colors hover:border-purple-500/40 hover:bg-purple-500/10"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
            title="Upload overlay"
          >
            <Upload className="w-3 h-3" />
          </button>
          <button
            onClick={() => setShowLibrary(!showLibrary)}
            className="text-[10px] px-2 py-1 rounded-md border flex items-center gap-1 transition-colors hover:border-purple-500/40 hover:bg-purple-500/10"
            style={{
              borderColor: showLibrary ? "rgba(124,58,237,0.4)" : "var(--border-subtle)",
              color: showLibrary ? "rgb(124,58,237)" : "var(--text-muted)",
              backgroundColor: showLibrary ? "rgba(124,58,237,0.1)" : "transparent",
            }}
            title="Browse asset library"
          >
            <FolderOpen className="w-3 h-3" />
          </button>
        </div>
      </div>

      {showLibrary && (
        <div className="border rounded-md p-1.5 max-h-28 overflow-y-auto" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
          {libraryQuery.isLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--text-muted)" }} />
            </div>
          ) : !libraryQuery.data || libraryQuery.data.length === 0 ? (
            <p className="text-[10px] text-center py-3" style={{ color: "var(--text-muted)" }}>No images in library</p>
          ) : (
            <div className="grid grid-cols-6 gap-1">
              {libraryQuery.data.slice(0, 18).map((asset: any) => (
                <button
                  key={asset.id}
                  onClick={() => {
                    const url = asset.url || asset.thumbnailUrl;
                    if (url) addOverlay(url, asset.name || "Overlay");
                  }}
                  className="aspect-square rounded overflow-hidden border hover:border-purple-500/50 transition-all"
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

      {overlays.length > 0 && (
        <div
          ref={containerRef}
          className="relative rounded-lg overflow-hidden border cursor-crosshair select-none"
          style={{
            borderColor: "rgba(124,58,237,0.2)",
            backgroundColor: "rgba(0,0,0,0.4)",
            aspectRatio: "16 / 9",
          }}
          onClick={() => setSelectedId(null)}
        >
          {backgroundUrl && backgroundType === "image" && (
            <img src={backgroundUrl} alt="" className="w-full h-full object-cover absolute inset-0" />
          )}
          {backgroundUrl && backgroundType === "video" && (
            <video src={backgroundUrl} className="w-full h-full object-cover absolute inset-0" muted />
          )}

          {overlays.map((overlay) => (
            <div
              key={overlay.id}
              className={`absolute group ${overlay.locked ? "pointer-events-none" : "cursor-move"}`}
              style={{
                left: `${overlay.x}%`,
                top: `${overlay.y}%`,
                width: `${overlay.width}%`,
                height: `${overlay.height}%`,
                opacity: overlay.opacity / 100,
                zIndex: selectedId === overlay.id ? 20 : overlay.zIndex,
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
                    className="absolute -bottom-1 -right-1 w-3 h-3 bg-purple-500 rounded-full cursor-se-resize border border-white shadow-lg z-30"
                    onMouseDown={(e) => handleMouseDown(e, overlay.id, "resize")}
                  />
                  <button
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg z-30 hover:bg-red-400 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeOverlay(overlay.id);
                    }}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedOverlay && (
        <div className="border rounded-md p-2 space-y-2" style={{ borderColor: "rgba(124,58,237,0.2)", backgroundColor: "rgba(124,58,237,0.03)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {selectedOverlay.name}
            </span>
            <button
              onClick={() => removeOverlay(selectedOverlay.id)}
              className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: "var(--text-muted)" }}>X%</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={selectedOverlay.x}
                onChange={(e) => updateOverlay(selectedOverlay.id, { x: parseFloat(e.target.value) || 0 })}
                className="w-full text-[10px] rounded border px-1.5 py-0.5 bg-transparent outline-none"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Y%</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={selectedOverlay.y}
                onChange={(e) => updateOverlay(selectedOverlay.id, { y: parseFloat(e.target.value) || 0 })}
                className="w-full text-[10px] rounded border px-1.5 py-0.5 bg-transparent outline-none"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: "var(--text-muted)" }}>W%</label>
              <input
                type="number"
                min={3}
                max={100}
                step={0.5}
                value={selectedOverlay.width}
                onChange={(e) => updateOverlay(selectedOverlay.id, { width: parseFloat(e.target.value) || 10 })}
                className="w-full text-[10px] rounded border px-1.5 py-0.5 bg-transparent outline-none"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: "var(--text-muted)" }}>H%</label>
              <input
                type="number"
                min={3}
                max={100}
                step={0.5}
                value={selectedOverlay.height}
                onChange={(e) => updateOverlay(selectedOverlay.id, { height: parseFloat(e.target.value) || 10 })}
                className="w-full text-[10px] rounded border px-1.5 py-0.5 bg-transparent outline-none"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] block mb-0.5" style={{ color: "var(--text-muted)" }}>
              Opacity: {selectedOverlay.opacity}%
            </label>
            <input
              type="range"
              min={5}
              max={100}
              value={selectedOverlay.opacity}
              onChange={(e) => updateOverlay(selectedOverlay.id, { opacity: parseInt(e.target.value) })}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: "rgb(124,58,237)" }}
            />
          </div>

          <div>
            <label className="text-[9px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Entrance Animation</label>
            <div className="flex gap-1">
              {ENTRANCE_ANIMATIONS.map((anim) => (
                <button
                  key={anim.id}
                  onClick={() => updateOverlay(selectedOverlay.id, { entranceAnimation: anim.id })}
                  className="text-[9px] px-2 py-0.5 rounded-md border transition-colors"
                  style={{
                    borderColor: selectedOverlay.entranceAnimation === anim.id ? "rgba(124,58,237,0.5)" : "var(--border-subtle)",
                    color: selectedOverlay.entranceAnimation === anim.id ? "rgb(192,132,252)" : "var(--text-muted)",
                    backgroundColor: selectedOverlay.entranceAnimation === anim.id ? "rgba(124,58,237,0.15)" : "transparent",
                  }}
                >
                  {anim.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => moveToFront(selectedOverlay.id)}
              className="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-0.5 transition-colors hover:bg-purple-500/10"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
              title="To front"
            >
              <ChevronsUp className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => moveLayerForward(selectedOverlay.id)}
              className="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-0.5 transition-colors hover:bg-purple-500/10"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
              title="Forward"
            >
              <ChevronUp className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => moveLayerBackward(selectedOverlay.id)}
              className="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-0.5 transition-colors hover:bg-purple-500/10"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
              title="Backward"
            >
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => moveToBack(selectedOverlay.id)}
              className="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-0.5 transition-colors hover:bg-purple-500/10"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
              title="To back"
            >
              <ChevronsDown className="w-2.5 h-2.5" />
            </button>
            <div className="flex-1" />
            <button
              onClick={() => updateOverlay(selectedOverlay.id, { locked: !selectedOverlay.locked })}
              className="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-0.5 transition-colors"
              style={{
                borderColor: selectedOverlay.locked ? "rgba(124,58,237,0.3)" : "var(--border-subtle)",
                color: selectedOverlay.locked ? "rgb(124,58,237)" : "var(--text-muted)",
              }}
            >
              {selectedOverlay.locked ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
              {selectedOverlay.locked ? "Locked" : "Lock"}
            </button>
          </div>
        </div>
      )}

      {overlays.length === 0 && (
        <div className="flex items-center gap-2 py-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] px-2.5 py-1 rounded-md border border-dashed flex items-center gap-1 transition-colors hover:border-purple-500/40 hover:bg-purple-500/05"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
          >
            <Plus className="w-3 h-3" /> Add overlay
          </button>
        </div>
      )}
    </div>
  );
}
