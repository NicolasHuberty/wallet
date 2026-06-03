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
import { Plus, Trash2, Save } from "lucide-react";
import { formatEUR } from "@/lib/format";
import { accountKindLabel } from "@/lib/labels";
import {
  saveFinancialProfile,
  saveEnvelope,
  deleteEnvelope,
  saveFixedCharge,
  deleteFixedCharge,
  saveIncomeSource,
  deleteIncomeSource,
} from "../actions";
import type {
  AccountKind,
  EnvelopeCadence,
  FlowFrequency,
  RolloverPolicy,
  SavingsTargetMode,
} from "@/db/schema";

export type ProfileData = {
  bufferAmount: number;
  savingsTargetMode: SavingsTargetMode;
  savingsTargetAmount: number | null;
  defaultRolloverPolicy: RolloverPolicy;
  spendingAccountId: string | null;
};

export type AccountOption = { id: string; name: string; kind: AccountKind };

export type IncomeData = {
  id: string;
  label: string;
  amount: number;
  dayOfMonth: number | null;
  isVariable: boolean;
  floorAmount: number | null;
};

export type FixedChargeData = {
  id: string;
  label: string;
  category: string;
  amount: number;
  frequency: FlowFrequency;
  firstDate: string; // ISO yyyy-mm-dd
};

export type EnvelopeData = {
  id: string;
  label: string;
  category: string;
  monthlyAmount: number;
  cadence: EnvelopeCadence;
  occurrencesPerMonth: number | null;
  rolloverPolicy: RolloverPolicy;
};

const CADENCE_LABEL: Record<EnvelopeCadence, string> = {
  weekly: "Hebdomadaire",
  biweekly: "Quinzaine",
  monthly: "Mensuel",
  per_occurrence: "Par occurrence",
};

const ROLLOVER_LABEL: Record<RolloverPolicy, string> = {
  to_savings: "Déborde vers l'épargne",
  accumulate: "Reporté au mois suivant",
  reset: "Remis à zéro",
};

const FREQ_LABEL: Record<FlowFrequency, string> = {
  weekly: "Hebdo",
  biweekly: "Quinzaine",
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  yearly: "Annuel",
};

function monthlyize(amount: number, freq: FlowFrequency): number {
  switch (freq) {
    case "weekly":
      return (amount * 52) / 12;
    case "biweekly":
      return (amount * 26) / 12;
    case "quarterly":
      return amount / 3;
    case "yearly":
      return amount / 12;
    default:
      return amount;
  }
}

const inputCls = "h-9 text-sm";
const moneyCls = "h-9 pr-7 text-right tabular-nums text-sm";

export function SetupForm({
  profile,
  envelopes,
  accounts,
  fixedCharges,
  incomes,
}: {
  profile: ProfileData;
  envelopes: EnvelopeData[];
  accounts: AccountOption[];
  fixedCharges: FixedChargeData[];
  incomes: IncomeData[];
}) {
  return (
    <div className="space-y-8">
      <ProfileSection profile={profile} accounts={accounts} />
      <IncomesSection incomes={incomes} />
      <FixedChargesSection charges={fixedCharges} />
      <EnvelopesSection envelopes={envelopes} />
    </div>
  );
}

