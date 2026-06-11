import Link from "next/link";
import { getPrimaryHousehold, getAccounts } from "@/lib/queries";
import {
  getFinancialProfile,
  getBudgetEnvelopes,
  getFixedCharges,
  getIncomeSources,
} from "@/lib/cashflow/data";
import { isLiability } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { ArrowLeft, Sparkles, ArrowRight } from "lucide-react";
import {
  SetupForm,
  type EnvelopeData,
  type ProfileData,
  type AccountOption,
  type FixedChargeData,
  type IncomeData,
} from "./setup-form";

export const dynamic = "force-dynamic";

export default async function CashflowSetupPage() {
  const h = await getPrimaryHousehold();
  const [profileRow, envelopeRows, accountRows, fixedRows, incomeRows] = await Promise.all([
    getFinancialProfile(h.id),
    getBudgetEnvelopes(h.id),
    getAccounts(h.id),
    getFixedCharges(h.id),
    getIncomeSources(h.id),
  ]);

  const incomes: IncomeData[] = incomeRows.map((i) => ({
    id: i.id,
    label: i.label,
    amount: i.amount,
    dayOfMonth: i.dayOfMonth,
    isVariable: i.isVariable,
    floorAmount: i.floorAmount,
    paidInAdvance: i.paidInAdvance,
  }));

  const profile: ProfileData = {
    bufferAmount: profileRow?.bufferAmount ?? 0,
    savingsTargetMode: profileRow?.savingsTargetMode ?? "max",
    savingsTargetAmount: profileRow?.savingsTargetAmount ?? null,
    defaultRolloverPolicy: profileRow?.defaultRolloverPolicy ?? "to_savings",
    spendingAccountId: profileRow?.spendingAccountId ?? null,
  };

  const accounts: AccountOption[] = accountRows
    .filter((a) => !a.archivedAt && !isLiability(a.kind))
    .map((a) => ({ id: a.id, name: a.name, kind: a.kind }));

  const fixedCharges: FixedChargeData[] = fixedRows
    .map((f) => ({
      id: f.id,
      label: f.label,
      category: f.category,
      amount: f.amount,
      frequency: f.frequency,
      firstDate: (f.startDate as unknown as Date).toISOString().slice(0, 10),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const envelopes: EnvelopeData[] = envelopeRows.map((e) => ({
    id: e.id,
    label: e.label,
    category: e.category,
    monthlyAmount: e.monthlyAmount,
    cadence: e.cadence,
    occurrencesPerMonth: e.occurrencesPerMonth,
    rolloverPolicy: e.rolloverPolicy,
  }));

  return (
    <>
      <PageHeader
        title="Configurer Cap"
        subtitle="Profil, coussin et enveloppes variables"
        action={
          <Link
            href="/cashflow"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            <ArrowLeft className="size-3.5" /> Retour au dashboard
          </Link>
        }
      />
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link
            href="/cashflow/onboarding"
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-primary/5 p-4 transition-colors hover:bg-primary/10"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Audit guidé</div>
                <div className="text-xs text-muted-foreground">
                  Laisse-toi guider en quelques minutes — calcule ta capacité d&apos;épargne et
                  remplit tout d&apos;un coup.
                </div>
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
          <SetupForm
            profile={profile}
            envelopes={envelopes}
            accounts={accounts}
            fixedCharges={fixedCharges}
            incomes={incomes}
          />
        </div>
      </div>
    </>
  );
}
