"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { recategorizeAccount } from "@/app/banking/actions";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR, formatDateFR } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  classifyTransaction,
  categoryColor,
  categoryLabel,
  type TransactionCategory,
} from "@/lib/transaction-categorizer";
import {
  buildKpis,
  detectSubscriptions,
  largestTransactions,
  monthlyByCategory,
  monthlySavingsRate,
  spendingByCategory,
  topMerchants,
  type AnalyticsCashflow,
} from "@/lib/account-analytics";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Repeat,
  TrendingDown,
  TrendingUp,
  Receipt,
} from "lucide-react";

type Cashflow = {
  id: string;
  date: Date | string;
  amount: number;
  notes: string | null;
  ticker: string | null;
  kind: AnalyticsCashflow["kind"];
  category: AnalyticsCashflow["category"];
  categorySource: string | null;
};

const fmtMonth = (yyyymm: string) => {
  const [y, m] = yyyymm.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("fr-BE", {
    month: "short",
    year: "2-digit",
  });
};

export function BankAnalyticsPanel({
  accountId,
  rows,
}: {
  accountId: string;
  rows: Cashflow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const analyticsRows = useMemo<AnalyticsCashflow[]>(
    () =>
      rows.map((r) => ({
        date: r.date,
        amount: r.amount,
        notes: r.notes,
        kind: r.kind,
        category: r.category ?? null,
      })),
    [rows],
  );
  const bceMatchCount = rows.filter((r) => r.categorySource === "bce").length;
  const userOverrideCount = rows.filter((r) => r.categorySource === "user").length;
  const unclassified = rows.filter((r) => !r.category).length;
  const kpis = useMemo(() => buildKpis(analyticsRows), [analyticsRows]);
  const cats = useMemo(() => spendingByCategory(analyticsRows), [analyticsRows]);
  const monthly = useMemo(() => monthlyByCategory(analyticsRows), [analyticsRows]);
  const merchants = useMemo(
    () => topMerchants(analyticsRows, { limit: 12, expensesOnly: true }),
    [analyticsRows],
  );
  const subs = useMemo(() => detectSubscriptions(analyticsRows), [analyticsRows]);
  const biggest = useMemo(
    () => largestTransactions(analyticsRows, { limit: 10 }),
    [analyticsRows],
  );
  const savingsRate = useMemo(() => monthlySavingsRate(analyticsRows), [analyticsRows]);

  function recategorize() {
    start(async () => {
      try {
        const r = await recategorizeAccount({ accountId });
        toast.success(
          `${r.updated} transactions reclassées · ${r.bceMatches} via BCE`,
        );
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        Aucune transaction synchronisée pour ce compte. Lance une <strong>Sync</strong> depuis la
        page <em>Banques</em> ou attends la prochaine synchronisation.
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Categorization status banner ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium">Catégorisation :</span>
          <span className="text-muted-foreground">
            <strong className="text-foreground">{bceMatchCount}</strong> via BCE
          </span>
          <span className="text-muted-foreground">
            <strong className="text-foreground">{userOverrideCount}</strong> manuelles
          </span>
          {unclassified > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              <strong>{unclassified}</strong> non classées
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={recategorize} disabled={pending}>
          {pending ? "Reclassification…" : "Recatégoriser"}
        </Button>
      </div>

      {/* ─── Hero KPIs ─── */}
      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Kpi
          label="Entrées"
          icon={ArrowDownCircle}
          value={formatEUR(kpis.totalIn)}
          hint={`${formatEUR(kpis.averageMonthlyIn)} / mois en moyenne`}
          tone="positive"
        />
        <Kpi
          label="Sorties"
          icon={ArrowUpCircle}
          value={formatEUR(kpis.totalOut)}
          hint={`${formatEUR(kpis.averageMonthlyOut)} / mois en moyenne`}
          tone="negative"
        />
        <Kpi
          label="Net (in − out)"
          value={formatEUR(kpis.net, { signed: true })}
          hint={`${kpis.txCount} transactions`}
          tone={kpis.net >= 0 ? "positive" : "negative"}
        />
        <Kpi
          label="Taux d'épargne"
          value={kpis.savingsRatePct != null ? `${kpis.savingsRatePct.toFixed(1)} %` : "—"}
          hint={`(in − out) / in`}
          tone={
            kpis.savingsRatePct == null
              ? undefined
              : kpis.savingsRatePct >= 20
                ? "positive"
                : kpis.savingsRatePct >= 0
                  ? undefined
                  : "negative"
          }
        />
      </section>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Kpi
          label="Dépense moyenne / jour"
          value={formatEUR(kpis.averageDailySpend)}
          hint={
            kpis.earliestDate && kpis.latestDate
              ? `du ${formatDateFR(kpis.earliestDate)} au ${formatDateFR(kpis.latestDate)}`
              : undefined
          }
        />
        <Kpi
          label="Plus gros revenu"
          value={formatEUR(kpis.largestIncome)}
          tone="positive"
        />
        <Kpi
          label="Plus grosse dépense"
          value={formatEUR(kpis.largestExpense)}
          tone="negative"
        />
        <Kpi
          label="Période couverte"
          value={
            kpis.earliestDate && kpis.latestDate
              ? `${Math.round(
                  (kpis.latestDate.getTime() - kpis.earliestDate.getTime()) /
                    (1000 * 3600 * 24),
                )} jours`
              : "—"
          }
          hint="historique transactions"
        />
      </section>

      {/* ─── Catégories : 2 donuts (dépenses / revenus) ─── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <CategoryDonut
          title="Dépenses par catégorie"
          subtitle={`${cats.expenses.length} catégorie(s) · total ${formatEUR(kpis.totalOut)}`}
          slices={cats.expenses}
          tone="expense"
        />
        <CategoryDonut
          title="Revenus par catégorie"
          subtitle={`${cats.income.length} catégorie(s) · total ${formatEUR(kpis.totalIn)}`}
          slices={cats.income}
          tone="income"
        />
      </section>

      {/* ─── Bars mensuelles empilées par catégorie ─── */}
      <MonthlyStackChart data={monthly} />

      {/* ─── Top merchants + abonnements ─── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <TopMerchants rows={merchants} />
        <SubscriptionsList rows={subs} />
      </section>

      {/* ─── Plus grosses transactions + savings rate trend ─── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <BiggestTransactions rows={biggest} />
        <SavingsRateChart data={savingsRate} />
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function Kpi({
  label,
  icon: Icon,
  value,
  hint,
  tone,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
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
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
        {Icon && <Icon className="size-3" />}
        {label}
      </div>
      <div
        className={cn(
          "numeric mt-1 text-base font-semibold tabular-nums sm:mt-1.5 sm:text-lg",
          toneClass,
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function CategoryDonut({
  title,
  subtitle,
  slices,
  tone,
}: {
  title: string;
  subtitle: string;
  slices: { category: TransactionCategory; total: number; abs: number; pct: number; count: number }[];
  tone: "expense" | "income";
}) {
  if (slices.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">Aucune donnée.</p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="abs"
                nameKey="category"
                innerRadius={45}
                outerRadius={85}
                paddingAngle={1.4}
              >
                {slices.map((s) => (
                  <Cell
                    key={s.category}
                    fill={categoryColor[s.category]}
                    stroke="var(--card)"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(v, _n, p) => {
                  const num = Number(v);
                  const payload = (
                    p as {
                      payload?: { category?: TransactionCategory; pct?: number; count?: number };
                    }
                  )?.payload;
                  return [
                    `${formatEUR(num)} · ${(payload?.pct ?? 0).toFixed(1)} % · ${payload?.count ?? 0} tx`,
                    categoryLabel[payload?.category ?? "other"],
                  ];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="grid max-h-56 gap-1 overflow-y-auto pr-1 text-[11px] md:max-w-[200px]">
          {slices.map((s) => (
            <li
              key={s.category}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: categoryColor[s.category] }}
                />
                <span className="truncate">{categoryLabel[s.category]}</span>
              </span>
              <span className="numeric shrink-0 tabular-nums text-[10px]">
                {formatEUR(s.abs)}
                <span className="ml-1 text-muted-foreground">
                  ({s.pct.toFixed(0)}%)
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        {tone === "expense"
          ? "Les retraits cash et virements internes ne sont pas du « vrai » spending — surveille-les pour comprendre où va le reste."
          : "Inclut salaires, virements entrants, dividendes, intérêts, etc."}
      </p>
    </section>
  );
}

function MonthlyStackChart({
  data,
}: {
  data: Array<{ month: string; total: number } & Partial<Record<TransactionCategory, number>>>;
}) {
  const seenCats = useMemo(() => {
    const set = new Set<TransactionCategory>();
    for (const row of data)
      for (const k of Object.keys(row))
        if (k !== "month" && k !== "total") set.add(k as TransactionCategory);
    return Array.from(set);
  }, [data]);

  if (data.length === 0) return null;

  // Split: positive bars (income) and negative bars (expense), stacked separately
  const series = data.map((row) => {
    const out: Record<string, number | string> = { month: row.month };
    for (const cat of seenCats) {
      out[cat] = row[cat] ?? 0;
    }
    return out;
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold sm:text-base">Mouvements mensuels par catégorie</h3>
          <p className="text-[10px] text-muted-foreground">
            Barres positives = revenus (au-dessus de 0). Barres négatives = dépenses (en-dessous).
          </p>
        </div>
      </div>
      <div className="h-72 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={fmtMonth}
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
              labelFormatter={(label) => fmtMonth(String(label))}
              formatter={(v, n) => [
                formatEUR(Number(v), { signed: true }),
                categoryLabel[n as TransactionCategory] ?? String(n),
              ]}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            {seenCats.map((cat) => (
              <Bar
                key={cat}
                dataKey={cat}
                stackId="cat"
                fill={categoryColor[cat]}
                radius={[1, 1, 1, 1]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <ul className="mt-3 grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {seenCats.map((cat) => (
          <li key={cat} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: categoryColor[cat] }} />
            <span className="truncate text-muted-foreground">{categoryLabel[cat]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopMerchants({
  rows,
}: {
  rows: Array<{ name: string; category: TransactionCategory; total: number; abs: number; count: number }>;
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">Top dépenses</h3>
        <p className="text-xs text-muted-foreground">Aucune dépense identifiée.</p>
      </section>
    );
  }
  const max = rows[0].abs;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Top {rows.length} merchants</h3>
        <p className="text-[10px] text-muted-foreground">
          Cumul des dépenses par contrepartie sur l&apos;ensemble de l&apos;historique.
        </p>
      </div>
      <ul className="space-y-1.5 text-xs">
        {rows.map((r, i) => (
          <li key={`${r.name}-${i}`} className="grid gap-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: categoryColor[r.category] }}
                />
                <span className="truncate font-medium">{r.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  · {r.count} tx · {categoryLabel[r.category]}
                </span>
              </span>
              <span className="numeric shrink-0 tabular-nums text-destructive">
                {formatEUR(r.abs)}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(r.abs / max) * 100}%`,
                  background: categoryColor[r.category],
                  opacity: 0.85,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubscriptionsList({
  rows,
}: {
  rows: Array<{
    name: string;
    category: TransactionCategory;
    monthlyAmount: number;
    occurrences: number;
    monthsSeen: number;
    totalSpent: number;
    firstSeen: Date;
    lastSeen: Date;
  }>;
}) {
  const totalMonthly = rows.reduce((s, r) => s + r.monthlyAmount, 0);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Repeat className="size-3.5" />
            Abonnements détectés
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Heuristique : même contrepartie ≥ 3 mois, montants à ±15 %.
          </p>
        </div>
        <div className="text-xs">
          <span className="font-semibold">{formatEUR(totalMonthly)}</span>{" "}
          <span className="text-muted-foreground">/ mois</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucun abonnement détecté pour le moment. Plus de transactions = meilleure détection.
        </p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {rows.map((r) => (
            <li
              key={r.name}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: categoryColor[r.category] }}
                  />
                  <span className="truncate font-medium">{r.name}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {r.monthsSeen} mois · {r.occurrences} prélèvement(s) · total{" "}
                  {formatEUR(r.totalSpent)}
                </div>
              </div>
              <div className="numeric shrink-0 text-right tabular-nums">
                <div className="font-semibold">{formatEUR(r.monthlyAmount)}</div>
                <div className="text-[10px] text-muted-foreground">/ mois</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BiggestTransactions({
  rows,
}: {
  rows: Array<AnalyticsCashflow & { category: TransactionCategory }>;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Receipt className="size-3.5" />
          Top 10 plus grosses transactions
        </h3>
        <p className="text-[10px] text-muted-foreground">Toutes catégories confondues.</p>
      </div>
      <ul className="space-y-1.5 text-xs">
        {rows.map((r, i) => {
          const positive = r.amount >= 0;
          return (
            <li
              key={i}
              className="flex items-baseline justify-between gap-2 rounded-md border border-border/40 px-3 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {formatDateFR(r.date)}
                  </span>
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: categoryColor[r.category] }}
                  />
                  <span className="truncate">
                    {r.notes ?? "(sans description)"}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {categoryLabel[r.category]}
                </div>
              </div>
              <span
                className={cn(
                  "numeric shrink-0 font-semibold tabular-nums",
                  positive ? "text-[var(--color-success)]" : "text-destructive",
                )}
              >
                {formatEUR(r.amount, { signed: true })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SavingsRateChart({
  data,
}: {
  data: Array<{ month: string; income: number; expenses: number; net: number; ratePct: number | null }>;
}) {
  if (data.length < 2) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">Taux d&apos;épargne mensuel</h3>
        <p className="text-xs text-muted-foreground">Pas assez de mois pour tracer la tendance.</p>
      </section>
    );
  }
  const seriesWithRate = data.map((d) => ({ ...d, ratePctNum: d.ratePct ?? 0 }));
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <TrendingUp className="size-3.5" />
            Taux d&apos;épargne mensuel
          </h3>
          <p className="text-[10px] text-muted-foreground">
            (revenus − dépenses) / revenus, par mois
          </p>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={seriesWithRate} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={fmtMonth}
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              fontSize={10}
            />
            <YAxis
              yAxisId="rate"
              tickFormatter={(v) => `${v}%`}
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              fontSize={10}
              width={40}
              domain={[-50, 100]}
            />
            <YAxis
              yAxisId="net"
              orientation="right"
              tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              fontSize={10}
              width={50}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 11,
              }}
              labelFormatter={(label) => fmtMonth(String(label))}
              formatter={(v, name) => {
                if (name === "ratePctNum") return [`${Number(v).toFixed(1)} %`, "Taux d'épargne"];
                if (name === "net") return [formatEUR(Number(v), { signed: true }), "Net"];
                return [formatEUR(Number(v)), name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine y={0} yAxisId="rate" stroke="var(--border)" />
            <ReferenceLine y={20} yAxisId="rate" stroke="var(--color-success)" strokeDasharray="3 3" />
            <Bar yAxisId="net" dataKey="net" name="Net" fill="var(--chart-2)" opacity={0.5} />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="ratePctNum"
              name="Taux d'épargne"
              stroke="var(--color-success)"
              strokeWidth={2}
              dot
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        <TrendingDown className="mr-0.5 inline size-3 text-amber-600 dark:text-amber-400" />
        La ligne pointillée verte marque 20 % — un objectif d&apos;épargne sain.
      </p>
    </section>
  );
}
