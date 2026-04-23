"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR, formatDateFR } from "@/lib/format";

type Point = { date: string; value: number };

export function AccountPerfChart({ data }: { data: Point[] }) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="gPerf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => formatDateFR(v)}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            minTickGap={40}
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
            formatter={(v) => [formatEUR(Number(v)), "Valeur"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            fill="url(#gPerf)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
