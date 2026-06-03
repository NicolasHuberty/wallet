import { getPrimaryHousehold, getProperties } from "@/lib/queries";
import { listPostes } from "@/lib/postes";
import { PageHeader } from "@/components/page-header";
import { PostesView } from "./postes-view";

export const dynamic = "force-dynamic";

export default async function PostesPage() {
  const h = await getPrimaryHousehold();
  const [postes, props] = await Promise.all([listPostes(h.id), getProperties(h.id)]);
  const properties = props.map((p) => ({
    id: p.property.id,
    label: p.account.name ?? p.property.address ?? "Bien",
  }));

  return (
    <>
      <PageHeader
        title="Postes"
        subtitle="Tes enveloppes, charges fixes et frais ponctuels — un seul endroit"
      />
      <div className="p-4 md:p-8">
        <PostesView postes={postes} properties={properties} />
      </div>
    </>
  );
}
