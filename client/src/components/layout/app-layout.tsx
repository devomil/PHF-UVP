import { useState, useRef, useEffect, ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  FolderOpen,
  Images,
  Palette,
  Layers,
  Cpu,
  Plus,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings,
  User,
} from "lucide-react";

const navItems = [
  { label: "Home", icon: LayoutDashboard, path: "/" },
  { label: "Projects", icon: FolderOpen, path: "/projects" },
  { label: "Asset Library", icon: Images, path: "/assets" },
  { label: "Brand", icon: Palette, path: "/brand" },
  { label: "Render Queue", icon: Layers, path: "/render-queue" },
  { label: "AI Providers", icon: Cpu, path: "/providers" },
];

function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  const isActive = (path: string) => {
    if (path === "/") return location === "/" || location === "/dashboard";
    return location.startsWith(path);
  };

  const userInitials = user
    ? `${(user.firstName || user.email)?.[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase()
    : "?";

  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
    : "";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <aside
        className={`flex flex-col bg-[#0f0f14] border-r border-white/[0.06] transition-all duration-300 ease-in-out ${
          collapsed ? "w-[68px]" : "w-[240px]"
        }`}
      >
        <div className="p-3 mt-2">
          <Link
            href="/projects/new"
            className={`flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-sm hover:from-purple-500 hover:to-violet-400 transition-all duration-200 ${
              collapsed ? "px-0" : ""
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Create new</span>}
          </Link>
        </div>

        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                  active
                    ? "bg-purple-500/10 text-purple-400"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
                } ${collapsed ? "justify-center" : ""}`}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-purple-500 rounded-r-full" />
                )}
                <item.icon className={`w-5 h-5 shrink-0 ${active ? "text-purple-400" : "text-gray-500 group-hover:text-gray-300"}`} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-all duration-200"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <div className="border-t border-white/[0.06] p-2 relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-white/[0.04] transition-all duration-200 ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-violet-500 flex items-center justify-center text-xs font-semibold text-white shrink-0">
              {userInitials}
            </div>
            {!collapsed && (
              <span className="truncate text-left flex-1">{userName}</span>
            )}
          </button>

          {menuOpen && (
            <div className="absolute bottom-full left-2 right-2 mb-1 bg-[#1a1a24] border border-white/[0.08] rounded-lg shadow-xl overflow-hidden z-50">
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-300 hover:bg-white/[0.06] transition-colors"
              >
                <User className="w-4 h-4" />
                <span>Profile</span>
              </Link>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-300 hover:bg-white/[0.06] transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Link>
              <div className="border-t border-white/[0.08]" />
              <button
                onClick={() => {
                  logoutMutation.mutate();
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-red-400 hover:bg-white/[0.06] transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

export default AppLayout;
