"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Pencil, Tag, Repeat, CalendarClock, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatEUR, formatDateFR } from "@/lib/format";
import { categoryColor, categoryLabel, type TransactionCategory } from "@/lib/transaction-categorizer";
import { PosteDialog, type PropertyOption } from "@/components/poste-dialog";
import type { Poste } from "@/lib/postes";

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: "hebdomadaire", biweekly: "bimensuel", monthly: "mensuel",
  quarterly: "trimestriel", yearly: "annuel",
};
const KIND_ICON = { variable: Repeat, fixed: CalendarClock, oneoff: Receipt } as const;
const KIND_LABEL = { variable: "Enveloppe variable", fixed: "Charge fixe", oneoff: "Frais ponctuel" } as const;

const fmtMonth = (yyyymm: string) => {
  const [y, m] = yyyymm.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("fr-BE", { month: "short", year: "2-digit" });
};

type MatchedRow = {
  id: string;
  date: string;
  amount: number;
  label: string;
  category: TransactionCategory;
  accountName?: string;
};

export function PosteDetail({
  poste,
  properties,
  monthly,
  matched,
  totalCount,
  totalAmount,
  byPattern,
}: {
  poste: Poste;
  properties: PropertyOption[];
  monthly: { month: string; spend: number }[];
  matched: MatchedRow[];
  totalCount: number;
  totalAmount: number;
  byPattern: { pattern: string; count: number; total: number }[];
}) {
  const Icon = KIND_ICON[poste.kind];

  const { lastMonth, lastSpend, avg } = useMemo(() => {
    if (monthly.length === 0) return { lastMonth: "", lastSpend: 0, avg: 0 };
    const last = monthly[monthly.length - 1];
    const prior = monthly.slice(0, -1);
    const a = prior.length > 0 ? prior.reduce((s, m) => s + m.spend, 0) / prior.length : last.spend;
    return { lastMonth: last.month, lastSpend: last.spend, avg: a };
  }, [monthly]);

  const recurrenceHint =
    poste.kind === "fixed"
      ? `${FREQUENCY_LABEL[poste.frequency ?? "monthly"]} · jour ${poste.dayOfMonth ?? 1}`
      : poste.kind === "variable"
        ? `budget ${FREQUENCY_LABEL[poste.cadence ?? "monthly"] ?? "mensuel"}`
        : poste.date
          ? formatDateFR(poste.date)
          : "ponctuel";

  const overBudget = poste.kind === "variable" && lastSpend > poste.amount;

  return (
    <div className="space-y-5">
      <Link href="/postes" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Tous les postes
      </Link>

      {/* En-tête */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Icon className="size-3.5" /> {KIND_LABEL[poste.kind]} · {recurrenceHint}
            </div>
            <h2 className="mt-1 text-xl font-semibold">{poste.label}</h2>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Tag className="size-3" /> {poste.category}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="numeric text-2xl font-semibold tabular-nums">{formatEUR(poste.amount)}</div>
            <PosteDialog
              poste={poste}
              properties={properties}
              trigger={<Button size="sm" variant="outline"><Pencil className="size-3.5" /> Modifier</Button>}
            />
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Kpi label="Total capté" value={formatEUR(totalAmount)} hint={`${totalCount} transaction(s)`} />
        <Kpi label="Moyenne / mois" value={formatEUR(monthly.length ? totalAmount / monthly.length : 0)} hint={`${monthly.length} mois`} />
        <Kpi
          label={lastMonth ? `Dernier mois (${fmtMonth(lastMonth)})` : "Dernier mois"}
          value={formatEUR(lastSpend)}
          tone={overBudget ? "negative" : undefined}
        />
        {poste.kind === "variable" ? (
          <Kpi
            label="vs budget"
            value={`${poste.amount > 0 ? Math.round((lastSpend / poste.amount) * 100) : 0} %`}
            hint={`budget ${formatEUR(poste.amount)}`}
            tone={overBudget ? "negative" : "positive"}
          />
        ) : (
          <Kpi label="vs moyenne" value={formatEUR(lastSpend - avg, { signed: true })} hint={`moy ${formatEUR(avg)}`} />
        )}
      </section>

      {/* Courbe mensuelle */}
      {monthly.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4 md:p-5">
          <h3 className="mb-3 text-sm font-semibold">Dépense mensuelle captée par ce poste</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={fmtMonth} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} />
                <YAxis tickFormatter={(v) => formatEUR(Number(v), { compact: true })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} width={52} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  labelFormatter={(l) => fmtMonth(String(l))}
                  formatter={(v) => [formatEUR(Number(v)), "Dépensé"]}
                />
                <Bar dataKey="spend" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Règles */}
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <h3 className="mb-2 text-sm font-semibold">Règles de captation</h3>
        {poste.txCategories.length === 0 && poste.counterpartyPatterns.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucune règle. <span className="text-foreground">Modifier</span> ce poste pour lui associer des
            catégories ou des contreparties — les transactions correspondantes y seront alors comptées.
          </p>
        ) : (
          <div className="space-y-2 text-xs">
            {poste.txCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">Catégories :</span>
                {poste.txCategories.map((c) => (
                  <span key={c} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                    <span className="size-2 rounded-full" style={{ background: categoryColor[c as TransactionCategory] }} />
                    {categoryLabel[c as TransactionCategory] ?? c}
                  </span>
                ))}
              </div>
            )}
            {poste.counterpartyPatterns.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">Contreparties :</span>
                {byPattern.map((b) => (
                  <span key={b.pattern} className="rounded-full border border-border px-2 py-0.5">
                    {b.pattern} <span className="text-muted-foreground">· {b.count} tx · {formatEUR(b.total)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Transactions */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Transactions captées</h3>
          <span className="text-xs text-muted-foreground">{totalCount} · {formatEUR(totalAmount)}</span>
        </div>
        {matched.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Aucune transaction ne correspond encore aux règles de ce poste.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {matched.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="w-16 shrink-0 text-[10px] tabular-nums text-muted-foreground">{formatDateFR(m.date)}</span>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: categoryColor[m.category] }} />
                  <span className="min-w-0">
                    <span className="block truncate">{m.label}</span>
                    <span className="text-[10px] text-muted-foreground">{categoryLabel[m.category]}{m.accountName ? ` · ${m.accountName}` : ""}</span>
                  </span>
                </div>
                <span className="numeric shrink-0 tabular-nums font-medium text-destructive">{formatEUR(m.amount)}</span>
              </li>
            ))}
            {totalCount > matched.length && (
              <li className="py-2 text-center text-[10px] text-muted-foreground">+ {totalCount - matched.length} autres</li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "positive" | "negative" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">{label}</div>
      <div
        className={`numeric mt-1 text-base font-semibold tabular-nums sm:text-lg ${
          tone === "positive" ? "text-[var(--color-success)]" : tone === "negative" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
