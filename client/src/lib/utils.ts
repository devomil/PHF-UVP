import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function sanitizeFilenameBase(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "asset";
}

function inferExtension(url: string, contentType?: string, fallback?: string): string {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("webm")) return "webm";
  if (ct.includes("quicktime") || ct.includes("mov")) return "mov";
  const m = url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  return fallback || "bin";
}

export interface DownloadAssetOptions {
  /** Base filename without extension. Will be sanitized. */
  filename?: string;
  /** Fallback extension when content-type and URL both lack one. */
  fallbackExt?: string;
  /** Optional toast callback for user feedback. */
  toast?: (args: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
}

/**
 * Downloads a remote asset to disk using a real Save dialog.
 *
 * Routes through a server-side proxy (`/api/asset-library/download`) that
 * sets `Content-Disposition: attachment`, which forces the browser to save
 * the file regardless of cross-origin CORS restrictions.
 *
 * Falls back to a direct cross-origin link if the proxy is unreachable.
 */
export async function downloadAssetFile(url: string, options: DownloadAssetOptions = {}): Promise<void> {
  if (!url) return;
  const baseName = sanitizeFilenameBase(options.filename || "asset");
  const fallbackExt = options.fallbackExt || inferExtension(url, undefined, "bin");
  const finalName = `${baseName}.${inferExtension(url, undefined, fallbackExt)}`;

  try {
    const proxied = `/api/asset-library/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(finalName)}`;
    const a = document.createElement("a");
    a.href = proxied;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    options.toast?.({ title: "Download started", description: finalName });
  } catch {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = finalName;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      options.toast?.({
        title: "Opened in new tab",
        description: "Right-click the file and choose Save As if your browser blocked the direct download.",
      });
    } catch {
      options.toast?.({
        title: "Download failed",
        description: "Could not start the download. Please try again.",
        variant: "destructive",
      });
    }
  }
}
