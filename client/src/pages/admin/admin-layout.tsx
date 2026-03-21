import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, FolderKanban, DollarSign, Activity, ArrowLeft } from "lucide-react";

const NAV_ITEMS = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/users", label: "Users", icon: Users },
  { path: "/admin/projects", label: "Projects", icon: FolderKanban },
  { path: "/admin/costs", label: "Costs & Usage", icon: DollarSign },
  { path: "/admin/activity", label: "Activity", icon: Activity },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-[var(--bg-primary)]">
      <aside className="w-56 shrink-0 flex flex-col border-r" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
        <div className="px-4 py-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Admin Portal</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Monitor & manage</p>
        </div>
        <nav className="flex-1 py-2 px-2 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const isActive = location === item.path || (item.path !== "/admin" && location.startsWith(item.path));
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  background: isActive ? "rgba(124,58,237,0.12)" : "transparent",
                  color: isActive ? "rgb(167,139,250)" : "var(--text-secondary)",
                }}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-2 py-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to App
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
