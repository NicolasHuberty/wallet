"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
  Coins,
  ShieldCheck,
} from "lucide-react";
import { formatEUR } from "@/lib/format";
import { completeCapOnboarding } from "../actions";

type Income = { label: string; amount: string; day: string; isVariable: boolean; floor: string };
type Fixed = { label: string; category: string; amount: string; day: string; active: boolean };
type Envelope = { label: string; category: string; amount: string };

const FIXED_PRESETS: { label: string; category: string }[] = [
  { label: "Loyer / crédit", category: "housing" },
  { label: "Électricité", category: "utilities" },
  { label: "Internet", category: "utilities" },
  { label: "Téléphone", category: "utilities" },
  { label: "Assurance auto", category: "insurance" },
  { label: "Mutuelle", category: "insurance" },
  { label: "Netflix", category: "subscriptions" },
  { label: "Spotify", category: "subscriptions" },
  { label: "Salle de sport", category: "subscriptions" },
];

const ENVELOPE_PRESETS: { label: string; category: string; amount: number }[] = [
  { label: "Courses", category: "food", amount: 360 },
  { label: "Sorties / bar", category: "leisure", amount: 120 },
  { label: "Carburant", category: "transport", amount: 140 },
  { label: "Restaurants", category: "food", amount: 100 },
  { label: "Shopping", category: "leisure", amount: 80 },
];

const TOTAL_STEPS = 7;

