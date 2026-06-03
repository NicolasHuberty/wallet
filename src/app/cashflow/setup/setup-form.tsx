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
import {
  saveFinancialProfile,
  saveEnvelope,
  deleteEnvelope,
} from "../actions";
import type {
  EnvelopeCadence,
  RolloverPolicy,
  SavingsTargetMode,
} from "@/db/schema";

export type ProfileData = {
  bufferAmount: number;
  savingsTargetMode: SavingsTargetMode;
  savingsTargetAmount: number | null;
  defaultRolloverPolicy: RolloverPolicy;
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

const inputCls = "h-9 text-sm";
const moneyCls = "h-9 pr-7 text-right tabular-nums text-sm";

export function SetupForm({
  profile,
  envelopes,
}: {
  profile: ProfileData;
  envelopes: EnvelopeData[];
}) {
  return (
    <div className="space-y-8">
      <ProfileSection profile={profile} />
      <EnvelopesSection envelopes={envelopes} />
    </div>
  );
}

function ProfileSection({ profile }: { profile: ProfileData }) {
  const router = useRouter();
  const [buffer, setBuffer] = useState(String(profile.bufferAmount || ""));
  const [mode, setMode] = useState<SavingsTargetMode>(profile.savingsTargetMode);
  const [targetAmount, setTargetAmount] = useState(
    profile.savingsTargetAmount ? String(profile.savingsTargetAmount) : "",
  );
  const [rollover, setRollover] = useState<RolloverPolicy>(profile.defaultRolloverPolicy);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      try {
        await saveFinancialProfile({
          bufferAmount: Number(buffer) || 0,
          savingsTargetMode: mode,
          savingsTargetAmount: mode === "fixed" ? Number(targetAmount) || 0 : null,
          defaultRolloverPolicy: rollover,
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
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={pending} size="sm">
          <Save className="size-4" /> {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </section>
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
