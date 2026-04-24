import { PageHeader } from "@/components/page-header";
import { getPrimaryHousehold, getHouseholdMembers } from "@/lib/queries";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const h = await getPrimaryHousehold();
  const members = await getHouseholdMembers(h.id);
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Ménage, membres, devise." />
      <div className="p-4 sm:p-6 md:p-8">
        <SettingsClient household={h} members={members} />
      </div>
    </>
  );
}
