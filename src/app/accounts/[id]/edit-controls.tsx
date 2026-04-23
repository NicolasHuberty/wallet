"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Plus, Trash2, X } from "lucide-react";
import {
  patchAccount,
  addAccountHistoryPoint,
  deleteAccountHistoryPoint,
} from "../actions";
import { formatEUR, formatDateFR } from "@/lib/format";

type DCAProps = {
  accountId: string;
  annualYieldPct: number | null;
  monthlyContribution: number | null;
  canYield: boolean;
  canContribute: boolean;
};

export function DCASettingsEditor({
  accountId,
  annualYieldPct,
  monthlyContribution,
  canYield,
  canContribute,
}: DCAProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [yieldVal, setYieldVal] = useState<number | "">(annualYieldPct ?? "");
  const [dca, setDca] = useState<number | "">(monthlyContribution ?? "");

  const dirty =
    (yieldVal === "" ? annualYieldPct != null : Number(yieldVal) !== annualYieldPct) ||
    (dca === "" ? monthlyContribution != null : Number(dca) !== monthlyContribution);

  function save() {
    start(async () => {
      try {
        await patchAccount({
          id: accountId,
          annualYieldPct: yieldVal === "" ? null : Number(yieldVal),
          monthlyContribution: dca === "" ? null : Number(dca),
        });
        toast.success("Paramètres enregistrés");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (!canYield && !canContribute) {
    return (
      <p className="py-3 text-center text-xs text-muted-foreground">
        Pas de paramètres DCA applicables à ce type de compte.
      </p>
    );
  }

  return (
    <div className="grid gap-3 py-2">
      {canYield && (
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Rendement annuel</Label>
          <div className="relative">
            <Input
              type="number"
              step="0.1"
              placeholder="ex. 2.5 ou 7"
              value={yieldVal}
              onChange={(e) =>
                setYieldVal(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="pr-8 text-right numeric"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              %
            </span>
          </div>
        </div>
      )}
      {canContribute && (
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Apport mensuel (DCA)</Label>
          <div className="relative">
            <Input
              type="number"
              step="1"
              placeholder="ex. 300"
              value={dca}
              onChange={(e) =>
                setDca(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="pr-8 text-right numeric"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <p className="mr-auto text-[11px] text-muted-foreground">
          Modifiable à tout moment — pas un engagement.
        </p>
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          <Check className="size-3.5" />
          {pending ? "…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}

export function AddHistoryPointForm({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [value, setValue] = useState<number | "">("");

  function reset() {
    setDate(new Date().toISOString().slice(0, 10));
    setValue("");
  }

  function submit() {
    if (value === "" || !date) {
      toast.error("Date et valeur requises");
      return;
    }
    start(async () => {
      try {
        await addAccountHistoryPoint({
          accountId,
          date,
          value: Number(value),
        });
        toast.success("Point d'historique ajouté");
        reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground hover:border-[var(--chart-1)] hover:text-[var(--chart-1)]"
      >
        <Plus className="size-3.5" /> Ajouter un point d&apos;historique
      </button>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-2">
          <Label className="text-[10px] text-muted-foreground">Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="col-span-3">
          <Label className="text-[10px] text-muted-foreground">Valeur (EUR)</Label>
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              placeholder="ex. 5 400"
              value={value}
              onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
              className="h-8 pr-6 text-right text-xs tabular-nums"
              autoFocus
            />
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
              €
            </span>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Tip : si tu saisis une date déjà existante, le point est mis à jour (upsert par jour).
      </p>
      <div className="flex items-center justify-end gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
        >
          <X className="size-3.5" />
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          <Check className="size-3.5" /> {pending ? "…" : "Ajouter"}
        </Button>
      </div>
    </div>
  );
}

export function DeleteHistoryButton({
  id,
  accountId,
  date,
  value,
}: {
  id: string;
  accountId: string;
  date: string;
  value: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-6 text-destructive hover:text-destructive"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `Supprimer le point du ${formatDateFR(date)} (${formatEUR(value)}) ?`
          )
        )
          return;
        start(async () => {
          try {
            await deleteAccountHistoryPoint(id, accountId);
            toast.success("Point supprimé");
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          }
        });
      }}
      title="Supprimer ce point"
    >
      <Trash2 className="size-3" />
    </Button>
  );
}
