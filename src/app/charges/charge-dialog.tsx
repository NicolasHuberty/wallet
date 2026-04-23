"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveCharge, deleteCharge } from "./actions";
import { chargeCategoryLabel } from "@/lib/labels";
import { chargeCategory } from "@/db/schema";
import { CategoryPicker } from "@/components/category-picker";

type ChargeRow = {
  id?: string;
  date?: string;
  label?: string;
  category?: string;
  amount?: number;
  accountId?: string | null;
  propertyId?: string | null;
  includeInCostBasis?: boolean;
  notes?: string | null;
};

type PropertyOption = { id: string; name: string };

export function ChargeDialog({
  householdId,
  properties,
  charge,
  defaultPropertyId,
  trigger,
}: {
  householdId: string;
  properties: PropertyOption[];
  charge?: ChargeRow;
  defaultPropertyId?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<ChargeRow>(
    charge ?? {
      date: new Date().toISOString().slice(0, 10),
      category: "notary",
      includeInCostBasis: true,
      propertyId: defaultPropertyId ?? null,
    }
  );
  const update = <K extends keyof ChargeRow>(k: K, v: ChargeRow[K]) => setForm((p) => ({ ...p, [k]: v }));

  function submit() {
    if (!form.label || !form.amount || !form.category || !form.date) {
      toast.error("Date, libellé, catégorie, montant requis");
      return;
    }
    start(async () => {
      await saveCharge({
        id: charge?.id,
        householdId,
        date: form.date!,
        label: form.label!,
        category: form.category as never,
        amount: Number(form.amount),
        accountId: form.accountId ?? null,
        propertyId: form.propertyId ?? null,
        includeInCostBasis: form.includeInCostBasis ?? true,
        notes: form.notes ?? null,
      });
      toast.success(charge ? "Frais mis à jour" : "Frais enregistré");
      setOpen(false);
    });
  }

  function remove() {
    if (!charge?.id) return;
    if (!confirm(`Supprimer "${charge.label}" ?`)) return;
    start(async () => {
      await deleteCharge(charge.id!);
      toast.success("Supprimé");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement ?? <Button size="sm"><Plus className="size-4" /> Frais one-shot</Button>} />
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{charge ? "Modifier les frais" : "Nouveau frais one-shot"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2"><Label>Date</Label><Input type="date" value={form.date ?? ""} onChange={(e) => update("date", e.target.value)} /></div>
            <div className="grid gap-2"><Label>Montant</Label><Input type="number" step="0.01" value={form.amount ?? ""} onChange={(e) => update("amount", Number(e.target.value))} /></div>
          </div>
          <div className="grid gap-2"><Label>Libellé</Label><Input value={form.label ?? ""} onChange={(e) => update("label", e.target.value)} placeholder="Ex. Notaire achat maison" /></div>
          <div className="grid gap-2">
            <Label>Catégorie</Label>
            <CategoryPicker
              value={form.category ?? "other"}
              onChange={(v) => update("category", v)}
              presets={[...chargeCategory]}
              presetLabels={chargeCategoryLabel}
            />
          </div>
          {properties.length > 0 && (
            <div className="grid gap-2">
              <Label>Lier à un bien immobilier (optionnel)</Label>
              <Select value={form.propertyId ?? "none"} onValueChange={(v) => update("propertyId", v === "none" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Non lié —</SelectItem>
                  {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
            <Checkbox
              checked={form.includeInCostBasis ?? true}
              onCheckedChange={(v) => update("includeInCostBasis", !!v)}
              id="cost-basis"
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label htmlFor="cost-basis" className="text-sm font-medium">Inclure dans le coût de revient</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Si coché, ces frais sont déduits de la plus-value du bien (affichage "plus-value nette").
              </p>
            </div>
          </div>
          <div className="grid gap-2"><Label>Notes</Label><Textarea value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          {charge?.id ? <Button variant="ghost" size="sm" className="text-destructive" onClick={remove} disabled={pending}><Trash2 className="size-4" /> Supprimer</Button> : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending}>{charge ? "Enregistrer" : "Enregistrer"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditChargeButton(props: { householdId: string; properties: PropertyOption[]; charge: ChargeRow }) {
  return <ChargeDialog {...props} trigger={<Button size="icon" variant="ghost"><Pencil className="size-3.5" /></Button>} />;
}
