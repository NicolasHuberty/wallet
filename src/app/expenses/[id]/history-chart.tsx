"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR } from "@/lib/format";

type Point = { month: string; label: string; amount: number; avg: number };

export function ExpenseHistoryChart({ data, baseline }: { data: Point[]; baseline: number }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Aucun historique — la première saisie mensuelle démarrera la série.
      </div>
    );
  }
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            minTickGap={20}
          />
          <YAxis
            tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            fontSize={11}
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
            formatter={(v, name) => [
              formatEUR(Number(v)),
              name === "amount" ? "Réel" : name === "avg" ? "Moyenne glissante" : String(name),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="var(--destructive)"
            strokeWidth={2}
            fill="url(#gExp)"
            name="Réel"
          />
          <Line
            type="monotone"
            dataKey="avg"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            name="Moyenne glissante"
          />
          {baseline > 0 && (
            <ReferenceLine
              y={baseline}
              stroke="var(--stone,var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{
                value: "baseline",
                fill: "var(--muted-foreground)",
                fontSize: 10,
                position: "right",
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
