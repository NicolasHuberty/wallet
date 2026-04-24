"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
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
import { Pencil, Check, X, Settings2, Trash2, ExternalLink } from "lucide-react";
import { patchAccount, deleteAccount } from "./actions";
import { formatEUR, formatDateFR } from "@/lib/format";
import { isLiability } from "@/lib/labels";
import type { AccountKind } from "@/db/schema";

type Member = { id: string; name: string };

type AccountInput = {
  id: string;
  name: string;
  kind: AccountKind;
  institution: string | null;
  currency: string;
  currentValue: number;
  ownership: "shared" | "member";
  ownerMemberId: string | null;
  sharedSplitPct: number | null;
  annualYieldPct: number | null;
  monthlyContribution: number | null;
  notes: string | null;
};

type HistoryPoint = { date: string; value: number };

const growthKinds: AccountKind[] = ["savings", "brokerage", "retirement", "crypto", "cash"];
const contribKinds: AccountKind[] = ["savings", "brokerage", "retirement", "cash"];

export function AccountRow({
  account,
  history,
  memberById,
  inlineHoldings,
}: {
  account: AccountInput;
  history: HistoryPoint[];
  memberById: Record<string, Member>;
  inlineHoldings?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editingValue, setEditingValue] = useState(false);
  const [value, setValue] = useState<number>(account.currentValue);

  const canHaveYield = growthKinds.includes(account.kind);
  const canHaveContrib = contribKinds.includes(account.kind);

  const delta = history.length >= 2 ? history[history.length - 1].value - history[0].value : 0;
  const deltaPct =
    history.length >= 2 && history[0].value !== 0
      ? (delta / Math.abs(history[0].value)) * 100
      : 0;

  function saveValue() {
    start(async () => {
      try {
        await patchAccount({ id: account.id, currentValue: value });
        toast.success("Valeur mise à jour");
        setEditingValue(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function cancelValue() {
    setValue(account.currentValue);
    setEditingValue(false);
  }

  function remove() {
    if (!confirm(`Supprimer "${account.name}" ? Cette action est irréversible.`)) return;
    start(async () => {
      try {
        await deleteAccount(account.id);
        toast.success("Compte supprimé");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const negative = isLiability(account.kind) || account.currentValue < 0;

  return (
    <li className="px-4 py-3 md:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/accounts/${account.id}`}
              className="inline-flex items-center gap-1 text-sm font-medium hover:text-[var(--chart-1)] hover:underline"
            >
              {account.name}
              <ExternalLink className="size-3 opacity-60" />
            </Link>
            <SettingsPopover account={account} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {account.institution && <span>{account.institution}</span>}
            {account.institution && <span>·</span>}
            <span>
              {account.ownership === "shared"
                ? `Partagé ${account.sharedSplitPct ?? 50}%`
                : account.ownerMemberId
                  ? memberById[account.ownerMemberId]?.name ?? "Individuel"
                  : "Individuel"}
            </span>
            {account.currency !== "EUR" && (
              <span className="rounded border px-1">{account.currency}</span>
            )}
            {canHaveYield && (
              <YieldBadge
                accountId={account.id}
                kind={account.kind}
                annualYieldPct={account.annualYieldPct}
              />
            )}
            {canHaveContrib && (
              <ContributionBadge
                accountId={account.id}
                monthlyContribution={account.monthlyContribution}
              />
            )}
          </div>
        </div>

        {/* History sparkline */}
        {history.length >= 2 && (
          <div className="hidden h-8 w-24 shrink-0 md:block">
            <Sparkline data={history} negative={negative} />
          </div>
        )}

        {/* Value + delta */}
        <div className="flex items-center gap-2">
          {editingValue ? (
            <div className="flex items-center gap-1">
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className="h-8 w-32 pr-6 text-right tabular-nums"
                  autoFocus
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                  €
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-[var(--color-success)]"
                onClick={saveValue}
                disabled={pending}
              >
                <Check className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={cancelValue}
                disabled={pending}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditingValue(true)}
                className={`numeric text-right text-sm font-medium hover:underline ${negative ? "text-destructive" : ""}`}
                title="Cliquer pour modifier"
              >
                {formatEUR(account.currentValue)}
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 text-muted-foreground"
                onClick={() => setEditingValue(true)}
                title="Modifier la valeur"
              >
                <Pencil className="size-3" />
              </Button>
            </div>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-destructive hover:text-destructive"
            onClick={remove}
            disabled={pending}
            title="Supprimer"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {history.length >= 2 && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Sur {history.length} points · variation{" "}
          <span
            className={
              (negative ? delta < 0 : delta > 0)
                ? "text-[var(--color-success)]"
                : delta === 0
                  ? ""
                  : "text-destructive"
            }
          >
            {formatEUR(negative ? -delta : delta, { signed: true })} ({deltaPct.toFixed(1)}%)
          </span>{" "}
          depuis {formatDateFR(history[0].date)}
        </div>
      )}

      {inlineHoldings}
    </li>
  );
}

function YieldBadge({
  accountId,
  kind,
  annualYieldPct,
}: {
  accountId: string;
  kind: AccountKind;
  annualYieldPct: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [value, setValue] = useState<number | "">(annualYieldPct ?? "");

  const hasValue = annualYieldPct != null && annualYieldPct > 0;
  const label = hasValue
    ? `${annualYieldPct}%/an`
    : "+ Rendement";

  function save() {
    start(async () => {
      try {
        await patchAccount({
          id: accountId,
          annualYieldPct: value === "" ? null : Number(value),
        });
        toast.success("Rendement mis à jour");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:border-[var(--chart-1)] hover:text-[var(--chart-1)] ${
              hasValue
                ? "border-border bg-muted/40"
                : "border-dashed border-border/60 text-muted-foreground"
            }`}
            title={`Taux de ${kind === "brokerage" || kind === "retirement" || kind === "crypto" ? "rendement" : "rémunération"}`}
          />
        }
      >
        {label}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rendement annuel</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">Taux (%/an)</Label>
          <div className="relative">
            <Input
              type="number"
              step="0.1"
              placeholder="ex. 2.5 ou 7"
              value={value}
              onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
              className="pr-8 text-right numeric"
              autoFocus
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              %
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Vide = aucun taux défini (utilise le scénario global pour la projection).
          </p>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {hasValue && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={pending}
              onClick={() => {
                setValue("");
                start(async () => {
                  try {
                    await patchAccount({ id: accountId, annualYieldPct: null });
                    toast.success("Rendement retiré");
                    setOpen(false);
                    router.refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                });
              }}
            >
              Retirer
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "…" : "Enregistrer"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContributionBadge({
  accountId,
  monthlyContribution,
}: {
  accountId: string;
  monthlyContribution: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [value, setValue] = useState<number | "">(monthlyContribution ?? "");

  const hasValue = monthlyContribution != null && monthlyContribution > 0;
  const label = hasValue ? `DCA ${formatEUR(monthlyContribution!)}/mois` : "+ DCA mensuel";

  function save() {
    start(async () => {
      try {
        await patchAccount({
          id: accountId,
          monthlyContribution: value === "" ? null : Number(value),
        });
        toast.success("DCA mis à jour");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:border-[var(--color-success)] hover:text-[var(--color-success)] ${
              hasValue
                ? "border-border bg-muted/40"
                : "border-dashed border-border/60 text-muted-foreground"
            }`}
            title="DCA mensuel"
          />
        }
      >
        {label}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Apport mensuel (DCA)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">Montant mensuel (EUR)</Label>
          <div className="relative">
            <Input
              type="number"
              step="1"
              placeholder="ex. 300"
              value={value}
              onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
              className="pr-8 text-right numeric"
              autoFocus
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              €
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Modifiable à tout moment — pas un engagement rigide. Vide = pas de DCA.
          </p>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {hasValue && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={pending}
              onClick={() => {
                setValue("");
                start(async () => {
                  try {
                    await patchAccount({ id: accountId, monthlyContribution: null });
                    toast.success("DCA retiré");
                    setOpen(false);
                    router.refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                });
              }}
            >
              Retirer
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "…" : "Enregistrer"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsPopover({ account }: { account: AccountInput }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState(account.name);
  const [institution, setInstitution] = useState(account.institution ?? "");

  function save() {
    start(async () => {
      try {
        await patchAccount({
          id: account.id,
          name,
          institution: institution || null,
        });
        toast.success("Compte mis à jour");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-muted-foreground opacity-60 hover:opacity-100"
            title="Paramètres du compte"
          />
        }
      >
        <Settings2 className="size-3" />
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Paramètres · {account.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Institution</Label>
            <Input
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="ING, Crelan, Revolut…"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pour le type, la propriété ou les notes, utilise la page détail du compte.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Sparkline({ data, negative }: { data: HistoryPoint[]; negative: boolean }) {
  const color = negative ? "var(--destructive)" : "var(--color-success)";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`gSpark-${data.length}-${negative ? "n" : "p"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 11,
            padding: "4px 8px",
          }}
          formatter={(v) => [formatEUR(Number(v)), "Valeur"]}
          labelFormatter={(_, p) => (p[0] ? formatDateFR(p[0].payload.date) : "")}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#gSpark-${data.length}-${negative ? "n" : "p"})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
