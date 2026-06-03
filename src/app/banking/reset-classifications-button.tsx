"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resetClassifications } from "./actions";

const CONFIRM_WORD = "RESET";

export function ResetClassificationsButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      try {
        const r = await resetClassifications();
        toast.success(
          `${r.cleared} transactions remises à zéro · ${r.rulesDeleted} règles supprimées. Relance « Recatégoriser » sur chaque compte.`,
        );
        setOpen(false);
        setConfirm("");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  return (
    <section className="mt-8 rounded-xl border border-destructive/40 bg-destructive/5 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-destructive">Réinitialiser les catégorisations</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Efface la catégorie, la source et les liens de <strong>toutes</strong> tes transactions,
            et supprime <strong>toutes</strong> tes règles de contrepartie. Repart de zéro pour
            recatégoriser proprement. Tes transactions et leurs montants ne sont pas supprimés.
            Ensuite, relance « Recatégoriser » sur chaque compte.
          </p>

          {!open ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => setOpen(true)}
            >
              Réinitialiser toutes les catégorisations…
            </Button>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="text-xs text-muted-foreground">
                Tape <strong className="text-foreground">{CONFIRM_WORD}</strong> pour confirmer :
              </label>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={CONFIRM_WORD}
                className="w-32 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-foreground focus:outline-none"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={confirm.trim().toUpperCase() !== CONFIRM_WORD || pending}
                  onClick={run}
                >
                  {pending ? "Réinitialisation…" : "Confirmer le reset"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setOpen(false);
                    setConfirm("");
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
