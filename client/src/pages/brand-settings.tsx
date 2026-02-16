import { Palette, Type, Droplets, Image, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BrandSettings() {
  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Palette className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Brand Settings</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Configure your brand identity for video productions</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Type className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Brand Identity</h2>
            </div>
            <div className="border rounded-xl p-5 space-y-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Brand Name</label>
                <input
                  type="text"
                  placeholder="Your Brand Name"
                  className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Tagline</label>
                <input
                  type="text"
                  placeholder="Your brand tagline"
                  className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Website</label>
                <input
                  type="url"
                  placeholder="https://yourbrand.com"
                  className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Droplets className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Color Palette</h2>
            </div>
            <div className="border rounded-xl p-5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <div className="grid grid-cols-3 gap-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-purple-600 border-2 border-white/10 shadow-lg shadow-purple-500/20" />
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Primary</label>
                  <input
                    type="text"
                    defaultValue="#9333ea"
                    className="w-full border rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:border-purple-500/50 transition-colors"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-indigo-600 border-2 border-white/10 shadow-lg shadow-indigo-500/20" />
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Secondary</label>
                  <input
                    type="text"
                    defaultValue="#4f46e5"
                    className="w-full border rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:border-purple-500/50 transition-colors"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-cyan-500 border-2 border-white/10 shadow-lg shadow-cyan-500/20" />
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Accent</label>
                  <input
                    type="text"
                    defaultValue="#06b6d4"
                    className="w-full border rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:border-purple-500/50 transition-colors"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Image className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Logo Management</h2>
            </div>
            <div className="border rounded-xl p-5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <div className="border border-dashed rounded-xl p-10 text-center hover:border-purple-500/30 transition-colors cursor-pointer" style={{ borderColor: "var(--border-medium)" }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "var(--surface-hover)" }}>
                  <Image className="w-6 h-6" style={{ color: "var(--text-secondary)" }} />
                </div>
                <p className="font-medium" style={{ color: "var(--text-secondary)" }}>Drop your logo here or click to upload</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>PNG, SVG, or JPG up to 5MB</p>
                <Button variant="outline" className="mt-4 gap-1.5" style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  Choose File
                </Button>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Brand Guidelines</h2>
            </div>
            <div className="border rounded-xl p-5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <textarea
                placeholder="Describe your brand voice, style guidelines, dos and don'ts for video content..."
                rows={6}
                className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors resize-none"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-8 py-2.5 rounded-lg font-medium shadow-lg shadow-purple-500/20">
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
