// Phase NC-01 — Top-up purchase modal. Calls the server-side checkout
// endpoint and redirects the browser to the processor's hosted page.

import { useEffect, useState } from "react";
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

interface TopUpPack {
  id: string;
  gc: number;
  priceCents: number;
  configured: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TopUpModal({ open, onOpenChange }: Props) {
  const [packs, setPacks] = useState<TopUpPack[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    fetch("/api/billing/catalog", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setPacks(d.topupPacks || []);
        const firstReady = (d.topupPacks || []).find((p: TopUpPack) => p.configured);
        if (firstReady) setSelected(firstReady.id);
      });
  }, [open]);

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
      <DialogContent data-testid="topup-modal">
        <DialogHeader>
          <DialogTitle>Buy generation credits</DialogTitle>
          <DialogDescription>Top-up credits never expire and are used after your monthly subscription credits.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 py-2">
          {packs.map((pack) => {
            const usd = (pack.priceCents / 100).toFixed(2);
            const perGc = (pack.priceCents / 100 / pack.gc).toFixed(3);
            const isSelected = selected === pack.id;
            return (
              <button
                key={pack.id}
                onClick={() => pack.configured && setSelected(pack.id)}
                disabled={!pack.configured}
                data-testid={`topup-pack-${pack.id}`}
                className={`text-left p-3 rounded-lg border transition-all ${
                  isSelected ? "border-purple-500 bg-purple-500/10" : "border-white/10 hover:border-white/20"
                } ${!pack.configured ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{pack.gc} GC</div>
                    <div className="text-xs text-muted-foreground">${perGc}/GC</div>
                  </div>
                  <div className="font-semibold">${usd}</div>
                </div>
                {!pack.configured && <div className="text-[10px] text-amber-400 mt-1">Coming soon</div>}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="topup-cancel">Cancel</Button>
          <Button onClick={purchase} disabled={!selected || loading} data-testid="topup-purchase">
            {loading ? "Opening checkout…" : "Continue to checkout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
