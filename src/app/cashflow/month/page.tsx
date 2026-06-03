import Link from "next/link";
import { getPrimaryHousehold } from "@/lib/queries";
import { getMonthOverview } from "@/lib/cashflow/data";
import { PageHeader } from "@/components/page-header";
import { formatEUR } from "@/lib/format";
import { ArrowLeft, Droplets } from "lucide-react";
import { MonthActions } from "./month-actions";

export const dynamic = "force-dynamic";

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export default async function CashflowMonthPage() {
  const h = await getPrimaryHousehold();
  const today = new Date();
  const o = await getMonthOverview(h.id, today);
  const monthLabel = `${MONTHS_FR[today.getUTCMonth()]} ${today.getUTCFullYear()}`;
  const status: "none" | "open" | "closed" = o.cycle
    ? (o.cycle.status as "open" | "closed")
    : "none";

  const variableConsumed = o.envelopeLines.reduce((s, e) => s + e.consumed, 0);
  const variablePlanned = o.envelopeLines.reduce((s, e) => s + e.planned, 0);

  return (
    <>
      <PageHeader
        title="Le mois"
        subtitle={monthLabel}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/cashflow"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <ArrowLeft className="size-3.5" /> Dashboard
            </Link>
            <MonthActions status={status} />
          </div>
        }
      />

      <div className="space-y-6 p-4 md:p-8">
        {/* Statut du cycle */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Statut
              </div>
              <div className="mt-0.5 text-lg font-semibold">
                {status === "none"
                  ? "Mois non ouvert"
                  : status === "open"
                    ? "En cours"
                    : "Clôturé"}
              </div>
            </div>
            {o.cycle && status === "closed" && o.cycle.varianceVsPlan !== null && (
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Écart au plan
                </div>
                <div
                  className={`numeric text-lg font-semibold tabular-nums ${
                    o.cycle.varianceVsPlan >= 0
                      ? "text-[var(--color-success)]"
                      : "text-destructive"
                  }`}
                >
                  {o.cycle.varianceVsPlan >= 0 ? "+" : ""}
                  {formatEUR(o.cycle.varianceVsPlan)}
                </div>
              </div>
            )}
          </div>
          {status === "none" && (
            <p className="mt-3 text-sm text-muted-foreground">
              Ouvre le mois pour figer ton plan (revenus, fixes, enveloppes) et pouvoir le
              comparer au réel à la clôture.
            </p>
          )}
        </section>

        {/* Aperçu du débordement (Phase 5) */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Droplets className="size-4 text-[var(--color-success)]" />
            <h2 className="text-base font-semibold">Débordement projeté</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Si le mois se terminait maintenant, ce que tu n&apos;as pas dépensé partirait vers
            ton épargne.
          </p>
          <div className="mt-3 text-3xl font-semibold tabular-nums text-[var(--color-success)]">
            {formatEUR(o.rolloverPreview.toSavings)}
          </div>
          {Object.keys(o.rolloverPreview.carryOver).length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              + reports d&apos;enveloppes :{" "}
              {formatEUR(
                Object.values(o.rolloverPreview.carryOver).reduce((s, v) => s + v, 0),
              )}
            </p>
          )}
        </section>

        {/* Plan vs réel — enveloppes */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Enveloppes · consommé / prévu
          </h2>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {o.envelopeLines.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Aucune enveloppe — configure-les depuis Cap.
              </div>
            )}
            {o.envelopeLines.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium">{e.label}</span>
                <span className="numeric tabular-nums text-muted-foreground">
                  {formatEUR(e.consumed)} / {formatEUR(e.planned)}
                </span>
              </div>
            ))}
            {o.envelopeLines.length > 0 && (
              <div className="flex items-center justify-between bg-muted/30 px-4 py-2.5 text-sm font-medium">
                <span>Total variable</span>
                <span className="numeric tabular-nums">
                  {formatEUR(variableConsumed)} / {formatEUR(variablePlanned)}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Timeline du mois */}
        {o.dashboard.upcoming.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">À venir</h2>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {o.dashboard.upcoming.map((u, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-7 text-center text-xs tabular-nums text-muted-foreground">
                      {String(u.day).padStart(2, "0")}
                    </span>
                    <span className="font-medium">{u.label}</span>
                  </div>
                  <span
                    className={`numeric tabular-nums font-medium ${
                      u.kind === "income" ? "text-[var(--color-success)]" : ""
                    }`}
                  >
                    {u.kind === "income" ? "+" : "−"}
                    {formatEUR(u.amount)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
