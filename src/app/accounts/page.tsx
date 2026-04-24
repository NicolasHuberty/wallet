import { PageHeader } from "@/components/page-header";
import {
  getPrimaryHousehold,
  getHouseholdMembers,
  getAccounts,
  getSnapshots,
  getDefaultScenario,
  getHoldings,
  getMonthlyCashflow,
  getAccountSnapshots,
} from "@/lib/queries";
import { formatEUR } from "@/lib/format";
import { accountKindLabel, accountKindColor, isLiability, liabilityKinds } from "@/lib/labels";
import { AccountDialog } from "./account-dialog";
import type { AccountKind } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { AccountsInsights } from "./accounts-insights";
import { AccountRow } from "./account-row";
import { toDate } from "@/lib/utils";

export default async function AccountsPage() {
  const h = await getPrimaryHousehold();
  const members = await getHouseholdMembers(h.id);
  const accounts = await getAccounts(h.id);
  const snaps = await getSnapshots(h.id);
  const scenario = await getDefaultScenario(h.id);
  const cashflow = await getMonthlyCashflow(h.id);

  const brokerageKinds: AccountKind[] = ["brokerage", "retirement", "crypto"];
  const holdingsByAccount = new Map<string, Awaited<ReturnType<typeof getHoldings>>>();
  const historyByAccount = new Map<string, { date: string; value: number }[]>();
  for (const a of accounts) {
    if (brokerageKinds.includes(a.kind)) {
      holdingsByAccount.set(a.id, await getHoldings(a.id));
    }
    const snaps = await getAccountSnapshots(a.id);
    historyByAccount.set(
      a.id,
      snaps.map((s) => ({
        date: toDate(s.date).toISOString(),
        value: s.value,
      }))
    );
  }

  const groups = new Map<AccountKind, typeof accounts>();
  for (const a of accounts) {
    const arr = groups.get(a.kind) ?? [];
    arr.push(a);
    groups.set(a.kind, arr);
  }
  const orderedKinds = (Object.keys(accountKindLabel) as AccountKind[]).filter((k) => groups.has(k));
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));

  const baseScenario = scenario
    ? {
        inflationPct: scenario.inflationPct,
        stockReturnPct: scenario.stockReturnPct,
        cashReturnPct: scenario.cashReturnPct,
        propertyAppreciationPct: scenario.propertyAppreciationPct,
        horizonYears: scenario.horizonYears,
      }
    : {
        inflationPct: 2,
        stockReturnPct: 6,
        cashReturnPct: 2,
        propertyAppreciationPct: 2.5,
        horizonYears: 30,
      };

  // Pass all accounts (including liabilities) so the insights chart can show
  // actifs vs passifs vs net.
  const insightAccounts = accounts
    .filter((a) => !a.archivedAt)
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      currentValue: a.currentValue,
      annualYieldPct: a.annualYieldPct,
      monthlyContribution: a.monthlyContribution,
    }));

  const snapshotSeries = snaps.map((s) => ({
    date: toDate(s.date).toISOString(),
    totalAssets: s.totalAssets,
    totalLiabilities: s.totalLiabilities,
    netWorth: s.netWorth,
  }));

  return (
    <>
      <PageHeader
        title="Comptes"
        subtitle={`${accounts.length} compte${accounts.length > 1 ? "s" : ""} · tous actifs et passifs`}
        action={<AccountDialog householdId={h.id} members={members} />}
      />
      <div className="space-y-6 p-4 md:space-y-8 md:p-8">
        {orderedKinds.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground md:p-12">
            Aucun compte. Créez-en un pour démarrer.
          </div>
        )}
        {orderedKinds.map((kind) => {
          const rows = groups.get(kind)!;
          const subtotal = rows.reduce((s, a) => s + a.currentValue, 0);
          return (
            <section key={kind} className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5 md:py-4">
                <div className="flex min-w-0 items-center gap-2 md:gap-3">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: accountKindColor[kind] }}
                  />
                  <h2 className="truncate text-sm font-semibold">{accountKindLabel[kind]}</h2>
                  <Badge variant="secondary" className="ml-1 shrink-0">
                    {rows.length}
                  </Badge>
                </div>
                <div
                  className={`numeric shrink-0 text-sm font-semibold tabular-nums ${liabilityKinds.includes(kind) || subtotal < 0 ? "text-destructive" : ""}`}
                >
                  {formatEUR(subtotal)}
                </div>
              </div>
              <ul className="divide-y divide-border">
                {rows.map((a) => {
                  const holdings = holdingsByAccount.get(a.id) ?? [];
                  const isBrokerage = brokerageKinds.includes(a.kind);
                  const history = historyByAccount.get(a.id) ?? [];
                  return (
                    <AccountRow
                      key={a.id}
                      account={{
                        id: a.id,
                        name: a.name,
                        kind: a.kind,
                        institution: a.institution,
                        currency: a.currency,
                        currentValue: a.currentValue,
                        ownership: a.ownership,
                        ownerMemberId: a.ownerMemberId,
                        sharedSplitPct: a.sharedSplitPct,
                        annualYieldPct: a.annualYieldPct,
                        monthlyContribution: a.monthlyContribution,
                        notes: a.notes,
                      }}
                      history={history}
                      memberById={memberById}
                      inlineHoldings={
                        isBrokerage && holdings.length > 0 ? (
                          <div className="mt-3 rounded-lg border border-border/60 bg-muted/20">
                            {/* Desktop: compact table */}
                            <table className="hidden w-full text-xs md:table">
                              <thead>
                                <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                                  <th className="px-3 py-2 text-left font-medium">Ticker / ISIN</th>
                                  <th className="px-3 py-2 text-left font-medium">Nom</th>
                                  <th className="px-3 py-2 text-right font-medium">Allocation</th>
                                  <th className="px-3 py-2 text-right font-medium">Valeur</th>
                                </tr>
                              </thead>
                              <tbody>
                                {holdings.map((hold) => {
                                  const pct = hold.allocationPct ?? 0;
                                  const v = (a.currentValue * pct) / 100;
                                  return (
                                    <tr
                                      key={hold.id}
                                      className="border-b border-border/40 last:border-none"
                                    >
                                      <td className="px-3 py-2">
                                        <div className="font-mono font-medium">{hold.ticker}</div>
                                        {hold.isin && (
                                          <div className="text-[10px] text-muted-foreground">
                                            {hold.isin}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground">
                                        {hold.name ?? "—"}
                                      </td>
                                      <td className="numeric px-3 py-2 text-right tabular-nums">
                                        {pct.toFixed(1)}%
                                      </td>
                                      <td className="numeric px-3 py-2 text-right font-medium tabular-nums">
                                        {formatEUR(v)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {/* Mobile: stacked cards, one per holding */}
                            <ul className="divide-y divide-border/40 md:hidden">
                              {holdings.map((hold) => {
                                const pct = hold.allocationPct ?? 0;
                                const v = (a.currentValue * pct) / 100;
                                return (
                                  <li
                                    key={hold.id}
                                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate font-mono text-[11px] font-medium">
                                        {hold.ticker}
                                      </div>
                                      {hold.name && (
                                        <div className="truncate text-[10px] text-muted-foreground">
                                          {hold.name}
                                        </div>
                                      )}
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <div className="numeric text-xs font-medium tabular-nums">
                                        {formatEUR(v)}
                                      </div>
                                      <div className="numeric text-[10px] tabular-nums text-muted-foreground">
                                        {pct.toFixed(1)}%
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : null
                      }
                    />
                  );
                })}
              </ul>
            </section>
          );
        })}

        <AccountsInsights
          accounts={insightAccounts}
          snapshots={snapshotSeries}
          baseScenario={baseScenario}
          monthlyCashflow={cashflow.net}
        />
      </div>
    </>
  );
}
