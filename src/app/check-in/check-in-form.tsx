"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  saveMonthlyCheckIn,
  updateExpenseNote,
  updateIncomeNote,
  updateChargeNote,
  updateAccountDCA,
  updateOneOffIncomeNote,
  removeCharge,
  removeOneOffIncome,
} from "./actions";
import { NotesPopover, InlineNote } from "./notes-popover";
import { QuickAddExpense, QuickAddCharge, QuickAddIncome } from "./quick-forms";
import { formatEUR, formatDateFR } from "@/lib/format";
import {
  accountKindLabel,
  accountKindColor,
  isLiability,
  expenseCategoryLabel,
  chargeCategoryLabel,
  oneOffIncomeCategoryLabel,
} from "@/lib/labels";
import type { AccountKind } from "@/db/schema";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Save,
  Sparkles,
  Receipt,
  Wallet,
  PiggyBank,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  RotateCcw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { AccountPrefill } from "@/lib/checkin-prefill";

type AccountRow = {
  id: string;
  name: string;
  kind: AccountKind;
  institution: string | null;
  currentValue: number;
  annualYieldPct: number | null;
  monthlyContribution: number | null;
  annualAppreciationPct: number | null;
  /** Pre-computed starting values + estimation for the selected month. */
  prefill: AccountPrefill;
};

type MortgageRow = {
  mortgageId: string;
  accountId: string;
  accountName: string;
  remainingBalance: number;
  monthlyPayment: number;
  interestRatePct: number;
};

type AmortEntry = { dueDate: string; principal: number; interest: number; balance: number };

type CashflowSummary = {
  totalIncome: number;
  totalExpense: number;
  totalManualExpense: number;
  totalMortgage: number;
  net: number;
};

// State per account (values used for live totals)
type RowInput = {
  growth: number;
  contribution: number;
};

// State per mortgage
type MortgageInput = {
  principal: number;
  interest: number;
};

function sameMonth(aIso: string, bIso: string) {
  return aIso.slice(0, 7) === bIso.slice(0, 7);
}

function pickAmortEntry(entries: AmortEntry[], date: string): AmortEntry | null {
  if (!entries || entries.length === 0) return null;
  const exact = entries.find((e) => sameMonth(e.dueDate, date));
  if (exact) return exact;
  // Fall back to the next future entry
  const future = entries.find((e) => e.dueDate >= date);
  return future ?? entries[entries.length - 1];
}

type ExpenseItem = {
  id: string;
  label: string;
  category: string;
  baseline: number;
  average: number;
  previous: number;
  current: number;
  notes: string | null;
  historyCount: number;
};

type ChargeTemplate = {
  id: string;
  label: string;
  category: string;
  defaultAmount: number | null;
  notes: string | null;
};

type PreviousMonthCharge = {
  id: string;
  date: string;
  label: string;
  category: string;
  amount: number;
};
type IncomeItem = {
  id: string;
  label: string;
  category: string;
  amount: number;
  notes: string | null;
};
type ChargeItem = {
  id: string;
  date: string;
  label: string;
  category: string;
  amount: number;
  notes: string | null;
};

