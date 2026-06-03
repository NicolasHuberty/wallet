import Link from "next/link";
import { getPrimaryHousehold } from "@/lib/queries";
import { getFinancialProfile, getBudgetEnvelopes } from "@/lib/cashflow/data";
import { PageHeader } from "@/components/page-header";
import { ArrowLeft } from "lucide-react";
import { SetupForm, type EnvelopeData, type ProfileData } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function CashflowSetupPage() {
  const h = await getPrimaryHousehold();
  const [profileRow, envelopeRows] = await Promise.all([
    getFinancialProfile(h.id),
    getBudgetEnvelopes(h.id),
  ]);

  const profile: ProfileData = {
    bufferAmount: profileRow?.bufferAmount ?? 0,
    savingsTargetMode: profileRow?.savingsTargetMode ?? "max",
    savingsTargetAmount: profileRow?.savingsTargetAmount ?? null,
    defaultRolloverPolicy: profileRow?.defaultRolloverPolicy ?? "to_savings",
  };

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
        <div className="mx-auto max-w-3xl">
          <SetupForm profile={profile} envelopes={envelopes} />
        </div>
      </div>
    </>
  );
}
