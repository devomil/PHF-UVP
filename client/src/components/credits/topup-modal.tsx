// Phase NC-01 + NC-02 — Top-up purchase modal.
//
// - Two-column responsive grid for the pack list.
// - Config-driven POPULAR / BEST VALUE badges (smallest pack covering
//   shortfall = POPULAR; lowest $/GC = BEST VALUE).
// - "What can I make?" calculator pulls real GC rates from
//   /api/credits/cost so the estimates line up with what generation
//   actually charges.
// - Footer link routes to the upgrade flow for users who'd be better
//   served by a plan upgrade than repeated top-ups.

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
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/use-credits";
import { Coins, Sparkles, Image as ImageIcon, Video as VideoIcon } from "lucide-react";

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

// Reference cost lookups — fetched once per modal open from the
// canonical /api/credits/cost endpoint so the calculator uses real
// pricing rather than hard-coded estimates.
const CALC_LINES: Array<{ key: string; label: string; provider: string; quality?: string; durationS?: number; icon: typeof ImageIcon }> = [
  { key: "image", label: "Recraft images", provider: "recraft", icon: ImageIcon },
  { key: "video5", label: "Kling 2.6 5s clips", provider: "kling-2.6", durationS: 5, icon: VideoIcon },
  { key: "video10", label: "Seedance 10s clips", provider: "seedance-2.0", durationS: 10, icon: VideoIcon },
];

export function TopUpModal({ open, onOpenChange, context }: Props) {
  const [packs, setPacks] = useState<TopUpPack[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [costs, setCosts] = useState<Record<string, number>>({});
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
        const need = context?.shortfall ?? 0;
        const best = need > 0 ? ready.find((p) => p.gc >= need) : null;
        setSelected((best ?? ready[0])?.id ?? null);
      });
    // Fetch real per-action costs so the calculator stays honest.
    Promise.all(
      CALC_LINES.map(async (line) => {
        const params = new URLSearchParams({ provider: line.provider });
        if (line.quality) params.set("quality", line.quality);
        if (line.durationS) params.set("durationS", String(line.durationS));
        try {
          const res = await fetch(`/api/credits/cost?${params}`, { credentials: "include" });
          if (!res.ok) return [line.key, 0] as const;
          const data = await res.json();
          return [line.key, Number(data.gcCost) || 0] as const;
        } catch {
          return [line.key, 0] as const;
        }
      }),
    ).then((entries) => setCosts(Object.fromEntries(entries)));
  }, [open, context?.shortfall]);

  const popularId = useMemo(() => {
    const need = context?.shortfall ?? 0;
    if (!need) return null;
    return packs.find((p) => p.configured && p.gc >= need)?.id ?? null;
  }, [packs, context?.shortfall]);

  const bestValueId = useMemo(() => {
    const ready = packs.filter((p) => p.configured && p.gc > 0);
    if (ready.length === 0) return null;
    return ready.reduce((best, p) =>
      p.priceCents / p.gc < best.priceCents / best.gc ? p : best,
    ready[0]).id;
  }, [packs]);

  const selectedPack = packs.find((p) => p.id === selected) ?? null;

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
        className="max-w-2xl border-purple-500/20 bg-gradient-to-b from-slate-950 to-purple-950/40"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-2" data-testid="topup-pack-grid">
          {packs.map((pack) => {
            const usd = (pack.priceCents / 100).toFixed(2);
            const perGc = (pack.priceCents / 100 / pack.gc).toFixed(3);
            const isSelected = selected === pack.id;
            const isPopular = popularId === pack.id;
            const isBestValue = bestValueId === pack.id;
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
                {(isPopular || isBestValue) && (
                  <span
                    className={`absolute -top-2 right-3 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                      isPopular
                        ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
                        : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
                    }`}
                    data-testid={isPopular ? `topup-pack-${pack.id}-popular` : `topup-pack-${pack.id}-best-value`}
                  >
                    {isPopular ? "Popular" : "Best value"}
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

        {/* What can I make? — driven by real per-action GC rates. */}
        {selectedPack && (
          <section
            className="mt-1 p-3 rounded-lg border border-purple-500/15 bg-purple-950/20"
            data-testid="topup-calculator"
          >
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              What you can make with {selectedPack.gc} GC
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              {CALC_LINES.map((line) => {
                const cost = costs[line.key];
                const Icon = line.icon;
                if (!cost || cost <= 0) {
                  return (
                    <li
                      key={line.key}
                      className="flex items-center gap-1.5 text-muted-foreground"
                      data-testid={`topup-calculator-${line.key}`}
                    >
                      <Icon className="w-3 h-3" />— {line.label}
                    </li>
                  );
                }
                const count = Math.floor(selectedPack.gc / cost);
                return (
                  <li
                    key={line.key}
                    className="flex items-center gap-1.5"
                    data-testid={`topup-calculator-${line.key}`}
                  >
                    <Icon className="w-3 h-3 text-purple-300" />
                    <span className="tabular-nums font-semibold">{count}×</span>
                    <span className="text-muted-foreground">{line.label}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between items-stretch sm:items-center">
          <Link
            href="/billing#plans"
            onClick={() => onOpenChange(false)}
            className="text-xs text-purple-300 hover:text-purple-200 underline-offset-2 hover:underline"
            data-testid="topup-upgrade-link"
          >
            Frequent top-ups? Compare plans →
          </Link>
          <div className="flex gap-2">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
