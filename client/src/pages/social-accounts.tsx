import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Unlink, RefreshCw, CheckCircle, Wifi, WifiOff, ExternalLink } from "lucide-react";

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
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const initialCountRef = useRef<number | null>(null);

  const { data: statusData } = useQuery({
    queryKey: ["/api/social/status"],
    queryFn: async () => {
      const res = await fetch("/api/social/status");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: accountsData, isLoading } = useQuery({
    queryKey: ["/api/social/accounts"],
    queryFn: async () => {
      const res = await fetch("/api/social/accounts");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/social/accounts/connect", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
        initialCountRef.current = (accountsData?.accounts || []).length;
        setPolling(true);
      }
    },
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

  useEffect(() => {
    if (polling) {
      const currentCount = (accountsData?.accounts || []).length;
      if (initialCountRef.current !== null && currentCount > initialCountRef.current) {
        setPolling(false);
        initialCountRef.current = null;
        return;
      }
      let elapsed = 0;
      pollRef.current = setInterval(() => {
        elapsed += 3000;
        queryClient.invalidateQueries({ queryKey: ["/api/social/accounts"] });
        if (elapsed >= 30000) {
          setPolling(false);
          initialCountRef.current = null;
          clearInterval(pollRef.current);
        }
      }, 3000);
      return () => clearInterval(pollRef.current);
    }
  }, [polling, queryClient, accountsData]);

  const accounts = accountsData?.accounts || [];
  const connectedMap = new Map<string, { platform: string; profileUrl?: string; displayName?: string }>(
    accounts.map((a: { platform: string; profileUrl?: string; displayName?: string }) => [a.platform, a])
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
          {statusData?.configured && (
            <button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending || polling}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-sm hover:from-purple-500 hover:to-violet-400 transition-all disabled:opacity-50"
            >
              {polling ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Waiting for connection...
                </>
              ) : connectMutation.isPending ? (
                "Opening..."
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  Connect Account
                </>
              )}
            </button>
          )}
        </div>

        {!statusData?.configured ? (
          <div className="rounded-xl border p-12 text-center" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
            <WifiOff className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
            <h3 className="text-lg font-semibold mb-2">Social publishing not configured</h3>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              An Ayrshare API key is needed to connect social accounts
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
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
                          style={{ backgroundColor: `${platform.color}20`, color: platform.color }}
                        >
                          {platform.label[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                            {platform.label}
                          </p>
                          {isConnected ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              <span className="text-xs text-green-500 font-medium">Connected</span>
                              {accountInfo.displayName && (
                                <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
                                  @{accountInfo.displayName}
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
                      <button
                        onClick={() => connectMutation.mutate()}
                        disabled={connectMutation.isPending || polling}
                        className="mt-3 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all"
                        style={{ borderColor: `${platform.color}40`, color: platform.color }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        Connect
                      </button>
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
