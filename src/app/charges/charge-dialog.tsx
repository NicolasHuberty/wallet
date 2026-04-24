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
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    start(async () => {
      await deleteCharge(charge.id!);
      toast.success("Supprimé");
      setOpen(false);
      setConfirmDelete(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as React.ReactElement ?? <Button size="sm"><Plus className="size-4" /> Frais one-shot</Button>} />
      <SheetContent desktopSize="md:max-w-lg">
        <SheetHeader>
          <SheetTitle>{charge ? "Modifier les frais" : "Nouveau frais one-shot"}</SheetTitle>
        </SheetHeader>
        <SheetBody className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Date</Label>
              <Input type="date" value={form.date ?? ""} onChange={(e) => update("date", e.target.value)} className="h-11 text-base md:h-8 md:text-sm" />
            </div>
            <div className="grid gap-2">
              <Label>Montant</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={form.amount ?? ""}
                  onChange={(e) => update("amount", Number(e.target.value))}
                  className="h-11 pr-8 text-right tabular-nums text-base md:h-8 md:text-sm"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">€</span>
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Libellé</Label>
            <Input value={form.label ?? ""} onChange={(e) => update("label", e.target.value)} placeholder="Ex. Notaire achat maison" className="h-11 text-base md:h-8 md:text-sm" />
          </div>
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
                <SelectTrigger className="h-11 md:h-8"><SelectValue /></SelectTrigger>
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
                Si coché, ces frais sont déduits de la plus-value du bien (affichage &quot;plus-value nette&quot;).
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} rows={3} className="text-base md:text-sm" />
          </div>
        </SheetBody>
        <SheetFooter className="flex items-center justify-between md:justify-between">
          {charge?.id ? (
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
            <Button onClick={submit} disabled={pending} className="flex-1 md:flex-none">{charge ? "Enregistrer" : "Enregistrer"}</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function EditChargeButton(props: { householdId: string; properties: PropertyOption[]; charge: ChargeRow }) {
  return <ChargeDialog {...props} trigger={<Button size="icon" variant="ghost"><Pencil className="size-3.5" /></Button>} />;
}
