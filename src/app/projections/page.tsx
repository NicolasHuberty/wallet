import { PageHeader } from "@/components/page-header";
import {
  getPrimaryHousehold,
  getAccounts,
  getDefaultScenario,
  getMonthlyCashflow,
  getFutureAmortizationByLoanAccount,
  getRealEstateAppreciationByAccount,
} from "@/lib/queries";
import { ProjectionViewV2 } from "./projection-view-v2";

export default async function ProjectionsPage() {
  const h = await getPrimaryHousehold();
  const accounts = await getAccounts(h.id);
  const scenario = await getDefaultScenario(h.id);
  const cashflow = await getMonthlyCashflow(h.id);
  const amortization = await getFutureAmortizationByLoanAccount(h.id);
  const realEstateAppreciation = await getRealEstateAppreciationByAccount(h.id);

  const today = new Date();
  // Convert raw amortization rows to month indices relative to today.
  const amortizationByAccountId: Record<
    string,
    {
      entries: { monthIdx: number; payment: number; principal: number; interest: number; balance: number }[];
    }
  > = {};
  for (const [accId, rows] of Object.entries(amortization)) {
    const entries = rows.map((r) => {
      const months =
        (r.dueDate.getUTCFullYear() - today.getUTCFullYear()) * 12 +
        (r.dueDate.getUTCMonth() - today.getUTCMonth());
      return {
        monthIdx: Math.max(1, months),
        payment: r.payment,
        principal: r.principal,
        interest: r.interest,
        balance: r.balance,
      };
    });
    amortizationByAccountId[accId] = { entries };
  }

  const defaultScenario = scenario ?? {
    inflationPct: 2,
    stockReturnPct: 6,
    cashReturnPct: 2,
    propertyAppreciationPct: 2.5,
    horizonYears: 30,
  };

  return (
    <>
      <PageHeader
        title="Projections"
        subtitle="Projection mois-par-mois par compte — amortissement réel des prêts, DCA compoundé, plus-value composée."
      />
      <div className="p-4 sm:p-6 md:p-8">
        <ProjectionViewV2
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            kind: a.kind,
            currentValue: a.currentValue,
            annualYieldPct: a.annualYieldPct,
            monthlyContribution: a.monthlyContribution,
            archived: !!a.archivedAt,
          }))}
          amortizationByAccountId={amortizationByAccountId}
          realEstateAppreciationByAccountId={realEstateAppreciation}
          monthlyIncome={cashflow.totalIncome}
          monthlyExpense={cashflow.totalExpense}
          defaultScenario={{
            inflationPct: defaultScenario.inflationPct,
            stockReturnPct: defaultScenario.stockReturnPct,
            cashReturnPct: defaultScenario.cashReturnPct,
            propertyAppreciationPct: defaultScenario.propertyAppreciationPct,
            horizonYears: defaultScenario.horizonYears,
          }}
        />
      </div>
    </>
  );
}
