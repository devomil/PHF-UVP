// Phase NC-02 — Centralized handler for the canonical 402/403 envelopes
// emitted by every generation endpoint. Routes the user to the right
// modal (top-up vs upgrade) without each call site re-implementing the
// detection logic.

import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCreditModals } from "@/components/credits/credit-modals-provider";

export interface InsufficientCreditsEnvelope {
  success: false;
  error: string;
  code: "INSUFFICIENT_CREDITS";
  required: number;
  available: number;
  shortfall: number;
  provider: string | null;
  quality: string | null;
  durationS: number | null;
}

export interface ProviderNotInPlanEnvelope {
  success: false;
  error: string;
  code: "PROVIDER_NOT_IN_PLAN";
  provider: string;
  currentPlan: string | null;
  requiredPlan: string | null;
}

export type GenerationErrorEnvelope = InsufficientCreditsEnvelope | ProviderNotInPlanEnvelope;

function isCreditEnvelope(payload: unknown): payload is InsufficientCreditsEnvelope {
  return !!payload && typeof payload === "object" && (payload as { code?: string }).code === "INSUFFICIENT_CREDITS";
}
function isPlanEnvelope(payload: unknown): payload is ProviderNotInPlanEnvelope {
  return !!payload && typeof payload === "object" && (payload as { code?: string }).code === "PROVIDER_NOT_IN_PLAN";
}

export function useGenerationErrorHandler() {
  const { toast } = useToast();
  const { openTopUp, openUpgrade } = useCreditModals();

  const handle = useCallback(
    async (resOrPayload: Response | unknown, fallbackTitle = "Generation failed"): Promise<boolean> => {
      let payload: unknown = resOrPayload;
      let status: number | null = null;
      if (resOrPayload instanceof Response) {
        status = resOrPayload.status;
        try {
          payload = await resOrPayload.clone().json();
        } catch {
          payload = null;
        }
      }
      if (isCreditEnvelope(payload)) {
        toast({
          title: "Not enough credits",
          description: `Need ${payload.shortfall} more GC. Top up to continue.`,
          variant: "destructive",
        });
        openTopUp({ shortfall: payload.shortfall, required: payload.required, provider: payload.provider });
        return true;
      }
      if (isPlanEnvelope(payload)) {
        toast({
          title: "Plan upgrade required",
          description: `${payload.provider} is available on ${payload.requiredPlan ?? "a higher"} plan.`,
          variant: "destructive",
        });
        openUpgrade({ provider: payload.provider, requiredPlan: payload.requiredPlan });
        return true;
      }
      if (status && status >= 400) {
        const msg = (payload as { error?: string; message?: string })?.error || (payload as { message?: string })?.message || "Please try again.";
        toast({ title: fallbackTitle, description: msg, variant: "destructive" });
        return true;
      }
      return false;
    },
    [openTopUp, openUpgrade, toast],
  );

  return { handle };
}
