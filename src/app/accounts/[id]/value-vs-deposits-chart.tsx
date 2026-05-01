"use client";

import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { formatEUR, formatDateFR } from "@/lib/format";
import type { ValueDepositsPoint } from "@/lib/charts-data";

export function ValueVsDepositsChart({ data }: { data: ValueDepositsPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
        Pas assez de points pour tracer la courbe.
      </div>
    );
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gGain" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => formatDateFR(v)}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            minTickGap={50}
            fontSize={11}
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
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            labelFormatter={(v) => formatDateFR(v as string)}
            formatter={(v, name) => {
              const num = Number(v);
              const labels: Record<string, string> = {
                value: "Valeur compte",
                netDeposits: "Dépôts cumulés",
                gain: "Plus-value",
              };
              return [formatEUR(num, { signed: name === "gain" }), labels[name as string] ?? name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            iconType="line"
            formatter={(v) =>
              v === "value"
                ? "Valeur compte"
                : v === "netDeposits"
                  ? "Dépôts cumulés"
                  : "Plus-value"
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            fill="url(#gValue)"
            name="value"
          />
          <Line
            type="monotone"
            dataKey="netDeposits"
            stroke="var(--chart-2)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            name="netDeposits"
          />
          <Area
            type="monotone"
            dataKey="gain"
            stroke="var(--color-success)"
            strokeWidth={1.5}
            fill="url(#gGain)"
            name="gain"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