export function CapOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();

  // Chapitre 1
  const [composition, setComposition] = useState<"single" | "couple">("single");
  const [children, setChildren] = useState("0");
  const [cars, setCars] = useState("0");
  const [city, setCity] = useState("");
  // Chapitre 2
  const [incomes, setIncomes] = useState<Income[]>([
    { label: "Salaire", amount: "", day: "28", isVariable: false, floor: "" },
  ]);
  // Chapitre 3
  const [fixed, setFixed] = useState<Fixed[]>([]);
  // Chapitre 4
  const [envelopes, setEnvelopes] = useState<Envelope[]>(
    ENVELOPE_PRESETS.slice(0, 2).map((p) => ({
      label: p.label,
      category: p.category,
      amount: String(p.amount),
    })),
  );
  // Chapitre 5
  const [buffer, setBuffer] = useState("150");
  const [savingsMode, setSavingsMode] = useState<"max" | "fixed">("max");
  const [savingsAmount, setSavingsAmount] = useState("");

  const totalIncome = useMemo(
    () =>
      incomes.reduce(
        (s, i) => s + (i.isVariable ? Number(i.floor) || 0 : Number(i.amount) || 0),
        0,
      ),
    [incomes],
  );
  const totalFixed = useMemo(
    () => fixed.filter((f) => f.active).reduce((s, f) => s + (Number(f.amount) || 0), 0),
    [fixed],
  );
  const totalVariable = useMemo(
    () => envelopes.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [envelopes],
  );
  const capacity = totalIncome - totalFixed - totalVariable - (Number(buffer) || 0);

  function next() {
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  function toggleFixed(preset: { label: string; category: string }) {
    setFixed((prev) => {
      const i = prev.findIndex((f) => f.label === preset.label);
      if (i >= 0) return prev.filter((_, idx) => idx !== i);
      return [...prev, { label: preset.label, category: preset.category, amount: "", day: "1", active: true }];
    });
  }

  function finish() {
    start(async () => {
      try {
        await completeCapOnboarding({
          composition,
          childrenCount: Number(children) || 0,
          carsCount: Number(cars) || 0,
          city: city || null,
          bufferAmount: Number(buffer) || 0,
          savingsTargetMode: savingsMode,
          savingsTargetAmount: savingsMode === "fixed" ? Number(savingsAmount) || 0 : null,
          incomes: incomes
            .filter((i) => Number(i.amount) > 0 || (i.isVariable && Number(i.floor) > 0))
            .map((i) => ({
              label: i.label || "Revenu",
              amount: Number(i.amount) || 0,
              dayOfMonth: i.day === "" ? null : Number(i.day),
              isVariable: i.isVariable,
              floorAmount: i.isVariable ? Number(i.floor) || 0 : null,
            })),
          fixedExpenses: fixed
            .filter((f) => f.active && Number(f.amount) > 0)
            .map((f) => ({
              label: f.label,
              amount: Number(f.amount),
              category: f.category,
              dayOfMonth: f.day === "" ? null : Number(f.day),
            })),
          envelopes: envelopes
            .filter((e) => e.label.trim() && Number(e.amount) > 0)
            .map((e) => ({
              label: e.label.trim(),
              category: e.category,
              monthlyAmount: Number(e.amount),
              cadence: "monthly" as const,
            })),
        });
        toast.success("Bienvenue dans Cap !");
        router.push("/cashflow");
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-8 md:py-12">
      {/* Progression */}
      {step > 0 && (
        <div className="mb-8 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              Chapitre {step} / {TOTAL_STEPS - 1}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round((step / (TOTAL_STEPS - 1)) * 100)}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--chart-1)] transition-all duration-300"
              style={{ width: `${(step / (TOTAL_STEPS - 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {step === 0 && <Promise_ onStart={next} onSkip={() => router.push("/cashflow/setup")} />}

      {step === 1 && (
        <Chapter title="Toi & ton foyer" subtitle="Pour calibrer des montants réalistes.">
          <div className="grid gap-2">
            <Label>Tu gères ton budget…</Label>
            <div className="grid grid-cols-2 gap-2">
              <CardChoice active={composition === "single"} onClick={() => setComposition("single")} label="Seul" />
              <CardChoice active={composition === "couple"} onClick={() => setComposition("couple")} label="À deux" />
            </div>
          </div>
          <Stepper label="Enfants à charge" value={children} onChange={setChildren} />
          <Stepper label="Voitures" value={cars} onChange={setCars} />
          <Field label="Ville (optionnel)">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bruxelles…" className="h-11" />
          </Field>
        </Chapter>
      )}

      {step === 2 && (
        <Chapter title="Tes revenus" subtitle="Salaire, allocations, loyers perçus.">
          {incomes.map((inc, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Libellé">
                  <Input
                    value={inc.label}
                    onChange={(e) => setIncomes((p) => p.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
                    className="h-11"
                  />
                </Field>
                <Field label="Montant net / mois">
                  <MoneyInput
                    value={inc.amount}
                    onChange={(v) => setIncomes((p) => p.map((x, idx) => (idx === i ? { ...x, amount: v } : x)))}
                  />
                </Field>
                <Field label="Jour de versement">
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={inc.day}
                    onChange={(e) => setIncomes((p) => p.map((x, idx) => (idx === i ? { ...x, day: e.target.value } : x)))}
                    className="h-11"
                  />
                </Field>
                <Field label="Type">
                  <div className="flex gap-2">
                    <Toggle active={!inc.isVariable} onClick={() => setIncomes((p) => p.map((x, idx) => (idx === i ? { ...x, isVariable: false } : x)))} label="Fixe" />
                    <Toggle active={inc.isVariable} onClick={() => setIncomes((p) => p.map((x, idx) => (idx === i ? { ...x, isVariable: true } : x)))} label="Variable" />
                  </div>
                </Field>
                {inc.isVariable && (
                  <Field label="Plancher garanti / mois">
                    <MoneyInput
                      value={inc.floor}
                      onChange={(v) => setIncomes((p) => p.map((x, idx) => (idx === i ? { ...x, floor: v } : x)))}
                    />
                  </Field>
                )}
              </div>
              {incomes.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIncomes((p) => p.filter((_, idx) => idx !== i))}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-destructive"
                >
                  <Trash2 className="size-3.5" /> Retirer
                </button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIncomes((p) => [...p, { label: "", amount: "", day: "1", isVariable: false, floor: "" }])}
          >
            <Plus className="size-4" /> Ajouter un revenu
          </Button>
          <Running label="Revenus" value={totalIncome} />
        </Chapter>
      )}

      {step === 3 && (
        <Chapter title="Tes charges fixes" subtitle="Tape pour activer, puis montant + jour.">
          <div className="flex flex-wrap gap-2">
            {FIXED_PRESETS.map((preset) => {
              const active = fixed.some((f) => f.label === preset.label);
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => toggleFixed(preset)}
                  className={`inline-flex min-h-[2.25rem] items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          {fixed.length > 0 && (
            <div className="space-y-2">
              {fixed.map((f, i) => (
                <div key={f.label} className="grid grid-cols-[1.4fr_1fr_0.8fr] items-end gap-2 rounded-lg border border-border bg-card p-3">
                  <div className="text-sm font-medium">{f.label}</div>
                  <Field label="Montant">
                    <MoneyInput value={f.amount} onChange={(v) => setFixed((p) => p.map((x, idx) => (idx === i ? { ...x, amount: v } : x)))} />
                  </Field>
                  <Field label="Jour">
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={f.day}
                      onChange={(e) => setFixed((p) => p.map((x, idx) => (idx === i ? { ...x, day: e.target.value } : x)))}
                      className="h-11"
                    />
                  </Field>
                </div>
              ))}
            </div>
          )}
          <Running label="Fixes" value={totalFixed} />
        </Chapter>
      )}

      {step === 4 && (
        <Chapter title="Ta vie variable" subtitle="Les budgets que tu consommes au fil du mois.">
          <div className="flex flex-wrap gap-2">
            {ENVELOPE_PRESETS.map((preset) => {
              const active = envelopes.some((e) => e.label === preset.label);
              if (active) return null;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setEnvelopes((p) => [...p, { label: preset.label, category: preset.category, amount: String(preset.amount) }])}
                  className="inline-flex min-h-[2.25rem] items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3.5" /> {preset.label}
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            {envelopes.map((e, i) => (
              <div key={i} className="grid grid-cols-[1.4fr_1fr_auto] items-end gap-2 rounded-lg border border-border bg-card p-3">
                <Field label="Enveloppe">
                  <Input value={e.label} onChange={(ev) => setEnvelopes((p) => p.map((x, idx) => (idx === i ? { ...x, label: ev.target.value } : x)))} className="h-11" />
                </Field>
                <Field label="Budget / mois">
                  <MoneyInput value={e.amount} onChange={(v) => setEnvelopes((p) => p.map((x, idx) => (idx === i ? { ...x, amount: v } : x)))} />
                </Field>
                <Button size="icon" variant="ghost" className="size-11 text-destructive" onClick={() => setEnvelopes((p) => p.filter((_, idx) => idx !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <Running label="Vie variable" value={totalVariable} />
        </Chapter>
      )}

      {step === 5 && (
        <Chapter title="Tes objectifs" subtitle="Le coussin et l'épargne te protègent du découvert.">
          <Field label="Coussin mensuel (imprévu)">
            <MoneyInput value={buffer} onChange={setBuffer} />
          </Field>
          <div className="grid gap-2">
            <Label>Objectif d&apos;épargne</Label>
            <div className="grid grid-cols-2 gap-2">
              <CardChoice active={savingsMode === "max"} onClick={() => setSavingsMode("max")} label="Le maximum" />
              <CardChoice active={savingsMode === "fixed"} onClick={() => setSavingsMode("fixed")} label="Montant fixe" />
            </div>
          </div>
          {savingsMode === "fixed" && (
            <Field label="Montant d'épargne / mois">
              <MoneyInput value={savingsAmount} onChange={setSavingsAmount} />
            </Field>
          )}
        </Chapter>
      )}

      {step === 6 && (
        <Reveal capacity={capacity} pending={pending} onFinish={finish} />
      )}

      {/* Navigation */}
      {step > 0 && step < 6 && (
        <div className="mt-8 flex items-center justify-between">
          <Button variant="outline" onClick={back}>
            <ArrowLeft className="size-4" /> Retour
          </Button>
          <Button onClick={next}>
            Continuer <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
      {step === 6 && (
        <div className="mt-6 text-center">
          <button type="button" onClick={back} className="text-xs text-muted-foreground hover:text-foreground">
            Revenir en arrière
          </button>
        </div>
      )}
    </div>
  );
}

function Promise_({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Coins className="size-7" />
      </div>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Cap</h1>
      <p className="mt-3 max-w-sm text-muted-foreground">
        Quelques minutes, une fois. Ensuite, chaque matin, tu sauras exactement combien tu peux
        dépenser. Tout reste sur ton serveur.
      </p>
      <Button className="mt-8" size="lg" onClick={onStart}>
        Commencer <ArrowRight className="size-4" />
      </Button>
      <button type="button" onClick={onSkip} className="mt-4 text-xs text-muted-foreground hover:text-foreground">
        Déjà configuré ? Passer
      </button>
    </div>
  );
}

function Reveal({ capacity, pending, onFinish }: { capacity: number; pending: boolean; onFinish: () => void }) {
  const negative = capacity < 0;
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--color-success)]/15 text-[var(--color-success)]">
        {negative ? <ShieldCheck className="size-6" /> : <Sparkles className="size-6" />}
      </div>
      <div className="mt-6 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
        Ta capacité d&apos;épargne réelle
      </div>
      <div
        className="numeric mt-2 text-5xl font-semibold tabular-nums md:text-6xl"
        style={{ color: negative ? "var(--destructive)" : "var(--color-success)" }}
      >
        {formatEUR(capacity)}
        <span className="ml-2 align-middle text-base font-normal text-muted-foreground">/ mois</span>
      </div>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        {negative
          ? "Ton plan dépasse tes revenus. On t'aidera à repérer où ajuster depuis le dashboard."
          : "Voilà ce que tu peux mettre de côté chaque mois, une fois tout couvert."}
      </p>
      <Button className="mt-8" size="lg" onClick={onFinish} disabled={pending}>
        {pending ? "Création…" : "Voir mon mois en cours"} <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function Chapter({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MoneyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="h-11 pr-8 text-right tabular-nums"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
        €
      </span>
    </div>
  );
}

function CardChoice({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-sm font-medium transition-colors ${
        active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"
      }`}
    >
      {label}
    </button>
  );
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"
      }`}
    >
      {label}
    </button>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const n = Number(value) || 0;
  return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <Button size="icon" variant="outline" className="size-9" onClick={() => onChange(String(Math.max(0, n - 1)))}>
          −
        </Button>
        <span className="w-6 text-center tabular-nums">{n}</span>
        <Button size="icon" variant="outline" className="size-9" onClick={() => onChange(String(n + 1))}>
          +
        </Button>
      </div>
    </div>
  );
}

function Running({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="numeric font-semibold tabular-nums">{formatEUR(value)}/mois</span>
    </div>
  );
}
