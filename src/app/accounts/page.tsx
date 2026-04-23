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
        date: (s.date as unknown as Date).toISOString(),
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
    date: (s.date as unknown as Date).toISOString(),
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
      <div className="space-y-8 p-8">
        {orderedKinds.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Aucun compte. Créez-en un pour démarrer.
          </div>
        )}
        {orderedKinds.map((kind) => {
          const rows = groups.get(kind)!;
          const subtotal = rows.reduce((s, a) => s + a.currentValue, 0);
          return (
            <section key={kind} className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: accountKindColor[kind] }} />
                  <h2 className="text-sm font-semibold">{accountKindLabel[kind]}</h2>
                  <Badge variant="secondary" className="ml-2">{rows.length}</Badge>
                </div>
                <div className={`numeric text-sm font-semibold ${liabilityKinds.includes(kind) || subtotal < 0 ? "text-destructive" : ""}`}>
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
                            <table className="w-full text-xs">
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
                                      <td className="numeric px-3 py-2 text-right">
                                        {pct.toFixed(1)}%
                                      </td>
                                      <td className="numeric px-3 py-2 text-right font-medium">
                                        {formatEUR(v)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
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
