import { useState } from "react";
import { Link } from "wouter";
import { CloudUpload, ImageIcon, Video, Mic, FileImage, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const assetTypes = ["all", "images", "videos", "logos", "audio"];

const mockAssets = [
  { id: 1, name: "Company Logo", type: "logo", size: "24 KB", date: "2026-02-10" },
  { id: 2, name: "Product Hero Shot", type: "image", size: "1.2 MB", date: "2026-02-11" },
  { id: 3, name: "Background Music", type: "audio", size: "3.4 MB", date: "2026-02-12" },
  { id: 4, name: "B-Roll Footage", type: "video", size: "45 MB", date: "2026-02-13" },
  { id: 5, name: "Icon Set", type: "image", size: "156 KB", date: "2026-02-14" },
  { id: 6, name: "Voiceover Draft", type: "audio", size: "2.1 MB", date: "2026-02-15" },
];

const typeIcons: Record<string, React.ReactNode> = {
  image: <ImageIcon className="w-8 h-8 text-blue-400/50" />,
  video: <Video className="w-8 h-8 text-purple-400/50" />,
  logo: <FileImage className="w-8 h-8 text-indigo-400/50" />,
  audio: <Mic className="w-8 h-8 text-cyan-400/50" />,
};

const typeGradients: Record<string, string> = {
  image: "from-blue-500/20 to-blue-600/10",
  video: "from-purple-500/20 to-purple-600/10",
  logo: "from-indigo-500/20 to-indigo-600/10",
  audio: "from-cyan-500/20 to-cyan-600/10",
};

const typeBadgeColors: Record<string, string> = {
  image: "bg-blue-500/20 text-blue-300",
  video: "bg-purple-500/20 text-purple-300",
  logo: "bg-indigo-500/20 text-indigo-300",
  audio: "bg-cyan-500/20 text-cyan-300",
};

export default function AssetLibrary() {
  const [activeType, setActiveType] = useState("all");

  const filtered = activeType === "all"
    ? mockAssets
    : mockAssets.filter((a) => a.type === activeType.slice(0, -1));

  const usedStorage = 52;
  const totalStorage = 100;

  const formatTypeLabel = (type: string) => {
    return type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Asset Library</h1>
          <p className="mt-2" style={{ color: "var(--text-secondary)" }}>Manage your brand assets and media files</p>
        </div>
        <Button className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 gap-2">
          <CloudUpload className="w-4 h-4" />
          Upload
        </Button>
      </div>

      <div
        className="mb-8 p-8 border-2 border-dashed rounded-2xl transition-all duration-300 hover:border-purple-500/30 hover:bg-purple-500/[0.03] group cursor-pointer"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-medium)" }}
      >
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <CloudUpload className="w-12 h-12 group-hover:text-purple-400 transition-colors" style={{ color: "var(--text-muted)" }} />
          </div>
          <p className="text-lg mb-1" style={{ color: "var(--text-primary)" }}>Drag files here or click to browse</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Supports images, videos, logos, and audio files</p>
        </div>
      </div>

      <div className="flex gap-3 mb-8 flex-wrap">
        {assetTypes.map((t) => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className="px-4 py-2 rounded-full transition-all duration-200"
            style={{
              backgroundColor: activeType === t ? "var(--surface-active)" : "transparent",
              color: activeType === t ? "var(--text-primary)" : "var(--text-muted)",
            }}
            onMouseEnter={(e) => {
              if (activeType !== t) {
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeType !== t) {
                e.currentTarget.style.color = "var(--text-muted)";
              }
            }}
          >
            {formatTypeLabel(t)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        {filtered.map((asset) => (
          <div
            key={asset.id}
            className="border rounded-xl overflow-hidden group cursor-pointer hover:scale-[1.02] transition-transform duration-300"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
          >
            <div className={`h-40 bg-gradient-to-br ${typeGradients[asset.type]} flex items-center justify-center relative`}>
              {typeIcons[asset.type]}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center">
                <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            </div>
            <div className="p-4">
              <p className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>{asset.name}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{asset.size} · {asset.date}</p>
              <div className="mt-3 flex justify-start">
                <Badge className={`text-xs ${typeBadgeColors[asset.type]}`}>
                  {asset.type}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>Storage Used: {usedStorage} GB / {totalStorage} GB</p>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border-subtle)" }}>
          <div
            className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-500"
            style={{ width: `${(usedStorage / totalStorage) * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-8">
        <Link href="/dashboard" className="text-sm transition-colors duration-200" style={{ color: "var(--text-muted)" }}>
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
