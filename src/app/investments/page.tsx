import { PageHeader } from "@/components/page-header";
import { getPrimaryHousehold, getAccounts, getHoldings } from "@/lib/queries";
import { formatEUR } from "@/lib/format";
import { WalletSection } from "./wallet-section";
import { RevolutImportDialog } from "./revolut-import-dialog";
import { FileText } from "lucide-react";

export default async function InvestmentsPage() {
  const h = await getPrimaryHousehold();
  const accounts = await getAccounts(h.id);
  const invAccounts = accounts.filter(
    (a) => !a.archivedAt && (a.kind === "brokerage" || a.kind === "retirement" || a.kind === "crypto")
  );

  const perAccount = await Promise.all(
    invAccounts.map(async (a) => {
      const holdings = await getHoldings(a.id);
      return {
        wallet: {
          id: a.id,
          name: a.name,
          institution: a.institution,
          currentValue: a.currentValue,
          annualYieldPct: a.annualYieldPct,
          monthlyContribution: a.monthlyContribution,
        },
        holdings: holdings.map((h) => ({
          id: h.id,
          ticker: h.ticker,
          name: h.name,
          isin: h.isin,
          allocationPct: h.allocationPct,
        })),
      };
    })
  );

  const totalValue = perAccount.reduce((s, p) => s + p.wallet.currentValue, 0);
  const totalDCA = perAccount.reduce(
    (s, p) => s + (p.wallet.monthlyContribution ?? 0),
    0
  );
  const importableAccounts = invAccounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind }));

  return (
    <>
      <PageHeader
        title="Investissements"
        subtitle={`${perAccount.length} wallet${perAccount.length > 1 ? "s" : ""} · valeur totale ${formatEUR(totalValue)} · DCA ${formatEUR(totalDCA)}/mois`}
        action={
          importableAccounts.length > 0 ? (
            <RevolutImportDialog accounts={importableAccounts} />
          ) : undefined
        }
      />
      <div className="space-y-6 p-4 md:p-8">
        <section className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-[11px] text-muted-foreground md:text-xs">
          <div className="flex min-w-0 items-start gap-2">
            <FileText className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} />
            <span>
              Chaque wallet a un <b>total</b>, un <b>rendement annuel</b> estimé et un <b>DCA
              mensuel global</b>. Les ETF ne portent qu&apos;une <b>allocation %</b>. Import
              Revolut supporté.
            </span>
          </div>
          {importableAccounts.length > 0 && <RevolutImportDialog accounts={importableAccounts} />}
        </section>

        {perAccount.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground md:p-12">
            Crée d&apos;abord un compte de type <em>Portefeuille-titres</em>, <em>Pension</em> ou{" "}
            <em>Crypto</em> dans la page Comptes.
          </div>
        )}

        {perAccount.map(({ wallet, holdings }) => (
          <WalletSection key={wallet.id} wallet={wallet} holdings={holdings} />
        ))}
      </div>
    </>
  );
}
