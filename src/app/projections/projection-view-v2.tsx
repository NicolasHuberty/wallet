"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Sliders,
  ChevronDown,
  Home,
  TrendingUp,
  Coins,
  PiggyBank,
  Landmark,
  Sparkles,
} from "lucide-react";
import { formatEUR } from "@/lib/format";
import { projectV2, type V2Inputs } from "@/lib/projection-v2";
import { accountKindColor, accountKindLabel } from "@/lib/labels";
import type { AccountKind } from "@/db/schema";
import { cn } from "@/lib/utils";

type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  currentValue: number;
  annualYieldPct: number | null;
  monthlyContribution: number | null;
  archived: boolean;
};

type Props = {
  accounts: Account[];
  amortizationByAccountId: Record<
    string,
    { entries: { monthIdx: number; payment: number; principal: number; interest: number; balance: number }[] }
  >;
  realEstateAppreciationByAccountId: Record<string, number>;
  monthlyIncome: number;
  monthlyExpense: number;
  defaultScenario: {
    inflationPct: number;
    stockReturnPct: number;
    cashReturnPct: number;
    propertyAppreciationPct: number;
    horizonYears: number;
  };
};

const KIND_ICON: Partial<Record<AccountKind, React.ComponentType<{ className?: string }>>> = {
  brokerage: TrendingUp,
  retirement: TrendingUp,
  crypto: TrendingUp,
  cash: Coins,
  savings: PiggyBank,
  real_estate: Home,
  loan: Landmark,
};

