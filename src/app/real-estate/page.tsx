import { PageHeader } from "@/components/page-header";
import { getPrimaryHousehold, getProperties, getPropertyCharges } from "@/lib/queries";
import { db, schema } from "@/db";
import { eq, asc } from "drizzle-orm";
import { formatEUR, formatPct, formatDateFR } from "@/lib/format";
import { EditPropertyButton } from "./property-dialog";
import { PropertyWizard } from "./property-wizard";
import { MortgageDialog, EditMortgageButton, GenerateAmortizationButton } from "./mortgage-dialog";
import { ImportAmortizationButton } from "./amortization-import";
import { AmortizationCharts } from "./amortization-charts";
import { PrepaymentSimulator } from "./prepayment-simulator";
import { ChargeDialog, EditChargeButton } from "@/app/charges/charge-dialog";
import { chargeCategoryLabel, chargeCategoryColor } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";

export default async function RealEstatePage() {
  const h = await getPrimaryHousehold();
  const props = await getProperties(h.id);
  const propertyOptions = props.map((p) => ({ id: p.property.id, name: p.account.name }));

  const totalValue = props.reduce((s, p) => s + p.property.currentValue, 0);
  const totalDebt = props.reduce((s, p) => s + (p.mortgage?.remainingBalance ?? 0), 0);
  const equity = totalValue - totalDebt;

  return (
    <>
      <PageHeader
        title="Immobilier"
        subtitle={`${props.length} bien${props.length > 1 ? "s" : ""} · équité ${formatEUR(equity)}`}
        action={<PropertyWizard householdId={h.id} />}
      />
      <div className="space-y-6 p-8">
        {props.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Ajoutez votre premier bien pour le suivre.
          </div>
        )}
        {props.map(async ({ account, property, mortgage }) => {
          const years = (Date.now() - (property.purchaseDate as unknown as Date).getTime()) / (365.25 * 864e5);
          const charges = await getPropertyCharges(property.id);
          const costBasisFees = charges.filter((c) => c.includeInCostBasis).reduce((s, c) => s + c.amount, 0);
          const totalFees = charges.reduce((s, c) => s + c.amount, 0);
          const adjustedBasis = property.purchasePrice + costBasisFees;
          const grossGain = property.currentValue - property.purchasePrice;
          const netGain = property.currentValue - adjustedBasis;
          const gainPct = property.purchasePrice > 0 ? (grossGain / property.purchasePrice) * 100 : 0;
          const netGainPct = adjustedBasis > 0 ? (netGain / adjustedBasis) * 100 : 0;
          const annualizedPct = years > 0 ? (Math.pow(property.currentValue / property.purchasePrice, 1 / years) - 1) * 100 : 0;

          const entries = mortgage
            ? await db.select().from(schema.amortizationEntry).where(eq(schema.amortizationEntry.mortgageId, mortgage.id)).orderBy(asc(schema.amortizationEntry.dueDate))
            : [];

          return (
            <section key={account.id} className="rounded-xl border border-border bg-card">
              <div className="flex items-start justify-between border-b border-border p-5">
                <div>
                  <h2 className="text-lg font-semibold">{account.name}</h2>
                  <p className="text-xs text-muted-foreground">{property.address ?? ""}{property.surfaceSqm ? ` · ${property.surfaceSqm} m²` : ""}</p>
                </div>
                <EditPropertyButton
                  householdId={h.id}
                  property={{
                    id: property.id,
                    accountId: account.id,
                    name: account.name,
                    address: property.address,
                    purchasePrice: property.purchasePrice,
                    purchaseDate: (property.purchaseDate as unknown as Date).toISOString().slice(0, 10),
                    currentValue: property.currentValue,
                    annualAppreciationPct: property.annualAppreciationPct,
                    monthlyFees: property.monthlyFees,
                    surfaceSqm: property.surfaceSqm,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-px bg-border/60 md:grid-cols-5">
                <Metric label="Valeur actuelle" value={formatEUR(property.currentValue)} />
                <Metric label="Prix d'achat" value={formatEUR(property.purchasePrice)} sub={formatDateFR(property.purchaseDate as unknown as Date)} />
                <Metric
                  label="Coût de revient"
                  value={formatEUR(adjustedBasis)}
                  sub={costBasisFees > 0 ? `+ ${formatEUR(costBasisFees)} frais` : "sans frais"}
                />
                <Metric
                  label={costBasisFees > 0 ? "Plus-value nette" : "Plus-value"}
                  value={formatEUR(netGain, { signed: true })}
                  sub={costBasisFees > 0
                    ? `brute ${formatEUR(grossGain, { signed: true })} · ${formatPct(netGainPct)}`
                    : `${formatPct(gainPct)} · ${formatPct(annualizedPct)} /an`}
                  positive={netGain >= 0}
                  negative={netGain < 0}
                />
                <Metric label="Frais mensuels" value={formatEUR(property.monthlyFees)} sub={`≈ ${formatEUR(property.monthlyFees * 12)}/an`} />
              </div>

              <div className="border-t border-border p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Frais one-shot associés</h3>
                    <p className="text-xs text-muted-foreground">
                      {charges.length} entrée{charges.length > 1 ? "s" : ""} · {formatEUR(totalFees)} payés
                      {costBasisFees !== totalFees && ` · dont ${formatEUR(costBasisFees)} dans le coût de revient`}
                    </p>
                  </div>
                  <ChargeDialog householdId={h.id} properties={propertyOptions} defaultPropertyId={property.id} />
                </div>
                {charges.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucun frais — ajoute les frais de notaire, droits d'enregistrement, travaux, etc.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {[...charges].sort((a, b) => (b.date as unknown as Date).getTime() - (a.date as unknown as Date).getTime()).map((c) => (
                      <li key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="size-2 rounded-full" style={{ backgroundColor: chargeCategoryColor[c.category] }} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{c.label}</span>
                              {!c.includeInCostBasis && <Badge variant="outline" className="text-[10px]">Hors coût</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {chargeCategoryLabel[c.category]} · {formatDateFR(c.date as unknown as Date)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="numeric font-medium">{formatEUR(c.amount)}</div>
                          <EditChargeButton
                            householdId={h.id}
                            properties={propertyOptions}
                            charge={{
                              id: c.id,
                              date: (c.date as unknown as Date).toISOString().slice(0, 10),
                              label: c.label,
                              category: c.category,
                              amount: c.amount,
                              accountId: c.accountId,
                              propertyId: c.propertyId,
                              includeInCostBasis: c.includeInCostBasis,
                              notes: c.notes,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-border p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Prêt hypothécaire</h3>
                  {!mortgage && <MortgageDialog householdId={h.id} propertyId={property.id} />}
                </div>
                {!mortgage ? (
                  <p className="text-xs text-muted-foreground">Aucun prêt associé.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-px rounded-lg overflow-hidden bg-border/60 md:grid-cols-4 mb-4">
                      <Metric label="Solde restant" value={formatEUR(mortgage.remainingBalance)} negative />
                      <Metric label="Mensualité" value={formatEUR(mortgage.monthlyPayment)} />
                      <Metric label="Taux" value={`${mortgage.interestRatePct.toFixed(2)} %`} />
                      <Metric label="Durée" value={`${mortgage.termMonths} mois`} sub={`début ${formatDateFR(mortgage.startDate as unknown as Date)}`} />
                    </div>

                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">Tableau d'amortissement</div>
                        <div className="text-xs text-muted-foreground">{entries.length > 0 ? `${entries.length} échéances` : "— non généré —"}</div>
                      </div>
                      <div className="flex gap-2">
                        <ImportAmortizationButton mortgageId={mortgage.id} startDate={(mortgage.startDate as unknown as Date).toISOString().slice(0, 10)} />
                        <GenerateAmortizationButton mortgageId={mortgage.id} />
                        <EditMortgageButton
                          householdId={h.id}
                          mortgage={{
                            id: mortgage.id,
                            propertyId: mortgage.propertyId,
                            name: account.name,
                            lender: mortgage.lender,
                            principal: mortgage.principal,
                            interestRatePct: mortgage.interestRatePct,
                            termMonths: mortgage.termMonths,
                            startDate: (mortgage.startDate as unknown as Date).toISOString().slice(0, 10),
                            monthlyPayment: mortgage.monthlyPayment,
                            remainingBalance: mortgage.remainingBalance,
                          }}
                        />
                      </div>
                    </div>

                    {entries.length === 0 && mortgage.remainingBalance > 0 && (
                      <PrepaymentSimulator
                        mortgage={{
                          principalRemaining: mortgage.remainingBalance,
                          annualRate: mortgage.interestRatePct,
                          monthsRemaining: mortgage.termMonths,
                          monthlyPayment: mortgage.monthlyPayment,
                        }}
                        startDate={new Date(
                          new Date().getFullYear(),
                          new Date().getMonth() + 1,
                          1,
                        ).toISOString()}
                      />
                    )}

                    {entries.length > 0 && (
                      <>
                        <AmortizationCharts
                          entries={entries.map((e) => ({
                            dueDate: (e.dueDate as unknown as Date).toISOString(),
                            payment: e.payment,
                            principal: e.principal,
                            interest: e.interest,
                            balance: e.balance,
                          }))}
                          initialPrincipal={mortgage.principal}
                        />

                        {(() => {
                          const now = new Date();
                          // Find the first entry still to be paid (due date >= today).
                          // Fallback to the first entry if the loan hasn't started yet.
                          const futureEntries = entries.filter((e) => (e.dueDate as unknown as Date).getTime() >= now.getTime());
                          const nextEntry = futureEntries[0] ?? entries[entries.length - 1];
                          const paidCount = entries.length - futureEntries.length;
                          const monthsRemaining = Math.max(0, entries.length - paidCount);
                          // Starting balance for the simulation = balance BEFORE the next
                          // payment (i.e. balance after the previous entry). If no entry
                          // is paid yet, that's the full principal.
                          const idx = entries.indexOf(nextEntry);
                          const startingBalance = idx > 0
                            ? entries[idx - 1].balance
                            : mortgage.principal;
                          const simStart = new Date(
                            (nextEntry.dueDate as unknown as Date).getFullYear(),
                            (nextEntry.dueDate as unknown as Date).getMonth(),
                            1,
                          );
                          return (
                            <PrepaymentSimulator
                              mortgage={{
                                principalRemaining: startingBalance,
                                annualRate: mortgage.interestRatePct,
                                monthsRemaining,
                                monthlyPayment: mortgage.monthlyPayment,
                              }}
                              startDate={simStart.toISOString()}
                            />
                          );
                        })()}

                        <details className="mt-4 rounded-lg border border-border">
                          <summary className="cursor-pointer border-b border-border bg-muted/30 px-4 py-2 text-sm font-medium">
                            Détail échéance par échéance ({entries.length})
                          </summary>
                          <div className="max-h-[500px] overflow-auto">
                            <table className="w-full text-sm">
                              <thead className="sticky top-0 bg-card">
                                <tr className="border-b border-border text-xs text-muted-foreground">
                                  <th className="px-3 py-2 text-left font-medium">#</th>
                                  <th className="px-3 py-2 text-left font-medium">Date</th>
                                  <th className="px-3 py-2 text-right font-medium">Mensualité</th>
                                  <th className="px-3 py-2 text-right font-medium">Capital</th>
                                  <th className="px-3 py-2 text-right font-medium">Intérêts</th>
                                  <th className="px-3 py-2 text-right font-medium">Solde</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entries.map((e, i) => (
                                  <tr key={e.id} className="border-b border-border/60 last:border-none">
                                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                                    <td className="px-3 py-1.5">{formatDateFR(e.dueDate as unknown as Date)}</td>
                                    <td className="numeric px-3 py-1.5 text-right">{formatEUR(e.payment)}</td>
                                    <td className="numeric px-3 py-1.5 text-right">{formatEUR(e.principal)}</td>
                                    <td className="numeric px-3 py-1.5 text-right text-muted-foreground">{formatEUR(e.interest)}</td>
                                    <td className="numeric px-3 py-1.5 text-right font-medium">{formatEUR(e.balance)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </>
                    )}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function Metric({ label, value, sub, positive, negative }: { label: string; value: string; sub?: string; positive?: boolean; negative?: boolean }) {
  const tone = positive ? "text-[var(--color-success)]" : negative ? "text-destructive" : "";
  return (
    <div className="bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`numeric mt-1 text-lg font-semibold ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
