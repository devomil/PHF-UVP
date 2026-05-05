// Phase NC-01 — Credit transaction history.

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface Tx {
  id: number;
  type: string;
  gcAmount: number;
  gcBalance: number;
  provider: string | null;
  description: string | null;
  source: string | null;
  createdAt: string;
}

export default function BillingTransactionsPage() {
  const { data, isLoading } = useQuery<Tx[]>({ queryKey: ["/api/credits/transactions?limit=200"] });

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4" data-testid="transactions-page">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Credit transactions</h1>
          <p className="text-sm text-muted-foreground">Every credit movement on your account.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/billing"><Button variant="outline">Back to billing</Button></Link>
          <a href="/api/credits/transactions.csv" download>
            <Button>Export CSV</Button>
          </a>
        </div>
      </header>
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3">When</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Provider</th>
              <th className="text-right p-3">GC</th>
              <th className="text-right p-3">Balance</th>
              <th className="text-left p-3">Source</th>
              <th className="text-left p-3">Description</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No transactions yet.</td></tr>
            )}
            {data?.map((t) => (
              <tr key={t.id} className="border-t border-white/5" data-testid={`tx-${t.id}`}>
                <td className="p-3 text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</td>
                <td className="p-3">{t.type}</td>
                <td className="p-3 text-muted-foreground">{t.provider ?? "—"}</td>
                <td className={`p-3 text-right font-medium ${t.gcAmount < 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {t.gcAmount > 0 ? "+" : ""}{t.gcAmount}
                </td>
                <td className="p-3 text-right">{t.gcBalance}</td>
                <td className="p-3 text-muted-foreground">{t.source ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{t.description ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
