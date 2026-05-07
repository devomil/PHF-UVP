// Phase NC-02 — Cross-surface bridge between fetch-based call sites
// and the React-only CreditModalsProvider.
//
// The provider registers a handler at mount; any module that detects a
// canonical 402/403 envelope (typically the global queryClient/apiRequest
// helpers) forwards the parsed payload here. This lets every legacy
// generation surface — even those built with bare `fetch` and no
// React hooks — pop the right modal without each one importing the
// provider directly.

type CreditEnvelope =
  | {
      code: "INSUFFICIENT_CREDITS";
      shortfall: number;
      required: number;
      available: number;
      provider: string | null;
      quality: string | null;
      durationS: number | null;
    }
  | {
      code: "PROVIDER_NOT_IN_PLAN";
      provider: string;
      currentPlan: string | null;
      requiredPlan: string | null;
    };

type Handler = (env: CreditEnvelope) => void;

let handler: Handler | null = null;

export function registerCreditErrorHandler(h: Handler): () => void {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

export function dispatchCreditError(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const code = (payload as { code?: string }).code;
  if (code !== "INSUFFICIENT_CREDITS" && code !== "PROVIDER_NOT_IN_PLAN") return false;
  if (!handler) return false;
  handler(payload as CreditEnvelope);
  return true;
}

// Best-effort parse: drains either a Response or a parsed body and
// dispatches if it matches one of the canonical envelopes.
export async function tryDispatchFromResponse(res: Response): Promise<boolean> {
  if (res.status !== 402 && res.status !== 403) return false;
  try {
    const cloned = res.clone();
    const body = await cloned.json();
    return dispatchCreditError(body);
  } catch {
    return false;
  }
}
