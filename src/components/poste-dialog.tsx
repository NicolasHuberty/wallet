"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatEUR, formatDateFR } from "@/lib/format";
import {
  transactionCategory,
  categoryLabel,
  categoryColor,
  type TransactionCategory,
} from "@/lib/transaction-categorizer";
import { savePoste, deletePoste, previewPosteMatches } from "@/app/postes/actions";
import type { Poste, PosteKind, PostePreview } from "@/lib/postes";

export type PropertyOption = { id: string; label: string };

const KIND_LABEL: Record<PosteKind, string> = {
  variable: "Variable (étalé)",
  fixed: "Fixe (daté)",
  oneoff: "Ponctuel",
};
const KIND_HINT: Record<PosteKind, string> = {
  variable: "Budget dépensé au fil du mois (courses, sorties, essence…).",
  fixed: "Échéance récurrente à date connue (loyer, mutuelle, abonnement…).",
  oneoff: "Dépense exceptionnelle unique (notaire, travaux, taxe…).",
};

const EXPENSE_CATEGORY = [
  "housing", "utilities", "food", "transport", "insurance",
  "subscriptions", "leisure", "health", "childcare", "taxes", "other",
] as const;
const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  housing: "Logement", utilities: "Énergie & eau", food: "Alimentation",
  transport: "Transport", insurance: "Assurances", subscriptions: "Abonnements",
  leisure: "Loisirs", health: "Santé", childcare: "Garde d'enfants",
  taxes: "Impôts & taxes", other: "Autre",
};
const FREQUENCY_LABEL: Record<string, string> = {
  weekly: "Hebdomadaire", biweekly: "Bimensuel", monthly: "Mensuel",
  quarterly: "Trimestriel", yearly: "Annuel",
};
const CADENCE_LABEL: Record<string, string> = {
  weekly: "Hebdomadaire", biweekly: "Bimensuel", monthly: "Mensuel",
  per_occurrence: "Par occurrence",
};
const ROLLOVER_LABEL: Record<string, string> = {
  to_savings: "Vers l'épargne", accumulate: "Reporté", reset: "Remis à zéro",
};

// Catégories de transaction pertinentes pour une dépense (on exclut revenus,
// virements, épargne, retrait cash).
const SELECTABLE_CATEGORIES = transactionCategory.filter(
  (c) => !["income_salary", "income_other", "transfer_internal", "savings_invest", "cash_withdrawal"].includes(c),
);

const selectCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-foreground focus:outline-none";

