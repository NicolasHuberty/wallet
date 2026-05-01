"use client";

import { useState } from "react";
import { Info, ChevronDown } from "lucide-react";
import { formatEUR } from "@/lib/format";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PerfReport } from "@/lib/performance";

type Props = {
  report: PerfReport;
  annualYieldPct: number | null;
};

const fmtPct = (x: number | null, opts: { signed?: boolean } = {}) => {
  if (x == null || !isFinite(x)) return "—";
  const v = x * 100;
  const sign = opts.signed && v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)} %`;
};

export function InvestmentPerfPanel({ report, annualYieldPct }: Props) {
  const [explainerOpen, setExplainerOpen] = useState(false);

  const twrVsYield =
    report.twrAnnualized != null && annualYieldPct != null
      ? report.twrAnnualized - annualYieldPct / 100
      : null;

  return (
    <TooltipProvider delay={150}>
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 md:mb-4">
          <h2 className="text-base font-semibold">Performance détaillée</h2>
          <div className="text-xs text-muted-foreground">
            {report.daysCovered.toFixed(0)} jours · {report.periodsUsed} sous-périodes TWR
            {!report.hasEnoughData && (
              <span className="ml-2 inline-block rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                données limitées
              </span>
            )}
          </div>
        </div>

        {/* Money flow row */}
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <Kpi
            label="Dépôts nets"
            tooltip="Argent que tu as personnellement injecté dans le compte (dépôts moins retraits). N'inclut pas les dividendes ni les intérêts."
            value={formatEUR(report.netDeposits)}
            hint={`${formatEUR(report.deposits)} dépôts · ${formatEUR(report.withdrawals)} retraits`}
          />
          <Kpi
            label="Plus-value"
            tooltip="Différence entre la valeur actuelle et tes dépôts nets. C'est ton gain (ou perte) en euros, indépendamment de la durée."
            value={formatEUR(report.totalReturnAbs, { signed: true })}
            hint={fmtPct(report.totalReturnPct, { signed: true })}
            tone={report.totalReturnAbs >= 0 ? "positive" : "negative"}
          />
          <Kpi
            label="Dividendes"
            tooltip="Total des dividendes / coupons reçus sur la période. Déjà inclus dans la valeur du compte."
            value={formatEUR(report.dividends)}
            hint={
              report.dividends > 0
                ? `~${formatEUR((report.dividends / Math.max(report.netDeposits, 1)) * 100)} pour 100 € investis`
                : undefined
            }
          />
          <Kpi
            label="Frais de gestion"
            tooltip="Frais prélevés par le broker (Robo Management Fee chez Revolut, frais de courtage, etc.)."
            value={formatEUR(report.fees)}
            hint={
              report.fees > 0 && report.netDeposits > 0
                ? `${((report.fees / report.netDeposits) * 100).toFixed(2)} % des dépôts`
                : undefined
            }
            tone={report.fees > 0 ? "negative" : undefined}
          />
        </div>

        {/* Performance row */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <Kpi
            label="Rendement annoncé"
            tooltip="Le taux que tu as déclaré comme attendu pour ce compte (dans les paramètres DCA). C'est ta cible — pas un calcul."
            value={annualYieldPct != null ? `${annualYieldPct.toFixed(2)} %` : "—"}
            hint="cible déclarée"
          />
          <Kpi
            label="TWR annualisé"
            tooltip="Time-Weighted Return : rendement de marché annualisé, neutralisé du timing de tes dépôts. Compare cet indicateur au rendement annoncé pour juger la qualité du portefeuille (vs. tes choix de timing)."
            value={fmtPct(report.twrAnnualized)}
            hint="performance pure"
            tone={
              report.twrAnnualized != null
                ? report.twrAnnualized >= 0
                  ? "positive"
                  : "negative"
                : undefined
            }
          />
          <Kpi
            label="XIRR"
            tooltip="Money-Weighted Return (TIR personnel). Tient compte du moment précis de chaque dépôt/retrait — c'est le taux qui décrit TON gain réel selon TES timings. Si XIRR > TWR, tu as bien chronométré tes apports."
            value={fmtPct(report.xirr)}
            hint="ton TIR perso"
            tone={
              report.xirr != null
                ? report.xirr >= 0
                  ? "positive"
                  : "negative"
                : undefined
            }
          />
          <Kpi
            label="vs annoncé"
            tooltip="Écart entre le TWR annualisé et ton rendement annoncé. Positif = tu fais mieux que ta cible. Négatif = tu fais moins bien (peut être normal sur des périodes courtes ou volatiles)."
            value={twrVsYield != null ? fmtPct(twrVsYield, { signed: true }) : "—"}
            hint={twrVsYield != null ? (twrVsYield >= 0 ? "au-dessus" : "en-dessous") : undefined}
            tone={
              twrVsYield != null ? (twrVsYield >= 0 ? "positive" : "negative") : undefined
            }
          />
        </div>

        {/* Inline explainer */}
        <button
          type="button"
          onClick={() => setExplainerOpen((s) => !s)}
          className="mt-4 flex w-full items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <Info className="size-3.5" />
            Comprendre chaque indicateur
          </span>
          <ChevronDown
            className={cn("size-3.5 transition-transform", explainerOpen && "rotate-180")}
          />
        </button>
        {explainerOpen && (
          <div className="mt-2 grid gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed md:p-4">
            <Explainer
              title="Dépôts nets"
              body="Somme des dépôts personnels moins les retraits. C'est l'argent que tu as toi-même mis sur le compte. Les dividendes, intérêts et plus-values latentes ne sont PAS comptés ici — c'est volontaire, on cherche à isoler ta contribution propre pour pouvoir mesurer la performance pure."
            />
            <Explainer
              title="Plus-value (et %)"
              body={`Différence entre la valeur actuelle (${formatEUR(report.currentValue)}) et tes dépôts nets (${formatEUR(report.netDeposits)}). C'est ton gain en euros sur l'ensemble de l'horizon. Le pourcentage rapporte ce gain à tes dépôts. Indicateur simple mais qui ne tient pas compte de la durée — c'est pour ça qu'on calcule aussi TWR/XIRR.`}
            />
            <Explainer
              title="Dividendes / Frais"
              body="Mouvements internes au compte. Les dividendes augmentent ta valeur, les frais la diminuent. Ils sont déjà inclus dans la valeur actuelle, donc pas besoin de les ajouter manuellement."
            />
            <Explainer
              title="Rendement annoncé (cible)"
              body="C'est le taux que tu as toi-même déclaré comme attendu (paramètres DCA, ex. 7 %/an pour un ETF actions). Sert juste de point de comparaison pour les indicateurs de perf calculés."
            />
            <Explainer
              title="TWR annualisé — Time-Weighted Return"
              body="Rendement de marché du compte, annualisé. On découpe la période en sous-périodes à chaque dépôt/retrait, on calcule le rendement de chaque sous-période en isolant l'effet de tes apports, puis on les chaîne géométriquement. Avantage : c'est l'indicateur que les fonds publient — il ne dépend QUE des choix de placement, pas du calendrier de tes dépôts. Il répond à la question : « combien ce portefeuille a-t-il rapporté à un investisseur fictif qui aurait laissé son argent sans bouger ? »"
            />
            <Explainer
              title="XIRR — Money-Weighted Return"
              body="Taux interne de rendement qui considère ENSEMBLE le calendrier de tes dépôts/retraits ET la performance. C'est ton rendement personnel : si tu as déposé juste avant une hausse, ton XIRR sera plus élevé que le TWR. Si tu as déposé pile au sommet, ton XIRR sera plus bas. Formule : taux qui annule la VAN de la série de cash flows."
            />
            <Explainer
              title="vs annoncé"
              body="TWR annualisé moins ton rendement annoncé. Permet de voir d'un coup d'œil si le marché tient ses promesses. Attention : sur peu de mois c'est très volatile (un mois moyen peut donner ±20 %). Devient significatif après ~2 ans de recul."
            />
            <p className="rounded border border-border bg-card p-2 text-[11px] text-muted-foreground">
              <strong className="text-foreground">Quel indicateur utiliser ?</strong> TWR pour juger
              le portefeuille (les fonds, les ETFs choisis). XIRR pour juger ta stratégie
              personnelle (tes timings de DCA, retraits, allocation). Plus-value pour avoir une
              vision euros-en-poche immédiate. Le rendement annoncé sert juste de boussole
              attendue.
            </p>
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}

function Kpi({
  label,
  tooltip,
  value,
  hint,
  tone,
}: {
  label: string;
  tooltip: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-[var(--color-success)]"
      : tone === "negative"
        ? "text-destructive"
        : "";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground md:text-[11px]">
        <span>{label}</span>
        <Tooltip>
          <TooltipTrigger className="opacity-50 hover:opacity-100">
            <Info className="size-3" strokeWidth={2.4} />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-left text-[11px] leading-relaxed">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className={cn("numeric mt-1 text-lg font-semibold tabular-nums", toneClass)}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Explainer({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
        {title}
      </div>
      <p className="mt-0.5 text-muted-foreground">{body}</p>
    </div>
  );
}
