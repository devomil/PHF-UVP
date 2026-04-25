import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Sparkles, Send, Calendar, Save, Loader2, AlertCircle, CheckCircle, Image as ImageIcon, X } from "lucide-react";

const PLATFORMS = [
  { id: "twitter", label: "X / Twitter", color: "#1DA1F2", charLimit: 280 },
  { id: "instagram", label: "Instagram", color: "#E4405F", charLimit: 2200 },
  { id: "tiktok", label: "TikTok", color: "#69C9D0", charLimit: 2200 },
  { id: "facebook", label: "Facebook", color: "#1877F2", charLimit: 63206 },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", charLimit: 3000 },
  { id: "youtube", label: "YouTube", color: "#FF0000", charLimit: 5000 },
  { id: "pinterest", label: "Pinterest", color: "#BD081C", charLimit: 500 },
  { id: "threads", label: "Threads", color: "#888888", charLimit: 500 },
];

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "humorous", label: "Humorous" },
  { value: "inspirational", label: "Inspirational" },
];

function SocialNewPost() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [hashtags, setHashtags] = useState<Record<string, string[]>>({});
  const [scheduleMode, setScheduleMode] = useState<"draft" | "schedule">("draft");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [captionTopic, setCaptionTopic] = useState("");
  const [captionTone, setCaptionTone] = useState("professional");
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [mediaType, setMediaType] = useState<"image" | "video" | undefined>(undefined);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mediaUrl");
    const t = params.get("mediaType");
    const tt = params.get("title");
    const pid = params.get("projectId");
    setMediaUrl(m || undefined);
    setMediaType(t === "image" || t === "video" ? t : undefined);
    setProjectId(pid || undefined);
    if (tt) setTitle(tt);
  }, [location]);

  const createPost = useMutation({
    mutationFn: async () => {
      let scheduledFor: string | undefined;
      if (scheduleMode === "schedule" && scheduledDate && scheduledTime) {
        scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captions,
          title: title || undefined,
          platforms: selectedPlatforms,
          hashtags,
          scheduledFor,
          mediaUrl: mediaUrl || undefined,
          mediaType: mediaType || (mediaUrl ? "image" : undefined),
          thumbnailUrl: mediaType === "image" ? mediaUrl : undefined,
          projectId: projectId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create post");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/posts"] });
      setLocation("/social");
    },
  });

  const generateCaptions = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/social/generate-captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: selectedPlatforms.length > 0 ? selectedPlatforms : ["instagram"],
          topic: captionTopic || title || "our latest video",
          tone: captionTone,
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
    },
  });

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const hasContent = selectedPlatforms.length > 0 && selectedPlatforms.some((p) => captions[p]?.trim());
  const scheduleValid = scheduleMode === "draft" || (scheduledDate && scheduledTime);
  const canSubmit = hasContent && scheduleValid;

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => setLocation("/social")}
          className="flex items-center gap-1.5 text-sm mb-6 transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Social Hub
        </button>

        <h1 className="text-2xl font-bold mb-8">Create Social Post</h1>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Internal title for this post"
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
            />
          </div>

          {mediaUrl && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Attached Media
              </label>
              <div
                className="flex items-start gap-3 p-3 rounded-lg border"
                style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--input-bg)" }}
                data-testid="attached-media-preview"
              >
                {mediaType === "video" ? (
                  <video src={mediaUrl} className="w-20 h-20 rounded object-cover bg-black" muted />
                ) : (
                  <img src={mediaUrl} alt="Attached media" className="w-20 h-20 rounded object-cover bg-black" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    <ImageIcon className="w-3.5 h-3.5" />
                    {mediaType === "video" ? "Video attached" : "Image attached"}
                  </div>
                  <p className="text-xs mt-1 truncate" style={{ color: "var(--text-muted)" }}>
                    {mediaUrl}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setMediaUrl(undefined); setMediaType(undefined); }}
                  className="text-xs px-2 py-1 rounded hover:bg-white/10 inline-flex items-center gap-1"
                  style={{ color: "var(--text-muted)" }}
                  title="Remove attached media"
                  data-testid="button-remove-attached-media"
                >
                  <X className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Platforms
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PLATFORMS.map((p) => {
                const selected = selectedPlatforms.includes(p.id);
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
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Captions</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={captionTopic}
                  onChange={(e) => setCaptionTopic(e.target.value)}
                  placeholder="Topic..."
                  className="px-2.5 py-1 rounded text-xs outline-none w-28"
                  style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
                />
                <select
                  value={captionTone}
                  onChange={(e) => setCaptionTone(e.target.value)}
                  className="px-2 py-1 rounded text-xs outline-none"
                  style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
                >
                  {TONES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => generateCaptions.mutate()}
                  disabled={generateCaptions.isPending}
                  className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50"
                >
                  {generateCaptions.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Generate
                </button>
              </div>
            </div>

            {selectedPlatforms.length === 0 ? (
              <div className="text-xs p-4 rounded-lg text-center" style={{ color: "var(--text-muted)", backgroundColor: "var(--surface)" }}>
                Select platforms above to write captions
              </div>
            ) : (
              <div className="space-y-4">
                {selectedPlatforms.map((pId) => {
                  const platform = PLATFORMS.find((p) => p.id === pId);
                  if (!platform) return null;
                  const caption = captions[pId] || "";
                  const overLimit = caption.length > platform.charLimit;
                  return (
                    <div key={pId}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium" style={{ color: platform.color }}>{platform.label}</span>
                        <span className={`text-[10px] ${overLimit ? "text-red-400" : ""}`} style={overLimit ? {} : { color: "var(--text-muted)" }}>
                          {caption.length}/{platform.charLimit}
                        </span>
                      </div>
                      <textarea
                        value={caption}
                        onChange={(e) => setCaptions((prev) => ({ ...prev, [pId]: e.target.value }))}
                        placeholder={`Caption for ${platform.label}...`}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{
                          backgroundColor: "var(--input-bg)",
                          color: "var(--text-primary)",
                          border: `1px solid ${overLimit ? "rgba(239,68,68,0.5)" : "var(--border-medium)"}`,
                        }}
                      />
                      {hashtags[pId]?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {hashtags[pId].map((tag, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${platform.color}15`, color: platform.color }}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Schedule</label>
            <div className="flex gap-3 mb-3">
              <button
                onClick={() => setScheduleMode("draft")}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all"
                style={{
                  borderColor: scheduleMode === "draft" ? "rgb(124,58,237)" : "var(--border-medium)",
                  backgroundColor: scheduleMode === "draft" ? "rgba(124,58,237,0.1)" : "transparent",
                  color: scheduleMode === "draft" ? "rgb(124,58,237)" : "var(--text-secondary)",
                }}
              >
                <Save className="w-4 h-4" />
                Save as Draft
              </button>
              <button
                onClick={() => setScheduleMode("schedule")}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all"
                style={{
                  borderColor: scheduleMode === "schedule" ? "rgb(124,58,237)" : "var(--border-medium)",
                  backgroundColor: scheduleMode === "schedule" ? "rgba(124,58,237,0.1)" : "transparent",
                  color: scheduleMode === "schedule" ? "rgb(124,58,237)" : "var(--text-secondary)",
                }}
              >
                <Calendar className="w-4 h-4" />
                Schedule
              </button>
            </div>
            {scheduleMode === "schedule" && (
              <div className="flex gap-3">
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
                />
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}
                />
              </div>
            )}
          </div>

          {createPost.isError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {(createPost.error as Error).message}
            </div>
          )}

          <div className="flex justify-end pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <button
              onClick={() => createPost.mutate()}
              disabled={!canSubmit || createPost.isPending}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-sm hover:from-purple-500 hover:to-violet-400 transition-all disabled:opacity-50"
            >
              {createPost.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {scheduleMode === "schedule" ? "Schedule Post" : "Save Draft"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SocialNewPost;
