import { getPrimaryHousehold, getHouseholdCashflows } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { SpendingExplorer, type ExplorerRow, type AccountOption } from "./spending-explorer";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const h = await getPrimaryHousehold();
  const raw = await getHouseholdCashflows(h.id);

  const rows: ExplorerRow[] = raw.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    accountName: r.accountName,
    date: r.date as unknown as string,
    amount: r.amount,
    notes: r.notes,
    kind: r.kind,
    category: r.category as ExplorerRow["category"],
    transferToAccountId: r.transferToAccountId,
  }));

  const accounts: AccountOption[] = Array.from(
    new Map(
      raw.map((r) => [r.accountId, { id: r.accountId, name: r.accountName, kind: r.accountKind }]),
    ).values(),
  );

  return (
    <>
      <PageHeader
        title="Analyse"
        subtitle="Cherche, filtre et comprends où part ton argent"
      />
      <div className="p-4 md:p-8">
        <SpendingExplorer rows={rows} accounts={accounts} />
      </div>
    </>
  );
}