export function PosteDialog({
  poste,
  defaultKind = "variable",
  properties = [],
  trigger,
  initialLabel,
  initialAmount,
  initialPatterns,
}: {
  poste?: Poste;
  defaultKind?: PosteKind;
  properties?: PropertyOption[];
  trigger: React.ReactNode;
  initialLabel?: string;
  initialAmount?: number;
  initialPatterns?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [kind, setKind] = useState<PosteKind>(poste?.kind ?? defaultKind);
  const [label, setLabel] = useState(poste?.label ?? initialLabel ?? "");
  const [category, setCategory] = useState(poste?.category ?? "other");
  const [amount, setAmount] = useState(
    poste ? String(poste.amount) : initialAmount != null ? String(initialAmount) : "",
  );
  const [cadence, setCadence] = useState(poste?.cadence ?? "monthly");
  const [rollover, setRollover] = useState(poste?.rolloverPolicy ?? "to_savings");
  const [frequency, setFrequency] = useState(poste?.frequency ?? "monthly");
  const [dayOfMonth, setDayOfMonth] = useState(poste?.dayOfMonth ?? 1);
  const [date, setDate] = useState(
    poste?.date ? new Date(poste.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [propertyId, setPropertyId] = useState(poste?.propertyId ?? "");
  const [costBasis, setCostBasis] = useState(poste?.includeInCostBasis ?? false);
  const [txCats, setTxCats] = useState<string[]>(poste?.txCategories ?? []);
  const [patterns, setPatterns] = useState<string[]>(poste?.counterpartyPatterns ?? initialPatterns ?? []);
  const [patternInput, setPatternInput] = useState("");
  const [preview, setPreview] = useState<PostePreview | null>(null);

  function toggleCat(c: string) {
    setTxCats((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
    setPreview(null);
  }
  function addPattern() {
    const v = patternInput.trim();
    if (v.length < 2) return;
    if (!patterns.includes(v)) setPatterns((p) => [...p, v]);
    setPatternInput("");
    setPreview(null);
  }
  function removePattern(v: string) {
    setPatterns((p) => p.filter((x) => x !== v));
    setPreview(null);
  }

  function runPreview() {
    start(async () => {
      try {
        const r = await previewPosteMatches({ counterpartyPatterns: patterns, txCategories: txCats });
        setPreview(r);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function save() {
    if (!label.trim()) return toast.error("Donne un libellé au poste.");
    const amt = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(amt) || amt < 0) return toast.error("Montant invalide.");
    start(async () => {
      try {
        await savePoste({
          kind,
          id: poste?.id,
          label: label.trim(),
          category,
          amount: amt,
          active: poste?.active ?? true,
          txCategories: txCats,
          counterpartyPatterns: patterns,
          cadence: kind === "variable" ? (cadence as never) : undefined,
          rolloverPolicy: kind === "variable" ? (rollover as never) : undefined,
          frequency: kind === "fixed" ? (frequency as never) : undefined,
          dayOfMonth: kind === "fixed" ? dayOfMonth : undefined,
          date: kind === "oneoff" ? date : undefined,
          propertyId: kind === "oneoff" ? (propertyId || null) : undefined,
          includeInCostBasis: kind === "oneoff" ? costBasis : undefined,
        });
        toast.success(poste ? "Poste mis à jour" : "Poste créé");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function remove() {
    if (!poste) return;
    start(async () => {
      try {
        await deletePoste({ kind: poste.kind, id: poste.id });
        toast.success("Poste supprimé");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const amountUnit =
    kind === "variable"
      ? `€ / ${cadence === "monthly" ? "mois" : CADENCE_LABEL[cadence]?.toLowerCase() ?? "période"}`
      : kind === "fixed"
        ? `€ / ${FREQUENCY_LABEL[frequency]?.toLowerCase() ?? "échéance"}`
        : "€";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as React.ReactElement} />
      <SheetContent desktopSize="md:max-w-lg">
        <SheetHeader>
          <SheetTitle>{poste ? "Modifier le poste" : "Nouveau poste"}</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-4">
          {/* Type */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Type</Label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {(Object.keys(KIND_LABEL) as PosteKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={!!poste}
                  onClick={() => setKind(k)}
                  className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                    kind === k ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/50"
                  } disabled:opacity-60`}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{KIND_HINT[kind]}</p>
          </div>

          {/* Libellé + montant */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Libellé</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Courses, Mutuelle…" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Montant ({amountUnit})</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* Champs spécifiques */}
          {kind === "variable" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[11px] text-muted-foreground">Cadence</Label>
                <select className={selectCls} value={cadence} onChange={(e) => setCadence(e.target.value as never)}>
                  {Object.entries(CADENCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[11px] text-muted-foreground">Débordement</Label>
                <select className={selectCls} value={rollover} onChange={(e) => setRollover(e.target.value as never)}>
                  {Object.entries(ROLLOVER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
          )}
          {kind === "fixed" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[11px] text-muted-foreground">Fréquence</Label>
                <select className={selectCls} value={frequency} onChange={(e) => setFrequency(e.target.value as never)}>
                  {Object.entries(FREQUENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[11px] text-muted-foreground">Jour du mois</Label>
                <Input
                  type="number" min={1} max={31} value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                />
              </div>
            </div>
          )}
          {kind === "oneoff" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[11px] text-muted-foreground">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              {properties.length > 0 && (
                <div className="grid gap-1.5">
                  <Label className="text-[11px] text-muted-foreground">Bien (optionnel)</Label>
                  <select className={selectCls} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                    <option value="">—</option>
                    {properties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
              )}
              {propertyId && (
                <label className="col-span-2 flex items-center gap-2 text-xs">
                  <Checkbox checked={costBasis} onCheckedChange={(v) => setCostBasis(!!v)} />
                  Inclure dans la base de coût du bien
                </label>
              )}
            </div>
          )}

          {/* Catégorie d'affichage */}
          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Catégorie (regroupement)</Label>
            <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORY.map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>

          {/* Règles de liaison (variable/fixe) */}
          {kind !== "oneoff" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold">Liaison aux transactions</p>

              <div>
                <Label className="text-[11px] text-muted-foreground">Catégories absorbées</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {SELECTABLE_CATEGORIES.map((c) => {
                    const on = txCats.includes(c);
                    return (
                      <button
                        key={c} type="button" onClick={() => toggleCat(c)}
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                          on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/50"
                        }`}
                      >
                        <span className="size-2 rounded-full" style={{ background: on ? "var(--background)" : categoryColor[c as TransactionCategory] }} />
                        {categoryLabel[c as TransactionCategory]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-[11px] text-muted-foreground">Règles de contrepartie</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    value={patternInput}
                    onChange={(e) => setPatternInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPattern(); } }}
                    placeholder="ex. dats, shell, mutplus…"
                    className="h-9"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addPattern}><Plus className="size-3.5" /></Button>
                </div>
                {patterns.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {patterns.map((p) => (
                      <span key={p} className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px]">
                        {p}
                        <button type="button" onClick={() => removePattern(p)} className="text-muted-foreground hover:text-foreground">
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {(patterns.length > 0 || txCats.length > 0) && (
                <div>
                  <Button type="button" size="sm" variant="outline" onClick={runPreview} disabled={pending}>
                    <Search className="size-3.5" /> {pending ? "Calcul…" : "Voir l'impact"}
                  </Button>
                  {preview && (
                    <div className="mt-2 rounded-md border border-border bg-background p-2.5 text-xs">
                      <div className="font-medium">
                        {preview.totalCount} transaction(s) · {formatEUR(preview.totalAmount)}
                      </div>
                      {preview.byPattern.length > 0 && (
                        <ul className="mt-1 text-[10px] text-muted-foreground">
                          {preview.byPattern.map((b) => (
                            <li key={b.pattern}>« {b.pattern} » → {b.count} tx · {formatEUR(b.total)}</li>
                          ))}
                        </ul>
                      )}
                      <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
                        {preview.matched.slice(0, 25).map((m) => (
                          <li key={m.id} className="flex items-center justify-between gap-2">
                            <span className="truncate text-muted-foreground">
                              {formatDateFR(m.date)} · {m.label}
                            </span>
                            <span className="numeric tabular-nums">{formatEUR(m.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      {preview.totalCount > 25 && (
                        <p className="mt-1 text-[10px] text-muted-foreground">+ {preview.totalCount - 25} autres</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetBody>
        <SheetFooter className="flex justify-between">
          {poste ? (
            <Button variant="ghost" className="text-destructive" onClick={remove} disabled={pending}>
              <Trash2 className="size-4" /> Supprimer
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={save} disabled={pending}>{poste ? "Enregistrer" : "Créer"}</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
