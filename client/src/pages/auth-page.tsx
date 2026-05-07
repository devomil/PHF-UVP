import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";
import neuralcutFullLogo from "@/assets/neuralcut-full-logo.png";
import neuralcutIcon from "@/assets/neuralcut-icon.png";

interface ProviderConfig {
  google: boolean;
  facebook: boolean;
  apple: boolean;
  canva: boolean;
  preview?: boolean;
}

const OAUTH_ERRORS: Record<string, string> = {
  oauth_google: "Sign-in with Google didn't complete. Please try again.",
  oauth_facebook: "Sign-in with Facebook didn't complete. Please try again.",
  oauth_apple: "Sign-in with Apple didn't complete. Please try again.",
};

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 11v3.2h5.3c-.2 1.4-1.6 4-5.3 4-3.2 0-5.8-2.6-5.8-5.9s2.6-5.9 5.8-5.9c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 4 14.5 3 12 3 6.9 3 2.8 7.1 2.8 12.3S6.9 21.6 12 21.6c6.9 0 11.5-4.9 11.5-11.7 0-.8-.1-1.4-.2-2H12z"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.5 2.9h-2.4v7A10 10 0 0022 12z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M16.365 12.71c-.02-2.04 1.66-3.02 1.74-3.07-.95-1.39-2.43-1.58-2.96-1.6-1.26-.13-2.46.74-3.1.74-.65 0-1.63-.72-2.69-.7-1.38.02-2.66.81-3.37 2.05-1.44 2.5-.37 6.18 1.04 8.2.69 1 1.5 2.11 2.57 2.07 1.04-.04 1.43-.67 2.69-.67 1.25 0 1.61.67 2.7.65 1.12-.02 1.82-1.01 2.5-2.01.79-1.16 1.11-2.28 1.13-2.34-.03-.01-2.16-.83-2.18-3.31zM14.36 6.4c.57-.69.95-1.65.85-2.6-.82.03-1.81.55-2.4 1.24-.53.61-.99 1.59-.86 2.52.91.07 1.84-.46 2.41-1.16z"/>
    </svg>
  );
}

export default function AuthPage() {
  const { loginMutation, registerMutation } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [providers, setProviders] = useState<ProviderConfig>({ google: false, facebook: false, apple: false, canva: false, preview: false });
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setProviders(data);
      })
      .catch(() => {});

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const errCode = params.get("error");
      if (errCode && OAUTH_ERRORS[errCode]) {
        setOauthError(OAUTH_ERRORS[errCode]);
      }
    }
  }, []);

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
  const showSocial = providers.google || providers.facebook || providers.apple;

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
          <img
            src={neuralcutFullLogo}
            alt="NeuralCut.AI"
            className="w-72 mx-auto mb-8 object-contain"
          />
          <p style={{ color: "var(--text-secondary)" }} className="max-w-sm mx-auto text-lg">
            Automated video creation powered by multi-provider AI generation and intelligent quality control.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <img
              src={neuralcutIcon}
              alt="NeuralCut.AI"
              className="w-10 h-10 object-contain"
            />
            <span className="font-semibold text-lg" style={{ color: "var(--text-primary)" }}>NeuralCut.AI</span>
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

            {oauthError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {oauthError}
              </div>
            )}

            {error && (
              <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error.message || "An error occurred"}
              </div>
            )}

            {showSocial && (
              <div className="space-y-2 mb-6">
                {providers.preview && (
                  <div className="mb-2 px-3 py-2 rounded-xl text-xs flex items-start gap-2"
                    style={{ backgroundColor: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.25)", color: "rgb(250, 204, 21)" }}>
                    <span className="font-semibold">Preview mode:</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      Buttons shown for design review only. Set provider credentials (e.g. <code>GOOGLE_CLIENT_ID</code>) to enable real sign-in.
                    </span>
                  </div>
                )}
                {providers.google && (
                  <a
                    href="/api/auth/google"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                    style={{ backgroundColor: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--input-bg)")}
                  >
                    <GoogleIcon />
                    <span>Continue with Google</span>
                  </a>
                )}
                {providers.facebook && (
                  <a
                    href="/api/auth/facebook"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                    style={{ backgroundColor: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--input-bg)")}
                  >
                    <FacebookIcon />
                    <span>Continue with Facebook</span>
                  </a>
                )}
                {providers.apple && (
                  <a
                    href="/api/auth/apple"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                    style={{ backgroundColor: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--input-bg)")}
                  >
                    <AppleIcon />
                    <span>Continue with Apple</span>
                  </a>
                )}
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
                  <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>or</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
                </div>
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
