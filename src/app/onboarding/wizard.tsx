"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { accountKindLabel, accountKindColor, isLiability } from "@/lib/labels";
import type { AccountKind } from "@/db/schema";
import { formatEUR } from "@/lib/format";
import {
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Check,
  Coins,
  TrendingUp,
} from "lucide-react";
import { completeOnboarding } from "./actions";

type DraftAccount = {
  name: string;
  kind: AccountKind;
  institution: string;
  currentValue: number | "";
  annualYieldPct: number | "";
  monthlyContribution: number | "";
};

type DraftIncome = {
  label: string;
  amount: number | "";
};

const STARTER_ACCOUNTS: { kind: AccountKind; name: string; suggestedValue: number; yield?: number; dca?: number }[] = [
  { kind: "cash", name: "Compte courant", suggestedValue: 2_500 },
  { kind: "savings", name: "Épargne", suggestedValue: 10_000, yield: 2.5, dca: 300 },
  { kind: "brokerage", name: "Portefeuille-titres", suggestedValue: 5_000, yield: 7, dca: 200 },
  { kind: "real_estate", name: "Bien immobilier", suggestedValue: 250_000 },
  { kind: "loan", name: "Prêt hypothécaire", suggestedValue: -180_000 },
];

const STEP_LABELS: Record<1 | 2 | 3, string> = {
  1: "Comptes",
  2: "Revenus",
  3: "Récapitulatif",
};

const moneyInput = "h-11 pr-8 text-right tabular-nums text-base md:h-8 md:text-sm";
const textInput = "h-11 text-base md:h-8 md:text-sm";

