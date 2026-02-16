import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const assetTypes = ["all", "image", "video", "logo", "audio"];

const mockAssets = [
  { id: 1, name: "Company Logo", type: "logo", size: "24 KB", date: "2026-02-10" },
  { id: 2, name: "Product Hero Shot", type: "image", size: "1.2 MB", date: "2026-02-11" },
  { id: 3, name: "Background Music", type: "audio", size: "3.4 MB", date: "2026-02-12" },
  { id: 4, name: "B-Roll Footage", type: "video", size: "45 MB", date: "2026-02-13" },
  { id: 5, name: "Icon Set", type: "image", size: "156 KB", date: "2026-02-14" },
  { id: 6, name: "Voiceover Draft", type: "audio", size: "2.1 MB", date: "2026-02-15" },
];

const typeColors: Record<string, string> = {
  image: "bg-blue-900 text-blue-300",
  video: "bg-purple-900 text-purple-300",
  logo: "bg-indigo-900 text-indigo-300",
  audio: "bg-cyan-900 text-cyan-300",
};

export default function AssetLibrary() {
  const [activeType, setActiveType] = useState("all");

  const filtered = activeType === "all"
    ? mockAssets
    : mockAssets.filter((a) => a.type === activeType);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Asset Library</h1>
            <p className="text-gray-400 mt-1">Manage your brand assets and media files</p>
          </div>
          <Button className="bg-purple-600 hover:bg-purple-700">Upload Asset</Button>
        </div>

        <Card className="bg-gray-900 border-gray-800 border-dashed mb-6">
          <CardContent className="py-8">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-800 flex items-center justify-center">
                <span className="text-2xl text-gray-500">+</span>
              </div>
              <p className="text-gray-400">Drag and drop files here, or click to browse</p>
              <p className="text-sm text-gray-600 mt-1">Supports images, videos, logos, and audio files</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2 mb-6">
          {assetTypes.map((t) => (
            <Button
              key={t}
              variant={activeType === t ? "default" : "outline"}
              size="sm"
              className={activeType === t
                ? "bg-purple-600 hover:bg-purple-700"
                : "border-gray-700 text-gray-400 hover:bg-gray-800"}
              onClick={() => setActiveType(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((asset) => (
            <Card key={asset.id} className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
              <CardContent className="pt-4">
                <div className="w-full h-32 bg-gray-800 rounded-lg mb-3 flex items-center justify-center">
                  <span className="text-gray-600 text-sm">{asset.type} preview</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{asset.name}</p>
                    <p className="text-sm text-gray-500">{asset.size} · {asset.date}</p>
                  </div>
                  <Badge className={typeColors[asset.type]}>{asset.type}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300">← Back to Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
