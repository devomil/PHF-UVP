import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "./admin-layout";
import { DollarSign, Server } from "lucide-react";

export default function AdminCosts() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-costs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/costs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load costs");
      return res.json();
    },
  });

  const costs = data?.costs;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Costs & Usage</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>API costs and provider usage breakdown</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-xl p-5 border animate-pulse h-48" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }} />
          ))}
        </div>
      ) : costs ? (
        <div className="space-y-6">
          {costs.byService?.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
              <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "var(--border-subtle)" }}>
                <DollarSign className="w-4 h-4 text-yellow-500" />
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Cost by API Service</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <th className="text-left py-3 px-5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Service</th>
                    <th className="text-right py-3 px-5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>API Calls</th>
                    <th className="text-right py-3 px-5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Total Cost</th>
                    <th className="text-right py-3 px-5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Avg / Call</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.byService.map((s: any) => (
                    <tr key={s.service} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td className="py-3 px-5 font-medium" style={{ color: "var(--text-primary)" }}>{s.service || "Unknown"}</td>
                      <td className="text-right py-3 px-5" style={{ color: "var(--text-secondary)" }}>{s.callCount}</td>
                      <td className="text-right py-3 px-5 font-semibold" style={{ color: "#fbbf24" }}>${s.totalCost.toFixed(4)}</td>
                      <td className="text-right py-3 px-5" style={{ color: "var(--text-muted)" }}>
                        ${s.callCount > 0 ? (s.totalCost / s.callCount).toFixed(4) : "0.0000"}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-3 px-5 font-bold" style={{ color: "var(--text-primary)" }}>Total</td>
                    <td className="text-right py-3 px-5 font-medium" style={{ color: "var(--text-secondary)" }}>
                      {costs.byService.reduce((sum: number, s: any) => sum + s.callCount, 0)}
                    </td>
                    <td className="text-right py-3 px-5 font-bold" style={{ color: "#fbbf24" }}>
                      ${costs.byService.reduce((sum: number, s: any) => sum + s.totalCost, 0).toFixed(4)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
            <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "var(--border-subtle)" }}>
              <Server className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Video Provider Usage</h3>
            </div>
            {costs.byProvider?.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <th className="text-left py-3 px-5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Provider</th>
                    <th className="text-right py-3 px-5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Total Jobs</th>
                    <th className="text-right py-3 px-5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Completed</th>
                    <th className="text-right py-3 px-5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Failed</th>
                    <th className="text-right py-3 px-5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Success %</th>
                    <th className="text-right py-3 px-5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Avg Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.byProvider.map((p: any) => (
                    <tr key={p.provider} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td className="py-3 px-5 font-medium" style={{ color: "var(--text-primary)" }}>{p.provider}</td>
                      <td className="text-right py-3 px-5" style={{ color: "var(--text-secondary)" }}>{p.totalJobs}</td>
                      <td className="text-right py-3 px-5 text-green-400">{p.completedJobs}</td>
                      <td className="text-right py-3 px-5 text-red-400">{p.failedJobs}</td>
                      <td className="text-right py-3 px-5" style={{ color: "var(--text-primary)" }}>
                        {p.totalJobs > 0 ? ((p.completedJobs / p.totalJobs) * 100).toFixed(0) : 0}%
                      </td>
                      <td className="text-right py-3 px-5" style={{ color: "var(--text-muted)" }}>{p.avgDuration ? `${p.avgDuration.toFixed(0)}s` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>No provider usage data yet</div>
            )}
          </div>

          {(!costs.byService || costs.byService.length === 0) && (
            <div className="rounded-xl p-8 border text-center" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
              <DollarSign className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No API cost data recorded yet. Costs will appear here as users generate videos and use AI services.</p>
            </div>
          )}
        </div>
      ) : (
        <p style={{ color: "var(--text-muted)" }}>Failed to load cost data.</p>
      )}
    </AdminLayout>
  );
}
