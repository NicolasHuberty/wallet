"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  saveWalletBasics,
  saveHolding,
  deleteHolding,
  bulkUpdateAllocations,
} from "./actions";
import { formatEUR } from "@/lib/format";
import { Save, Plus, Trash2, Scale, TriangleAlert } from "lucide-react";

type Wallet = {
  id: string;
  name: string;
  institution: string | null;
  currentValue: number;
  annualYieldPct: number | null;
  monthlyContribution: number | null;
};

type Holding = {
  id: string;
  ticker: string;
  name: string | null;
  isin: string | null;
  allocationPct: number | null;
};

export function WalletSection({
  wallet,
  holdings,
}: {
  wallet: Wallet;
  holdings: Holding[];
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <WalletHeader wallet={wallet} />
      <AllocationTable accountId={wallet.id} holdings={holdings} walletValue={wallet.currentValue} />
    </section>
  );
}

function WalletHeader({ wallet }: { wallet: Wallet }) {
  const [pending, start] = useTransition();
  const [total, setTotal] = useState<number>(wallet.currentValue);
  const [yieldPct, setYieldPct] = useState<number | "">(
    wallet.annualYieldPct ?? ""
  );
  const [dca, setDca] = useState<number | "">(wallet.monthlyContribution ?? "");

  const projectedAnnualReturn =
    typeof yieldPct === "number" ? (total * yieldPct) / 100 : 0;
  const projectedYearlyDCA = typeof dca === "number" ? dca * 12 : 0;

  function save() {
    start(async () => {
      try {
        await saveWalletBasics({
          accountId: wallet.id,
          currentValue: total,
          annualYieldPct: yieldPct === "" ? null : Number(yieldPct),
          monthlyContribution: dca === "" ? null : Number(dca),
        });
        toast.success("Wallet mis à jour");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const dirty =
    total !== wallet.currentValue ||
    (yieldPct === "" ? wallet.annualYieldPct != null : Number(yieldPct) !== wallet.annualYieldPct) ||
    (dca === "" ? wallet.monthlyContribution != null : Number(dca) !== wallet.monthlyContribution);

  return (
    <div className="border-b border-border p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{wallet.name}</h2>
          {wallet.institution && (
            <p className="truncate text-xs text-muted-foreground">{wallet.institution}</p>
          )}
        </div>
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          <Save className="size-4" /> {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Total du wallet</Label>
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              value={total}
              onChange={(e) => setTotal(Number(e.target.value))}
              className="pr-8 text-right numeric"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Rendement annuel (estimé)</Label>
          <div className="relative">
            <Input
              type="number"
              step="0.1"
              placeholder="ex. 7"
              value={yieldPct}
              onChange={(e) =>
                setYieldPct(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="pr-8 text-right numeric"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              %
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Gain annuel estimé : {formatEUR(projectedAnnualReturn)}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">DCA du wallet / mois</Label>
          <div className="relative">
            <Input
              type="number"
              step="1"
              placeholder="ex. 300"
              value={dca}
              onChange={(e) =>
                setDca(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="pr-8 text-right numeric"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sur 12 mois : {formatEUR(projectedYearlyDCA)}
          </p>
        </div>
      </div>
    </div>
  );
}

function AllocationTable({
  accountId,
  holdings,
  walletValue,
}: {
  accountId: string;
  holdings: Holding[];
  walletValue: number;
}) {
  const [pending, start] = useTransition();
  const [alloc, setAlloc] = useState<Record<string, number>>(() =>
    Object.fromEntries(holdings.map((h) => [h.id, h.allocationPct ?? 0]))
  );

  useEffect(() => {
    setAlloc(Object.fromEntries(holdings.map((h) => [h.id, h.allocationPct ?? 0])));
  }, [holdings]);

  const sum = useMemo(() => Object.values(alloc).reduce((s, v) => s + v, 0), [alloc]);

  const dirty = holdings.some((h) => (alloc[h.id] ?? 0) !== (h.allocationPct ?? 0));

  function update(id: string, v: number) {
    setAlloc((prev) => ({ ...prev, [id]: Number.isFinite(v) ? v : 0 }));
  }

  function normalize() {
    if (sum <= 0) return;
    const factor = 100 / sum;
    setAlloc((prev) => {
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev)) next[k] = Math.round(v * factor * 100) / 100;
      return next;
    });
  }

  function saveAll() {
    start(async () => {
      try {
        await bulkUpdateAllocations({
          accountId,
          rows: holdings.map((h) => ({ id: h.id, allocationPct: alloc[h.id] ?? 0 })),
        });
        toast.success("Allocations enregistrées");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  async function remove(id: string, ticker: string) {
    if (!confirm(`Supprimer ${ticker} du wallet ?`)) return;
    try {
      await deleteHolding(id);
      toast.success(`${ticker} supprimé`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const sumRounded = Math.round(sum * 100) / 100;
  const badSum = sumRounded !== 100 && sumRounded !== 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">ETF du wallet</h3>
          <Badge variant="secondary" className="text-[10px]">
            {holdings.length}
          </Badge>
          {holdings.length > 0 && (
            <Badge
              variant="outline"
              className={`text-[10px] tabular-nums ${badSum ? "border-amber-500 text-amber-500" : "border-[var(--color-success)] text-[var(--color-success)]"}`}
            >
              {badSum && <TriangleAlert className="mr-1 size-3" />}
              Σ {sumRounded}%
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {holdings.length > 0 && sum > 0 && sumRounded !== 100 && (
            <Button size="sm" variant="ghost" onClick={normalize}>
              <Scale className="size-3.5" /> Normaliser
            </Button>
          )}
          <HoldingDialog accountId={accountId} />
          {dirty && holdings.length > 0 && (
            <Button size="sm" onClick={saveAll} disabled={pending}>
              <Save className="size-4" />
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          )}
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className="border-t border-border bg-muted/10 p-6 text-center text-sm text-muted-foreground md:p-8">
          Aucun ETF. Ajoute-les manuellement ou via l&apos;import Revolut.
        </div>
      ) : (
        <>
          {/* Desktop: full editable table */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-y border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2 text-left font-medium">Ticker / ISIN</th>
                <th className="px-3 py-2 text-left font-medium">Nom</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Allocation</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Valeur estimée</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const pct = alloc[h.id] ?? 0;
                const value = (walletValue * pct) / 100;
                return (
                  <tr key={h.id} className="border-b border-border/60 last:border-none">
                    <td className="px-5 py-2.5">
                      <div className="font-mono font-medium">{h.ticker}</div>
                      {h.isin && (
                        <div className="text-[10px] font-mono text-muted-foreground">{h.isin}</div>
                      )}
                    </td>
                    <td className="max-w-[260px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                      {h.name ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          max={100}
                          value={pct}
                          onChange={(e) => update(h.id, Number(e.target.value))}
                          className="h-8 pr-6 text-right tabular-nums"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                          %
                        </span>
                      </div>
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-xs font-medium tabular-nums">
                      {formatEUR(value)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <HoldingDialog accountId={accountId} holding={h} />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => remove(h.id, h.ticker)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30">
                <td
                  colSpan={2}
                  className="px-5 py-2 text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Total alloué
                </td>
                <td className="numeric px-3 py-2 text-right text-xs font-semibold tabular-nums">
                  {sumRounded}%
                </td>
                <td className="numeric px-3 py-2 text-right text-xs font-semibold tabular-nums">
                  {formatEUR((walletValue * sumRounded) / 100)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>

          {/* Mobile: stacked editable cards (one per holding) with a total
           * row at the bottom that mirrors the table's tfoot. */}
          <ul className="divide-y divide-border border-y border-border md:hidden">
            {holdings.map((h) => {
              const pct = alloc[h.id] ?? 0;
              const value = (walletValue * pct) / 100;
              return (
                <li key={h.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-xs font-medium">{h.ticker}</span>
                    </div>
                    {h.name && (
                      <div className="truncate text-[11px] text-muted-foreground">{h.name}</div>
                    )}
                    {h.isin && (
                      <div className="truncate font-mono text-[10px] text-muted-foreground">
                        {h.isin}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative w-24">
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          max={100}
                          value={pct}
                          onChange={(e) => update(h.id, Number(e.target.value))}
                          className="h-8 pr-6 text-right tabular-nums"
                          aria-label={`Allocation ${h.ticker}`}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                          %
                        </span>
                      </div>
                      <span className="numeric text-xs font-medium tabular-nums">
                        = {formatEUR(value)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    <HoldingDialog accountId={accountId} holding={h} />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => remove(h.id, h.ticker)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
            <li className="flex items-center justify-between bg-muted/30 px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
              <span>Total alloué</span>
              <span className="numeric flex items-baseline gap-3 text-xs font-semibold tabular-nums text-foreground">
                <span>{sumRounded}%</span>
                <span>{formatEUR((walletValue * sumRounded) / 100)}</span>
              </span>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}

function HoldingDialog({
  accountId,
  holding,
}: {
  accountId: string;
  holding?: Holding;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState(
    holding ?? {
      id: undefined as string | undefined,
      ticker: "",
      name: "",
      isin: "",
      allocationPct: 0 as number | null,
    }
  );

  function submit() {
    if (!form.ticker) {
      toast.error("Ticker requis");
      return;
    }
    start(async () => {
      try {
        await saveHolding({
          id: holding?.id,
          accountId,
          ticker: form.ticker!,
          name: form.name || null,
          isin: form.isin || null,
          allocationPct: form.allocationPct ?? 0,
        });
        toast.success(holding ? "ETF mis à jour" : "ETF ajouté");
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          holding ? (
            <Button size="icon" variant="ghost">
              <Plus className="size-3.5 rotate-45" />
            </Button>
          ) : (
            <Button size="sm" variant="outline">
              <Plus className="size-4" /> Ajouter un ETF
            </Button>
          )
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{holding ? "Modifier l'ETF" : "Nouvel ETF"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Ticker</Label>
              <Input
                value={form.ticker ?? ""}
                onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="grid gap-2">
              <Label>ISIN</Label>
              <Input
                value={form.isin ?? ""}
                onChange={(e) => setForm({ ...form, isin: e.target.value.toUpperCase() })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Nom complet</Label>
            <Input
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex. iShares Core MSCI World"
            />
          </div>
          <div className="grid gap-2">
            <Label>Allocation (%)</Label>
            <div className="relative">
              <Input
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={form.allocationPct ?? 0}
                onChange={(e) => setForm({ ...form, allocationPct: Number(e.target.value) })}
                className="pr-8 text-right"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                %
              </span>
            </div>
          </div>
        </div>
        <DialogFooter className="flex justify-end gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Enregistrement…" : holding ? "Enregistrer" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
