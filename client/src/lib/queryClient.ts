import { QueryClient } from "@tanstack/react-query";
import { tryDispatchFromResponse } from "@/lib/credit-error-bus";

// Phase NC-02 — Cross-surface 402/403 routing.
//
// `apiRequest` and the default react-query queryFn now check every
// non-OK response for the canonical INSUFFICIENT_CREDITS /
// PROVIDER_NOT_IN_PLAN envelope and forward it to the credit-error
// bus. The CreditModalsProvider listens on the bus and pops the right
// modal, so every legacy generation surface — even pure-fetch ones —
// gets the new UX without per-call-site changes.

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    await tryDispatchFromResponse(res);
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  return res;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const res = await fetch(queryKey[0] as string, {
          credentials: "include",
        });

        if (!res.ok) {
          await tryDispatchFromResponse(res);
          if (res.status >= 500) {
            throw new Error(`${res.status}: ${res.statusText}`);
          }
          throw new Error(`${res.status}: ${await res.text()}`);
        }

        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
