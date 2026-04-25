import { useState } from "react";
import { useLocation } from "wouter";
import { Download, Library, Share2, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface SceneImageActionsProps {
  imageUrl: string;
  projectId?: string | number;
  sceneId?: string;
  projectTitle?: string;
  sceneIndex?: number;
  visualDirection?: string;
  width?: number;
  height?: number;
  /** "image" | "video" — defaults to "image". Drives asset library tagging, Social Hub mediaType, and download extension. */
  mediaType?: "image" | "video";
  variant?: "bar" | "compact";
  className?: string;
}

function detectMediaType(url: string, hint?: "image" | "video"): "image" | "video" {
  if (hint) return hint;
  const lower = url.split("?")[0].toLowerCase();
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/.test(lower)) return "video";
  return "image";
}

function sanitizeFilename(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";
}

async function captureVideoPosterDataUrl(videoUrl: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      let settled = false;
      const cleanup = () => {
        try { video.src = ""; video.remove(); } catch {}
      };
      const finish = (val: string | undefined) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(val);
      };
      const grab = () => {
        try {
          const w = video.videoWidth || 1280;
          const h = video.videoHeight || 720;
          const maxDim = 640;
          const scale = Math.min(1, maxDim / Math.max(w, h));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) return finish(undefined);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL("image/jpeg", 0.78));
        } catch {
          finish(undefined);
        }
      };
      video.addEventListener("loadeddata", () => {
        if (video.readyState >= 2) {
          try { video.currentTime = Math.min(0.1, (video.duration || 1) / 4); } catch { grab(); }
        }
      });
      video.addEventListener("seeked", grab, { once: true });
      video.addEventListener("error", () => finish(undefined), { once: true });
      setTimeout(() => finish(undefined), 8000);
      video.src = videoUrl;
    } catch {
      resolve(undefined);
    }
  });
}

export function SceneImageActions({
  imageUrl,
  projectId,
  sceneId,
  projectTitle,
  sceneIndex,
  visualDirection,
  width,
  height,
  mediaType: mediaTypeProp,
  variant = "bar",
  className = "",
}: SceneImageActionsProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const mediaType = detectMediaType(imageUrl, mediaTypeProp);
  const isVideo = mediaType === "video";

  const handleDownload = async () => {
    if (!imageUrl || downloading) return;
    setDownloading(true);

    const titlePart = sanitizeFilename(projectTitle || "scene");
    const scenePart = typeof sceneIndex === "number" ? `-scene${sceneIndex + 1}` : "";
    const fallbackExt = (() => {
      const m = imageUrl.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
      return m ? m[1].toLowerCase() : (isVideo ? "mp4" : "png");
    })();

    try {
      const res = await fetch(imageUrl, { credentials: "omit", mode: "cors" });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const ext = (() => {
        const ct = blob.type || "";
        if (ct.includes("png")) return "png";
        if (ct.includes("webp")) return "webp";
        if (ct.includes("gif")) return "gif";
        if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
        return fallbackExt;
      })();
      const filename = `${titlePart}${scenePart}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Image downloaded", description: filename });
    } catch (err: any) {
      try {
        const filename = `${titlePart}${scenePart}.${fallbackExt}`;
        const a = document.createElement("a");
        a.href = imageUrl;
        a.download = filename;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast({
          title: "Image opened",
          description: "Right-click the image and choose Save As if your browser blocked the direct download.",
        });
      } catch {
        toast({
          title: "Download failed",
          description: err?.message || "Could not download the image",
          variant: "destructive",
        });
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!imageUrl || saving) return;
    setSaving(true);
    try {
      let videoThumbnail: string | undefined;
      if (isVideo) {
        videoThumbnail = await captureVideoPosterDataUrl(imageUrl).catch(() => undefined);
      }
      const res = await fetch("/api/asset-library/save-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetUrl: imageUrl,
          assetType: mediaType,
          thumbnailUrl: videoThumbnail || (isVideo ? undefined : imageUrl),
          provider: "project-export",
          contentType: "scene-export",
          projectId: projectId ? String(projectId) : undefined,
          sceneId: sceneId || undefined,
          width,
          height,
          visualDirection,
          prompt: visualDirection || (projectTitle ? `From "${projectTitle}"` : "Saved from project"),
          tags: ["saved-from-project", projectTitle ? sanitizeFilename(projectTitle) : "project"].filter(Boolean),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed: ${res.status}`);
      }
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
      toast({
        title: "Saved to Asset Library",
        description: `${isVideo ? "Video" : "Image"} is now reusable across projects.`,
      });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message || "Could not save to library", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSendToSocial = () => {
    if (!imageUrl) return;
    const params = new URLSearchParams();
    params.set("mediaUrl", imageUrl);
    params.set("mediaType", mediaType);
    if (projectTitle) params.set("title", projectTitle);
    if (projectId) params.set("projectId", String(projectId));
    setLocation(`/social/new?${params.toString()}`);
  };

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!imageUrl || downloading}
          title="Download image"
          data-testid="button-image-download-compact"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/10 text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={handleSaveToLibrary}
          disabled={!imageUrl || saving}
          title="Save to Asset Library"
          data-testid="button-image-save-compact"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/10 text-violet-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedOk ? <Check className="w-3.5 h-3.5" /> : <Library className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={handleSendToSocial}
          disabled={!imageUrl}
          title="Send to Social Hub"
          data-testid="button-image-social-compact"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/10 text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`border rounded-xl p-4 mt-4 ${className}`}
      style={{
        borderColor: "var(--border-subtle)",
        background: "linear-gradient(135deg, rgba(34,211,238,0.06), rgba(139,92,246,0.06))",
      }}
      data-testid="scene-image-actions-bar"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
              Image Ready
            </span>
            <h4 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Ship it without rendering video
            </h4>
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Download as a file, save to your reusable library, or post it directly to social.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!imageUrl || downloading}
            data-testid="button-image-download"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download
          </button>
          <button
            type="button"
            onClick={handleSaveToLibrary}
            disabled={!imageUrl || saving}
            data-testid="button-image-save"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedOk ? <Check className="w-4 h-4" /> : <Library className="w-4 h-4" />}
            {savedOk ? "Saved" : "Save to Assets"}
          </button>
          <button
            type="button"
            onClick={handleSendToSocial}
            disabled={!imageUrl}
            data-testid="button-image-social"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Share2 className="w-4 h-4" />
            Send to Social Hub
          </button>
        </div>
      </div>
    </div>
  );
}
