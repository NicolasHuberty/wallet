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
import { formatDateFR } from "@/lib/format";
import type { DrawdownPoint } from "@/lib/charts-data";

export function DrawdownChart({ data }: { data: DrawdownPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
        Pas assez de points.
      </div>
    );
  }
  const minDd = Math.min(...data.map((d) => d.drawdownPct));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gDD" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.05} />
              <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.35} />
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
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            domain={[Math.min(-0.05, minDd * 1.1), 0]}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={50}
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
            formatter={(v) => [`${(Number(v) * 100).toFixed(2)} %`, "Drawdown"]}
          />
          <Area
            type="monotone"
            dataKey="drawdownPct"
            stroke="var(--destructive)"
            strokeWidth={1.5}
            fill="url(#gDD)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
