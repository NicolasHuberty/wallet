"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveProperty, deleteProperty } from "./actions";

type PropertyRow = {
  id?: string;
  accountId?: string;
  name?: string;
  address?: string | null;
  purchasePrice?: number;
  purchaseDate?: string;
  currentValue?: number;
  annualAppreciationPct?: number;
  monthlyFees?: number;
  surfaceSqm?: number | null;
};

export function PropertyDialog({ householdId, property, trigger }: { householdId: string; property?: PropertyRow; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<PropertyRow>(
    property ?? { annualAppreciationPct: 2, monthlyFees: 0, purchaseDate: new Date().toISOString().slice(0, 10) }
  );
  const update = <K extends keyof PropertyRow>(k: K, v: PropertyRow[K]) => setForm((p) => ({ ...p, [k]: v }));

  function submit() {
    if (!form.name || form.purchasePrice == null || form.currentValue == null) {
      toast.error("Nom, prix d'achat, valeur actuelle requis");
      return;
    }
    start(async () => {
      await saveProperty({
        id: property?.id,
        householdId,
        name: form.name!,
        address: form.address ?? null,
        purchasePrice: Number(form.purchasePrice),
        purchaseDate: form.purchaseDate ?? new Date().toISOString().slice(0, 10),
        currentValue: Number(form.currentValue),
        annualAppreciationPct: Number(form.annualAppreciationPct ?? 2),
        monthlyFees: Number(form.monthlyFees ?? 0),
        surfaceSqm: form.surfaceSqm ?? null,
      });
      toast.success(property ? "Bien mis à jour" : "Bien ajouté");
      setOpen(false);
    });
  }

  function remove() {
    if (!property?.accountId) return;
    if (!confirm(`Supprimer le bien "${property.name}" ?`)) return;
    start(async () => {
      await deleteProperty(property.accountId!);
      toast.success("Supprimé");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement ?? <Button size="sm"><Plus className="size-4" /> Nouveau bien</Button>} />
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{property ? "Modifier le bien" : "Nouveau bien"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label>Nom</Label><Input value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} /></div>
          <div className="grid gap-2"><Label>Adresse</Label><Input value={form.address ?? ""} onChange={(e) => update("address", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2"><Label>Prix d'achat</Label><Input type="number" value={form.purchasePrice ?? ""} onChange={(e) => update("purchasePrice", Number(e.target.value))} /></div>
            <div className="grid gap-2"><Label>Date d'achat</Label><Input type="date" value={form.purchaseDate ?? ""} onChange={(e) => update("purchaseDate", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2"><Label>Valeur actuelle</Label><Input type="number" value={form.currentValue ?? ""} onChange={(e) => update("currentValue", Number(e.target.value))} /></div>
            <div className="grid gap-2"><Label>Appréciation annuelle (%)</Label><Input type="number" step="0.1" value={form.annualAppreciationPct ?? 2} onChange={(e) => update("annualAppreciationPct", Number(e.target.value))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2"><Label>Frais mensuels</Label><Input type="number" value={form.monthlyFees ?? 0} onChange={(e) => update("monthlyFees", Number(e.target.value))} /></div>
            <div className="grid gap-2"><Label>Surface (m²)</Label><Input type="number" value={form.surfaceSqm ?? ""} onChange={(e) => update("surfaceSqm", Number(e.target.value))} /></div>
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          {property?.id ? <Button variant="ghost" size="sm" className="text-destructive" onClick={remove} disabled={pending}><Trash2 className="size-4" /> Supprimer</Button> : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending}>{property ? "Enregistrer" : "Créer"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditPropertyButton(props: { householdId: string; property: PropertyRow }) {
  return <PropertyDialog {...props} trigger={<Button size="icon" variant="ghost"><Pencil className="size-4" /></Button>} />;
}
