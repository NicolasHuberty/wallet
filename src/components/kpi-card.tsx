import { cn } from "@/lib/utils";
import { formatEUR, formatPct } from "@/lib/format";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

/**
 * KPI card — dense on mobile, roomy on desktop.
 *
 * Mobile (< md):
 *  - compact padding (12px),
 *  - smaller title + value so a 2-col grid fits without horizontal scroll,
 *  - tabular numbers so digits align across cards.
 * Desktop: the classic large KPI.
 */
export function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number;
  delta?: number;
  deltaLabel?: string;
  tone?: "neutral" | "positive" | "negative";
  hint?: string;
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-[var(--color-success)]",
    negative: "text-destructive",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] md:p-5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:text-xs">
        {label}
      </div>
      <div
        className={cn(
          "numeric mt-1 text-lg font-semibold tabular-nums md:mt-2 md:text-3xl",
          toneClass
        )}
      >
        {formatEUR(value)}
      </div>
      {delta !== undefined && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] md:mt-2 md:text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
              delta >= 0
                ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
                : "bg-destructive/15 text-destructive"
            )}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {formatPct(delta)}
          </span>
          {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
        </div>
      )}
      {hint && (
        <div className="mt-1 text-[10px] text-muted-foreground md:mt-2 md:text-xs">{hint}</div>
      )}
    </div>
  );
}
