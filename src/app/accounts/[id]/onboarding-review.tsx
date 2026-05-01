"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { formatEUR, formatDateFR } from "@/lib/format";
import {
  categoryColor,
  categoryLabel,
  type TransactionCategory,
} from "@/lib/transaction-categorizer";
import { setCashflowCategoryWithRule } from "@/app/banking/actions";
import {
  TransactionEditDialog,
  type HouseholdAccountOption,
  type OneOffChargeOption,
  type RecurringIncomeOption,
} from "./transaction-edit-dialog";

type Cashflow = {
  id: string;
  date: Date | string;
  amount: number;
  notes: string | null;
  category: string | null;
  categorySource: string | null;
  bceEnterpriseNumber: string | null;
  transferToAccountId?: string | null;
  linkedOneOffChargeId?: string | null;
  linkedRecurringIncomeId?: string | null;
};

// Quick-pick categories — the most common ones for personal banking.
// Adapts to whether the transaction is income (positive) or expense.
const QUICK_EXPENSE: TransactionCategory[] = [
  "food_groceries",
  "food_restaurant",
  "transport",
  "subscriptions",
  "shopping",
  "leisure",
  "health",
  "utilities",
  "telecom_internet",
  "housing",
  "insurance",
  "fees_bank",
  "cash_withdrawal",
  "tax",
  "other_expense",
];
const QUICK_INCOME: TransactionCategory[] = [
  "income_salary",
  "income_other",
  "transfer_internal",
  "savings_invest",
  "other",
];

export function OnboardingReviewBanner({
  rows,
  householdAccounts = [],
  householdCharges = [],
  householdIncomes = [],
}: {
  rows: Cashflow[];
  householdAccounts?: HouseholdAccountOption[];
  householdCharges?: OneOffChargeOption[];
  householdIncomes?: RecurringIncomeOption[];
}) {
  const [open, setOpen] = useState(false);

  const toReview = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            !r.category ||
            r.categorySource === "fallback" ||
            r.categorySource === "regex",
        )
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)), // biggest first
    [rows],
  );
  const unclassified = rows.filter((r) => !r.category).length;
  const lowConfidence = rows.filter(
    (r) => r.categorySource === "fallback" || r.categorySource === "regex",
  ).length;

  if (toReview.length < 3) return null;

  return (
    <>
      <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {toReview.length} transactions à vérifier
              </h3>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                {unclassified > 0 && (
                  <>
                    <strong>{unclassified}</strong> non classées
                    {lowConfidence > 0 && " · "}
                  </>
                )}
                {lowConfidence > 0 && (
                  <>
                    <strong>{lowConfidence}</strong> classées avec faible confiance (catégorie par
                    défaut ou règle automatique)
                  </>
                )}
                . Vérifie-les en mode focus — chaque correction crée une règle qui s&apos;applique
                aux transactions futures et passées similaires.
              </p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)}>
            Vérifier maintenant <ChevronRight className="size-4" />
          </Button>
        </div>
      </section>

      <ReviewWizard
        open={open}
        onOpenChange={setOpen}
        rows={toReview}
        householdAccounts={householdAccounts}
        householdCharges={householdCharges}
        householdIncomes={householdIncomes}
      />
    </>
  );
}

