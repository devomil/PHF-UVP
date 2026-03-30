import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Sparkles, Send, Calendar, Clock } from "lucide-react";

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

function SocialNewPost() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [captionTopic, setCaptionTopic] = useState("");
  const [captionTone, setCaptionTone] = useState("professional");

  const createPost = useMutation({
    mutationFn: async () => {
      const hashtagList = hashtags
        .split(/[,\s]+/)
        .map((h) => h.trim().replace(/^#/, ""))
        .filter(Boolean);

      let scheduledFor: string | undefined;
      if (scheduleMode === "later" && scheduledDate && scheduledTime) {
        scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }

      const captionsObj: Record<string, string> = {};
      for (const p of selectedPlatforms) captionsObj[p] = caption;

      const hashtagsObj: Record<string, string[]> = {};
      if (hashtagList.length > 0) {
        for (const p of selectedPlatforms) hashtagsObj[p] = hashtagList;
      }

      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captions: captionsObj,
          title: title || undefined,
          platforms: selectedPlatforms,
          hashtags: hashtagsObj,
          scheduledFor,
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
      if (data.captions?.length > 0) {
        setCaption(data.captions[0].caption);
        const allHashtags = data.captions.flatMap((c: any) => c.hashtags || []);
        const unique = [...new Set(allHashtags)].slice(0, 10);
        setHashtags(unique.join(", "));
      }
    },
  });

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button
        onClick={() => setLocation("/social")}
        className="flex items-center gap-1.5 text-sm mb-6 transition-colors"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Social Hub
      </button>

      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
        Create Social Post
      </h1>

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
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--input-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-medium)",
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Platforms
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => togglePlatform(p.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
                style={{
                  borderColor: selectedPlatforms.includes(p.id) ? p.color : "var(--border-medium)",
                  backgroundColor: selectedPlatforms.includes(p.id) ? `${p.color}20` : "transparent",
                  color: selectedPlatforms.includes(p.id) ? p.color : "var(--text-secondary)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Caption
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={captionTopic}
                onChange={(e) => setCaptionTopic(e.target.value)}
                placeholder="Topic..."
                className="px-3 py-1 rounded-lg text-xs outline-none"
                style={{
                  backgroundColor: "var(--input-bg)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-medium)",
                  width: "120px",
                }}
              />
              <select
                value={captionTone}
                onChange={(e) => setCaptionTone(e.target.value)}
                className="px-2 py-1 rounded-lg text-xs outline-none"
                style={{
                  backgroundColor: "var(--input-bg)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-medium)",
                }}
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="humorous">Humorous</option>
                <option value="inspirational">Inspirational</option>
              </select>
              <button
                onClick={() => generateCaptions.mutate()}
                disabled={generateCaptions.isPending}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                {generateCaptions.isPending ? "Generating..." : "AI Generate"}
              </button>
            </div>
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write your caption..."
            rows={5}
            className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none transition-colors"
            style={{
              backgroundColor: "var(--input-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-medium)",
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Hashtags
          </label>
          <input
            type="text"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="trending, viral, marketing (comma separated)"
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--input-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-medium)",
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Schedule
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setScheduleMode("now")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all"
              style={{
                borderColor: scheduleMode === "now" ? "rgb(124,58,237)" : "var(--border-medium)",
                backgroundColor: scheduleMode === "now" ? "rgba(124,58,237,0.1)" : "transparent",
                color: scheduleMode === "now" ? "rgb(124,58,237)" : "var(--text-secondary)",
              }}
            >
              <Send className="w-4 h-4" />
              Save as Draft
            </button>
            <button
              onClick={() => setScheduleMode("later")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all"
              style={{
                borderColor: scheduleMode === "later" ? "rgb(124,58,237)" : "var(--border-medium)",
                backgroundColor: scheduleMode === "later" ? "rgba(124,58,237,0.1)" : "transparent",
                color: scheduleMode === "later" ? "rgb(124,58,237)" : "var(--text-secondary)",
              }}
            >
              <Calendar className="w-4 h-4" />
              Schedule
            </button>
          </div>
          {scheduleMode === "later" && (
            <div className="flex gap-3 mt-3">
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="px-4 py-2 rounded-lg text-sm outline-none"
                style={{
                  backgroundColor: "var(--input-bg)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-medium)",
                }}
              />
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="px-4 py-2 rounded-lg text-sm outline-none"
                style={{
                  backgroundColor: "var(--input-bg)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-medium)",
                }}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button
            onClick={() => createPost.mutate()}
            disabled={!caption || selectedPlatforms.length === 0 || createPost.isPending}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-sm hover:from-purple-500 hover:to-violet-400 transition-all disabled:opacity-50"
          >
            {createPost.isPending ? "Creating..." : scheduleMode === "later" ? "Schedule Post" : "Save Draft"}
          </button>
        </div>

        {createPost.isError && (
          <p className="text-sm text-red-500">{(createPost.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}

export default SocialNewPost;
