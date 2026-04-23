"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, ComposedChart } from "recharts";
import { formatEUR } from "@/lib/format";
import { projectNetWorth } from "@/lib/projection";
import { runMonteCarlo } from "@/lib/monte-carlo";
import type { AccountKind } from "@/db/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Account = { kind: AccountKind; currentValue: number };

export function ProjectionView({
  accounts,
  defaultScenario,
  monthlyNetSavings,
}: {
  accounts: Account[];
  defaultScenario: {
    inflationPct: number;
    stockReturnPct: number;
    cashReturnPct: number;
    propertyAppreciationPct: number;
    horizonYears: number;
  };
  monthlyNetSavings: number;
}) {
  const [scenario, setScenario] = useState(defaultScenario);
  const [savings, setSavings] = useState(monthlyNetSavings);
  const [stockShare, setStockShare] = useState(60);
  const [sigmaStocks, setSigmaStocks] = useState(15);
  const [sigmaProp, setSigmaProp] = useState(4);
  const [sigmaCash, setSigmaCash] = useState(1);
  const [sims, setSims] = useState(500);

  const deterministic = useMemo(
    () => projectNetWorth(accounts, scenario, savings, { stockSavingsShare: stockShare / 100 }),
    [accounts, scenario, savings, stockShare]
  );

  const mc = useMemo(
    () =>
      runMonteCarlo(
        accounts,
        scenario,
        savings,
        { stocks: sigmaStocks, cash: sigmaCash, property: sigmaProp },
        { stockSavingsShare: stockShare / 100, simulations: sims }
      ),
    [accounts, scenario, savings, stockShare, sigmaStocks, sigmaCash, sigmaProp, sims]
  );

  const mcChart = mc.map((p) => ({
    year: p.year,
    p10: p.p10,
    p25p10: p.p25 - p.p10,
    p50p25: p.p50 - p.p25,
    p75p50: p.p75 - p.p50,
    p90p75: p.p90 - p.p75,
    median: p.p50,
  }));

  const finalDet = deterministic[deterministic.length - 1];
  const finalMc = mc[mc.length - 1];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      <aside className="rounded-xl border border-border bg-card p-5 lg:col-span-1 space-y-5">
        <div>
          <h3 className="text-base font-semibold">Hypothèses</h3>
          <p className="mt-1 text-xs text-muted-foreground">Ajuste, les graphes s'actualisent.</p>
        </div>
        <Field label="Horizon (années)">
          <Input type="number" min={1} max={60} value={scenario.horizonYears} onChange={(e) => setScenario({ ...scenario, horizonYears: Number(e.target.value) })} />
        </Field>
        <Field label="Inflation (%)">
          <Input type="number" step="0.1" value={scenario.inflationPct} onChange={(e) => setScenario({ ...scenario, inflationPct: Number(e.target.value) })} />
        </Field>
        <Field label="Rendement actions (%)">
          <Input type="number" step="0.1" value={scenario.stockReturnPct} onChange={(e) => setScenario({ ...scenario, stockReturnPct: Number(e.target.value) })} />
        </Field>
        <Field label="Rendement cash (%)">
          <Input type="number" step="0.1" value={scenario.cashReturnPct} onChange={(e) => setScenario({ ...scenario, cashReturnPct: Number(e.target.value) })} />
        </Field>
        <Field label="Appréciation immo (%)">
          <Input type="number" step="0.1" value={scenario.propertyAppreciationPct} onChange={(e) => setScenario({ ...scenario, propertyAppreciationPct: Number(e.target.value) })} />
        </Field>
        <Field label="Épargne mensuelle (EUR)">
          <Input type="number" value={savings} onChange={(e) => setSavings(Number(e.target.value))} />
        </Field>
        <Field label={`Part actions : ${stockShare}%`}>
          <input type="range" min={0} max={100} value={stockShare} onChange={(e) => setStockShare(Number(e.target.value))} className="w-full accent-[var(--chart-1)]" />
        </Field>
        <div className="border-t border-border pt-4">
          <h4 className="text-sm font-semibold">Volatilité (Monte-Carlo)</h4>
          <p className="mt-1 text-xs text-muted-foreground">Écart-type annuel par classe</p>
          <div className="mt-4 space-y-4">
            <Field label={`σ actions : ${sigmaStocks}%`}>
              <input type="range" min={0} max={35} value={sigmaStocks} onChange={(e) => setSigmaStocks(Number(e.target.value))} className="w-full accent-[var(--chart-1)]" />
            </Field>
            <Field label={`σ immo : ${sigmaProp}%`}>
              <input type="range" min={0} max={15} value={sigmaProp} onChange={(e) => setSigmaProp(Number(e.target.value))} className="w-full accent-[var(--chart-3)]" />
            </Field>
            <Field label={`σ cash : ${sigmaCash}%`}>
              <input type="range" min={0} max={5} step={0.1} value={sigmaCash} onChange={(e) => setSigmaCash(Number(e.target.value))} className="w-full accent-[var(--chart-2)]" />
            </Field>
            <Field label={`Simulations : ${sims}`}>
              <input type="range" min={100} max={2000} step={100} value={sims} onChange={(e) => setSims(Number(e.target.value))} className="w-full" />
            </Field>
          </div>
        </div>
      </aside>

      <div className="space-y-4 lg:col-span-3">
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label={`Cas de base +${scenario.horizonYears}a`} value={formatEUR(finalDet.nominal)} />
          <Stat label="Médiane MC" value={formatEUR(finalMc.p50)} />
          <Stat label="Pire cas (P10)" value={formatEUR(finalMc.p10)} negative />
          <Stat label="Meilleur (P90)" value={formatEUR(finalMc.p90)} positive />
        </section>

        <Tabs defaultValue="montecarlo" className="space-y-4">
          <TabsList>
            <TabsTrigger value="montecarlo">Monte-Carlo</TabsTrigger>
            <TabsTrigger value="base">Cas de base</TabsTrigger>
            <TabsTrigger value="decomposition">Décomposition</TabsTrigger>
          </TabsList>

          <TabsContent value="montecarlo" className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-base font-semibold">Trajectoires probables (bandes P10–P90)</h3>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mcChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickFormatter={(v) => formatEUR(Number(v), { compact: true })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} width={70} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 }}
                    labelFormatter={(y) => `Année +${y}`}
                    formatter={(v, name, entry) => {
                      const p = entry?.payload as typeof mcChart[number];
                      if (name === "median") return [formatEUR(Number(v)), "Médiane (P50)"];
                      if (name === "p10") return [formatEUR(p.p10), "Plancher P10"];
                      if (name === "p25p10") return [formatEUR(p.p10 + p.p25p10), "P25"];
                      if (name === "p50p25") return [formatEUR(p.p10 + p.p25p10 + p.p50p25), "P50"];
                      if (name === "p75p50") return [formatEUR(p.p10 + p.p25p10 + p.p50p25 + p.p75p50), "P75"];
                      if (name === "p90p75") return [formatEUR(p.p10 + p.p25p10 + p.p50p25 + p.p75p50 + p.p90p75), "P90"];
                      return [formatEUR(Number(v)), name];
                    }}
                  />
                  <Area type="monotone" dataKey="p10" stackId="1" stroke="transparent" fill="transparent" name="p10" />
                  <Area type="monotone" dataKey="p25p10" stackId="1" stroke="transparent" fill="var(--chart-1)" fillOpacity={0.1} name="p25p10" />
                  <Area type="monotone" dataKey="p50p25" stackId="1" stroke="transparent" fill="var(--chart-1)" fillOpacity={0.2} name="p50p25" />
                  <Area type="monotone" dataKey="p75p50" stackId="1" stroke="transparent" fill="var(--chart-1)" fillOpacity={0.2} name="p75p50" />
                  <Area type="monotone" dataKey="p90p75" stackId="1" stroke="transparent" fill="var(--chart-1)" fillOpacity={0.1} name="p90p75" />
                  <Line type="monotone" dataKey="median" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} name="median" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {sims} simulations. Bandes empilées représentent P10/P25/P50/P75/P90. Ligne centrale = médiane.
            </p>
          </TabsContent>

          <TabsContent value="base" className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-base font-semibold">Projection nominale vs réelle</h3>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={deterministic}>
                  <defs>
                    <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickFormatter={(v) => formatEUR(Number(v), { compact: true })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} width={70} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 }}
                    formatter={(v, name) => [formatEUR(Number(v)), name === "nominal" ? "Nominal" : "Réel (€ d'aujourd'hui)"]}
                    labelFormatter={(y) => `Année +${y}`}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="nominal" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#gN)" name="Nominal" />
                  <Line type="monotone" dataKey="real" stroke="var(--chart-2)" strokeWidth={2} dot={false} name="Réel" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="decomposition" className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-base font-semibold">Décomposition par classe d'actif</h3>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={deterministic}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickFormatter={(v) => formatEUR(Number(v), { compact: true })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} width={70} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 }}
                    formatter={(v) => formatEUR(Number(v))}
                    labelFormatter={(y) => `Année +${y}`}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="stocks" stackId="1" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.35} name="Actions" />
                  <Area type="monotone" dataKey="property" stackId="1" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.35} name="Immobilier" />
                  <Area type="monotone" dataKey="cash" stackId="1" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.35} name="Cash" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  const tone = positive ? "text-[var(--color-success)]" : negative ? "text-destructive" : "";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`numeric mt-2 text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
