"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Search, X, TrendingUp, TrendingDown } from "lucide-react";
import { formatEUR, formatDateFR } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  categoryColor,
  categoryLabel,
  type TransactionCategory,
} from "@/lib/transaction-categorizer";
import {
  searchCashflows,
  spendingByCategory,
  monthlyExpenseTotals,
  monthlyCategoryShare,
  currentVsAverageSpend,
  resolveCategory,
  type AnalyticsCashflow,
} from "@/lib/account-analytics";

export type ExplorerRow = {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  amount: number;
  notes: string | null;
  kind: AnalyticsCashflow["kind"];
  category: AnalyticsCashflow["category"];
  transferToAccountId: string | null;
};

export type AccountOption = { id: string; name: string; kind: string };

const fmtMonth = (yyyymm: string) => {
  const [y, m] = yyyymm.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("fr-BE", {
    month: "short",
    year: "2-digit",
  });
};

export function SpendingExplorer({
  rows,
  accounts,
}: {
  rows: ExplorerRow[];
  accounts: AccountOption[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<TransactionCategory | null>(null);
  const [accountId, setAccountId] = useState<string>("all");

  // Portée compte
  const base = useMemo(
    () => (accountId === "all" ? rows : rows.filter((r) => r.accountId === accountId)),
    [rows, accountId],
  );

  // Mois de référence = dernier mois avec des dépenses dans la portée.
  const latestMonth = useMemo(() => {
    const m = monthlyExpenseTotals(base);
    return m.length > 0 ? m[m.length - 1].month : "";
  }, [base]);

  // Catégories présentes (chips) — sur la portée compte, hors recherche.
  const chips = useMemo(() => spendingByCategory(base).expenses, [base]);

  // Ensemble filtré : recherche libre + catégorie sélectionnée.
  const filtered = useMemo(() => {
    let r = searchCashflows(base, query);
    if (category) r = r.filter((x) => resolveCategory(x) === category);
    return r;
  }, [base, query, category]);

  const monthly = useMemo(() => monthlyExpenseTotals(filtered), [filtered]);
  const comparison = useMemo(
    () => currentVsAverageSpend(filtered, latestMonth),
    [filtered, latestMonth],
  );
  const share = useMemo(() => monthlyCategoryShare(base), [base]);

  const total = monthly.reduce((s, m) => s + m.spend, 0);
  const txCount = monthly.reduce((s, m) => s + m.count, 0);
  const avgPerMonth = monthly.length > 0 ? total / monthly.length : 0;

  const txList = useMemo(
    () =>
      [...filtered]
        .filter((r) => r.amount < 0 && !r.transferToAccountId && r.category !== "transfer_internal")
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [filtered],
  );

  const hasFilter = query.trim().length > 0 || category !== null;

  return (
    <div className="space-y-5">
      {/* ─── Barre de recherche + filtres ─── */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cherche une dépense — ex. « essence », « delhaize », « netflix »…"
              className="w-full rounded-md border border-border bg-background py-2.5 pl-9 pr-9 text-sm focus:border-foreground focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
          >
            <option value="all">Tous les comptes</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Chips catégories */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const active = category === c.category;
            return (
              <button
                key={c.category}
                type="button"
                onClick={() => setCategory(active ? null : c.category)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground/50",
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: active ? "var(--background)" : categoryColor[c.category] }}
                />
                {categoryLabel[c.category]}
                <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
                  {formatEUR(c.abs, { compact: true })}
                </span>
              </button>
            );
          })}
        </div>

        {hasFilter && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Filtre actif :{" "}
              <strong className="text-foreground">
                {query.trim() ? `« ${query.trim()} »` : ""}
                {query.trim() && category ? " · " : ""}
                {category ? categoryLabel[category] : ""}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategory(null);
              }}
              className="rounded-md border border-border px-2 py-0.5 hover:border-foreground"
            >
              Réinitialiser
            </button>
          </div>
        )}
      </section>

      {/* ─── KPIs de l'ensemble filtré ─── */}
      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Kpi label="Total dépensé" value={formatEUR(total)} hint={`${txCount} transaction(s)`} />
        <Kpi label="Moyenne / mois" value={formatEUR(avgPerMonth)} hint={`${monthly.length} mois`} />
        <Kpi
          label={latestMonth ? `Dernier mois (${fmtMonth(latestMonth)})` : "Dernier mois"}
          value={formatEUR(comparison.current)}
          tone={comparison.deltaPct == null ? undefined : comparison.deltaPct > 0 ? "negative" : "positive"}
        />
        <ComparisonKpi comparison={comparison} />
      </section>

      {/* ─── Courbe coût mensuel de l'ensemble filtré ─── */}
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">
            Coût mensuel
            {hasFilter && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                · {query.trim() ? `« ${query.trim()} »` : categoryLabel[category!]}
              </span>
            )}
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Dépense par mois pour l&apos;ensemble filtré · moyenne {formatEUR(avgPerMonth)}/mois
          </p>
        </div>
        {monthly.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Aucune dépense ne correspond à ce filtre.
          </p>
        ) : (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  labelFormatter={(l) => fmtMonth(String(l))}
                  formatter={(v, _n, p) => {
                    const cnt = (p as { payload?: { count?: number } })?.payload?.count ?? 0;
                    return [`${formatEUR(Number(v))} · ${cnt} tx`, "Dépensé"];
                  }}
                />
                <Bar
                  dataKey="spend"
                  fill={category ? categoryColor[category] : "var(--chart-1)"}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ─── Répartition mensuelle par catégorie (%) ─── */}
      <MonthlyShareChart data={share} />

      {/* ─── Liste des transactions filtrées ─── */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Transactions {hasFilter ? "correspondantes" : ""}
          </h3>
          <span className="text-xs text-muted-foreground">
            {txList.length} · total {formatEUR(total)}
          </span>
        </div>
        {txList.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Rien à afficher.</p>
        ) : (
          <ul className="divide-y divide-border">
            {txList.slice(0, 300).map((r) => {
              const cat = resolveCategory(r);
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="w-16 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {formatDateFR(r.date)}
                    </span>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: categoryColor[cat] }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{r.notes ?? "(sans description)"}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {categoryLabel[cat]} · {r.accountName}
                      </span>
                    </span>
                  </div>
                  <span className="numeric shrink-0 tabular-nums font-medium text-destructive">
                    {formatEUR(Math.abs(r.amount))}
                  </span>
                </li>
              );
            })}
            {txList.length > 300 && (
              <li className="py-2 text-center text-[10px] text-muted-foreground">
                + {txList.length - 300} autres — affine ta recherche
              </li>
            )}
          </ul>
        )}
      </section>
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
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
        {label}
      </div>
      <div
        className={cn(
          "numeric mt-1 text-base font-semibold tabular-nums sm:text-lg",
          tone === "positive" && "text-[var(--color-success)]",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ComparisonKpi({
  comparison,
}: {
  comparison: { deltaPct: number | null; average: number };
}) {
  const { deltaPct, average } = comparison;
  const up = (deltaPct ?? 0) > 0;
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
        vs moyenne
      </div>
      {deltaPct == null ? (
        <div className="numeric mt-1 text-base font-semibold tabular-nums sm:text-lg">—</div>
      ) : (
        <div
          className={cn(
            "mt-1 flex items-center gap-1 text-base font-semibold tabular-nums sm:text-lg",
            up ? "text-destructive" : "text-[var(--color-success)]",
          )}
        >
          {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
          {up ? "+" : ""}
          {deltaPct.toFixed(0)} %
        </div>
      )}
      <div className="mt-0.5 text-[10px] text-muted-foreground">
        moyenne {formatEUR(average)}/mois
      </div>
    </div>
  );
}

function MonthlyShareChart({
  data,
}: {
  data: Array<{ month: string } & Partial<Record<TransactionCategory, number>>>;
}) {
  const seenCats = useMemo(() => {
    const totals = new Map<TransactionCategory, number>();
    for (const row of data)
      for (const k of Object.keys(row))
        if (k !== "month")
          totals.set(
            k as TransactionCategory,
            (totals.get(k as TransactionCategory) ?? 0) + (row[k as TransactionCategory] ?? 0),
          );
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
  }, [data]);

  if (data.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Répartition mensuelle par catégorie</h3>
        <p className="text-[10px] text-muted-foreground">
          Part (%) de chaque catégorie dans les dépenses du mois.
        </p>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} stackOffset="expand" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
              tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              fontSize={10}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 11,
              }}
              labelFormatter={(l) => fmtMonth(String(l))}
              formatter={(v, n) => [`${Number(v).toFixed(1)} %`, categoryLabel[n as TransactionCategory] ?? String(n)]}
            />
            {seenCats.map((cat) => (
              <Bar key={cat} dataKey={cat} stackId="share" fill={categoryColor[cat]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
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
