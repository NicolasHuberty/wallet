"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatEUR } from "@/lib/format";

type Slice = { name: string; value: number; color: string };

/**
 * Allocation donut + legend.
 *
 * On mobile we stack the donut on top of the legend so nothing gets
 * clipped. On desktop the donut sits beside the legend.
 */
export function AllocationDonut({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-5 md:flex-row md:items-center md:gap-6">
      <div className="relative size-40 shrink-0 md:size-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="68%"
              outerRadius="100%"
              stroke="var(--card)"
              strokeWidth={2}
              paddingAngle={1}
            >
              {data.map((s, i) => (
                <Cell key={i} fill={s.color} />
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
              formatter={(v, name) => [formatEUR(Number(v)), name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[11px] text-muted-foreground">Total actifs</div>
          <div className="numeric text-base font-semibold tabular-nums md:text-lg">
            {formatEUR(total, { compact: true })}
          </div>
        </div>
      </div>
      <ul className="flex w-full flex-1 flex-col gap-2 md:w-auto">
        {data.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate">{s.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
                <span className="numeric tabular-nums">
                  {formatEUR(s.value, { compact: true })}
                </span>
                <span className="numeric w-10 text-right tabular-nums">{pct.toFixed(0)}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
