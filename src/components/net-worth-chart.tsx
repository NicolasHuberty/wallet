"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR, formatMonthYear } from "@/lib/format";

type Point = { date: string; netWorth: number; assets: number; liabilities: number };

/**
 * Net-worth chart.
 *
 * Mobile tuning:
 *  - Container height drops from 288px to 192px.
 *  - Y-axis narrower, smaller font; X-axis ticks spaced further apart.
 *  - Left/right margins pulled in so the chart fills the viewport
 *    without triggering horizontal scroll.
 */
export function NetWorthChart({ data }: { data: Point[] }) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <div className="h-48 w-full md:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 6,
            right: isMobile ? 4 : 10,
            left: isMobile ? -18 : 0,
            bottom: 0,
          }}
        >
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
            minTickGap={isMobile ? 48 : 40}
            fontSize={isMobile ? 10 : 11}
          />
          <YAxis
            tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            fontSize={isMobile ? 10 : 11}
            width={isMobile ? 44 : 60}
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
            formatter={(val, name) => [
              formatEUR(Number(val)),
              name === "netWorth" ? "Net worth" : name === "assets" ? "Actifs" : "Passifs",
            ]}
          />
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#gradNet)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
