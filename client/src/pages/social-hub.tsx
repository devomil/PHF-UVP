import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Share2,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  FileEdit,
  Send,
  Calendar,
  CheckSquare,
  Square,
  Video,
  Image,
  Loader2,
  ArrowRight,
  Inbox,
} from "lucide-react";
import PublishingPanel from "@/components/social/publishing-panel";
import BulkScheduleDialog from "@/components/social/bulk-schedule-dialog";

interface ContentItem {
  id: string;
  type: "project" | "asset";
  title: string;
  mediaUrl: string;
  mediaType: string;
  thumbnailUrl?: string;
  publishStatus: string;
  createdAt: string;
  duration?: number;
  aspectRatio?: string;
}

interface ScheduledPost {
  id: number;
  title?: string;
  captions?: Record<string, string>;
  hashtags?: Record<string, string[]>;
  platforms?: string[];
  status: string;
  scheduledFor?: string;
  publishedAt?: string;
  failureReason?: string;
  createdAt: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
}

const statusConfig: Record<string, { bg: string; text: string; label: string; icon: typeof CheckCircle }> = {
  draft: { bg: "rgba(156,163,175,0.15)", text: "var(--text-secondary)", label: "Draft", icon: FileEdit },
  scheduled: { bg: "rgba(59,130,246,0.15)", text: "rgb(59,130,246)", label: "Scheduled", icon: Clock },
  publishing: { bg: "rgba(168,85,247,0.15)", text: "rgb(168,85,247)", label: "Publishing", icon: Send },
  published: { bg: "rgba(34,197,94,0.15)", text: "rgb(34,197,94)", label: "Published", icon: CheckCircle },
  failed: { bg: "rgba(239,68,68,0.15)", text: "rgb(239,68,68)", label: "Failed", icon: XCircle },
};

const publishStatusConfig: Record<string, { bg: string; text: string; label: string }> = {
  unpublished: { bg: "rgba(156,163,175,0.12)", text: "var(--text-muted)", label: "Unpublished" },
  scheduled: { bg: "rgba(59,130,246,0.12)", text: "rgb(96,165,250)", label: "Scheduled" },
  published: { bg: "rgba(34,197,94,0.12)", text: "rgb(74,222,128)", label: "Published" },
};

