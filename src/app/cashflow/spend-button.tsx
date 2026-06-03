"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { confirmSpend } from "./actions";

export type SpendTarget = { id: string; label: string };

/**
 * Cash-flow ("Cap") — la « Spend Sheet » : confirmation d'une dépense variable
 * en quelques taps. Devine l'enveloppe via les chips, ou impute au coussin.
 */
export function SpendButton({
  envelopes,
  trigger,
}: {
  envelopes: SpendTarget[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState<string | "buffer">(
    envelopes[0]?.id ?? "buffer",
  );
  const [pending, start] = useTransition();

  function submit() {
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Indique un montant.");
      return;
    }
    start(async () => {
      try {
        await confirmSpend({
          amount: value,
          envelopeId: target === "buffer" ? null : target,
          chargedToBuffer: target === "buffer",
        });
        toast.success("Dépense ajoutée");
        setAmount("");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <Button>
              <Plus className="size-4" /> J&apos;ai dépensé
            </Button>
          )
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>J&apos;ai dépensé</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Combien ?</Label>
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                autoFocus
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-14 pr-8 text-right text-2xl font-semibold tabular-nums"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                €
              </span>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Sur quoi ?</Label>
            <div className="flex flex-wrap gap-2">
              {envelopes.map((e) => (
                <Chip
                  key={e.id}
                  active={target === e.id}
                  onClick={() => setTarget(e.id)}
                  label={e.label}
                />
              ))}
              <Chip
                active={target === "buffer"}
                onClick={() => setTarget("buffer")}
                label="Imprévu (coussin)"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={pending} className="w-full">
            {pending ? "Ajout…" : "Valider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[2.5rem] items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border hover:border-foreground/40"
      }`}
    >
      {label}
    </button>
  );
}
