import Link from "next/link";
import { getPrimaryHousehold } from "@/lib/queries";
import { getCashflowDashboard, hasCashflowSetup } from "@/lib/cashflow/data";
import type { CashflowDashboard, EnvelopeView } from "@/lib/cashflow/assemble";
import type { PacingColor } from "@/lib/cashflow/pacing";
import { forecastEndOfMonth, type ForecastBand } from "@/lib/cashflow/month-forecast";
import { PageHeader } from "@/components/page-header";
import { formatEUR } from "@/lib/format";
import { SpendButton } from "./spend-button";
import { ArrowRight, Sparkles, Settings, CalendarRange, Droplets } from "lucide-react";

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

export default async function CashflowPage() {
  const h = await getPrimaryHousehold();
  const ready = await hasCashflowSetup(h.id);

  if (!ready) {
    return (
      <>
        <PageHeader title="Cap" subtitle="Ton reste-à-vivre, en temps réel" />
        <div className="p-4 md:p-8">
          <EmptyState />
        </div>
      </>
    );
  }

  const today = new Date();
  const data = await getCashflowDashboard(h.id, today);
  const monthLabel = `${MONTHS_FR[today.getUTCMonth()]} ${today.getUTCFullYear()}`;

  const spendTargets = data.envelopes.map((e) => ({
    id: e.id,
    label: e.label,
    category: e.category,
    consumed: e.consumed,
  }));

  const variableRemaining = data.envelopes.reduce((s, e) => s + e.remaining, 0);
  const forecast = forecastEndOfMonth({
    projectedEndBalance: data.safe.projectedEndBalance,
    uncertainRemaining: variableRemaining + data.bufferRemaining,
  });

  return (
    <>
      <PageHeader
        title="Cap"
        subtitle={`${monthLabel} · jour ${data.dayOfMonth}/${data.daysInMonth}`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/cashflow/month"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <CalendarRange className="size-3.5" /> Le mois
            </Link>
            <Link
              href="/cashflow/setup"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <Settings className="size-3.5" /> Configurer
            </Link>
            <SpendButton envelopes={spendTargets} />
          </div>
        }
      />

      <div className="space-y-6 p-4 md:space-y-8 md:p-8">
        <Hero data={data} forecast={forecast} />

        <WeeklyRecap
          consumed={data.weekVariableConsumed}
          planned={data.weekVariablePlanned}
        />

        {data.envelopes.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Enveloppes variables
            </h2>
            <div className="space-y-2">
              {data.envelopes.map((e) => (
                <EnvelopeRow key={e.id} env={e} />
              ))}
            </div>
          </section>
        )}

        {data.upcoming.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              À venir d&apos;ici la fin du mois
            </h2>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {data.upcoming.slice(0, 8).map((u, i) => (
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

const COLOR_VAR: Record<PacingColor, string> = {
  neutral: "var(--muted-foreground)",
  green: "var(--color-success)",
  yellow: "var(--chart-4, #d4a017)",
  orange: "#e08300",
  red: "var(--destructive)",
};

function Hero({ data, forecast }: { data: CashflowDashboard; forecast: ForecastBand }) {
  const { safe } = data;
  const accent = COLOR_VAR[safe.color];
  const negative = safe.safeToSpend < 0;

  return (
    <section className="rounded-xl border border-border bg-card p-6 md:p-8">
      <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
        Safe-to-spend
      </div>
      <div
        className="numeric mt-2 text-5xl font-semibold tabular-nums md:text-6xl"
        style={{ color: negative ? COLOR_VAR.red : undefined }}
      >
        {formatEUR(safe.budgetPerDay)}
        <span className="ml-2 align-middle text-base font-normal text-muted-foreground">
          / jour
        </span>
      </div>
      <div className="mt-2 text-sm text-muted-foreground">
        {negative ? (
          <span style={{ color: COLOR_VAR.red }}>
            {formatEUR(safe.safeToSpend)} sous le plan — on pioche dans le coussin.
          </span>
        ) : (
          <>
            <span className="font-medium text-foreground">
              {formatEUR(safe.safeToSpend)}
            </span>{" "}
            libres sur {safe.daysRemaining} jour{safe.daysRemaining > 1 ? "s" : ""}.
          </>
        )}
      </div>

      {/* Jauge globale du mois */}
      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.round((data.dayOfMonth / data.daysInMonth) * 100)}%`,
            backgroundColor: accent,
          }}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <MiniStat label="Revenus" value={data.plannedIncome} tone="positive" />
        <MiniStat label="Fixes" value={data.plannedFixed} tone="negative" />
        <MiniStat label="Coussin restant" value={data.bufferRemaining} />
      </div>

      {/* D'où vient ce chiffre ? */}
      <details className="mt-4 border-t border-border pt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          D&apos;où vient ce chiffre ?
        </summary>
        <div className="mt-3 space-y-1.5">
          <BreakdownLine label="Solde compte de vie courante" value={data.availableBalance} />
          <BreakdownLine label="+ Revenus encore à venir ce mois" value={data.remainingIncome} sign="+" />
          <BreakdownLine label="− Charges fixes restantes" value={data.remainingFixed} sign="−" />
          <BreakdownLine label="− Enveloppes restantes" value={data.variableRemaining} sign="−" />
          <BreakdownLine label="− Épargne engagée (DCA/objectif)" value={data.committedSavings} sign="−" />
          <BreakdownLine label="− Coussin réservé" value={data.bufferRemaining} sign="−" />
          <div className="flex items-center justify-between border-t border-border pt-1.5 font-semibold">
            <span>= Safe-to-Spend</span>
            <span className="numeric tabular-nums">{formatEUR(data.safe.safeToSpend)}</span>
          </div>
          <p className="pt-1 text-[11px] text-muted-foreground">
            Le solde dépend du « compte de vie courante » choisi dans Configurer. Si tes revenus
            semblent doublés, vérifie tes sources dans Dépenses &amp; revenus.
          </p>
        </div>
      </details>

      {/* Prévision Monte-Carlo de fin de mois */}
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <CalendarRange className="size-3.5 shrink-0" />
        <span>
          Fin de mois estimée entre{" "}
          <span className="font-medium text-foreground">{formatEUR(forecast.p10)}</span> et{" "}
          <span className="font-medium text-foreground">{formatEUR(forecast.p90)}</span> selon tes
          dépenses variables.
        </span>
      </div>
    </section>
  );
}

function WeeklyRecap({ consumed, planned }: { consumed: number; planned: number }) {
  const delta = planned - consumed;
  const ahead = delta >= 0;
  const pct = planned > 0 ? Math.min(100, (consumed / planned) * 100) : 0;
  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Droplets className="size-4 text-[var(--color-success)]" /> Cette semaine
        </h2>
        <span className="numeric text-sm tabular-nums text-muted-foreground">
          {formatEUR(consumed)} / {formatEUR(planned)}
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: ahead ? "var(--color-success)" : "#e08300",
          }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {ahead ? (
          <>
            Tu es dans le rythme —{" "}
            <span className="font-medium text-[var(--color-success)]">
              {formatEUR(delta)} d&apos;avance
            </span>{" "}
            qui déborderont vers ton épargne.
          </>
        ) : (
          <>
            Un peu vite cette semaine :{" "}
            <span className="font-medium" style={{ color: "#e08300" }}>
              {formatEUR(-delta)} au-dessus
            </span>{" "}
            du rythme prévu.
          </>
        )}
      </p>
    </section>
  );
}

function BreakdownLine({
  label,
  value,
  sign,
}: {
  label: string;
  value: number;
  sign?: "+" | "−";
}) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="numeric tabular-nums">
        {sign === "−" ? "−" : ""}
        {formatEUR(value)}
      </span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "positive" | "negative";
}) {
  const cls =
    tone === "positive"
      ? "text-[var(--color-success)]"
      : tone === "negative"
        ? "text-foreground"
        : "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`numeric mt-0.5 text-sm font-semibold tabular-nums ${cls}`}>
        {formatEUR(value)}
      </div>
    </div>
  );
}

function EnvelopeRow({ env }: { env: EnvelopeView }) {
  const pct = env.planned > 0 ? Math.min(100, (env.consumed / env.planned) * 100) : 0;
  const accent = COLOR_VAR[env.color];
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{env.label}</span>
        <span className="numeric tabular-nums text-muted-foreground">
          {formatEUR(env.consumed)} / {formatEUR(env.planned)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Sparkles className="size-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Configure ton mois</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Laisse-toi guider par l&apos;audit en quelques minutes — il calcule ta capacité
        d&apos;épargne et remplit ton mois automatiquement.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Link
          href="/cashflow/onboarding"
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Sparkles className="size-4" /> Lancer l&apos;audit guidé <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/cashflow/setup"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ou configurer manuellement
        </Link>
      </div>
    </div>
  );
}
