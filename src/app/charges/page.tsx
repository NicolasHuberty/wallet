import { PageHeader } from "@/components/page-header";
import { getPrimaryHousehold, getCharges, getProperties } from "@/lib/queries";
import { formatEUR, formatDateFR } from "@/lib/format";
import {
  chargeCategoryLabel,
  chargeCategoryColor,
  resolveCategoryLabel,
  resolveCategoryColor,
} from "@/lib/labels";
import { ChargeDialog, EditChargeButton } from "./charge-dialog";
import { Badge } from "@/components/ui/badge";
import { MonthlyBars, CategoryDonut } from "./charts";
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { aggregateByCategoryMonth, detectAnomalies, type Anomaly } from "@/lib/anomaly";
import { AnomalyBadge } from "@/components/anomaly-badge";

export default async function ChargesPage() {
  const h = await getPrimaryHousehold();
  const charges = await getCharges(h.id);
  const props = await getProperties(h.id);
  const propertyOptions = props.map((p) => ({ id: p.property.id, name: p.account.name }));
  const propertyById = Object.fromEntries(propertyOptions.map((p) => [p.id, p]));

  const sorted = [...charges].sort(
    (a, b) => (b.date as unknown as Date).getTime() - (a.date as unknown as Date).getTime()
  );

  const total = charges.reduce((s, c) => s + c.amount, 0);
  const thisYear = new Date().getFullYear();
  const ytd = charges
    .filter((c) => (c.date as unknown as Date).getFullYear() === thisYear)
    .reduce((s, c) => s + c.amount, 0);

  // Monthly aggregation over the last 24 months
  const now = new Date();
  const monthlyMap = new Map<string, number>();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, 0);
  }
  for (const c of charges) {
    const d = c.date as unknown as Date;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(key)) {
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + c.amount);
    }
  }
  const monthlyData = Array.from(monthlyMap.entries()).map(([month, amount]) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return {
      month,
      label: d.toLocaleDateString("fr-BE", { month: "short", year: "2-digit" }),
      amount: Math.round(amount),
    };
  });

  // Rolling average per month (over the last 24 months with data)
  const monthsWithData = monthlyData.filter((m) => m.amount > 0).length;
  const monthlyAvg = monthsWithData > 0 ? total / Math.max(1, monthsWithData) : 0;

  // By category
  const byCat = new Map<string, number>();
  for (const c of charges) {
    byCat.set(c.category, (byCat.get(c.category) ?? 0) + c.amount);
  }
  const donutData = Array.from(byCat.entries())
    .map(([cat, amount]) => ({
      name: resolveCategoryLabel(cat, chargeCategoryLabel),
      value: amount,
      color: resolveCategoryColor(cat, chargeCategoryColor),
    }))
    .sort((a, b) => b.value - a.value);

  // Top 10 most expensive single charges
  const topExpensive = [...charges].sort((a, b) => b.amount - a.amount).slice(0, 10);

  // Detect recurring labels (yearly-ish)
  type Occ = { date: Date; amount: number };
  const occurrences = new Map<string, Occ[]>();
  for (const c of charges) {
    const key = c.label.trim().toLowerCase();
    const arr = occurrences.get(key) ?? [];
    arr.push({ date: c.date as unknown as Date, amount: c.amount });
    occurrences.set(key, arr);
  }

  type Recurring = {
    label: string;
    count: number;
    total: number;
    avg: number;
    last: Date;
    avgGapMonths: number;
    isYearly: boolean;
  };

  const recurring: Recurring[] = [];
  for (const [key, list] of occurrences) {
    if (list.length < 2) continue;
    const sortedList = [...list].sort((a, b) => a.date.getTime() - b.date.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sortedList.length; i++) {
      const a = sortedList[i - 1].date;
      const b = sortedList[i].date;
      const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
      gaps.push(months);
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const isYearly = avgGap >= 9 && avgGap <= 15;
    const sum = list.reduce((s, o) => s + o.amount, 0);
    // Find the original label (first one with that key)
    const label = charges.find((c) => c.label.trim().toLowerCase() === key)?.label ?? key;
    recurring.push({
      label,
      count: list.length,
      total: sum,
      avg: sum / list.length,
      last: sortedList[sortedList.length - 1].date,
      avgGapMonths: avgGap,
      isYearly,
    });
  }
  recurring.sort((a, b) => b.count - a.count || b.total - a.total);
  const yearlyRecurring = recurring.filter((r) => r.isYearly);
  const mostRecurrent = recurring.slice(0, 6);

  // Anomaly detection (rolling 6-month average per category, >20% threshold)
  const history = aggregateByCategoryMonth(
    charges.map((c) => ({
      date: c.date as unknown as Date,
      category: c.category,
      amount: c.amount,
    })),
  );
  const anomalies = detectAnomalies(history, 0.2, 6);

  // Build a lookup keyed by "category::YYYY-MM" for fast per-row flagging
  const anomalyByKey = new Map<string, Anomaly>();
  for (const a of anomalies) anomalyByKey.set(`${a.category}::${a.month}`, a);

  // Anomalies of the current month (highlighted at the top)
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthAnomalies = anomalies.filter((a) => a.month === currentMonthKey);
  const recentAnomalies = anomalies.slice(0, 6);

  const monthKeyToLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("fr-BE", {
      month: "short",
      year: "2-digit",
    });
  };

  return (
    <>
      <PageHeader
        title="Frais one-shot"
        subtitle="Notaire, droits, travaux, taxes exceptionnelles — analyse historique et récurrence"
        action={<ChargeDialog householdId={h.id} properties={propertyOptions} />}
      />
      <div className="space-y-6 p-4 md:p-8">
        {/* Anomaly band */}
        <AnomalySection
          currentMonthAnomalies={currentMonthAnomalies}
          recentAnomalies={recentAnomalies}
          monthKeyToLabel={monthKeyToLabel}
        />

        {/* KPI band — dense 2-col on narrow, 5-col on wide. */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-5">
          <Kpi label={`${thisYear}`} value={formatEUR(ytd)} sub="YTD" />
          <Kpi label="Total (toutes années)" value={formatEUR(total)} sub={`${charges.length} entrée${charges.length > 1 ? "s" : ""}`} />
          <Kpi label="Moyenne / mois" value={formatEUR(monthlyAvg)} sub={`sur ${monthsWithData} mois actifs`} />
          <Kpi
            label="Plus cher"
            value={topExpensive[0] ? formatEUR(topExpensive[0].amount) : "—"}
            sub={topExpensive[0]?.label}
          />
          <Kpi
            label="Récurrents annuels"
            value={yearlyRecurring.length.toString()}
            sub={yearlyRecurring.length > 0 ? yearlyRecurring[0].label : "aucun détecté"}
          />
        </section>

        {/* Charts */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="rounded-xl border border-border bg-card p-4 md:p-5 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 md:mb-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Frais par mois</h2>
                <p className="text-xs text-muted-foreground">24 derniers mois</p>
              </div>
              <span className="text-[11px] text-muted-foreground md:text-xs">
                Max :{" "}
                <span className="tabular-nums">
                  {formatEUR(Math.max(...monthlyData.map((d) => d.amount), 0), { compact: true })}
                </span>
              </span>
            </div>
            <MonthlyBars data={monthlyData} />
          </div>

          <div className="rounded-xl border border-border bg-card p-4 md:p-5 lg:col-span-2">
            <h2 className="mb-3 text-base font-semibold md:mb-4">Par catégorie</h2>
            <CategoryDonut data={donutData} />
            <ul className="mt-4 max-h-40 space-y-1.5 overflow-y-auto text-xs">
              {donutData.map((d) => {
                const pct = total > 0 ? (d.value / total) * 100 : 0;
                return (
                  <li key={d.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate">
                      <span className="size-2 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </span>
                    <span className="numeric shrink-0 text-muted-foreground">
                      {formatEUR(d.value)} · {pct.toFixed(0)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Recurring + Top expensive */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 md:px-5">
              <div className="flex items-center gap-2">
                <RefreshCw className="size-3.5 text-muted-foreground" />
                <h2 className="text-base font-semibold">Les plus récurrents</h2>
              </div>
              <span className="hidden text-xs text-muted-foreground md:inline">
                par occurrences
              </span>
            </div>
            {mostRecurrent.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Aucune récurrence détectée (moins de 2 occurrences par libellé).
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {mostRecurrent.map((r) => (
                  <li
                    key={r.label}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm md:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{r.label}</span>
                        {r.isYearly && (
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[9px] uppercase tracking-wider text-[var(--moss-deep,theme(colors.emerald.700))]"
                          >
                            Annuel
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {r.count} occ · ~{r.avgGapMonths.toFixed(1)} mois · moy. {formatEUR(r.avg)}
                      </div>
                    </div>
                    <div className="numeric shrink-0 text-sm font-medium tabular-nums">
                      {formatEUR(r.total)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 md:px-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-3.5 text-muted-foreground" />
                <h2 className="text-base font-semibold">Top 10 — plus chers</h2>
              </div>
            </div>
            {topExpensive.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Aucun frais enregistré.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {topExpensive.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm md:px-5">
                    <span className="mono w-5 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: resolveCategoryColor(c.category, chargeCategoryColor),
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.label}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatDateFR(c.date as unknown as Date)} ·{" "}
                        {resolveCategoryLabel(c.category, chargeCategoryLabel)}
                      </div>
                    </div>
                    <div className="numeric shrink-0 text-sm font-medium tabular-nums text-destructive">
                      -{formatEUR(c.amount)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Yearly recurring — hero list if any */}
        {yearlyRecurring.length > 0 && (
          <section className="rounded-xl border border-dashed border-[var(--color-success)]/40 bg-[color:oklch(0.96_0.03_150_/_0.4)] p-5">
            <div className="mb-3 flex items-center gap-2">
              <RefreshCw className="size-4 text-[var(--color-success)]" />
              <h2 className="text-base font-semibold">Dépenses annuelles détectées</h2>
              <span className="text-xs text-muted-foreground">
                ~12 mois entre chaque — à anticiper
              </span>
            </div>
            <ul className="grid gap-2 md:grid-cols-2">
              {yearlyRecurring.map((r) => {
                const nextDate = new Date(r.last);
                nextDate.setMonth(nextDate.getMonth() + Math.round(r.avgGapMonths));
                return (
                  <li
                    key={r.label}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.count} fois · prochaine ~{formatDateFR(nextDate)}
                      </div>
                    </div>
                    <div className="numeric tabular-nums text-sm font-medium">
                      {formatEUR(r.avg)}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Full timeline */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-4 md:p-5">
            <div>
              <h2 className="text-base font-semibold">Tous les frais</h2>
              <p className="text-xs text-muted-foreground">
                Ordre chronologique descendant · {charges.length} entrée
                {charges.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <ul className="divide-y divide-border">
            {sorted.length === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground md:p-12">
                Aucun frais. Ajoute ton premier frais one-shot.
              </li>
            )}
            {sorted.map((c) => {
              const d = c.date as unknown as Date;
              const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              const anomaly = anomalyByKey.get(`${c.category}::${monthKey}`);
              const isFlagged = Boolean(anomaly);
              return (
              <li
                key={c.id}
                className={`flex items-start gap-3 px-4 py-3 text-sm md:gap-4 md:px-5 ${isFlagged ? "bg-[color:oklch(0.97_0.05_60_/_0.35)]" : ""}`}
              >
                <div
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: resolveCategoryColor(c.category, chargeCategoryColor),
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                    <span className="truncate font-medium">{c.label}</span>
                    {!c.includeInCostBasis && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Hors coût
                      </Badge>
                    )}
                    {anomaly && (
                      <AnomalyBadge
                        deviation={anomaly.deviation}
                        expected={anomaly.expected}
                        total={anomaly.total}
                        categoryLabel={resolveCategoryLabel(c.category, chargeCategoryLabel)}
                        monthLabel={monthKeyToLabel(monthKey)}
                      />
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground md:gap-2 md:text-xs">
                    <span className="tabular-nums">{formatDateFR(d)}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {resolveCategoryLabel(c.category, chargeCategoryLabel)}
                    </Badge>
                    {c.propertyId && propertyById[c.propertyId] && (
                      <span className="truncate">🏠 {propertyById[c.propertyId].name}</span>
                    )}
                  </div>
                  {c.notes && (
                    <div className="mt-1 text-[11px] text-muted-foreground md:text-xs">
                      {c.notes}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1 md:gap-2">
                  <div className="numeric font-medium tabular-nums">{formatEUR(c.amount)}</div>
                  <EditChargeButton
                    householdId={h.id}
                    properties={propertyOptions}
                    charge={{
                      id: c.id,
                      date: (c.date as unknown as Date).toISOString().slice(0, 10),
                      label: c.label,
                      category: c.category,
                      amount: c.amount,
                      accountId: c.accountId,
                      propertyId: c.propertyId,
                      includeInCostBasis: c.includeInCostBasis,
                      notes: c.notes,
                    }}
                  />
                </div>
              </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 md:p-5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:text-[11px]">
        {label}
      </div>
      <div className="numeric mt-1 text-base font-semibold tabular-nums md:mt-1.5 md:text-xl">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground md:mt-1 md:text-[11px]">
          {sub}
        </div>
      )}
    </div>
  );
}

function AnomalySection({
  currentMonthAnomalies,
  recentAnomalies,
  monthKeyToLabel,
}: {
  currentMonthAnomalies: Anomaly[];
  recentAnomalies: Anomaly[];
  monthKeyToLabel: (key: string) => string;
}) {
  // Nothing flagged overall → neutral banner, reassuring copy.
  if (currentMonthAnomalies.length === 0 && recentAnomalies.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-3 text-sm">
          <TrendingUp className="size-4 text-[var(--color-success,theme(colors.emerald.600))]" />
          <div>
            <div className="font-medium">Aucune anomalie</div>
            <div className="text-xs text-muted-foreground">
              Tes dépenses suivent tes habitudes — rien d&apos;inhabituel ce mois-ci.
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Show up to 6 most deviant recent anomalies; prioritise current-month ones.
  const highlighted =
    currentMonthAnomalies.length > 0 ? currentMonthAnomalies.slice(0, 6) : recentAnomalies;
  const title =
    currentMonthAnomalies.length > 0
      ? "Anomalies détectées ce mois-ci"
      : "Anomalies détectées récemment";
  const subtitle =
    currentMonthAnomalies.length > 0
      ? "Catégories dont le total dévie de plus de 20% de la moyenne 6 mois."
      : "Aucune anomalie ce mois-ci — voici les derniers écarts détectés.";

  return (
    <section className="rounded-xl border border-dashed border-[var(--color-warning,theme(colors.amber.400))]/60 bg-[color:oklch(0.97_0.05_80_/_0.4)] p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-[var(--color-warning,theme(colors.amber.600))]" />
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="hidden text-xs text-muted-foreground md:inline">{subtitle}</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {highlighted.map((a) => {
          const infinite = !Number.isFinite(a.deviation);
          const Icon = infinite ? AlertTriangle : a.deviation > 0 ? TrendingUp : TrendingDown;
          const tone = infinite
            ? "text-[var(--color-warning,theme(colors.amber.700))]"
            : a.deviation > 0
              ? "text-destructive"
              : "text-[var(--color-success,theme(colors.emerald.700))]";
          const categoryLabel = resolveCategoryLabel(a.category, chargeCategoryLabel);
          const pct = infinite
            ? "nouveau"
            : `${a.deviation > 0 ? "+" : ""}${Math.round(a.deviation * 100)}%`;
          return (
            <li
              key={`${a.category}-${a.month}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Icon className={`size-3.5 ${tone}`} />
                  <span className="truncate font-medium">{categoryLabel}</span>
                  <span className={`numeric text-[11px] font-semibold tabular-nums ${tone}`}>
                    {pct}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {monthKeyToLabel(a.month)} · observé{" "}
                  <span className="tabular-nums">{formatEUR(a.total)}</span>
                  {Number.isFinite(a.deviation) && (
                    <>
                      {" "}
                      vs <span className="tabular-nums">{formatEUR(a.expected)}</span> attendu
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
