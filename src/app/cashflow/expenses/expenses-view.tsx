"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Search, X, Wallet, FolderInput, SlidersHorizontal, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatEUR, formatDateFR } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  categoryColor,
  categoryLabel,
  transactionCategory,
  type TransactionCategory,
} from "@/lib/transaction-categorizer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MonthlySpend } from "@/lib/account-analytics";
import {
  bucketByDay,
  bucketByWeek,
  merchantPattern,
  type MonthAffectation,
  type MonthTransaction,
  type TrackingBucket,
} from "@/lib/cashflow/month-expenses";
import { setTransactionCategory, assignTransactionToEnvelope, setTransactionIgnored } from "../actions";
import { RuleDialog } from "./rule-dialog";

type EnvelopeOption = { id: string; label: string; category: string };
type AccountOption = { id: string; name: string };
type Granularity = "day" | "week" | "month";

const AFFECTATION_META: Record<
  MonthAffectation,
  { label: string; className: string }
> = {
  envelope: { label: "Enveloppe", className: "border-[var(--color-success)]/40 text-[var(--color-success)]" },
  fixed: { label: "Charge fixe", className: "border-border text-muted-foreground" },
  buffer: { label: "À rapprocher", className: "border-[#e08300]/50 text-[#e08300]" },
  non_spend: { label: "Hors variable", className: "border-border text-muted-foreground" },
  ignored: { label: "Ignorée", className: "border-border text-muted-foreground line-through" },
};

const fmtMonth = (yyyymm: string) => {
  const [y, m] = yyyymm.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("fr-BE", {
    month: "short",
    year: "2-digit",
  });
};

