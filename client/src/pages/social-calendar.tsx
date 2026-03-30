import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  Video,
  Image,
  ChevronDown,
  ChevronUp,
  Inbox,
  Send,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import PublishingPanel from "@/components/social/publishing-panel";

interface ContentItem {
  id: string;
  type: "project" | "asset";
  title: string;
  mediaUrl: string;
  mediaType: string;
  thumbnailUrl?: string;
  publishStatus: string;
  createdAt: string;
}

interface ScheduledPost {
  id: number;
  title?: string;
  captions?: Record<string, string>;
  hashtags?: Record<string, string[]>;
  platforms?: string[];
  status: string;
  scheduledFor?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  mediaType?: string;
}

const platformColors: Record<string, string> = {
  twitter: "#1DA1F2",
  instagram: "#E4405F",
  tiktok: "#69C9D0",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
  youtube: "#FF0000",
  pinterest: "#BD081C",
  threads: "#888888",
};

function SocialCalendar() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [publishPanel, setPublishPanel] = useState<{
    contentItem?: ContentItem;
    editPost?: ScheduledPost;
    prefillDate?: string;
  } | null>(null);
  const [contentPicker, setContentPicker] = useState<{ date: string } | null>(null);
  const [dragItem, setDragItem] = useState<ContentItem | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const handleDragStart = useCallback((item: ContentItem) => {
    setDragItem(item);
  }, []);

  const handleDragOverCell = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(dateStr);
  }, []);

  const handleDropOnCell = useCallback((dateStr: string) => {
    if (dragItem) {
      setPublishPanel({ contentItem: dragItem, prefillDate: dateStr });
    }
    setDragItem(null);
    setDragOverDate(null);
  }, [dragItem]);

  const handleDragEnd = useCallback(() => {
    setDragItem(null);
    setDragOverDate(null);
  }, []);

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ["/api/social/posts"],
    queryFn: async () => {
      const res = await fetch("/api/social/posts");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: contentReady, isLoading: contentLoading } = useQuery({
    queryKey: ["/api/social/content-ready"],
    queryFn: async () => {
      const res = await fetch("/api/social/content-ready");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const posts: ScheduledPost[] = postsData?.posts || postsData || [];
  const contentItems: ContentItem[] = contentReady?.items || [];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getWeekStart = (d: Date) => {
    const clone = new Date(d);
    clone.setDate(clone.getDate() - clone.getDay());
    return clone;
  };

  const calendarCells = useMemo(() => {
    if (viewMode === "month") {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay();
      const cells: Array<{ date: Date | null; posts: ScheduledPost[] }> = [];
      for (let i = 0; i < firstDay; i++) cells.push({ date: null, posts: [] });
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dayPosts = posts.filter((p) => {
          if (!p.scheduledFor) return false;
          const pd = new Date(p.scheduledFor);
          return pd.getFullYear() === year && pd.getMonth() === month && pd.getDate() === d;
        });
        cells.push({ date, posts: dayPosts });
      }
      return cells;
    } else {
      const weekStart = getWeekStart(currentDate);
      const cells: Array<{ date: Date; posts: ScheduledPost[] }> = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dayPosts = posts.filter((p) => {
          if (!p.scheduledFor) return false;
          const pd = new Date(p.scheduledFor);
          return pd.toDateString() === date.toDateString();
        });
        cells.push({ date, posts: dayPosts });
      }
      return cells;
    }
  }, [posts, year, month, currentDate, viewMode]);

  const navigatePrev = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(year, month - 1, 1));
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    }
  };

  const navigateNext = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(year, month + 1, 1));
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    }
  };

  const headerText =
    viewMode === "month"
      ? currentDate.toLocaleString("default", { month: "long", year: "numeric" })
      : (() => {
          const ws = getWeekStart(currentDate);
          const we = new Date(ws);
          we.setDate(ws.getDate() + 6);
          return `${ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${we.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
        })();

  const today = new Date();
  const isToday = (d: Date | null) =>
    d !== null && d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/social/posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/social/content-ready"] });
  };

  return (
    <div className="flex h-full" style={{ color: "var(--text-primary)" }}>
      {sidebarOpen && (
        <div
          className="w-64 shrink-0 border-r overflow-y-auto p-4 space-y-3"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Content Queue</h3>
            <button onClick={() => setSidebarOpen(false)} className="p-0.5" style={{ color: "var(--text-muted)" }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          {contentLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg p-2 animate-pulse" style={{ backgroundColor: "var(--app-bg)" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded shrink-0" style={{ backgroundColor: "var(--surface-hover)" }} />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 rounded w-3/4" style={{ backgroundColor: "var(--surface-hover)" }} />
                      <div className="h-2 rounded w-1/2" style={{ backgroundColor: "var(--surface-hover)" }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : contentItems.length === 0 ? (
            <div className="text-center py-6">
              <Inbox className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>No content ready</p>
            </div>
          ) : (
            contentItems.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border p-2 cursor-pointer transition-all hover:shadow-md"
                style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--app-bg)" }}
                onClick={() => setPublishPanel({ contentItem: item })}
                draggable
                onDragStart={() => handleDragStart(item)}
                onDragEnd={handleDragEnd}
              >
                <div className="flex items-center gap-2">
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--surface-hover)" }}>
                      {item.mediaType === "video" ? <Video className="w-4 h-4" style={{ color: "var(--text-muted)" }} /> : <Image className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{item.title}</p>
                    <p className="text-[10px] capitalize" style={{ color: "var(--text-muted)" }}>{item.mediaType}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg border mr-2"
                style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <CalendarDays className="w-5 h-5 text-purple-400" />
              </div>
              <h1 className="text-xl font-bold">Content Calendar</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: "var(--border-medium)" }}>
              <button
                onClick={() => setViewMode("month")}
                className="px-3 py-1.5 text-xs font-medium transition-all"
                style={{
                  backgroundColor: viewMode === "month" ? "var(--surface-active)" : "transparent",
                  color: viewMode === "month" ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                Month
              </button>
              <button
                onClick={() => setViewMode("week")}
                className="px-3 py-1.5 text-xs font-medium transition-all"
                style={{
                  backgroundColor: viewMode === "week" ? "var(--surface-active)" : "transparent",
                  color: viewMode === "week" ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                Week
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={navigatePrev} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--text-secondary)" }}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-semibold min-w-[180px] text-center">{headerText}</span>
              <button onClick={navigateNext} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--text-secondary)" }}>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
            >
              Today
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {postsLoading ? (
            <div className="h-full flex flex-col">
              <div className="grid grid-cols-7 shrink-0">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="px-3 py-2 text-center text-xs font-medium" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 flex-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="min-h-[100px] p-2" style={{ borderBottom: "1px solid var(--border-subtle)", borderRight: "1px solid var(--border-subtle)" }}>
                    <div className="w-5 h-5 rounded animate-pulse mb-1" style={{ backgroundColor: "var(--surface-hover)" }} />
                    {i % 5 === 0 && <div className="h-3 rounded animate-pulse w-3/4 mt-1" style={{ backgroundColor: "var(--surface-hover)" }} />}
                  </div>
                ))}
              </div>
            </div>
          ) : viewMode === "month" ? (
            <div className="h-full flex flex-col">
              <div className="grid grid-cols-7 shrink-0">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="px-3 py-2 text-center text-xs font-medium"
                    style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 flex-1">
                {calendarCells.map((cell, i) => (
                  <div
                    key={i}
                    className={`min-h-[100px] p-1.5 transition-colors ${cell.date ? "cursor-pointer hover:bg-purple-500/5" : ""}`}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      borderRight: "1px solid var(--border-subtle)",
                      backgroundColor: cell.date && dragOverDate === cell.date.toISOString().split("T")[0]
                        ? "rgba(124,58,237,0.15)"
                        : cell.date && isToday(cell.date) ? "rgba(124,58,237,0.05)" : undefined,
                    }}
                    onDragOver={cell.date ? (e) => handleDragOverCell(e, cell.date!.toISOString().split("T")[0]) : undefined}
                    onDragLeave={() => setDragOverDate(null)}
                    onDrop={cell.date ? () => handleDropOnCell(cell.date!.toISOString().split("T")[0]) : undefined}
                    onClick={() => {
                      if (cell.date) {
                        if (contentItems.length === 1) {
                          setPublishPanel({ contentItem: contentItems[0], prefillDate: cell.date.toISOString().split("T")[0] });
                        } else if (contentItems.length > 1) {
                          setContentPicker({ date: cell.date.toISOString().split("T")[0] });
                        }
                      }
                    }}
                  >
                    {cell.date && (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-xs font-medium ${isToday(cell.date) ? "bg-purple-600 text-white w-6 h-6 rounded-full flex items-center justify-center" : ""}`}
                            style={isToday(cell.date) ? {} : { color: "var(--text-secondary)" }}
                          >
                            {cell.date.getDate()}
                          </span>
                          {cell.posts.length > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">
                              {cell.posts.length}
                            </span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {cell.posts.slice(0, 3).map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] cursor-pointer transition-all hover:opacity-80"
                              style={{
                                backgroundColor: p.status === "published" ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.12)",
                                color: p.status === "published" ? "rgb(34,197,94)" : "rgb(96,165,250)",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPublishPanel({ editPost: p });
                              }}
                            >
                              {p.thumbnailUrl ? (
                                <img src={p.thumbnailUrl} alt="" className="w-4 h-4 rounded-sm object-cover shrink-0" />
                              ) : null}
                              {p.platforms?.slice(0, 2).map((pl) => (
                                <span
                                  key={pl}
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: platformColors[pl] || "var(--text-muted)" }}
                                />
                              ))}
                              <span className="truncate">{p.title || p.platforms?.join(", ")}</span>
                            </div>
                          ))}
                          {cell.posts.length > 3 && (
                            <span className="text-[9px] px-1.5" style={{ color: "var(--text-muted)" }}>
                              +{cell.posts.length - 3} more
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-7 h-full">
              {(calendarCells as Array<{ date: Date; posts: ScheduledPost[] }>).map((cell, i) => (
                <div
                  key={i}
                  className="flex flex-col p-2 cursor-pointer transition-colors hover:bg-purple-500/5"
                  style={{
                    borderRight: "1px solid var(--border-subtle)",
                    backgroundColor: dragOverDate === cell.date.toISOString().split("T")[0]
                      ? "rgba(124,58,237,0.15)"
                      : isToday(cell.date) ? "rgba(124,58,237,0.05)" : undefined,
                  }}
                  onDragOver={(e) => handleDragOverCell(e, cell.date.toISOString().split("T")[0])}
                  onDragLeave={() => setDragOverDate(null)}
                  onDrop={() => handleDropOnCell(cell.date.toISOString().split("T")[0])}
                  onClick={() => {
                    if (contentItems.length === 1) {
                      setPublishPanel({ contentItem: contentItems[0], prefillDate: cell.date.toISOString().split("T")[0] });
                    } else if (contentItems.length > 1) {
                      setContentPicker({ date: cell.date.toISOString().split("T")[0] });
                    }
                  }}
                >
                  <div className="text-center mb-2">
                    <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                      {cell.date.toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div
                      className={`text-lg font-bold ${isToday(cell.date) ? "bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center mx-auto" : ""}`}
                      style={isToday(cell.date) ? {} : { color: "var(--text-primary)" }}
                    >
                      {cell.date.getDate()}
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5 overflow-y-auto">
                    {cell.posts.map((p) => (
                      <div
                        key={p.id}
                        className="p-2 rounded-lg border transition-all hover:shadow-md cursor-pointer"
                        style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPublishPanel({ editPost: p });
                        }}
                      >
                        {p.thumbnailUrl && (
                          <img src={p.thumbnailUrl} alt="" className="w-full h-12 rounded object-cover mb-1" />
                        )}
                        <p className="text-[10px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {p.title || "Untitled"}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {p.platforms?.slice(0, 3).map((pl) => (
                            <span
                              key={pl}
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: platformColors[pl] || "var(--text-muted)" }}
                            />
                          ))}
                          {p.scheduledFor && (
                            <span className="text-[9px] ml-auto" style={{ color: "var(--text-muted)" }}>
                              {new Date(p.scheduledFor).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {contentPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0" style={{ backgroundColor: "var(--overlay-bg)" }} onClick={() => setContentPicker(null)} />
          <div
            className="relative w-full max-w-md max-h-[70vh] overflow-y-auto rounded-2xl shadow-2xl p-6"
            style={{ backgroundColor: "var(--app-bg)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Select Content</h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Schedule for {new Date(contentPicker.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <button onClick={() => setContentPicker(null)} className="p-1" style={{ color: "var(--text-muted)" }}>
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {contentItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setContentPicker(null);
                    setPublishPanel({ contentItem: item, prefillDate: contentPicker.date });
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border transition-all hover:shadow-md text-left"
                  style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}
                >
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--surface-hover)" }}>
                      {item.mediaType === "video" ? <Video className="w-5 h-5" style={{ color: "var(--text-muted)" }} /> : <Image className="w-5 h-5" style={{ color: "var(--text-muted)" }} />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{item.title}</p>
                    <p className="text-[10px] capitalize" style={{ color: "var(--text-muted)" }}>{item.mediaType}</p>
                  </div>
                  <Send className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                </button>
              ))}
              {contentItems.length === 0 && (
                <div className="text-center py-8">
                  <Inbox className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>No content ready to schedule</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {publishPanel && (
        <PublishingPanel
          open={true}
          onClose={() => setPublishPanel(null)}
          onSuccess={refreshData}
          contentItem={publishPanel.contentItem}
          editPost={publishPanel.editPost}
          prefillDate={publishPanel.prefillDate}
        />
      )}
    </div>
  );
}

export default SocialCalendar;
