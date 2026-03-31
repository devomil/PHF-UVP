import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Unlink, RefreshCw, CheckCircle, Wifi, WifiOff, ExternalLink, Shield, ArrowRight } from "lucide-react";
import { PlatformIcon } from "@/components/social/platform-icons";
import { useToast } from "@/hooks/use-toast";

const PLATFORMS = [
  { id: "twitter", label: "X / Twitter", color: "#1DA1F2", bgGrad: "from-sky-500/20 to-sky-600/10" },
  { id: "instagram", label: "Instagram", color: "#E4405F", bgGrad: "from-pink-500/20 to-rose-600/10" },
  { id: "tiktok", label: "TikTok", color: "#69C9D0", bgGrad: "from-teal-400/20 to-teal-600/10" },
  { id: "facebook", label: "Facebook", color: "#1877F2", bgGrad: "from-blue-500/20 to-blue-600/10" },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", bgGrad: "from-blue-600/20 to-blue-700/10" },
  { id: "youtube", label: "YouTube", color: "#FF0000", bgGrad: "from-red-500/20 to-red-600/10" },
  { id: "pinterest", label: "Pinterest", color: "#BD081C", bgGrad: "from-red-600/20 to-red-700/10" },
  { id: "threads", label: "Threads", color: "#888888", bgGrad: "from-gray-400/20 to-gray-600/10" },
];

function SocialAccounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [provisioned, setProvisioned] = useState(false);

  const { data: statusData } = useQuery({
    queryKey: ["/api/social/status"],
    queryFn: async () => {
      const res = await fetch("/api/social/status");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (statusData?.configured && !provisioned) {
      fetch("/api/social/provision", { method: "POST" })
        .then(() => setProvisioned(true))
        .catch(() => {});
    }
  }, [statusData?.configured, provisioned]);

  const { data: accountsData, isLoading } = useQuery({
    queryKey: ["/api/social/accounts"],
    queryFn: async () => {
      const res = await fetch("/api/social/accounts");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: provisioned || !!statusData?.configured,
  });

  const disconnectMutation = useMutation({
    mutationFn: async (platform: string) => {
      const res = await fetch(`/api/social/accounts/${platform}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/accounts"] });
    },
  });

  const accounts = accountsData?.accounts || [];
  const connectedMap = new Map<string, { platform: string; profileUrl?: string; displayName?: string; username?: string; profileImageUrl?: string }>(
    accounts.map((a: { platform: string; profileUrl?: string; displayName?: string; username?: string; profileImageUrl?: string }) => [a.platform, a])
  );

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Wifi className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Connected Accounts</h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Manage your social media connections</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusData?.configured && (
              <button
                onClick={() => { queryClient.invalidateQueries({ queryKey: ["/api/social/accounts"] }); toast({ title: "Refreshing accounts..." }); }}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all hover:opacity-80"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            )}
            <a
              href="https://app.ayrshare.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-sm hover:from-purple-500 hover:to-violet-400 transition-all"
            >
              <Link2 className="w-4 h-4" />
              Connect Account
            </a>
          </div>
        </div>

        <div className="rounded-xl border mb-6 overflow-hidden" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
          <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/20 shrink-0">
              <Shield className="w-6 h-6 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold mb-1">Powered by Ayrshare</h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                We partner with Ayrshare to manage your social media connections. Ayrshare integrates directly with each social network's official APIs and partnership programs, ensuring the most reliable, secure, and compliant social media management experience.
              </p>
            </div>
            <a
              href="https://app.ayrshare.com"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-xs hover:from-purple-500 hover:to-violet-400 transition-all"
            >
              Manage Connections
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {!statusData?.configured ? (
          <div className="rounded-xl border p-12 text-center" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
            <WifiOff className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
            <h3 className="text-lg font-semibold mb-2">Social publishing not configured</h3>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              An Ayrshare API key is needed to connect social accounts.{" "}
              <a href="https://www.ayrshare.com/?via=neuralcut" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">
                Click here to sign up
              </a>
            </p>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: "var(--surface)" }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PLATFORMS.map((platform) => {
              const accountInfo = connectedMap.get(platform.id);
              const isConnected = !!accountInfo;
              return (
                <div
                  key={platform.id}
                  className={`relative overflow-hidden rounded-xl border transition-all ${isConnected ? "hover:shadow-lg" : "opacity-75 hover:opacity-100"}`}
                  style={{ borderColor: isConnected ? `${platform.color}40` : "var(--border-subtle)", backgroundColor: "var(--surface)" }}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${platform.bgGrad} pointer-events-none`} />
                  <div className="relative p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: `${platform.color}20`, color: platform.color }}
                          >
                            {PlatformIcon[platform.id] ? (
                              (() => { const Icon = PlatformIcon[platform.id]; return <Icon className="w-5 h-5" />; })()
                            ) : (
                              <span className="text-lg font-bold">{platform.label[0]}</span>
                            )}
                          </div>
                          {isConnected && accountInfo.profileImageUrl && (
                            <img
                              src={accountInfo.profileImageUrl}
                              alt={accountInfo.username || platform.label}
                              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 object-cover"
                              style={{ borderColor: "var(--surface)" }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                            {platform.label}
                          </p>
                          {isConnected ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              <span className="text-xs text-green-500 font-medium">Connected</span>
                              {(accountInfo.username || accountInfo.displayName) && (
                                <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
                                  @{accountInfo.username || accountInfo.displayName}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Not connected</span>
                          )}
                        </div>
                      </div>
                      {isConnected && (
                        <button
                          onClick={() => disconnectMutation.mutate(platform.id)}
                          disabled={disconnectMutation.isPending}
                          className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                          title="Disconnect"
                        >
                          <Unlink className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                    </div>
                    {!isConnected && (
                      <a
                        href="https://app.ayrshare.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all hover:opacity-80"
                        style={{ borderColor: `${platform.color}40`, color: platform.color }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        Connect via Ayrshare
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default SocialAccounts;