export function ExpensesView({
  transactions,
  monthlyTotals,
  envelopes,
  accounts,
  total,
  unaffectedCount,
}: {
  transactions: MonthTransaction[];
  monthlyTotals: MonthlySpend[];
  envelopes: EnvelopeOption[];
  accounts: AccountOption[];
  total: number;
  unaffectedCount: number;
}) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [accountId, setAccountId] = useState<string>("all");
  const [onlyToReconcile, setOnlyToReconcile] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
    return transactions.filter((t) => {
      if (accountId !== "all" && t.accountId !== accountId) return false;
      if (onlyToReconcile && t.affectation !== "buffer") return false;
      if (q) {
        const n = t.label.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
        if (!n.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, accountId, onlyToReconcile, query]);

  // Les transactions ignorées restent visibles dans la liste mais ne comptent ni
  // dans les totaux ni dans le suivi.
  const spendable = useMemo(() => filtered.filter((t) => t.affectation !== "ignored"), [filtered]);
  const filteredTotal = spendable.reduce((s, t) => s + t.amount, 0);
  const toReconcileTotal = transactions
    .filter((t) => t.affectation === "buffer")
    .reduce((s, t) => s + t.amount, 0);

  const chart: TrackingBucket[] = useMemo(() => {
    if (granularity === "day") return bucketByDay(spendable);
    if (granularity === "week") return bucketByWeek(spendable);
    return monthlyTotals.map((m) => ({
      key: m.month,
      label: fmtMonth(m.month),
      spend: m.spend,
      count: m.count,
    }));
  }, [granularity, spendable, monthlyTotals]);

  const hasFilter = query.trim().length > 0 || accountId !== "all" || onlyToReconcile;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Kpi label="Dépensé ce mois" value={formatEUR(total)} hint={`${transactions.length} mouvement(s)`} />
        <Kpi label="Sélection" value={formatEUR(filteredTotal)} hint={`${filtered.length} ligne(s)`} />
        <Kpi
          label="À rapprocher"
          value={formatEUR(toReconcileTotal)}
          hint={`${unaffectedCount} sans enveloppe`}
          tone={unaffectedCount > 0 ? "warning" : "positive"}
        />
        <Kpi label="Comptes courants" value={String(accounts.length)} hint="comptes suivis" />
      </section>

      {/* Suivi jour / semaine / mois */}
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Suivi des dépenses</h3>
          <div className="flex items-center rounded-md border border-border p-0.5 text-xs">
            {(
              [
                ["day", "Jour"],
                ["week", "Semaine"],
                ["month", "Mois"],
              ] as [Granularity, string][]
            ).map(([g, label]) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={cn(
                  "rounded px-2.5 py-1 font-medium transition-colors",
                  granularity === g
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-[10px] text-muted-foreground">
          {granularity === "day"
            ? "Dépense par jour du mois (sélection courante)."
            : granularity === "week"
              ? "Dépense par semaine du mois (sélection courante)."
              : "Dépense totale par mois sur les comptes courants (18 derniers mois)."}
        </p>
        {chart.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Aucune dépense à afficher.
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v) => formatEUR(Number(v), { compact: true })}
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v, _n, p) => {
                    const cnt = (p as { payload?: { count?: number } })?.payload?.count ?? 0;
                    return [`${formatEUR(Number(v))} · ${cnt} tx`, "Dépensé"];
                  }}
                />
                <Bar dataKey="spend" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Filtres */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cherche une dépense…"
              className="w-full rounded-md border border-border bg-background py-2.5 pl-9 pr-9 text-sm focus:border-foreground focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {accounts.length > 1 && (
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
            >
              <option value="all">Tous les comptes courants</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setOnlyToReconcile((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-2.5 text-sm transition-colors",
              onlyToReconcile
                ? "border-[#e08300] text-[#e08300]"
                : "border-border text-muted-foreground hover:border-foreground/40",
            )}
          >
            <FolderInput className="size-4" /> À rapprocher
          </button>
        </div>
      </section>

      {/* Liste + rapprochement */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Transactions</h3>
          <span className="text-xs text-muted-foreground">
            {filtered.length}
            {hasFilter ? ` / ${transactions.length}` : ""} · {formatEUR(filteredTotal)}
          </span>
        </div>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Rien à afficher.</p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.slice(0, 250).map((t) => (
              <TxRow key={t.id} tx={t} envelopes={envelopes} />
            ))}
            {filtered.length > 250 && (
              <li className="py-2 text-center text-[10px] text-muted-foreground">
                + {filtered.length - 250} autres — affine ta recherche
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function TxRow({ tx, envelopes }: { tx: MonthTransaction; envelopes: EnvelopeOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isBank = tx.source === "bank";
  const ignored = tx.affectation === "ignored";
  const meta = AFFECTATION_META[tx.affectation];

  function changeCategory(category: string | null) {
    if (!category || category === tx.category) return;
    start(async () => {
      try {
        await setTransactionCategory({ cashflowId: tx.id, category: category as TransactionCategory });
        toast.success("Type mis à jour");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  function changeEnvelope(envelopeId: string | null) {
    if (!envelopeId || envelopeId === (tx.envelopeId ?? "")) return;
    start(async () => {
      try {
        await assignTransactionToEnvelope({ cashflowId: tx.id, envelopeId });
        const env = envelopes.find((e) => e.id === envelopeId);
        toast.success(`Rapproché vers « ${env?.label ?? "enveloppe"} »`);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  function toggleIgnore() {
    start(async () => {
      try {
        await setTransactionIgnored({ cashflowId: tx.id, ignored: !ignored });
        toast.success(ignored ? "Transaction rétablie" : "Transaction ignorée");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        pending && "opacity-50",
        ignored && "opacity-55",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="w-14 shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {formatDateFR(tx.date)}
        </span>
        {tx.category && !ignored && (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: categoryColor[tx.category as TransactionCategory] }}
          />
        )}
        <span className="min-w-0">
          <span className={cn("block truncate text-sm", ignored && "line-through")}>{tx.label}</span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {tx.accountName ?? "Saisie manuelle"}
            <span className={cn("rounded-full border px-1.5 py-px", meta.className)}>
              {tx.affectation === "envelope" && tx.envelopeLabel ? tx.envelopeLabel : meta.label}
            </span>
          </span>
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        {isBank && !ignored && (
          <>
            <Select value={tx.category ?? undefined} onValueChange={changeCategory}>
              <SelectTrigger className="h-7 w-[7.5rem] text-[11px]">
                <SelectValue placeholder="Type">
                  {(v) =>
                    typeof v === "string" && v
                      ? categoryLabel[v as TransactionCategory] ?? v
                      : "Type"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {transactionCategory.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {categoryLabel[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {envelopes.length > 0 && (
              <Select value={tx.envelopeId ?? undefined} onValueChange={changeEnvelope}>
                <SelectTrigger className="h-7 w-[7.5rem] text-[11px]">
                  <span className="flex items-center gap-1 truncate">
                    <Wallet className="size-3 shrink-0" />
                    <SelectValue placeholder="Enveloppe">
                      {(v) =>
                        (typeof v === "string"
                          ? envelopes.find((e) => e.id === v)?.label
                          : null) ?? "Enveloppe"
                      }
                    </SelectValue>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {envelopes.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-xs">
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {envelopes.length > 0 && (
              <RuleDialog
                envelopes={envelopes}
                initialPattern={merchantPattern(tx.label) ?? ""}
                initialEnvelopeId={tx.envelopeId}
                trigger={
                  <button
                    type="button"
                    title="Créer une règle (motif personnalisé → enveloppe)"
                    className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </button>
                }
              />
            )}
            <button
              type="button"
              onClick={toggleIgnore}
              disabled={pending}
              title="Ignorer cette transaction (exclue du budget et des totaux)"
              className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              <EyeOff className="size-3.5" />
            </button>
          </>
        )}
        {isBank && ignored && (
          <button
            type="button"
            onClick={toggleIgnore}
            disabled={pending}
            title="Rétablir cette transaction"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            <Eye className="size-3.5" /> Rétablir
          </button>
        )}
        <span
          className={cn(
            "numeric w-16 text-right tabular-nums font-medium",
            ignored ? "text-muted-foreground line-through" : "text-destructive",
          )}
        >
          {formatEUR(tx.amount)}
        </span>
      </div>
    </li>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative" | "warning";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
        {label}
      </div>
      <div
        className={cn(
          "numeric mt-1 text-base font-semibold tabular-nums sm:text-lg",
          tone === "positive" && "text-[var(--color-success)]",
          tone === "negative" && "text-destructive",
          tone === "warning" && "text-[#e08300]",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
