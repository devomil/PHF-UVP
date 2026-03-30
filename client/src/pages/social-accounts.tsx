import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Share2, Link2, Unlink, RefreshCw } from "lucide-react";

const PLATFORMS = [
  { id: "twitter", label: "X / Twitter", color: "#1DA1F2" },
  { id: "instagram", label: "Instagram", color: "#E4405F" },
  { id: "tiktok", label: "TikTok", color: "#010101" },
  { id: "facebook", label: "Facebook", color: "#1877F2" },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2" },
  { id: "youtube", label: "YouTube", color: "#FF0000" },
  { id: "pinterest", label: "Pinterest", color: "#BD081C" },
  { id: "threads", label: "Threads", color: "#000000" },
];

function SocialAccounts() {
  const queryClient = useQueryClient();

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
      if (data.url) window.open(data.url, "_blank");
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

  const accounts = accountsData?.accounts || [];
  const connectedPlatforms = new Set(accounts.map((a: any) => a.platform));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Connected Accounts
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Manage your social media connections
        </p>
      </div>

      {!statusData?.configured ? (
        <div
          className="rounded-xl border p-12 text-center"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-card)" }}
        >
          <Share2 className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
          <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            Social publishing not configured
          </h3>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            An Ayrshare API key is needed to connect social accounts
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end mb-4">
            <button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-sm hover:from-purple-500 hover:to-violet-400 transition-all disabled:opacity-50"
            >
              <Link2 className="w-4 h-4" />
              {connectMutation.isPending ? "Opening..." : "Connect Accounts"}
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "var(--text-muted)" }} />
            </div>
          ) : (
            PLATFORMS.map((platform) => {
              const isConnected = connectedPlatforms.has(platform.id);
              return (
                <div
                  key={platform.id}
                  className="flex items-center justify-between p-4 rounded-xl border"
                  style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-card)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${platform.color}20` }}
                    >
                      <Share2 className="w-4 h-4" style={{ color: platform.color }} />
                    </div>
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {platform.label}
                    </span>
                  </div>
                  {isConnected ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-green-500 font-medium">Connected</span>
                      <button
                        onClick={() => disconnectMutation.mutate(platform.id)}
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                        title="Disconnect"
                      >
                        <Unlink className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Not connected
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default SocialAccounts;
