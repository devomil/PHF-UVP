import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Calendar, Clock, Loader2, AlertCircle, CheckCircle, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PLATFORMS = [
  { id: "twitter", label: "X / Twitter", color: "#1DA1F2" },
  { id: "instagram", label: "Instagram", color: "#E4405F" },
  { id: "tiktok", label: "TikTok", color: "#010101" },
  { id: "facebook", label: "Facebook", color: "#1877F2" },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2" },
  { id: "youtube", label: "YouTube", color: "#FF0000" },
  { id: "pinterest", label: "Pinterest", color: "#BD081C" },
  { id: "threads", label: "Threads", color: "#000000" },
];

const STRATEGIES = [
  { id: "recommended", label: "AI Recommended", description: "Optimal spacing based on engagement data" },
  { id: "daily", label: "Daily", description: "One post per day" },
  { id: "custom", label: "Custom Interval", description: "Set your own hours between posts" },
];

interface ContentItem {
  id: string;
  type: "project" | "asset";
  title: string;
  thumbnailUrl?: string;
  mediaType: string;
}

interface BulkScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  items: ContentItem[];
}

export default function BulkScheduleDialog({ open, onClose, onSuccess, items }: BulkScheduleDialogProps) {
  const { toast } = useToast();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram", "tiktok"]);
  const [startDate, setStartDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [startTime, setStartTime] = useState("10:00");
  const [strategy, setStrategy] = useState("recommended");
  const [customHours, setCustomHours] = useState(48);
  const [orderedItems, setOrderedItems] = useState<ContentItem[]>(items);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= orderedItems.length) return;
    setOrderedItems((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      moveItem(dragIndex, index);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const bulkSchedule = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/social/bulk-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: orderedItems.map((i) => ({
            contentId: i.id,
            contentType: i.type,
          })),
          platforms: selectedPlatforms,
          startDate: new Date(`${startDate}T${startTime}`).toISOString(),
          intervalStrategy: strategy,
          customIntervalHours: strategy === "custom" ? customHours : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Bulk schedule failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bulk schedule created", description: `${orderedItems.length} posts scheduled successfully` });
      onSuccess?.();
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Bulk schedule failed", description: error.message, variant: "destructive" });
    },
  });

  const getPreviewDates = () => {
    const start = new Date(`${startDate}T${startTime}`);
    const intervalHours = strategy === "daily" ? 24 : strategy === "custom" ? customHours : 36;
    return orderedItems.map((_, i) => {
      const d = new Date(start.getTime() + i * intervalHours * 60 * 60 * 1000);
      return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    });
  };

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  if (!open) return null;
  const previewDates = getPreviewDates();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0" style={{ backgroundColor: "var(--overlay-bg)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ backgroundColor: "var(--app-bg)" }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 rounded-t-2xl"
          style={{ backgroundColor: "var(--app-bg)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Bulk Schedule</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{orderedItems.length} items selected</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: "var(--text-muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>
              Content Order <span className="font-normal" style={{ color: "var(--text-muted)" }}>(drag or use arrows to reorder)</span>
            </label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {orderedItems.map((item, i) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 p-2 rounded-lg text-xs transition-all ${dragIndex === i ? "opacity-50 ring-1 ring-purple-500" : ""}`}
                  style={{ backgroundColor: "var(--surface)", cursor: "grab" }}
                >
                  <GripVertical className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                  {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" className="w-8 h-8 rounded object-cover" />}
                  <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}>{item.title}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveItem(i, i - 1); }}
                      disabled={i === 0}
                      className="p-0.5 rounded hover:bg-purple-500/10 disabled:opacity-30"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveItem(i, i + 1); }}
                      disabled={i === orderedItems.length - 1}
                      className="p-0.5 rounded hover:bg-purple-500/10 disabled:opacity-30"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{previewDates[i]}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>Platforms</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const selected = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      borderColor: selected ? p.color : "var(--border-subtle)",
                      backgroundColor: selected ? `${p.color}15` : "transparent",
                      color: selected ? p.color : "var(--text-muted)",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>Start Date & Time</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
              />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>Spacing Strategy</label>
            <div className="space-y-2">
              {STRATEGIES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all"
                  style={{
                    borderColor: strategy === s.id ? "rgb(124,58,237)" : "var(--border-subtle)",
                    backgroundColor: strategy === s.id ? "rgba(124,58,237,0.05)" : "transparent",
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: strategy === s.id ? "rgb(124,58,237)" : "var(--border-medium)" }}
                  >
                    {strategy === s.id && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{s.label}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{s.description}</p>
                  </div>
                </button>
              ))}
              {strategy === "custom" && (
                <div className="flex items-center gap-2 pl-7">
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Every</span>
                  <input
                    type="number"
                    value={customHours}
                    onChange={(e) => setCustomHours(parseInt(e.target.value) || 24)}
                    min={1}
                    max={168}
                    className="w-16 px-2 py-1 rounded text-sm text-center outline-none"
                    style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
                  />
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>hours</span>
                </div>
              )}
            </div>
          </div>

          {bulkSchedule.isError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {(bulkSchedule.error as Error).message}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-medium border"
              style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
            >
              Cancel
            </button>
            <button
              onClick={() => bulkSchedule.mutate()}
              disabled={selectedPlatforms.length === 0 || bulkSchedule.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white text-sm font-medium hover:from-purple-500 hover:to-violet-400 transition-all disabled:opacity-40"
            >
              {bulkSchedule.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              Schedule {orderedItems.length} Posts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
