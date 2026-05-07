// Phase NC-01 + NC-02 — Top-up purchase modal. Calls the server-side
// checkout endpoint and redirects the browser to the processor's
// hosted page. Auto-selects the cheapest pack that covers the
// shortfall when context is provided so the user doesn't have to
// hunt for the right size.

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/use-credits";
import { Coins, Sparkles } from "lucide-react";

interface TopUpPack {
  id: string;
  gc: number;
  priceCents: number;
  configured: boolean;
}

interface TopUpContext {
  shortfall?: number;
  required?: number;
  provider?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: TopUpContext;
}

export function TopUpModal({ open, onOpenChange, context }: Props) {
  const [packs, setPacks] = useState<TopUpPack[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { data: bal } = useCredits();

  useEffect(() => {
    if (!open) return;
    fetch("/api/billing/catalog", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const all: TopUpPack[] = d.topupPacks || [];
        setPacks(all);
        const ready = all.filter((p) => p.configured);
        // Smart default — pick the smallest pack that covers the
        // shortfall (if known), else the smallest configured pack.
        const need = context?.shortfall ?? 0;
        const best = need > 0 ? ready.find((p) => p.gc >= need) : null;
        setSelected((best ?? ready[0])?.id ?? null);
      });
  }, [open, context?.shortfall]);

  const recommendedId = useMemo(() => {
    const need = context?.shortfall ?? 0;
    if (!need) return null;
    return packs.find((p) => p.configured && p.gc >= need)?.id ?? null;
  }, [packs, context?.shortfall]);

  async function purchase() {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await fetch("/api/credits/topup-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ packId: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "BILLING_NOT_CONFIGURED") {
          toast({
            title: "Top-ups coming soon",
            description: "Billing isn't fully configured yet — check back shortly.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Couldn't start checkout", description: data.error, variant: "destructive" });
        }
        return;
      }
      window.location.href = data.url;
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="topup-modal"
        className="border-purple-500/20 bg-gradient-to-b from-slate-950 to-purple-950/40"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-200 to-indigo-200">
              Buy generation credits
            </span>
          </DialogTitle>
          <DialogDescription>
            Top-up credits never expire and are spent after your monthly subscription credits.
            {context?.shortfall && context.shortfall > 0 ? (
              <span className="block mt-1.5 text-amber-300">
                You need {context.shortfall} more GC to finish that generation.
              </span>
            ) : null}
            {bal ? (
              <span className="block mt-1 text-muted-foreground">
                Current balance: <span className="font-medium text-foreground">{bal.totalGC} GC</span>
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 py-2">
          {packs.map((pack) => {
            const usd = (pack.priceCents / 100).toFixed(2);
            const perGc = (pack.priceCents / 100 / pack.gc).toFixed(3);
            const isSelected = selected === pack.id;
            const isRecommended = recommendedId === pack.id;
            return (
              <button
                key={pack.id}
                onClick={() => pack.configured && setSelected(pack.id)}
                disabled={!pack.configured}
                data-testid={`topup-pack-${pack.id}`}
                className={`relative text-left p-3 rounded-lg border transition-all ${
                  isSelected
                    ? "border-purple-400 bg-purple-500/15 shadow-[0_0_24px_-8px] shadow-purple-500/40"
                    : "border-white/10 hover:border-purple-500/40"
                } ${!pack.configured ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {isRecommended && (
                  <span className="absolute -top-2 right-3 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                    Recommended
                  </span>
                )}
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-purple-300" />
                      {pack.gc} GC
                    </div>
                    <div className="text-xs text-muted-foreground">${perGc}/GC</div>
                  </div>
                  <div className="font-semibold tabular-nums">${usd}</div>
                </div>
                {!pack.configured && <div className="text-[10px] text-amber-400 mt-1">Coming soon</div>}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="topup-cancel">
            Cancel
          </Button>
          <Button
            onClick={purchase}
            disabled={!selected || loading}
            data-testid="topup-purchase"
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500"
          >
            {loading ? "Opening checkout…" : "Continue to checkout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
