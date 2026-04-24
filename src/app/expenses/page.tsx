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
      <div className="space-y-6 p-8">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Kpi label="Revenus mensuels" value={formatEUR(totalIncome)} tone="pos" />
          <Kpi label="Dépenses mensuelles" value={formatEUR(totalExpense)} tone="neg" />
          <Kpi label="Reste à épargner" value={formatEUR(net, { signed: true })} tone={net >= 0 ? "pos" : "neg"} />
          <Kpi label="Taux d'épargne" value={`${savingsRate.toFixed(0)} %`} />
        </section>

        {mortgages.length > 0 && (
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Landmark className="size-4" /> Remboursements de prêts (automatique)
                </h2>
                <p className="text-xs text-muted-foreground">
                  {mortgages.length} prêt{mortgages.length > 1 ? "s" : ""} actif{mortgages.length > 1 ? "s" : ""} · {formatEUR(totalMortgage)}/mois · calculé depuis <Link href="/real-estate" className="underline underline-offset-2 hover:text-foreground">Immobilier</Link>
                </p>
              </div>
              <Link href="/real-estate" className="text-xs text-muted-foreground hover:text-foreground">Gérer →</Link>
            </div>
            <ul className="divide-y divide-border">
              {mortgages.map(({ mortgage, account }) => (
                <li key={mortgage.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <div className="font-medium">{account.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">Prêt</Badge>
                      {mortgage.lender && <span>{mortgage.lender}</span>}
                      <span>·</span>
                      <span>Solde {formatEUR(mortgage.remainingBalance)}</span>
                      <span>·</span>
                      <span>Taux {mortgage.interestRatePct.toFixed(2)}%</span>
                    </div>
                  </div>
                  <div className="numeric font-medium">{formatEUR(mortgage.monthlyPayment)}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <section className="rounded-xl border border-border bg-card lg:col-span-3">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-base font-semibold">Dépenses récurrentes manuelles</h2>
                <p className="text-xs text-muted-foreground">
                  {expenses.length} entrée{expenses.length > 1 ? "s" : ""} · {formatEUR(totalManualExpense)}/mois
                  {totalMortgage > 0 && <> · total toutes dépenses {formatEUR(totalExpense)}</>}
                </p>
              </div>
              <FlowDialog householdId={h.id} members={members} kind="expense" />
            </div>
            <ul className="divide-y divide-border">
              {expenses.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Aucune dépense.</li>}
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/expenses/${e.id}`}
                      className="inline-flex items-center gap-1 font-medium hover:text-[var(--chart-1)] hover:underline"
                    >
                      {e.label}
                      <ArrowUpRight className="size-3 opacity-60" />
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">
                        {resolveCategoryLabel(e.category, expenseCategoryLabel)}
                      </Badge>
                      <span>{e.ownership === "shared" ? "Partagé" : (e.ownerMemberId ? memberById[e.ownerMemberId]?.name : "Individuel")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="numeric font-medium">{formatEUR(e.amount)}</div>
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
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-base font-semibold">Revenus récurrents</h2>
                <p className="text-xs text-muted-foreground">{incomes.length} source{incomes.length > 1 ? "s" : ""} · {formatEUR(totalIncome)}/mois</p>
              </div>
              <FlowDialog householdId={h.id} members={members} kind="income" />
            </div>
            <ul className="divide-y divide-border">
              {incomes.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Aucun revenu.</li>}
              {incomes.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <div className="font-medium">{i.label}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{resolveCategoryLabel(i.category, incomeCategoryLabel)}</Badge>
                      <span>{i.ownership === "shared" ? "Partagé" : (i.ownerMemberId ? memberById[i.ownerMemberId]?.name : "Individuel")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="numeric font-medium text-[var(--color-success)]">{formatEUR(i.amount)}</div>
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
          <div className="border-b border-border p-5">
            <h2 className="text-base font-semibold">Répartition des dépenses</h2>
          </div>
          <ul className="divide-y divide-border">
            {Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
              const pct = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
              return (
                <li key={cat} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <div className="w-32">{resolveCategoryLabel(cat, expenseCategoryLabel)}</div>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-[var(--chart-1)]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="numeric w-24 text-right font-medium">{formatEUR(amount)}</div>
                  <div className="numeric w-12 text-right text-muted-foreground">{pct.toFixed(0)}%</div>
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
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`numeric mt-2 text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
