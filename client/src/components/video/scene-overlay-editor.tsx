import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Upload, FolderOpen, Trash2, Loader2, X,
  Minus, Move, Maximize2, Eye, EyeOff, GripVertical
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

interface SceneOverlayEditorProps {
  overlays: SceneOverlayItem[];
  onChange: (overlays: SceneOverlayItem[]) => void;
  previewWidth: number;
  previewHeight: number;
  backgroundUrl?: string;
  backgroundType?: "video" | "image";
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

  const addOverlay = useCallback((url: string, name: string) => {
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
    onChange([...overlays, newOverlay]);
    setSelectedId(newOverlay.id);
    setShowLibrary(false);
  }, [overlays, onChange]);

  const updateOverlay = useCallback((id: string, updates: Partial<SceneOverlayItem>) => {
    onChange(overlays.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  }, [overlays, onChange]);

  const removeOverlay = useCallback((id: string) => {
    onChange(overlays.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [overlays, onChange, selectedId]);

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Move className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Scene Overlays
          </span>
          {overlays.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25">
              {overlays.length}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] px-2 py-1 rounded-md border flex items-center gap-1 transition-colors hover:border-purple-500/30"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
            title="Upload overlay image"
          >
            <Upload className="w-3 h-3" /> Upload
          </button>
          <button
            onClick={() => setShowLibrary(!showLibrary)}
            className="text-[10px] px-2 py-1 rounded-md border flex items-center gap-1 transition-colors hover:border-purple-500/30"
            style={{
              borderColor: showLibrary ? "rgba(124,58,237,0.4)" : "var(--border-subtle)",
              color: showLibrary ? "rgb(124,58,237)" : "var(--text-secondary)",
            }}
            title="Browse asset library"
          >
            <FolderOpen className="w-3 h-3" /> Library
          </button>
        </div>
      </div>

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
              {libraryQuery.data.slice(0, 24).map((asset: any) => (
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
          borderColor: overlays.length > 0 ? "rgba(124,58,237,0.3)" : "var(--border-subtle)",
          backgroundColor: "rgba(0,0,0,0.4)",
          aspectRatio: `${previewWidth} / ${previewHeight}`,
        }}
        onClick={() => setSelectedId(null)}
      >
        {backgroundUrl && backgroundType === "image" && (
          <img src={backgroundUrl} alt="" className="w-full h-full object-contain absolute inset-0" />
        )}
        {backgroundUrl && backgroundType === "video" && (
          <video src={backgroundUrl} className="w-full h-full object-contain absolute inset-0" muted />
        )}
        {overlays.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center bg-black/40 rounded-lg px-4 py-3 backdrop-blur-sm">
              <Move className="w-5 h-5 mx-auto mb-1" style={{ color: "var(--text-muted)" }} />
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Upload or select an overlay to position it here</p>
            </div>
          </div>
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
              zIndex: selectedId === overlay.id ? 20 : 10,
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

        {overlays.length > 0 && (
          <div className="absolute bottom-1 left-1 right-1 flex gap-1 flex-wrap z-30 pointer-events-none">
            {overlays.map((overlay) => (
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
