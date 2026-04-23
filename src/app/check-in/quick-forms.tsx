"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Check, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { quickAddExpense, quickAddCharge, quickAddIncome } from "./actions";
import { CategoryPicker } from "@/components/category-picker";
import {
  expenseCategoryLabel,
  chargeCategoryLabel,
  oneOffIncomeCategoryLabel,
} from "@/lib/labels";
import { expenseCategory, chargeCategory, oneOffIncomeCategory } from "@/db/schema";

const CUSTOM_SENTINEL = "__custom__";
const expenseCategories = [...expenseCategory] as string[];
const chargeCategories = [...chargeCategory] as string[];
const incomeCategories = [...oneOffIncomeCategory] as string[];

export function QuickAddExpense({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [amount, setAmount] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  function reset() {
    setLabel("");
    setCategory("other");
    setAmount("");
    setNotes("");
  }

  function submit() {
    if (!label || amount === "" || amount <= 0) {
      toast.error("Libellé et montant requis");
      return;
    }
    start(async () => {
      try {
        await quickAddExpense({
          householdId,
          label,
          category,
          amount: Number(amount),
          notes: notes || null,
        });
        toast.success("Dépense ajoutée");
        reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/70 py-2 text-[11px] font-medium text-muted-foreground hover:border-[var(--chart-1)] hover:text-[var(--chart-1)]"
      >
        <Plus className="size-3.5" /> Ajouter une dépense récurrente
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="grid gap-2">
        <Input
          placeholder="Libellé (ex. Netflix, Abonnement salle…)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8 text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <CategoryPicker
            value={category}
            onChange={setCategory}
            presets={expenseCategories}
            presetLabels={expenseCategoryLabel}
          />
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              placeholder="Montant"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="h-8 pr-6 text-right text-xs tabular-nums"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
              €
            </span>
          </div>
        </div>
        <Textarea
          placeholder="Note (optionnel)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="text-xs"
        />
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            disabled={pending}
          >
            <X className="size-3.5" />
          </Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            <Check className="size-3.5" /> {pending ? "…" : "Ajouter"}
          </Button>
        </div>
      </div>
    </div>
  );
}

type Template = {
  id: string;
  label: string;
  category: string;
  defaultAmount: number | null;
  notes: string | null;
};

export function QuickAddIncome({
  householdId,
  templates = [],
}: {
  householdId: string;
  templates?: Template[];
}) {
  const router = useRouter();
  const todayIso = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>("bonus");
  const [amount, setAmount] = useState<number | "">("");
  const [date, setDate] = useState(todayIso);
  const [notes, setNotes] = useState("");
  const [saveTemplate, setSaveTemplate] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);

  function reset() {
    setLabel("");
    setCategory("bonus");
    setAmount("");
    setDate(todayIso);
    setNotes("");
    setSaveTemplate(true);
    setTemplateId(null);
  }

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(t.id);
    setLabel(t.label);
    setCategory(t.category);
    if (t.defaultAmount != null) setAmount(t.defaultAmount);
    setNotes(t.notes ?? "");
    setOpen(true);
  }

  function submit() {
    if (!label || amount === "" || amount <= 0) {
      toast.error("Libellé et montant requis");
      return;
    }
    start(async () => {
      try {
        await quickAddIncome({
          householdId,
          date,
          label,
          category,
          amount: Number(amount),
          notes: notes || null,
          saveAsTemplate: saveTemplate,
          templateId,
        });
        toast.success("Revenu exceptionnel ajouté");
        reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <div className="space-y-2">
        {templates.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Modèles :
            </span>
            {templates.slice(0, 6).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium hover:border-[var(--color-success)] hover:text-[var(--color-success)]"
                title={t.defaultAmount != null ? `${t.label} · ${t.defaultAmount} €` : t.label}
              >
                {t.label}
                {t.defaultAmount != null && (
                  <span className="text-muted-foreground">
                    · {Math.round(t.defaultAmount)}€
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/70 py-2 text-[11px] font-medium text-muted-foreground hover:border-[var(--color-success)] hover:text-[var(--color-success)]"
        >
          <Plus className="size-3.5" /> Ajouter un revenu exceptionnel
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="grid gap-2">
        {templates.length > 0 && !templateId && (
          <Select value={undefined} onValueChange={(v) => v && applyTemplate(v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Réutiliser un modèle…" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                  {t.defaultAmount != null && ` · ${t.defaultAmount} €`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {templateId && (
          <div className="flex items-center justify-between rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 px-2 py-1 text-[11px] text-[var(--color-success)]">
            <span>Modèle préchargé — libre de modifier ci-dessous</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setTemplateId(null)}
            >
              ×
            </button>
          </div>
        )}
        <Input
          placeholder="Libellé (ex. Prime de fin d'année, Remboursement médical…)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8 text-xs"
        />
        <div className="grid grid-cols-3 gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 text-xs"
          />
          <CategoryPicker
            value={category}
            onChange={setCategory}
            presets={incomeCategories}
            presetLabels={oneOffIncomeCategoryLabel}
          />
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              placeholder="Montant"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="h-8 pr-6 text-right text-xs tabular-nums"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
              €
            </span>
          </div>
        </div>
        <Textarea
          placeholder="Note (optionnel)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="text-xs"
        />
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Checkbox
            checked={saveTemplate}
            onCheckedChange={(v) => setSaveTemplate(Boolean(v))}
          />
          Sauvegarder comme modèle réutilisable
        </label>
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            disabled={pending}
          >
            <X className="size-3.5" />
          </Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            <Check className="size-3.5" /> {pending ? "…" : "Ajouter"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function QuickAddCharge({
  householdId,
  templates = [],
}: {
  householdId: string;
  templates?: Template[];
}) {
  const router = useRouter();
  const todayIso = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [amount, setAmount] = useState<number | "">("");
  const [date, setDate] = useState(todayIso);
  const [notes, setNotes] = useState("");
  const [saveTemplate, setSaveTemplate] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);

  function reset() {
    setLabel("");
    setCategory("other");
    setAmount("");
    setDate(todayIso);
    setNotes("");
    setSaveTemplate(true);
    setTemplateId(null);
  }

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(t.id);
    setLabel(t.label);
    setCategory(t.category);
    if (t.defaultAmount != null) setAmount(t.defaultAmount);
    setNotes(t.notes ?? "");
    setOpen(true);
  }

  function submit() {
    if (!label || amount === "" || amount <= 0) {
      toast.error("Libellé et montant requis");
      return;
    }
    start(async () => {
      try {
        await quickAddCharge({
          householdId,
          date,
          label,
          category,
          amount: Number(amount),
          notes: notes || null,
          saveAsTemplate: saveTemplate,
          templateId,
        });
        toast.success("Frais one-shot ajouté");
        reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <div className="space-y-2">
        {templates.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Modèles :
            </span>
            {templates.slice(0, 6).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium hover:border-[var(--chart-1)] hover:text-[var(--chart-1)]"
                title={
                  t.defaultAmount != null
                    ? `${t.label} · ${t.defaultAmount} €`
                    : t.label
                }
              >
                {t.label}
                {t.defaultAmount != null && (
                  <span className="text-muted-foreground">
                    · {Math.round(t.defaultAmount)}€
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/70 py-2 text-[11px] font-medium text-muted-foreground hover:border-[var(--chart-1)] hover:text-[var(--chart-1)]"
        >
          <Plus className="size-3.5" /> Ajouter un frais one-shot
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="grid gap-2">
        {templates.length > 0 && !templateId && (
          <Select
            value={undefined}
            onValueChange={(v) => v && applyTemplate(v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Réutiliser un modèle…" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                  {t.defaultAmount != null && ` · ${t.defaultAmount} €`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {templateId && (
          <div className="flex items-center justify-between rounded-md border border-[var(--chart-1)]/40 bg-[var(--chart-1)]/10 px-2 py-1 text-[11px] text-[var(--chart-1)]">
            <span>Modèle préchargé — libre de modifier ci-dessous</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setTemplateId(null)}
            >
              ×
            </button>
          </div>
        )}
        <Input
          placeholder="Libellé (ex. Vidange voiture, Taxes immo…)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8 text-xs"
        />
        <div className="grid grid-cols-3 gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 text-xs"
          />
          <CategoryPicker
            value={category}
            onChange={setCategory}
            presets={chargeCategories}
            presetLabels={chargeCategoryLabel}
          />
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              placeholder="Montant"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="h-8 pr-6 text-right text-xs tabular-nums"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
              €
            </span>
          </div>
        </div>
        <Textarea
          placeholder="Note (optionnel)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="text-xs"
        />
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Checkbox
            checked={saveTemplate}
            onCheckedChange={(v) => setSaveTemplate(Boolean(v))}
          />
          Sauvegarder comme modèle réutilisable
        </label>
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            disabled={pending}
          >
            <X className="size-3.5" />
          </Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            <Check className="size-3.5" /> {pending ? "…" : "Ajouter"}
          </Button>
        </div>
      </div>
    </div>
  );
}
