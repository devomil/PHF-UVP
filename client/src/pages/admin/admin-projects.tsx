import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "./admin-layout";
import { useState } from "react";
import { Search, ExternalLink } from "lucide-react";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "rgba(107,114,128,0.15)", text: "#9ca3af" },
  ready: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa" },
  rendering: { bg: "rgba(245,158,11,0.15)", text: "#fbbf24" },
  completed: { bg: "rgba(16,185,129,0.15)", text: "#34d399" },
  error: { bg: "rgba(239,68,68,0.15)", text: "#f87171" },
  "scenes-ready": { bg: "rgba(139,92,246,0.15)", text: "#a78bfa" },
};

export default function AdminProjects() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: async () => {
      const res = await fetch("/api/admin/projects", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json();
    },
  });

  const projects = data?.projects || [];
  const filtered = projects.filter((p: any) => {
    const matchSearch = !search || p.title?.toLowerCase().includes(search.toLowerCase()) || p.ownerEmail?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statuses = ["all", ...new Set(projects.map((p: any) => p.status))] as string[];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Projects</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{projects.length} total project{projects.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {statuses.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: statusFilter === s ? "rgba(124,58,237,0.15)" : "transparent",
                  color: statusFilter === s ? "rgb(167,139,250)" : "var(--text-muted)",
                  border: statusFilter === s ? "1px solid rgba(124,58,237,0.3)" : "1px solid transparent",
                }}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="pl-9 pr-4 py-2 rounded-lg border text-sm bg-transparent outline-none"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)", width: 220 }}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading projects...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th className="text-left py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Project</th>
                <th className="text-left py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Owner</th>
                <th className="text-center py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Duration</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Generations</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Updated</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Output</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => {
                const sc = STATUS_COLORS[p.status] || STATUS_COLORS.draft;
                return (
                  <tr key={p.projectId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td className="py-3 px-4">
                      <div className="font-medium truncate max-w-[250px]" style={{ color: "var(--text-primary)" }}>{p.title || "Untitled"}</div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{p.type} · {p.qualityTier}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{p.ownerEmail || "—"}</div>
                      {(p.ownerFirstName || p.ownerLastName) && (
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{`${p.ownerFirstName || ""} ${p.ownerLastName || ""}`.trim()}</div>
                      )}
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: sc.bg, color: sc.text }}>{p.status}</span>
                    </td>
                    <td className="text-right py-3 px-4" style={{ color: "var(--text-secondary)" }}>{p.totalDuration}s</td>
                    <td className="text-right py-3 px-4">
                      <span style={{ color: "var(--text-secondary)" }}>{p.completedGenerations}</span>
                      {p.failedGenerations > 0 && <span className="text-red-400 ml-1">/ {p.failedGenerations} failed</span>}
                    </td>
                    <td className="text-right py-3 px-4 text-xs" style={{ color: "var(--text-muted)" }}>
                      {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="text-right py-3 px-4">
                      {p.outputUrl ? (
                        <a href={p.outputUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300">
                          <ExternalLink className="w-3.5 h-3.5" /> View
                        </a>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
                    {search || statusFilter !== "all" ? "No projects match your filters" : "No projects found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}
