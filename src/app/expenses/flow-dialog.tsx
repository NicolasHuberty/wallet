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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  saveRecurringExpense,
  deleteRecurringExpense,
  saveRecurringIncome,
  deleteRecurringIncome,
} from "./actions";
import { expenseCategoryLabel, incomeCategoryLabel } from "@/lib/labels";

type Member = { id: string; name: string };
type Row = {
  id?: string;
  label?: string;
  category?: string;
  amount?: number;
  ownership?: "shared" | "member";
  ownerMemberId?: string | null;
  startDate?: string;
  endDate?: string | null;
};

export function FlowDialog({
  householdId,
  members,
  kind,
  row,
  trigger,
}: {
  householdId: string;
  members: Member[];
  kind: "expense" | "income";
  row?: Row;
  trigger?: React.ReactNode;
}) {
  const labels = kind === "expense" ? expenseCategoryLabel : incomeCategoryLabel;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<Row>(
    row ?? {
      ownership: kind === "expense" ? "shared" : "member",
      startDate: new Date().toISOString().slice(0, 10),
      category: Object.keys(labels)[0],
    }
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = <K extends keyof Row>(k: K, v: Row[K]) => setForm((p) => ({ ...p, [k]: v }));

  function submit() {
    if (!form.label || !form.amount || !form.category) {
      toast.error("Libellé, catégorie et montant requis");
      return;
    }
    start(async () => {
      const payload = {
        id: row?.id,
        householdId,
        label: form.label!,
        category: form.category as never,
        amount: Number(form.amount),
        ownership: form.ownership ?? (kind === "expense" ? "shared" : "member"),
        ownerMemberId: form.ownerMemberId ?? null,
        startDate: form.startDate ?? new Date().toISOString().slice(0, 10),
        endDate: form.endDate ?? null,
      };
      if (kind === "expense") await saveRecurringExpense(payload);
      else await saveRecurringIncome(payload);
      toast.success(row ? "Mis à jour" : "Créé");
      setOpen(false);
    });
  }

  function remove() {
    if (!row?.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    start(async () => {
      if (kind === "expense") await deleteRecurringExpense(row.id!);
      else await deleteRecurringIncome(row.id!);
      toast.success("Supprimé");
      setOpen(false);
      setConfirmDelete(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as React.ReactElement ?? <Button size="sm"><Plus className="size-4" /> {kind === "expense" ? "Dépense" : "Revenu"}</Button>} />
      <SheetContent desktopSize="md:max-w-lg">
        <SheetHeader>
          <SheetTitle>{row ? "Modifier" : `Nouvelle ${kind === "expense" ? "dépense récurrente" : "source de revenus"}`}</SheetTitle>
        </SheetHeader>
        <SheetBody className="grid gap-4">
          <div className="grid gap-2">
            <Label>Libellé</Label>
            <Input value={form.label ?? ""} onChange={(e) => update("label", e.target.value)} className="h-11 text-base md:h-8 md:text-sm" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Catégorie</Label>
              <Select value={form.category} onValueChange={(v) => update("category", v ?? undefined)}>
                <SelectTrigger className="h-11 md:h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(labels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Montant mensuel</Label>
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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Propriété</Label>
              <Select value={form.ownership} onValueChange={(v) => update("ownership", v as Row["ownership"])}>
                <SelectTrigger className="h-11 md:h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shared">Partagé</SelectItem>
                  <SelectItem value="member">Individuel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.ownership === "member" && (
              <div className="grid gap-2">
                <Label>Membre</Label>
                <Select value={form.ownerMemberId ?? undefined} onValueChange={(v) => update("ownerMemberId", v)}>
                  <SelectTrigger className="h-11 md:h-8"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Début</Label>
              <Input type="date" value={form.startDate ?? ""} onChange={(e) => update("startDate", e.target.value)} className="h-11 text-base md:h-8 md:text-sm" />
            </div>
            <div className="grid gap-2">
              <Label>Fin (optionnel)</Label>
              <Input type="date" value={form.endDate ?? ""} onChange={(e) => update("endDate", e.target.value)} className="h-11 text-base md:h-8 md:text-sm" />
            </div>
          </div>
        </SheetBody>
        <SheetFooter className="flex items-center justify-between md:justify-between">
          {row?.id ? (
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
            <Button onClick={submit} disabled={pending} className="flex-1 md:flex-none">{row ? "Enregistrer" : "Créer"}</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function EditFlowButton(props: { householdId: string; members: Member[]; kind: "expense" | "income"; row: Row }) {
  return <FlowDialog {...props} trigger={<Button size="icon" variant="ghost"><Pencil className="size-3.5" /></Button>} />;
}
