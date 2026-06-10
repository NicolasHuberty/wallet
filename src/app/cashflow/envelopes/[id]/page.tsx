import { notFound } from "next/navigation";
import { getPrimaryHousehold } from "@/lib/queries";
import { getEnvelopeMonthDetail } from "@/lib/cashflow/data";
import { getPoste } from "@/lib/postes";
import { PageHeader } from "@/components/page-header";
import { EnvelopeDetail } from "./envelope-detail";

export const dynamic = "force-dynamic";

export default async function EnvelopeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const h = await getPrimaryHousehold();
  const today = new Date();
  const detail = await getEnvelopeMonthDetail(h.id, id, today);
  if (!detail.envelope) notFound();

  const poste = await getPoste(h.id, id);

  return (
    <>
      <PageHeader
        title={detail.envelope.label}
        subtitle="Enveloppe variable — suivi du mois, transactions et rythme"
      />
      <div className="p-4 md:p-8">
        <EnvelopeDetail
          envelope={detail.envelope}
          transactions={detail.transactions}
          rolloverPolicy={detail.rolloverPolicy}
          poste={poste}
        />
      </div>
    </>
  );
}
