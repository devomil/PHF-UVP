import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { TrendingUp, Copy, Sparkles, RefreshCw, Loader2, Lock, Settings, Zap, ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface TrendHook {
  template: string;
  psychologicalDriver: string;
  example: string;
}

interface TrendFormat {
  name: string;
  description: string;
  why: string;
}

interface TrendData {
  success: boolean;
  industry: string;
  contentNiche: string;
  hooks: TrendHook[];
  keywords: string[];
  formats: TrendFormat[];
  insight: string;
  cachedAt?: string;
  expiresAt?: string;
}

interface BrandSettingsData {
  industry: string;
  contentNiche: string;
  targetAudience: string;
  trendAnalysisEnabled: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "less than an hour ago";
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export default function TrendsDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [brandSettings, setBrandSettings] = useState<BrandSettingsData | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState<number | null>(null);

  useEffect(() => {
    fetchBrandSettings();
  }, []);

  async function fetchBrandSettings() {
    try {
      const res = await fetch("/api/brand-settings", { credentials: "include" });
      const data = await res.json();
      setBrandSettings(data);
      if (data.industry && data.trendAnalysisEnabled) {
        await fetchTrends();
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  async function fetchTrends() {
    try {
      const res = await fetch("/api/trend-intelligence/hooks", { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setTrendData(data);
      }
    } catch {
      toast({ title: "Failed to load trends", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (cooldownMinutes === null || cooldownMinutes <= 0) return;
    const interval = setInterval(() => {
      setCooldownMinutes((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [cooldownMinutes]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/trend-intelligence/refresh", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setTrendData(data);
        setCooldownMinutes(null);
        toast({ title: "Trends refreshed", description: "Fresh analysis from Google Trends, YouTube & AI." });
      } else if (res.status === 429) {
        setCooldownMinutes(data.remainingMinutes || 60);
        toast({ title: "Cooldown active", description: data.message, variant: "destructive" });
      } else {
        toast({ title: "Refresh failed", description: data.message || data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Refresh failed", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }

  function copyHook(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard", description: "Hook text copied." });
  }

  function useHook(hookText: string) {
    navigate(`/projects/new?hook=${encodeURIComponent(hookText)}`);
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[400px]" style={{ color: "var(--text-primary)" }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400 mx-auto mb-3" />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Analyzing trends...</p>
        </div>
      </div>
    );
  }

  const noIndustry = !brandSettings?.industry;
  const notEnabled = brandSettings?.industry && !brandSettings?.trendAnalysisEnabled;

  if (noIndustry) {
    return (
      <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
        <div className="max-w-2xl mx-auto text-center py-20">
          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 inline-block mb-6">
            <Settings className="w-10 h-10 text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Set Up Your Industry First</h1>
          <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
            To get personalized trending hooks, configure your industry and content niche in Brand Settings.
          </p>
          <Button
            onClick={() => navigate("/brand")}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-6"
          >
            <Settings className="w-4 h-4 mr-2" />
            Go to Brand Settings
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <TrendingUp className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Trending Hooks</h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                AI-analyzed trends for <span className="text-purple-400 font-medium">{brandSettings?.industry}</span>
                {trendData?.cachedAt && (
                  <span> · Last updated {timeAgo(trendData.cachedAt)}</span>
                )}
              </p>
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing || !!notEnabled || cooldownMinutes !== null}
            variant="outline"
            className="gap-2"
            style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {cooldownMinutes ? `Available in ${cooldownMinutes}m` : "Refresh"}
          </Button>
        </div>

        {notEnabled ? (
          <div className="relative">
            <div className="absolute inset-0 z-10 backdrop-blur-sm bg-black/30 rounded-2xl flex items-center justify-center">
              <div className="text-center p-8">
                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 inline-block mb-4">
                  <Lock className="w-8 h-8 text-purple-400" />
                </div>
                <h2 className="text-xl font-bold mb-2">AI Trend Intelligence is Off</h2>
                <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                  Enable it in Brand Settings to get viral hook suggestions tailored to your niche.
                </p>
                <Button
                  onClick={() => navigate("/brand")}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white"
                >
                  Enable in Brand Settings
                </Button>
              </div>
            </div>
            <div className="opacity-30 pointer-events-none">
              <PlaceholderContent />
            </div>
          </div>
        ) : trendData ? (
          <div className="space-y-8">
            <div>
              <h2 className="text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                <Sparkles className="w-4 h-4" />
                Hook Library
              </h2>
              <div className="grid gap-4">
                {trendData.hooks.map((hook, i) => (
                  <div
                    key={i}
                    className="border rounded-xl p-5 transition-colors hover:border-purple-500/30"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
                  >
                    <p className="text-lg font-medium mb-2">{hook.template}</p>
                    <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
                      <span className="text-purple-400 font-medium">Why it works:</span> {hook.psychologicalDriver}
                    </p>
                    <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                      <span className="font-medium" style={{ color: "var(--text-secondary)" }}>Example:</span> {hook.example}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyHook(hook.template)}
                        style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1.5" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => useHook(hook.template)}
                        className="bg-purple-600 hover:bg-purple-500 text-white"
                      >
                        <Zap className="w-3.5 h-3.5 mr-1.5" />
                        Use This Hook
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                <TrendingUp className="w-4 h-4" />
                Keyword Momentum
              </h2>
              <div
                className="border rounded-xl p-5"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
              >
                <div className="flex flex-wrap gap-2">
                  {trendData.keywords.map((keyword, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 rounded-full text-sm font-medium border"
                      style={{
                        backgroundColor: "rgba(139, 92, 246, 0.1)",
                        borderColor: "rgba(139, 92, 246, 0.2)",
                        color: "rgb(167, 139, 250)",
                      }}
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                <Zap className="w-4 h-4" />
                Content Formats
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                {trendData.formats.map((format, i) => (
                  <div
                    key={i}
                    className="border rounded-xl p-5"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
                  >
                    <h3 className="font-semibold mb-2">{format.name}</h3>
                    <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>{format.description}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      <span className="text-purple-400 font-medium">Why now:</span> {format.why}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {trendData.insight && (
              <div
                className="border rounded-xl p-5"
                style={{ backgroundColor: "rgba(139, 92, 246, 0.05)", borderColor: "rgba(139, 92, 246, 0.15)" }}
              >
                <h2 className="text-sm font-medium uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                  <Clock className="w-4 h-4" />
                  Trend Insight
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {trendData.insight}
                </p>
              </div>
            )}

            <div className="pt-4">
              <Button
                onClick={() => {
                  const topHook = trendData.hooks[0]?.template || "";
                  navigate(`/projects/new?hook=${encodeURIComponent(topHook)}`);
                }}
                className="w-full py-6 text-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/20"
              >
                Create Video Using These Trends
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <p style={{ color: "var(--text-muted)" }}>No trend data available. Click Refresh to generate.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceholderContent() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Hook Library</h2>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-xl p-5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <div className="h-5 rounded bg-gray-700/30 w-3/4 mb-3" />
              <div className="h-4 rounded bg-gray-700/20 w-1/2 mb-2" />
              <div className="h-4 rounded bg-gray-700/20 w-2/3" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Keywords</h2>
        <div className="border rounded-xl p-5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 rounded-full bg-gray-700/20 w-24" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