export function OnboardingWizard({ householdName }: { householdName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [accounts, setAccounts] = useState<DraftAccount[]>([]);
  const [incomes, setIncomes] = useState<DraftIncome[]>([{ label: "Salaire", amount: "" }]);
  const [pending, start] = useTransition();

  function addStarter(preset: (typeof STARTER_ACCOUNTS)[number]) {
    if (accounts.some((a) => a.kind === preset.kind && a.name === preset.name)) return;
    setAccounts((prev) => [
      ...prev,
      {
        name: preset.name,
        kind: preset.kind,
        institution: "",
        currentValue: preset.suggestedValue,
        annualYieldPct: preset.yield ?? "",
        monthlyContribution: preset.dca ?? "",
      },
    ]);
  }

  function addBlank() {
    setAccounts((prev) => [
      ...prev,
      {
        name: "",
        kind: "cash",
        institution: "",
        currentValue: 0,
        annualYieldPct: "",
        monthlyContribution: "",
      },
    ]);
  }

  function updateAccount<K extends keyof DraftAccount>(i: number, k: K, v: DraftAccount[K]) {
    setAccounts((prev) => prev.map((a, idx) => (idx === i ? { ...a, [k]: v } : a)));
  }

  function removeAccount(i: number) {
    setAccounts((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addIncome() {
    setIncomes((prev) => [...prev, { label: "", amount: "" }]);
  }

  function updateIncome<K extends keyof DraftIncome>(i: number, k: K, v: DraftIncome[K]) {
    setIncomes((prev) => prev.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  }

  function removeIncome(i: number) {
    setIncomes((prev) => prev.filter((_, idx) => idx !== i));
  }

  function canNext() {
    if (step === 1) return accounts.length > 0 && accounts.every((a) => a.name.trim());
    return true;
  }

  function finish() {
    if (accounts.length === 0) {
      toast.error("Ajoute au moins un compte pour démarrer.");
      setStep(1);
      return;
    }
    const cleanAccounts = accounts.map((a) => ({
      name: a.name,
      kind: a.kind,
      institution: a.institution || null,
      currentValue: Number(a.currentValue) || 0,
      annualYieldPct: a.annualYieldPct === "" ? null : Number(a.annualYieldPct),
      monthlyContribution:
        a.monthlyContribution === "" ? null : Number(a.monthlyContribution),
    }));
    const cleanIncomes = incomes
      .filter((i) => i.label.trim() && i.amount !== "" && Number(i.amount) > 0)
      .map((i) => ({ label: i.label, amount: Number(i.amount) }));

    start(async () => {
      try {
        await completeOnboarding({ accounts: cleanAccounts, incomes: cleanIncomes });
        toast.success("Bienvenue dans ton wallet !");
        window.location.href = "/dashboard";
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur de création");
      }
    });
  }

  const totalAssets = accounts
    .filter((a) => !isLiability(a.kind) && Number(a.currentValue) >= 0)
    .reduce((s, a) => s + Number(a.currentValue || 0), 0);
  const totalLiab = accounts
    .filter((a) => isLiability(a.kind) || Number(a.currentValue) < 0)
    .reduce((s, a) => s + Math.abs(Number(a.currentValue || 0)), 0);
  const totalIncome = incomes.reduce((s, i) => s + Number(i.amount || 0), 0);

  const progressPct = (step / 3) * 100;

  return (
    <div className="min-h-screen bg-background pb-[max(env(safe-area-inset-bottom,0px),1.5rem)] pt-[max(env(safe-area-inset-top,0px),1rem)] md:py-10">
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3 md:mb-8">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Coins className="size-5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              Bienvenue, {householdName}
            </div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Mettons en place ton wallet</h1>
          </div>
        </div>

        {/* Progress bar (always thin) */}
        <div className="mb-6 space-y-2 md:mb-8">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">
              Étape {step} / 3
              <span className="ml-1.5 font-normal text-muted-foreground">· {STEP_LABELS[step]}</span>
            </span>
            <span className="tabular-nums text-muted-foreground">{Math.round(progressPct)}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--chart-1)] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {/* Desktop-only step pills for richer context */}
          <div className="hidden grid-cols-3 gap-2 md:grid">
            {[1, 2, 3].map((n) => {
              const active = n === step;
              const done = n < step;
              return (
                <div
                  key={n}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : done
                        ? "border-[var(--color-success)] text-[var(--color-success)]"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      active
                        ? "bg-background text-foreground"
                        : done
                          ? "bg-[var(--color-success)] text-background"
                          : "bg-muted"
                    }`}
                  >
                    {done ? <Check className="size-3" /> : n}
                  </span>
                  <span className="truncate font-medium">{STEP_LABELS[n as 1 | 2 | 3]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 1: accounts */}
        {step === 1 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Ajoute tes comptes</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Banque, épargne, portefeuille, immobilier, crédits. Tu pourras en ajouter
                d&apos;autres ensuite.
              </p>
            </div>

            {/* Quick starters */}
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5" />
                Démarrages rapides — cliquer pour ajouter avec des valeurs suggérées :
              </div>
              <div className="flex flex-wrap gap-2">
                {STARTER_ACCOUNTS.map((s) => (
                  <button
                    key={`${s.kind}-${s.name}`}
                    type="button"
                    onClick={() => addStarter(s)}
                    className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:border-[var(--chart-1)] hover:text-[var(--chart-1)] md:min-h-0 md:px-2.5 md:py-1 md:text-xs"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: accountKindColor[s.kind] }}
                    />
                    {s.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={addBlank}
                  className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground md:min-h-0 md:px-2.5 md:py-1 md:text-xs"
                >
                  <Plus className="size-3.5" /> compte vierge
                </button>
              </div>
            </div>

            {/* Accounts list */}
            {accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Aucun compte. Utilise un démarrage rapide ci-dessus.
              </div>
            ) : (
              <div className="space-y-3">
                {accounts.map((a, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: accountKindColor[a.kind] }}
                        />
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {accountKindLabel[a.kind]}
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-9 text-destructive hover:text-destructive md:size-7"
                        onClick={() => removeAccount(i)}
                      >
                        <Trash2 className="size-4 md:size-3.5" />
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">Nom</Label>
                        <Input
                          value={a.name}
                          onChange={(e) => updateAccount(i, "name", e.target.value)}
                          placeholder="ex. Épargne ING"
                          className={textInput}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">Institution</Label>
                        <Input
                          value={a.institution}
                          onChange={(e) => updateAccount(i, "institution", e.target.value)}
                          placeholder="optionnel"
                          className={textInput}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">Type</Label>
                        <Select
                          value={a.kind}
                          onValueChange={(v) => updateAccount(i, "kind", v as AccountKind)}
                        >
                          <SelectTrigger className="h-11 md:h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(accountKindLabel) as AccountKind[]).map((k) => (
                              <SelectItem key={k} value={k}>
                                {accountKindLabel[k]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">
                          Valeur actuelle (EUR)
                        </Label>
                        <div className="relative">
                          <Input
                            type="number"
                            inputMode="decimal"
                            pattern="[0-9\-]*[.,]?[0-9]*"
                            step="0.01"
                            value={a.currentValue}
                            onChange={(e) =>
                              updateAccount(
                                i,
                                "currentValue",
                                e.target.value === "" ? 0 : Number(e.target.value),
                              )
                            }
                            className={moneyInput}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                            €
                          </span>
                        </div>
                        {isLiability(a.kind) && (
                          <p className="text-[10px] text-muted-foreground">
                            Saisis un montant <b>négatif</b> pour un solde de dette.
                          </p>
                        )}
                      </div>
                      {!isLiability(a.kind) && a.kind !== "real_estate" && (
                        <>
                          <div className="grid gap-1.5">
                            <Label className="text-[11px] text-muted-foreground">
                              Rendement (%/an) — optionnel
                            </Label>
                            <div className="relative">
                              <Input
                                type="number"
                                step="0.1"
                                inputMode="decimal"
                                pattern="[0-9]*[.,]?[0-9]*"
                                placeholder="ex. 2.5 ou 7"
                                value={a.annualYieldPct}
                                onChange={(e) =>
                                  updateAccount(
                                    i,
                                    "annualYieldPct",
                                    e.target.value === "" ? "" : Number(e.target.value),
                                  )
                                }
                                className="h-11 pr-8 text-right tabular-nums text-base md:h-8 md:text-sm"
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                %
                              </span>
                            </div>
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="text-[11px] text-muted-foreground">
                              Apport mensuel DCA — optionnel
                            </Label>
                            <div className="relative">
                              <Input
                                type="number"
                                step="1"
                                inputMode="decimal"
                                pattern="[0-9]*[.,]?[0-9]*"
                                placeholder="ex. 300"
                                value={a.monthlyContribution}
                                onChange={(e) =>
                                  updateAccount(
                                    i,
                                    "monthlyContribution",
                                    e.target.value === "" ? "" : Number(e.target.value),
                                  )
                                }
                                className={moneyInput}
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                €
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              {accounts.length} compte{accounts.length > 1 ? "s" : ""} ·{" "}
              {formatEUR(totalAssets)} actifs · {formatEUR(totalLiab)} passifs
            </div>

            {/* Sticky / stacked navigation on mobile */}
            <div className="sticky bottom-[max(env(safe-area-inset-bottom,0px),0.75rem)] z-10 -mx-4 flex flex-col gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:static md:mx-0 md:flex-row md:justify-end md:border-none md:bg-transparent md:p-0 md:backdrop-blur-none">
              <Button
                disabled={!canNext() || pending}
                onClick={() => setStep(2)}
                className="w-full md:w-auto"
              >
                Continuer <ArrowRight className="size-4" />
              </Button>
            </div>
          </section>
        )}

        {/* Step 2: incomes */}
        {step === 2 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Tes revenus mensuels</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajoute tes salaires, allocations, revenus récurrents. Tu pourras affiner
                dépenses, frais one-shot et revenus exceptionnels plus tard depuis le check-in
                mensuel.
              </p>
            </div>

            <div className="space-y-3">
              {incomes.map((i, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-card p-3 md:border-none md:bg-transparent md:p-0">
                  <div className="grid grid-cols-12 items-end gap-3">
                    <div className="col-span-12 grid gap-1.5 md:col-span-7">
                      <Label className="text-[11px] text-muted-foreground">Libellé</Label>
                      <Input
                        value={i.label}
                        onChange={(e) => updateIncome(idx, "label", e.target.value)}
                        placeholder="Salaire, allocations, loyer perçu…"
                        className={textInput}
                      />
                    </div>
                    <div className="col-span-10 grid gap-1.5 md:col-span-4">
                      <Label className="text-[11px] text-muted-foreground">Montant / mois</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          pattern="[0-9]*[.,]?[0-9]*"
                          value={i.amount}
                          onChange={(e) =>
                            updateIncome(
                              idx,
                              "amount",
                              e.target.value === "" ? "" : Number(e.target.value),
                            )
                          }
                          className={moneyInput}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                          €
                        </span>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="col-span-2 size-11 text-destructive hover:text-destructive md:col-span-1 md:size-9"
                      onClick={() => removeIncome(idx)}
                      disabled={incomes.length === 1}
                    >
                      <Trash2 className="size-4 md:size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addIncome} className="h-11 w-full md:h-8 md:w-auto">
                <Plus className="size-3.5" /> Ajouter un revenu
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Total : {formatEUR(totalIncome)}/mois
            </div>

            <div className="sticky bottom-[max(env(safe-area-inset-bottom,0px),0.75rem)] z-10 -mx-4 flex flex-col gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:static md:mx-0 md:flex-row md:items-center md:justify-between md:border-none md:bg-transparent md:p-0 md:backdrop-blur-none">
              <Button variant="outline" onClick={() => setStep(1)} className="w-full md:w-auto">
                <ArrowLeft className="size-4" /> Retour
              </Button>
              <Button onClick={() => setStep(3)} className="w-full md:w-auto">
                Continuer <ArrowRight className="size-4" />
              </Button>
            </div>
          </section>
        )}

        {/* Step 3: recap */}
        {step === 3 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Récapitulatif</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                On enregistre tes comptes et revenus, on crée ton scénario de projection par
                défaut, et on t&apos;emmène au dashboard.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Stat label="Actifs" value={formatEUR(totalAssets)} tone="positive" />
              <Stat label="Passifs" value={formatEUR(totalLiab)} tone="negative" />
              <Stat label="Net" value={formatEUR(totalAssets - totalLiab)} />
            </div>

            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {accounts.map((a, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: accountKindColor[a.kind] }}
                    />
                    <span className="font-medium">{a.name || "—"}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {accountKindLabel[a.kind]}
                    </span>
                  </div>
                  <span
                    className={`numeric tabular-nums font-medium ${
                      isLiability(a.kind) || Number(a.currentValue) < 0
                        ? "text-destructive"
                        : ""
                    }`}
                  >
                    {formatEUR(Number(a.currentValue || 0))}
                  </span>
                </div>
              ))}
              {incomes.some((i) => i.label && i.amount) && (
                <div className="bg-muted/30 px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Revenus récurrents
                </div>
              )}
              {incomes
                .filter((i) => i.label && i.amount)
                .map((i, idx) => (
                  <div
                    key={`i${idx}`}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <TrendingUp className="size-3 text-[var(--color-success)]" />
                      {i.label}
                    </span>
                    <span className="numeric tabular-nums font-medium text-[var(--color-success)]">
                      +{formatEUR(Number(i.amount))}
                    </span>
                  </div>
                ))}
            </div>

            <div className="sticky bottom-[max(env(safe-area-inset-bottom,0px),0.75rem)] z-10 -mx-4 flex flex-col gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:static md:mx-0 md:flex-row md:items-center md:justify-between md:border-none md:bg-transparent md:p-0 md:backdrop-blur-none">
              <Button variant="outline" onClick={() => setStep(2)} className="w-full md:w-auto">
                <ArrowLeft className="size-4" /> Retour
              </Button>
              <Button onClick={finish} disabled={pending} className="w-full md:w-auto">
                <Check className="size-4" />
                {pending ? "Création…" : "Terminer et ouvrir le dashboard"}
              </Button>
            </div>
          </section>
        )}

        {/* Skip link */}
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Passer pour l&apos;instant — je configurerai depuis /accounts
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-[var(--color-success)]"
      : tone === "negative"
        ? "text-destructive"
        : "";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`numeric mt-1.5 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
