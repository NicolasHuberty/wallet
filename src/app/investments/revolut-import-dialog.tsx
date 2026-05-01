"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  detectAndParseRevolut,
  type RevolutAnyResult,
} from "@/lib/revolut";
import { importRevolutHoldings, importRevolutTransactions } from "./actions";
import { importRevolutSavingsStatement } from "../accounts/actions";
import { formatEUR } from "@/lib/format";

type AccountOption = { id: string; name: string; kind: string };

export function RevolutImportDialog({
  accounts,
  defaultAccountId,
  trigger,
}: {
  accounts: AccountOption[];
  defaultAccountId?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState<string | undefined>(
    defaultAccountId ?? accounts[0]?.id,
  );
  const [csv, setCsv] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const preview: RevolutAnyResult | null = useMemo(
    () => (csv ? detectAndParseRevolut(csv) : null),
    [csv],
  );

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const formatMismatch = (() => {
    if (!preview || !selectedAccount) return null;
    const isCashLike =
      selectedAccount.kind === "savings" || selectedAccount.kind === "cash";
    const isInvestmentLike =
      selectedAccount.kind === "brokerage" ||
      selectedAccount.kind === "retirement" ||
      selectedAccount.kind === "crypto";
    if (preview.format === "savings" && !isCashLike) {
      return "Le fichier est un relevé d'épargne — choisis un compte Épargne ou Cash.";
    }
    if (
      (preview.format === "investment-transactions" || preview.format === "tax-report") &&
      !isInvestmentLike
    ) {
      return "Le fichier est un relevé d'investissement — choisis un Portefeuille-titres, Pension ou Crypto.";
    }
    return null;
  })();

  async function handleFile(f: File | null) {
    if (!f) return;
    setFileName(f.name);
    setParsing(true);
    try {
      const text = await f.text();
      setCsv(text);
    } finally {
      setTimeout(() => setParsing(false), 200);
    }
  }

  function submit() {
    if (!accountId) {
      toast.error("Choisis un compte de destination");
      return;
    }
    if (!csv || !preview) {
      toast.error("Ajoute un fichier CSV Revolut");
      return;
    }
    if (formatMismatch) {
      toast.error(formatMismatch);
      return;
    }
    start(async () => {
      try {
        if (preview.format === "savings") {
          const res = await importRevolutSavingsStatement({ accountId, csv });
          toast.success(
            `Épargne importée · ${res.snapshotsCreated} snapshot(s) créé(s) · ${res.snapshotsUpdated} mis à jour · solde ${formatEUR(res.totals.finalBalance)} · intérêts ${formatEUR(res.totals.interest)}`,
          );
        } else if (preview.format === "investment-transactions") {
          const res = await importRevolutTransactions({ accountId, csv });
          toast.success(
            `Transactions importées · ${res.holdingsCreated + res.holdingsUpdated} ETF (${res.holdingsCreated} créés, ${res.holdingsUpdated} mis à jour) · ${res.snapshotsCreated + res.snapshotsUpdated} snapshot(s) · valeur ${formatEUR(res.totals.finalValue)}`,
          );
        } else {
          const res = await importRevolutHoldings({ accountId, csv });
          toast.success(
            `Import terminé · ${res.created} ETF créés · ${res.updated} mis à jour${
              res.dividends ? ` · dividendes ${formatEUR(res.dividends)}` : ""
            }`,
          );
        }
        setOpen(false);
        setCsv("");
        setFileName("");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <Button size="sm" variant="outline">
              <Upload className="size-4" /> Importer Revolut
            </Button>
          )
        }
      />
      <SheetContent desktopSize="md:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Importer depuis Revolut</SheetTitle>
        </SheetHeader>

        <SheetBody className="grid gap-5">
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="size-4" /> Formats supportés
            </div>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <b>Investments → Statements → Account statement (CSV)</b> : historique de
                transactions (BUY/SELL/dividendes/cash), produit les ETF avec quantités, prix de
                revient moyen et un point d&apos;historique par jour de transaction.
              </li>
              <li>
                <b>Savings → Statement (CSV)</b> : relevé du compte d&apos;épargne, produit un
                point d&apos;historique par jour calendaire à partir du solde.
              </li>
              <li>
                <b>Tax report (CSV multi-sections)</b> : import legacy — n&apos;ajoute que les
                ETF identifiés (allocation %).
              </li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              Le format est détecté automatiquement à partir du fichier déposé.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Compte de destination</Label>
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? undefined)}>
              <SelectTrigger className="h-11 md:h-8">
                <SelectValue placeholder="Sélectionner un compte" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accounts.length === 0 && (
              <p className="text-xs text-destructive">
                Crée d&apos;abord un compte (Portefeuille-titres ou Épargne) dans la page
                Comptes.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Fichier CSV Revolut</Label>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={cn(
                "group flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                dragOver
                  ? "border-[var(--chart-1)] bg-[var(--chart-1)]/10"
                  : "border-border bg-muted/30 hover:border-[var(--chart-1)]/60 hover:bg-[var(--chart-1)]/5",
              )}
            >
              {fileName ? (
                <>
                  <CheckCircle2 className="size-6 text-[var(--color-success)]" />
                  <div className="text-sm font-medium">{fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    Déposer un autre fichier ou appuyer pour changer
                  </div>
                </>
              ) : (
                <>
                  <Upload className="size-6 text-muted-foreground transition-colors group-hover:text-[var(--chart-1)]" />
                  <div className="text-sm font-medium">
                    Déposer un fichier ou appuyer pour choisir
                  </div>
                  <div className="text-xs text-muted-foreground">CSV exporté depuis Revolut</div>
                </>
              )}
            </button>
            {parsing && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/3 animate-[revolutbar_1.1s_ease-in-out_infinite] bg-[var(--chart-1)]" />
                <style jsx>{`
                  @keyframes revolutbar {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(400%); }
                  }
                `}</style>
              </div>
            )}
          </div>

          {preview && <Preview preview={preview} />}

          {formatMismatch && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <div className="flex items-center gap-1 font-medium">
                <AlertTriangle className="size-3.5" /> Compte incompatible
              </div>
              <p className="mt-0.5">{formatMismatch}</p>
            </div>
          )}
        </SheetBody>

        <SheetFooter className="flex justify-end gap-2 md:justify-end">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="flex-1 md:flex-none"
          >
            Annuler
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !csv || !accountId || !!formatMismatch}
            className="flex-1 md:flex-none"
          >
            {pending ? "Import…" : "Importer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Preview({ preview }: { preview: RevolutAnyResult }) {
  if (preview.format === "savings") {
    const t = preview.totals;
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs">
          <div className="font-medium">
            Aperçu épargne · {preview.snapshots.length} jour(s) · solde {formatEUR(t.finalBalance)}
          </div>
          <Badge variant="secondary" className="text-[10px]">
            Savings statement
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 py-3 text-xs md:grid-cols-4">
          <Stat label="Dépôts" value={formatEUR(t.deposits)} />
          <Stat label="Retraits" value={formatEUR(t.withdrawals)} />
          <Stat label="Intérêts" value={formatEUR(t.interest)} />
          <Stat label="Lignes" value={String(t.eventCount)} />
        </div>
        {preview.snapshots.length > 0 && (
          <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            {preview.snapshots[0].date} → {preview.snapshots[preview.snapshots.length - 1].date}
          </div>
        )}
        {preview.warnings.length > 0 && <Warnings list={preview.warnings} />}
      </div>
    );
  }

  if (preview.format === "investment-transactions") {
    const t = preview.totals;
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs">
          <div className="font-medium">
            Aperçu transactions · {preview.holdings.length} ETF · {t.eventCount} évts · valeur{" "}
            {formatEUR(t.finalValue)}
          </div>
          <Badge variant="secondary" className="text-[10px]">
            Account statement
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 py-3 text-xs md:grid-cols-4">
          <Stat label="Dépôts" value={formatEUR(t.contributions)} />
          <Stat label="Retraits" value={formatEUR(t.withdrawals)} />
          <Stat label="Dividendes" value={formatEUR(t.dividends)} />
          <Stat label="Frais" value={formatEUR(t.fees)} />
          <Stat label="Cash final" value={formatEUR(t.finalCash)} />
          <Stat label="Positions" value={formatEUR(t.finalPositionValue)} />
          <Stat label="Snapshots" value={String(preview.snapshots.length)} />
          <Stat label="Évts" value={String(t.eventCount)} />
        </div>
        <div className="max-h-56 overflow-y-auto border-t border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Ticker</th>
                <th className="numeric px-3 py-1.5 text-right font-medium">Qté</th>
                <th className="numeric px-3 py-1.5 text-right font-medium">PRU</th>
                <th className="numeric px-3 py-1.5 text-right font-medium">Px actuel</th>
                <th className="numeric px-3 py-1.5 text-right font-medium">Div.</th>
              </tr>
            </thead>
            <tbody>
              {preview.holdings.map((h) => (
                <tr key={h.ticker} className="border-t border-border/40">
                  <td className="px-3 py-1.5 font-mono font-medium">{h.ticker}</td>
                  <td className="numeric px-3 py-1.5 text-right tabular-nums">
                    {h.quantity.toFixed(4)}
                  </td>
                  <td className="numeric px-3 py-1.5 text-right tabular-nums">
                    {h.avgCost > 0 ? formatEUR(h.avgCost) : "—"}
                  </td>
                  <td className="numeric px-3 py-1.5 text-right tabular-nums">
                    {h.lastPrice > 0 ? formatEUR(h.lastPrice) : "—"}
                  </td>
                  <td className="numeric px-3 py-1.5 text-right tabular-nums">
                    {h.totalDividends > 0 ? formatEUR(h.totalDividends) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview.warnings.length > 0 && <Warnings list={preview.warnings} />}
      </div>
    );
  }

  // Tax report (legacy multi-section)
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs">
        <div className="font-medium">
          Aperçu · {preview.etfs.length} ETF
          {preview.totalDividends > 0 && (
            <span className="text-muted-foreground">
              {" "}· dividendes {formatEUR(preview.totalDividends)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {preview.detectedSections.map((s) => (
            <Badge key={s} variant="secondary" className="text-[10px]">
              {s}
            </Badge>
          ))}
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Ticker</th>
              <th className="px-3 py-1.5 text-left font-medium">Nom</th>
              <th className="px-3 py-1.5 text-left font-medium">ISIN</th>
              <th className="px-3 py-1.5 text-right font-medium">Div.</th>
            </tr>
          </thead>
          <tbody>
            {preview.etfs.map((e) => (
              <tr key={e.isin} className="border-t border-border/40">
                <td className="px-3 py-1.5 font-mono font-medium">{e.symbol}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{e.name || "—"}</td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                  {e.isin}
                </td>
                <td className="numeric px-3 py-1.5 text-right">
                  {e.dividends > 0 ? formatEUR(e.dividends) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.warnings.length > 0 && <Warnings list={preview.warnings} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="numeric text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Warnings({ list }: { list: string[] }) {
  return (
    <div className="border-t border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
      <div className="flex items-center gap-1 font-medium">
        <AlertTriangle className="size-3.5" /> Avertissements
      </div>
      <ul className="mt-1 list-disc pl-5">
        {list.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
