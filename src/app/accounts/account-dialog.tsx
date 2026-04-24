"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { saveAccount, deleteAccount } from "./actions";
import { accountKindLabel } from "@/lib/labels";
import type { AccountKind } from "@/db/schema";
import { Pencil, Plus, Trash2 } from "lucide-react";

const kinds = Object.keys(accountKindLabel) as AccountKind[];

type Member = { id: string; name: string };

type AccountRow = {
  id?: string;
  name?: string;
  kind?: AccountKind;
  institution?: string | null;
  currency?: string;
  currentValue?: number;
  ownership?: "shared" | "member";
  ownerMemberId?: string | null;
  sharedSplitPct?: number | null;
  annualYieldPct?: number | null;
  monthlyContribution?: number | null;
  notes?: string | null;
};

const growthCapableKinds: AccountKind[] = ["savings", "brokerage", "retirement", "crypto", "cash"];
const contributionCapableKinds: AccountKind[] = ["savings", "brokerage", "retirement", "cash"];

export function AccountDialog({
  householdId,
  members,
  account,
  trigger,
}: {
  householdId: string;
  members: Member[];
  account?: AccountRow;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, start] = useTransition();
  const [form, setForm] = useState<AccountRow>(
    account ?? { kind: "cash", ownership: "shared", sharedSplitPct: 50, currency: "EUR", currentValue: 0 }
  );

  function update<K extends keyof AccountRow>(k: K, v: AccountRow[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function submit() {
    if (!form.name || !form.kind) {
      toast.error("Nom et type requis");
      return;
    }
    start(async () => {
      try {
        await saveAccount({
          id: account?.id,
          householdId,
          name: form.name!,
          kind: form.kind!,
          institution: form.institution ?? null,
          currency: form.currency || "EUR",
          currentValue: Number(form.currentValue ?? 0),
          ownership: form.ownership ?? "shared",
          ownerMemberId: form.ownerMemberId ?? null,
          sharedSplitPct: form.sharedSplitPct ?? 50,
          annualYieldPct:
            form.annualYieldPct == null || form.annualYieldPct === ("" as unknown as number)
              ? null
              : Number(form.annualYieldPct),
          monthlyContribution:
            form.monthlyContribution == null || form.monthlyContribution === ("" as unknown as number)
              ? null
              : Number(form.monthlyContribution),
          notes: form.notes ?? null,
        });
        toast.success(account ? "Compte mis à jour" : "Compte créé");
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function remove() {
    if (!account?.id) return;
    if (!confirm(`Supprimer "${account.name}" ?`)) return;
    start(async () => {
      try {
        await deleteAccount(account.id!);
        toast.success("Compte supprimé");
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement ?? <Button size="sm"><Plus className="size-4" /> Nouveau compte</Button>} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "Modifier le compte" : "Nouveau compte"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Nom</Label>
            <Input value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} placeholder="Ex. Compte courant ING" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={form.kind} onValueChange={(v) => update("kind", v as AccountKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => <SelectItem key={k} value={k}>{accountKindLabel[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Institution</Label>
              <Input value={form.institution ?? ""} onChange={(e) => update("institution", e.target.value)} placeholder="ING, Belfius…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Valeur actuelle (EUR)</Label>
              <Input type="number" inputMode="decimal" value={form.currentValue ?? 0} onChange={(e) => update("currentValue", Number(e.target.value))} />
            </div>
            <div className="grid gap-2">
              <Label>Devise</Label>
              <Input value={form.currency ?? "EUR"} onChange={(e) => update("currency", e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Propriété</Label>
            <Select value={form.ownership} onValueChange={(v) => update("ownership", v as "shared" | "member")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">Partagé</SelectItem>
                <SelectItem value="member">Individuel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.ownership === "member" ? (
            <div className="grid gap-2">
              <Label>Propriétaire</Label>
              <Select value={form.ownerMemberId ?? undefined} onValueChange={(v) => update("ownerMemberId", v)}>
                <SelectTrigger><SelectValue placeholder="Choisir un membre" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>Part du ménage (%)</Label>
              <Input type="number" min={0} max={100} value={form.sharedSplitPct ?? 50} onChange={(e) => update("sharedSplitPct", Number(e.target.value))} />
            </div>
          )}
          {form.kind && growthCapableKinds.includes(form.kind) && (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Rendement annuel (%/an)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder={form.kind === "savings" ? "ex. 2.5" : "ex. 7"}
                  value={form.annualYieldPct ?? ""}
                  onChange={(e) => update("annualYieldPct", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              {contributionCapableKinds.includes(form.kind) && (
                <div className="grid gap-2">
                  <Label>Apport mensuel (EUR)</Label>
                  <Input
                    type="number"
                    step="1"
                    placeholder="ex. 300"
                    value={form.monthlyContribution ?? ""}
                    onChange={(e) => update("monthlyContribution", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </div>
              )}
            </div>
          )}
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {account?.id ? (
            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={remove} disabled={isPending}>
              <Trash2 className="size-4" /> Supprimer
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Annuler</Button>
            <Button type="button" onClick={submit} disabled={isPending}>{account ? "Enregistrer" : "Créer"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditAccountButton(props: { householdId: string; members: Member[]; account: AccountRow }) {
  return (
    <AccountDialog
      {...props}
      trigger={
        <Button size="icon" variant="ghost">
          <Pencil className="size-4" />
        </Button>
      }
    />
  );
}
