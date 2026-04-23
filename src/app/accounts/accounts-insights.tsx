"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatEUR, formatDateFR } from "@/lib/format";
import { projectPerAccount, type AccountWithGrowth } from "@/lib/projection";
import { accountKindLabel, accountKindColor, isLiability } from "@/lib/labels";

type Snapshot = {
  date: string; // ISO
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
};

type Scenario = {
  inflationPct: number;
  stockReturnPct: number;
  cashReturnPct: number;
  propertyAppreciationPct: number;
  horizonYears: number;
};

const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function AccountsInsights({
  accounts,
  snapshots,
  baseScenario,
  monthlyCashflow,
}: {
  accounts: AccountWithGrowth[];
  snapshots: Snapshot[];
  baseScenario: Scenario;
  monthlyCashflow: number;
}) {
  const [horizon, setHorizon] = useState(baseScenario.horizonYears);
  const [inflation, setInflation] = useState(baseScenario.inflationPct);

  const scenario: Scenario = { ...baseScenario, horizonYears: horizon, inflationPct: inflation };

  const projection = useMemo(
    () => projectPerAccount(accounts, scenario),
    [accounts, scenario.horizonYears, scenario.inflationPct, scenario.stockReturnPct, scenario.cashReturnPct, scenario.propertyAppreciationPct]
  );

  const growthAccounts = accounts.filter(
    (a) => a.annualYieldPct != null || a.monthlyContribution != null
  );

  const projectionChart = projection.map((p) => {
    const entry: Record<string, number | string> = { year: p.year, total: p.total, real: p.real };
    for (const a of accounts) entry[a.id] = p.perAccount[a.id] ?? 0;
    return entry;
  });

  // Combined series: history (from snapshots) + projection (from projectPerAccount, yr 1+).
  // Yields { date, actifs, passifs, net, phase: "history"|"projection" } sorted chronologically.
  const combinedSeries = useMemo(() => {
    type Pt = {
      date: string;
      ts: number;
      actifs: number;
      passifs: number;
      net: number;
      phase: "history" | "projection";
    };
    const historyPts: Pt[] = snapshots.map((s) => ({
      date: s.date,
      ts: new Date(s.date).getTime(),
      actifs: s.totalAssets,
      passifs: s.totalLiabilities,
      net: s.netWorth,
      phase: "history",
    }));

    const now = new Date();
    const latestHist = historyPts.length > 0 ? historyPts[historyPts.length - 1] : null;
    // Anchor point at "today" with current account values (so projection starts from current state).
    let currentActifs = 0;
    let currentPassifs = 0;
    for (const a of accounts) {
      if (isLiability(a.kind) || a.currentValue < 0) currentPassifs += Math.abs(a.currentValue);
      else currentActifs += a.currentValue;
    }
    const anchorPoint: Pt = {
      date: now.toISOString(),
      ts: now.getTime(),
      actifs: currentActifs,
      passifs: currentPassifs,
      net: currentActifs - currentPassifs,
      phase: "history",
    };

    // Avoid double-anchor if a history snapshot is very close (within same day)
    const sameDayAsAnchor =
      latestHist &&
      new Date(latestHist.date).toDateString() === now.toDateString();

    const projectionPts: Pt[] = projection.slice(1).map((p) => {
      let actifs = 0;
      let passifs = 0;
      for (const a of accounts) {
        const v = p.perAccount[a.id] ?? 0;
        if (isLiability(a.kind) || v < 0) passifs += Math.abs(v);
        else actifs += v;
      }
      const future = new Date(now);
      future.setFullYear(future.getFullYear() + p.year);
      return {
        date: future.toISOString(),
        ts: future.getTime(),
        actifs,
        passifs,
        net: actifs - passifs,
        phase: "projection",
      };
    });

    const combined = [...historyPts, ...(sameDayAsAnchor ? [] : [anchorPoint]), ...projectionPts]
      .sort((a, b) => a.ts - b.ts);
    return combined;
  }, [accounts, snapshots, projection]);

  const anchorTs = useMemo(() => {
    // The boundary between history and projection — use today's anchor timestamp.
    const base = combinedSeries.find((p) => p.phase === "history" && p.date.startsWith(new Date().toISOString().slice(0, 10)));
    if (base) return base.ts;
    const lastHist = [...combinedSeries].reverse().find((p) => p.phase === "history");
    return lastHist?.ts ?? Date.now();
  }, [combinedSeries]);

  const final = projection[projection.length - 1];
  const initial = projection[0];
  const growthEUR = final.total - initial.total;
  const growthPct = initial.total > 0 ? (growthEUR / initial.total) * 100 : 0;

  const totalMonthlyContribution = accounts.reduce(
    (s, a) => s + (a.monthlyContribution ?? 0),
    0
  );
  const realSurplus = monthlyCashflow - totalMonthlyContribution;

  return (
    <section className="space-y-6">
      {/* Stats band */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Valeur actuelle" value={formatEUR(initial.total)} />
        <Stat
          label={`Dans ${horizon} ans (nominal)`}
          value={formatEUR(final.total)}
          positive={growthEUR >= 0}
          negative={growthEUR < 0}
        />
        <Stat
          label="Engagements DCA"
          value={formatEUR(totalMonthlyContribution)}
          hint={`${formatEUR(totalMonthlyContribution * 12 * horizon)} sur ${horizon} ans`}
        />
        <Stat
          label="Disponible réel / mois"
          value={formatEUR(realSurplus)}
          positive={realSurplus > 0}
          negative={realSurplus < 0}
          hint={`cashflow ${formatEUR(monthlyCashflow)} − DCA`}
        />
      </div>

      <Tabs defaultValue="assets-liab">
        <TabsList>
          <TabsTrigger value="assets-liab">Actifs · Passifs · Net</TabsTrigger>
          <TabsTrigger value="projection">Projection net</TabsTrigger>
          <TabsTrigger value="history">Historique net</TabsTrigger>
          <TabsTrigger value="decomposition">Par compte</TabsTrigger>
        </TabsList>

        <TabsContent value="assets-liab" className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold">
                Actifs, Passifs &amp; Patrimoine net — historique + projection
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Données réelles depuis les snapshots, projection forward basée sur le taux et les
                apports de chaque compte. Ligne verticale = aujourd&apos;hui.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-32">
                <Label className="text-xs text-muted-foreground">Horizon (années)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={horizon}
                  onChange={(e) => setHorizon(Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={combinedSeries}>
                <defs>
                  <linearGradient id="gActifs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gPassifs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) =>
                    new Date(Number(v)).toLocaleDateString("fr-BE", {
                      month: "short",
                      year: "2-digit",
                    })
                  }
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  minTickGap={60}
                  scale="time"
                />
                <YAxis
                  tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => formatDateFR(new Date(Number(v)))}
                  formatter={(val, name) => [
                    formatEUR(Number(val)),
                    name === "actifs" ? "Actifs" : name === "passifs" ? "Passifs" : "Patrimoine net",
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {/* Vertical line marking "today" */}
                <Line
                  data={[
                    { ts: anchorTs, marker: 0 },
                    { ts: anchorTs, marker: 1 },
                  ]}
                  dataKey="marker"
                  stroke="transparent"
                  isAnimationActive={false}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="actifs"
                  stroke="var(--color-success)"
                  strokeWidth={2}
                  fill="url(#gActifs)"
                  name="actifs"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="passifs"
                  stroke="var(--destructive)"
                  strokeWidth={2}
                  fill="url(#gPassifs)"
                  name="passifs"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  dot={false}
                  name="net"
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-[var(--color-success)]" />
              Actifs
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-destructive" />
              Passifs
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-[2px] w-4 bg-[var(--chart-1)]" />
              Net
            </span>
            <span>·</span>
            <span>
              {snapshots.length} point{snapshots.length > 1 ? "s" : ""} d&apos;historique ·{" "}
              {horizon} année{horizon > 1 ? "s" : ""} projetées
            </span>
          </div>
        </TabsContent>

        <TabsContent value="projection" className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold">Projection du patrimoine</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Chaque compte projeté avec son taux (%/an) et ses apports mensuels propres. Les
                comptes sans taux défini utilisent le scénario par défaut.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-32">
                <Label className="text-xs text-muted-foreground">Horizon (années)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={horizon}
                  onChange={(e) => setHorizon(Math.max(1, Number(e.target.value)))}
                />
              </div>
              <div className="w-32">
                <Label className="text-xs text-muted-foreground">Inflation (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={inflation}
                  onChange={(e) => setInflation(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={projectionChart}>
                <defs>
                  <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="year"
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(v, name) => [
                    formatEUR(Number(v)),
                    name === "total" ? "Nominal" : "Réel",
                  ]}
                  labelFormatter={(y) => `Année +${y}`}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  fill="url(#gTotal)"
                  name="Nominal"
                />
                <Line
                  type="monotone"
                  dataKey="real"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                  name="Réel (€ d'aujourd'hui)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {growthAccounts.length > 0 && (
            <div className="mt-4 grid gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 p-3 text-xs">
              <div className="font-medium text-foreground">Paramètres par compte</div>
              <ul className="grid gap-1 md:grid-cols-2">
                {growthAccounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <span
                        className="mr-2 inline-block size-2 rounded-full"
                        style={{ backgroundColor: accountKindColor[a.kind] }}
                      />
                      {a.name}
                    </span>
                    <span className="text-muted-foreground">
                      {a.annualYieldPct != null && `${a.annualYieldPct}%/an`}
                      {a.monthlyContribution != null &&
                        ` · ${formatEUR(a.monthlyContribution)}/mois`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Croissance totale : {formatEUR(growthEUR, { signed: true })} (
            {growthPct >= 0 ? "+" : ""}
            {growthPct.toFixed(1)}%) sur {horizon} ans.
          </p>
        </TabsContent>

        <TabsContent value="history" className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-base font-semibold">Historique du patrimoine net</h3>
          {snapshots.length < 2 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              Pas assez de snapshots pour tracer une courbe. Les snapshots sont recalculés à chaque
              modification de compte.
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={snapshots}>
                  <defs>
                    <linearGradient id="gNetHist" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => formatDateFR(v)}
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                    fontSize={11}
                  />
                  <YAxis
                    tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={70}
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
                    formatter={(val, name) => [
                      formatEUR(Number(val)),
                      name === "netWorth" ? "Net" : name === "totalAssets" ? "Actifs" : "Passifs",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="netWorth"
                    stroke="var(--chart-1)"
                    strokeWidth={2.5}
                    fill="url(#gNetHist)"
                    name="netWorth"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </TabsContent>

        <TabsContent value="decomposition" className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-base font-semibold">Projection par compte</h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="year"
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(v) => formatEUR(Number(v))}
                  labelFormatter={(y) => `Année +${y}`}
                />
                <Legend />
                {accounts.map((a, i) => (
                  <Area
                    key={a.id}
                    type="monotone"
                    dataKey={a.id}
                    name={`${a.name} · ${accountKindLabel[a.kind]}`}
                    stackId="1"
                    stroke={palette[i % palette.length]}
                    fill={palette[i % palette.length]}
                    fillOpacity={0.3}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  positive,
  negative,
}: {
  label: string;
  value: string;
  hint?: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const tone = positive ? "text-[var(--color-success)]" : negative ? "text-destructive" : "";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`numeric mt-1.5 text-lg font-semibold ${tone}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
