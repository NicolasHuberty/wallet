"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Filter, Search, AlertCircle } from "lucide-react";
import { formatEUR, formatDateFR } from "@/lib/format";
import {
  categoryColor,
  categoryLabel,
  transactionCategory,
  type TransactionCategory,
} from "@/lib/transaction-categorizer";
import {
  TransactionEditDialog,
  type HouseholdAccountOption,
  type OneOffChargeOption,
  type RecurringIncomeOption,
} from "./transaction-edit-dialog";
import { toDate } from "@/lib/utils";

type Cashflow = {
  id: string;
  date: Date | string;
  amount: number;
  notes: string | null;
  ticker: string | null;
  kind: string;
  category: string | null;
  categorySource: string | null;
  bceEnterpriseNumber: string | null;
  transferToAccountId: string | null;
  linkedOneOffChargeId?: string | null;
  linkedRecurringIncomeId?: string | null;
  source: string;
};

type SourceFilter = "all" | "user" | "user_rule" | "bce" | "regex" | "fallback" | "unclassified";

export function TransactionTable({
  rows,
  householdAccounts = [],
  householdCharges = [],
  householdIncomes = [],
}: {
  rows: Cashflow[];
  householdAccounts?: HouseholdAccountOption[];
  householdCharges?: OneOffChargeOption[];
  householdIncomes?: RecurringIncomeOption[];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<TransactionCategory | "all" | "uncategorized">("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [editing, setEditing] = useState<Cashflow | null>(null);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return rows
      .filter((r) => {
        if (s && !(r.notes ?? "").toLowerCase().includes(s)) return false;
        if (categoryFilter === "uncategorized" && r.category) return false;
        if (
          categoryFilter !== "all" &&
          categoryFilter !== "uncategorized" &&
          r.category !== categoryFilter
        )
          return false;
        if (sourceFilter === "unclassified" && r.category) return false;
        if (
          sourceFilter !== "all" &&
          sourceFilter !== "unclassified" &&
          r.categorySource !== sourceFilter
        )
          return false;
        return true;
      })
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
  }, [rows, search, categoryFilter, sourceFilter]);

  const counts = useMemo(() => {
    const out = {
      total: rows.length,
      classified: rows.filter((r) => !!r.category).length,
      user: rows.filter((r) => r.categorySource === "user" || r.categorySource === "user_rule")
        .length,
      bce: rows.filter((r) => r.categorySource === "bce").length,
      unclassified: rows.filter((r) => !r.category).length,
    };
    return out;
  }, [rows]);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Toutes les transactions</h2>
            <p className="text-[11px] text-muted-foreground">
              {counts.total} au total · {counts.classified} classifiées (
              {counts.user} manuelles, {counts.bce} via BCE){" "}
              {counts.unclassified > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  · {counts.unclassified} non classées
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filtrer par description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-sm"
            />
          </div>
          <Select
            value={categoryFilter}
            onValueChange={(v) =>
              setCategoryFilter((v as TransactionCategory | "all" | "uncategorized") ?? "all")
            }
          >
            <SelectTrigger className="h-9 w-full md:w-44">
              <Filter className="size-3.5" />
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              <SelectItem value="uncategorized">Non classées</SelectItem>
              {transactionCategory.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: categoryColor[c] }}
                    />
                    {categoryLabel[c]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter((v as SourceFilter) ?? "all")}>
            <SelectTrigger className="h-9 w-full md:w-40">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes sources</SelectItem>
              <SelectItem value="user">Manuelles</SelectItem>
              <SelectItem value="user_rule">Règles utilisateur</SelectItem>
              <SelectItem value="bce">BCE / KBO</SelectItem>
              <SelectItem value="regex">Auto-règles</SelectItem>
              <SelectItem value="fallback">Par défaut</SelectItem>
              <SelectItem value="unclassified">Non classées</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="max-h-[600px] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            Aucune transaction ne correspond aux filtres.
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-xs md:table">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-2 py-2 text-left font-medium">Description</th>
                  <th className="px-2 py-2 text-left font-medium">Catégorie</th>
                  <th className="px-2 py-2 text-right font-medium">Montant</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const positive = r.amount >= 0;
                  return (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b border-border/40 last:border-none hover:bg-muted/30"
                      onClick={() => setEditing(r)}
                    >
                      <td className="px-4 py-1.5">{formatDateFR(r.date)}</td>
                      <td className="px-2 py-1.5">
                        <div className="max-w-md truncate">
                          {r.notes ?? <span className="text-muted-foreground">—</span>}
                        </div>
                        {r.bceEnterpriseNumber && (
                          <div className="font-mono text-[9px] text-muted-foreground">
                            BCE {r.bceEnterpriseNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.category ? (
                          <span className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                              style={{
                                borderColor: categoryColor[r.category as TransactionCategory],
                                color: categoryColor[r.category as TransactionCategory],
                              }}
                            >
                              {categoryLabel[r.category as TransactionCategory]}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground">
                              {sourceShort(r.categorySource)}
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                            <AlertCircle className="size-3" />
                            Non classée
                          </span>
                        )}
                      </td>
                      <td
                        className={`numeric px-2 py-1.5 text-right tabular-nums ${
                          positive ? "text-[var(--color-success)]" : "text-destructive"
                        }`}
                      >
                        {formatEUR(r.amount, { signed: true })}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(r);
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Mobile list */}
            <ul className="divide-y divide-border md:hidden">
              {filtered.map((r) => {
                const positive = r.amount >= 0;
                return (
                  <li
                    key={r.id}
                    onClick={() => setEditing(r)}
                    className="cursor-pointer px-4 py-2 text-xs"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {formatDateFR(r.date)}
                      </span>
                      <span
                        className={`numeric text-sm font-semibold tabular-nums ${
                          positive ? "text-[var(--color-success)]" : "text-destructive"
                        }`}
                      >
                        {formatEUR(r.amount, { signed: true })}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate">{r.notes ?? "—"}</div>
                    {r.category ? (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            background: categoryColor[r.category as TransactionCategory],
                          }}
                        />
                        <span className="text-[10px]">
                          {categoryLabel[r.category as TransactionCategory]}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          · {sourceShort(r.categorySource)}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                        <AlertCircle className="size-3" /> Non classée
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <TransactionEditDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        cashflow={editing}
        householdAccounts={householdAccounts}
        householdCharges={householdCharges}
        householdIncomes={householdIncomes}
      />
    </section>
  );
}

function sourceShort(s: string | null): string {
  switch (s) {
    case "user":
      return "manuel";
    case "user_rule":
      return "règle perso";
    case "bce":
      return "BCE";
    case "regex":
      return "auto";
    case "fallback":
      return "défaut";
    default:
      return "";
  }
}