function ProfileSection({
  profile,
  accounts,
}: {
  profile: ProfileData;
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [buffer, setBuffer] = useState(String(profile.bufferAmount || ""));
  const [mode, setMode] = useState<SavingsTargetMode>(profile.savingsTargetMode);
  const [targetAmount, setTargetAmount] = useState(
    profile.savingsTargetAmount ? String(profile.savingsTargetAmount) : "",
  );
  const [rollover, setRollover] = useState<RolloverPolicy>(profile.defaultRolloverPolicy);
  const [spendingAccount, setSpendingAccount] = useState<string>(
    profile.spendingAccountId ?? "__all__",
  );
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      try {
        await saveFinancialProfile({
          bufferAmount: Number(buffer) || 0,
          savingsTargetMode: mode,
          savingsTargetAmount: mode === "fixed" ? Number(targetAmount) || 0 : null,
          defaultRolloverPolicy: rollover,
          spendingAccountId: spendingAccount === "__all__" ? null : spendingAccount,
        });
        toast.success("Profil enregistré");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">Profil & objectifs</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Le coussin et l&apos;épargne forcée sont déduits de ton Safe-to-Spend.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Coussin mensuel (imprévu)</Label>
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              step="1"
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              placeholder="0"
              className={moneyCls}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Objectif d&apos;épargne</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as SavingsTargetMode)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="max">Le maximum possible</SelectItem>
              <SelectItem value="fixed">Un montant fixe</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === "fixed" && (
          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Montant d&apos;épargne / mois</Label>
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                step="1"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="0"
                className={moneyCls}
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
                €
              </span>
            </div>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Débordement par défaut</Label>
          <Select value={rollover} onValueChange={(v) => setRollover(v as RolloverPolicy)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLLOVER_LABEL) as RolloverPolicy[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {ROLLOVER_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5 md:col-span-2">
          <Label className="text-[11px] text-muted-foreground">Compte de vie courante</Label>
          <Select value={spendingAccount} onValueChange={(v) => setSpendingAccount(v ?? "__all__")}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tous les comptes cash + épargne</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} · {accountKindLabel[a.kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Le Safe-to-Spend se calcule sur ce solde. Choisis ton compte courant pour exclure
            ton épargne.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={pending} size="sm">
          <Save className="size-4" /> {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </section>
  );
}

function IncomesSection({ incomes }: { incomes: IncomeData[] }) {
  const total = incomes.reduce(
    (s, i) => s + (i.isVariable ? i.floorAmount ?? 0 : i.amount),
    0,
  );
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold">Revenus</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Salaires, allocations, loyers perçus. Supprime un éventuel doublon ici.
          </p>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">{formatEUR(total)}/mois</span>
      </div>
      <div className="space-y-2">
        {incomes.map((i) => (
          <IncomeCard key={i.id} income={i} />
        ))}
        <IncomeCard />
      </div>
    </section>
  );
}

function IncomeCard({ income }: { income?: IncomeData }) {
  const router = useRouter();
  const isNew = !income;
  const [label, setLabel] = useState(income?.label ?? "");
  const [amount, setAmount] = useState(income ? String(income.amount) : "");
  const [day, setDay] = useState(income?.dayOfMonth ? String(income.dayOfMonth) : "");
  const [isVariable, setIsVariable] = useState(income?.isVariable ?? false);
  const [floor, setFloor] = useState(income?.floorAmount ? String(income.floorAmount) : "");
  const [pending, start] = useTransition();

  function save() {
    if (!label.trim()) {
      toast.error("Donne un nom au revenu.");
      return;
    }
    start(async () => {
      try {
        await saveIncomeSource({
          id: income?.id,
          label: label.trim(),
          amount: Number(amount) || 0,
          dayOfMonth: day === "" ? null : Number(day),
          isVariable,
          floorAmount: isVariable ? Number(floor) || 0 : null,
        });
        toast.success(isNew ? "Revenu ajouté" : "Revenu mis à jour");
        if (isNew) {
          setLabel("");
          setAmount("");
          setDay("");
        }
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  function remove() {
    if (!income) return;
    start(async () => {
      try {
        await deleteIncomeSource({ id: income.id });
        toast.success("Revenu supprimé");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        isNew ? "border-dashed border-border bg-muted/20" : "border-border bg-card"
      }`}
    >
      <div className="grid items-end gap-3 md:grid-cols-[1.4fr_1fr_0.8fr_1fr_auto]">
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">
            {isNew ? "Nouveau revenu" : "Libellé"}
          </Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Salaire, allocations…"
            className={inputCls}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Montant / mois</Label>
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className={moneyCls}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Jour</Label>
          <Input
            type="number"
            min={1}
            max={31}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            placeholder="28"
            className="h-9 text-sm"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Type</Label>
          <Select
            value={isVariable ? "variable" : "fixed"}
            onValueChange={(v) => setIsVariable(v === "variable")}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixe</SelectItem>
              <SelectItem value="variable">Variable</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button onClick={save} disabled={pending} size="icon" variant="outline" className="size-9">
            {isNew ? <Plus className="size-4" /> : <Save className="size-4" />}
          </Button>
          {!isNew && (
            <Button
              onClick={remove}
              disabled={pending}
              size="icon"
              variant="ghost"
              className="size-9 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {isVariable && (
        <div className="mt-2 grid gap-1.5 md:max-w-[12rem]">
          <Label className="text-[11px] text-muted-foreground">Plancher garanti / mois</Label>
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              step="1"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="0"
              className={moneyCls}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function FixedChargesSection({ charges }: { charges: FixedChargeData[] }) {
  const monthlyTotal = charges.reduce((s, c) => s + monthlyize(c.amount, c.frequency), 0);
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold">Échéancier — charges fixes</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Loyer, assurances, abonnements… avec leur récurrence et leur date d&apos;échéance.
          </p>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatEUR(monthlyTotal)}/mois
        </span>
      </div>
      <div className="space-y-2">
        {charges.map((c) => (
          <FixedChargeCard key={c.id} charge={c} />
        ))}
        <FixedChargeCard />
      </div>
    </section>
  );
}

function FixedChargeCard({ charge }: { charge?: FixedChargeData }) {
  const router = useRouter();
  const isNew = !charge;
  const [label, setLabel] = useState(charge?.label ?? "");
  const [amount, setAmount] = useState(charge ? String(charge.amount) : "");
  const [frequency, setFrequency] = useState<FlowFrequency>(charge?.frequency ?? "monthly");
  const [date, setDate] = useState(charge?.firstDate ?? new Date().toISOString().slice(0, 10));
  const [pending, start] = useTransition();

  function save() {
    if (!label.trim()) {
      toast.error("Donne un nom à la charge.");
      return;
    }
    start(async () => {
      try {
        await saveFixedCharge({
          id: charge?.id,
          label: label.trim(),
          category: charge?.category ?? "subscriptions",
          amount: Number(amount) || 0,
          frequency,
          firstDate: date || null,
        });
        toast.success(isNew ? "Charge ajoutée" : "Charge mise à jour");
        if (isNew) {
          setLabel("");
          setAmount("");
        }
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  function remove() {
    if (!charge) return;
    start(async () => {
      try {
        await deleteFixedCharge({ id: charge.id });
        toast.success("Charge supprimée");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        isNew ? "border-dashed border-border bg-muted/20" : "border-border bg-card"
      }`}
    >
      <div className="grid items-end gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">
            {isNew ? "Nouvelle charge" : "Nom"}
          </Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Assurance auto, Loyer…"
            className={inputCls}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Montant</Label>
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className={moneyCls}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Récurrence</Label>
          <Select value={frequency} onValueChange={(v) => setFrequency(v as FlowFrequency)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FREQ_LABEL) as FlowFrequency[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {FREQ_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Prochaine échéance</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
        </div>
        <div className="flex items-center gap-1">
          <Button onClick={save} disabled={pending} size="icon" variant="outline" className="size-9">
            {isNew ? <Plus className="size-4" /> : <Save className="size-4" />}
          </Button>
          {!isNew && (
            <Button
              onClick={remove}
              disabled={pending}
              size="icon"
              variant="ghost"
              className="size-9 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EnvelopesSection({ envelopes }: { envelopes: EnvelopeData[] }) {
  const total = envelopes.reduce((s, e) => s + e.monthlyAmount, 0);
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold">Enveloppes variables</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Courses, sorties, carburant… le budget que tu consommes au fil du mois.
          </p>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatEUR(total)}/mois
        </span>
      </div>

      <div className="space-y-2">
        {envelopes.map((e) => (
          <EnvelopeCard key={e.id} envelope={e} />
        ))}
        <EnvelopeCard />
      </div>
    </section>
  );
}

function EnvelopeCard({ envelope }: { envelope?: EnvelopeData }) {
  const router = useRouter();
  const isNew = !envelope;
  const [label, setLabel] = useState(envelope?.label ?? "");
  const [amount, setAmount] = useState(envelope ? String(envelope.monthlyAmount) : "");
  const [cadence, setCadence] = useState<EnvelopeCadence>(envelope?.cadence ?? "monthly");
  const [occurrences, setOccurrences] = useState(
    envelope?.occurrencesPerMonth ? String(envelope.occurrencesPerMonth) : "",
  );
  const [rollover, setRollover] = useState<RolloverPolicy>(
    envelope?.rolloverPolicy ?? "to_savings",
  );
  const [pending, start] = useTransition();

  function save() {
    if (!label.trim()) {
      toast.error("Donne un nom à l'enveloppe.");
      return;
    }
    start(async () => {
      try {
        await saveEnvelope({
          id: envelope?.id,
          label: label.trim(),
          category: envelope?.category ?? "other",
          monthlyAmount: Number(amount) || 0,
          cadence,
          occurrencesPerMonth: occurrences === "" ? null : Number(occurrences),
          rolloverPolicy: rollover,
        });
        toast.success(isNew ? "Enveloppe ajoutée" : "Enveloppe mise à jour");
        if (isNew) {
          setLabel("");
          setAmount("");
          setOccurrences("");
        }
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  function remove() {
    if (!envelope) return;
    start(async () => {
      try {
        await deleteEnvelope({ id: envelope.id });
        toast.success("Enveloppe supprimée");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        isNew ? "border-dashed border-border bg-muted/20" : "border-border bg-card"
      }`}
    >
      <div className="grid items-end gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">
            {isNew ? "Nouvelle enveloppe" : "Nom"}
          </Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Courses, Bar…"
            className={inputCls}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Budget / mois</Label>
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className={moneyCls}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Cadence</Label>
          <Select value={cadence} onValueChange={(v) => setCadence(v as EnvelopeCadence)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CADENCE_LABEL) as EnvelopeCadence[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {CADENCE_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Débordement</Label>
          <Select value={rollover} onValueChange={(v) => setRollover(v as RolloverPolicy)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLLOVER_LABEL) as RolloverPolicy[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {ROLLOVER_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button onClick={save} disabled={pending} size="icon" variant="outline" className="size-9">
            {isNew ? <Plus className="size-4" /> : <Save className="size-4" />}
          </Button>
          {!isNew && (
            <Button
              onClick={remove}
              disabled={pending}
              size="icon"
              variant="ghost"
              className="size-9 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
