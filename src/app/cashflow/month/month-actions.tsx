"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle2 } from "lucide-react";
import { formatEUR } from "@/lib/format";
import { openCycle, closeCycle } from "../actions";

export function MonthActions({ status }: { status: "none" | "open" | "closed" }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function doOpen() {
    start(async () => {
      try {
        const r = await openCycle();
        toast.success(r.alreadyOpen ? "Cycle déjà ouvert" : "Mois ouvert");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  function doClose() {
    start(async () => {
      try {
        const r = await closeCycle();
        if (r.alreadyClosed) {
          toast.info("Mois déjà clôturé");
        } else {
          toast.success(
            `Mois bouclé · ${formatEUR(r.toSavings ?? 0)} débordent vers l'épargne`,
          );
        }
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  if (status === "closed") {
    return (
      <Button variant="outline" size="sm" disabled>
        <CheckCircle2 className="size-4" /> Mois clôturé
      </Button>
    );
  }

  if (status === "open") {
    return (
      <Button size="sm" onClick={doClose} disabled={pending}>
        <CheckCircle2 className="size-4" /> {pending ? "Clôture…" : "Clôturer le mois"}
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={doOpen} disabled={pending}>
      <CalendarPlus className="size-4" /> {pending ? "Ouverture…" : "Ouvrir le mois"}
    </Button>
  );
}
