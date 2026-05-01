"use client";

import { formatEUR } from "@/lib/format";
import type { HoldingPerfRow } from "@/lib/charts-data";

const fmtPct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)} %`;

export function HoldingsPerf({ rows }: { rows: HoldingPerfRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
        Aucune position détenue actuellement.
      </div>
    );
  }
  // Display max 12 rows (top by absolute |unrealizedAbs|) to keep card compact
  const top = [...rows]
    .sort((a, b) => Math.abs(b.unrealizedAbs) - Math.abs(a.unrealizedAbs))
    .slice(0, 12);
  const maxAbs = Math.max(...top.map((r) => Math.abs(r.unrealizedPct))) || 0.01;

  return (
    <ul className="grid gap-1.5 text-xs">
      {top.map((r) => {
        const pos = r.unrealizedAbs >= 0;
        const widthPct = Math.min(100, (Math.abs(r.unrealizedPct) / maxAbs) * 100);
        return (
          <li key={r.ticker} className="grid gap-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="font-mono text-[11px] font-medium">{r.ticker}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {r.quantity.toFixed(2)} × {formatEUR(r.lastPrice)}
                </span>
              </span>
              <span
                className={`numeric shrink-0 text-[11px] font-semibold tabular-nums ${
                  pos ? "text-[var(--color-success)]" : "text-destructive"
                }`}
              >
                {fmtPct(r.unrealizedPct)}
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  ({formatEUR(r.unrealizedAbs, { signed: true })})
                </span>
              </span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`absolute h-full rounded-full ${
                  pos
                    ? "left-1/2 bg-[var(--color-success)]"
                    : "right-1/2 bg-destructive"
                }`}
                style={{ width: `${widthPct / 2}%` }}
              />
              <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
