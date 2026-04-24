"use client";

import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatEUR } from "@/lib/format";

type AnomalyBadgeProps = {
  /** Signed relative deviation, e.g. 0.42 for +42%, -0.31 for -31%. */
  deviation: number;
  /** Expected value (rolling mean) used for the tooltip. */
  expected: number;
  /** Actual value observed that month. */
  total: number;
  /** Optional category label for richer tooltip text. */
  categoryLabel?: string;
  /** Optional month label (e.g. "mars 26"). */
  monthLabel?: string;
  /** Tailwind size override (default size-3.5). */
  className?: string;
};

/**
 * Petit pictogramme cliquable/tap-able qui indique qu'une valeur mensuelle
 * dévie significativement de sa moyenne glissante.
 *
 * - deviation > 0  => TrendingUp (dépense gonflée)
 * - deviation < 0  => TrendingDown (dépense anormalement basse)
 * - !isFinite      => AlertTriangle (apparition soudaine d'une catégorie)
 */
export function AnomalyBadge({
  deviation,
  expected,
  total,
  categoryLabel,
  monthLabel,
  className,
}: AnomalyBadgeProps) {
  const infinite = !Number.isFinite(deviation);
  const Icon = infinite ? AlertTriangle : deviation > 0 ? TrendingUp : TrendingDown;
  const tone = infinite
    ? "text-[var(--color-warning,theme(colors.amber.600))]"
    : deviation > 0
      ? "text-destructive"
      : "text-[var(--color-success,theme(colors.emerald.600))]";

  const pct = infinite ? "nouveau" : `${deviation > 0 ? "+" : ""}${Math.round(deviation * 100)}%`;

  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-background/60 px-1.5 py-0.5 text-[9px] font-medium md:gap-1 md:text-[10px] ${tone} ${className ?? ""}`}
              aria-label="Anomalie détectée"
            >
              <Icon className="size-3" />
              <span className="tabular-nums">{pct}</span>
            </span>
          }
        />
        <TooltipContent className="max-w-xs text-left">
          <div className="space-y-0.5">
            <div className="font-semibold">
              Anomalie détectée
              {categoryLabel ? ` · ${categoryLabel}` : ""}
              {monthLabel ? ` · ${monthLabel}` : ""}
            </div>
            <div>
              Observé&nbsp;: <span className="tabular-nums">{formatEUR(total)}</span>
            </div>
            <div>
              Moyenne (6 mois)&nbsp;:{" "}
              <span className="tabular-nums">{formatEUR(expected)}</span>
            </div>
            {!infinite && (
              <div>
                Déviation&nbsp;:{" "}
                <span className="tabular-nums">
                  {deviation > 0 ? "+" : ""}
                  {(deviation * 100).toFixed(1)}%
                </span>
              </div>
            )}
            {infinite && (
              <div className="text-[11px] opacity-80">
                Aucune dépense historique dans cette catégorie — apparition soudaine.
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
