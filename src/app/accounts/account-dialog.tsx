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
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    start(async () => {
      try {
        await deleteAccount(account.id!);
        toast.success("Compte supprimé");
        setOpen(false);
        setConfirmDelete(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const moneyInput = "h-11 pr-8 text-right tabular-nums text-base md:h-8 md:text-sm";
  const textInput = "h-11 text-base md:h-8 md:text-sm";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as React.ReactElement ?? <Button size="sm"><Plus className="size-4" /> Nouveau compte</Button>} />
      <SheetContent desktopSize="md:max-w-lg">
        <SheetHeader>
          <SheetTitle>{account ? "Modifier le compte" : "Nouveau compte"}</SheetTitle>
        </SheetHeader>
        <SheetBody className="grid gap-4">
          <div className="grid gap-2">
            <Label>Nom</Label>
            <Input
              value={form.name ?? ""}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Ex. Compte courant ING"
              className={textInput}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={form.kind} onValueChange={(v) => update("kind", v as AccountKind)}>
                <SelectTrigger className="h-11 md:h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => <SelectItem key={k} value={k}>{accountKindLabel[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Institution</Label>
              <Input
                value={form.institution ?? ""}
                onChange={(e) => update("institution", e.target.value)}
                placeholder="ING, Belfius…"
                className={textInput}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Valeur actuelle (EUR)</Label>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={form.currentValue ?? 0}
                  onChange={(e) => update("currentValue", Number(e.target.value))}
                  className={moneyInput}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">€</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Devise</Label>
              <Input
                value={form.currency ?? "EUR"}
                onChange={(e) => update("currency", e.target.value.toUpperCase())}
                className={textInput}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Propriété</Label>
            <Select value={form.ownership} onValueChange={(v) => update("ownership", v as "shared" | "member")}>
              <SelectTrigger className="h-11 md:h-8"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="h-11 md:h-8"><SelectValue placeholder="Choisir un membre" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>Part du ménage (%)</Label>
              <Input
                type="number"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                min={0}
                max={100}
                value={form.sharedSplitPct ?? 50}
                onChange={(e) => update("sharedSplitPct", Number(e.target.value))}
                className="h-11 text-right tabular-nums text-base md:h-8 md:text-sm"
              />
            </div>
          )}
          {form.kind && growthCapableKinds.includes(form.kind) && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Rendement annuel (%/an)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    placeholder={form.kind === "savings" ? "ex. 2.5" : "ex. 7"}
                    value={form.annualYieldPct ?? ""}
                    onChange={(e) => update("annualYieldPct", e.target.value === "" ? null : Number(e.target.value))}
                    className="h-11 pr-8 text-right tabular-nums text-base md:h-8 md:text-sm"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
                </div>
              </div>
              {contributionCapableKinds.includes(form.kind) && (
                <div className="grid gap-2">
                  <Label>Apport mensuel (EUR)</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="1"
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      placeholder="ex. 300"
                      value={form.monthlyContribution ?? ""}
                      onChange={(e) => update("monthlyContribution", e.target.value === "" ? null : Number(e.target.value))}
                      className={moneyInput}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">€</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} rows={2} className="text-base md:text-sm" />
          </div>
        </SheetBody>
        <SheetFooter className="flex items-center justify-between md:justify-between">
          {account?.id ? (
            <Button
              type="button"
              variant={confirmDelete ? "destructive" : "ghost"}
              size="sm"
              className={confirmDelete ? "" : "text-destructive hover:text-destructive"}
              onClick={remove}
              disabled={isPending}
            >
              <Trash2 className="size-4" />
              {confirmDelete ? "Confirmer ?" : "Supprimer"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-1 justify-end gap-2 md:flex-none">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending} className="flex-1 md:flex-none">Annuler</Button>
            <Button type="button" onClick={submit} disabled={isPending} className="flex-1 md:flex-none">{account ? "Enregistrer" : "Créer"}</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
