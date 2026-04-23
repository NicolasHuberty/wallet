import { cn } from "@/lib/utils";
import { formatEUR, formatPct } from "@/lib/format";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

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
    <div className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("numeric mt-2 text-3xl font-semibold", toneClass)}>{formatEUR(value)}</div>
      {delta !== undefined && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span className={cn("flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium", delta >= 0 ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" : "bg-destructive/15 text-destructive")}>
            {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {formatPct(delta)}
          </span>
          {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
        </div>
      )}
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
