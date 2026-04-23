import { PageHeader } from "@/components/page-header";
import { getPrimaryHousehold, getCharges, getProperties } from "@/lib/queries";
import { formatEUR, formatDateFR } from "@/lib/format";
import { chargeCategoryLabel, chargeCategoryColor } from "@/lib/labels";
import { ChargeDialog, EditChargeButton } from "./charge-dialog";
import { Badge } from "@/components/ui/badge";

export default async function ChargesPage() {
  const h = await getPrimaryHousehold();
  const charges = await getCharges(h.id);
  const props = await getProperties(h.id);
  const propertyOptions = props.map((p) => ({ id: p.property.id, name: p.account.name }));
  const propertyById = Object.fromEntries(propertyOptions.map((p) => [p.id, p]));

  const sorted = [...charges].sort((a, b) => (b.date as unknown as Date).getTime() - (a.date as unknown as Date).getTime());
  const total = charges.reduce((s, c) => s + c.amount, 0);
  const costBasisIncluded = charges.filter((c) => c.includeInCostBasis).reduce((s, c) => s + c.amount, 0);

  const byCat = charges.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + c.amount;
    return acc;
  }, {});

  const yearsMap = charges.reduce<Record<string, number>>((acc, c) => {
    const y = (c.date as unknown as Date).getFullYear().toString();
    acc[y] = (acc[y] ?? 0) + c.amount;
    return acc;
  }, {});
  const years = Object.keys(yearsMap).sort();

  return (
    <>
      <PageHeader
        title="Frais one-shot"
        subtitle="Notaire, droits d'enregistrement, frais de crédit, travaux — impact patrimoine & coût de revient des biens"
        action={<ChargeDialog householdId={h.id} properties={propertyOptions} />}
      />
      <div className="space-y-6 p-8">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Kpi label="Total frais payés" value={formatEUR(total)} sub={`${charges.length} ligne${charges.length > 1 ? "s" : ""}`} />
          <Kpi label="Inclus dans coût de revient" value={formatEUR(costBasisIncluded)} sub={`${charges.filter((c) => c.includeInCostBasis).length} / ${charges.length}`} />
          <Kpi label="Catégories distinctes" value={Object.keys(byCat).length.toString()} />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <section className="rounded-xl border border-border bg-card lg:col-span-3">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-base font-semibold">Timeline</h2>
                <p className="text-xs text-muted-foreground">Ordre chronologique descendant</p>
              </div>
            </div>
            <ul className="divide-y divide-border">
              {sorted.length === 0 && (
                <li className="p-12 text-center text-sm text-muted-foreground">
                  Aucun frais. Commence par ajouter les frais de notaire de ta maison.
                </li>
              )}
              {sorted.map((c) => (
                <li key={c.id} className="flex items-start gap-4 px-5 py-3 text-sm">
                  <div className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: chargeCategoryColor[c.category] }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.label}</span>
                      {!c.includeInCostBasis && <Badge variant="outline" className="text-[10px]">Hors coût de revient</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDateFR(c.date as unknown as Date)}</span>
                      <span>·</span>
                      <Badge variant="secondary" className="text-[10px]">{chargeCategoryLabel[c.category]}</Badge>
                      {c.propertyId && propertyById[c.propertyId] && (
                        <>
                          <span>·</span>
                          <span>🏠 {propertyById[c.propertyId].name}</span>
                        </>
                      )}
                    </div>
                    {c.notes && <div className="mt-1 text-xs text-muted-foreground">{c.notes}</div>}
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
          </section>

          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 text-base font-semibold">Par catégorie</h2>
              {Object.keys(byCat).length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-2.5">
                  {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
                    const pct = total > 0 ? (amount / total) * 100 : 0;
                    return (
                      <li key={cat} className="text-sm">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ backgroundColor: chargeCategoryColor[cat] }} />
                            {chargeCategoryLabel[cat]}
                          </span>
                          <span className="numeric font-medium">{formatEUR(amount)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: chargeCategoryColor[cat] }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {years.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="mb-4 text-base font-semibold">Par année</h2>
                <ul className="space-y-2">
                  {years.map((y) => (
                    <li key={y} className="flex items-center justify-between text-sm">
                      <span>{y}</span>
                      <span className="numeric font-medium">{formatEUR(yearsMap[y])}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="numeric mt-2 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
