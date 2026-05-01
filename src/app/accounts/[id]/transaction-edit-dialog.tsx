"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, CheckCircle2, Search, Sparkles, Receipt, Plus } from "lucide-react";
import { formatEUR, formatDateFR } from "@/lib/format";
import {
  categoryColor,
  categoryLabel,
  transactionCategory,
  type TransactionCategory,
} from "@/lib/transaction-categorizer";
import { chargeCategory } from "@/db/schema";
import { chargeCategoryLabel } from "@/lib/labels";
import {
  setCashflowCategoryWithRule,
  linkCashflowToBce,
  searchBceCompanies,
  createOneOffChargeFromCashflow,
} from "@/app/banking/actions";

type Cashflow = {
  id: string;
  date: Date | string;
  amount: number;
  notes: string | null;
  category: string | null;
  categorySource: string | null;
  bceEnterpriseNumber: string | null;
  transferToAccountId?: string | null;
  linkedOneOffChargeId?: string | null;
  linkedRecurringIncomeId?: string | null;
};

export type HouseholdAccountOption = { id: string; name: string; kind: string };
export type OneOffChargeOption = {
  id: string;
  label: string;
  category: string;
  amount: number;
  date: string;
};
export type RecurringIncomeOption = { id: string; label: string; amount: number };

type BceCandidate = {
  enterpriseNumber: string;
  denomination: string;
  commercialName: string | null;
  naceCode: string | null;
  naceDescription: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  user: "Modifié manuellement",
  user_rule: "Règle utilisateur",
  bce: "BCE / KBO",
  regex: "Règle automatique",
  fallback: "Catégorie par défaut",
};

