import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "./admin-layout";
import { UserPlus, FolderKanban, Video, RefreshCw } from "lucide-react";

function ActivityIcon({ type }: { type: string }) {
  if (type === "user_signup") return <div className="p-2 rounded-lg" style={{ background: "rgba(139,92,246,0.15)" }}><UserPlus className="w-4 h-4 text-purple-400" /></div>;
  if (type === "project_update") return <div className="p-2 rounded-lg" style={{ background: "rgba(59,130,246,0.15)" }}><FolderKanban className="w-4 h-4 text-blue-400" /></div>;
  return <div className="p-2 rounded-lg" style={{ background: "rgba(16,185,129,0.15)" }}><Video className="w-4 h-4 text-green-400" /></div>;
}

function formatTimeAgo(dateStr: string | null) {
  if (!dateStr) return "Unknown";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function ActivityDescription({ item }: { item: any }) {
  if (item.type === "user_signup") {
    return (
      <div>
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>New user signed up</span>
        <span className="ml-1.5 text-xs" style={{ color: "var(--text-muted)" }}>{item.data.email}</span>
      </div>
    );
  }
  if (item.type === "project_update") {
    return (
      <div>
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
          {item.data.title || "Project"}
        </span>
        <span className="mx-1.5 text-xs" style={{ color: "var(--text-muted)" }}>→</span>
        <span
          className="px-1.5 py-0.5 rounded text-xs font-medium"
          style={{
            background: item.data.status === "completed" ? "rgba(16,185,129,0.15)" : item.data.status === "error" ? "rgba(239,68,68,0.15)" : "rgba(107,114,128,0.15)",
            color: item.data.status === "completed" ? "#34d399" : item.data.status === "error" ? "#f87171" : "#9ca3af",
          }}
        >
          {item.data.status}
        </span>
        {item.data.ownerEmail && <span className="ml-1.5 text-xs" style={{ color: "var(--text-muted)" }}>by {item.data.ownerEmail}</span>}
      </div>
    );
  }
  return (
    <div>
      <span className="font-medium" style={{ color: "var(--text-primary)" }}>Video generation</span>
      <span className="mx-1.5 text-xs px-1.5 py-0.5 rounded font-medium" style={{
        background: item.data.status === "completed" ? "rgba(16,185,129,0.15)" : item.data.status === "failed" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
        color: item.data.status === "completed" ? "#34d399" : item.data.status === "failed" ? "#f87171" : "#fbbf24",
      }}>
        {item.data.status}
      </span>
      <span className="ml-1.5 text-xs" style={{ color: "var(--text-muted)" }}>via {item.data.provider}</span>
    </div>
  );
}

export default function AdminActivity() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-activity"],
    queryFn: async () => {
      const res = await fetch("/api/admin/activity", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const activity = data?.activity || [];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Activity</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Recent platform activity across all users</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors hover:bg-white/5"
          style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading activity...</div>
        ) : activity.length > 0 ? (
          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {activity.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5" style={{ borderColor: "var(--border-subtle)" }}>
                <ActivityIcon type={item.type} />
                <div className="flex-1 min-w-0">
                  <ActivityDescription item={item} />
                </div>
                <div className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                  {formatTimeAgo(item.timestamp)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>No recent activity</div>
        )}
      </div>
    </AdminLayout>
  );
}
