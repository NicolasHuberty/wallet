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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveManualSnapshot, removeSnapshot } from "./actions";

type Row = { id?: string; date?: string; totalAssets?: number; totalLiabilities?: number };

export function SnapshotDialog({ householdId, row, trigger }: { householdId: string; row?: Row; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<Row>(row ?? { date: new Date().toISOString().slice(0, 10) });
  const [confirmDelete, setConfirmDelete] = useState(false);

  function submit() {
    if (!form.date || form.totalAssets == null || form.totalLiabilities == null) {
      toast.error("Date, actifs et passifs requis");
      return;
    }
    start(async () => {
      await saveManualSnapshot({
        householdId,
        date: form.date!,
        totalAssets: Number(form.totalAssets),
        totalLiabilities: Number(form.totalLiabilities),
      });
      toast.success(row ? "Snapshot mis à jour" : "Snapshot créé");
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
      await removeSnapshot(row.id!);
      toast.success("Supprimé");
      setOpen(false);
      setConfirmDelete(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as React.ReactElement ?? <Button size="sm"><Plus className="size-4" /> Snapshot</Button>} />
      <SheetContent desktopSize="md:max-w-md">
        <SheetHeader>
          <SheetTitle>{row ? "Modifier le snapshot" : "Nouveau snapshot"}</SheetTitle>
        </SheetHeader>
        <SheetBody className="grid gap-4">
          <div className="grid gap-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date ?? ""}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="h-11 text-base md:h-8 md:text-sm"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Actifs totaux</Label>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={form.totalAssets ?? ""}
                  onChange={(e) => setForm({ ...form, totalAssets: Number(e.target.value) })}
                  className="h-11 pr-8 text-right tabular-nums text-base md:h-8 md:text-sm"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">€</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Passifs totaux</Label>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={form.totalLiabilities ?? ""}
                  onChange={(e) => setForm({ ...form, totalLiabilities: Number(e.target.value) })}
                  className="h-11 pr-8 text-right tabular-nums text-base md:h-8 md:text-sm"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">€</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Utile pour <strong>backfiller</strong> l&apos;historique à des dates antérieures.</p>
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