export function TransactionEditDialog({
  open,
  onOpenChange,
  cashflow,
  householdAccounts = [],
  householdCharges = [],
  householdIncomes = [],
  // When set, the dialog opens with the "create one-off charge" form
  // already expanded — the wizard uses this to send the user straight
  // to the form for an unexpected expense.
  initialCreateChargeOpen = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cashflow: Cashflow | null;
  householdAccounts?: HouseholdAccountOption[];
  householdCharges?: OneOffChargeOption[];
  householdIncomes?: RecurringIncomeOption[];
  initialCreateChargeOpen?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [category, setCategory] = useState<TransactionCategory>(
    (cashflow?.category as TransactionCategory) ?? "other_expense",
  );
  const [applyTo, setApplyTo] = useState<"this_only" | "similar_counterparty" | "similar_description">(
    "similar_counterparty",
  );
  const [transferTo, setTransferTo] = useState<string | null>(
    cashflow?.transferToAccountId ?? null,
  );
  const [linkedCharge, setLinkedCharge] = useState<string | null>(
    cashflow?.linkedOneOffChargeId ?? null,
  );
  const [linkedIncome, setLinkedIncome] = useState<string | null>(
    cashflow?.linkedRecurringIncomeId ?? null,
  );
  const [bceQuery, setBceQuery] = useState("");
  const [bceCandidates, setBceCandidates] = useState<BceCandidate[]>([]);
  const [bceSearching, setBceSearching] = useState(false);
  const [showBce, setShowBce] = useState(false);
  const [showCreateCharge, setShowCreateCharge] = useState(initialCreateChargeOpen);
  const [chargeLabel, setChargeLabel] = useState("");
  const [chargeCategoryValue, setChargeCategoryValue] = useState<string>("tax");
  const [chargeIncludeInCostBasis, setChargeIncludeInCostBasis] = useState(false);

  useEffect(() => {
    if (cashflow?.category) setCategory(cashflow.category as TransactionCategory);
    setApplyTo("similar_counterparty");
    setTransferTo(cashflow?.transferToAccountId ?? null);
    setLinkedCharge(cashflow?.linkedOneOffChargeId ?? null);
    setLinkedIncome(cashflow?.linkedRecurringIncomeId ?? null);
    setBceQuery("");
    setBceCandidates([]);
    setShowBce(false);
    setShowCreateCharge(initialCreateChargeOpen);
    setChargeLabel(cashflow?.notes?.slice(0, 120) ?? "");
    setChargeCategoryValue("tax");
    setChargeIncludeInCostBasis(false);
  }, [
    cashflow?.id,
    cashflow?.category,
    cashflow?.notes,
    cashflow?.transferToAccountId,
    cashflow?.linkedOneOffChargeId,
    cashflow?.linkedRecurringIncomeId,
    initialCreateChargeOpen,
  ]);

  // Debounced BCE search
  useEffect(() => {
    if (!showBce || bceQuery.trim().length < 2) {
      setBceCandidates([]);
      return;
    }
    const t = setTimeout(() => {
      setBceSearching(true);
      searchBceCompanies({ query: bceQuery.trim(), limit: 15 })
        .then((res) => setBceCandidates(res as BceCandidate[]))
        .catch(() => setBceCandidates([]))
        .finally(() => setBceSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [bceQuery, showBce]);

  if (!cashflow) return null;

  const positive = cashflow.amount >= 0;

  function save() {
    if (!cashflow) return;
    start(async () => {
      try {
        const r = await setCashflowCategoryWithRule({
          cashflowId: cashflow.id,
          // If a transfer target is picked, force the category to
          // transfer_internal regardless of what's in the dropdown.
          category: transferTo ? "transfer_internal" : category,
          applyTo,
          createRule: applyTo !== "this_only",
          transferToAccountId: transferTo,
          linkedOneOffChargeId: linkedCharge,
          linkedRecurringIncomeId: linkedIncome,
        });
        if (r.bulkUpdated > 0)
          toast.success(
            `Catégorie mise à jour · ${r.bulkUpdated} transactions similaires reclassées${r.ruleId ? " · règle créée" : ""}`,
          );
        else toast.success("Catégorie mise à jour");
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function createCharge() {
    if (!cashflow) return;
    if (!chargeLabel.trim()) {
      toast.error("Donne un libellé au frais");
      return;
    }
    start(async () => {
      try {
        const r = await createOneOffChargeFromCashflow({
          cashflowId: cashflow.id,
          label: chargeLabel.trim(),
          category: chargeCategoryValue,
          includeInCostBasis: chargeIncludeInCostBasis,
        });
        toast.success(`Frais créé · ${r.label}`);
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function pickBce(c: BceCandidate) {
    if (!cashflow) return;
    start(async () => {
      try {
        const r = await linkCashflowToBce({
          cashflowId: cashflow.id,
          enterpriseNumber: c.enterpriseNumber,
        });
        toast.success(`Lié à ${r.denomination} · catégorie ${categoryLabel[r.category as TransactionCategory]}`);
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent desktopSize="md:max-w-xl">
        <SheetHeader>
          <SheetTitle>Modifier la transaction</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-5">
          {/* Read-only context */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">{formatDateFR(cashflow.date)}</span>
              <span
                className={`numeric text-base font-semibold tabular-nums ${
                  positive ? "text-[var(--color-success)]" : "text-destructive"
                }`}
              >
                {formatEUR(cashflow.amount, { signed: true })}
              </span>
            </div>
            <div className="mt-2 break-words text-sm">{cashflow.notes ?? "(sans description)"}</div>
            {cashflow.category && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  style={{
                    borderColor: categoryColor[cashflow.category as TransactionCategory],
                    color: categoryColor[cashflow.category as TransactionCategory],
                  }}
                >
                  {categoryLabel[cashflow.category as TransactionCategory]}
                </Badge>
                {cashflow.categorySource && (
                  <span className="text-[10px] text-muted-foreground">
                    {SOURCE_LABEL[cashflow.categorySource] ?? cashflow.categorySource}
                  </span>
                )}
                {cashflow.bceEnterpriseNumber && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    BCE {cashflow.bceEnterpriseNumber}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Internal transfer link — shown FIRST when there are other
              household accounts available, since it's often the right
              answer for negative transactions like "to savings". */}
          {householdAccounts.length > 0 && (
            <div className="rounded-lg border border-[var(--chart-2)]/40 bg-[var(--chart-2)]/5 p-3">
              <Label className="text-xs font-semibold">
                Virement vers un autre compte du ménage
              </Label>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Choisis un compte si l&apos;argent ne quitte pas vraiment ton patrimoine — il sera
                exclu des dépenses analytiques.
              </p>
              <Select
                value={transferTo ?? "none"}
                onValueChange={(v) => setTransferTo(v && v !== "none" ? v : null)}
              >
                <SelectTrigger className="mt-2 h-9">
                  <SelectValue placeholder="Pas un virement interne" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Pas un virement interne —</SelectItem>
                  {householdAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{" "}
                      <span className="text-[10px] text-muted-foreground">({a.kind})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quick category picker — disabled visually when transferTo is set */}
          <div className="grid gap-2">
            <Label className="text-xs">
              Catégorie {transferTo && (
                <span className="text-muted-foreground">
                  (forcée à « Virement interne »)
                </span>
              )}
            </Label>
            <Select
              value={transferTo ? "transfer_internal" : category}
              disabled={!!transferTo}
              onValueChange={(v) => setCategory((v as TransactionCategory) ?? category)}
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
          </div>

          {/* Apply-to scope */}
          <div className="grid gap-2">
            <Label className="text-xs">Appliquer à</Label>
            <div className="grid gap-2 text-xs">
              {(
                [
                  { v: "this_only", label: "Cette transaction uniquement" },
                  {
                    v: "similar_counterparty",
                    label: "Toutes les transactions de la même contrepartie",
                    sub: "Crée une règle exacte",
                  },
                  {
                    v: "similar_description",
                    label: "Toutes celles avec un mot-clé de description similaire",
                    sub: "Crée une règle plus large",
                  },
                ] as const
              ).map((o) => (
                <label
                  key={o.v}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                    applyTo === o.v
                      ? "border-foreground bg-accent/40"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="applyTo"
                    value={o.v}
                    checked={applyTo === o.v}
                    onChange={() => setApplyTo(o.v)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="font-medium">{o.label}</div>
                    {"sub" in o && o.sub && (
                      <div className="text-[10px] text-muted-foreground">{o.sub}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Linked / new one-off charge — visible on expense rows */}
          {cashflow.amount < 0 && (
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-baseline justify-between">
                <Label className="text-xs font-semibold">
                  <Receipt className="mr-1 inline size-3.5" /> Frais exceptionnel (one-shot)
                </Label>
                {!showCreateCharge && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => setShowCreateCharge(true)}
                  >
                    <Plus className="size-3" /> Créer
                  </Button>
                )}
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Lier à un frais déjà enregistré OU créer un nouveau frais à partir de cette
                transaction (utile pour taxes, frais notaire, dépenses imprévues…).
              </p>

              {householdCharges.length > 0 && (
                <Select
                  value={linkedCharge ?? "none"}
                  onValueChange={(v) => setLinkedCharge(v && v !== "none" ? v : null)}
                >
                  <SelectTrigger className="mt-2 h-9">
                    <SelectValue placeholder="Aucun lien" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Aucun frais lié —</SelectItem>
                    {householdCharges
                      .map((c) => {
                        const dateStr = c.date
                          ? new Date(c.date).toLocaleDateString("fr-BE")
                          : "";
                        const amountClose =
                          Math.abs(Math.abs(c.amount) - Math.abs(cashflow.amount)) /
                            Math.abs(cashflow.amount) <
                          0.05;
                        return { c, dateStr, amountClose };
                      })
                      .sort((a, b) => Number(b.amountClose) - Number(a.amountClose))
                      .map(({ c, dateStr, amountClose }) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-baseline gap-2">
                            {amountClose && <span className="text-[10px]">⭐</span>}
                            <span className="font-medium">{c.label}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatEUR(c.amount)} · {dateStr}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              {showCreateCharge && (
                <div className="mt-3 space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground">
                    Nouveau frais — montant {formatEUR(Math.abs(cashflow.amount))} · date{" "}
                    {formatDateFR(cashflow.date)}
                  </p>
                  <div className="grid gap-2">
                    <Label className="text-[10px]">Libellé</Label>
                    <Input
                      value={chargeLabel}
                      onChange={(e) => setChargeLabel(e.target.value)}
                      placeholder="ex. Précompte immobilier 2026"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[10px]">Catégorie de frais</Label>
                    <Select
                      value={chargeCategoryValue}
                      onValueChange={(v) => setChargeCategoryValue(v ?? "other")}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {chargeCategory.map((c) => (
                          <SelectItem key={c} value={c}>
                            {chargeCategoryLabel[c] ?? c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-[10px]">
                    <input
                      type="checkbox"
                      checked={chargeIncludeInCostBasis}
                      onChange={(e) => setChargeIncludeInCostBasis(e.target.checked)}
                    />
                    <span>Inclure dans le coût de revient (immo)</span>
                  </label>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCreateCharge(false)}
                      disabled={pending}
                      className="flex-1 h-8 text-xs"
                    >
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      onClick={createCharge}
                      disabled={pending}
                      className="flex-1 h-8 text-xs"
                    >
                      <Plus className="size-3" /> Créer + lier
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Linked recurring income — only when current row is income */}
          {cashflow.amount > 0 && householdIncomes.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <Label className="text-xs font-semibold">
                Quel salaire / revenu récurrent ?
                {householdIncomes.length > 1 && (
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    (tu en as {householdIncomes.length} en système)
                  </span>
                )}
              </Label>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Lier à un salaire récurrent permet de tracer son évolution dans le temps.
              </p>
              <Select
                value={linkedIncome ?? "none"}
                onValueChange={(v) => setLinkedIncome(v && v !== "none" ? v : null)}
              >
                <SelectTrigger className="mt-2 h-9">
                  <SelectValue placeholder="Pas un salaire connu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Pas un salaire connu —</SelectItem>
                  {householdIncomes
                    .map((i) => {
                      const amountClose =
                        Math.abs(i.amount - Math.abs(cashflow.amount)) / Math.abs(cashflow.amount) <
                        0.1;
                      return { i, amountClose };
                    })
                    .sort((a, b) => Number(b.amountClose) - Number(a.amountClose))
                    .map(({ i, amountClose }) => (
                      <SelectItem key={i.id} value={i.id}>
                        <span className="flex items-baseline gap-2">
                          {amountClose && <span className="text-[10px]">⭐</span>}
                          <span className="font-medium">{i.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ~{formatEUR(i.amount)}/mois
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* BCE link */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs">
                <div className="font-medium">Lier à une société BCE/KBO</div>
                <div className="text-muted-foreground">
                  Catégorie déduite du code NACE officiel + règle créée pour les futurs.
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowBce((s) => !s)}
                disabled={pending}
              >
                <Building2 className="size-3.5" />
                {showBce ? "Fermer" : "Chercher"}
              </Button>
            </div>
            {showBce && (
              <div className="mt-3 grid gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Tape le nom de la société (ex. Delhaize, Engie…)"
                    value={bceQuery}
                    onChange={(e) => setBceQuery(e.target.value)}
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                {bceSearching && <p className="text-xs text-muted-foreground">Recherche…</p>}
                {bceCandidates.length > 0 && (
                  <ul className="max-h-56 space-y-1 overflow-y-auto">
                    {bceCandidates.map((c) => (
                      <li key={c.enterpriseNumber}>
                        <button
                          type="button"
                          onClick={() => pickBce(c)}
                          disabled={pending}
                          className="flex w-full items-center gap-2 rounded-md border border-border bg-background p-2.5 text-left text-xs hover:border-foreground"
                        >
                          <Sparkles className="size-3.5 shrink-0 text-[var(--chart-1)]" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{c.denomination}</div>
                            {c.commercialName && (
                              <div className="truncate text-[10px] text-muted-foreground">
                                {c.commercialName}
                              </div>
                            )}
                            <div className="text-[10px] font-mono text-muted-foreground">
                              {c.enterpriseNumber}
                              {c.naceCode && ` · NACE ${c.naceCode}`}
                              {c.naceDescription && ` · ${c.naceDescription}`}
                            </div>
                          </div>
                          <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {bceQuery.length >= 2 && !bceSearching && bceCandidates.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Aucune société trouvée. Si c&apos;est une enseigne internationale (Netflix,
                    Amazon…), ferme cette section et choisis simplement la catégorie.
                  </p>
                )}
              </div>
            )}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
