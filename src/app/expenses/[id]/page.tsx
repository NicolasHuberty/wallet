import { notFound } from "next/navigation";
import Link from "next/link";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatEUR } from "@/lib/format";
import { expenseCategoryLabel, resolveCategoryLabel } from "@/lib/labels";
import { ArrowLeft } from "lucide-react";
import { ExpenseHistoryChart } from "./history-chart";

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [expense] = await db
    .select()
    .from(schema.recurringExpense)
    .where(eq(schema.recurringExpense.id, id));
  if (!expense) notFound();

  const actualsRaw = await db
    .select()
    .from(schema.recurringExpenseActual)
    .where(eq(schema.recurringExpenseActual.expenseId, id));

  // Sort by month ascending
  const actuals = [...actualsRaw].sort((a, b) => a.month.localeCompare(b.month));

  // Fill in missing months between first and last with 0 for continuity
  let chartPoints: { month: string; label: string; amount: number; avg: number }[] = [];
  if (actuals.length > 0) {
    const first = actuals[0].month;
    const last = actuals[actuals.length - 1].month;
    const [fy, fm] = first.split("-").map(Number);
    const [ly, lm] = last.split("-").map(Number);
    const start = new Date(fy, fm - 1, 1);
    const end = new Date(ly, lm - 1, 1);
    const byMonth = new Map(actuals.map((a) => [a.month, a.amount]));
    const series: { month: string; amount: number }[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      series.push({ month: key, amount: byMonth.get(key) ?? 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    // 3-month rolling average
    chartPoints = series.map((p, i) => {
      const window = series.slice(Math.max(0, i - 2), i + 1);
      const avg =
        window.reduce((s, q) => s + q.amount, 0) / Math.max(1, window.length);
      const [y, m] = p.month.split("-").map(Number);
      const d = new Date(y, m - 1, 1);
      return {
        month: p.month,
        label: d.toLocaleDateString("fr-BE", { month: "short", year: "2-digit" }),
        amount: Math.round(p.amount),
        avg: Math.round(avg),
      };
    });
  }

  // Stats
  const values = actuals.map((a) => a.amount);
  const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : expense.amount;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const latest = actuals.length > 0 ? actuals[actuals.length - 1] : null;
  const prev = actuals.length >= 2 ? actuals[actuals.length - 2] : null;
  const mom = latest && prev ? latest.amount - prev.amount : 0;
  const momPct = prev && prev.amount !== 0 ? (mom / prev.amount) * 100 : 0;
  const deltaVsAvg = latest ? latest.amount - avg : 0;
  const total12 = actuals.slice(-12).reduce((s, a) => s + a.amount, 0);

  return (
    <>
      <PageHeader
        title={expense.label}
        subtitle={
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">
              {resolveCategoryLabel(expense.category, expenseCategoryLabel)}
            </Badge>
            <span>Baseline {formatEUR(expense.amount)}/mois</span>
            {actuals.length > 0 && (
              <span>· {actuals.length} relevés mensuels</span>
            )}
          </span>
        }
        action={
          <Link href="/expenses">
            <Button variant="outline" size="sm">
              <ArrowLeft className="size-4" /> Retour
            </Button>
          </Link>
        }
      />
      <div className="space-y-6 p-8">
        {/* KPI */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Moyenne" value={formatEUR(avg)} hint={`sur ${actuals.length} mois`} />
          <Kpi
            label="Dernier mois"
            value={latest ? formatEUR(latest.amount) : "—"}
            hint={latest ? latest.month : undefined}
            delta={
              latest && prev
                ? `${mom >= 0 ? "+" : ""}${formatEUR(mom)} (${momPct >= 0 ? "+" : ""}${momPct.toFixed(1)}%)`
                : undefined
            }
            deltaTone={
              !latest || !prev
                ? undefined
                : mom > 0
                  ? "negative"
                  : mom < 0
                    ? "positive"
                    : undefined
            }
          />
          <Kpi
            label="Min / Max"
            value={values.length > 0 ? `${formatEUR(min)} / ${formatEUR(max)}` : "—"}
            hint={values.length > 0 ? `écart ${formatEUR(max - min)}` : undefined}
          />
          <Kpi
            label="Total 12 mois"
            value={formatEUR(total12)}
            hint={`baseline × 12 : ${formatEUR(expense.amount * 12)}`}
          />
        </section>

        {/* Chart */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold">Historique mensuel</h2>
              <p className="text-xs text-muted-foreground">
                Montants réels + moyenne glissante 3 mois + ligne de baseline
              </p>
            </div>
            {latest && Math.abs(deltaVsAvg) > 1 && (
              <Badge
                variant="outline"
                className={
                  deltaVsAvg > 0
                    ? "border-destructive text-destructive"
                    : "border-[var(--color-success)] text-[var(--color-success)]"
                }
              >
                {deltaVsAvg > 0 ? "+" : ""}
                {formatEUR(deltaVsAvg, { signed: true })} vs moyenne
              </Badge>
            )}
          </div>
          <ExpenseHistoryChart data={chartPoints} baseline={expense.amount} />
        </section>

        {/* Monthly list */}
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-base font-semibold">Relevés mensuels</h2>
            <p className="text-xs text-muted-foreground">
              Enregistrés automatiquement à chaque check-in mensuel.
            </p>
          </div>
          {actuals.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucun relevé encore. Effectue une mise à jour mensuelle pour démarrer.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {[...actuals].reverse().map((a, i, arr) => {
                const prev = arr[i + 1];
                const delta = prev ? a.amount - prev.amount : 0;
                const sign =
                  delta > 0
                    ? "text-destructive"
                    : delta < 0
                      ? "text-[var(--color-success)]"
                      : "text-muted-foreground";
                const deltaAvg = a.amount - avg;
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                    <div className="flex items-baseline gap-3">
                      <span className="mono text-xs uppercase tracking-wider text-muted-foreground">
                        {a.month}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-4">
                      <span
                        className={`text-[11px] ${
                          deltaAvg > 0
                            ? "text-destructive"
                            : deltaAvg < 0
                              ? "text-[var(--color-success)]"
                              : "text-muted-foreground"
                        }`}
                      >
                        {Math.abs(deltaAvg) > 1
                          ? `${deltaAvg >= 0 ? "+" : ""}${formatEUR(deltaAvg, { signed: true })} vs moy.`
                          : "≈ moy."}
                      </span>
                      <span className={`numeric tabular-nums text-xs ${sign}`}>
                        {prev ? formatEUR(delta, { signed: true }) : "—"}
                      </span>
                      <span className="numeric tabular-nums text-sm font-medium">
                        {formatEUR(a.amount)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
  deltaTone,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: string;
  deltaTone?: "positive" | "negative";
}) {
  const deltaClass =
    deltaTone === "positive"
      ? "text-[var(--color-success)]"
      : deltaTone === "negative"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="numeric mt-1.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      {delta && <div className={`numeric mt-0.5 text-[11px] tabular-nums ${deltaClass}`}>{delta}</div>}
    </div>
  );
}
