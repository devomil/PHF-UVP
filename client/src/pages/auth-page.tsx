import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Film, Sun, Moon } from "lucide-react";

export default function AuthPage() {
  const { loginMutation, registerMutation } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      loginMutation.mutate({ email, password });
    } else {
      registerMutation.mutate({ email, password, firstName, lastName });
    }
  };

  const error = isLogin ? loginMutation.error : registerMutation.error;
  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="min-h-screen flex relative" style={{ backgroundColor: "var(--app-bg)" }}>
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-50 p-2.5 rounded-full transition-all duration-200"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-secondary)", border: "1px solid" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-indigo-900/30 to-[#0a0a0f]" />
        <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-64 h-64 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="relative z-10 px-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center mx-auto mb-6">
            <Film className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>AI Video Production Studio</h2>
          <p style={{ color: "var(--text-secondary)" }} className="max-w-sm mx-auto">
            Create professional videos at scale with multi-provider AI generation and intelligent quality control.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
              <Film className="h-5 w-5 text-white" />
            </div>
            <span className="font-semibold text-lg" style={{ color: "var(--text-primary)" }}>AI Video Studio</span>
          </div>

          <div className="rounded-2xl p-8" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex gap-2 mb-8">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors"
                style={
                  isLogin
                    ? { backgroundColor: "var(--surface-active)", color: "var(--text-primary)" }
                    : { color: "var(--text-muted)" }
                }
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors"
                style={
                  !isLogin
                    ? { backgroundColor: "var(--surface-active)", color: "var(--text-primary)" }
                    : { color: "var(--text-muted)" }
                }
              >
                Create Account
              </button>
            </div>

            {error && (
              <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error.message || "An error occurred"}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="firstName" className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      First Name
                    </label>
                    <input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:border-purple-500/50 transition-colors"
                      style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="lastName" className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Last Name
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:border-purple-500/50 transition-colors"
                      style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
                      placeholder="Doe"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:border-purple-500/50 transition-colors"
                  style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:border-purple-500/50 transition-colors"
                  style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
                  placeholder="Enter your password"
                />
              </div>
              <Button
                type="submit"
                disabled={isPending}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white py-2.5 rounded-xl h-auto mt-2"
              >
                {isPending ? "Loading..." : isLogin ? "Sign In" : "Create Account"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-purple-400 hover:text-purple-300 transition-colors"
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