function ReviewWizard({
  open,
  onOpenChange,
  rows,
  householdAccounts,
  householdCharges,
  householdIncomes,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: Cashflow[];
  householdAccounts: HouseholdAccountOption[];
  householdCharges: OneOffChargeOption[];
  householdIncomes: RecurringIncomeOption[];
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [pending, start] = useTransition();
  const [advanced, setAdvanced] = useState(false);
  const current = rows[idx];

  function advance() {
    setAdvanced(false);
    if (idx + 1 < rows.length) {
      setIdx((i) => i + 1);
    } else {
      onOpenChange(false);
      toast.success("Toutes les transactions ont été vérifiées 🎉");
      router.refresh();
    }
  }

  function pickQuick(category: TransactionCategory) {
    if (!current) return;
    start(async () => {
      try {
        const r = await setCashflowCategoryWithRule({
          cashflowId: current.id,
          category,
          applyTo: "similar_counterparty",
          createRule: true,
        });
        if (r.bulkUpdated > 1)
          toast.success(`${r.bulkUpdated} transactions similaires reclassées en "${categoryLabel[category]}"`);
        advance();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function pickTransfer(targetAccountId: string, targetName: string) {
    if (!current) return;
    start(async () => {
      try {
        const r = await setCashflowCategoryWithRule({
          cashflowId: current.id,
          category: "transfer_internal",
          applyTo: "similar_counterparty",
          createRule: true,
          transferToAccountId: targetAccountId,
        });
        if (r.bulkUpdated > 1)
          toast.success(
            `${r.bulkUpdated} virements vers "${targetName}" liés (et exclus des dépenses)`,
          );
        else toast.success(`Virement vers "${targetName}" enregistré`);
        advance();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function pickSalary(incomeId: string, incomeLabel: string) {
    if (!current) return;
    start(async () => {
      try {
        const r = await setCashflowCategoryWithRule({
          cashflowId: current.id,
          category: "income_salary",
          applyTo: "similar_counterparty",
          createRule: true,
          linkedRecurringIncomeId: incomeId,
        });
        if (r.bulkUpdated > 1)
          toast.success(
            `${r.bulkUpdated} salaires liés à "${incomeLabel}" — futures auto-classées`,
          );
        else toast.success(`Lié à "${incomeLabel}"`);
        advance();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  // Heuristic — flag transactions that look like internal transfers so we
  // can offer a one-click "transfer to ..." button alongside the category
  // picks. Same regex used by the auto-detector at sync time.
  function detectLocalTransferHint(notes: string | null): boolean {
    if (!notes) return false;
    return /(compte d epargne|d epargne|savings|spaarrek|virement|to compte|from compte|transfer to|transfer from|vers compte|depuis compte)/i.test(
      notes,
    );
  }
  const showTransferButtons =
    householdAccounts.length > 0 && current && detectLocalTransferHint(current.notes);

  // Salary detection — when current row is positive AND looks like income
  // (description hint OR amount within ±15 % of a known recurring income),
  // surface the salary picker BEFORE generic quick-pick categories. Helps
  // when the household has multiple salaries and we want each pay-day
  // tagged to the right person.
  const looksLikeSalary =
    current &&
    current.amount > 0 &&
    (current.amount > 200 || (householdIncomes.length > 0)) &&
    /(salaire|salary|payroll|wage|uclouvain|treatment officer)/i.test(current.notes ?? "");
  const matchingIncomes =
    current && current.amount > 0
      ? householdIncomes
          .map((i) => ({
            ...i,
            close: Math.abs(i.amount - Math.abs(current.amount)) / Math.abs(current.amount) < 0.15,
          }))
          .sort((a, b) => Number(b.close) - Number(a.close))
      : [];
  const showSalaryButtons =
    !!current &&
    householdIncomes.length > 0 &&
    current.amount > 0 &&
    (looksLikeSalary || matchingIncomes.some((m) => m.close));

  if (!current) return null;
  const positive = current.amount >= 0;
  const quickList = positive ? QUICK_INCOME : QUICK_EXPENSE;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent desktopSize="md:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              Vérification rapide ({idx + 1} / {rows.length})
            </SheetTitle>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--chart-1)] transition-all duration-300"
                style={{ width: `${((idx + 1) / rows.length) * 100}%` }}
              />
            </div>
          </SheetHeader>
          <SheetBody className="space-y-4">
            {/* Transaction context */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatDateFR(current.date)}
                </span>
                <span
                  className={`numeric text-lg font-semibold tabular-nums ${
                    positive ? "text-[var(--color-success)]" : "text-destructive"
                  }`}
                >
                  {formatEUR(current.amount, { signed: true })}
                </span>
              </div>
              <div className="mt-2 break-words text-sm">
                {current.notes ?? "(sans description)"}
              </div>
              {current.category && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Suggérée :</span>
                  <Badge
                    variant="outline"
                    style={{
                      borderColor: categoryColor[current.category as TransactionCategory],
                      color: categoryColor[current.category as TransactionCategory],
                    }}
                    className="text-[10px]"
                  >
                    {categoryLabel[current.category as TransactionCategory]}
                  </Badge>
                </div>
              )}
            </div>

            {/* Salary suggestion (when income matches known recurring) */}
            {showSalaryButtons && (
              <div className="rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-3">
                <p className="mb-2 text-xs font-semibold">
                  💰 Cette transaction ressemble à un salaire — auquel ?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {matchingIncomes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pickSalary(m.id, m.label)}
                      disabled={pending}
                      className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-success)]/40 bg-background p-2.5 text-left text-xs transition-colors hover:border-foreground disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        {m.close && <span className="text-[10px]">⭐</span>}
                        <CheckCircle2 className="size-3.5 text-[var(--color-success)]" />
                        <span className="font-medium">{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          ~{formatEUR(m.amount)}/mois
                        </span>
                      </span>
                      <span className="text-[10px] text-muted-foreground">lier + règle</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Internal-transfer suggestion (when description hints at it) */}
            {showTransferButtons && (
              <div className="rounded-lg border border-[var(--chart-2)]/40 bg-[var(--chart-2)]/5 p-3">
                <p className="mb-2 text-xs font-semibold">
                  ↔ Cette transaction ressemble à un virement vers un autre de tes comptes
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {householdAccounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => pickTransfer(a.id, a.name)}
                      disabled={pending}
                      className="flex items-center justify-between gap-2 rounded-md border border-[var(--chart-2)]/40 bg-background p-2.5 text-left text-xs transition-colors hover:border-foreground disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="size-3.5 text-[var(--chart-2)]" />
                        <span className="font-medium">Vers {a.name}</span>
                        <span className="text-[10px] text-muted-foreground">({a.kind})</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        crée règle + applique aux similaires
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick-pick category */}
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Choisis une catégorie. Tous les futurs prélèvements de la même contrepartie seront
                auto-classés.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {quickList.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pickQuick(c)}
                    disabled={pending}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-left text-xs transition-colors hover:border-foreground hover:bg-accent/40 disabled:opacity-50"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: categoryColor[c] }}
                    />
                    <span className="flex-1 font-medium">{categoryLabel[c]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              <span>
                Besoin de lier à une société BCE ou de choisir une autre catégorie ?
              </span>
              <Button size="sm" variant="outline" onClick={() => setAdvanced(true)}>
                Plus d&apos;options
              </Button>
            </div>
          </SheetBody>
          <SheetFooter className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0 || pending}
            >
              <ChevronLeft className="size-4" /> Précédent
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={advance} disabled={pending}>
                <SkipForward className="size-3.5" /> Passer
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Fermer
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <TransactionEditDialog
        open={advanced}
        onOpenChange={(o) => {
          setAdvanced(o);
          if (!o) advance();
        }}
        cashflow={current}
        householdAccounts={householdAccounts}
        householdCharges={householdCharges}
        householdIncomes={householdIncomes}
      />
    </>
  );
}
