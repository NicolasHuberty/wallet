import { PageHeader } from "@/components/page-header";
import {
  getPrimaryHousehold,
  getAccounts,
  getDefaultScenario,
  getMonthlyCashflow,
} from "@/lib/queries";
import { ProjectionView } from "./projection-view";

export default async function ProjectionsPage() {
  const h = await getPrimaryHousehold();
  const accounts = await getAccounts(h.id);
  const scenario = await getDefaultScenario(h.id);
  const cashflow = await getMonthlyCashflow(h.id);

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
        subtitle="Simule l'évolution de ton patrimoine sur plusieurs décennies"
      />
      <div className="p-4 sm:p-6 md:p-8">
        <ProjectionView
          accounts={accounts.map((a) => ({ kind: a.kind, currentValue: a.currentValue }))}
          defaultScenario={{
            inflationPct: defaultScenario.inflationPct,
            stockReturnPct: defaultScenario.stockReturnPct,
            cashReturnPct: defaultScenario.cashReturnPct,
            propertyAppreciationPct: defaultScenario.propertyAppreciationPct,
            horizonYears: defaultScenario.horizonYears,
          }}
          monthlyNetSavings={Math.max(0, cashflow.net)}
        />
      </div>
    </>
  );
}
