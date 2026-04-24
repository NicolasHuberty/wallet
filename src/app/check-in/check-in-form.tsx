"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

type RowInput = {
  growth: number;
  contribution: number;
};

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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

// Big-input base styles. We aim for 16px (prevents iOS Safari zoom) with
// tabular numerals, right-aligned, padded for the € suffix.
const BIG_MONEY_INPUT =
  "h-12 pr-9 text-right text-lg font-medium tabular-nums numeric md:h-8 md:text-sm md:pr-6 md:font-normal";

function MoneyInput({
  value,
  onChange,
  disabled,
  title,
  suffix = "€",
  tabIndex,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  title?: string;
  suffix?: string;
  tabIndex?: number;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        step="0.01"
        inputMode="decimal"
        pattern="[0-9]*[.,]?[0-9]*"
        enterKeyHint="next"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={BIG_MONEY_INPUT}
        disabled={disabled}
        title={title}
        tabIndex={tabIndex}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground md:right-2 md:text-[10px]">
        {suffix}
      </span>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// CheckInForm
// ---------------------------------------------------------------------------

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  const [mortgageState, setMortgageState] = useState<Record<string, MortgageInput>>(() => {
    const out: Record<string, MortgageInput> = {};
    for (const m of mortgages) {
      const entry = pickAmortEntry(amortByMortgage[m.mortgageId] ?? [], `${selectedMonth}-01`);
      if (entry) {
        out[m.mortgageId] = { principal: round2(entry.principal), interest: round2(entry.interest) };
      } else {
        const monthlyInterest = (m.remainingBalance * m.interestRatePct) / 100 / 12;
        const principal = Math.max(0, m.monthlyPayment - monthlyInterest);
        out[m.mortgageId] = { principal: round2(principal), interest: round2(monthlyInterest) };
      }
    }
    return out;
  });

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
    if (a.prefill.previousSource !== "none") return a.prefill.previousValue;
    return a.currentValue;
  }

  function newValueFor(a: AccountRow): number {
    const s = rowState[a.id];
    const base = previousValueFor(a);
    if (!s) return base;
    if (isLiability(a.kind)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, rowState]);

  // Delta from previous snapshot totals → used as feedback in the sticky
  // submit bar on mobile.
  const previousTotalNet = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    for (const a of accounts) {
      const v = previousValueFor(a);
      if (isLiability(a.kind) || v < 0) liabilities += Math.abs(v);
      else assets += v;
    }
    return assets - liabilities;
  }, [accounts]);
  const deltaNet = totals.net - previousTotalNet;

  const [expenseThisMonth, setExpenseThisMonth] = useState<Record<string, number>>(() =>
    Object.fromEntries(expenseItems.map((e) => [e.id, round2(e.current)])),
  );
  const totalExpensesThisMonth = useMemo(
    () =>
      expenseItems.reduce((s, e) => s + (expenseThisMonth[e.id] ?? e.current), 0),
    [expenseItems, expenseThisMonth],
  );

  const totalDCA = accounts.reduce((s, a) => s + (a.monthlyContribution ?? 0), 0);

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

  const netIncomeWithCharges =
    cashflow.totalIncome +
    monthIncomesTotal -
    totalExpensesThisMonth -
    monthChargesTotal;
  const remainsAfterDCA = netIncomeWithCharges - totalDCA;

  async function handleRemoveCharge(id: string, label: string) {
    if (confirmDeleteId !== `charge:${id}`) {
      setConfirmDeleteId(`charge:${id}`);
      setTimeout(() => setConfirmDeleteId((c) => (c === `charge:${id}` ? null : c)), 3000);
      return;
    }
    await removeCharge(id);
    toast.success(`"${label}" supprimé`);
    setConfirmDeleteId(null);
    router.refresh();
  }

  async function handleRemoveIncome(id: string, label: string) {
    if (confirmDeleteId !== `income:${id}`) {
      setConfirmDeleteId(`income:${id}`);
      setTimeout(() => setConfirmDeleteId((c) => (c === `income:${id}` ? null : c)), 3000);
      return;
    }
    await removeOneOffIncome(id);
    toast.success(`"${label}" supprimé`);
    setConfirmDeleteId(null);
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-32 md:pb-6">
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

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Header + month nav */}
        <div className="flex flex-col gap-4 border-b border-border px-4 py-4 md:flex-row md:flex-wrap md:items-center md:justify-between md:px-5">
          <div>
            <h2 className="text-base font-semibold">Mise à jour mensuelle</h2>
            <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-[var(--chart-1)]" />
              <span>
                Pré-remplissage depuis le mois précédent + DCA / intérêts / amortissement
                attendus. Ajuste si besoin — « réinitialiser » annule tes modifications.
              </span>
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
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-1 rounded-lg border border-border bg-background p-1 md:flex-none">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => shiftMonth(-1)}
                className="size-9 md:size-7"
                title="Mois précédent"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <div className="relative flex flex-1 items-center gap-2 px-2">
                <CalendarDays className="size-3.5 text-muted-foreground" />
                <div className="min-w-[9rem] flex-1 text-center text-sm font-semibold capitalize">
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
                className="size-9 md:size-7"
                title={canGoNext ? "Mois suivant" : "Mois actuel atteint"}
                disabled={!canGoNext}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {selectedMonth !== todayKey && (
              <Button
                size="sm"
                variant="ghost"
                className="hidden h-7 text-[11px] md:inline-flex"
                onClick={goCurrent}
              >
                Mois courant
              </Button>
            )}
          </div>
        </div>

        {/* ---- ACCOUNT CARDS (mobile) / GRID (desktop) ---- */}
        <div className="divide-y divide-border">
          {/* Desktop column headers — hidden on mobile. */}
          <div className="hidden grid-cols-12 gap-3 border-b border-border bg-muted/30 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
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
                <div className="flex items-center justify-between px-4 py-2.5 md:px-5">
                  <div className="flex items-center gap-3">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: accountKindColor[kind] }}
                    />
                    <h3 className="text-sm font-semibold">{accountKindLabel[kind]}</h3>
                    <Badge variant="secondary">{rows.length}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs md:gap-3">
                    <span className="hidden text-muted-foreground md:inline">
                      {formatEUR(subtotalOld)} → {formatEUR(subtotalNew)}
                    </span>
                    <DeltaPill value={deltaKind} invertColors={isLiability(kind)} />
                  </div>
                </div>

                <div className="divide-y divide-border/40">
                  {rows.map((a, idx) => {
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

                    // Mobile: one card per account; desktop: grid row.
                    return (
                      <div
                        key={a.id}
                        className={`px-4 py-3 md:grid md:grid-cols-12 md:items-center md:gap-3 md:px-5 md:py-2 md:text-sm ${
                          disabled ? "opacity-60" : ""
                        }`}
                      >
                        {/* Account label + metadata */}
                        <div className="md:col-span-4 md:min-w-0">
                          <div className="flex items-center justify-between gap-2 md:block">
                            <div className="truncate text-base font-semibold md:text-sm md:font-medium">
                              {a.name}
                            </div>
                            <div className="shrink-0 text-right md:hidden">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Avant
                              </div>
                              <div className="numeric text-sm tabular-nums text-muted-foreground">
                                {formatEUR(prev)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
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
                            <span className="md:hidden">· {prevHintLabel}</span>
                          </div>
                        </div>

                        {/* Desktop-only "Avant" column */}
                        <div className="hidden md:col-span-2 md:block md:text-right md:text-xs md:text-muted-foreground md:numeric">
                          <div>{formatEUR(prev)}</div>
                          <div className="text-[10px] text-muted-foreground/70">
                            {prevHintLabel}
                          </div>
                        </div>

                        {/* Inputs — stacked on mobile, columns on desktop */}
                        <div className="mt-3 grid grid-cols-2 gap-3 md:col-span-4 md:mt-0 md:contents">
                          <div className="md:col-span-2">
                            {growthLabel ? (
                              <>
                                <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">
                                  {growthLabel}
                                </Label>
                                <MoneyInput
                                  value={s?.growth ?? 0}
                                  onChange={(v) => updateRow(a.id, "growth", v)}
                                  disabled={disabled}
                                  tabIndex={idx * 2 + 1}
                                  title={growthLabel}
                                />
                              </>
                            ) : (
                              <div className="h-12 md:h-8" />
                            )}
                          </div>
                          <div className="md:col-span-2">
                            {a.kind !== "real_estate" ? (
                              <>
                                <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">
                                  {contribLabel}
                                </Label>
                                <MoneyInput
                                  value={s?.contribution ?? 0}
                                  onChange={(v) => updateRow(a.id, "contribution", v)}
                                  disabled={disabled}
                                  title={contribLabel}
                                  tabIndex={idx * 2 + 2}
                                />
                              </>
                            ) : (
                              <div className="h-12 md:h-8" />
                            )}
                          </div>
                        </div>

                        {/* Après + delta — summary row on mobile, columns on desktop */}
                        <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3 md:col-span-2 md:mt-0 md:border-none md:pt-0 md:contents">
                          <div className="md:col-span-1 md:text-right md:text-xs md:font-medium md:numeric">
                            <div className="flex items-baseline gap-2 md:block">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">
                                Après
                              </span>
                              <span className="numeric text-base font-semibold tabular-nums md:text-xs md:font-medium">
                                {formatEUR(nv)}
                              </span>
                            </div>
                            {!disabled && !pf.isFirstMonth && (
                              <div className="mt-0.5 flex items-center justify-start gap-1 text-[10px] font-normal text-muted-foreground/80 md:justify-end">
                                {isCustomized ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => resetRow(a.id)}
                                    className="h-9 min-h-[44px] min-w-[44px] gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:text-foreground md:h-6 md:min-h-0 md:min-w-0 md:px-1 md:text-[10px]"
                                    title={`Réinitialiser à l'estimation ${formatEUR(pf.expectedValue)}`}
                                  >
                                    <RotateCcw className="size-3.5 md:size-2.5" />
                                    <span className="md:hidden">Estimation</span>
                                    <span className="hidden md:inline">réinitialiser</span>
                                  </Button>
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
                          <div className="md:col-span-1 md:flex md:justify-end">
                            <DeltaPill value={delta} small invertColors={isLiability(a.kind)} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Mortgages */}
          {mortgages.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 py-2.5 md:px-5">
                <div className="flex items-center gap-3">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: "var(--destructive)" }}
                  />
                  <h3 className="text-sm font-semibold">Crédits — amortissement du mois</h3>
                  <Badge variant="secondary">{mortgages.length}</Badge>
                </div>
                <span className="hidden text-xs text-muted-foreground md:inline">
                  Pré-rempli depuis le tableau d&apos;amortissement
                </span>
              </div>
              <div className="hidden grid-cols-12 gap-3 border-t border-border/60 bg-muted/20 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
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
                    className="border-t border-border/40 px-4 py-3 md:grid md:grid-cols-12 md:items-center md:gap-3 md:px-5 md:py-2 md:text-sm"
                  >
                    <div className="md:col-span-4 md:min-w-0">
                      <div className="flex items-center justify-between gap-2 md:block">
                        <div className="truncate text-base font-semibold md:text-sm md:font-medium">
                          {m.accountName}
                        </div>
                        <div className="shrink-0 text-right md:hidden">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Solde avant
                          </div>
                          <div className="numeric text-sm tabular-nums text-muted-foreground">
                            {formatEUR(m.remainingBalance)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
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

                    <div className="hidden md:col-span-2 md:block md:text-right md:text-xs md:text-muted-foreground md:numeric">
                      {formatEUR(m.remainingBalance)}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 md:col-span-4 md:mt-0 md:contents">
                      <div className="md:col-span-2">
                        <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">
                          Capital amorti
                        </Label>
                        <MoneyInput
                          value={s?.principal ?? 0}
                          onChange={(v) => updateMortgage(m.mortgageId, "principal", v)}
                          title="Capital amorti"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">
                          Intérêts payés
                        </Label>
                        <MoneyInput
                          value={s?.interest ?? 0}
                          onChange={(v) => updateMortgage(m.mortgageId, "interest", v)}
                          title="Intérêts payés"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3 md:col-span-2 md:mt-0 md:border-none md:pt-0 md:contents">
                      <div className="md:col-span-1 md:text-right md:text-xs md:font-medium md:numeric">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">
                          Après{" "}
                        </span>
                        <span className="numeric text-base font-semibold tabular-nums md:text-xs md:font-medium">
                          {formatEUR(nb)}
                        </span>
                      </div>
                      <div className="md:col-span-1 md:flex md:justify-end">
                        <DeltaPill value={nb - m.remainingBalance} small invertColors />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recurring incomes (read-only) */}
          <SectionHeader
            icon={<Wallet className="size-3.5" />}
            title="Revenus récurrents"
            count={incomeItems.length}
            total={cashflow.totalIncome}
            tone="positive"
            dotColor="var(--color-success)"
          />
          {incomeItems.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground md:px-5">
              Aucun revenu récurrent · à ajouter depuis la page Dépenses &amp; revenus.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              <div className="hidden grid-cols-12 gap-3 border-b border-border/60 bg-muted/20 px-5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
                <div className="col-span-5">Libellé</div>
                <div className="col-span-3">Catégorie</div>
                <div className="col-span-3 text-right">Montant mensuel</div>
                <div className="col-span-1 text-right">Note</div>
              </div>
              {incomeItems.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 md:grid md:grid-cols-12 md:gap-3 md:px-5 md:py-1.5"
                >
                  <div className="min-w-0 md:col-span-5">
                    <div className="truncate text-sm font-medium">{i.label}</div>
                    <div className="text-[11px] text-muted-foreground md:hidden">{i.category}</div>
                  </div>
                  <div className="hidden md:col-span-3 md:block md:text-xs md:text-muted-foreground">{i.category}</div>
                  <div className="shrink-0 md:col-span-3 md:text-right">
                    <span className="numeric text-sm font-medium tabular-nums text-[var(--color-success)]">
                      +{formatEUR(i.amount)}
                    </span>
                  </div>
                  <div className="md:col-span-1 md:flex md:justify-end">
                    <NotesPopover
                      itemLabel={i.label}
                      existingNote={i.notes}
                      onSave={async (note) => {
                        await updateIncomeNote({ id: i.id, note });
                      }}
                    />
                  </div>
                  {i.notes && (
                    <div className="w-full md:col-span-12">
                      <InlineNote note={i.notes} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* One-off incomes */}
          <SectionHeader
            icon={<PiggyBank className="size-3.5" />}
            title="Revenus exceptionnels ce mois"
            count={recentIncomes.length}
            total={monthIncomesTotal}
            tone="positive"
            dotColor="var(--color-success)"
          />
          {recentIncomes.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground md:px-5">
              Aucun revenu exceptionnel ce mois. Prime, remboursement, vente, dividende…
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              <div className="hidden grid-cols-12 gap-3 border-b border-border/60 bg-muted/20 px-5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
                <div className="col-span-5">Libellé</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-2">Catégorie</div>
                <div className="col-span-2 text-right">Montant</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
              {recentIncomes.map((i) => (
                <div
                  key={i.id}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 md:grid md:grid-cols-12 md:items-center md:gap-3 md:px-5 md:py-1.5"
                >
                  <div className="min-w-0 md:col-span-5">
                    <div className="truncate text-sm font-medium">{i.label}</div>
                    <div className="text-[11px] text-muted-foreground md:hidden">
                      {formatDateFR(i.date)} · {oneOffIncomeCategoryLabel[i.category] ?? i.category}
                    </div>
                  </div>
                  <div className="hidden md:col-span-2 md:block md:text-xs md:text-muted-foreground">
                    {formatDateFR(i.date)}
                  </div>
                  <div className="hidden md:col-span-2 md:block md:text-xs md:text-muted-foreground">
                    {oneOffIncomeCategoryLabel[i.category] ?? i.category}
                  </div>
                  <div className="shrink-0 text-right md:col-span-2">
                    <span className="numeric text-sm font-medium tabular-nums text-[var(--color-success)]">
                      +{formatEUR(i.amount)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 md:col-span-1 md:justify-end">
                    <NotesPopover
                      itemLabel={i.label}
                      existingNote={i.notes}
                      onSave={async (note) => {
                        await updateOneOffIncomeNote({ id: i.id, note });
                      }}
                    />
                    <Button
                      size="icon"
                      variant={confirmDeleteId === `income:${i.id}` ? "destructive" : "ghost"}
                      className="size-9 md:size-6"
                      onClick={() => handleRemoveIncome(i.id, i.label)}
                      title={confirmDeleteId === `income:${i.id}` ? "Confirmer" : "Supprimer"}
                    >
                      <Trash2 className="size-4 md:size-3" />
                    </Button>
                  </div>
                  {i.notes && (
                    <div className="w-full md:col-span-12">
                      <InlineNote note={i.notes} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-border/60 bg-muted/10 px-4 py-3 md:px-5">
            <QuickAddIncome householdId={householdId} templates={incomeTemplates} />
          </div>
          {previousMonthIncomes.length > 0 && (
            <div className="border-t border-border/60 bg-muted/5 px-4 py-2 md:px-5">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Mois dernier (référence)
              </div>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 text-[11px] md:grid-cols-2">
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

          {/* Recurring expenses */}
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
            <div className="px-4 py-3 text-xs text-muted-foreground md:px-5">
              Aucune dépense récurrente · ajoute-en une ci-dessous.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              <div className="hidden grid-cols-12 gap-3 border-b border-border/60 bg-muted/20 px-5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
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
                    className="px-4 py-3 md:grid md:grid-cols-12 md:items-center md:gap-3 md:px-5 md:py-1.5"
                  >
                    <div className="flex items-start justify-between gap-3 md:col-span-4 md:min-w-0 md:block">
                      <div className="min-w-0">
                        <a
                          href={`/expenses/${e.id}`}
                          className="truncate text-sm font-medium hover:text-[var(--chart-1)] hover:underline"
                        >
                          {e.label}
                        </a>
                        <div className="text-[11px] text-muted-foreground md:hidden">
                          {expenseCategoryLabel[e.category] ?? e.category}
                          {e.historyCount > 0 && ` · ${e.historyCount} mois`}
                          {" · moy. "}
                          {formatEUR(e.average)}
                        </div>
                      </div>
                      <div className="shrink-0 md:hidden">
                        <NotesPopover
                          itemLabel={e.label}
                          existingNote={e.notes}
                          onSave={async (note) => {
                            await updateExpenseNote({ id: e.id, note });
                          }}
                        />
                      </div>
                    </div>
                    <div className="hidden md:col-span-2 md:block md:text-xs md:text-muted-foreground">
                      {expenseCategoryLabel[e.category] ?? e.category}
                    </div>
                    <div className="hidden md:col-span-2 md:block md:text-right md:text-[11px] md:numeric md:text-muted-foreground">
                      {formatEUR(e.average)}
                    </div>
                    <div className="hidden md:col-span-1 md:block md:text-right md:text-[11px] md:numeric md:text-muted-foreground">
                      {formatEUR(e.previous)}
                    </div>
                    <div className="mt-2 md:col-span-2 md:mt-0">
                      <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">
                        Ce mois
                      </Label>
                      <MoneyInput
                        value={current}
                        onChange={(v) =>
                          setExpenseThisMonth((prev) => ({
                            ...prev,
                            [e.id]: v,
                          }))
                        }
                        title="Montant ce mois"
                      />
                    </div>
                    <div className="hidden md:col-span-1 md:flex md:justify-end">
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
                        className={`mt-1 text-[10px] md:col-span-12 ${
                          deltaVsAvg > 0 ? "text-destructive" : "text-[var(--color-success)]"
                        }`}
                      >
                        {formatEUR(deltaVsAvg, { signed: true })} vs moyenne
                      </div>
                    )}
                    {e.notes && (
                      <div className="md:col-span-12">
                        <InlineNote note={e.notes} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="border-t border-border/60 bg-muted/10 px-4 py-3 md:px-5">
            <QuickAddExpense householdId={householdId} />
          </div>

          {/* One-off charges */}
          <SectionHeader
            icon={<Receipt className="size-3.5" />}
            title="Frais one-shot ce mois"
            count={recentCharges.length}
            total={monthChargesTotal}
            tone="negative"
            dotColor="var(--destructive)"
          />
          {recentCharges.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground md:px-5">
              Aucun frais ce mois. Utilise un modèle ou ajoute-en un nouveau ci-dessous.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              <div className="hidden grid-cols-12 gap-3 border-b border-border/60 bg-muted/20 px-5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
                <div className="col-span-5">Libellé</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-2">Catégorie</div>
                <div className="col-span-2 text-right">Montant</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
              {recentCharges.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 md:grid md:grid-cols-12 md:items-center md:gap-3 md:px-5 md:py-1.5"
                >
                  <div className="min-w-0 md:col-span-5">
                    <div className="truncate text-sm font-medium">{c.label}</div>
                    <div className="text-[11px] text-muted-foreground md:hidden">
                      {formatDateFR(c.date)} · {chargeCategoryLabel[c.category] ?? c.category}
                    </div>
                  </div>
                  <div className="hidden md:col-span-2 md:block md:text-xs md:text-muted-foreground">
                    {formatDateFR(c.date)}
                  </div>
                  <div className="hidden md:col-span-2 md:block md:text-xs md:text-muted-foreground">
                    {chargeCategoryLabel[c.category] ?? c.category}
                  </div>
                  <div className="shrink-0 text-right md:col-span-2">
                    <span className="numeric text-sm font-medium tabular-nums text-destructive">
                      -{formatEUR(c.amount)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 md:col-span-1 md:justify-end">
                    <NotesPopover
                      itemLabel={c.label}
                      existingNote={c.notes}
                      onSave={async (note) => {
                        await updateChargeNote({ id: c.id, note });
                      }}
                    />
                    <Button
                      size="icon"
                      variant={confirmDeleteId === `charge:${c.id}` ? "destructive" : "ghost"}
                      className="size-9 md:size-6"
                      onClick={() => handleRemoveCharge(c.id, c.label)}
                      title={confirmDeleteId === `charge:${c.id}` ? "Confirmer" : "Supprimer"}
                    >
                      <Trash2 className="size-4 md:size-3" />
                    </Button>
                  </div>
                  {c.notes && (
                    <div className="w-full md:col-span-12">
                      <InlineNote note={c.notes} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-border/60 bg-muted/10 px-4 py-3 md:px-5">
            <QuickAddCharge householdId={householdId} templates={chargeTemplates} />
          </div>
          {previousMonthCharges.length > 0 && (
            <div className="border-t border-border/60 bg-muted/5 px-4 py-2 md:px-5">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Mois dernier (référence)
              </div>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 text-[11px] md:grid-cols-2">
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

        {/* Footer: note + totals (desktop) */}
        <div className="flex flex-col gap-4 border-t border-border bg-muted/20 px-4 py-4 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-4 md:px-5">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Note du mois (optionnel)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Ex. prime perçue, virement exceptionnel, bonus…"
              className="mt-1 text-base md:text-sm"
            />
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Nouveau patrimoine net
            </div>
            <div className="numeric mt-1 text-2xl font-semibold tabular-nums md:text-xl">
              {formatEUR(totals.net)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              actifs {formatEUR(totals.assets)} · passifs {formatEUR(totals.liabilities)}
            </div>
          </div>
        </div>
      </section>

      {/* ---- STICKY SUBMIT BAR — mobile only, honors safe-area ---- */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] pt-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.2)] backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden"
        style={{ bottom: "var(--mobile-nav-h, 0px)" }}
      >
        <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Net à enregistrer
            </div>
            <div className="numeric truncate text-lg font-semibold tabular-nums">
              {formatEUR(totals.net)}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Δ mois</div>
            <DeltaPill value={deltaNet} />
          </div>
        </div>
        <Button
          onClick={submit}
          disabled={pending}
          className="h-12 w-full text-base font-semibold"
        >
          <Save className="size-4" />
          {pending ? "Enregistrement…" : `Enregistrer ${monthLabel}`}
        </Button>
      </div>

      {/* Desktop submit (always visible in the header was moved here for clarity) */}
      <div className="hidden md:block">
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={submit} disabled={pending} size="lg">
            <Save className="size-4" />
            {pending ? "Enregistrement…" : `Enregistrer ${monthLabel}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
    <div className="flex items-center justify-between border-y border-border bg-muted/30 px-4 py-2.5 md:px-5">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        {count != null && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {count}
          </Badge>
        )}
        {subtitle && (
          <span className="hidden text-[10px] text-muted-foreground md:inline">· {subtitle}</span>
        )}
      </div>
      <div className={`numeric shrink-0 text-sm font-semibold tabular-nums ${toneClass}`}>
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
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
      </SheetTrigger>
      <SheetContent desktopSize="md:max-w-sm">
        <SheetHeader>
          <SheetTitle>Ajuster le DCA mensuel</SheetTitle>
        </SheetHeader>
        <SheetBody className="grid gap-3">
          <Label className="text-xs text-muted-foreground">Apport mensuel (EUR)</Label>
          <div className="relative">
            <Input
              type="number"
              step="1"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="ex. 300"
              value={amount}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
              className="h-12 pr-9 text-right tabular-nums numeric text-lg md:h-8 md:text-sm md:pr-8"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Le DCA est modifiable à tout moment — pas un engagement rigide. Vide = pas de DCA.
          </p>
        </SheetBody>
        <SheetFooter className="flex items-center justify-between md:justify-between">
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
          <div className="flex flex-1 justify-end gap-2 md:flex-none">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="flex-1 md:flex-none"
            >
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending} className="flex-1 md:flex-none">
              {pending ? "…" : "Enregistrer"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
      <div className={`numeric mt-1 text-base font-semibold tabular-nums md:mt-1.5 md:text-lg ${tone}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 hidden text-[11px] text-muted-foreground md:block">{hint}</div>}
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
  const favorable = invertColors ? value < 0 : value > 0;
  const displayValue = invertColors ? -value : value;
  const tone = favorable ? "text-[var(--color-success)]" : "text-destructive";
  const Icon = displayValue > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      <Icon className={small ? "size-3" : "size-3.5"} />
      <span className={`numeric tabular-nums ${small ? "text-[11px]" : "text-xs"}`}>
        {formatEUR(displayValue, { signed: true })}
      </span>
    </span>
  );
}
