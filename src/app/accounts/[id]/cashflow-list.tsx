"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { formatEUR, formatDateFR } from "@/lib/format";
import { addCashflow, deleteCashflow } from "../actions";
import { toDate } from "@/lib/utils";

type Row = {
  id: string;
  date: Date | string;
  kind: string;
  amount: number;
  ticker: string | null;
  notes: string | null;
  source: string;
};

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "deposit", label: "Dépôt" },
  { value: "withdrawal", label: "Retrait" },
  { value: "dividend", label: "Dividende" },
  { value: "fee", label: "Frais" },
  { value: "interest", label: "Intérêts" },
  { value: "buy", label: "Achat" },
  { value: "sell", label: "Vente" },
  { value: "transfer_in", label: "Transfert entrant" },
  { value: "transfer_out", label: "Transfert sortant" },
  { value: "other", label: "Autre" },
];

const KIND_LABEL = Object.fromEntries(KIND_OPTIONS.map((o) => [o.value, o.label]));

export function CashflowList({ accountId, rows }: { accountId: string; rows: Row[] }) {
  const [pending, start] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today,
    kind: "deposit",
    amount: "",
    ticker: "",
    notes: "",
  });

  function submit() {
    const amount = Number(form.amount);
    if (!amount || isNaN(amount)) {
      toast.error("Montant invalide");
      return;
    }
    // Sign convention: deposit/dividend/sell/interest = positive, withdrawal/fee/buy = negative
    const negativeKinds = ["withdrawal", "fee", "buy", "transfer_out"];
    const signed = negativeKinds.includes(form.kind) ? -Math.abs(amount) : Math.abs(amount);
    start(async () => {
      try {
        await addCashflow({
          accountId,
          date: form.date,
          kind: form.kind as never,
          amount: signed,
          ticker: form.ticker || null,
          notes: form.notes || null,
        });
        toast.success("Mouvement ajouté");
        setShowForm(false);
        setForm({ date: today, kind: "deposit", amount: "", ticker: "", notes: "" });
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Supprimer ce mouvement ?")) return;
    start(async () => {
      try {
        await deleteCashflow(id, accountId);
        toast.success("Supprimé");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const sorted = [...rows].sort(
    (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime(),
  );

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 md:px-5">
        <div>
          <h2 className="text-base font-semibold">Mouvements de cash</h2>
          <p className="text-xs text-muted-foreground">
            {rows.length} mouvement{rows.length > 1 ? "s" : ""} — utilisés pour calculer TWR &
            XIRR. Les imports Revolut alimentent automatiquement cette liste.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
          <Plus className="size-3.5" /> {showForm ? "Annuler" : "Ajouter"}
        </Button>
      </div>

      {showForm && (
        <div className="border-b border-border bg-muted/30 px-4 py-3 md:px-5">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="grid gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Type</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm({ ...form, kind: v ?? "deposit" })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Montant (€)</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="h-9 text-right tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Ticker (optionnel)</Label>
              <Input
                value={form.ticker}
                onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                placeholder="VWCE"
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5 self-end">
              <Button onClick={submit} disabled={pending} className="h-9 w-full">
                Enregistrer
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Le signe est ajusté automatiquement (retrait/frais/achat = négatif).
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          Aucun mouvement. Importe un relevé Revolut ou ajoute-en manuellement.
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {/* Desktop table */}
          <table className="hidden w-full text-xs md:table">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-2 py-2 text-left font-medium">Type</th>
                <th className="px-2 py-2 text-left font-medium">Ticker</th>
                <th className="px-2 py-2 text-right font-medium">Montant</th>
                <th className="px-2 py-2 text-left font-medium">Source</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const negative = r.amount < 0;
                return (
                  <tr key={r.id} className="border-b border-border/40 last:border-none">
                    <td className="px-4 py-1.5">{formatDateFR(toDate(r.date))}</td>
                    <td className="px-2 py-1.5">{KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                      {r.ticker ?? "—"}
                    </td>
                    <td
                      className={`numeric px-2 py-1.5 text-right tabular-nums ${negative ? "text-destructive" : "text-[var(--color-success)]"}`}
                    >
                      {formatEUR(r.amount, { signed: true })}
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge
                        variant={r.source === "manual" ? "outline" : "secondary"}
                        className="text-[9px]"
                      >
                        {r.source}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {r.source === "manual" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => remove(r.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Mobile list */}
          <ul className="divide-y divide-border/40 md:hidden">
            {sorted.map((r) => {
              const negative = r.amount < 0;
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium">{formatDateFR(toDate(r.date))}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {KIND_LABEL[r.kind] ?? r.kind}
                      {r.ticker && <span className="ml-1 font-mono">· {r.ticker}</span>}
                    </div>
                  </div>
                  <div
                    className={`numeric shrink-0 text-sm font-semibold tabular-nums ${negative ? "text-destructive" : "text-[var(--color-success)]"}`}
                  >
                    {formatEUR(r.amount, { signed: true })}
                  </div>
                  {r.source === "manual" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => remove(r.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