export function CheckInForm({
  householdId,
  selectedMonth,
  accounts,
  mortgages,
  amortByMortgage,
  cashflow,
  lastCheckInDate,
  monthChargesTotal,
  monthIncomesTotal,
  expenseItems,
  incomeItems,
  recentCharges,
  previousMonthCharges,
  chargeTemplates,
  recentIncomes,
  previousMonthIncomes,
  incomeTemplates,
}: {
  householdId: string;
  selectedMonth: string;
  accounts: AccountRow[];
  mortgages: MortgageRow[];
  amortByMortgage: Record<string, AmortEntry[]>;
  cashflow: CashflowSummary;
  lastCheckInDate: string | null;
  monthChargesTotal: number;
  monthIncomesTotal: number;
  expenseItems: ExpenseItem[];
  incomeItems: IncomeItem[];
  recentCharges: ChargeItem[];
  previousMonthCharges: PreviousMonthCharge[];
  chargeTemplates: ChargeTemplate[];
  recentIncomes: ChargeItem[];
  previousMonthIncomes: PreviousMonthCharge[];
  incomeTemplates: ChargeTemplate[];
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  // Parse selectedMonth for display + next/prev nav
  const [selY, selM] = selectedMonth.split("-").map(Number);
  const monthDate = new Date(selY, selM - 1, 1);
  const monthLabel = monthDate.toLocaleDateString("fr-BE", {
    month: "long",
    year: "numeric",
  });
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  function shiftMonth(delta: number) {
    const next = new Date(selY, selM - 1 + delta, 1);
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    if (key > todayKey) return;
    router.push(`/check-in?month=${key}`);
  }
  function goCurrent() {
    router.push(`/check-in?month=${todayKey}`);
  }
  function setMonthFromInput(value: string) {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    if (value > todayKey) return;
    router.push(`/check-in?month=${value}`);
  }

  const canGoNext = selectedMonth < todayKey;

  // Initial per-row state — pre-filled from `prefill` (computed server-side
  // from the previous-month snapshot plus expected DCA / amortization).
  const [rowState, setRowState] = useState<Record<string, RowInput>>(() => {
    const out: Record<string, RowInput> = {};
    for (const a of accounts) {
      out[a.id] = {
        growth: round2(a.prefill.growth),
        contribution: round2(a.prefill.contribution),
      };
    }
    return out;
  });

  // When the selected month changes the server returns a new set of accounts
  // with fresh prefills → resync local state.
  useEffect(() => {
    setRowState(() => {
      const out: Record<string, RowInput> = {};
      for (const a of accounts) {
        out[a.id] = {
          growth: round2(a.prefill.growth),
          contribution: round2(a.prefill.contribution),
        };
      }
      return out;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  // Mortgage state: pre-fill from amortization entry for the selected month
  const [mortgageState, setMortgageState] = useState<Record<string, MortgageInput>>(() => {
    const out: Record<string, MortgageInput> = {};
    for (const m of mortgages) {
      const entry = pickAmortEntry(amortByMortgage[m.mortgageId] ?? [], `${selectedMonth}-01`);
      if (entry) {
        out[m.mortgageId] = { principal: round2(entry.principal), interest: round2(entry.interest) };
      } else {
        // Fallback: estimate from interest rate
        const monthlyInterest = (m.remainingBalance * m.interestRatePct) / 100 / 12;
        const principal = Math.max(0, m.monthlyPayment - monthlyInterest);
        out[m.mortgageId] = { principal: round2(principal), interest: round2(monthlyInterest) };
      }
    }
    return out;
  });

  // Re-pick amortization entry when selected month changes (use first of month as reference)
  const firstOfMonth = `${selectedMonth}-01`;
  useEffect(() => {
    setMortgageState((prev) => {
      const out: Record<string, MortgageInput> = { ...prev };
      for (const m of mortgages) {
        const entry = pickAmortEntry(amortByMortgage[m.mortgageId] ?? [], firstOfMonth);
        if (entry) {
          out[m.mortgageId] = {
            principal: round2(entry.principal),
            interest: round2(entry.interest),
          };
        }
      }
      return out;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  function updateRow(id: string, key: keyof RowInput, value: number) {
    setRowState((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }
  /**
   * Reset the growth / contribution inputs of a single row back to the
   * server-computed estimation (previous month + expected DCA / interest).
   */
  function resetRow(id: string) {
    const a = accounts.find((acc) => acc.id === id);
    if (!a) return;
    setRowState((prev) => ({
      ...prev,
      [id]: {
        growth: round2(a.prefill.growth),
        contribution: round2(a.prefill.contribution),
      },
    }));
  }
  function updateMortgage(id: string, key: keyof MortgageInput, value: number) {
    setMortgageState((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  function previousValueFor(a: AccountRow): number {
    // Prefer the snapshot-based value; fall back to currentValue for
    // accounts with no prior history (first check-in ever).
    if (a.prefill.previousSource !== "none") return a.prefill.previousValue;
    return a.currentValue;
  }

  function newValueFor(a: AccountRow): number {
    const s = rowState[a.id];
    const base = previousValueFor(a);
    if (!s) return base;
    if (isLiability(a.kind)) {
      // Account value is negative; principal paid makes it less negative → newValue = prev + principal
      // For loan account we use contribution field as "principal paid" if amortization unavailable.
      return base + s.contribution + s.growth;
    }
    return base + s.growth + s.contribution;
  }

  function newMortgageBalance(m: MortgageRow): number {
    const s = mortgageState[m.mortgageId];
    if (!s) return m.remainingBalance;
    return Math.max(0, m.remainingBalance - s.principal);
  }

  const totals = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    for (const a of accounts) {
      const v = newValueFor(a);
      if (isLiability(a.kind) || v < 0) liabilities += Math.abs(v);
      else assets += v;
    }
    return { assets, liabilities, net: assets - liabilities };
  }, [accounts, rowState]);

  // Per-expense actual state for this month (key = expenseId)
  const [expenseThisMonth, setExpenseThisMonth] = useState<Record<string, number>>(() =>
    Object.fromEntries(expenseItems.map((e) => [e.id, round2(e.current)]))
  );
  const totalExpensesThisMonth = useMemo(
    () =>
      expenseItems.reduce((s, e) => s + (expenseThisMonth[e.id] ?? e.current), 0),
    [expenseItems, expenseThisMonth]
  );

  const totalDCA = accounts.reduce((s, a) => s + (a.monthlyContribution ?? 0), 0);
  const monthlyInterestIncome = accounts.reduce(
    (s, a) => s + (isLiability(a.kind) ? 0 : a.prefill.growth),
    0
  );
  const realSurplus = cashflow.net - totalDCA;

  const groups = useMemo(() => {
    const map = new Map<AccountKind, AccountRow[]>();
    for (const a of accounts) {
      const arr = map.get(a.kind) ?? [];
      arr.push(a);
      map.set(a.kind, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const order = Object.keys(accountKindLabel) as AccountKind[];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    });
  }, [accounts]);

  function submit() {
    start(async () => {
      try {
        await saveMonthlyCheckIn({
          householdId,
          month: selectedMonth,
          note: note || null,
          rows: accounts
            // Skip accounts created after this month — we shouldn't overwrite
            // their currentValue with a 0-based estimate.
            .filter((a) => !a.prefill.isFutureAccount)
            .map((a) => ({
              accountId: a.id,
              newValue: newValueFor(a),
            })),
          mortgageRows: mortgages.map((m) => ({
            mortgageId: m.mortgageId,
            remainingBalance: newMortgageBalance(m),
          })),
          expenseActuals: expenseItems.map((e) => ({
            expenseId: e.id,
            amount: expenseThisMonth[e.id] ?? e.current,
          })),
        });
        toast.success(`Mise à jour enregistrée · patrimoine net ${formatEUR(totals.net)}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  // Net revenu = (revenus récurrents + revenus exceptionnels) − (dépenses + frais one-shot)
  const netIncomeWithCharges =
    cashflow.totalIncome +
    monthIncomesTotal -
    totalExpensesThisMonth -
    monthChargesTotal;
  const remainsAfterDCA = netIncomeWithCharges - totalDCA;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi
          label="Revenus récurrents"
          value={formatEUR(cashflow.totalIncome)}
          positive={cashflow.totalIncome > 0}
          hint="salaires, loyers…"
        />
        <Kpi
          label="Revenus exceptionnels"
          value={formatEUR(monthIncomesTotal)}
          positive={monthIncomesTotal > 0}
          hint={`${recentIncomes.length} élément${recentIncomes.length > 1 ? "s" : ""} ce mois`}
        />
        <Kpi
          label="Dépenses (mois)"
          value={formatEUR(totalExpensesThisMonth)}
          negative
          hint={`baseline ${formatEUR(cashflow.totalExpense)}`}
        />
        <Kpi
          label="Frais one-shot"
          value={formatEUR(monthChargesTotal)}
          negative={monthChargesTotal > 0}
          hint={`${recentCharges.length} élément${recentCharges.length > 1 ? "s" : ""}`}
        />
        <Kpi
          label="Revenu net réel"
          value={formatEUR(netIncomeWithCharges)}
          positive={netIncomeWithCharges > 0}
          negative={netIncomeWithCharges < 0}
          hint="tout inclus"
        />
        <Kpi
          label="Reste à investir"
          value={formatEUR(remainsAfterDCA)}
          positive={remainsAfterDCA > 0}
          negative={remainsAfterDCA < 0}
          hint={`après ${formatEUR(totalDCA)} DCA`}
        />
      </section>


      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Mise à jour mensuelle</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3 text-[var(--chart-1)]" />
              Pré-remplissage depuis le mois précédent + DCA / intérêts / amortissement
              attendus. Ajuste si besoin — « réinitialiser » annule tes modifications.
            </p>
            {lastCheckInDate && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Dernière mise à jour :{" "}
                {new Date(lastCheckInDate).toLocaleDateString("fr-BE", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => shiftMonth(-1)}
                className="size-7"
                title="Mois précédent"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <div className="relative flex items-center gap-2 px-2">
                <CalendarDays className="size-3.5 text-muted-foreground" />
                <div className="min-w-[9rem] text-center text-sm font-semibold capitalize">
                  {monthLabel}
                </div>
                <input
                  type="month"
                  value={selectedMonth}
                  max={todayKey}
                  onChange={(e) => setMonthFromInput(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Choisir un mois"
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => shiftMonth(1)}
                className="size-7"
                title={canGoNext ? "Mois suivant" : "Mois actuel atteint"}
                disabled={!canGoNext}
              >
                <ChevronRight className="size-4" />
              </Button>
              {selectedMonth !== todayKey && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  onClick={goCurrent}
                >
                  Mois courant
                </Button>
              )}
            </div>
            <Button onClick={submit} disabled={pending}>
              <Save className="size-4" />
              {pending ? "Enregistrement…" : `Enregistrer ${monthLabel}`}
            </Button>
          </div>
        </div>

        <div className="divide-y divide-border">
          <div className="grid grid-cols-12 gap-3 border-b border-border bg-muted/30 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4">Compte</div>
            <div className="col-span-2 text-right">Avant</div>
            <div className="col-span-2 text-right">
              <span title="Taux annuel appliqué au solde">Intérêts / Croissance</span>
            </div>
            <div className="col-span-2 text-right">
              <span title="DCA ou apport manuel">Apport</span>
            </div>
            <div className="col-span-1 text-right">Après</div>
            <div className="col-span-1 text-right">Δ</div>
          </div>

          {groups.map(([kind, rows]) => {
            const subtotalOld = rows.reduce((s, a) => s + previousValueFor(a), 0);
            const subtotalNew = rows.reduce((s, a) => s + newValueFor(a), 0);
            const deltaKind = subtotalNew - subtotalOld;
            return (
              <div key={kind}>
                <div className="flex items-center justify-between px-5 py-2.5">
                  <div className="flex items-center gap-3">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: accountKindColor[kind] }}
                    />
                    <h3 className="text-sm font-semibold">{accountKindLabel[kind]}</h3>
                    <Badge variant="secondary">{rows.length}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {formatEUR(subtotalOld)} → {formatEUR(subtotalNew)}
                    </span>
                    <DeltaPill value={deltaKind} invertColors={isLiability(kind)} />
                  </div>
                </div>
                <div>
                  {rows.map((a) => {
                    const s = rowState[a.id];
                    const prev = previousValueFor(a);
                    const nv = newValueFor(a);
                    const delta = nv - prev;
                    const isRealEstate = a.kind === "real_estate";
                    const contribLabel =
                      a.kind === "loan" || a.kind === "credit_card" ? "Capital payé" : "Apport";
                    const growthLabel = isRealEstate
                      ? "Appréciation"
                      : a.kind === "loan" || a.kind === "credit_card"
                        ? ""
                        : "Intérêts";

                    const rateBadge = isRealEstate
                      ? a.annualAppreciationPct
                      : a.annualYieldPct;

                    const pf = a.prefill;
                    const disabled = pf.isFutureAccount || pf.isFullyRepaid;
                    // Detect whether the user has modified the pre-filled values.
                    const isCustomized =
                      s != null &&
                      (Math.abs((s.growth ?? 0) - pf.growth) > 0.005 ||
                        Math.abs((s.contribution ?? 0) - pf.contribution) > 0.005);
                    const prevHintLabel = pf.isFutureAccount
                      ? "Compte créé après ce mois"
                      : pf.isFullyRepaid
                        ? "Soldé"
                        : pf.isFirstMonth
                          ? "Première mise à jour"
                          : pf.previousSource === "current"
                            ? "valeur actuelle"
                            : "mois précédent";

                    return (
                      <div
                        key={a.id}
                        className={`grid grid-cols-12 items-center gap-3 border-t border-border/40 px-5 py-2 text-sm ${disabled ? "opacity-60" : ""}`}
                      >
                        <div className="col-span-4 min-w-0">
                          <div className="truncate font-medium">{a.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            {a.institution && <span>{a.institution}</span>}
                            {rateBadge != null && (
                              <Badge variant="outline" className="text-[10px]">
                                {rateBadge}%/an
                              </Badge>
                            )}
                            {a.kind !== "real_estate" &&
                              a.kind !== "loan" &&
                              a.kind !== "credit_card" && (
                                <DCAEditor
                                  accountId={a.id}
                                  currentDCA={a.monthlyContribution}
                                />
                              )}
                          </div>
                        </div>

                        <div className="col-span-2 text-right text-xs text-muted-foreground numeric">
                          <div>{formatEUR(prev)}</div>
                          <div className="text-[10px] text-muted-foreground/70">
                            {prevHintLabel}
                          </div>
                        </div>

                        <div className="col-span-2">
                          {growthLabel ? (
                            <div className="relative">
                              <Input
                                type="number"
                                step="0.01"
                                value={s?.growth ?? 0}
                                onChange={(e) =>
                                  updateRow(a.id, "growth", Number(e.target.value))
                                }
                                className="h-8 pr-6 text-right tabular-nums"
                                disabled={disabled}
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                                €
                              </span>
                            </div>
                          ) : (
                            <div className="h-8" />
                          )}
                        </div>

                        <div className="col-span-2">
                          {a.kind !== "real_estate" ? (
                            <div className="relative">
                              <Input
                                type="number"
                                step="0.01"
                                value={s?.contribution ?? 0}
                                onChange={(e) =>
                                  updateRow(a.id, "contribution", Number(e.target.value))
                                }
                                className="h-8 pr-6 text-right tabular-nums"
                                title={contribLabel}
                                disabled={disabled}
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                                €
                              </span>
                            </div>
                          ) : (
                            <div className="h-8" />
                          )}
                        </div>

                        <div className="col-span-1 text-right text-xs font-medium numeric">
                          <div>{formatEUR(nv)}</div>
                          {!disabled && !pf.isFirstMonth && (
                            <div className="flex items-center justify-end gap-1 text-[10px] font-normal text-muted-foreground/80">
                              {isCustomized ? (
                                <button
                                  type="button"
                                  onClick={() => resetRow(a.id)}
                                  className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                                  title={`Réinitialiser à l'estimation ${formatEUR(pf.expectedValue)}`}
                                >
                                  <RotateCcw className="size-2.5" />
                                  réinitialiser
                                </button>
                              ) : (
                                <span
                                  className="text-[10px] text-muted-foreground/70"
                                  title="Valeur estimée à partir du mois précédent"
                                >
                                  estimation
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="col-span-1 flex justify-end">
                          <DeltaPill
                            value={delta}
                            small
                            invertColors={isLiability(a.kind)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {mortgages.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <div className="flex items-center gap-3">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: "var(--destructive)" }}
                  />
                  <h3 className="text-sm font-semibold">Crédits — amortissement du mois</h3>
                  <Badge variant="secondary">{mortgages.length}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  Pré-rempli depuis le tableau d'amortissement
                </span>
              </div>
              <div className="grid grid-cols-12 gap-3 border-t border-border/60 bg-muted/20 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <div className="col-span-4">Crédit</div>
                <div className="col-span-2 text-right">Solde avant</div>
                <div className="col-span-2 text-right">Capital amorti</div>
                <div className="col-span-2 text-right">Intérêts payés</div>
                <div className="col-span-1 text-right">Après</div>
                <div className="col-span-1 text-right">Δ</div>
              </div>
              {mortgages.map((m) => {
                const s = mortgageState[m.mortgageId];
                const nb = newMortgageBalance(m);
                const hasAmort = (amortByMortgage[m.mortgageId] ?? []).length > 0;
                return (
                  <div
                    key={m.mortgageId}
                    className="grid grid-cols-12 items-center gap-3 border-t border-border/40 px-5 py-2 text-sm"
                  >
                    <div className="col-span-4 min-w-0">
                      <div className="truncate font-medium">{m.accountName}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>mensualité {formatEUR(m.monthlyPayment)}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {m.interestRatePct}%
                        </Badge>
                        {!hasAmort && (
                          <Badge variant="outline" className="text-[10px] text-amber-500">
                            estimé
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2 text-right text-xs text-muted-foreground numeric">
                      {formatEUR(m.remainingBalance)}
                    </div>
                    <div className="col-span-2">
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          value={s?.principal ?? 0}
                          onChange={(e) =>
                            updateMortgage(m.mortgageId, "principal", Number(e.target.value))
                          }
                          className="h-8 pr-6 text-right tabular-nums"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                          €
                        </span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          value={s?.interest ?? 0}
                          onChange={(e) =>
                            updateMortgage(m.mortgageId, "interest", Number(e.target.value))
                          }
                          className="h-8 pr-6 text-right tabular-nums"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                          €
                        </span>
                      </div>
                    </div>
                    <div className="col-span-1 text-right text-xs font-medium numeric">
                      {formatEUR(nb)}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <DeltaPill
                        value={nb - m.remainingBalance}
                        small
                        invertColors
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Revenus récurrents (read-only) */}
          <SectionHeader
            icon={<Wallet className="size-3.5" />}
            title="Revenus récurrents"
            count={incomeItems.length}
            total={cashflow.totalIncome}
            tone="positive"
            dotColor="var(--color-success)"
          />
          {incomeItems.length === 0 ? (
            <div className="px-5 py-3 text-xs text-muted-foreground">
              Aucun revenu récurrent · à ajouter depuis la page Dépenses &amp; revenus.
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-12 gap-3 border-b border-border/60 bg-muted/20 px-5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <div className="col-span-5">Libellé</div>
                <div className="col-span-3">Catégorie</div>
                <div className="col-span-3 text-right">Montant mensuel</div>
                <div className="col-span-1 text-right">Note</div>
              </div>
              {incomeItems.map((i) => (
                <div
                  key={i.id}
                  className="grid grid-cols-12 items-center gap-3 border-t border-border/40 px-5 py-1.5 text-sm"
                >
                  <div className="col-span-5 truncate font-medium">{i.label}</div>
                  <div className="col-span-3 text-xs text-muted-foreground">{i.category}</div>
                  <div className="col-span-3 text-right numeric font-medium text-[var(--color-success)]">
                    +{formatEUR(i.amount)}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <NotesPopover
                      itemLabel={i.label}
                      existingNote={i.notes}
                      onSave={async (note) => {
                        await updateIncomeNote({ id: i.id, note });
                      }}
                    />
                  </div>
                  {i.notes && (
                    <div className="col-span-12">
                      <InlineNote note={i.notes} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Revenus exceptionnels ce mois */}
          <SectionHeader
            icon={<PiggyBank className="size-3.5" />}
            title="Revenus exceptionnels ce mois"
            count={recentIncomes.length}
            total={monthIncomesTotal}
            tone="positive"
            dotColor="var(--color-success)"
          />
          {recentIncomes.length === 0 ? (
            <div className="px-5 py-3 text-xs text-muted-foreground">
              Aucun revenu exceptionnel ce mois. Prime, remboursement, vente, dividende…
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-12 gap-3 border-b border-border/60 bg-muted/20 px-5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <div className="col-span-5">Libellé</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-2">Catégorie</div>
                <div className="col-span-2 text-right">Montant</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
              {recentIncomes.map((i) => (
                <div
                  key={i.id}
                  className="grid grid-cols-12 items-center gap-3 border-t border-border/40 px-5 py-1.5 text-sm"
                >
                  <div className="col-span-5 truncate font-medium">{i.label}</div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    {formatDateFR(i.date)}
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    {oneOffIncomeCategoryLabel[i.category] ?? i.category}
                  </div>
                  <div className="col-span-2 text-right numeric font-medium text-[var(--color-success)]">
                    +{formatEUR(i.amount)}
                  </div>
                  <div className="col-span-1 flex justify-end gap-1">
                    <NotesPopover
                      itemLabel={i.label}
                      existingNote={i.notes}
                      onSave={async (note) => {
                        await updateOneOffIncomeNote({ id: i.id, note });
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6 text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (!confirm(`Supprimer "${i.label}" ?`)) return;
                        await removeOneOffIncome(i.id);
                        toast.success("Supprimé");
                        router.refresh();
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                  {i.notes && (
                    <div className="col-span-12">
                      <InlineNote note={i.notes} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-border/60 bg-muted/10 px-5 py-3">
            <QuickAddIncome householdId={householdId} templates={incomeTemplates} />
          </div>
          {previousMonthIncomes.length > 0 && (
            <div className="border-t border-border/60 bg-muted/5 px-5 py-2">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Mois dernier (référence)
              </div>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px]">
                {previousMonthIncomes.map((i) => (
                  <li key={i.id} className="flex items-center justify-between">
                    <span className="truncate text-muted-foreground">{i.label}</span>
                    <span className="numeric text-muted-foreground">
                      +{formatEUR(i.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dépenses récurrentes (form) */}
          <SectionHeader
            icon={<Receipt className="size-3.5" />}
            title="Dépenses récurrentes"
            count={expenseItems.length}
            total={totalExpensesThisMonth}
            tone="negative"
            dotColor="var(--destructive)"
            subtitle={`baseline ${formatEUR(cashflow.totalExpense)}`}
          />
          {expenseItems.length === 0 ? (
            <div className="px-5 py-3 text-xs text-muted-foreground">
              Aucune dépense récurrente · ajoute-en une ci-dessous.
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-12 gap-3 border-b border-border/60 bg-muted/20 px-5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <div className="col-span-4">Libellé</div>
                <div className="col-span-2">Catégorie</div>
                <div className="col-span-2 text-right">Moyenne</div>
                <div className="col-span-1 text-right">Mois -1</div>
                <div className="col-span-2 text-right">Ce mois</div>
                <div className="col-span-1 text-right">Note</div>
              </div>
              {expenseItems.map((e) => {
                const current = expenseThisMonth[e.id] ?? e.current;
                const deltaVsAvg = current - e.average;
                return (
                  <div
                    key={e.id}
                    className="grid grid-cols-12 items-center gap-3 border-t border-border/40 px-5 py-1.5 text-sm"
                  >
                    <div className="col-span-4 min-w-0">
                      <a
                        href={`/expenses/${e.id}`}
                        className="truncate font-medium hover:text-[var(--chart-1)] hover:underline"
                      >
                        {e.label}
                      </a>
                      {e.historyCount > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          {e.historyCount} mois d&apos;historique
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 text-xs text-muted-foreground">
                      {expenseCategoryLabel[e.category] ?? e.category}
                    </div>
                    <div className="col-span-2 text-right numeric text-[11px] text-muted-foreground">
                      {formatEUR(e.average)}
                    </div>
                    <div className="col-span-1 text-right numeric text-[11px] text-muted-foreground">
                      {formatEUR(e.previous)}
                    </div>
                    <div className="col-span-2">
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          value={current}
                          onChange={(ev) =>
                            setExpenseThisMonth((prev) => ({
                              ...prev,
                              [e.id]: Number(ev.target.value),
                            }))
                          }
                          className="h-8 pr-6 text-right tabular-nums"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                          €
                        </span>
                      </div>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <NotesPopover
                        itemLabel={e.label}
                        existingNote={e.notes}
                        onSave={async (note) => {
                          await updateExpenseNote({ id: e.id, note });
                        }}
                      />
                    </div>
                    {Math.abs(deltaVsAvg) > 1 && (
                      <div
                        className={`col-span-12 text-[10px] ${
                          deltaVsAvg > 0 ? "text-destructive" : "text-[var(--color-success)]"
                        }`}
                      >
                        {formatEUR(deltaVsAvg, { signed: true })} vs moyenne
                      </div>
                    )}
                    {e.notes && (
                      <div className="col-span-12">
                        <InlineNote note={e.notes} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="border-t border-border/60 bg-muted/10 px-5 py-3">
            <QuickAddExpense householdId={householdId} />
          </div>

          {/* Frais one-shot ce mois */}
          <SectionHeader
            icon={<Receipt className="size-3.5" />}
            title="Frais one-shot ce mois"
            count={recentCharges.length}
            total={monthChargesTotal}
            tone="negative"
            dotColor="var(--destructive)"
          />
          {recentCharges.length === 0 ? (
            <div className="px-5 py-3 text-xs text-muted-foreground">
              Aucun frais ce mois. Utilise un modèle ou ajoute-en un nouveau ci-dessous.
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-12 gap-3 border-b border-border/60 bg-muted/20 px-5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <div className="col-span-5">Libellé</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-2">Catégorie</div>
                <div className="col-span-2 text-right">Montant</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
              {recentCharges.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-12 items-center gap-3 border-t border-border/40 px-5 py-1.5 text-sm"
                >
                  <div className="col-span-5 truncate font-medium">{c.label}</div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    {formatDateFR(c.date)}
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    {chargeCategoryLabel[c.category] ?? c.category}
                  </div>
                  <div className="col-span-2 text-right numeric font-medium text-destructive">
                    -{formatEUR(c.amount)}
                  </div>
                  <div className="col-span-1 flex justify-end gap-1">
                    <NotesPopover
                      itemLabel={c.label}
                      existingNote={c.notes}
                      onSave={async (note) => {
                        await updateChargeNote({ id: c.id, note });
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6 text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (!confirm(`Supprimer "${c.label}" ?`)) return;
                        await removeCharge(c.id);
                        toast.success("Supprimé");
                        router.refresh();
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                  {c.notes && (
                    <div className="col-span-12">
                      <InlineNote note={c.notes} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-border/60 bg-muted/10 px-5 py-3">
            <QuickAddCharge householdId={householdId} templates={chargeTemplates} />
          </div>
          {previousMonthCharges.length > 0 && (
            <div className="border-t border-border/60 bg-muted/5 px-5 py-2">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Mois dernier (référence)
              </div>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px]">
                {previousMonthCharges.map((c) => (
                  <li key={c.id} className="flex items-center justify-between">
                    <span className="truncate text-muted-foreground">{c.label}</span>
                    <span className="numeric text-muted-foreground">
                      -{formatEUR(c.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border bg-muted/20 px-5 py-4">
          <div className="min-w-[240px] flex-1">
            <Label className="text-xs text-muted-foreground">Note du mois (optionnel)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Ex. prime perçue, virement exceptionnel, bonus…"
            />
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Nouveau patrimoine net
            </div>
            <div className="numeric mt-1 text-xl font-semibold">{formatEUR(totals.net)}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              actifs {formatEUR(totals.assets)} · passifs {formatEUR(totals.liabilities)}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function SectionHeader({
  icon,
  title,
  count,
  total,
  tone,
  dotColor,
  subtitle,
}: {
  icon?: React.ReactNode;
  title: string;
  count?: number;
  total: number;
  tone?: "positive" | "negative";
  dotColor: string;
  subtitle?: string;
}) {
  const toneClass =
    tone === "positive"
      ? "text-[var(--color-success)]"
      : tone === "negative"
        ? "text-destructive"
        : "";
  const sign = tone === "negative" ? "-" : tone === "positive" ? "+" : "";
  return (
    <div className="flex items-center justify-between border-y border-border bg-muted/30 px-5 py-2.5">
      <div className="flex items-center gap-3">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <h3 className="text-sm font-semibold">{title}</h3>
        {count != null && (
          <Badge variant="secondary" className="text-[10px]">
            {count}
          </Badge>
        )}
        {subtitle && (
          <span className="text-[10px] text-muted-foreground">· {subtitle}</span>
        )}
      </div>
      <div className={`numeric text-sm font-semibold ${toneClass}`}>
        {total !== 0 && sign}
        {formatEUR(total)}
      </div>
    </div>
  );
}

function DCAEditor({
  accountId,
  currentDCA,
}: {
  accountId: string;
  currentDCA: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState<number | "">(currentDCA ?? "");

  function submit() {
    start(async () => {
      try {
        await updateAccountDCA({
          accountId,
          monthlyContribution: amount === "" ? null : Number(amount),
        });
        toast.success("DCA mis à jour");
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const label =
    currentDCA != null && currentDCA > 0 ? `DCA ${formatEUR(currentDCA)}/mois` : "+ Définir DCA";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] transition-colors hover:border-[var(--chart-1)] hover:text-[var(--chart-1)] ${
              currentDCA != null && currentDCA > 0
                ? "bg-muted/40"
                : "border-dashed text-muted-foreground"
            }`}
            title="Modifier le DCA"
          />
        }
      >
        {label}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajuster le DCA mensuel</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">Apport mensuel (EUR)</Label>
          <div className="relative">
            <Input
              type="number"
              step="1"
              placeholder="ex. 300"
              value={amount}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
              className="pr-8 text-right numeric"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Le DCA est modifiable à tout moment — pas un engagement rigide. Vide = pas de DCA.
          </p>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={pending}
            onClick={() => {
              setAmount("");
              start(async () => {
                try {
                  await updateAccountDCA({ accountId, monthlyContribution: null });
                  toast.success("DCA retiré");
                  setOpen(false);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              });
            }}
          >
            Retirer
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "…" : "Enregistrer"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Panel({
  title,
  icon,
  total,
  subtitle,
  tone,
  children,
  footer,
}: {
  title: string;
  icon?: React.ReactNode;
  total: number;
  subtitle?: string;
  tone?: "positive" | "negative";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const toneClass =
    tone === "positive"
      ? "text-[var(--color-success)]"
      : tone === "negative"
        ? "text-destructive"
        : "";
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && (
            <span className="text-[10px] text-muted-foreground">· {subtitle}</span>
          )}
        </div>
        <div className={`numeric text-sm font-semibold ${toneClass}`}>
          {tone === "negative" && total > 0 ? "-" : ""}
          {formatEUR(total)}
        </div>
      </div>
      <div className="flex-1 px-4 py-2">{children}</div>
      {footer && <div className="border-t border-border/60 bg-muted/10 px-4 py-2">{footer}</div>}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-center text-[11px] text-muted-foreground">{children}</p>;
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
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`numeric mt-1.5 text-lg font-semibold ${tone}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function DeltaPill({
  value,
  small,
  invertColors,
}: {
  value: number;
  small?: boolean;
  invertColors?: boolean;
}) {
  if (Math.abs(value) < 0.005) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Minus className={small ? "size-3" : "size-3.5"} />
        <span className={small ? "text-[11px]" : "text-xs"}>—</span>
      </span>
    );
  }
  // "Favorable" depends on whether this row is a liability context.
  // - Asset: value > 0 = good (balance went up).
  // - Liability (invertColors): value < 0 = good (debt went down).
  const favorable = invertColors ? value < 0 : value > 0;
  // For liabilities, flip the displayed sign so that a good outcome shows +X (green)
  // and a bad outcome shows -X (red) — the "-" sign always means bad.
  const displayValue = invertColors ? -value : value;
  const tone = favorable ? "text-[var(--color-success)]" : "text-destructive";
  const Icon = displayValue > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      <Icon className={small ? "size-3" : "size-3.5"} />
      <span className={`numeric ${small ? "text-[11px]" : "text-xs"}`}>
        {formatEUR(displayValue, { signed: true })}
      </span>
    </span>
  );
}
