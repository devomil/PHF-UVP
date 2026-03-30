import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Share2, Plus, Calendar, Clock, Send, RefreshCw } from "lucide-react";

function SocialHub() {
  const [activeTab, setActiveTab] = useState<"posts" | "accounts">("posts");

  const { data: statusData } = useQuery({
    queryKey: ["/api/social/status"],
    queryFn: async () => {
      const res = await fetch("/api/social/status");
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
  });

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ["/api/social/posts"],
    queryFn: async () => {
      const res = await fetch("/api/social/posts");
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
  });

  const { data: accountsData } = useQuery({
    queryKey: ["/api/social/accounts"],
    queryFn: async () => {
      const res = await fetch("/api/social/accounts");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
  });

  const posts = postsData?.posts || [];
  const accounts = accountsData?.accounts || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Social Publishing Hub
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Schedule and publish your videos across social platforms
          </p>
        </div>
        <a
          href="/social/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-sm hover:from-purple-500 hover:to-violet-400 transition-all"
        >
          <Plus className="w-4 h-4" />
          New Post
        </a>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("posts")}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: activeTab === "posts" ? "var(--surface-active)" : "transparent",
            color: activeTab === "posts" ? "rgb(124, 58, 237)" : "var(--text-secondary)",
          }}
        >
          Posts
        </button>
        <button
          onClick={() => setActiveTab("accounts")}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: activeTab === "accounts" ? "var(--surface-active)" : "transparent",
            color: activeTab === "accounts" ? "rgb(124, 58, 237)" : "var(--text-secondary)",
          }}
        >
          Connected Accounts
        </button>
      </div>

      {activeTab === "posts" && (
        <div>
          {postsLoading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "var(--text-muted)" }} />
            </div>
          ) : posts.length === 0 ? (
            <div
              className="rounded-xl border p-12 text-center"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-card)" }}
            >
              <Share2 className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
              <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                No posts yet
              </h3>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                Create your first social post to start sharing your video content
              </p>
              <a
                href="/social/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-sm"
              >
                <Plus className="w-4 h-4" />
                Create Post
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post: any) => (
                <div
                  key={post.id}
                  className="rounded-xl border p-4 flex items-center gap-4"
                  style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-card)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {post.title || post.caption?.substring(0, 80) || "Untitled"}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {post.platforms?.join(", ")}
                      </span>
                      {post.scheduledFor && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                          <Clock className="w-3 h-3" />
                          {new Date(post.scheduledFor).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{
                      backgroundColor:
                        post.status === "published"
                          ? "rgba(34,197,94,0.15)"
                          : post.status === "scheduled"
                          ? "rgba(59,130,246,0.15)"
                          : post.status === "failed"
                          ? "rgba(239,68,68,0.15)"
                          : "rgba(156,163,175,0.15)",
                      color:
                        post.status === "published"
                          ? "rgb(34,197,94)"
                          : post.status === "scheduled"
                          ? "rgb(59,130,246)"
                          : post.status === "failed"
                          ? "rgb(239,68,68)"
                          : "var(--text-secondary)",
                    }}
                  >
                    {post.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "accounts" && (
        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-card)" }}
        >
          {!statusData?.configured ? (
            <div className="text-center py-8">
              <Share2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
              <h3 className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Social publishing not configured
              </h3>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                An Ayrshare API key is needed to connect social accounts
              </p>
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8">
              <Share2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
              <h3 className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                No accounts connected
              </h3>
              <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                Connect your social media accounts to start publishing
              </p>
              <button
                onClick={async () => {
                  try {
                    await fetch("/api/social/profile", { method: "POST" });
                    const res = await fetch("/api/social/connect-url");
                    const data = await res.json();
                    if (data.url) window.open(data.url, "_blank");
                  } catch (err) {
                    console.error("Connect error:", err);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-500 text-white font-medium text-sm"
              >
                Connect Accounts
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account: any) => (
                <div
                  key={account.platform}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ backgroundColor: "var(--surface-hover)" }}
                >
                  <span className="text-sm font-medium capitalize" style={{ color: "var(--text-primary)" }}>
                    {account.platform}
                  </span>
                  <span className="text-xs text-green-500 font-medium">Connected</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SocialHub;
