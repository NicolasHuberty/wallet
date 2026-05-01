"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatEUR } from "@/lib/format";
import type { AllocationSlice } from "@/lib/charts-data";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#eab308",
  "#a855f7",
  "#06b6d4",
];

export function AllocationDonut({ slices }: { slices: AllocationSlice[] }) {
  if (slices.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
        Aucune position détenue.
      </div>
    );
  }
  // Group small slices (<2 %) into "Autres"
  const major = slices.filter((s) => s.pct >= 2);
  const minor = slices.filter((s) => s.pct < 2);
  const data =
    minor.length === 0
      ? major
      : [
          ...major,
          {
            ticker: "Autres",
            name: `${minor.length} positions`,
            quantity: 0,
            lastPrice: 0,
            value: minor.reduce((s, m) => s + m.value, 0),
            pct: minor.reduce((s, m) => s + m.pct, 0),
          },
        ];

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="ticker"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={1.2}
            >
              {data.map((d, i) => (
                <Cell key={d.ticker} fill={PALETTE[i % PALETTE.length]} stroke="var(--card)" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
              formatter={(v, _n, p) => {
                const num = Number(v);
                const payload = (p as { payload?: { pct?: number; ticker?: string } })?.payload;
                return [
                  `${formatEUR(num)} (${(payload?.pct ?? 0).toFixed(1)} %)`,
                  payload?.ticker ?? "—",
                ];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid max-h-64 gap-1.5 overflow-y-auto pr-1 text-xs md:max-w-[180px]">
        {data.map((d, i) => (
          <li key={d.ticker} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              <span className="truncate font-mono text-[11px]">{d.ticker}</span>
            </span>
            <span className="numeric tabular-nums text-[11px] font-medium">
              {d.pct.toFixed(1)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
