import { PageHeader } from "@/components/page-header";
import {
  getPrimaryHousehold,
  getAccounts,
  getSnapshots,
  getMonthlyCashflow,
  getActiveMortgages,
  getRecurringExpenses,
  getRecurringIncomes,
  getCharges,
  getExpenseActualsByHousehold,
  getChargeTemplates,
  getOneOffIncomes,
  getIncomeTemplates,
} from "@/lib/queries";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { CheckInForm } from "./check-in-form";
import { HistorySection } from "./history-section";

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const h = await getPrimaryHousehold();
  const accounts = await getAccounts(h.id);
  const mortgages = await getActiveMortgages(h.id);
  const cashflow = await getMonthlyCashflow(h.id);
  const snapshots = await getSnapshots(h.id);
  const recurringExpenses = await getRecurringExpenses(h.id);
  const recurringIncomes = await getRecurringIncomes(h.id);
  const charges = await getCharges(h.id);
  const expenseActuals = await getExpenseActualsByHousehold(h.id);
  const chargeTemplates = await getChargeTemplates(h.id);
  const oneOffIncomes = await getOneOffIncomes(h.id);
  const incomeTemplates = await getIncomeTemplates(h.id);

  // Selected month from URL, default to current month
  const today = new Date();
  const fallbackMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const selectedMonth =
    sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : fallbackMonth;
  const [selY, selM] = selectedMonth.split("-").map(Number);
  const monthStart = new Date(selY, selM - 1, 1);
  const nextMonthStart = new Date(selY, selM, 1);
  const prevMonthStart = new Date(selY, selM - 2, 1);

  const monthCharges = charges.filter((c) => {
    const d = c.date as unknown as Date;
    return d >= monthStart && d < nextMonthStart;
  });
  const monthChargesTotal = monthCharges.reduce((s, c) => s + c.amount, 0);
  const prevMonthCharges = charges.filter((c) => {
    const d = c.date as unknown as Date;
    return d >= prevMonthStart && d < monthStart;
  });

  // Month key helpers
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthKey = selectedMonth;
  const prevMonthKey = monthKey(prevMonthStart);

  // Per-expense aggregates
  const actualsByExpense = new Map<string, typeof expenseActuals>();
  for (const a of expenseActuals) {
    const arr = actualsByExpense.get(a.expenseId) ?? [];
    arr.push(a);
    actualsByExpense.set(a.expenseId, arr);
  }

  const expenseItems = recurringExpenses
    .slice()
    .map((e) => {
      const actuals = actualsByExpense.get(e.id) ?? [];
      const pastActuals = actuals.filter((a) => a.month !== thisMonthKey);
      const sum = pastActuals.reduce((s, a) => s + a.amount, 0);
      const average = pastActuals.length > 0 ? sum / pastActuals.length : e.amount;
      const prev = actuals.find((a) => a.month === prevMonthKey)?.amount ?? e.amount;
      const current = actuals.find((a) => a.month === thisMonthKey)?.amount ?? prev;
      return {
        id: e.id,
        label: e.label,
        category: e.category,
        baseline: e.amount,
        average,
        previous: prev,
        current,
        notes: e.notes ?? null,
        historyCount: actuals.length,
      };
    })
    .sort((a, b) => b.average - a.average);

  const incomeItems = recurringIncomes
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .map((i) => ({
      id: i.id,
      label: i.label,
      category: i.category,
      amount: i.amount,
      notes: i.notes ?? null,
    }));

  const recentCharges = monthCharges
    .slice()
    .sort((a, b) => (b.date as unknown as Date).getTime() - (a.date as unknown as Date).getTime())
    .map((c) => ({
      id: c.id,
      date: (c.date as unknown as Date).toISOString(),
      label: c.label,
      category: c.category,
      amount: c.amount,
      notes: c.notes ?? null,
    }));

  const previousMonthCharges = prevMonthCharges
    .slice()
    .sort((a, b) => (b.date as unknown as Date).getTime() - (a.date as unknown as Date).getTime())
    .map((c) => ({
      id: c.id,
      date: (c.date as unknown as Date).toISOString(),
      label: c.label,
      category: c.category,
      amount: c.amount,
    }));

  // One-off incomes this month and last month
  const monthIncomes = oneOffIncomes.filter((i) => {
    const d = i.date as unknown as Date;
    return d >= monthStart && d < nextMonthStart;
  });
  const monthIncomesTotal = monthIncomes.reduce((s, i) => s + i.amount, 0);
  const prevMonthIncomes = oneOffIncomes.filter((i) => {
    const d = i.date as unknown as Date;
    return d >= prevMonthStart && d < monthStart;
  });

  const recentIncomes = monthIncomes
    .slice()
    .sort((a, b) => (b.date as unknown as Date).getTime() - (a.date as unknown as Date).getTime())
    .map((i) => ({
      id: i.id,
      date: (i.date as unknown as Date).toISOString(),
      label: i.label,
      category: i.category,
      amount: i.amount,
      notes: i.notes ?? null,
    }));

  const previousMonthIncomes = prevMonthIncomes
    .slice()
    .sort((a, b) => (b.date as unknown as Date).getTime() - (a.date as unknown as Date).getTime())
    .map((i) => ({
      id: i.id,
      date: (i.date as unknown as Date).toISOString(),
      label: i.label,
      category: i.category,
      amount: i.amount,
    }));

  const incomeTemplatesOut = incomeTemplates
    .slice()
    .sort((a, b) => {
      const aT = a.lastUsedAt ? (a.lastUsedAt as unknown as Date).getTime() : 0;
      const bT = b.lastUsedAt ? (b.lastUsedAt as unknown as Date).getTime() : 0;
      return bT - aT;
    })
    .map((t) => ({
      id: t.id,
      label: t.label,
      category: t.category,
      defaultAmount: t.defaultAmount,
      notes: t.notes ?? null,
    }));

  const templates = chargeTemplates
    .slice()
    .sort((a, b) => {
      const aT = a.lastUsedAt ? (a.lastUsedAt as unknown as Date).getTime() : 0;
      const bT = b.lastUsedAt ? (b.lastUsedAt as unknown as Date).getTime() : 0;
      return bT - aT;
    })
    .map((t) => ({
      id: t.id,
      label: t.label,
      category: t.category,
      defaultAmount: t.defaultAmount,
      notes: t.notes ?? null,
    }));

  // Monthly aggregates for the last 12 months
  const monthsBack = 12;
  const chargesByMonth = new Map<string, number>();
  for (const c of charges) {
    const d = c.date as unknown as Date;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    chargesByMonth.set(key, (chargesByMonth.get(key) ?? 0) + c.amount);
  }
  const netByMonth = new Map<string, number>();
  for (const s of snapshots) {
    const d = s.date as unknown as Date;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    netByMonth.set(key, s.netWorth);
  }
  const monthlyHistory: Array<{ month: string; charges: number; netWorth: number | null }> = [];
  const baseDate = new Date();
  baseDate.setDate(1);
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setMonth(baseDate.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyHistory.push({
      month: key,
      charges: chargesByMonth.get(key) ?? 0,
      netWorth: netByMonth.get(key) ?? null,
    });
  }

  const lastSnap = snapshots[snapshots.length - 1];
  const lastCheckInDate = lastSnap
    ? (lastSnap.date as unknown as Date).toISOString()
    : null;

  // Appreciation rate per real-estate account
  const propertyRateByAccount: Record<string, number> = {};
  for (const a of accounts) {
    if (a.kind !== "real_estate" || a.archivedAt) continue;
    const [p] = await db
      .select()
      .from(schema.property)
      .where(eq(schema.property.accountId, a.id));
    if (p) propertyRateByAccount[a.id] = p.annualAppreciationPct;
  }

  // Amortization entries per active mortgage
  const amortByMortgage: Record<
    string,
    { dueDate: string; principal: number; interest: number; balance: number }[]
  > = {};
  for (const m of mortgages) {
    const rows = await db
      .select()
      .from(schema.amortizationEntry)
      .where(eq(schema.amortizationEntry.mortgageId, m.mortgage.id));
    amortByMortgage[m.mortgage.id] = rows
      .map((r) => ({
        dueDate: (r.dueDate as unknown as Date).toISOString(),
        principal: r.principal,
        interest: r.interest,
        balance: r.balance,
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  // Loan accounts linked to an active mortgage are edited through the mortgage row only.
  const mortgageAccountIds = new Set(mortgages.map((m) => m.account.id));

  const activeAccounts = accounts
    .filter((a) => !a.archivedAt)
    .filter((a) => !mortgageAccountIds.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      institution: a.institution,
      currentValue: a.currentValue,
      annualYieldPct: a.annualYieldPct,
      monthlyContribution: a.monthlyContribution,
      annualAppreciationPct: propertyRateByAccount[a.id] ?? null,
    }));

  const mortgageRows = mortgages.map((m) => ({
    mortgageId: m.mortgage.id,
    accountId: m.account.id,
    accountName: m.account.name,
    remainingBalance: m.mortgage.remainingBalance,
    monthlyPayment: m.mortgage.monthlyPayment,
    interestRatePct: m.mortgage.interestRatePct,
  }));

  return (
    <>
      <PageHeader
        title="Mise à jour mensuelle"
        subtitle={`Saisie pour le mois de ${new Date(selY, selM - 1, 1).toLocaleDateString("fr-BE", { month: "long", year: "numeric" })}. Une mise à jour couvre un mois entier — ajuste le mois dans le formulaire si besoin.`}
      />
      <div className="space-y-6 p-8">
        <CheckInForm
          householdId={h.id}
          selectedMonth={selectedMonth}
          accounts={activeAccounts}
          mortgages={mortgageRows}
          amortByMortgage={amortByMortgage}
          cashflow={cashflow}
          lastCheckInDate={lastCheckInDate}
          monthChargesTotal={monthChargesTotal}
          monthIncomesTotal={monthIncomesTotal}
          expenseItems={expenseItems}
          incomeItems={incomeItems}
          recentCharges={recentCharges}
          previousMonthCharges={previousMonthCharges}
          chargeTemplates={templates}
          recentIncomes={recentIncomes}
          previousMonthIncomes={previousMonthIncomes}
          incomeTemplates={incomeTemplatesOut}
        />
        <HistorySection data={monthlyHistory} />
      </div>
    </>
  );
}
