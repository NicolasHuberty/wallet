"use client";

import Link from "next/link";
import { ArrowLeft, Pencil, Layers, Tag, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatEUR, formatDateFR } from "@/lib/format";
import {
  categoryColor,
  categoryLabel,
  type TransactionCategory,
} from "@/lib/transaction-categorizer";
import type { PacingColor, PacingState } from "@/lib/cashflow/pacing";
import type { EnvelopeView } from "@/lib/cashflow/assemble";
import type { MonthTransaction } from "@/lib/cashflow/month-expenses";
import { PosteDialog } from "@/components/poste-dialog";
import type { Poste } from "@/lib/postes";

const COLOR_VAR: Record<PacingColor, string> = {
  neutral: "var(--muted-foreground)",
  green: "var(--color-success)",
  yellow: "var(--chart-4, #d4a017)",
  orange: "#e08300",
  red: "var(--destructive)",
};

const PACING_TEXT: Record<PacingState, string> = {
  neutral: "Pas de budget défini sur cette enveloppe.",
  on_track: "Tu es dans le rythme pour ce mois.",
  slightly_fast: "Un peu rapide — surveille la cadence.",
  fast: "Tu brûles vite : à ce rythme l'enveloppe sera dépassée.",
  over: "Enveloppe dépassée ce mois-ci.",
};

const ROLLOVER_LABEL: Record<string, string> = {
  to_savings: "Le reste part vers l'épargne en fin de mois",
  accumulate: "Le reste s'accumule sur le mois suivant",
  reset: "Le reste est remis à zéro chaque mois",
};

export function EnvelopeDetail({
  envelope,
  transactions,
  rolloverPolicy,
  poste,
}: {
  envelope: EnvelopeView;
  transactions: MonthTransaction[];
  rolloverPolicy: string | null;
  poste: Poste | null;
}) {
  const accent = COLOR_VAR[envelope.color];
  const pct = envelope.planned > 0 ? Math.min(100, (envelope.consumed / envelope.planned) * 100) : 0;
  const over = envelope.pacing.overspent > 0;

  return (
    <div className="space-y-5">
      <Link
        href="/cashflow"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Retour au Cap
      </Link>

      {/* En-tête + jauge */}
      <section className="rounded-xl border border-border bg-card p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Layers className="size-3.5" /> Enveloppe variable
            </div>
            <h2 className="mt-1 text-xl font-semibold">{envelope.label}</h2>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Tag className="size-3" /> {envelope.category}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="numeric text-2xl font-semibold tabular-nums">
              {formatEUR(envelope.consumed)}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {formatEUR(envelope.planned)}
              </span>
            </div>
            {poste && (
              <PosteDialog
                poste={poste}
                trigger={
                  <Button size="sm" variant="outline">
                    <Pencil className="size-3.5" /> Modifier
                  </Button>
                }
              />
            )}
          </div>
        </div>

        <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: accent }}
          />
        </div>
        <p className="mt-2 text-sm" style={{ color: over ? COLOR_VAR.red : undefined }}>
          {over ? (
            <>Dépassement de {formatEUR(envelope.pacing.overspent)}. </>
          ) : (
            <>
              <span className="font-medium">{formatEUR(envelope.remaining)}</span> restants ·{" "}
            </>
          )}
          <span className="text-muted-foreground">{PACING_TEXT[envelope.pacing.state]}</span>
        </p>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Kpi label="Consommé" value={formatEUR(envelope.consumed)} />
        <Kpi label="Budget" value={formatEUR(envelope.planned)} />
        <Kpi
          label="Reste"
          value={formatEUR(envelope.remaining)}
          tone={over ? "negative" : "positive"}
        />
        <Kpi
          label="Rythme"
          value={`${Math.round(envelope.pacing.velocity * 100)} %`}
          hint="conso / temps écoulé"
          tone={envelope.pacing.velocity > 1.3 ? "negative" : envelope.pacing.velocity <= 1 ? "positive" : undefined}
        />
      </section>

      {rolloverPolicy && ROLLOVER_LABEL[rolloverPolicy] && (
        <p className="text-xs text-muted-foreground">{ROLLOVER_LABEL[rolloverPolicy]}.</p>
      )}

      {/* Transactions captées ce mois */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Receipt className="size-4 text-muted-foreground" /> Dépenses du mois
          </h3>
          <span className="text-xs text-muted-foreground">
            {transactions.length} · {formatEUR(transactions.reduce((s, t) => s + t.amount, 0))}
          </span>
        </div>
        {transactions.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Aucune dépense imputée à cette enveloppe ce mois-ci. Depuis{" "}
            <Link href="/cashflow/expenses" className="text-foreground underline">
              Dépenses du mois
            </Link>
            , rapproche une transaction vers cette enveloppe.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="w-16 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {formatDateFR(t.date)}
                  </span>
                  {t.category && (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: categoryColor[t.category as TransactionCategory] }}
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{t.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {t.category ? categoryLabel[t.category as TransactionCategory] : "Saisie manuelle"}
                      {t.accountName ? ` · ${t.accountName}` : ""}
                    </span>
                  </span>
                </div>
                <span className="numeric shrink-0 tabular-nums font-medium text-destructive">
                  {formatEUR(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href={`/postes/${envelope.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        Voir l&apos;historique complet et les règles <ArrowLeft className="size-3.5 rotate-180" />
      </Link>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
        {label}
      </div>
      <div
        className={`numeric mt-1 text-base font-semibold tabular-nums sm:text-lg ${
          tone === "positive"
            ? "text-[var(--color-success)]"
            : tone === "negative"
              ? "text-destructive"
              : ""
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
