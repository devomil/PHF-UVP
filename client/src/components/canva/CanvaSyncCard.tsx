import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface CanvaSyncStatusResponse {
  connected: boolean;
  status: string;
  totalAssets?: number;
  successCount?: number;
  failedCount?: number;
  assetIds?: { id: string; type: string; label: string }[];
  lastError?: string | null;
}

interface CanvaSyncCardProps {
  projectId: string;
  hasOutput: boolean;
}

export function CanvaSyncCard({ projectId, hasOutput }: CanvaSyncCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<CanvaSyncStatusResponse>({
    queryKey: ["canva-sync-status", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/canva/sync/status/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sync status");
      return res.json();
    },
    enabled: hasOutput,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d && d.status === "in_progress") return 5000;
      return false;
    },
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/canva/sync/${projectId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Canva sync started", description: "Your assets are being uploaded to Canva." });
      queryClient.invalidateQueries({ queryKey: ["canva-sync-status", projectId] });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  if (!hasOutput || isLoading) return null;
  if (!data?.connected) return null;

  const { status, successCount = 0, totalAssets = 0, failedCount = 0, lastError } = data;

  if (status === "not_started" && !data.status) return null;

  const statusConfig = getStatusConfig(status);

  return (
    <div
      className="border rounded-xl p-4"
      style={{ backgroundColor: "var(--surface)", borderColor: status === "success" ? "#7D2AE840" : "var(--border-subtle)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <CanvaIconSmall />
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Canva Sync</p>
      </div>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${statusConfig.dotColor}`} />
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {statusConfig.label}
        </span>
      </div>
      {status === "success" && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {successCount} asset{successCount !== 1 ? "s" : ""} uploaded
        </p>
      )}
      {status === "partial" && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {successCount}/{totalAssets} succeeded · {failedCount} failed
        </p>
      )}
      {status === "in_progress" && (
        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
        </p>
      )}

      <div className="flex items-center gap-2 mt-2">
        {(status === "failed" || status === "partial") && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Retry
          </Button>
        )}
        {status === "not_started" && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CloudUploadIcon className="w-3 h-3" />
            )}
            Sync to Canva
          </Button>
        )}
        {(status === "success" || status === "partial") && (
          <a
            href="https://www.canva.com/folder/uploads"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs hover:text-purple-400 transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <ExternalLink className="w-3 h-3" />
            View in Canva
          </a>
        )}
      </div>

      {lastError && (status === "failed" || status === "partial") && (
        <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--text-muted)" }}>
          {lastError}
        </p>
      )}
    </div>
  );
}

function getStatusConfig(status: string) {
  switch (status) {
    case "success":
      return { label: "Synced", dotColor: "bg-green-500" };
    case "partial":
      return { label: "Partial", dotColor: "bg-amber-500" };
    case "failed":
      return { label: "Failed", dotColor: "bg-red-500" };
    case "in_progress":
      return { label: "Syncing", dotColor: "bg-blue-500 animate-pulse" };
    case "not_started":
      return { label: "Not synced", dotColor: "bg-gray-500" };
    default:
      return { label: "Unknown", dotColor: "bg-gray-500" };
  }
}

export function CanvaSyncBadge({ projectId }: { projectId: string }) {
  const { data } = useQuery<CanvaSyncStatusResponse>({
    queryKey: ["canva-sync-status", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/canva/sync/status/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
  });

  if (!data?.connected || data.status === "not_started" || data.status === "not_connected") return null;

  const dotColor =
    data.status === "success" ? "bg-green-500" :
    data.status === "partial" ? "bg-amber-500" :
    data.status === "failed" ? "bg-red-500" :
    "bg-blue-500 animate-pulse";

  return (
    <div className="inline-flex items-center gap-1" title={`Canva: ${data.status}`}>
      <CanvaIconTiny />
      <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
    </div>
  );
}

function CanvaIconSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.223 14.435c-.547.762-1.395 1.2-2.314 1.2-1.544 0-2.473-1.168-2.812-2.177-.295.388-.773.904-1.483.904-.914 0-1.49-.755-1.49-1.792 0-1.867 1.585-4.383 3.752-4.383.725 0 1.324.302 1.696.686l.22-.504h1.363l-1.17 3.883c-.163.547-.105.826.186.826.519 0 1.36-1.012 1.36-2.74 0-2.5-1.812-4.35-4.53-4.35-2.89 0-5.125 2.39-5.125 5.407 0 3.106 2.227 4.83 4.91 4.83.998 0 1.914-.216 2.76-.696l.542.983c-1.022.547-2.187.837-3.39.837C7.18 19.35 4 16.74 4 12.613 4 8.39 7.288 5.42 11.218 5.42c3.558 0 6.12 2.39 6.12 5.7 0 2.73-1.455 4.6-3.115 5.315h.005-.005z"
        fill="#7D2AE8"
      />
    </svg>
  );
}

function CanvaIconTiny() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.223 14.435c-.547.762-1.395 1.2-2.314 1.2-1.544 0-2.473-1.168-2.812-2.177-.295.388-.773.904-1.483.904-.914 0-1.49-.755-1.49-1.792 0-1.867 1.585-4.383 3.752-4.383.725 0 1.324.302 1.696.686l.22-.504h1.363l-1.17 3.883c-.163.547-.105.826.186.826.519 0 1.36-1.012 1.36-2.74 0-2.5-1.812-4.35-4.53-4.35-2.89 0-5.125 2.39-5.125 5.407 0 3.106 2.227 4.83 4.91 4.83.998 0 1.914-.216 2.76-.696l.542.983c-1.022.547-2.187.837-3.39.837C7.18 19.35 4 16.74 4 12.613 4 8.39 7.288 5.42 11.218 5.42c3.558 0 6.12 2.39 6.12 5.7 0 2.73-1.455 4.6-3.115 5.315h.005-.005z"
        fill="#7D2AE8"
      />
    </svg>
  );
}

function CloudUploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  );
}
