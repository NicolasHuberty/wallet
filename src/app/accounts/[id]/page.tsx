import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import {
  getAccount,
  getAccountSnapshots,
  getAccountCashflows,
  getHoldings,
} from "@/lib/queries";
import { buildPerfReport, type PerfCashflow } from "@/lib/performance";
import {
  valueAndDepositsSeries,
  drawdownSeries,
  allocationByTicker,
  cashflowsByMonth,
  holdingPerf,
} from "@/lib/charts-data";
import { InvestmentPerfPanel } from "./perf-panel";
import { CashflowList } from "./cashflow-list";
import { BankAnalyticsPanel } from "./bank-analytics-panel";
import { TransactionTable } from "./transaction-table";
import { OnboardingReviewBanner } from "./onboarding-review";
import { ValueVsDepositsChart } from "./value-vs-deposits-chart";
import { AllocationDonut } from "./allocation-donut";
import { CashflowBars } from "./cashflow-bars";
import { HoldingsPerf } from "./holdings-perf";
import { DrawdownChart } from "./drawdown-chart";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { formatEUR, formatDateFR } from "@/lib/format";
import { accountKindLabel, accountKindColor, isLiability } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AccountPerfChart } from "./perf-chart";
import {
  DCASettingsEditor,
  AddHistoryPointForm,
  DeleteHistoryButton,
} from "./edit-controls";
import { RevolutImportDialog } from "../../investments/revolut-import-dialog";
import { toDate } from "@/lib/utils";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acc = await getAccount(id);
  if (!acc) notFound();

  const snaps = await getAccountSnapshots(acc.id);
  const holdings = await getHoldings(acc.id);
  const isInvestmentLike =
    acc.kind === "brokerage" || acc.kind === "retirement" || acc.kind === "crypto";
  const isCashLike = acc.kind === "cash" || acc.kind === "savings";
  const cashflows = isInvestmentLike || isCashLike ? await getAccountCashflows(acc.id) : [];
  const isBankSynced = isCashLike && cashflows.length > 0;
  // All other household accounts — used by the transaction editor to let
  // the user mark a transaction as an internal transfer to another of
  // their accounts (eg. money moved into a savings account).
  const householdAccounts = isBankSynced
    ? (await db
        .select({ id: schema.account.id, name: schema.account.name, kind: schema.account.kind })
        .from(schema.account)
        .where(eq(schema.account.householdId, acc.householdId))).filter((a) => a.id !== acc.id)
    : [];
  const perfSnaps = snaps.map((s) => ({ date: toDate(s.date), value: s.value }));
  const perfCfs = cashflows.map((c) => ({
    date: toDate(c.date),
    amount: c.amount,
    kind: c.kind as PerfCashflow["kind"],
  }));
  const perfReport = isInvestmentLike
    ? buildPerfReport(perfSnaps, perfCfs, acc.currentValue)
    : null;
  const valueDepositsData = isInvestmentLike
    ? valueAndDepositsSeries(perfSnaps, perfCfs)
    : [];
  const drawdownData = isInvestmentLike ? drawdownSeries(perfSnaps) : [];
  const allocationData = isInvestmentLike
    ? allocationByTicker(
        holdings.map((h) => ({
          ticker: h.ticker,
          name: h.name ?? null,
          quantity: h.quantity,
          currentPrice: h.currentPrice,
          avgCost: h.avgCost,
        })),
        acc.currentValue,
      )
    : [];
  const cashflowMonths = isInvestmentLike ? cashflowsByMonth(perfCfs) : [];
  const holdingsPerfRows = isInvestmentLike
    ? holdingPerf(
        holdings.map((h) => ({
          ticker: h.ticker,
          quantity: h.quantity,
          avgCost: h.avgCost,
          currentPrice: h.currentPrice,
        })),
      )
    : [];

  // Property appreciation rate if applicable
  let appreciationPct: number | null = null;
  if (acc.kind === "real_estate") {
    const [prop] = await db
      .select()
      .from(schema.property)
      .where(eq(schema.property.accountId, acc.id));
    if (prop) appreciationPct = prop.annualAppreciationPct;
  }

  // Active mortgage if applicable
  let activeMortgage: { monthlyPayment: number; remainingBalance: number; interestRatePct: number; termMonths: number } | null = null;
  if (acc.kind === "loan") {
    const [m] = await db.select().from(schema.mortgage).where(eq(schema.mortgage.accountId, acc.id));
    if (m) {
      activeMortgage = {
        monthlyPayment: m.monthlyPayment,
        remainingBalance: m.remainingBalance,
        interestRatePct: m.interestRatePct,
        termMonths: m.termMonths,
      };
    }
  }

  const series = snaps.map((s) => ({
    date: toDate(s.date).toISOString(),
    value: s.value,
  }));

  // Compute performance metrics
  const current = acc.currentValue;
  const first = series[0]?.value ?? current;
  const firstDate = series[0]?.date;
  const priorYear = series
    .slice()
    .reverse()
    .find((s) => {
      const d = new Date(s.date);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      return d <= cutoff;
    });
  const yoyDelta = priorYear ? current - priorYear.value : null;
  const yoyPct = priorYear && priorYear.value !== 0 ? (yoyDelta! / Math.abs(priorYear.value)) * 100 : null;

  // YTD
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const ytdPoint = series.find((s) => new Date(s.date) >= yearStart) ?? series[0];
  const ytdDelta = ytdPoint ? current - ytdPoint.value : null;
  const ytdPct = ytdPoint && ytdPoint.value !== 0 ? (ytdDelta! / Math.abs(ytdPoint.value)) * 100 : null;

  // CAGR
  let cagr: number | null = null;
  if (firstDate && first !== 0) {
    const years = Math.max(
      0.01,
      (Date.now() - new Date(firstDate).getTime()) / (365.25 * 24 * 3600 * 1000)
    );
    if (years > 0.1 && first > 0 && current > 0) {
      cagr = (Math.pow(current / first, 1 / years) - 1) * 100;
    }
  }

  const totalVariation = current - first;

  const supportsRevolutImport =
    acc.kind === "savings" ||
    acc.kind === "cash" ||
    acc.kind === "brokerage" ||
    acc.kind === "retirement" ||
    acc.kind === "crypto";

  return (
    <>
      <PageHeader
        title={acc.name}
        subtitle={
          <span className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: accountKindColor[acc.kind] }}
            />
            {accountKindLabel[acc.kind]}
            {acc.institution && <span>· {acc.institution}</span>}
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            {supportsRevolutImport && (
              <RevolutImportDialog
                accounts={[{ id: acc.id, name: acc.name, kind: acc.kind }]}
                defaultAccountId={acc.id}
              />
            )}
            <Link href="/accounts">
              <Button variant="outline" size="sm">
                <ArrowLeft className="size-4" /> Retour
              </Button>
            </Link>
          </div>
        }
      />
      <div className="space-y-6 p-4 md:p-8">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <Kpi
            label="Valeur actuelle"
            value={formatEUR(current)}
            negative={isLiability(acc.kind) || current < 0}
          />
          <Kpi
            label="Variation YTD"
            value={ytdDelta != null ? formatEUR(ytdDelta, { signed: true }) : "—"}
            hint={ytdPct != null ? `${ytdPct >= 0 ? "+" : ""}${ytdPct.toFixed(1)} %` : undefined}
            positive={ytdDelta != null && ytdDelta > 0}
            negative={ytdDelta != null && ytdDelta < 0}
          />
          <Kpi
            label="Variation 1 an"
            value={yoyDelta != null ? formatEUR(yoyDelta, { signed: true }) : "—"}
            hint={yoyPct != null ? `${yoyPct >= 0 ? "+" : ""}${yoyPct.toFixed(1)} %` : undefined}
            positive={yoyDelta != null && yoyDelta > 0}
            negative={yoyDelta != null && yoyDelta < 0}
          />
          {isInvestmentLike ? (
            <Kpi
              label="Croissance brute"
              value={cagr != null ? `${cagr >= 0 ? "+" : ""}${cagr.toFixed(2)} %` : "—"}
              hint="ne tient pas compte des dépôts — voir TWR/XIRR"
            />
          ) : (
            <Kpi
              label="CAGR"
              value={cagr != null ? `${cagr >= 0 ? "+" : ""}${cagr.toFixed(2)} %` : "—"}
              hint={firstDate ? `depuis ${formatDateFR(firstDate)}` : undefined}
              positive={cagr != null && cagr > 0}
              negative={cagr != null && cagr < 0}
            />
          )}
        </section>

        {perfReport && (
          <InvestmentPerfPanel
            report={perfReport}
            annualYieldPct={acc.annualYieldPct}
            cashflowCount={cashflows.length}
          />
        )}

        {isBankSynced && (
          <OnboardingReviewBanner
            householdAccounts={householdAccounts}
            rows={cashflows.map((c) => ({
              id: c.id,
              date: c.date as unknown as Date,
              amount: c.amount,
              notes: c.notes,
              category: c.category,
              categorySource: c.categorySource,
              bceEnterpriseNumber: c.bceEnterpriseNumber,
              transferToAccountId: c.transferToAccountId,
            }))}
          />
        )}

        {isBankSynced && (
          <BankAnalyticsPanel
            accountId={acc.id}
            rows={cashflows.map((c) => ({
              id: c.id,
              date: c.date as unknown as Date,
              amount: c.amount,
              notes: c.notes,
              ticker: c.ticker,
              kind: c.kind as never,
              category: c.category as never,
              categorySource: c.categorySource,
            }))}
          />
        )}

        {isInvestmentLike ? (
          <>
            {/* Hero chart — value vs cumulative net deposits + plus-value */}
            <section className="rounded-xl border border-border bg-card p-4 md:p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 md:mb-4">
                <div>
                  <h2 className="text-base font-semibold">Valeur du compte vs dépôts cumulés</h2>
                  <p className="text-xs text-muted-foreground">
                    L&apos;écart entre les deux courbes = ta plus-value latente. La zone verte la
                    visualise.
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {valueDepositsData.length} point{valueDepositsData.length > 1 ? "s" : ""}
                </div>
              </div>
              <ValueVsDepositsChart data={valueDepositsData} />
            </section>

            {/* 2-col: allocation donut | cashflows by month */}
            <section className="grid gap-4 md:grid-cols-2">
              <Panel title="Allocation actuelle" subtitle="par ticker — positions détenues">
                <AllocationDonut slices={allocationData} />
              </Panel>
              <Panel title="Mouvements mensuels" subtitle="dépôts / retraits / dividendes / frais">
                <CashflowBars data={cashflowMonths} />
              </Panel>
            </section>

            {/* 2-col: drawdown | per-holding perf */}
            <section className="grid gap-4 md:grid-cols-2">
              <Panel title="Drawdown" subtitle="% sous le pic historique">
                <DrawdownChart data={drawdownData} />
              </Panel>
              <Panel
                title="Performance par holding"
                subtitle="plus-value latente (qty × prix actuel − coût)"
              >
                <HoldingsPerf rows={holdingsPerfRows} />
              </Panel>
            </section>
          </>
        ) : (
          // Non-investment account: keep the simple value-over-time chart
          <section className="rounded-xl border border-border bg-card p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 md:mb-4">
              <h2 className="text-base font-semibold">Évolution du compte</h2>
              <div className="text-xs text-muted-foreground">
                {series.length} point{series.length > 1 ? "s" : ""} · total{" "}
                <span className="numeric tabular-nums">
                  {formatEUR(totalVariation, { signed: true })}
                </span>
              </div>
            </div>
            {series.length < 2 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                Pas encore assez de points pour tracer une courbe. Chaque mise à jour mensuelle
                enregistre un nouveau point.
              </div>
            ) : (
              <AccountPerfChart data={series} />
            )}
          </section>
        )}

        {isBankSynced && (
          <TransactionTable
            householdAccounts={householdAccounts}
            rows={cashflows.map((c) => ({
              id: c.id,
              date: c.date as unknown as Date,
              kind: c.kind,
              amount: c.amount,
              ticker: c.ticker,
              notes: c.notes,
              category: c.category,
              categorySource: c.categorySource,
              bceEnterpriseNumber: c.bceEnterpriseNumber,
              transferToAccountId: c.transferToAccountId,
              source: c.source,
            }))}
          />
        )}

        {isInvestmentLike && !isBankSynced && (
          <CashflowList
            accountId={acc.id}
            rows={cashflows.map((c) => ({
              id: c.id,
              date: c.date as unknown as Date,
              kind: c.kind,
              amount: c.amount,
              ticker: c.ticker,
              notes: c.notes,
              source: c.source,
            }))}
          />
        )}

        {holdings.length > 0 && (
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 md:px-5">
              <h2 className="text-base font-semibold">ETF du wallet</h2>
              <p className="text-xs text-muted-foreground">
                Allocation et valeurs estimées sur {formatEUR(current)}.
              </p>
            </div>
            {/* Desktop table */}
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 text-left font-medium">Ticker / ISIN</th>
                  <th className="px-3 py-2 text-left font-medium">Nom</th>
                  <th className="px-3 py-2 text-right font-medium">Allocation</th>
                  <th className="px-5 py-2 text-right font-medium">Valeur estimée</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const pct = h.allocationPct ?? 0;
                  const v = (current * pct) / 100;
                  return (
                    <tr key={h.id} className="border-b border-border/60 last:border-none">
                      <td className="px-5 py-2">
                        <div className="font-mono font-medium">{h.ticker}</div>
                        {h.isin && (
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {h.isin}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {h.name ?? "—"}
                      </td>
                      <td className="numeric px-3 py-2 text-right tabular-nums">
                        {pct.toFixed(1)} %
                      </td>
                      <td className="numeric px-5 py-2 text-right font-medium tabular-nums">
                        {formatEUR(v)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Mobile: stacked cards */}
            <ul className="divide-y divide-border md:hidden">
              {holdings.map((h) => {
                const pct = h.allocationPct ?? 0;
                const v = (current * pct) / 100;
                return (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs font-medium">{h.ticker}</div>
                      {h.name && (
                        <div className="truncate text-[11px] text-muted-foreground">{h.name}</div>
                      )}
                      {h.isin && (
                        <div className="truncate font-mono text-[10px] text-muted-foreground">
                          {h.isin}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="numeric text-sm font-semibold tabular-nums">
                        {formatEUR(v)}
                      </div>
                      <div className="numeric text-[11px] tabular-nums text-muted-foreground">
                        {pct.toFixed(1)} %
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          <Panel title="Paramètres DCA">
            <DCASettingsEditor
              accountId={acc.id}
              annualYieldPct={acc.annualYieldPct}
              monthlyContribution={acc.monthlyContribution}
              canYield={
                acc.kind === "savings" ||
                acc.kind === "cash" ||
                acc.kind === "brokerage" ||
                acc.kind === "retirement" ||
                acc.kind === "crypto"
              }
              canContribute={
                acc.kind === "savings" ||
                acc.kind === "cash" ||
                acc.kind === "brokerage" ||
                acc.kind === "retirement"
              }
            />
            {(appreciationPct != null || activeMortgage) && (
              <div className="mt-2 border-t border-border/60 pt-2">
                <dl className="divide-y divide-border/60 text-sm">
                  {appreciationPct != null && (
                    <Row label="Appréciation annuelle" value={`${appreciationPct} %`} />
                  )}
                  {activeMortgage && (
                    <>
                      <Row label="Mensualité" value={formatEUR(activeMortgage.monthlyPayment)} />
                      <Row label="Taux" value={`${activeMortgage.interestRatePct} %`} />
                      <Row
                        label="Solde restant"
                        value={formatEUR(activeMortgage.remainingBalance)}
                      />
                    </>
                  )}
                </dl>
              </div>
            )}
          </Panel>

          <Panel title="Historique des mises à jour">
            <div className="mb-2">
              <AddHistoryPointForm accountId={acc.id} />
            </div>
            {snaps.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Aucun point d&apos;historique encore. Ajoute-en manuellement ci-dessus ou utilise
                la mise à jour mensuelle.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {/* Desktop table */}
                <table className="hidden w-full text-xs md:table">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-2 py-2 text-left font-medium">Date</th>
                      <th className="px-2 py-2 text-right font-medium">Valeur</th>
                      <th className="px-2 py-2 text-right font-medium">Δ</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {snaps.slice().reverse().map((s, i, arr) => {
                      const prev = arr[i + 1];
                      const delta = prev ? s.value - prev.value : 0;
                      const sign =
                        delta > 0
                          ? "text-[var(--color-success)]"
                          : delta < 0
                            ? "text-destructive"
                            : "text-muted-foreground";
                      return (
                        <tr key={s.id} className="border-b border-border/40 last:border-none">
                          <td className="px-2 py-1.5">{formatDateFR(toDate(s.date))}</td>
                          <td className="numeric px-2 py-1.5 text-right tabular-nums">
                            {formatEUR(s.value)}
                          </td>
                          <td className={`numeric px-2 py-1.5 text-right tabular-nums ${sign}`}>
                            {prev ? formatEUR(delta, { signed: true }) : "—"}
                          </td>
                          <td className="px-1 py-1.5 text-right">
                            <DeleteHistoryButton
                              id={s.id}
                              accountId={acc.id}
                              date={toDate(s.date).toISOString()}
                              value={s.value}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Mobile stacked list */}
                <ul className="divide-y divide-border/40 md:hidden">
                  {snaps
                    .slice()
                    .reverse()
                    .map((s, i, arr) => {
                      const prev = arr[i + 1];
                      const delta = prev ? s.value - prev.value : 0;
                      const sign =
                        delta > 0
                          ? "text-[var(--color-success)]"
                          : delta < 0
                            ? "text-destructive"
                            : "text-muted-foreground";
                      return (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-3 py-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium">
                              {formatDateFR(toDate(s.date))}
                            </div>
                            {prev && (
                              <div className={`numeric text-[10px] tabular-nums ${sign}`}>
                                {formatEUR(delta, { signed: true })}
                              </div>
                            )}
                          </div>
                          <div className="numeric shrink-0 text-sm font-medium tabular-nums">
                            {formatEUR(s.value)}
                          </div>
                          <DeleteHistoryButton
                            id={s.id}
                            accountId={acc.id}
                            date={toDate(s.date).toISOString()}
                            value={s.value}
                          />
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </Panel>
        </section>
      </div>
    </>
  );
}

function Kpi({
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
    <div className="rounded-xl border border-border bg-card p-3 md:p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:text-[11px]">
        {label}
      </div>
      <div
        className={`numeric mt-1 text-base font-semibold tabular-nums md:mt-1.5 md:text-lg ${tone}`}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-muted-foreground md:text-[11px]">{hint}</div>
      )}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="numeric text-sm font-medium">{value}</dd>
    </div>
  );
}
