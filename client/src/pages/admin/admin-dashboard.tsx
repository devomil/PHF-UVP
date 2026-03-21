import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "./admin-layout";
import { Users, FolderKanban, Video, DollarSign, TrendingUp, AlertCircle, CheckCircle, Clock } from "lucide-react";

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: any; color: string }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label}</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>{value}</p>
          {sub && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</p>}
        </div>
        <div className="p-2 rounded-lg" style={{ background: `${color}15` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const d = data?.dashboard;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Platform overview and key metrics</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl p-4 border animate-pulse h-24" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }} />
          ))}
        </div>
      ) : d ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Users" value={d.users.total} sub={`${d.users.newThisWeek} new this week`} icon={Users} color="#8b5cf6" />
            <StatCard label="Total Projects" value={d.projects.total} sub={`${d.projects.completed} completed`} icon={FolderKanban} color="#3b82f6" />
            <StatCard label="Video Generations" value={d.generations.total} sub={`${d.generations.thisWeek} this week`} icon={Video} color="#10b981" />
            <StatCard label="Total API Spend" value={`$${d.costs.totalSpend.toFixed(2)}`} icon={DollarSign} color="#f59e0b" />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="rounded-xl p-5 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Project Status Breakdown</h3>
              <div className="space-y-2.5">
                {[
                  { label: "Draft", value: d.projects.draft, color: "#6b7280" },
                  { label: "Ready", value: d.projects.ready, color: "#3b82f6" },
                  { label: "Rendering", value: d.projects.rendering, color: "#f59e0b" },
                  { label: "Completed", value: d.projects.completed, color: "#10b981" },
                  { label: "Error", value: d.projects.error, color: "#ef4444" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                    </div>
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl p-5 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Generation Stats</h3>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Completed</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{d.generations.completed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Failed</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{d.generations.failed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Pending</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{d.generations.pending}</span>
                </div>
                {d.generations.total > 0 && (
                  <div className="pt-2 mt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>Success Rate</span>
                      <span className="text-sm font-semibold" style={{ color: "#10b981" }}>
                        {((d.generations.completed / d.generations.total) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {d.providerBreakdown?.length > 0 && (
            <div className="rounded-xl p-5 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Provider Usage</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <th className="text-left py-2 px-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Provider</th>
                      <th className="text-right py-2 px-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Total</th>
                      <th className="text-right py-2 px-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Completed</th>
                      <th className="text-right py-2 px-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Failed</th>
                      <th className="text-right py-2 px-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Success %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.providerBreakdown.map((p: any) => (
                      <tr key={p.provider} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td className="py-2 px-3 font-medium" style={{ color: "var(--text-primary)" }}>{p.provider}</td>
                        <td className="text-right py-2 px-3" style={{ color: "var(--text-secondary)" }}>{p.count}</td>
                        <td className="text-right py-2 px-3 text-green-500">{p.completed}</td>
                        <td className="text-right py-2 px-3 text-red-500">{p.failed}</td>
                        <td className="text-right py-2 px-3" style={{ color: "var(--text-primary)" }}>
                          {p.count > 0 ? ((p.completed / p.count) * 100).toFixed(0) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <p style={{ color: "var(--text-muted)" }}>Failed to load dashboard data.</p>
      )}
    </AdminLayout>
  );
}
