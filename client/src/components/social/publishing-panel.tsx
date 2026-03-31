import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  X,
  Sparkles,
  Send,
  Calendar,
  Clock,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Globe,
  Hash,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PLATFORMS = [
  { id: "twitter", label: "X / Twitter", color: "#1DA1F2", charLimit: 280, aspect: "16:9" },
  { id: "instagram", label: "Instagram", color: "#E4405F", charLimit: 2200, aspect: "1:1, 9:16" },
  { id: "tiktok", label: "TikTok", color: "#010101", charLimit: 2200, aspect: "9:16" },
  { id: "facebook", label: "Facebook", color: "#1877F2", charLimit: 63206, aspect: "16:9" },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", charLimit: 3000, aspect: "16:9" },
  { id: "youtube", label: "YouTube", color: "#FF0000", charLimit: 5000, aspect: "16:9" },
  { id: "pinterest", label: "Pinterest", color: "#BD081C", charLimit: 500, aspect: "2:3" },
  { id: "threads", label: "Threads", color: "#000000", charLimit: 500, aspect: "1:1" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "UTC", label: "UTC" },
];

function getAspectCompatibility(contentAspect: string | undefined, platformAspect: string): "green" | "yellow" | "red" {
  if (!contentAspect) return "yellow";
  const platformAspects = platformAspect.split(",").map((a) => a.trim());
  if (platformAspects.some((a) => a === contentAspect)) return "green";
  if (contentAspect === "16:9" || contentAspect === "1:1") return "yellow";
  return "yellow";
}

interface PublishingPanelProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  prefillDate?: string;
  contentItem?: {
    id: string;
    type: "project" | "asset";
    title: string;
    mediaUrl: string;
    mediaType: string;
    thumbnailUrl?: string;
    aspectRatio?: string;
    duration?: number;
  };
  editPost?: {
    id: number;
    title?: string;
    captions?: Record<string, string>;
    hashtags?: Record<string, string[]>;
    platforms?: string[];
    scheduledFor?: string;
    status?: string;
  };
}

