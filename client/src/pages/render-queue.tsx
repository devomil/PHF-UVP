import { Activity, CheckCircle2, XCircle, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const activeRenders = [
  { id: 1, project: "Brand Story Series", scene: "Scene 3", progress: 65, provider: "Kling", startedAt: "2 min ago" },
  { id: 2, project: "Social Media Ads", scene: "Scene 1", progress: 30, provider: "RunwayML", startedAt: "5 min ago" },
];

const completedRenders = [
  { id: 3, project: "Product Launch Video", scene: "All Scenes", duration: "35s", completedAt: "10 min ago" },
  { id: 4, project: "Tutorial Walkthrough", scene: "All Scenes", duration: "120s", completedAt: "1 hour ago" },
];

const failedRenders = [
  { id: 5, project: "Q1 Promo Campaign", scene: "Scene 2", error: "Provider timeout", failedAt: "30 min ago" },
];

export default function RenderQueue() {
  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Activity className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Render Queue</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Monitor your video rendering jobs</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="border rounded-xl p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-400">{activeRenders.length}</p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Active</p>
              </div>
            </div>
          </div>
          <div className="border rounded-xl p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-400">{completedRenders.length}</p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Completed</p>
              </div>
            </div>
          </div>
          <div className="border rounded-xl p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{failedRenders.length}</p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Failed</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Active Renders</h2>
          {activeRenders.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No active renders</p>
          ) : (
            <div className="space-y-3">
              {activeRenders.map((render) => (
                <div key={render.id} className="border rounded-xl p-5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{render.project}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{render.scene}</span>
                        <span style={{ color: "var(--text-muted)" }}>·</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">{render.provider}</span>
                        <span style={{ color: "var(--text-muted)" }}>·</span>
                        <span className="text-sm" style={{ color: "var(--text-muted)" }}>{render.startedAt}</span>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-purple-400 font-mono">{render.progress}%</span>
                  </div>
                  <div className="w-full rounded-full h-2" style={{ backgroundColor: "var(--surface-hover)" }}>
                    <div
                      className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all"
                      style={{ width: `${render.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-8">
          <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Completed</h2>
          <div className="space-y-3">
            {completedRenders.map((render) => (
              <div key={render.id} className="border rounded-xl p-4 flex items-center justify-between" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-medium" style={{ color: "var(--text-primary)" }}>{render.project}</p>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{render.scene} · {render.duration}</p>
                  </div>
                </div>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>{render.completedAt}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Failed</h2>
          <div className="space-y-3">
            {failedRenders.map((render) => (
              <div key={render.id} className="border rounded-xl p-4 flex items-center justify-between" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="font-medium" style={{ color: "var(--text-primary)" }}>{render.project}</p>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{render.scene} · {render.error} · {render.failedAt}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
