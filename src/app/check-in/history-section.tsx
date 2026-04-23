"use client";

import { useMemo } from "react";
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR } from "@/lib/format";

type MonthPoint = {
  month: string; // YYYY-MM
  charges: number;
  netWorth: number | null;
};

export function HistorySection({ data }: { data: MonthPoint[] }) {
  const chartData = useMemo(() => {
    return data.map((p) => ({
      month: p.month,
      label: new Date(p.month + "-01").toLocaleDateString("fr-BE", {
        month: "short",
        year: "2-digit",
      }),
      charges: -p.charges, // negative for visual
      netWorth: p.netWorth,
    }));
  }, [data]);

  const totalCharges = data.reduce((s, p) => s + p.charges, 0);
  const avgCharges = data.length > 0 ? totalCharges / data.length : 0;

  if (data.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Pas encore assez d&apos;historique. Les frais one-shot et snapshots seront agrégés mois
        par mois dès que tu auras plusieurs mois de données.
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Historique mensuel</h2>
          <p className="text-xs text-muted-foreground">
            Frais one-shot par mois (barres) et patrimoine net aux snapshots (ligne).
          </p>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">{formatEUR(totalCharges)}</div>
            <div>Total frais {data.length} mois</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{formatEUR(avgCharges)}</div>
            <div>Moyenne / mois</div>
          </div>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              fontSize={11}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={70}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
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
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
              formatter={(v, name) => [
                formatEUR(Math.abs(Number(v))),
                name === "charges" ? "Frais one-shot" : "Patrimoine net",
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              yAxisId="left"
              dataKey="charges"
              name="Frais one-shot"
              fill="var(--destructive)"
              opacity={0.7}
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="netWorth"
              name="Patrimoine net"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
