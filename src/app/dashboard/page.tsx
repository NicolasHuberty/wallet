import { getPrimaryHousehold, getNetWorth, getMonthlyCashflow, getSnapshots, getAccounts, getCharges } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { NetWorthChart } from "@/components/net-worth-chart";
import { AllocationDonut } from "@/components/allocation-donut";
import { accountKindLabel, accountKindColor, isLiability } from "@/lib/labels";
import { formatEUR } from "@/lib/format";
import type { AccountKind } from "@/db/schema";

export default async function DashboardPage() {
  const h = await getPrimaryHousehold();
  const nw = await getNetWorth(h.id);
  const cashflow = await getMonthlyCashflow(h.id);
  const snapshots = await getSnapshots(h.id);
  const accounts = await getAccounts(h.id);
  const charges = await getCharges(h.id);
  const ytdCharges = charges.filter((c) => (c.date as unknown as Date).getFullYear() === new Date().getFullYear()).reduce((s, c) => s + c.amount, 0);
  const totalCharges = charges.reduce((s, c) => s + c.amount, 0);

  const chartData = snapshots.map((s) => ({
    date: (s.date as unknown as Date).toISOString(),
    netWorth: s.netWorth,
    assets: s.totalAssets,
    liabilities: s.totalLiabilities,
  }));

  const prev = snapshots.length >= 2 ? snapshots[Math.max(0, snapshots.length - 13)] : null;
  const delta = prev && prev.netWorth !== 0 ? ((nw.netWorth - prev.netWorth) / prev.netWorth) * 100 : 0;

  const allocation = Object.entries(nw.byKind)
    .filter(([k, v]) => !isLiability(k as AccountKind) && v > 0)
    .map(([k, v]) => ({
      name: accountKindLabel[k as AccountKind],
      value: v,
      color: accountKindColor[k as AccountKind],
    }))
    .sort((a, b) => b.value - a.value);

  const topAccounts = [...accounts]
    .sort((a, b) => Math.abs(b.currentValue) - Math.abs(a.currentValue))
    .slice(0, 6);

  return (
    <>
      <PageHeader title="Vue d'ensemble" subtitle={`${h.name} — patrimoine en ${h.baseCurrency}`} />
      <div className="space-y-6 p-8">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Net worth" value={nw.netWorth} delta={delta} deltaLabel="vs 12 mois" />
          <KpiCard label="Actifs" value={nw.assets} tone="positive" hint={`${accounts.filter((a) => !isLiability(a.kind) && a.currentValue >= 0).length} comptes`} />
          <KpiCard label="Passifs" value={nw.liabilities} tone="negative" hint={`${accounts.filter((a) => isLiability(a.kind)).length} crédits`} />
          <KpiCard
            label="Cashflow mensuel"
            value={cashflow.net}
            tone={cashflow.net >= 0 ? "positive" : "negative"}
            hint={`Revenus ${formatEUR(cashflow.totalIncome, { compact: true })} − Dépenses ${formatEUR(cashflow.totalExpense, { compact: true })}`}
          />
        </section>

        {totalCharges > 0 && (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <KpiCard label="Frais one-shot (total)" value={totalCharges} hint={`${charges.length} entrée${charges.length > 1 ? "s" : ""} depuis le début`} />
            <KpiCard label="Frais one-shot (cette année)" value={ytdCharges} hint={new Date().getFullYear().toString()} />
          </section>
        )}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Évolution du net worth</h2>
                <p className="text-xs text-muted-foreground">Snapshots mensuels sur {snapshots.length} mois</p>
              </div>
            </div>
            {snapshots.length > 0 ? (
              <NetWorthChart data={chartData} />
            ) : (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">Aucune donnée.</div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-base font-semibold">Répartition des actifs</h2>
            {allocation.length > 0 ? <AllocationDonut data={allocation} /> : <p className="text-sm text-muted-foreground">Aucun actif.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="text-base font-semibold">Principaux comptes</h2>
            <a href="/accounts" className="text-xs text-muted-foreground hover:text-foreground">Tout voir →</a>
          </div>
          <ul className="divide-y divide-border">
            {topAccounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="size-2 rounded-full" style={{ backgroundColor: accountKindColor[a.kind] }} />
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {accountKindLabel[a.kind]}
                      {a.institution ? ` · ${a.institution}` : ""}
                    </div>
                  </div>
                </div>
                <div className={`numeric font-medium ${isLiability(a.kind) || a.currentValue < 0 ? "text-destructive" : ""}`}>
                  {formatEUR(a.currentValue)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
