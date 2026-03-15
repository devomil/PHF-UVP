import { useState, useRef, useEffect, ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/contexts/ThemeContext";
import {
  LayoutDashboard,
  FolderOpen,
  Images,
  Palette,
  Layers,
  Cpu,
  FlaskConical,
  Plus,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings,
  User,
  Sun,
  Moon,
} from "lucide-react";
import neuralcutIcon from "@/assets/neuralcut-icon.png";

const navItems = [
  { label: "Home", icon: LayoutDashboard, path: "/" },
  { label: "Projects", icon: FolderOpen, path: "/projects" },
  { label: "Asset Library", icon: Images, path: "/assets" },
  { label: "Brand", icon: Palette, path: "/brand" },
  { label: "Render Queue", icon: Layers, path: "/render-queue" },
  { label: "AI Providers", icon: Cpu, path: "/providers" },
  { label: "API Testing", icon: FlaskConical, path: "/api-testing" },
];

function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { theme, toggleTheme } = useTheme();

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
    <div className="flex h-screen overflow-hidden theme-bg">
      <aside
        className={`flex flex-col theme-sidebar-bg border-r transition-all duration-300 ease-in-out ${
          collapsed ? "w-[68px]" : "w-[240px]"
        }`}
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className={`flex items-center justify-center py-4 ${collapsed ? "px-2" : "px-4"}`} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <img
            src={neuralcutIcon}
            alt="NeuralCut.AI"
            className={collapsed ? "w-9 h-9 object-contain" : "w-10 h-10 object-contain"}
          />
        </div>

        <div className="p-3">
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
                    ? "theme-nav-active text-purple-600"
                    : "theme-text-secondary theme-nav-hover"
                } ${collapsed ? "justify-center" : ""}`}
                style={active ? { color: "rgb(124, 58, 237)" } : {}}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-purple-500 rounded-r-full" />
                )}
                <item.icon
                  className="w-5 h-5 shrink-0"
                  style={{ color: active ? "rgb(124, 58, 237)" : "var(--icon-default)" }}
                />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center flex-1 p-2 rounded-lg transition-all duration-200"
              style={{ color: "var(--icon-default)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--nav-hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center justify-center flex-1 p-2 rounded-lg transition-all duration-200"
              style={{ color: "var(--icon-default)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--nav-hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="p-2 relative" ref={menuRef} style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
              collapsed ? "justify-center px-0" : ""
            }`}
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--nav-hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-violet-500 flex items-center justify-center text-xs font-semibold text-white shrink-0">
              {userInitials}
            </div>
            {!collapsed && (
              <span className="truncate text-left flex-1">{userName}</span>
            )}
          </button>

          {menuOpen && (
            <div
              className="absolute bottom-full left-2 right-2 mb-1 rounded-lg shadow-xl overflow-hidden z-50"
              style={{ backgroundColor: "var(--menu-bg)", border: "1px solid var(--border-medium)" }}
            >
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm transition-colors"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <User className="w-4 h-4" />
                <span>Profile</span>
              </Link>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm transition-colors"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Link>
              <div style={{ borderTop: "1px solid var(--border-medium)" }} />
              <button
                onClick={() => {
                  logoutMutation.mutate();
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-red-500 transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
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
