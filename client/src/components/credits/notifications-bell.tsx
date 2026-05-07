// Phase NC-02 — Notifications bell sitting alongside the credit meter.
// Renders the unread count + a popover-style inbox via radix HoverCard.

import { Bell } from "lucide-react";
import { useLocation } from "wouter";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { useCreditNotifications, type CreditNotification } from "@/hooks/use-credit-notifications";
import { useCreditModals } from "@/components/credits/credit-modals-provider";

const LABELS: Record<CreditNotification["threshold"], string> = {
  USAGE_80: "80% credits used",
  USAGE_95: "95% credits used",
  USAGE_100: "Out of credits",
  RESET_TOMORROW: "Credits reset tomorrow",
  RESET_TODAY: "Fresh credits arrived",
};

const TONE: Record<CreditNotification["threshold"], string> = {
  USAGE_80: "text-amber-300",
  USAGE_95: "text-orange-300",
  USAGE_100: "text-rose-300",
  RESET_TOMORROW: "text-purple-300",
  RESET_TODAY: "text-emerald-300",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Each threshold deep-links to the most actionable destination. USAGE
// thresholds open the top-up modal in-place; reset notifications drop
// the user on the billing page where the new cycle is summarized.
function actionFor(threshold: CreditNotification["threshold"]) {
  switch (threshold) {
    case "USAGE_80":
    case "USAGE_95":
    case "USAGE_100":
      return { label: "Top up", kind: "topup" as const };
    case "RESET_TOMORROW":
    case "RESET_TODAY":
      return { label: "View billing", kind: "billing" as const };
  }
}

export function NotificationsBell() {
  const { items, unreadCount, markRead, markAllRead } = useCreditNotifications();
  const { openTopUp } = useCreditModals();
  const [, setLocation] = useLocation();

  function handleAction(n: CreditNotification) {
    const action = actionFor(n.threshold);
    if (!n.readAt) markRead(n.id);
    if (action.kind === "topup") openTopUp({ shortfall: 0, provider: null });
    else setLocation("/billing");
  }
  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          className="relative p-2 rounded-lg border border-purple-500/15 bg-gradient-to-br from-purple-950/30 to-indigo-950/20 hover:border-purple-400/40 hover:shadow-[0_0_24px_-8px] hover:shadow-purple-500/40 transition-all"
          data-testid="notifications-bell"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="w-4 h-4 text-purple-200" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-gradient-to-r from-rose-500 to-rose-600 text-[10px] font-bold text-white flex items-center justify-center"
              data-testid="notifications-bell-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="end"
        className="w-80 p-0 border border-purple-500/20 bg-gradient-to-b from-slate-950 to-purple-950/40 backdrop-blur"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <div className="text-sm font-semibold">Credit notifications</div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="text-[11px] text-purple-300 hover:text-purple-200"
              data-testid="notifications-mark-all-read"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground" data-testid="notifications-empty">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {items.map((n) => {
                const action = actionFor(n.threshold);
                return (
                  <li
                    key={n.id}
                    className={`px-3 py-2.5 flex items-start gap-2 ${n.readAt ? "opacity-60" : ""}`}
                    data-testid={`notification-${n.id}`}
                  >
                    <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${n.readAt ? "bg-white/20" : "bg-gradient-to-r from-purple-400 to-indigo-400"}`} />
                    <button
                      onClick={() => handleAction(n)}
                      className="flex-1 min-w-0 text-left hover:bg-white/5 -mx-1 px-1 py-0.5 rounded transition-colors"
                      data-testid={`notification-${n.id}-action`}
                    >
                      <div className={`text-xs font-medium ${TONE[n.threshold]}`}>{LABELS[n.threshold]}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {n.percentUsed != null && `${n.percentUsed}% used · `}
                        {n.remainingGC != null && `${n.remainingGC} GC left · `}
                        {timeAgo(n.createdAt)}
                      </div>
                      <div className="text-[10px] text-purple-300 mt-1">{action.label} →</div>
                    </button>
                    {!n.readAt && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                        className="text-[10px] text-purple-300 hover:text-purple-200 shrink-0"
                        data-testid={`notification-${n.id}-read`}
                      >
                        Read
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="p-2 border-t border-white/5">
          <a href="/billing#notifications" className="block w-full">
            <Button size="sm" variant="outline" className="w-full" data-testid="notifications-view-all">
              View in billing
            </Button>
          </a>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
