// Phase NC-02 — App-wide provider for the top-up and upgrade modals so
// any generation surface can pop them open without owning local state
// or re-rendering the whole layout. Mounted once near the root.
//
// Three integration points:
//   1. React surfaces consume `useCreditModals()` directly.
//   2. Pure-fetch surfaces dispatch through `credit-error-bus` (wired
//      into apiRequest + the react-query default queryFn) so 402/403
//      envelopes auto-route to the right modal.
//   3. Global keyboard shortcut: ⌘/Ctrl+Shift+T opens the top-up
//      modal from anywhere in the app, matching the spec acceptance
//      criteria for a discoverable cross-surface entry point.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TopUpModal } from "./topup-modal";
import { UpgradeModal } from "./upgrade-modal";
import { useToast } from "@/hooks/use-toast";
import { registerCreditErrorHandler } from "@/lib/credit-error-bus";
import { useCredits } from "@/hooks/use-credits";
import { isAdminUnlimitedSnapshot } from "@/lib/admin-unlimited";

interface TopUpContext {
  shortfall?: number;
  required?: number;
  provider?: string | null;
}

interface UpgradeContext {
  provider?: string | null;
  requiredPlan?: string | null;
  currentPlan?: string | null;
}

interface CreditModalsValue {
  openTopUp: (ctx?: TopUpContext) => void;
  closeTopUp: () => void;
  openUpgrade: (ctx?: UpgradeContext) => void;
  closeUpgrade: () => void;
  topUpContext: TopUpContext | null;
  upgradeContext: UpgradeContext | null;
}

const Ctx = createContext<CreditModalsValue | null>(null);

export function useCreditModals(): CreditModalsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCreditModals must be used inside <CreditModalsProvider>");
  return v;
}

export function CreditModalsProvider({ children }: { children: ReactNode }) {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [topUpContext, setTopUpContext] = useState<TopUpContext | null>(null);
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContext | null>(null);
  const { toast } = useToast();
  const { data: credits } = useCredits();
  const isUnlimited = isAdminUnlimitedSnapshot(credits);

  const openTopUp = useCallback((ctx?: TopUpContext) => {
    if (isUnlimited) {
      toast({
        title: "Admin account",
        description: "Top-ups are disabled — your generations don't charge a balance.",
      });
      return;
    }
    setTopUpContext(ctx ?? null);
    setTopUpOpen(true);
  }, [isUnlimited, toast]);
  const closeTopUp = useCallback(() => setTopUpOpen(false), []);

  // Upgrade flow: open a true modal with the recommended plan
  // pre-selected from `requiredPlan`. Keeps the upgrade context
  // (provider name, current vs required tier) inside the dialog so the
  // user doesn't lose context navigating away from their workflow.
  const openUpgrade = useCallback((ctx?: UpgradeContext) => {
    if (isUnlimited) {
      toast({
        title: "Admin account",
        description: "Plan upgrades are disabled — every provider is already unlocked.",
      });
      return;
    }
    setUpgradeContext(ctx ?? null);
    setUpgradeOpen(true);
  }, [isUnlimited, toast]);
  const closeUpgrade = useCallback(() => setUpgradeOpen(false), []);

  // Bridge for non-React call sites (apiRequest, queryClient default
  // queryFn, etc.) — they dispatch the envelope through the bus and
  // we handle it here.
  useEffect(() => {
    return registerCreditErrorHandler((env) => {
      if (env.code === "INSUFFICIENT_CREDITS") {
        toast({
          title: "Not enough credits",
          description: `Need ${env.shortfall} more GC. Top up to continue.`,
          variant: "destructive",
        });
        openTopUp({ shortfall: env.shortfall, required: env.required, provider: env.provider });
      } else if (env.code === "PROVIDER_NOT_IN_PLAN") {
        toast({
          title: "Plan upgrade required",
          description: `${env.provider} is available on ${env.requiredPlan ?? "a higher"} plan.`,
          variant: "destructive",
        });
        openUpgrade({ provider: env.provider, requiredPlan: env.requiredPlan });
      }
    });
  }, [openTopUp, openUpgrade, toast]);

  // Global keyboard shortcut: ⌘/Ctrl+Shift+T → top-up modal. Skipped
  // when typing in inputs/textareas/contenteditable so we don't hijack
  // routine editor shortcuts.
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || !e.shiftKey) return;
      if (e.key !== "T" && e.key !== "t") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      openTopUp();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTopUp]);

  const value = useMemo<CreditModalsValue>(
    () => ({ openTopUp, closeTopUp, openUpgrade, closeUpgrade, topUpContext, upgradeContext }),
    [openTopUp, closeTopUp, openUpgrade, closeUpgrade, topUpContext, upgradeContext],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <TopUpModal open={topUpOpen} onOpenChange={setTopUpOpen} context={topUpContext ?? undefined} />
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} context={upgradeContext ?? undefined} />
    </Ctx.Provider>
  );
}
