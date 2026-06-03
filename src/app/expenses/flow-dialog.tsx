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
type FlowFreq = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
type Row = {
  id?: string;
  label?: string;
  category?: string;
  amount?: number;
  ownership?: "shared" | "member";
  ownerMemberId?: string | null;
  startDate?: string;
  endDate?: string | null;
  // Champs cash-flow ("Cap")
  dayOfMonth?: number | null;
  frequency?: FlowFreq;
  flowType?: "fixed" | "variable";
  active?: boolean;
  isVariable?: boolean;
  floorAmount?: number | null;
};

const FREQ_LABEL: Record<FlowFreq, string> = {
  weekly: "Hebdomadaire",
  biweekly: "Quinzaine",
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  yearly: "Annuel",
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
      const base = {
        id: row?.id,
        householdId,
        label: form.label!,
        category: form.category as never,
        amount: Number(form.amount),
        ownership: form.ownership ?? (kind === "expense" ? "shared" : "member"),
        ownerMemberId: form.ownerMemberId ?? null,
        startDate: form.startDate ?? new Date().toISOString().slice(0, 10),
        endDate: form.endDate ?? null,
        dayOfMonth: form.dayOfMonth ?? null,
      };
      if (kind === "expense") {
        await saveRecurringExpense({
          ...base,
          frequency: form.frequency ?? "monthly",
          flowType: form.flowType ?? "fixed",
          active: form.active ?? true,
        });
      } else {
        await saveRecurringIncome({
          ...base,
          isVariable: form.isVariable ?? false,
          floorAmount: form.floorAmount ?? null,
        });
      }
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

          {/* ── Cash-flow ("Cap") ───────────────────────────────────── */}
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Cash-flow · Cap
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>{kind === "expense" ? "Jour du mois" : "Jour de versement"}</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  inputMode="numeric"
                  placeholder="ex. 12"
                  value={form.dayOfMonth ?? ""}
                  onChange={(e) =>
                    update("dayOfMonth", e.target.value === "" ? null : Number(e.target.value))
                  }
                  className="h-11 text-base md:h-8 md:text-sm"
                />
              </div>

              {kind === "expense" ? (
                <>
                  <div className="grid gap-2">
                    <Label>Fréquence</Label>
                    <Select
                      value={form.frequency ?? "monthly"}
                      onValueChange={(v) => update("frequency", v as FlowFreq)}
                    >
                      <SelectTrigger className="h-11 md:h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FREQ_LABEL) as FlowFreq[]).map((k) => (
                          <SelectItem key={k} value={k}>{FREQ_LABEL[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Type</Label>
                    <Select
                      value={form.flowType ?? "fixed"}
                      onValueChange={(v) => update("flowType", v as "fixed" | "variable")}
                    >
                      <SelectTrigger className="h-11 md:h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixe daté (auto-déduit)</SelectItem>
                        <SelectItem value="variable">Variable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label>Revenu</Label>
                    <Select
                      value={form.isVariable ? "variable" : "fixed"}
                      onValueChange={(v) => update("isVariable", v === "variable")}
                    >
                      <SelectTrigger className="h-11 md:h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixe (montant garanti)</SelectItem>
                        <SelectItem value="variable">Variable (plancher)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.isVariable && (
                    <div className="grid gap-2">
                      <Label>Plancher garanti / mois</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={form.floorAmount ?? ""}
                          onChange={(e) =>
                            update("floorAmount", e.target.value === "" ? null : Number(e.target.value))
                          }
                          className="h-11 pr-8 text-right tabular-nums text-base md:h-8 md:text-sm"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">€</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {kind === "expense"
                ? "Le jour + la fréquence permettent à Cap de déduire automatiquement cette charge de ton reste-à-vivre."
                : "Pour un revenu variable, Cap calcule ton budget sur le plancher ; le surplus déborde vers l'épargne."}
            </p>
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