export default function PublishingPanel({ open, onClose, onSuccess, prefillDate, contentItem, editPost }: PublishingPanelProps) {
  const { toast } = useToast();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [hashtags, setHashtags] = useState<Record<string, string[]>>({});
  const [title, setTitle] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
  const [captionTopic, setCaptionTopic] = useState("");
  const [captionTone, setCaptionTone] = useState("professional");
  const [previewPlatform, setPreviewPlatform] = useState<string | null>(null);

  useEffect(() => {
    if (editPost) {
      setSelectedPlatforms(editPost.platforms || []);
      setCaptions(editPost.captions || {});
      setHashtags(editPost.hashtags || {});
      setTitle(editPost.title || "");
      if (editPost.scheduledFor) {
        const d = new Date(editPost.scheduledFor);
        setScheduleDate(d.toISOString().split("T")[0]);
        setScheduleTime(d.toTimeString().slice(0, 5));
      }
    } else if (contentItem) {
      setTitle(contentItem.title || "");
      setCaptionTopic(contentItem.title || "");
    }
    if (prefillDate) {
      setScheduleDate(prefillDate);
    }
  }, [editPost, contentItem, prefillDate]);

  const { data: optimalTimes } = useQuery({
    queryKey: ["optimal-times", selectedPlatforms],
    queryFn: async () => {
      if (selectedPlatforms.length === 0) return [];
      const res = await fetch(`/api/social/optimal-times?platforms=${selectedPlatforms.join(",")}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.times || []);
    },
    enabled: selectedPlatforms.length > 0,
  });

  const generateCaptions = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/social/generate-captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: selectedPlatforms.length > 0 ? selectedPlatforms : ["instagram"],
          topic: captionTopic || title || "our latest content",
          tone: captionTone,
          projectId: contentItem?.type === "project" ? contentItem.id : undefined,
          assetId: contentItem?.type === "asset" ? contentItem.id : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate captions");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.byPlatform) {
        const newCaptions: Record<string, string> = {};
        const newHashtags: Record<string, string[]> = {};
        for (const [platform, info] of Object.entries(data.byPlatform)) {
          const item = info as { caption: string; hashtags: string[] };
          newCaptions[platform] = item.caption;
          newHashtags[platform] = item.hashtags || [];
        }
        setCaptions((prev) => ({ ...prev, ...newCaptions }));
        setHashtags((prev) => ({ ...prev, ...newHashtags }));
      } else if (data.captions?.length > 0) {
        const newCaptions: Record<string, string> = {};
        const newHashtags: Record<string, string[]> = {};
        for (const c of data.captions) {
          newCaptions[c.platform] = c.caption;
          newHashtags[c.platform] = c.hashtags || [];
        }
        setCaptions((prev) => ({ ...prev, ...newCaptions }));
        setHashtags((prev) => ({ ...prev, ...newHashtags }));
      }
      toast({ title: "Captions generated", description: "AI captions have been filled in for your selected platforms" });
    },
    onError: () => {
      toast({ title: "Caption generation failed", variant: "destructive" });
    },
  });

  const suggestHashtags = useMutation({
    mutationFn: async (platform: string) => {
      const res = await fetch("/api/social/generate-captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: [platform],
          topic: captionTopic || title || captions[platform]?.substring(0, 100) || "content",
          tone: captionTone,
          hashtagsOnly: true,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data, platform) => {
      if (data.byPlatform?.[platform]?.hashtags) {
        setHashtags((prev) => ({ ...prev, [platform]: data.byPlatform[platform].hashtags }));
      } else if (data.captions?.[0]?.hashtags) {
        setHashtags((prev) => ({ ...prev, [platform]: data.captions[0].hashtags }));
      }
    },
  });

  const savePost = useMutation({
    mutationFn: async (action: "draft" | "schedule" | "publish") => {
      const scheduledFor =
        action === "schedule" && scheduleDate && scheduleTime
          ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
          : undefined;

      if (editPost) {
        const res = await fetch(`/api/social/posts/${editPost.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ captions, hashtags, platforms: selectedPlatforms, title, scheduledFor, timezone }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to update post");
        }
        if (action === "publish") {
          const pubRes = await fetch(`/api/social/posts/${editPost.id}/publish`, { method: "POST" });
          if (!pubRes.ok) {
            const errData = await pubRes.json().catch(() => ({}));
            throw new Error(errData.error || "Failed to publish");
          }
        }
        return res.json();
      }

      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captions,
          hashtags,
          platforms: selectedPlatforms,
          title,
          scheduledFor,
          timezone,
          mediaUrl: contentItem?.mediaUrl,
          mediaType: contentItem?.mediaType,
          thumbnailUrl: contentItem?.thumbnailUrl,
          projectId: contentItem?.type === "project" ? contentItem.id : undefined,
          assetId: contentItem?.type === "asset" ? contentItem.id : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create post");
      }
      const post = await res.json();
      if (action === "publish" && post.id) {
        const pubRes = await fetch(`/api/social/posts/${post.id}/publish`, { method: "POST" });
        if (!pubRes.ok) {
          const errData = await pubRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to publish");
        }
      }
      return post;
    },
    onSuccess: (_, action) => {
      const messages: Record<string, string> = {
        draft: "Draft saved",
        schedule: "Post scheduled",
        publish: "Post published successfully",
      };
      toast({ title: messages[action] || "Success" });
      onSuccess?.();
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const fillOptimalTime = (time: string) => {
    const today = new Date();
    const [timePart, meridiem] = time.split(" ");
    let [hours, minutes] = timePart.split(":").map(Number);
    if (meridiem === "PM" && hours !== 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    today.setDate(today.getDate() + 1);
    setScheduleDate(today.toISOString().split("T")[0]);
    setScheduleTime(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0" style={{ backgroundColor: "var(--overlay-bg)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-xl h-full overflow-y-auto shadow-2xl animate-slide-in-right"
        style={{ backgroundColor: "var(--app-bg)" }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
          style={{ backgroundColor: "var(--app-bg)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            {editPost ? "Edit Post" : "Publish Content"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--text-muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {contentItem && (
            <div className="flex gap-3 p-3 rounded-lg" style={{ backgroundColor: "var(--surface)" }}>
              {contentItem.thumbnailUrl && (
                <img src={contentItem.thumbnailUrl} alt="" className="w-16 h-16 rounded-lg object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>
                  {contentItem.title}
                </p>
                <p className="text-xs mt-0.5 capitalize" style={{ color: "var(--text-muted)" }}>
                  {contentItem.mediaType} - {contentItem.type}
                  {contentItem.duration ? ` - ${Math.round(contentItem.duration)}s` : ""}
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Internal title"
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Platforms
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map((p) => {
                const selected = selectedPlatforms.includes(p.id);
                const compat = getAspectCompatibility(contentItem?.aspectRatio, p.aspect);
                const compatColor = compat === "green" ? "rgb(34,197,94)" : compat === "yellow" ? "rgb(234,179,8)" : "rgb(239,68,68)";
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border"
                    style={{
                      borderColor: selected ? p.color : "var(--border-subtle)",
                      backgroundColor: selected ? `${p.color}15` : "transparent",
                      color: selected ? p.color : "var(--text-secondary)",
                    }}
                  >
                    <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: `${p.color}20` }}>
                      {selected && <CheckCircle className="w-3 h-3" style={{ color: p.color }} />}
                    </div>
                    <span>{p.label}</span>
                    <span className="ml-auto flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: compatColor }} title={`Aspect: ${p.aspect}`} />
                      <span className="text-[10px] opacity-60">{p.aspect}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Captions
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={captionTopic}
                  onChange={(e) => setCaptionTopic(e.target.value)}
                  placeholder="Topic..."
                  className="px-2 py-1 rounded text-xs outline-none w-24"
                  style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
                />
                <select
                  value={captionTone}
                  onChange={(e) => setCaptionTone(e.target.value)}
                  className="px-2 py-1 rounded text-xs outline-none"
                  style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
                >
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="humorous">Humorous</option>
                  <option value="inspirational">Inspirational</option>
                </select>
                <button
                  onClick={() => generateCaptions.mutate()}
                  disabled={generateCaptions.isPending}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50"
                >
                  {generateCaptions.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI
                </button>
              </div>
            </div>
            {selectedPlatforms.length === 0 ? (
              <div className="text-xs p-3 rounded-lg text-center" style={{ color: "var(--text-muted)", backgroundColor: "var(--surface)" }}>
                Select platforms above to write captions
              </div>
            ) : (
              <div className="space-y-3">
                {selectedPlatforms.map((pId) => {
                  const platform = PLATFORMS.find((p) => p.id === pId);
                  if (!platform) return null;
                  const caption = captions[pId] || "";
                  const charCount = caption.length;
                  const overLimit = charCount > platform.charLimit;
                  return (
                    <div key={pId}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium" style={{ color: platform.color }}>
                          {platform.label}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => suggestHashtags.mutate(pId)}
                            disabled={suggestHashtags.isPending}
                            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded transition-colors"
                            style={{ color: "var(--text-muted)" }}
                            title="Suggest hashtags"
                          >
                            <Hash className="w-2.5 h-2.5" />
                            Suggest
                          </button>
                          <button
                            onClick={() => setPreviewPlatform(previewPlatform === pId ? null : pId)}
                            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded transition-colors"
                            style={{ color: previewPlatform === pId ? platform.color : "var(--text-muted)" }}
                            title="Preview"
                          >
                            <Eye className="w-2.5 h-2.5" />
                          </button>
                          <span className={`text-[10px] ${overLimit ? "text-red-400" : ""}`} style={overLimit ? {} : { color: "var(--text-muted)" }}>
                            {charCount}/{platform.charLimit}
                          </span>
                        </div>
                      </div>
                      <textarea
                        value={caption}
                        onChange={(e) => setCaptions((prev) => ({ ...prev, [pId]: e.target.value }))}
                        placeholder={`Caption for ${platform.label}...`}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: `1px solid ${overLimit ? "rgba(239,68,68,0.5)" : "var(--border-medium)"}` }}
                      />
                      {hashtags[pId]?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {hashtags[pId].map((tag, i) => (
                            <span
                              key={i}
                              className="text-[10px] px-1.5 py-0.5 rounded-full cursor-pointer hover:line-through"
                              style={{ backgroundColor: `${platform.color}15`, color: platform.color }}
                              onClick={() => setHashtags((prev) => ({ ...prev, [pId]: prev[pId].filter((_, idx) => idx !== i) }))}
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {previewPlatform === pId && (
                        <div
                          className="mt-2 p-3 rounded-lg border"
                          style={{ borderColor: `${platform.color}30`, backgroundColor: "var(--surface)" }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: platform.color }}>
                              {platform.label[0]}
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>Your Brand</p>
                              <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>Just now</p>
                            </div>
                          </div>
                          {contentItem?.thumbnailUrl && (
                            <img src={contentItem.thumbnailUrl} alt="" className="w-full h-28 rounded object-cover mb-2" />
                          )}
                          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
                            {caption || "Your caption will appear here..."}
                          </p>
                          {hashtags[pId]?.length > 0 && (
                            <p className="text-[10px] mt-1" style={{ color: platform.color }}>
                              {hashtags[pId].map((t) => `#${t}`).join(" ")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Schedule
            </label>
            <div className="flex gap-3">
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
              />
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Globe className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="flex-1 px-2 py-1 rounded text-xs outline-none"
                style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
            {Array.isArray(optimalTimes) && optimalTimes.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                  <Clock className="w-3 h-3 inline mr-0.5" /> Optimal times
                </p>
                <div className="flex flex-wrap gap-1">
                  {optimalTimes.slice(0, 3).flatMap((ot: { platform: string; times: string[] }) =>
                    ot.times.slice(0, 2).map((t: string) => (
                      <button
                        key={`${ot.platform}-${t}`}
                        onClick={() => fillOptimalTime(t)}
                        className="text-[10px] px-2 py-0.5 rounded-full border transition-colors hover:bg-purple-500/10"
                        style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                      >
                        {t}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {savePost.isError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {(savePost.error as Error).message}
            </div>
          )}

          <div className="flex gap-3 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <button
              onClick={() => savePost.mutate("draft")}
              disabled={selectedPlatforms.length === 0 || savePost.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all disabled:opacity-40"
              style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
            >
              <Save className="w-4 h-4" />
              Save Draft
            </button>
            <button
              onClick={() => savePost.mutate("schedule")}
              disabled={selectedPlatforms.length === 0 || !scheduleDate || !scheduleTime || savePost.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all disabled:opacity-40"
              style={{ borderColor: "rgb(124,58,237)", color: "rgb(124,58,237)" }}
            >
              <Calendar className="w-4 h-4" />
              Schedule
            </button>
            <button
              onClick={() => savePost.mutate("publish")}
              disabled={selectedPlatforms.length === 0 || savePost.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white text-sm font-medium hover:from-purple-500 hover:to-violet-400 transition-all disabled:opacity-40 ml-auto"
            >
              {savePost.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Publish Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
