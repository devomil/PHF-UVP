// Phase NC-02 — Hook for the credit-notifications inbox/bell.
//
// Server is the source of truth: the engine fires when thresholds cross
// and creates one row per (user, cycle, threshold). The client just lists,
// counts unread, and POSTs read receipts.

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

export type CreditNotificationThreshold =
  | "USAGE_80"
  | "USAGE_95"
  | "USAGE_100"
  | "RESET_TOMORROW"
  | "RESET_TODAY";

export interface CreditNotification {
  id: number;
  userId: string;
  cycleStart: string;
  threshold: CreditNotificationThreshold;
  percentUsed: number | null;
  remainingGC: number | null;
  emailSent: boolean;
  readAt: string | null;
  createdAt: string;
}

interface InboxResponse {
  items: CreditNotification[];
  unreadCount: number;
}

const INBOX_KEY = ["/api/credits/notifications"];

export function useCreditNotifications() {
  const qc = useQueryClient();

  const q = useQuery<InboxResponse>({
    queryKey: INBOX_KEY,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await fetch("/api/credits/notifications?limit=50", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/credits/notifications/${id}/read`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: INBOX_KEY }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/credits/notifications/read-all", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: INBOX_KEY }),
  });

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: INBOX_KEY }), [qc]);

  return {
    items: q.data?.items ?? [],
    unreadCount: q.data?.unreadCount ?? 0,
    isLoading: q.isLoading,
    error: q.error,
    markRead: (id: number) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
    refresh,
  };
}