export function ProjectionViewV2(props: Props) {
  const {
    accounts,
    amortizationByAccountId,
    realEstateAppreciationByAccountId,
    monthlyIncome,
    monthlyExpense,
    defaultScenario,
  } = props;

  const [scenario, setScenario] = useState(defaultScenario);
  const [dcaMultiplier, setDcaMultiplier] = useState(100); // % of declared DCA
  const [expenseGrowth, setExpenseGrowth] = useState(scenario.inflationPct);
  const [incomeGrowth, setIncomeGrowth] = useState(0);
  const [swr, setSwr] = useState(4);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showReal, setShowReal] = useState(false);

  const liveAccounts = useMemo(
    () =>
      accounts
        .filter((a) => !a.archived)
        .map((a) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          currentValue: a.currentValue,
          annualYieldPct: a.annualYieldPct,
          monthlyContribution:
            a.monthlyContribution != null
              ? (a.monthlyContribution * dcaMultiplier) / 100
              : null,
        })),
    [accounts, dcaMultiplier],
  );

  const baseInputs = useMemo<V2Inputs>(
    () => ({
      accounts: liveAccounts,
      amortizationByAccountId,
      realEstateAppreciationByAccountId,
      monthlyIncome,
      monthlyExpense,
      scenario: {
        ...scenario,
        safeWithdrawalPct: swr,
        expenseGrowthPct: expenseGrowth,
        incomeGrowthPct: incomeGrowth,
      },
    }),
    [
      liveAccounts,
      amortizationByAccountId,
      realEstateAppreciationByAccountId,
      monthlyIncome,
      monthlyExpense,
      scenario,
      swr,
      expenseGrowth,
      incomeGrowth,
    ],
  );

  const result = useMemo(() => projectV2(baseInputs), [baseInputs]);

  // Three preset scenarios computed from the same accounts but with shifted yields
  const pessimistic = useMemo(
    () =>
      projectV2({
        ...baseInputs,
        scenario: {
          ...baseInputs.scenario,
          stockReturnPct: scenario.stockReturnPct - 3,
          propertyAppreciationPct: Math.max(0, scenario.propertyAppreciationPct - 1.5),
          cashReturnPct: Math.max(0, scenario.cashReturnPct - 1),
        },
      }),
    [baseInputs, scenario],
  );
  const optimistic = useMemo(
    () =>
      projectV2({
        ...baseInputs,
        scenario: {
          ...baseInputs.scenario,
          stockReturnPct: scenario.stockReturnPct + 3,
          propertyAppreciationPct: scenario.propertyAppreciationPct + 1.5,
          cashReturnPct: scenario.cashReturnPct + 1,
        },
      }),
    [baseInputs, scenario],
  );

  // Build hero stacked area dataset: one row per year, columns = each account
  const heroData = useMemo(() => {
    return result.yearly.map((y, idx) => {
      const row: Record<string, number | string> = {
        year: y.year,
        date: y.date,
        total: showReal ? y.real : y.total,
      };
      for (const acc of result.perAccount) {
        const v = acc.series[idx]?.value ?? 0;
        row[acc.id] = showReal ? v / Math.pow(1 + scenario.inflationPct / 100, y.year) : v;
      }
      return row;
    });
  }, [result, showReal, scenario.inflationPct]);

  // Cashflow chart
  const cashflowData = useMemo(
    () =>
      result.yearly.map((y) => ({
        year: y.year,
        income: y.monthlyIncome * 12,
        expense: y.monthlyExpense * 12,
        savings: (y.monthlyIncome - y.monthlyExpense) * 12,
        passive: y.monthlyPassiveIncome * 12,
      })),
    [result],
  );

  const finalKpi = result.kpis;

  // Color / icon per account kind for the stacked area
  const investmentLikeKinds: AccountKind[] = [
    "brokerage",
    "retirement",
    "crypto",
    "savings",
    "cash",
  ];
  const ordering = (k: AccountKind) =>
    k === "real_estate"
      ? 0
      : k === "loan"
        ? 4
        : investmentLikeKinds.includes(k)
          ? 1
          : 2;
  const stackOrder = [...result.perAccount].sort(
    (a, b) => ordering(a.kind) - ordering(b.kind),
  );

  const horizonYears = scenario.horizonYears;
  const milestoneXBank: number[] = [];
  if (result.milestones.mortgageEndYear != null)
    milestoneXBank.push(result.milestones.mortgageEndYear);
  if (result.milestones.fireYear != null)
    milestoneXBank.push(result.milestones.fireYear);

  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-4">
      {/* Aside — sliders */}
      <aside className="lg:col-span-1">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Sliders className="size-4" /> Hypothèses
          </span>
          <ChevronDown
            className={cn("size-4 transition-transform", panelOpen && "rotate-180")}
          />
        </button>
        {panelOpen && (
          <div className="mt-2 rounded-xl border border-border bg-card p-4 lg:hidden">
            <AssumptionsPanel
              scenario={scenario}
              setScenario={setScenario}
              dcaMultiplier={dcaMultiplier}
              setDcaMultiplier={setDcaMultiplier}
              expenseGrowth={expenseGrowth}
              setExpenseGrowth={setExpenseGrowth}
              incomeGrowth={incomeGrowth}
              setIncomeGrowth={setIncomeGrowth}
              swr={swr}
              setSwr={setSwr}
              showReal={showReal}
              setShowReal={setShowReal}
            />
          </div>
        )}
        <div className="hidden rounded-xl border border-border bg-card p-5 lg:block">
          <div>
            <h3 className="text-base font-semibold">Hypothèses</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Tout est live. Les graphes s&apos;actualisent.
            </p>
          </div>
          <div className="mt-5">
            <AssumptionsPanel
              scenario={scenario}
              setScenario={setScenario}
              dcaMultiplier={dcaMultiplier}
              setDcaMultiplier={setDcaMultiplier}
              expenseGrowth={expenseGrowth}
              setExpenseGrowth={setExpenseGrowth}
              incomeGrowth={incomeGrowth}
              setIncomeGrowth={setIncomeGrowth}
              swr={swr}
              setSwr={setSwr}
              showReal={showReal}
              setShowReal={setShowReal}
            />
          </div>
        </div>
      </aside>

      <div className="space-y-4 lg:col-span-3">
        {/* KPIs */}
        <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
          <Kpi
            label={`Patrimoine +${horizonYears}a`}
            value={formatEUR(finalKpi.netWorthAtHorizon, { compact: false })}
            hint={`vs ${formatEUR(finalKpi.initialNetWorth)} aujourd'hui`}
            tone={
              finalKpi.netWorthAtHorizon > finalKpi.initialNetWorth ? "positive" : undefined
            }
          />
          <Kpi
            label="Réel (inflation-ajusté)"
            value={formatEUR(finalKpi.realNetWorthAtHorizon, { compact: false })}
            hint={`pouvoir d'achat dans ${horizonYears} ans`}
          />
          <Kpi
            label="Prêt fini"
            value={
              result.milestones.mortgageEndYear != null
                ? `${result.milestones.mortgageEndYear.toFixed(1)} ans`
                : "—"
            }
            hint={result.milestones.mortgageEndDate ?? "pas de prêt actif"}
            tone={result.milestones.mortgageEndYear != null ? "positive" : undefined}
          />
          <Kpi
            label="Indépendance"
            value={
              result.milestones.fireYear != null
                ? `${result.milestones.fireYear.toFixed(1)} ans`
                : "—"
            }
            hint={
              result.milestones.fireYear != null
                ? `passif ≥ dépenses (SWR ${swr}%)`
                : "non atteint sur l'horizon"
            }
            tone={result.milestones.fireYear != null ? "positive" : undefined}
          />
        </section>

        {/* Three-scenario cards */}
        <section className="grid gap-3 md:grid-cols-3">
          <ScenarioCard
            label="Pessimiste"
            sub={`actions ${(scenario.stockReturnPct - 3).toFixed(1)}% · immo ${Math.max(0, scenario.propertyAppreciationPct - 1.5).toFixed(1)}%`}
            value={pessimistic.kpis.netWorthAtHorizon}
            base={result.kpis.netWorthAtHorizon}
            tone="negative"
          />
          <ScenarioCard
            label="Médian (actuel)"
            sub={`actions ${scenario.stockReturnPct.toFixed(1)}% · immo ${scenario.propertyAppreciationPct.toFixed(1)}%`}
            value={result.kpis.netWorthAtHorizon}
            base={result.kpis.netWorthAtHorizon}
            tone="neutral"
            highlighted
          />
          <ScenarioCard
            label="Optimiste"
            sub={`actions ${(scenario.stockReturnPct + 3).toFixed(1)}% · immo ${(scenario.propertyAppreciationPct + 1.5).toFixed(1)}%`}
            value={optimistic.kpis.netWorthAtHorizon}
            base={result.kpis.netWorthAtHorizon}
            tone="positive"
          />
        </section>

        <Tabs defaultValue="overview" className="space-y-4">
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="overview">Vue par compte</TabsTrigger>
              <TabsTrigger value="cashflow">Cashflow</TabsTrigger>
              <TabsTrigger value="breakdown">Détail comptes</TabsTrigger>
              <TabsTrigger value="growth">Décomposition</TabsTrigger>
            </TabsList>
          </div>

          {/* Vue par compte — stacked area */}
          <TabsContent value="overview" className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold sm:text-base">
                  Patrimoine net par compte sur {horizonYears} ans
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Chaque couleur = un compte. Les passifs (prêts) sont soustraits.{" "}
                  {showReal ? "Vue inflation-ajustée." : "Vue nominale (€ d'aujourd'hui)."}
                </p>
              </div>
            </div>
            <div className="h-72 sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={heroData}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  stackOffset="sign"
                >
                  <defs>
                    {stackOrder.map((acc, i) => (
                      <linearGradient
                        key={acc.id}
                        id={`grad-${acc.id}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={accountKindColor[acc.kind]}
                          stopOpacity={0.55 - i * 0.02}
                        />
                        <stop
                          offset="100%"
                          stopColor={accountKindColor[acc.kind]}
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="year"
                    tickFormatter={(v) => `+${v}a`}
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                  />
                  <YAxis
                    tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    width={56}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                      fontSize: 11,
                      padding: "6px 8px",
                    }}
                    labelFormatter={(y) => `+${y} an${Number(y) > 1 ? "s" : ""}`}
                    formatter={(v, name) => {
                      const acc = result.perAccount.find((a) => a.id === name);
                      return [formatEUR(Number(v)), acc?.name ?? String(name)];
                    }}
                  />
                  {result.milestones.mortgageEndYear != null && (
                    <ReferenceLine
                      x={result.milestones.mortgageEndYear}
                      stroke="var(--chart-3)"
                      strokeDasharray="4 4"
                      label={{
                        value: "Prêt fini",
                        position: "top",
                        fill: "var(--chart-3)",
                        fontSize: 10,
                      }}
                    />
                  )}
                  {result.milestones.fireYear != null && (
                    <ReferenceLine
                      x={result.milestones.fireYear}
                      stroke="var(--color-success)"
                      strokeDasharray="4 4"
                      label={{
                        value: "FIRE",
                        position: "top",
                        fill: "var(--color-success)",
                        fontSize: 10,
                      }}
                    />
                  )}
                  {stackOrder.map((acc) => (
                    <Area
                      key={acc.id}
                      type="monotone"
                      dataKey={acc.id}
                      stackId="1"
                      stroke={accountKindColor[acc.kind]}
                      strokeWidth={1}
                      fill={`url(#grad-${acc.id})`}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <ul className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-3 md:grid-cols-4">
              {stackOrder.map((acc) => {
                const Icon = KIND_ICON[acc.kind];
                return (
                  <li key={acc.id} className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: accountKindColor[acc.kind] }}
                    />
                    {Icon && <Icon className="size-3 text-muted-foreground" />}
                    <span className="truncate">{acc.name}</span>
                  </li>
                );
              })}
            </ul>
          </TabsContent>

          {/* Cashflow */}
          <TabsContent value="cashflow" className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold sm:text-base">
                Revenus / dépenses / revenu passif
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Croissance des dépenses = {expenseGrowth}%/an. Croissance des revenus ={" "}
                {incomeGrowth}%/an. Revenu passif = patrimoine × {swr}%/an.
              </p>
            </div>
            <div className="h-72 sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={cashflowData}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="year"
                    tickFormatter={(v) => `+${v}a`}
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                  />
                  <YAxis
                    tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    width={56}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    labelFormatter={(y) => `+${y}a`}
                    formatter={(v, name) => [formatEUR(Number(v)), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="income"
                    stroke="var(--color-success)"
                    strokeWidth={2}
                    dot={false}
                    name="Revenus / an"
                  />
                  <Line
                    type="monotone"
                    dataKey="expense"
                    stroke="var(--destructive)"
                    strokeWidth={2}
                    dot={false}
                    name="Dépenses / an"
                  />
                  <Line
                    type="monotone"
                    dataKey="passive"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    name={`Revenu passif (${swr}%)`}
                  />
                  {result.milestones.fireYear != null && (
                    <ReferenceLine
                      x={result.milestones.fireYear}
                      stroke="var(--color-success)"
                      strokeDasharray="3 3"
                      label={{
                        value: "FIRE",
                        position: "top",
                        fill: "var(--color-success)",
                        fontSize: 10,
                      }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Stat label="Revenus cumulés" value={formatEUR(finalKpi.totalIncome)} />
              <Stat label="Dépenses cumulées" value={formatEUR(finalKpi.totalExpenses)} />
              <Stat label="Épargne cumulée" value={formatEUR(finalKpi.totalSaved)} positive />
              <Stat label="Intérêts du prêt" value={formatEUR(finalKpi.totalInterestPaid)} negative />
            </div>
          </TabsContent>

          {/* Détail par compte */}
          <TabsContent value="breakdown" className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold sm:text-base">
                Détail par compte sur {horizonYears} ans
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Valeur projetée à l&apos;horizon, croissance %, et part de la croissance totale.
              </p>
            </div>
            <table className="hidden w-full text-xs md:table">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 text-left font-medium">Compte</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-right font-medium">Aujourd&apos;hui</th>
                  <th className="px-3 py-2 text-right font-medium">Dans {horizonYears} ans</th>
                  <th className="px-3 py-2 text-right font-medium">Δ</th>
                  <th className="px-5 py-2 text-right font-medium">Croissance</th>
                </tr>
              </thead>
              <tbody>
                {result.perAccount.map((acc) => {
                  const initial = acc.series[0].value;
                  const final = acc.series[acc.series.length - 1].value;
                  const delta = final - initial;
                  const pct = initial !== 0 ? (delta / Math.abs(initial)) * 100 : null;
                  return (
                    <tr key={acc.id} className="border-b border-border/60 last:border-none">
                      <td className="px-5 py-2 font-medium">{acc.name}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span
                            className="size-2 rounded-full"
                            style={{ background: accountKindColor[acc.kind] }}
                          />
                          {accountKindLabel[acc.kind]}
                        </span>
                      </td>
                      <td className="numeric px-3 py-2 text-right tabular-nums">
                        {formatEUR(initial)}
                      </td>
                      <td className="numeric px-3 py-2 text-right font-semibold tabular-nums">
                        {formatEUR(final)}
                      </td>
                      <td
                        className={cn(
                          "numeric px-3 py-2 text-right tabular-nums",
                          delta > 0
                            ? "text-[var(--color-success)]"
                            : delta < 0
                              ? "text-destructive"
                              : "text-muted-foreground",
                        )}
                      >
                        {formatEUR(delta, { signed: true })}
                      </td>
                      <td className="numeric px-5 py-2 text-right tabular-nums">
                        {pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)} %` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Mobile stacked list */}
            <ul className="divide-y divide-border md:hidden">
              {result.perAccount.map((acc) => {
                const initial = acc.series[0].value;
                const final = acc.series[acc.series.length - 1].value;
                const delta = final - initial;
                return (
                  <li key={acc.id} className="grid gap-1 p-4 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{acc.name}</span>
                      <span
                        className={cn(
                          "numeric tabular-nums",
                          delta > 0
                            ? "text-[var(--color-success)]"
                            : delta < 0
                              ? "text-destructive"
                              : "",
                        )}
                      >
                        {formatEUR(delta, { signed: true })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {formatEUR(initial)} → <span className="font-medium text-foreground">{formatEUR(final)}</span>
                      </span>
                      <span>{accountKindLabel[acc.kind]}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </TabsContent>

          {/* Décomposition de la croissance */}
          <TabsContent value="growth" className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold sm:text-base">
              <Sparkles className="size-4 text-[var(--chart-1)]" />
              D&apos;où vient ta croissance ?
            </h3>
            <p className="mb-4 text-[11px] text-muted-foreground">
              Décomposition du gain entre tes apports cumulés (DCA) et le rendement composé du
              marché. Hypothèse : prêt remboursé en suivant le tableau d&apos;amortissement.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Stat label="Patrimoine initial" value={formatEUR(finalKpi.initialNetWorth)} />
              <Stat
                label={`Patrimoine final (+${horizonYears}a)`}
                value={formatEUR(finalKpi.netWorthAtHorizon)}
                positive
              />
              <Stat
                label="Apports cumulés (DCA)"
                value={formatEUR(finalKpi.growthFromDca)}
                hint="ce que tu vas injecter"
              />
              <Stat
                label="Rendement marché"
                value={formatEUR(finalKpi.growthFromMarket, { signed: true })}
                hint="composition + appréciation"
                positive={finalKpi.growthFromMarket > 0}
                negative={finalKpi.growthFromMarket < 0}
              />
            </div>
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
              <p className="leading-relaxed">
                <strong className="text-foreground">Lecture :</strong> sur {horizonYears} ans tu vas
                ajouter <strong className="text-foreground">{formatEUR(finalKpi.growthFromDca)}</strong> via
                tes apports mensuels (DCA). Le marché et l&apos;appréciation immobilière vont y
                ajouter <strong className="text-foreground">{formatEUR(finalKpi.growthFromMarket, { signed: true })}</strong>{" "}
                de plus. En parallèle, tu rembourseras{" "}
                <strong className="text-foreground">{formatEUR(finalKpi.totalInterestPaid)}</strong> d&apos;intérêts
                à la banque sur le(s) prêt(s).
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function AssumptionsPanel({
  scenario,
  setScenario,
  dcaMultiplier,
  setDcaMultiplier,
  expenseGrowth,
  setExpenseGrowth,
  incomeGrowth,
  setIncomeGrowth,
  swr,
  setSwr,
  showReal,
  setShowReal,
}: {
  scenario: Props["defaultScenario"];
  setScenario: (s: Props["defaultScenario"]) => void;
  dcaMultiplier: number;
  setDcaMultiplier: (n: number) => void;
  expenseGrowth: number;
  setExpenseGrowth: (n: number) => void;
  incomeGrowth: number;
  setIncomeGrowth: (n: number) => void;
  swr: number;
  setSwr: (n: number) => void;
  showReal: boolean;
  setShowReal: (b: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Horizon (années)">
          <Input
            type="number"
            min={1}
            max={60}
            value={scenario.horizonYears}
            onChange={(e) =>
              setScenario({ ...scenario, horizonYears: Number(e.target.value) })
            }
            className="h-10"
          />
        </Field>
        <Field label="Inflation (%)">
          <Input
            type="number"
            step="0.1"
            value={scenario.inflationPct}
            onChange={(e) =>
              setScenario({ ...scenario, inflationPct: Number(e.target.value) })
            }
            className="h-10"
          />
        </Field>
        <Field label="Actions (%)">
          <Input
            type="number"
            step="0.1"
            value={scenario.stockReturnPct}
            onChange={(e) =>
              setScenario({ ...scenario, stockReturnPct: Number(e.target.value) })
            }
            className="h-10"
          />
        </Field>
        <Field label="Cash (%)">
          <Input
            type="number"
            step="0.1"
            value={scenario.cashReturnPct}
            onChange={(e) =>
              setScenario({ ...scenario, cashReturnPct: Number(e.target.value) })
            }
            className="h-10"
          />
        </Field>
        <Field label="Immobilier (%)">
          <Input
            type="number"
            step="0.1"
            value={scenario.propertyAppreciationPct}
            onChange={(e) =>
              setScenario({ ...scenario, propertyAppreciationPct: Number(e.target.value) })
            }
            className="h-10"
          />
        </Field>
        <Field label={`SWR (${swr}%)`}>
          <input
            type="range"
            min={2}
            max={6}
            step={0.25}
            value={swr}
            onChange={(e) => setSwr(Number(e.target.value))}
            className="h-10 w-full accent-[var(--chart-1)]"
          />
        </Field>
      </div>

      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-semibold">Réglages avancés</h4>
        <div className="mt-3 space-y-3">
          <Field label={`Apports DCA × ${dcaMultiplier}%`}>
            <input
              type="range"
              min={0}
              max={300}
              step={10}
              value={dcaMultiplier}
              onChange={(e) => setDcaMultiplier(Number(e.target.value))}
              className="h-10 w-full accent-[var(--chart-1)]"
            />
          </Field>
          <Field label={`Croissance dépenses (${expenseGrowth}%/an)`}>
            <input
              type="range"
              min={0}
              max={6}
              step={0.25}
              value={expenseGrowth}
              onChange={(e) => setExpenseGrowth(Number(e.target.value))}
              className="h-10 w-full accent-[var(--chart-3)]"
            />
          </Field>
          <Field label={`Croissance revenus (${incomeGrowth}%/an)`}>
            <input
              type="range"
              min={0}
              max={6}
              step={0.25}
              value={incomeGrowth}
              onChange={(e) => setIncomeGrowth(Number(e.target.value))}
              className="h-10 w-full accent-[var(--color-success)]"
            />
          </Field>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowReal(!showReal)}
        className={cn(
          "flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs transition-colors",
          showReal
            ? "border-[var(--chart-2)] bg-[var(--chart-2)]/10 text-[var(--chart-2)]"
            : "border-border text-muted-foreground hover:bg-muted/30",
        )}
      >
        <span>Vue inflation-ajustée</span>
        <span className="font-medium">{showReal ? "ON" : "OFF"}</span>
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Kpi({
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
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 md:p-5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
        {label}
      </div>
      <div className={cn("numeric mt-1 text-base font-semibold tabular-nums sm:mt-2 sm:text-xl", toneClass)}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  positive,
  negative,
}: {
  label: string;
  value: string;
  hint?: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const toneClass = positive
    ? "text-[var(--color-success)]"
    : negative
      ? "text-destructive"
      : "";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("numeric mt-1 text-sm font-semibold tabular-nums", toneClass)}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ScenarioCard({
  label,
  sub,
  value,
  base,
  tone,
  highlighted,
}: {
  label: string;
  sub: string;
  value: number;
  base: number;
  tone: "positive" | "negative" | "neutral";
  highlighted?: boolean;
}) {
  const delta = value - base;
  const pct = base !== 0 ? (delta / Math.abs(base)) * 100 : 0;
  const accent =
    tone === "positive"
      ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/5"
      : tone === "negative"
        ? "border-destructive/30 bg-destructive/5"
        : "border-foreground/30 bg-card";
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        accent,
        highlighted && "ring-2 ring-foreground/30",
      )}
    >
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider">{label}</h4>
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>
      <div className="numeric mt-3 text-lg font-bold tabular-nums">{formatEUR(value)}</div>
      {!highlighted && (
        <div
          className={cn(
            "mt-1 text-[11px]",
            tone === "positive"
              ? "text-[var(--color-success)]"
              : tone === "negative"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          {formatEUR(delta, { signed: true })} ({pct >= 0 ? "+" : ""}
          {pct.toFixed(1)} %)
        </div>
      )}
    </div>
  );
}
