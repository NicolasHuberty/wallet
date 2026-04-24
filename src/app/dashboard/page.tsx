import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getPrimaryHousehold,
  getNetWorth,
  getMonthlyCashflow,
  getSnapshots,
  getAccounts,
  getSnapshotsForAccounts,
  getCharges,
} from "@/lib/queries";
import { DEMO_MODE } from "@/lib/demo";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { NetWorthChart } from "@/components/net-worth-chart";
import { AllocationDonut } from "@/components/allocation-donut";
import { AccountCard } from "@/components/account-card";
import { accountKindLabel, accountKindColor, isLiability } from "@/lib/labels";
import { formatEUR, formatDateFR } from "@/lib/format";
import type { AccountKind } from "@/db/schema";
import { ArrowUpRight, ClipboardCheck, Receipt, TrendingDown, TrendingUp } from "lucide-react";

export default async function DashboardPage() {
  const h = await getPrimaryHousehold();
  // First-run: no accounts → onboarding (skip in demo mode, demo has data).
  if (!DEMO_MODE) {
    const firstCheck = await getAccounts(h.id);
    if (firstCheck.length === 0) redirect("/onboarding");
  }
  const nw = await getNetWorth(h.id);
  const cashflow = await getMonthlyCashflow(h.id);
  const snapshots = await getSnapshots(h.id);
  const accounts = await getAccounts(h.id);
  const charges = await getCharges(h.id);

  // Per-account history for sparklines — batched in a single query.
  const snapsByAccount = await getSnapshotsForAccounts(accounts.map((a) => a.id));
  const historyByAccount = new Map<string, { date: string; value: number }[]>();
  for (const a of accounts) {
    const snaps = snapsByAccount.get(a.id) ?? [];
    historyByAccount.set(
      a.id,
      snaps.map((s) => ({
        date: (s.date as unknown as Date).toISOString(),
        value: s.value,
      }))
    );
  }

  const activeAccounts = accounts.filter((a) => !a.archivedAt);

  // KPI computations
  const ytdCharges = charges
    .filter((c) => (c.date as unknown as Date).getFullYear() === new Date().getFullYear())
    .reduce((s, c) => s + c.amount, 0);

  const chartData = snapshots.map((s) => ({
    date: (s.date as unknown as Date).toISOString(),
    netWorth: s.netWorth,
    assets: s.totalAssets,
    liabilities: s.totalLiabilities,
  }));

  // Trends
  const last = snapshots[snapshots.length - 1];
  const prevMonth = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
  const mom = last && prevMonth ? last.netWorth - prevMonth.netWorth : 0;
  const momPct = prevMonth && prevMonth.netWorth !== 0 ? (mom / Math.abs(prevMonth.netWorth)) * 100 : 0;

  const yearStart = snapshots.find(
    (s) => (s.date as unknown as Date).getFullYear() === new Date().getFullYear()
  );
  const ytd = last && yearStart ? last.netWorth - yearStart.netWorth : 0;
  const ytdPct = yearStart && yearStart.netWorth !== 0 ? (ytd / Math.abs(yearStart.netWorth)) * 100 : 0;

  const prev12 = snapshots.length >= 13 ? snapshots[snapshots.length - 13] : snapshots[0] ?? null;
  const delta12 = prev12 ? ((nw.netWorth - prev12.netWorth) / (prev12.netWorth || 1)) * 100 : 0;

  // Engagements DCA mensuel
  const dcaTotal = activeAccounts.reduce((s, a) => s + (a.monthlyContribution ?? 0), 0);

  // Allocation donut (positive assets only)
  const allocation = Object.entries(nw.byKind)
    .filter(([k, v]) => !isLiability(k as AccountKind) && v > 0)
    .map(([k, v]) => ({
      name: accountKindLabel[k as AccountKind],
      value: v,
      color: accountKindColor[k as AccountKind],
    }))
    .sort((a, b) => b.value - a.value);

  // Group accounts by asset/liability, then by kind
  const assetKinds: AccountKind[] = ["cash", "savings", "brokerage", "retirement", "crypto", "real_estate", "other_asset"];
  const liabilityKinds: AccountKind[] = ["loan", "credit_card"];

  const groupsAssets = new Map<AccountKind, typeof activeAccounts>();
  const groupsLiab = new Map<AccountKind, typeof activeAccounts>();
  for (const a of activeAccounts) {
    const bucket = isLiability(a.kind) ? groupsLiab : groupsAssets;
    const arr = bucket.get(a.kind) ?? [];
    arr.push(a);
    bucket.set(a.kind, arr);
  }
  const orderedAssetKinds = assetKinds.filter((k) => groupsAssets.has(k));
  const orderedLiabKinds = liabilityKinds.filter((k) => groupsLiab.has(k));

  // Recent charges (last 5)
  const recentCharges = [...charges]
    .sort(
      (a, b) => (b.date as unknown as Date).getTime() - (a.date as unknown as Date).getTime()
    )
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        subtitle={`${h.name} — patrimoine en ${h.baseCurrency} · ${activeAccounts.length} comptes actifs`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/check-in"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <ClipboardCheck className="size-3.5" /> Mise à jour mensuelle
            </Link>
          </div>
        }
      />
      <div className="space-y-8 p-8">
        {/* Top KPI band */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Net worth" value={nw.netWorth} delta={delta12} deltaLabel="12 mois" />
          <KpiCard
            label="Actifs"
            value={nw.assets}
            tone="positive"
            hint={`${activeAccounts.filter((a) => !isLiability(a.kind) && a.currentValue >= 0).length} comptes`}
          />
          <KpiCard
            label="Passifs"
            value={nw.liabilities}
            tone="negative"
            hint={`${activeAccounts.filter((a) => isLiability(a.kind)).length} engagements`}
          />
          <KpiCard
            label="M-1"
            value={mom}
            tone={mom >= 0 ? "positive" : "negative"}
            hint={momPct ? `${momPct >= 0 ? "+" : ""}${momPct.toFixed(1)}% vs mois -1` : "Pas d'historique"}
          />
          <KpiCard
            label="YTD"
            value={ytd}
            tone={ytd >= 0 ? "positive" : "negative"}
            hint={ytdPct ? `${ytdPct >= 0 ? "+" : ""}${ytdPct.toFixed(1)}% YTD` : new Date().getFullYear().toString()}
          />
          <KpiCard
            label="DCA engagé"
            value={dcaTotal}
            hint={`${formatEUR(dcaTotal * 12, { compact: true })} / an`}
          />
        </section>

        {/* Cashflow strip */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStatCard
            label="Revenus récurrents"
            value={formatEUR(cashflow.totalIncome)}
            tone="positive"
          />
          <MiniStatCard
            label="Dépenses récurrentes"
            value={formatEUR(cashflow.totalExpense)}
            tone="negative"
            hint={`dont ${formatEUR(cashflow.totalMortgage, { compact: true })} crédit`}
          />
          <MiniStatCard
            label="Cashflow net"
            value={formatEUR(cashflow.net, { signed: true })}
            tone={cashflow.net >= 0 ? "positive" : "negative"}
          />
          <MiniStatCard
            label="Reste à investir"
            value={formatEUR(cashflow.net - dcaTotal, { signed: true })}
            tone={cashflow.net - dcaTotal >= 0 ? "positive" : "negative"}
            hint="après DCA engagés"
          />
        </section>

        {/* Net worth chart + allocation */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Évolution du patrimoine net</h2>
                <p className="text-xs text-muted-foreground">
                  {snapshots.length} snapshot{snapshots.length > 1 ? "s" : ""} ·{" "}
                  {snapshots.length > 0
                    ? `depuis ${formatDateFR((snapshots[0].date as unknown as Date).toISOString())}`
                    : "aucun historique"}
                </p>
              </div>
              <Link
                href="/snapshots"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Historique complet →
              </Link>
            </div>
            {snapshots.length > 0 ? (
              <NetWorthChart data={chartData} />
            ) : (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                Aucune donnée.
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-base font-semibold">Répartition des actifs</h2>
            {allocation.length > 0 ? (
              <AllocationDonut data={allocation} />
            ) : (
              <p className="text-sm text-muted-foreground">Aucun actif.</p>
            )}
          </div>
        </section>

        {/* Accounts overview — assets */}
        <section className="space-y-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Tous les comptes</h2>
            <Link
              href="/accounts"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Gestion des comptes <ArrowUpRight className="size-3" />
            </Link>
          </div>

          {orderedAssetKinds.map((kind) => {
            const rows = groupsAssets.get(kind)!;
            const subtotal = rows.reduce((s, a) => s + a.currentValue, 0);
            return (
              <div key={kind}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: accountKindColor[kind] }} />
                    <h3 className="text-sm font-semibold">{accountKindLabel[kind]}</h3>
                    <span className="text-[11px] text-muted-foreground">
                      {rows.length} compte{rows.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="numeric text-sm font-semibold tabular-nums">
                    {formatEUR(subtotal)}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {rows.map((a) => (
                    <AccountCard
                      key={a.id}
                      id={a.id}
                      name={a.name}
                      kind={a.kind}
                      institution={a.institution}
                      currentValue={a.currentValue}
                      annualYieldPct={a.annualYieldPct}
                      monthlyContribution={a.monthlyContribution}
                      history={historyByAccount.get(a.id) ?? []}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {orderedLiabKinds.length > 0 && (
            <div className="mt-8 border-t border-dashed border-border pt-6">
              <div className="mb-3 flex items-center gap-2">
                <TrendingDown className="size-3.5 text-destructive" />
                <h3 className="text-sm font-semibold text-destructive">Passifs</h3>
              </div>
              {orderedLiabKinds.map((kind) => {
                const rows = groupsLiab.get(kind)!;
                const subtotal = rows.reduce((s, a) => s + a.currentValue, 0);
                return (
                  <div key={kind} className="mb-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: accountKindColor[kind] }} />
                        <h4 className="text-sm font-semibold">{accountKindLabel[kind]}</h4>
                        <span className="text-[11px] text-muted-foreground">
                          {rows.length} ligne{rows.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="numeric text-sm font-semibold tabular-nums text-destructive">
                        {formatEUR(subtotal)}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {rows.map((a) => (
                        <AccountCard
                          key={a.id}
                          id={a.id}
                          name={a.name}
                          kind={a.kind}
                          institution={a.institution}
                          currentValue={a.currentValue}
                          annualYieldPct={a.annualYieldPct}
                          monthlyContribution={a.monthlyContribution}
                          history={historyByAccount.get(a.id) ?? []}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent charges + YTD summary */}
        {recentCharges.length > 0 && (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card lg:col-span-2">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <Receipt className="size-3.5 text-muted-foreground" />
                  <h2 className="text-base font-semibold">Derniers frais one-shot</h2>
                </div>
                <Link
                  href="/charges"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Voir tout →
                </Link>
              </div>
              <ul className="divide-y divide-border">
                {recentCharges.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatDateFR((c.date as unknown as Date).toISOString())}
                        {c.notes && <span className="ml-2 italic">· {c.notes}</span>}
                      </div>
                    </div>
                    <div className="numeric tabular-nums font-medium text-destructive">
                      -{formatEUR(c.amount)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 text-base font-semibold">Frais one-shot — résumé</h2>
              <div className="space-y-3">
                <SummaryRow label={`${new Date().getFullYear()}`} value={formatEUR(ytdCharges)} />
                <SummaryRow
                  label="Total (toutes années)"
                  value={formatEUR(charges.reduce((s, c) => s + c.amount, 0))}
                  muted
                />
                <SummaryRow label="Nombre d'entrées" value={`${charges.length}`} muted />
              </div>
              <Link
                href="/charges"
                className="mt-5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Gérer les frais <ArrowUpRight className="size-3" />
              </Link>
            </div>
          </section>
        )}

        {/* Empty state if no accounts */}
        {activeAccounts.length === 0 && (
          <section className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Aucun compte. Crée ton premier sur{" "}
            <Link href="/accounts" className="text-foreground underline">
              /accounts
            </Link>
            .
          </section>
        )}
      </div>
    </>
  );
}

function MiniStatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-[var(--color-success)]"
      : tone === "negative"
        ? "text-destructive"
        : "";
  const Icon = tone === "positive" ? TrendingUp : tone === "negative" ? TrendingDown : null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="size-3" />}
        {label}
      </div>
      <div className={`numeric mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={`numeric tabular-nums font-medium ${muted ? "text-muted-foreground" : ""}`}>
        {value}
      </span>
    </div>
  );
}
