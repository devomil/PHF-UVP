import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "./admin-layout";
import { useState } from "react";
import { Search, Shield, ShieldCheck, User, MoreVertical, CheckCircle, XCircle } from "lucide-react";

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
  });

  const updateUser = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: any }) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditingUser(null);
    },
  });

  const users = data?.users || [];
  const filtered = users.filter((u: any) =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) || u.firstName?.toLowerCase().includes(search.toLowerCase()) || u.lastName?.toLowerCase().includes(search.toLowerCase())
  );

  const roleIcon = (role: string) => {
    if (role === "admin") return <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />;
    if (role === "employee") return <Shield className="w-3.5 h-3.5 text-blue-400" />;
    return <User className="w-3.5 h-3.5 text-gray-400" />;
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "rgba(139,92,246,0.15)",
      employee: "rgba(59,130,246,0.15)",
      user: "rgba(107,114,128,0.15)",
    };
    const textColors: Record<string, string> = {
      admin: "#a78bfa",
      employee: "#60a5fa",
      user: "#9ca3af",
    };
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: colors[role] || colors.user, color: textColors[role] || textColors.user }}>
        {roleIcon(role)}
        {role}
      </span>
    );
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Users</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{users.length} registered user{users.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            className="pl-9 pr-4 py-2 rounded-lg border text-sm bg-transparent outline-none"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)", width: 240 }}
          />
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading users...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th className="text-left py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>User</th>
                <th className="text-left py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Role</th>
                <th className="text-center py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Projects</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Generations</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Last Login</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Joined</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u: any) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="py-3 px-4">
                    <div>
                      <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "—"}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{u.email}</div>
                    </div>
                  </td>
                  <td className="py-3 px-4">{roleBadge(u.role)}</td>
                  <td className="py-3 px-4 text-center">
                    {u.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-red-400"><XCircle className="w-3.5 h-3.5" /> Inactive</span>
                    )}
                  </td>
                  <td className="text-right py-3 px-4" style={{ color: "var(--text-secondary)" }}>{u.projectCount}</td>
                  <td className="text-right py-3 px-4" style={{ color: "var(--text-secondary)" }}>{u.generationCount}</td>
                  <td className="text-right py-3 px-4 text-xs" style={{ color: "var(--text-muted)" }}>
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}
                  </td>
                  <td className="text-right py-3 px-4 text-xs" style={{ color: "var(--text-muted)" }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="text-right py-3 px-4">
                    <div className="relative inline-block">
                      <button
                        onClick={() => setEditingUser(editingUser === u.id ? null : u.id)}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                      </button>
                      {editingUser === u.id && (
                        <div
                          className="absolute right-0 top-full mt-1 w-44 rounded-lg border shadow-xl py-1 z-50"
                          style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}
                        >
                          <div className="px-3 py-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Change Role</div>
                          {["user", "employee", "admin"].map(role => (
                            <button
                              key={role}
                              onClick={() => updateUser.mutate({ userId: u.id, updates: { role } })}
                              disabled={u.role === role}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-30 flex items-center gap-2 transition-colors"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {roleIcon(role)} Set as {role}
                            </button>
                          ))}
                          <div className="border-t my-1" style={{ borderColor: "var(--border-subtle)" }} />
                          <button
                            onClick={() => updateUser.mutate({ userId: u.id, updates: { isActive: !u.isActive } })}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
                            style={{ color: u.isActive ? "#ef4444" : "#10b981" }}
                          >
                            {u.isActive ? "Deactivate Account" : "Activate Account"}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
                    {search ? "No users match your search" : "No users found"}
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
