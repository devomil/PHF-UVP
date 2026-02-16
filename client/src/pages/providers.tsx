import { Cpu, Info, Settings, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

const providers = [
  {
    name: "Kling",
    status: "connected",
    description: "High-quality AI video generation with advanced motion control",
    capabilities: ["Text-to-Video", "Image-to-Video", "Motion Control"],
    color: "bg-violet-500",
  },
  {
    name: "RunwayML",
    status: "connected",
    description: "Professional-grade generative AI for creative video production",
    capabilities: ["Text-to-Video", "Image-to-Video", "Video Editing"],
    color: "bg-blue-500",
  },
  {
    name: "Luma",
    status: "disconnected",
    description: "Dream Machine for cinematic AI video generation",
    capabilities: ["Text-to-Video", "Camera Control", "3D Scenes"],
    color: "bg-cyan-500",
  },
  {
    name: "Pika",
    status: "disconnected",
    description: "Creative AI video platform for quick content generation",
    capabilities: ["Text-to-Video", "Image-to-Video", "Style Transfer"],
    color: "bg-orange-500",
  },
  {
    name: "Veo",
    status: "disconnected",
    description: "Google's advanced video generation model with high fidelity",
    capabilities: ["Text-to-Video", "High Resolution", "Long Duration"],
    color: "bg-emerald-500",
  },
];

export default function Providers() {
  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Cpu className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Providers</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Manage your video generation provider connections</p>
          </div>
        </div>

        <div className="border rounded-xl p-4 mb-8 flex items-start gap-3" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
          <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            API keys are managed securely through environment variables. Contact your administrator to configure provider credentials.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {providers.map((provider) => (
            <div key={provider.name} className="border rounded-xl p-5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${provider.color} flex items-center justify-center font-bold text-lg`} style={{ color: "var(--text-primary)" }}>
                    {provider.name[0]}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{provider.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={`w-2 h-2 rounded-full ${provider.status === "connected" ? "bg-emerald-400" : "bg-gray-500"}`} />
                      <span className={`text-xs ${provider.status === "connected" ? "text-emerald-400" : ""}`} style={provider.status !== "connected" ? { color: "var(--text-muted)" } : undefined}>
                        {provider.status === "connected" ? "Connected" : "Not Connected"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>{provider.description}</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {provider.capabilities.map((cap) => (
                  <span key={cap} className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: "var(--surface-hover)", color: "var(--text-secondary)" }}>
                    {cap}
                  </span>
                ))}
              </div>
              {provider.status === "connected" ? (
                <Button variant="outline" size="sm" className="gap-1.5" style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Manage
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="border-purple-500/20 text-purple-400 hover:bg-purple-500/10 gap-1.5">
                  <Wrench className="w-3.5 h-3.5" />
                  Configure
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
