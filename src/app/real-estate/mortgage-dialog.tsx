"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Calculator } from "lucide-react";
import { toast } from "sonner";
import { saveMortgage, generateAmortization } from "./actions";

type MortgageRow = {
  id?: string;
  propertyId?: string | null;
  name?: string;
  lender?: string | null;
  principal?: number;
  interestRatePct?: number;
  termMonths?: number;
  startDate?: string;
  monthlyPayment?: number;
  remainingBalance?: number;
};

export function MortgageDialog({ householdId, propertyId, mortgage, trigger }: { householdId: string; propertyId?: string; mortgage?: MortgageRow; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<MortgageRow>(
    mortgage ?? { propertyId, termMonths: 300, interestRatePct: 3, startDate: new Date().toISOString().slice(0, 10) }
  );
  const update = <K extends keyof MortgageRow>(k: K, v: MortgageRow[K]) => setForm((p) => ({ ...p, [k]: v }));

  function computePayment() {
    const P = Number(form.principal ?? 0);
    const r = Number(form.interestRatePct ?? 0) / 100 / 12;
    const n = Number(form.termMonths ?? 0);
    if (!P || !n) return toast.error("Capital et durée requis");
    const monthly = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
    update("monthlyPayment", Number(monthly.toFixed(2)));
    if (form.remainingBalance == null) update("remainingBalance", P);
  }

  function submit() {
    if (!form.name || !form.principal) {
      toast.error("Nom et capital requis");
      return;
    }
    start(async () => {
      await saveMortgage({
        id: mortgage?.id,
        householdId,
        propertyId: form.propertyId ?? null,
        name: form.name!,
        lender: form.lender ?? null,
        principal: Number(form.principal),
        interestRatePct: Number(form.interestRatePct ?? 0),
        termMonths: Number(form.termMonths ?? 0),
        startDate: form.startDate ?? new Date().toISOString().slice(0, 10),
        monthlyPayment: Number(form.monthlyPayment ?? 0),
        remainingBalance: Number(form.remainingBalance ?? form.principal),
      });
      toast.success(mortgage ? "Prêt mis à jour" : "Prêt créé");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement ?? <Button size="sm" variant="outline"><Plus className="size-4" /> Prêt</Button>} />
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{mortgage ? "Modifier le prêt" : "Nouveau prêt"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2"><Label>Nom</Label><Input value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} placeholder="Prêt hypothécaire" /></div>
            <div className="grid gap-2"><Label>Prêteur</Label><Input value={form.lender ?? ""} onChange={(e) => update("lender", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2"><Label>Capital</Label><Input type="number" value={form.principal ?? ""} onChange={(e) => update("principal", Number(e.target.value))} /></div>
            <div className="grid gap-2"><Label>Taux (%)</Label><Input type="number" step="0.01" value={form.interestRatePct ?? ""} onChange={(e) => update("interestRatePct", Number(e.target.value))} /></div>
            <div className="grid gap-2"><Label>Durée (mois)</Label><Input type="number" value={form.termMonths ?? ""} onChange={(e) => update("termMonths", Number(e.target.value))} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2"><Label>Début</Label><Input type="date" value={form.startDate ?? ""} onChange={(e) => update("startDate", e.target.value)} /></div>
            <div className="grid gap-2"><Label>Mensualité</Label>
              <div className="flex gap-1">
                <Input type="number" step="0.01" value={form.monthlyPayment ?? ""} onChange={(e) => update("monthlyPayment", Number(e.target.value))} />
                <Button type="button" size="icon" variant="outline" onClick={computePayment} title="Calculer"><Calculator className="size-4" /></Button>
              </div>
            </div>
            <div className="grid gap-2"><Label>Solde restant</Label><Input type="number" value={form.remainingBalance ?? ""} onChange={(e) => update("remainingBalance", Number(e.target.value))} /></div>
          </div>
        </div>
        <DialogFooter>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending}>{mortgage ? "Enregistrer" : "Créer"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditMortgageButton(props: { householdId: string; mortgage: MortgageRow }) {
  return <MortgageDialog {...props} trigger={<Button size="icon" variant="ghost"><Pencil className="size-4" /></Button>} />;
}

export function GenerateAmortizationButton({ mortgageId }: { mortgageId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
      await generateAmortization(mortgageId);
      toast.success("Tableau d'amortissement généré");
    })}>
      <Calculator className="size-4" /> Générer tableau
    </Button>
  );
}
