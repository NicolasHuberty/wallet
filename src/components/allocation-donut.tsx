"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatEUR } from "@/lib/format";

type Slice = { name: string; value: number; color: string };

export function AllocationDonut({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-6">
      <div className="relative h-44 w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={55} outerRadius={80} stroke="var(--card)" strokeWidth={2} paddingAngle={1}>
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
          <div className="text-xs text-muted-foreground">Total actifs</div>
          <div className="numeric text-lg font-semibold">{formatEUR(total, { compact: true })}</div>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-2">
        {data.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <li key={s.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span>{s.name}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span className="numeric tabular-nums">{formatEUR(s.value, { compact: true })}</span>
                <span className="numeric tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
