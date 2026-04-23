"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEUR, formatMonthYear } from "@/lib/format";

type Point = { date: string; netWorth: number; assets: number; liabilities: number };

export function NetWorthChart({ data }: { data: Point[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => formatMonthYear(v)}
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
            labelFormatter={(v) => formatMonthYear(v as string)}
            formatter={(val, name) => [formatEUR(Number(val)), name === "netWorth" ? "Net worth" : name === "assets" ? "Actifs" : "Passifs"]}
          />
          <Area type="monotone" dataKey="netWorth" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#gradNet)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
