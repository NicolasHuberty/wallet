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
      <div className="p-4 md:p-8">
        <section className="rounded-xl border border-border bg-card">
          {ordered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground md:p-12">
              Aucun snapshot enregistré pour le moment.
            </div>
          )}

          {/* Desktop table */}
          {ordered.length > 0 && (
            <div className="hidden overflow-x-auto md:block">
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
                  {ordered.map((s) => (
                    <tr key={s.id} className="border-b border-border/60 last:border-none">
                      <td className="px-5 py-3 font-medium">{formatDateFR(toDate(s.date))}</td>
                      <td className="numeric px-3 py-3 text-right tabular-nums">
                        {formatEUR(s.totalAssets)}
                      </td>
                      <td className="numeric px-3 py-3 text-right tabular-nums text-destructive">
                        {formatEUR(s.totalLiabilities)}
                      </td>
                      <td className="numeric px-3 py-3 text-right font-semibold tabular-nums">
                        {formatEUR(s.netWorth)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <SnapshotDialog
                          householdId={h.id}
                          row={{
                            id: s.id,
                            date: toDate(s.date).toISOString().slice(0, 10),
                            totalAssets: s.totalAssets,
                            totalLiabilities: s.totalLiabilities,
                          }}
                          trigger={
                            <Button size="icon" variant="ghost">
                              <Pencil className="size-4" />
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Mobile: stacked card list, most recent first. One strong focus
           * point per card: the net worth value, displayed right-aligned
           * with tabular numerals. */}
          {ordered.length > 0 && (
            <ul className="divide-y divide-border md:hidden">
              {ordered.map((s, i) => {
                const prev = ordered[i + 1]; // older snapshot
                const delta = prev ? s.netWorth - prev.netWorth : 0;
                const deltaClass =
                  delta > 0
                    ? "text-[var(--color-success)]"
                    : delta < 0
                      ? "text-destructive"
                      : "text-muted-foreground";
                return (
                  <li
                    key={s.id}
                    className="flex items-start justify-between gap-3 p-4 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {formatDateFR(toDate(s.date))}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>
                          Actifs{" "}
                          <span className="numeric tabular-nums text-foreground">
                            {formatEUR(s.totalAssets, { compact: true })}
                          </span>
                        </span>
                        <span>
                          Passifs{" "}
                          <span className="numeric tabular-nums text-destructive">
                            {formatEUR(s.totalLiabilities, { compact: true })}
                          </span>
                        </span>
                      </div>
                      {prev && (
                        <div className={`numeric mt-0.5 text-[11px] tabular-nums ${deltaClass}`}>
                          {formatEUR(delta, { signed: true })} vs snapshot précédent
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-start gap-1.5">
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Net
                        </div>
                        <div className="numeric text-base font-semibold tabular-nums">
                          {formatEUR(s.netWorth)}
                        </div>
                      </div>
                      <SnapshotDialog
                        householdId={h.id}
                        row={{
                          id: s.id,
                          date: toDate(s.date).toISOString().slice(0, 10),
                          totalAssets: s.totalAssets,
                          totalLiabilities: s.totalLiabilities,
                        }}
                        trigger={
                          <Button size="icon" variant="ghost" className="size-8">
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
