"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    start(async () => {
      await deleteProperty(property.accountId!);
      toast.success("Supprimé");
      setOpen(false);
      setConfirmDelete(false);
    });
  }

  const moneyInput = "h-11 pr-8 text-right tabular-nums text-base md:h-8 md:text-sm";
  const textInput = "h-11 text-base md:h-8 md:text-sm";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as React.ReactElement ?? <Button size="sm"><Plus className="size-4" /> Nouveau bien</Button>} />
      <SheetContent desktopSize="md:max-w-lg">
        <SheetHeader>
          <SheetTitle>{property ? "Modifier le bien" : "Nouveau bien"}</SheetTitle>
        </SheetHeader>
        <SheetBody className="grid gap-4">
          <div className="grid gap-2">
            <Label>Nom</Label>
            <Input value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} className={textInput} />
          </div>
          <div className="grid gap-2">
            <Label>Adresse</Label>
            <Input value={form.address ?? ""} onChange={(e) => update("address", e.target.value)} className={textInput} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Prix d&apos;achat</Label>
              <div className="relative">
                <Input type="number" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={form.purchasePrice ?? ""} onChange={(e) => update("purchasePrice", Number(e.target.value))} className={moneyInput} />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">€</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Date d&apos;achat</Label>
              <Input type="date" value={form.purchaseDate ?? ""} onChange={(e) => update("purchaseDate", e.target.value)} className={textInput} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Valeur actuelle</Label>
              <div className="relative">
                <Input type="number" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={form.currentValue ?? ""} onChange={(e) => update("currentValue", Number(e.target.value))} className={moneyInput} />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">€</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Appréciation annuelle (%)</Label>
              <div className="relative">
                <Input type="number" step="0.1" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={form.annualAppreciationPct ?? 2} onChange={(e) => update("annualAppreciationPct", Number(e.target.value))} className="h-11 pr-8 text-right tabular-nums text-base md:h-8 md:text-sm" />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Frais mensuels</Label>
              <div className="relative">
                <Input type="number" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={form.monthlyFees ?? 0} onChange={(e) => update("monthlyFees", Number(e.target.value))} className={moneyInput} />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">€</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Surface (m²)</Label>
              <Input type="number" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={form.surfaceSqm ?? ""} onChange={(e) => update("surfaceSqm", Number(e.target.value))} className="h-11 text-right tabular-nums text-base md:h-8 md:text-sm" />
            </div>
          </div>
        </SheetBody>
        <SheetFooter className="flex items-center justify-between md:justify-between">
          {property?.id ? (
            <Button
              variant={confirmDelete ? "destructive" : "ghost"}
              size="sm"
              className={confirmDelete ? "" : "text-destructive"}
              onClick={remove}
              disabled={pending}
            >
              <Trash2 className="size-4" />
              {confirmDelete ? "Confirmer ?" : "Supprimer"}
            </Button>
          ) : <span />}
          <div className="flex flex-1 justify-end gap-2 md:flex-none">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending} className="flex-1 md:flex-none">Annuler</Button>
            <Button onClick={submit} disabled={pending} className="flex-1 md:flex-none">{property ? "Enregistrer" : "Créer"}</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function EditPropertyButton(props: { householdId: string; property: PropertyRow }) {
  return <PropertyDialog {...props} trigger={<Button size="icon" variant="ghost"><Pencil className="size-4" /></Button>} />;
}
