"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { formatEUR } from "@/lib/format";
import type { CashflowMonth } from "@/lib/charts-data";

function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString("fr-BE", { month: "short", year: "2-digit" });
}

export function CashflowBars({ data }: { data: CashflowMonth[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
        Pas de mouvements.
      </div>
    );
  }

  // Withdrawals & fees displayed as negative for visual clarity
  const series = data.map((d) => ({
    month: d.month,
    Dépôts: d.deposits,
    Retraits: -d.withdrawals,
    Dividendes: d.dividends,
    Frais: -d.fees,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} stackOffset="sign">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            labelFormatter={(label) => formatMonth(String(label))}
            formatter={(v, n) => [formatEUR(Number(v), { signed: true }), n]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
          <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
          <Bar dataKey="Dépôts" stackId="ext" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="Retraits" stackId="ext" fill="var(--chart-2)" radius={[0, 0, 2, 2]} />
          <Bar dataKey="Dividendes" stackId="int" fill="var(--color-success)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="Frais" stackId="int" fill="var(--destructive)" radius={[0, 0, 2, 2]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
