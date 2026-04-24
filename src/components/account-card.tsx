"use client";

import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatEUR, formatDateFR } from "@/lib/format";
import { accountKindColor, isLiability } from "@/lib/labels";
import type { AccountKind } from "@/db/schema";

type Point = { date: string; value: number };

type Props = {
  id: string;
  name: string;
  kind: AccountKind;
  institution: string | null;
  currentValue: number;
  annualYieldPct: number | null;
  monthlyContribution: number | null;
  history: Point[];
};

export function AccountCard({
  id,
  name,
  kind,
  institution,
  currentValue,
  annualYieldPct,
  monthlyContribution,
  history,
}: Props) {
  const negative = isLiability(kind) || currentValue < 0;
  const color = accountKindColor[kind];
  const gradId = `grad-${id}`;

  // Month-over-month trend
  const last = history[history.length - 1];
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const ytdPoint = history.find((p) => {
    const d = new Date(p.date);
    return d.getFullYear() === new Date().getFullYear();
  });
  const first = history[0];

  const mom = prev && last ? last.value - prev.value : 0;
  const momPct = prev && prev.value !== 0 ? (mom / Math.abs(prev.value)) * 100 : 0;
  const ytd = ytdPoint && last ? last.value - ytdPoint.value : 0;
  const total = first && last ? last.value - first.value : 0;

  // For liabilities, "favorable" = value went down (became less negative)
  const favorableMom = negative ? mom < 0 : mom > 0;
  const trendColor = favorableMom ? "text-[var(--color-success)]" : mom === 0 ? "text-muted-foreground" : "text-destructive";

  // Display delta: for liabilities, show +|delta| when favorable, -|delta| when bad
  const displayMom = negative ? -mom : mom;

  return (
    <Link
      href={`/accounts/${id}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-4 transition-all active:bg-muted/40 hover:border-foreground/40 hover:shadow-md md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <h3 className="truncate text-sm font-semibold">{name}</h3>
          </div>
          {institution && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{institution}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 text-[10px]">
          {annualYieldPct != null && annualYieldPct > 0 && (
            <span className="shrink-0 rounded border border-border bg-muted/30 px-1.5 py-0.5 tabular-nums text-muted-foreground">
              {annualYieldPct}%/an
            </span>
          )}
          {monthlyContribution != null && monthlyContribution > 0 && (
            <span className="shrink-0 rounded border border-border bg-muted/30 px-1.5 py-0.5 tabular-nums text-muted-foreground">
              +{formatEUR(monthlyContribution, { compact: true })}/mo
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-2 md:mt-4">
        <div
          className={`numeric text-xl font-semibold tabular-nums md:text-2xl ${negative ? "text-destructive" : ""}`}
        >
          {formatEUR(currentValue)}
        </div>
      </div>

      {/* Sparkline */}
      {history.length >= 2 ? (
        <div className="mt-3 h-14">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 11,
                  padding: "4px 8px",
                }}
                formatter={(v) => [formatEUR(Number(v)), "Valeur"]}
                labelFormatter={(_, p) => (p[0] ? formatDateFR(p[0].payload.date) : "")}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#${gradId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-3 flex h-14 items-center justify-center rounded-md border border-dashed border-border/60 text-[10px] text-muted-foreground">
          Pas d&apos;historique
        </div>
      )}

      {history.length >= 2 && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-[11px]">
          <MiniStat
            label="M-1"
            value={formatEUR(displayMom, { signed: true })}
            pctHint={momPct !== 0 ? `${momPct >= 0 ? "+" : ""}${momPct.toFixed(1)}%` : undefined}
            toneClass={trendColor}
          />
          <MiniStat
            label="YTD"
            value={
              ytdPoint
                ? formatEUR(negative ? -ytd : ytd, { signed: true })
                : "—"
            }
            toneClass={
              !ytdPoint
                ? "text-muted-foreground"
                : (negative ? ytd < 0 : ytd > 0)
                  ? "text-[var(--color-success)]"
                  : ytd === 0
                    ? "text-muted-foreground"
                    : "text-destructive"
            }
          />
          <MiniStat
            label={`${history.length} pts`}
            value={
              first
                ? formatEUR(negative ? -total : total, { signed: true })
                : "—"
            }
            toneClass={
              !first
                ? "text-muted-foreground"
                : (negative ? total < 0 : total > 0)
                  ? "text-[var(--color-success)]"
                  : total === 0
                    ? "text-muted-foreground"
                    : "text-destructive"
            }
          />
        </div>
      )}
    </Link>
  );
}

function MiniStat({
  label,
  value,
  pctHint,
  toneClass,
}: {
  label: string;
  value: string;
  pctHint?: string;
  toneClass: string;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
      <div className={`numeric tabular-nums font-medium leading-tight ${toneClass}`}>{value}</div>
      {pctHint && <div className={`text-[10px] leading-none ${toneClass} opacity-70`}>{pctHint}</div>}
    </div>
  );
}
