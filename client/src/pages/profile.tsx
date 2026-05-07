import { useState } from "react";
import { User, Lock, Bell, CreditCard, Link2, Unlink } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type OAuthProvider = "google" | "facebook";

type ConnectionsResponse = {
  hasPassword: boolean;
  connections: Array<{ provider: string; email: string | null; createdAt: string | null }>;
};

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: "Google",
  facebook: "Facebook",
};

function ConnectedAccountsPanel() {
  const { toast } = useToast();
  const [pendingDisconnect, setPendingDisconnect] = useState<OAuthProvider | null>(null);

  const { data, isLoading } = useQuery<ConnectionsResponse>({
    queryKey: ["/api/auth/connections"],
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: OAuthProvider) => {
      const res = await apiRequest("DELETE", `/api/auth/connections/${provider}`);
      return res.json();
    },
    onSuccess: (_data, provider) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/connections"] });
      toast({
        title: "Disconnected",
        description: `${PROVIDER_LABELS[provider]} sign-in has been removed from your account.`,
      });
      setPendingDisconnect(null);
    },
    onError: (err: Error, provider) => {
      let description = err.message;
      try {
        const parsed = JSON.parse(err.message);
        if (parsed?.message) description = parsed.message;
      } catch {
        // raw text
      }
      toast({
        title: `Couldn't disconnect ${PROVIDER_LABELS[provider]}`,
        description,
        variant: "destructive",
      });
      setPendingDisconnect(null);
    },
  });

  const providers: OAuthProvider[] = ["google", "facebook"];
  const linksByProvider = new Map(
    (data?.connections || []).map((c) => [c.provider, c]),
  );
  const linkedCount = data?.connections.length ?? 0;
  const hasPassword = data?.hasPassword ?? false;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
        <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          Connected Accounts
        </h2>
      </div>
      <div
        className="border rounded-xl p-5 space-y-3"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
      >
        {isLoading ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : (
          providers.map((provider) => {
            const link = linksByProvider.get(provider);
            const isLinked = !!link;
            const wouldLockOut = isLinked && !hasPassword && linkedCount <= 1;
            return (
              <div
                key={provider}
                className="flex items-center justify-between gap-3 py-2"
                data-testid={`connection-row-${provider}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {PROVIDER_LABELS[provider]}
                  </p>
                  <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {isLinked
                      ? link?.email
                        ? `Linked as ${link.email}`
                        : "Linked"
                      : "Not connected"}
                  </p>
                  {wouldLockOut && (
                    <p className="text-xs mt-1 text-amber-400">
                      Set a password before disconnecting — this is your only sign-in method.
                    </p>
                  )}
                </div>
                {isLinked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0"
                    disabled={wouldLockOut || disconnectMutation.isPending}
                    onClick={() => setPendingDisconnect(provider)}
                    data-testid={`button-disconnect-${provider}`}
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Disconnect
                  </Button>
                ) : (
                  <a
                    href={`/api/auth/${provider}`}
                    className="text-xs px-3 py-1.5 rounded-md border shrink-0 hover:bg-purple-500/10 transition-colors"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                    data-testid={`link-connect-${provider}`}
                  >
                    Connect
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>

      <AlertDialog
        open={!!pendingDisconnect}
        onOpenChange={(open) => {
          if (!open) setPendingDisconnect(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect {pendingDisconnect ? PROVIDER_LABELS[pendingDisconnect] : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You won't be able to sign in with {pendingDisconnect ? PROVIDER_LABELS[pendingDisconnect] : "this provider"} after this.
              You can reconnect any time from this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDisconnect) disconnectMutation.mutate(pendingDisconnect);
              }}
              disabled={disconnectMutation.isPending}
              data-testid="button-confirm-disconnect"
            >
              {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();

  const initials = user
    ? `${(user.firstName || user.email[0] || "").charAt(0)}${(user.lastName || "").charAt(0)}`.toUpperCase()
    : "?";

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
    : "Unknown User";

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <User className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>View and manage your account</p>
            </div>
          </div>
          <Link href="/billing">
            <Button variant="outline" className="gap-2" data-testid="link-billing">
              <CreditCard className="w-4 h-4" />
              Plans &amp; billing
            </Button>
          </Link>
        </div>

        <div className="border rounded-xl p-6 mb-6 flex items-center gap-6" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-2xl font-bold text-white shrink-0 shadow-lg shadow-purple-500/20">
            {initials}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>{displayName}</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{user?.email || "No email"}</p>
            <span className="inline-block mt-2 text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 capitalize">
              {user?.role || "User"}
            </span>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Account Settings</h2>
            </div>
            <div className="border rounded-xl p-5 space-y-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Current Password</label>
                <input
                  type="password"
                  placeholder="Enter current password"
                  className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>New Password</label>
                <input
                  type="password"
                  placeholder="Enter new password"
                  className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Confirm New Password</label>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                />
              </div>
            </div>
          </div>

          <ConnectedAccountsPanel />

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Preferences</h2>
            </div>
            <div className="border rounded-xl p-5 space-y-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Email Notifications</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Receive updates about your renders</p>
                </div>
                <button className="w-11 h-6 rounded-full bg-purple-600 relative transition-colors">
                  <span className="absolute right-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform" />
                </button>
              </div>
              <div className="border-t" style={{ borderColor: "var(--border-subtle)" }} />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Render Completion Alerts</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Get notified when renders finish</p>
                </div>
                <button className="w-11 h-6 rounded-full bg-purple-600 relative transition-colors">
                  <span className="absolute right-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform" />
                </button>
              </div>
              <div className="border-t" style={{ borderColor: "var(--border-subtle)" }} />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Marketing Emails</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Product updates and tips</p>
                </div>
                <button className="w-11 h-6 rounded-full relative transition-colors" style={{ backgroundColor: "var(--surface-active)" }}>
                  <span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full transition-transform" style={{ backgroundColor: "var(--text-muted)" }} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-8 py-2.5 rounded-lg font-medium shadow-lg shadow-purple-500/20">
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
