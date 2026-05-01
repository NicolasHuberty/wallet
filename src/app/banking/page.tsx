import { PageHeader } from "@/components/page-header";
import { getPrimaryHousehold, getAccounts, getBankConnections } from "@/lib/queries";
import { isConfigured } from "@/lib/gocardless";
import { BankingDashboard } from "./banking-dashboard";

export default async function BankingPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const h = await getPrimaryHousehold();
  const accounts = await getAccounts(h.id);
  const connections = await getBankConnections(h.id);
  const configured = isConfigured();

  return (
    <>
      <PageHeader
        title="Connexions bancaires"
        subtitle="Synchronisation automatique via GoCardless Open Banking (gratuit, PSD2 / EU)"
      />
      <div className="p-4 sm:p-6 md:p-8">
        <BankingDashboard
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            kind: a.kind,
            currentValue: a.currentValue,
            goCardlessAccountId: a.goCardlessAccountId,
            bankConnectionId: a.bankConnectionId,
            lastBankSyncAt: a.lastBankSyncAt as unknown as string | null,
          }))}
          connections={connections.map((c) => ({
            id: c.connection.id,
            institutionId: c.connection.institutionId,
            institutionName: c.connection.institutionName,
            institutionLogo: c.connection.institutionLogo,
            status: c.connection.status,
            acceptedAt: c.connection.acceptedAt as unknown as string | null,
            expiresAt: c.connection.expiresAt as unknown as string | null,
            errorMessage: c.connection.errorMessage,
            linkedAccountIds: c.linkedAccounts.map((a) => a.id),
          }))}
          configured={configured}
          connectedConnectionId={sp.connected ?? null}
          error={sp.error ?? null}
        />
      </div>
    </>
  );
}
