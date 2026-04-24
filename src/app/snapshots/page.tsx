import { PageHeader } from "@/components/page-header";
import { getPrimaryHousehold, getSnapshots } from "@/lib/queries";
import { formatEUR, formatDateFR } from "@/lib/format";
import { SnapshotDialog } from "./snapshot-dialog";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { toDate } from "@/lib/utils";

export default async function SnapshotsPage() {
  const h = await getPrimaryHousehold();
  const snaps = await getSnapshots(h.id);
  const ordered = [...snaps].reverse();

  return (
    <>
      <PageHeader
        title="Historique & snapshots"
        subtitle={`${snaps.length} snapshot${snaps.length > 1 ? "s" : ""} du patrimoine. Recalculés à chaque modification, modifiables à la main.`}
        action={<SnapshotDialog householdId={h.id} />}
      />
      <div className="p-8">
        <section className="rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-3 py-3 text-right font-medium">Actifs</th>
                  <th className="px-3 py-3 text-right font-medium">Passifs</th>
                  <th className="px-3 py-3 text-right font-medium">Net worth</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {ordered.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Aucun snapshot.</td></tr>
                )}
                {ordered.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-none">
                    <td className="px-5 py-3 font-medium">{formatDateFR(toDate(s.date))}</td>
                    <td className="numeric px-3 py-3 text-right">{formatEUR(s.totalAssets)}</td>
                    <td className="numeric px-3 py-3 text-right text-destructive">{formatEUR(s.totalLiabilities)}</td>
                    <td className="numeric px-3 py-3 text-right font-semibold">{formatEUR(s.netWorth)}</td>
                    <td className="px-5 py-3 text-right">
                      <SnapshotDialog
                        householdId={h.id}
                        row={{
                          id: s.id,
                          date: toDate(s.date).toISOString().slice(0, 10),
                          totalAssets: s.totalAssets,
                          totalLiabilities: s.totalLiabilities,
                        }}
                        trigger={<Button size="icon" variant="ghost"><Pencil className="size-4" /></Button>}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