function formatRelativeTime(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SocialHub() {
  const queryClient = useQueryClient();
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [publishPanel, setPublishPanel] = useState<{ contentItem?: ContentItem; editPost?: ScheduledPost } | null>(null);
  const [bulkDialog, setBulkDialog] = useState(false);

  const { data: contentReady, isLoading: contentLoading } = useQuery({
    queryKey: ["/api/social/content-ready"],
    queryFn: async () => {
      const res = await fetch("/api/social/content-ready");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ["/api/social/posts"],
    queryFn: async () => {
      const res = await fetch("/api/social/posts");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const contentItems: ContentItem[] = contentReady?.items || [];
  const posts: ScheduledPost[] = postsData?.posts || postsData || [];
  const recentPosts = posts.slice(0, 20);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedItems = contentItems.filter((i) => selectedIds.has(i.id));

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/social/content-ready"] });
    queryClient.invalidateQueries({ queryKey: ["/api/social/posts"] });
  };

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Share2 className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Social Publishing Hub</h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Schedule and publish across platforms</p>
            </div>
          </div>
          <a
            href="/social/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-sm hover:from-purple-500 hover:to-violet-400 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Post
          </a>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Content Ready</h2>
            <button
              onClick={() => {
                setMultiSelect(!multiSelect);
                setSelectedIds(new Set());
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={{
                borderColor: multiSelect ? "rgb(124,58,237)" : "var(--border-medium)",
                backgroundColor: multiSelect ? "rgba(124,58,237,0.1)" : "transparent",
                color: multiSelect ? "rgb(124,58,237)" : "var(--text-secondary)",
              }}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              {multiSelect ? "Cancel" : "Multi-select"}
            </button>
          </div>

          {contentLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl overflow-hidden animate-pulse" style={{ backgroundColor: "var(--surface)" }}>
                  <div className="h-36" style={{ backgroundColor: "var(--surface-hover)" }} />
                  <div className="p-4 space-y-2">
                    <div className="h-4 rounded w-3/4" style={{ backgroundColor: "var(--surface-hover)" }} />
                    <div className="h-3 rounded w-1/2" style={{ backgroundColor: "var(--surface-hover)" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : contentItems.length === 0 ? (
            <div className="rounded-xl border p-12 text-center" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
              <Inbox className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
              <h3 className="text-lg font-semibold mb-2">No content ready</h3>
              <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                Complete a video project or upload assets to start publishing
              </p>
              <a
                href="/projects/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-sm"
              >
                Create a Video
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {contentItems.map((item) => {
                const isSelected = selectedIds.has(item.id);
                const pubStatus = publishStatusConfig[item.publishStatus] || publishStatusConfig.unpublished;
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border overflow-hidden transition-all group cursor-pointer ${isSelected ? "ring-2 ring-purple-500" : "hover:shadow-lg"}`}
                    style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}
                    onClick={() => multiSelect && toggleSelect(item.id)}
                  >
                    <div className="h-36 relative overflow-hidden" style={{ backgroundColor: "var(--surface-hover)" }}>
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          {item.mediaType === "video" ? (
                            <Video className="w-10 h-10" style={{ color: "var(--text-muted)" }} />
                          ) : (
                            <Image className="w-10 h-10" style={{ color: "var(--text-muted)" }} />
                          )}
                        </div>
                      )}
                      {multiSelect && (
                        <div className="absolute top-2 left-2">
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-purple-400" />
                          ) : (
                            <Square className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
                          )}
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: pubStatus.bg, color: pubStatus.text }}
                        >
                          {pubStatus.label}
                        </span>
                      </div>
                      {item.duration ? (
                        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                          {item.duration >= 60 ? `${Math.floor(item.duration / 60)}:${String(Math.round(item.duration % 60)).padStart(2, "0")}` : `0:${String(Math.round(item.duration)).padStart(2, "0")}`}
                        </div>
                      ) : null}
                    </div>
                    <div className="p-4">
                      <p className="font-medium text-sm line-clamp-1" style={{ color: "var(--text-primary)" }}>
                        {item.title}
                      </p>
                      <p className="text-xs mt-1 capitalize" style={{ color: "var(--text-muted)" }}>
                        {item.mediaType}{item.duration ? ` - ${Math.round(item.duration)}s` : ""} - {formatRelativeTime(item.createdAt)}
                      </p>
                      {!multiSelect && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPublishPanel({ contentItem: item });
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-600 to-violet-500 text-white hover:from-purple-500 hover:to-violet-400 transition-all"
                          >
                            <Send className="w-3 h-3" />
                            Publish
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPublishPanel({ contentItem: item });
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all"
                            style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                          >
                            <Calendar className="w-3 h-3" />
                            Schedule
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <a
              href="/social/calendar"
              className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              View Calendar <ArrowRight className="w-3 h-3" />
            </a>
          </div>

          {postsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: "var(--surface)" }} />
              ))}
            </div>
          ) : recentPosts.length === 0 ? (
            <div className="rounded-xl border p-8 text-center" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
              <Share2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
              <h3 className="text-base font-semibold mb-1">No posts yet</h3>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Create your first post to see activity here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentPosts.map((post) => {
                const config = statusConfig[post.status] || statusConfig.draft;
                const StatusIcon = config.icon;
                const firstCaption = post.captions ? Object.values(post.captions)[0] : "";
                return (
                  <div
                    key={post.id}
                    className="flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer"
                    style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}
                    onClick={() => setPublishPanel({ editPost: post })}
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: config.bg }}>
                      <StatusIcon className="w-4 h-4" style={{ color: config.text }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {post.title || (firstCaption ? String(firstCaption).substring(0, 60) : "Untitled")}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {post.platforms?.map((p) => (
                          <span key={p} className="text-[10px] capitalize" style={{ color: "var(--text-muted)" }}>
                            {p}
                          </span>
                        ))}
                        {post.scheduledFor && (
                          <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(post.scheduledFor).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className="text-[10px] px-2.5 py-1 rounded-full font-medium shrink-0"
                      style={{ backgroundColor: config.bg, color: config.text }}
                    >
                      {config.label}
                    </span>
                    {post.status === "draft" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPublishPanel({ editPost: post });
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all shrink-0"
                        style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                      >
                        Resume
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {multiSelect && selectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 rounded-2xl shadow-2xl z-40"
          style={{ backgroundColor: "var(--menu-bg)", border: "1px solid var(--border-medium)" }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => setBulkDialog(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white text-sm font-medium hover:from-purple-500 hover:to-violet-400 transition-all"
          >
            <Calendar className="w-4 h-4" />
            Bulk Schedule
          </button>
          <button
            onClick={() => {
              setSelectedIds(new Set());
              setMultiSelect(false);
            }}
            className="text-xs" style={{ color: "var(--text-muted)" }}
          >
            Clear
          </button>
        </div>
      )}

      {publishPanel && (
        <PublishingPanel
          open={true}
          onClose={() => setPublishPanel(null)}
          onSuccess={refreshData}
          contentItem={publishPanel.contentItem}
          editPost={publishPanel.editPost}
        />
      )}

      {bulkDialog && (
        <BulkScheduleDialog
          open={true}
          onClose={() => setBulkDialog(false)}
          onSuccess={refreshData}
          items={selectedItems}
        />
      )}
    </div>
  );
}

export default SocialHub;
