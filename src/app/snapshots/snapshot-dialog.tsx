"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
    if (!confirm("Supprimer ce snapshot ?")) return;
    start(async () => {
      await removeSnapshot(row.id!);
      toast.success("Supprimé");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement ?? <Button size="sm"><Plus className="size-4" /> Snapshot</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "Modifier le snapshot" : "Nouveau snapshot"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label>Date</Label><Input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2"><Label>Actifs totaux</Label><Input type="number" value={form.totalAssets ?? ""} onChange={(e) => setForm({ ...form, totalAssets: Number(e.target.value) })} /></div>
            <div className="grid gap-2"><Label>Passifs totaux</Label><Input type="number" value={form.totalLiabilities ?? ""} onChange={(e) => setForm({ ...form, totalLiabilities: Number(e.target.value) })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Utile pour <strong>backfiller</strong> l'historique à des dates antérieures.</p>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          {row?.id ? <Button variant="ghost" size="sm" className="text-destructive" onClick={remove} disabled={pending}><Trash2 className="size-4" /> Supprimer</Button> : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending}>{row ? "Enregistrer" : "Créer"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
