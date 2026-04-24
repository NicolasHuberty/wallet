"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR, formatMonthYear } from "@/lib/format";
import { simulateExtraPayment, addMonths, type Mortgage } from "@/lib/mortgage-simulation";

type Props = {
  mortgage: Mortgage;
  /** First due date of the remaining schedule (1st of next month typically). */
  startDate: string; // ISO string, keeps the component serializable
};

const STEP = 50;

export function PrepaymentSimulator({ mortgage, startDate }: Props) {
  const start = useMemo(() => new Date(startDate), [startDate]);

  // Upper bound of the slider: twice the monthly payment, rounded up to the
  // next 50 € step. Minimum 500 € so the slider stays usable on small loans.
  const maxExtra = useMemo(() => {
    const base = Math.max(500, Math.ceil((mortgage.monthlyPayment * 2) / STEP) * STEP);
    return base;
  }, [mortgage.monthlyPayment]);

  const [extra, setExtra] = useState(0);

  const sim = useMemo(
    () => simulateExtraPayment(mortgage, extra, start),
    [mortgage, extra, start],
  );

  const chartData = useMemo(() => {
    // Align baseline & simulated schedules on the month axis. Once the
    // simulated schedule has hit 0, keep the value at 0 up to the baseline
    // payoff so the area plot shows the divergence clearly.
    const baseline = sim.baselineSchedule;
    const simSchedule = sim.schedule;
    const maxLen = Math.max(baseline.length, simSchedule.length);
    const rows: Array<{ month: number; date: string; baseline: number; simulated: number }> = [];
    // Month 0 = starting point (current balance)
    rows.push({
      month: 0,
      date: start.toISOString(),
      baseline: mortgage.principalRemaining,
      simulated: mortgage.principalRemaining,
    });
    for (let i = 0; i < maxLen; i++) {
      const b = baseline[i]?.balance ?? 0;
      const s = simSchedule[i]?.balance ?? 0;
      rows.push({
        month: i + 1,
        date: addMonths(start, i + 1).toISOString(),
        baseline: b,
        simulated: s,
      });
    }
    return rows;
  }, [sim, start, mortgage.principalRemaining]);

  // Loan already paid off → no slider to show. Must happen AFTER all hooks.
  if (mortgage.principalRemaining <= 0 || mortgage.monthsRemaining <= 0 || mortgage.monthlyPayment <= 0) {
    return null;
  }

  const yearsSaved = Math.floor(sim.monthsSaved / 12);
  const extraMonthsSaved = sim.monthsSaved % 12;
  const savedLabel = sim.monthsSaved === 0
    ? "Aucune économie — augmentez le remboursement"
    : yearsSaved > 0
      ? `${yearsSaved} an${yearsSaved > 1 ? "s" : ""}${extraMonthsSaved > 0 ? ` et ${extraMonthsSaved} mois` : ""} de gagnés`
      : `${sim.monthsSaved} mois de gagnés`;

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-col gap-1">
        <h4 className="text-sm font-semibold">Simulateur de remboursement anticipé</h4>
        <p className="text-xs text-muted-foreground">
          Faites glisser pour voir l&apos;effet d&apos;un versement supplémentaire chaque mois sur la durée du crédit.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-baseline justify-between">
              <label htmlFor="extra-payment" className="text-xs uppercase tracking-wider text-muted-foreground">
                Versement mensuel supplémentaire
              </label>
              <span className="numeric text-xl font-semibold">{formatEUR(extra)}</span>
            </div>
            <input
              id="extra-payment"
              type="range"
              min={0}
              max={maxExtra}
              step={STEP}
              value={extra}
              onChange={(e) => setExtra(Number(e.target.value))}
              className="mt-3 w-full accent-[var(--chart-1)]"
              aria-label="Versement mensuel supplémentaire"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0 €</span>
              <span>{formatEUR(maxExtra)}</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Mensualité totale simulée :{" "}
              <span className="numeric font-semibold text-foreground">
                {formatEUR(mortgage.monthlyPayment + extra)}
              </span>
            </p>
          </div>

          <div className="space-y-3">
            <SimKpi
              label="Date de fin"
              primary={formatMonthYear(sim.newPayoffDate)}
              secondary={`au lieu de ${formatMonthYear(sim.baselinePayoffDate)}`}
              tone={sim.monthsSaved > 0 ? "positive" : undefined}
            />
            <SimKpi
              label="Durée restante"
              primary={`${sim.schedule.length} mois`}
              secondary={`vs ${sim.baselineSchedule.length} mois · ${savedLabel}`}
              tone={sim.monthsSaved > 0 ? "positive" : undefined}
            />
            <SimKpi
              label="Intérêts économisés"
              primary={formatEUR(sim.interestSaved)}
              secondary={`reste ${formatEUR(sim.totalInterestSimulated)} d'intérêts à payer`}
              tone={sim.interestSaved > 0 ? "positive" : undefined}
            />
          </div>

          {extra > 0 && sim.monthsSaved === 0 && (
            <p className="text-xs text-muted-foreground">
              Astuce : à ce niveau la simulation ne raccourcit pas le crédit — augmentez le versement.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <h5 className="mb-1 text-xs font-semibold">Solde restant — baseline vs simulation</h5>
          <p className="mb-2 text-[11px] text-muted-foreground">
            La courbe simulée rejoint plus vite le 0 grâce au versement anticipé.
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gBaseline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSimulated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => formatMonthYear(v as string)}
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  minTickGap={50}
                />
                <YAxis
                  tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => formatMonthYear(v as string)}
                  formatter={(value, name) => [
                    formatEUR(Number(value)),
                    name === "simulated" ? "Simulation" : "Baseline",
                  ]}
                />
                <Legend
                  formatter={(v) => (v === "simulated" ? "Avec versement" : "Sans versement")}
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="baseline"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  fill="url(#gBaseline)"
                />
                <Area
                  type="monotone"
                  dataKey="simulated"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  fill="url(#gSimulated)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function SimKpi({
  label,
  primary,
  secondary,
  tone,
}: {
  label: string;
  primary: string;
  secondary?: string;
  tone?: "positive";
}) {
  const cls = tone === "positive" ? "text-[var(--color-success)]" : "";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`numeric mt-1 text-base font-semibold ${cls}`}>{primary}</div>
      {secondary && <div className="mt-0.5 text-[11px] text-muted-foreground">{secondary}</div>}
    </div>
  );
}
