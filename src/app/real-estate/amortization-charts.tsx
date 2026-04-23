"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR } from "@/lib/format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Entry = {
  dueDate: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
};

export function AmortizationCharts({ entries, initialPrincipal }: { entries: Entry[]; initialPrincipal: number }) {
  const { timeline, yearly, totals, crossoverIndex } = useMemo(() => {
    let cumPrincipal = 0;
    let cumInterest = 0;
    const timeline: Array<{
      idx: number;
      date: string;
      balance: number;
      principal: number;
      interest: number;
      cumPrincipal: number;
      cumInterest: number;
      principalShare: number;
      interestShare: number;
    }> = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      cumPrincipal += e.principal;
      cumInterest += e.interest;
      timeline.push({
        idx: i + 1,
        date: e.dueDate,
        balance: e.balance,
        principal: e.principal,
        interest: e.interest,
        cumPrincipal,
        cumInterest,
        principalShare: e.payment > 0 ? (e.principal / e.payment) * 100 : 0,
        interestShare: e.payment > 0 ? (e.interest / e.payment) * 100 : 0,
      });
    }

    const yearlyMap = new Map<number, { year: number; principal: number; interest: number; payments: number; endBalance: number }>();
    for (const e of entries) {
      const y = new Date(e.dueDate).getFullYear();
      const cur = yearlyMap.get(y) ?? { year: y, principal: 0, interest: 0, payments: 0, endBalance: 0 };
      cur.principal += e.principal;
      cur.interest += e.interest;
      cur.payments += e.payment;
      cur.endBalance = e.balance;
      yearlyMap.set(y, cur);
    }
    const yearly = [...yearlyMap.values()].sort((a, b) => a.year - b.year);

    const totalPrincipal = entries.reduce((s, e) => s + e.principal, 0);
    const totalInterest = entries.reduce((s, e) => s + e.interest, 0);
    const totalPayments = entries.reduce((s, e) => s + e.payment, 0);

    const crossIdx = timeline.findIndex((t) => t.principal >= t.interest);

    return {
      timeline,
      yearly,
      totals: { totalPrincipal, totalInterest, totalPayments },
      crossoverIndex: crossIdx,
    };
  }, [entries]);

  const [yearRange, setYearRange] = useState<"all" | "5" | "10">("all");
  const filteredTimeline = useMemo(() => {
    if (yearRange === "all") return timeline;
    const months = yearRange === "5" ? 60 : 120;
    return timeline.slice(0, months);
  }, [timeline, yearRange]);

  const pieData = [
    { name: "Capital", value: totals.totalPrincipal, color: "var(--chart-1)" },
    { name: "Intérêts", value: totals.totalInterest, color: "var(--chart-3)" },
  ];

  const interestRatio = totals.totalPayments > 0 ? (totals.totalInterest / totals.totalPayments) * 100 : 0;
  const effectiveRate = initialPrincipal > 0 ? (totals.totalInterest / initialPrincipal) * 100 : 0;
  const crossDate = crossoverIndex >= 0 ? new Date(timeline[crossoverIndex].date) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Coût total crédit" value={formatEUR(totals.totalInterest)} sub={`${interestRatio.toFixed(1)}% du total`} tone="negative" />
        <Kpi label="Total versé à la banque" value={formatEUR(totals.totalPayments)} sub={`sur ${entries.length} échéances`} />
        <Kpi label="Capital emprunté" value={formatEUR(initialPrincipal)} />
        <Kpi label="Surcoût / capital" value={`${effectiveRate.toFixed(1)} %`} sub="intérêts / capital" />
        <Kpi
          label="Capital > Intérêts"
          value={crossDate ? new Intl.DateTimeFormat("fr-BE", { month: "short", year: "numeric" }).format(crossDate) : "—"}
          sub={crossoverIndex >= 0 ? `échéance n°${timeline[crossoverIndex].idx}` : "pas encore"}
          tone="positive"
        />
      </div>

      <Tabs defaultValue="balance" className="space-y-3">
        <TabsList>
          <TabsTrigger value="balance">Solde restant</TabsTrigger>
          <TabsTrigger value="split">Capital vs intérêts</TabsTrigger>
          <TabsTrigger value="yearly">Par année</TabsTrigger>
          <TabsTrigger value="cumulative">Cumulé</TabsTrigger>
          <TabsTrigger value="pie">Total</TabsTrigger>
        </TabsList>

        <div className="flex gap-2">
          {(["all", "5", "10"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setYearRange(r)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${yearRange === r ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            >
              {r === "all" ? "Tout" : `${r} ans`}
            </button>
          ))}
        </div>

        <TabsContent value="balance" className="rounded-xl border border-border bg-card p-5">
          <h4 className="mb-2 text-sm font-semibold">Solde restant dû</h4>
          <p className="mb-4 text-xs text-muted-foreground">Évolution du capital restant à rembourser.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredTimeline}>
                <defs>
                  <linearGradient id="gBal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatMonth} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} minTickGap={50} />
                <YAxis tickFormatter={(v) => formatEUR(Number(v), { compact: true })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} width={70} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => formatMonthLong(v as string)}
                  formatter={(v) => [formatEUR(Number(v)), "Solde"]}
                />
                <Area type="monotone" dataKey="balance" stroke="var(--chart-3)" strokeWidth={2.5} fill="url(#gBal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="split" className="rounded-xl border border-border bg-card p-5">
          <h4 className="mb-2 text-sm font-semibold">Répartition capital / intérêts par mensualité</h4>
          <p className="mb-4 text-xs text-muted-foreground">
            Au début, l'intérêt domine. Avec le temps, le capital prend le dessus.
            {crossDate && ` Point de bascule : ${formatMonthLong(crossDate.toISOString())}.`}
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filteredTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatMonth} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} minTickGap={50} />
                <YAxis tickFormatter={(v) => formatEUR(Number(v), { compact: true })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} width={70} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => formatMonthLong(v as string)}
                  formatter={(v, name) => [formatEUR(Number(v)), name === "principal" ? "Capital" : "Intérêts"]}
                />
                <Legend />
                <Area type="monotone" dataKey="interest" stackId="1" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.4} name="Intérêts" />
                <Area type="monotone" dataKey="principal" stackId="1" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.4} name="Capital" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="yearly" className="rounded-xl border border-border bg-card p-5">
          <h4 className="mb-2 text-sm font-semibold">Capital vs intérêts par année</h4>
          <p className="mb-4 text-xs text-muted-foreground">Montants remboursés chaque année civile.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickFormatter={(v) => formatEUR(Number(v), { compact: true })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} width={70} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v, name) => [formatEUR(Number(v)), name === "principal" ? "Capital" : "Intérêts"]}
                />
                <Legend />
                <Bar dataKey="interest" stackId="1" fill="var(--chart-3)" name="Intérêts" />
                <Bar dataKey="principal" stackId="1" fill="var(--chart-1)" name="Capital" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="cumulative" className="rounded-xl border border-border bg-card p-5">
          <h4 className="mb-2 text-sm font-semibold">Cumulé capital vs intérêts</h4>
          <p className="mb-4 text-xs text-muted-foreground">Total capital remboursé et total intérêts payés depuis le début.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filteredTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatMonth} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} minTickGap={50} />
                <YAxis tickFormatter={(v) => formatEUR(Number(v), { compact: true })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} width={70} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => formatMonthLong(v as string)}
                  formatter={(v, name) => [formatEUR(Number(v)), name === "cumPrincipal" ? "Capital cumulé" : "Intérêts cumulés"]}
                />
                <Legend />
                <Line type="monotone" dataKey="cumPrincipal" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} name="Capital cumulé" />
                <Line type="monotone" dataKey="cumInterest" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} name="Intérêts cumulés" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="pie" className="rounded-xl border border-border bg-card p-5">
          <h4 className="mb-2 text-sm font-semibold">Ventilation du total payé sur toute la durée</h4>
          <p className="mb-4 text-xs text-muted-foreground">
            Sur {formatEUR(totals.totalPayments)}, {formatEUR(totals.totalInterest)} ({interestRatio.toFixed(1)}%) sont des intérêts versés à la banque.
          </p>
          <div className="flex items-center gap-8">
            <div className="h-56 w-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" innerRadius={60} outerRadius={90} stroke="var(--card)" strokeWidth={2} paddingAngle={2}>
                    {pieData.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => [formatEUR(Number(v)), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-1 flex-col gap-4">
              {pieData.map((s) => {
                const pct = totals.totalPayments > 0 ? (s.value / totals.totalPayments) * 100 : 0;
                return (
                  <li key={s.name}>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded" style={{ backgroundColor: s.color }} />
                        <span className="font-medium">{s.name}</span>
                      </div>
                      <span className="numeric font-semibold">{formatEUR(s.value)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{pct.toFixed(1)}% du total versé</div>
                  </li>
                );
              })}
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatMonth(v: string) {
  return new Intl.DateTimeFormat("fr-BE", { month: "short", year: "2-digit" }).format(new Date(v));
}

function formatMonthLong(v: string) {
  return new Intl.DateTimeFormat("fr-BE", { month: "long", year: "numeric" }).format(new Date(v));
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "positive" | "negative" }) {
  const cls = tone === "positive" ? "text-[var(--color-success)]" : tone === "negative" ? "text-destructive" : "";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`numeric mt-1 text-base font-semibold ${cls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
