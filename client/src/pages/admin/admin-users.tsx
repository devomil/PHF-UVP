import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "./admin-layout";
import React, { useState, useEffect, useCallback } from "react";
import { Search, Shield, ShieldCheck, User, MoreVertical, CheckCircle, XCircle, ChevronDown, ChevronRight, DollarSign, Trash2, Info } from "lucide-react";

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "employee" | "user">("all");
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const closeMenus = useCallback(() => {
    setEditingUser(null);
    setConfirmDelete(null);
  }, []);

  useEffect(() => {
    if (!editingUser) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-user-menu]")) closeMenus();
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [editingUser, closeMenus]);

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

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setConfirmDelete(null);
      setEditingUser(null);
    },
  });

  const users = data?.users || [];
  const adminCount = users.filter((u: any) => u.role === "admin").length;
  const filtered = users.filter((u: any) => {
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesSearch = !search || u.email?.toLowerCase().includes(search.toLowerCase()) || u.firstName?.toLowerCase().includes(search.toLowerCase()) || u.lastName?.toLowerCase().includes(search.toLowerCase()) || u.company?.toLowerCase().includes(search.toLowerCase());
    return matchesRole && matchesSearch;
  });

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

  const DetailRow = ({ label, value }: { label: string; value: string | null | undefined }) => {
    if (!value) return null;
    return (
      <div className="flex gap-2">
        <span className="text-xs font-medium w-28 shrink-0" style={{ color: "var(--text-muted)" }}>{label}</span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{value}</span>
      </div>
    );
  };

  const roleFilterTabs: { key: typeof roleFilter; label: string; count?: number }[] = [
    { key: "all", label: "All Users", count: users.length },
    { key: "admin", label: "Admins", count: adminCount },
    { key: "employee", label: "Employees", count: users.filter((u: any) => u.role === "employee").length },
    { key: "user", label: "Users", count: users.filter((u: any) => u.role === "user").length },
  ];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
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

      {/* Role filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        {roleFilterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setRoleFilter(tab.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: roleFilter === tab.key ? "rgba(139,92,246,0.18)" : "transparent",
              color: roleFilter === tab.key ? "#a78bfa" : "var(--text-muted)",
              border: roleFilter === tab.key ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
            }}
          >
            {tab.key === "admin" && <ShieldCheck className="w-3.5 h-3.5" />}
            {tab.key === "employee" && <Shield className="w-3.5 h-3.5" />}
            {tab.key === "user" && <User className="w-3.5 h-3.5" />}
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]"
                style={{ background: "rgba(255,255,255,0.08)", color: "inherit" }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bootstrap info banner — shown when viewing admins or when there are no admins yet */}
      {(roleFilter === "admin" || adminCount === 0) && (
        <div className="flex items-start gap-3 mb-4 px-4 py-3 rounded-xl border"
          style={{ background: "rgba(139,92,246,0.07)", borderColor: "rgba(139,92,246,0.2)" }}>
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-purple-400" />
          <div className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Promoting &amp; demoting admins</span>{" "}
            Use the <span className="font-medium">⋮</span> menu on any row to set a user's role.
            Changes are saved to the database immediately — no restart needed.
            {adminCount === 0 && (
              <>{" "}<span className="font-semibold text-purple-300">No admins exist yet.</span>{" "}
              Set <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: "rgba(255,255,255,0.08)" }}>ADMIN_EMAILS=you@example.com</code> in the environment
              and sign in once to bootstrap the first admin.</>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading users...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th className="w-6"></th>
                <th className="text-left py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>User</th>
                <th className="text-left py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Role</th>
                <th className="text-center py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Projects</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Generations</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>API Cost</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Last Login</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Joined</th>
                <th className="text-right py-3 px-4 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u: any) => (
                <React.Fragment key={u.id}>
                  <tr style={{ borderBottom: expandedUser === u.id ? "none" : "1px solid var(--border-subtle)" }} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}>
                    <td className="pl-3 py-3">
                      {expandedUser === u.id ? (
                        <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                          {u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "—"}
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{u.email}</div>
                        {u.company && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{u.company}</div>}
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
                    <td className="text-right py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <DollarSign className="w-3 h-3 text-yellow-500" />
                        <span style={{ color: u.totalApiCost > 0 ? "#fbbf24" : "var(--text-muted)" }} className="font-medium">
                          {u.totalApiCost > 0 ? `$${u.totalApiCost.toFixed(2)}` : "$0.00"}
                        </span>
                      </div>
                      {u.apiCallCount > 0 && (
                        <div className="text-xs text-right" style={{ color: "var(--text-muted)" }}>{u.apiCallCount} calls</div>
                      )}
                    </td>
                    <td className="text-right py-3 px-4 text-xs" style={{ color: "var(--text-muted)" }}>
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}
                    </td>
                    <td className="text-right py-3 px-4 text-xs" style={{ color: "var(--text-muted)" }}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="text-right py-3 px-4" onClick={e => e.stopPropagation()}>
                      <div className="relative inline-block" data-user-menu>
                        <button
                          onClick={() => setEditingUser(editingUser === u.id ? null : u.id)}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                        </button>
                        {editingUser === u.id && (
                          <div
                            data-user-menu
                            className="fixed w-52 rounded-xl border shadow-2xl py-2 z-[9999]"
                            style={{
                              background: "#1a1a2e",
                              borderColor: "rgba(255,255,255,0.12)",
                              right: "80px",
                              top: "auto",
                              boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
                            }}
                            ref={(el) => {
                              if (el) {
                                const rect = el.previousElementSibling?.getBoundingClientRect();
                                if (rect) {
                                  el.style.top = `${rect.bottom + 4}px`;
                                  el.style.right = `${window.innerWidth - rect.right}px`;
                                }
                              }
                            }}
                          >
                            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Role</div>
                            {["user", "employee", "admin"].map(role => (
                              <button
                                key={role}
                                onClick={() => updateUser.mutate({ userId: u.id, updates: { role } })}
                                disabled={u.role === role}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-30 flex items-center gap-2.5 transition-colors"
                                style={{ color: u.role === role ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)" }}
                              >
                                {roleIcon(role)} <span>Set as {role}</span>
                                {u.role === role && <CheckCircle className="w-3.5 h-3.5 ml-auto text-green-400" />}
                              </button>
                            ))}
                            <div className="border-t my-1.5 mx-2" style={{ borderColor: "rgba(255,255,255,0.08)" }} />
                            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Account</div>
                            <button
                              onClick={() => updateUser.mutate({ userId: u.id, updates: { isActive: !u.isActive } })}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 flex items-center gap-2.5 transition-colors"
                              style={{ color: u.isActive ? "#f87171" : "#34d399" }}
                            >
                              {u.isActive ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                              {u.isActive ? "Deactivate Account" : "Activate Account"}
                            </button>
                            <div className="border-t my-1.5 mx-2" style={{ borderColor: "rgba(255,255,255,0.08)" }} />
                            {confirmDelete === u.id ? (
                              <div className="px-3 py-2.5">
                                <p className="text-xs font-medium mb-2.5" style={{ color: "#f87171" }}>Delete user and all their data?</p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => deleteUser.mutate(u.id)}
                                    disabled={deleteUser.isPending}
                                    className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors hover:opacity-90"
                                    style={{ background: "#dc2626" }}
                                  >
                                    {deleteUser.isPending ? "Deleting..." : "Yes, Delete"}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors hover:bg-white/10"
                                    style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(u.id)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 flex items-center gap-2.5 transition-colors"
                                style={{ color: "#f87171" }}
                              >
                                <Trash2 className="w-4 h-4" /> Delete Account
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedUser === u.id && (
                    <tr key={`${u.id}-details`} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td colSpan={10} className="px-4 pb-4 pt-1">
                        <div className="grid grid-cols-2 gap-6 p-4 rounded-lg" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)" }}>
                          <div>
                            <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Contact Information</h4>
                            <div className="space-y-1.5">
                              <DetailRow label="Email" value={u.email} />
                              <DetailRow label="Phone" value={u.phone} />
                              <DetailRow label="Company" value={u.company} />
                              <DetailRow label="Job Title" value={u.jobTitle} />
                              <DetailRow label="Address" value={u.address} />
                              <DetailRow label="City" value={u.city} />
                              <DetailRow label="State" value={u.state} />
                              <DetailRow label="Zip Code" value={u.zipCode} />
                              <DetailRow label="Country" value={u.country} />
                              {!u.phone && !u.company && !u.address && (
                                <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>No contact details on file</p>
                              )}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Billing Information</h4>
                            <div className="space-y-1.5">
                              <DetailRow label="Billing Name" value={u.billingName} />
                              <DetailRow label="Billing Email" value={u.billingEmail} />
                              <DetailRow label="Address" value={u.billingAddress} />
                              <DetailRow label="City" value={u.billingCity} />
                              <DetailRow label="State" value={u.billingState} />
                              <DetailRow label="Zip Code" value={u.billingZipCode} />
                              <DetailRow label="Country" value={u.billingCountry} />
                              {!u.billingName && !u.billingEmail && !u.billingAddress && (
                                <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>No billing details on file</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
                    {search
                      ? "No users match your search"
                      : roleFilter !== "all"
                        ? `No ${roleFilter}s found`
                        : "No users found"}
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
