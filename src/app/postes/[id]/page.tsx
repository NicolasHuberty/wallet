import { notFound } from "next/navigation";
import { getPrimaryHousehold, getHouseholdCashflows, getProperties } from "@/lib/queries";
import { getPoste, previewPoste } from "@/lib/postes";
import type { CashflowKind } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { PosteDetail } from "./poste-detail";

export const dynamic = "force-dynamic";

function ym(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function PosteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const h = await getPrimaryHousehold();
  const poste = await getPoste(h.id, id);
  if (!poste) notFound();

  const [rows, props] = await Promise.all([getHouseholdCashflows(h.id), getProperties(h.id)]);
  const preview = previewPoste(
    rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      notes: r.notes,
      category: r.category as never,
      date: r.date,
      kind: r.kind as CashflowKind,
      accountName: r.accountName,
    })),
    { counterpartyPatterns: poste.counterpartyPatterns, txCategories: poste.txCategories },
  );

  // Série mensuelle (dépense captée par mois).
  const byMonth = new Map<string, number>();
  for (const m of preview.matched) byMonth.set(ym(m.date), (byMonth.get(ym(m.date)) ?? 0) + m.amount);
  const monthly = Array.from(byMonth.entries())
    .map(([month, spend]) => ({ month, spend }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const properties = props.map((p) => ({
    id: p.property.id,
    label: p.account.name ?? p.property.address ?? "Bien",
  }));

  // On limite l'échantillon transmis au client (totaux exacts conservés).
  const matched = preview.matched
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 150)
    .map((m) => ({ ...m, date: m.date as unknown as string }));

  return (
    <>
      <PageHeader title={poste.label} subtitle="Détail du poste — budget, transactions et règles" />
      <div className="p-4 md:p-8">
        <PosteDetail
          poste={poste}
          properties={properties}
          monthly={monthly}
          matched={matched}
          totalCount={preview.totalCount}
          totalAmount={preview.totalAmount}
          byPattern={preview.byPattern}
        />
      </div>
    </>
  );
}
