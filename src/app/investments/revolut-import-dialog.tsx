"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { parseRevolutCsv, type RevolutImportResult } from "@/lib/revolut";
import { importRevolutHoldings } from "./actions";
import { formatEUR } from "@/lib/format";

export function RevolutImportDialog({
  accounts,
  defaultAccountId,
  trigger,
}: {
  accounts: { id: string; name: string; kind: string }[];
  defaultAccountId?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState<string | undefined>(defaultAccountId ?? accounts[0]?.id);
  const [csv, setCsv] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const preview: RevolutImportResult | null = useMemo(
    () => (csv ? parseRevolutCsv(csv) : null),
    [csv]
  );

  async function handleFile(f: File | null) {
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    setCsv(text);
  }

  function submit() {
    if (!accountId) {
      toast.error("Choisis un compte de destination");
      return;
    }
    if (!csv) {
      toast.error("Ajoute un fichier CSV Revolut");
      return;
    }
    start(async () => {
      try {
        const res = await importRevolutHoldings({ accountId, csv });
        toast.success(
          `Import terminé · ${res.created} ETF créés · ${res.updated} mis à jour${
            res.dividends ? ` · dividendes ${formatEUR(res.dividends)}` : ""
          }`
        );
        setOpen(false);
        setCsv("");
        setFileName("");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <Button size="sm" variant="outline">
              <Upload className="size-4" /> Importer Revolut
            </Button>
          )
        }
      />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer depuis Revolut</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="size-4" /> Comment exporter depuis Revolut
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Ouvre l&apos;app Revolut → onglet <b>Investments</b> (Stocks).</li>
              <li>
                Touche <b>Statements</b> (icône document en haut à droite).
              </li>
              <li>
                Choisis <b>Tax report</b> (ou <b>Account statement</b>) au format <b>CSV</b> pour la
                période souhaitée.
              </li>
              <li>Télécharge le fichier reçu par email et dépose-le ci-dessous.</li>
            </ol>
            <p className="mt-2 text-muted-foreground">
              Chaque ETF est identifié par son ISIN. Les ETF sont ajoutés au wallet avec une
              allocation 0% — tu définis ensuite le % d&apos;allocation de chacun directement dans
              le tableau du wallet.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Compte de destination</Label>
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? undefined)}>
              <SelectTrigger>
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
                Crée d&apos;abord un compte de type Portefeuille-titres dans la page Comptes.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Fichier CSV Revolut</Label>
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <Upload className="size-4" /> Choisir un fichier
              </Button>
              {fileName && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-[var(--color-success)]" />
                  {fileName}
                </span>
              )}
            </div>
          </div>

          {preview && (
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs">
                <div className="font-medium">
                  Aperçu · {preview.etfs.length} ETF
                  {preview.totalDividends > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      · dividendes {formatEUR(preview.totalDividends)}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
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
              {preview.warnings.length > 0 && (
                <div className="border-t border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
                  <div className="flex items-center gap-1 font-medium">
                    <AlertTriangle className="size-3.5" /> Avertissements
                  </div>
                  <ul className="mt-1 list-disc pl-5">
                    {preview.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-end gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending || !csv || !accountId}>
            {pending ? "Import…" : "Importer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
