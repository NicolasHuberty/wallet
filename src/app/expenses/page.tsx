import { PageHeader } from "@/components/page-header";
import {
  getPrimaryHousehold,
  getHouseholdMembers,
  getRecurringExpenses,
  getRecurringIncomes,
  getActiveMortgages,
} from "@/lib/queries";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { formatEUR } from "@/lib/format";
import { expenseCategoryLabel, incomeCategoryLabel, resolveCategoryLabel } from "@/lib/labels";
import { ArrowUpRight } from "lucide-react";
import { FlowDialog, EditFlowButton } from "./flow-dialog";
import { Badge } from "@/components/ui/badge";
import { toDate, toDateOrNull } from "@/lib/utils";

export default async function ExpensesPage() {
  const h = await getPrimaryHousehold();
  const members = await getHouseholdMembers(h.id);
  const expenses = await getRecurringExpenses(h.id);
  const incomes = await getRecurringIncomes(h.id);
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));

  const mortgages = await getActiveMortgages(h.id);
  const totalMortgage = mortgages.reduce((s, m) => s + m.mortgage.monthlyPayment, 0);
  const totalManualExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalExpense = totalManualExpense + totalMortgage;
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const net = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;

  const expByCat = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Dépenses & revenus récurrents"
        subtitle="Pas de ligne par transaction. Montants mensuels par catégorie."
      />
      <div className="space-y-6 p-4 md:p-8">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <Kpi label="Revenus mensuels" value={formatEUR(totalIncome)} tone="pos" />
          <Kpi label="Dépenses mensuelles" value={formatEUR(totalExpense)} tone="neg" />
          <Kpi label="Reste à épargner" value={formatEUR(net, { signed: true })} tone={net >= 0 ? "pos" : "neg"} />
          <Kpi label="Taux d'épargne" value={`${savingsRate.toFixed(0)} %`} />
        </section>

        {mortgages.length > 0 && (
          <section className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 md:p-5">
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Landmark className="size-4 shrink-0" /> Remboursements de prêts
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {mortgages.length} prêt{mortgages.length > 1 ? "s" : ""} · {formatEUR(totalMortgage)}/mois
                  <span className="hidden md:inline">
                    {" "}· calculé depuis{" "}
                    <Link href="/real-estate" className="underline underline-offset-2 hover:text-foreground">
                      Immobilier
                    </Link>
                  </span>
                </p>
              </div>
              <Link href="/real-estate" className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
                Gérer →
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {mortgages.map(({ mortgage, account }) => (
                <li
                  key={mortgage.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm md:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{account.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground md:gap-2 md:text-xs">
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        Prêt
                      </Badge>
                      {mortgage.lender && <span className="truncate">{mortgage.lender}</span>}
                      <span className="tabular-nums">
                        Solde {formatEUR(mortgage.remainingBalance, { compact: true })}
                      </span>
                      <span className="tabular-nums">· {mortgage.interestRatePct.toFixed(2)}%</span>
                    </div>
                  </div>
                  <div className="numeric shrink-0 font-medium tabular-nums">
                    {formatEUR(mortgage.monthlyPayment)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
          <section className="rounded-xl border border-border bg-card lg:col-span-3">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 md:p-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold">Dépenses récurrentes manuelles</h2>
                <p className="text-xs text-muted-foreground">
                  {expenses.length} entrée{expenses.length > 1 ? "s" : ""} · {formatEUR(totalManualExpense)}/mois
                  {totalMortgage > 0 && <> · total {formatEUR(totalExpense)}</>}
                </p>
              </div>
              <FlowDialog householdId={h.id} members={members} kind="expense" />
            </div>
            <ul className="divide-y divide-border">
              {expenses.length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  Aucune dépense récurrente. Ajoute-en une pour suivre tes charges fixes.
                </li>
              )}
              {expenses.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors active:bg-muted/40 md:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/expenses/${e.id}`}
                      className="inline-flex max-w-full items-center gap-1 truncate font-medium hover:text-[var(--chart-1)] hover:underline"
                    >
                      <span className="truncate">{e.label}</span>
                      <ArrowUpRight className="size-3 shrink-0 opacity-60" />
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground md:gap-2 md:text-xs">
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {resolveCategoryLabel(e.category, expenseCategoryLabel)}
                      </Badge>
                      <span className="truncate">
                        {e.ownership === "shared"
                          ? "Partagé"
                          : e.ownerMemberId
                            ? memberById[e.ownerMemberId]?.name
                            : "Individuel"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="numeric font-medium tabular-nums">{formatEUR(e.amount)}</div>
                    <EditFlowButton householdId={h.id} members={members} kind="expense" row={{
                      id: e.id, label: e.label, category: e.category, amount: e.amount, ownership: e.ownership,
                      ownerMemberId: e.ownerMemberId, startDate: toDate(e.startDate).toISOString().slice(0, 10),
                      endDate: toDateOrNull(e.endDate)?.toISOString().slice(0, 10) ?? null,
                    }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-card lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 md:p-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold">Revenus récurrents</h2>
                <p className="text-xs text-muted-foreground">
                  {incomes.length} source{incomes.length > 1 ? "s" : ""} · {formatEUR(totalIncome)}/mois
                </p>
              </div>
              <FlowDialog householdId={h.id} members={members} kind="income" />
            </div>
            <ul className="divide-y divide-border">
              {incomes.length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  Aucun revenu enregistré.
                </li>
              )}
              {incomes.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm md:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{i.label}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground md:gap-2 md:text-xs">
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {resolveCategoryLabel(i.category, incomeCategoryLabel)}
                      </Badge>
                      <span className="truncate">
                        {i.ownership === "shared"
                          ? "Partagé"
                          : i.ownerMemberId
                            ? memberById[i.ownerMemberId]?.name
                            : "Individuel"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="numeric font-medium tabular-nums text-[var(--color-success)]">
                      {formatEUR(i.amount)}
                    </div>
                    <EditFlowButton householdId={h.id} members={members} kind="income" row={{
                      id: i.id, label: i.label, category: i.category, amount: i.amount, ownership: i.ownership,
                      ownerMemberId: i.ownerMemberId, startDate: toDate(i.startDate).toISOString().slice(0, 10),
                      endDate: toDateOrNull(i.endDate)?.toISOString().slice(0, 10) ?? null,
                    }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4 md:p-5">
            <h2 className="text-base font-semibold">Répartition des dépenses</h2>
          </div>
          <ul className="divide-y divide-border">
            {Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
              const pct = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
              return (
                <li key={cat} className="px-4 py-3 text-sm md:px-5">
                  {/* Label + amount row */}
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">
                      {resolveCategoryLabel(cat, expenseCategoryLabel)}
                    </span>
                    <div className="flex shrink-0 items-baseline gap-2">
                      <span className="numeric text-sm font-medium tabular-nums">
                        {formatEUR(amount)}
                      </span>
                      <span className="numeric w-10 text-right text-xs tabular-nums text-muted-foreground">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  {/* Progress bar underneath — full width on all breakpoints. */}
                  <div className="mt-2 h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-[var(--chart-1)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const cls = tone === "pos" ? "text-[var(--color-success)]" : tone === "neg" ? "text-destructive" : "";
  return (
    <div className="rounded-xl border border-border bg-card p-3 md:p-5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:text-xs">
        {label}
      </div>
      <div
        className={`numeric mt-1 text-lg font-semibold tabular-nums md:mt-2 md:text-2xl ${cls}`}
      >
        {value}
      </div>
    </div>
  );
}
