// Phase NC-02 — App-wide provider for the top-up and upgrade modals so
// any generation surface can pop them open without owning local state
// or re-rendering the whole layout. Mounted once near the root.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { TopUpModal } from "./topup-modal";

interface TopUpContext {
  shortfall?: number;
  required?: number;
  provider?: string | null;
}

interface UpgradeContext {
  provider?: string | null;
  requiredPlan?: string | null;
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
  const [topUpContext, setTopUpContext] = useState<TopUpContext | null>(null);
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContext | null>(null);
  const [, setLocation] = useLocation();

  const openTopUp = useCallback((ctx?: TopUpContext) => {
    setTopUpContext(ctx ?? null);
    setTopUpOpen(true);
  }, []);
  const closeTopUp = useCallback(() => setTopUpOpen(false), []);

  // Upgrade flow: deep-link straight to /billing with the required-plan
  // hash so the page can scroll the right plan into view. Keeps the
  // upgrade UX in one place rather than duplicating a comparison modal.
  const openUpgrade = useCallback(
    (ctx?: UpgradeContext) => {
      setUpgradeContext(ctx ?? null);
      const hash = ctx?.requiredPlan ? `#plan-${ctx.requiredPlan}` : "";
      setLocation(`/billing${hash}`);
    },
    [setLocation],
  );
  const closeUpgrade = useCallback(() => setUpgradeContext(null), []);

  const value = useMemo<CreditModalsValue>(
    () => ({ openTopUp, closeTopUp, openUpgrade, closeUpgrade, topUpContext, upgradeContext }),
    [openTopUp, closeTopUp, openUpgrade, closeUpgrade, topUpContext, upgradeContext],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <TopUpModal open={topUpOpen} onOpenChange={setTopUpOpen} context={topUpContext ?? undefined} />
    </Ctx.Provider>
  );
}
