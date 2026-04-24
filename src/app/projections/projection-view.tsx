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
import { ChevronDown, Sliders } from "lucide-react";

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
  const [panelOpen, setPanelOpen] = useState(false);

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

  const assumptionsPanel = (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Horizon (années)">
          <Input type="number" inputMode="numeric" min={1} max={60} value={scenario.horizonYears} onChange={(e) => setScenario({ ...scenario, horizonYears: Number(e.target.value) })} className="h-11" />
        </Field>
        <Field label="Inflation (%)">
          <Input type="number" inputMode="decimal" step="0.1" value={scenario.inflationPct} onChange={(e) => setScenario({ ...scenario, inflationPct: Number(e.target.value) })} className="h-11" />
        </Field>
        <Field label="Actions (%)">
          <Input type="number" inputMode="decimal" step="0.1" value={scenario.stockReturnPct} onChange={(e) => setScenario({ ...scenario, stockReturnPct: Number(e.target.value) })} className="h-11" />
        </Field>
        <Field label="Cash (%)">
          <Input type="number" inputMode="decimal" step="0.1" value={scenario.cashReturnPct} onChange={(e) => setScenario({ ...scenario, cashReturnPct: Number(e.target.value) })} className="h-11" />
        </Field>
        <Field label="Immo (%)">
          <Input type="number" inputMode="decimal" step="0.1" value={scenario.propertyAppreciationPct} onChange={(e) => setScenario({ ...scenario, propertyAppreciationPct: Number(e.target.value) })} className="h-11" />
        </Field>
        <Field label="Épargne / mois (€)">
          <Input type="number" inputMode="numeric" value={savings} onChange={(e) => setSavings(Number(e.target.value))} className="h-11" />
        </Field>
      </div>
      <Field label={`Part actions — ${stockShare}%`}>
        <input type="range" min={0} max={100} value={stockShare} onChange={(e) => setStockShare(Number(e.target.value))} className="h-11 w-full accent-[var(--chart-1)]" />
      </Field>

      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-semibold">Volatilité (Monte-Carlo)</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">Écart-type annuel par classe</p>
        <div className="mt-4 space-y-4">
          <Field label={`σ actions — ${sigmaStocks}%`}>
            <input type="range" min={0} max={35} value={sigmaStocks} onChange={(e) => setSigmaStocks(Number(e.target.value))} className="h-11 w-full accent-[var(--chart-1)]" />
          </Field>
          <Field label={`σ immo — ${sigmaProp}%`}>
            <input type="range" min={0} max={15} value={sigmaProp} onChange={(e) => setSigmaProp(Number(e.target.value))} className="h-11 w-full accent-[var(--chart-3)]" />
          </Field>
          <Field label={`σ cash — ${sigmaCash}%`}>
            <input type="range" min={0} max={5} step={0.1} value={sigmaCash} onChange={(e) => setSigmaCash(Number(e.target.value))} className="h-11 w-full accent-[var(--chart-2)]" />
          </Field>
          <Field label={`Simulations — ${sims}`}>
            <input type="range" min={100} max={2000} step={100} value={sims} onChange={(e) => setSims(Number(e.target.value))} className="h-11 w-full" />
          </Field>
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-4">
      <aside className="lg:col-span-1">
        {/* Mobile collapsible trigger */}
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Sliders className="size-4" /> Hypothèses
          </span>
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${panelOpen ? "rotate-180" : ""}`} />
        </button>
        {panelOpen && (
          <div className="mt-2 rounded-xl border border-border bg-card p-4 lg:hidden">
            {assumptionsPanel}
          </div>
        )}

        {/* Desktop */}
        <div className="hidden rounded-xl border border-border bg-card p-5 lg:block">
          <div>
            <h3 className="text-base font-semibold">Hypothèses</h3>
            <p className="mt-1 text-xs text-muted-foreground">Ajuste, les graphes s&apos;actualisent.</p>
          </div>
          <div className="mt-5">{assumptionsPanel}</div>
        </div>
      </aside>

      <div className="space-y-4 lg:col-span-3">
        <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 md:gap-4">
          <Stat label={`Base +${scenario.horizonYears}a`} value={formatEUR(finalDet.nominal)} />
          <Stat label="Médiane MC" value={formatEUR(finalMc.p50)} />
          <Stat label="Pire (P10)" value={formatEUR(finalMc.p10)} negative />
          <Stat label="Meilleur (P90)" value={formatEUR(finalMc.p90)} positive />
        </section>

        <Tabs defaultValue="montecarlo" className="space-y-4">
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="montecarlo">Monte-Carlo</TabsTrigger>
              <TabsTrigger value="base">Base</TabsTrigger>
              <TabsTrigger value="decomposition">Décompo.</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="montecarlo" className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold sm:text-base">Trajectoires probables (P10–P90)</h3>
            <div className="h-60 sm:h-80 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mcChart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} minTickGap={24} />
                  <YAxis tickFormatter={(v) => formatEUR(Number(v), { compact: true })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} width={52} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 11, padding: "6px 8px" }}
                    labelFormatter={(y) => `+${y}a`}
                    formatter={(v, name, entry) => {
                      const p = entry?.payload as typeof mcChart[number];
                      if (name === "median") return [formatEUR(Number(v)), "P50"];
                      if (name === "p10") return [formatEUR(p.p10), "P10"];
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
            <p className="mt-3 text-[11px] leading-snug text-muted-foreground sm:text-xs">
              {sims} simulations · bandes empilées P10/P25/P50/P75/P90 · ligne = médiane.
            </p>
          </TabsContent>

          <TabsContent value="base" className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold sm:text-base">Projection nominale vs réelle</h3>
            <div className="h-60 sm:h-80 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={deterministic} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} minTickGap={24} />
                  <YAxis tickFormatter={(v) => formatEUR(Number(v), { compact: true })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} width={52} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 11, padding: "6px 8px" }}
                    formatter={(v, name) => [formatEUR(Number(v)), name === "nominal" ? "Nominal" : "Réel"]}
                    labelFormatter={(y) => `+${y}a`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="nominal" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#gN)" name="Nominal" />
                  <Line type="monotone" dataKey="real" stroke="var(--chart-2)" strokeWidth={2} dot={false} name="Réel" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="decomposition" className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold sm:text-base">Décomposition par classe</h3>
            <div className="h-60 sm:h-80 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={deterministic} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} minTickGap={24} />
                  <YAxis tickFormatter={(v) => formatEUR(Number(v), { compact: true })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} width={52} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 11, padding: "6px 8px" }}
                    formatter={(v) => formatEUR(Number(v))}
                    labelFormatter={(y) => `+${y}a`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
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
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  const tone = positive ? "text-[var(--color-success)]" : negative ? "text-destructive" : "";
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 md:p-5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-xs">{label}</div>
      <div className={`numeric mt-1 text-base font-semibold sm:mt-2 sm:text-xl ${tone}`}>{value}</div>
    </div>
  );
}
