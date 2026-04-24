"use client";

import { useRef, useState, useTransition } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseAmortizationCSV } from "@/lib/csv";
import { importAmortizationCSV } from "./actions";
import { formatEUR, formatDateFR } from "@/lib/format";

type ParsedRow = {
  index?: number;
  dueDate: Date;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
};

export function ImportAmortizationButton({ mortgageId, startDate }: { mortgageId: string; startDate: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [csvText, setCsvText] = useState("");
  const csvParsed = csvText ? parseAmortizationCSV(csvText) : { rows: [], warnings: [] };

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfStartDate, setPdfStartDate] = useState(startDate);
  const [pdfRows, setPdfRows] = useState<ParsedRow[]>([]);
  const [pdfMeta, setPdfMeta] = useState<{ pages?: number; format?: string; warnings: string[] }>({ warnings: [] });
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  function onPdfPick(file: File | null) {
    setPdfFile(file);
    setPdfRows([]);
  }

  async function uploadPdf() {
    if (!pdfFile) {
      toast.error("Sélectionne un PDF");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", pdfFile);
      form.append("startDate", pdfStartDate);
      const res = await fetch("/api/amortization/parse-pdf", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur parsing");
      const rows: ParsedRow[] = data.rows.map((r: { index: number; dueDate: string; payment: number; interest: number; principal: number; balance: number }) => ({
        index: r.index,
        dueDate: new Date(r.dueDate),
        payment: r.payment,
        interest: r.interest,
        principal: r.principal,
        balance: r.balance,
      }));
      setPdfRows(rows);
      setPdfMeta({ pages: data.pageCount, format: data.detectedFormat, warnings: data.warnings });
      if (rows.length === 0) toast.error("Aucune échéance détectée dans le PDF");
      else toast.success(`${rows.length} échéances détectées sur ${data.pageCount} pages`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function submitRows(rows: Array<{ dueDate: Date; payment: number; principal: number; interest: number; balance: number }>) {
    if (rows.length === 0) {
      toast.error("Aucune ligne à importer");
      return;
    }
    start(async () => {
      await importAmortizationCSV(
        mortgageId,
        rows.map((r) => ({
          dueDate: r.dueDate.toISOString(),
          payment: r.payment,
          principal: r.principal,
          interest: r.interest,
          balance: r.balance,
        })),
      );
      toast.success(`${rows.length} échéances importées`);
      setOpen(false);
      setCsvText("");
      setPdfFile(null);
      setPdfRows([]);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" variant="outline"><Upload className="size-4" /> Importer</Button>} />
      <SheetContent desktopSize="md:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Importer un tableau d&apos;amortissement</SheetTitle>
        </SheetHeader>

        <SheetBody>
          <Tabs defaultValue="pdf" className="mt-1">
            <TabsList className="w-full">
              <TabsTrigger value="pdf" className="flex-1"><FileText className="size-3.5 mr-1" /> PDF bancaire</TabsTrigger>
              <TabsTrigger value="csv" className="flex-1">CSV / texte</TabsTrigger>
            </TabsList>

            <TabsContent value="pdf" className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Dépose le tableau d&apos;amortissement PDF fourni par ta banque (Crelan, BNP, ING, Belfius, KBC…).
                Le parser extrait les lignes à 5 colonnes (n° · mensualité · intérêts · capital · solde).
                Les dates sont générées à partir de la <strong>date de début du prêt</strong> ci-dessous (+1 mois par versement).
              </p>

              <div className="grid gap-2">
                <Label>PDF du tableau</Label>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => onPdfPick(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => pdfInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) onPdfPick(f);
                  }}
                  className={cn(
                    "group flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                    dragOver
                      ? "border-[var(--chart-1)] bg-[var(--chart-1)]/10"
                      : "border-border bg-muted/30 hover:border-[var(--chart-1)]/60 hover:bg-[var(--chart-1)]/5",
                  )}
                >
                  {pdfFile ? (
                    <>
                      <CheckCircle2 className="size-6 text-[var(--color-success)]" />
                      <div className="text-sm font-medium">{pdfFile.name}</div>
                      <div className="text-xs text-muted-foreground">Déposer un autre fichier ou appuyer pour changer</div>
                    </>
                  ) : (
                    <>
                      <Upload className="size-6 text-muted-foreground transition-colors group-hover:text-[var(--chart-1)]" />
                      <div className="text-sm font-medium">Déposer un fichier ou appuyer pour choisir</div>
                      <div className="text-xs text-muted-foreground">PDF du tableau d&apos;amortissement</div>
                    </>
                  )}
                </button>
              </div>

              <div className="grid gap-2">
                <Label>Date du 1er versement (− 1 mois)</Label>
                <Input
                  type="date"
                  value={pdfStartDate}
                  onChange={(e) => setPdfStartDate(e.target.value)}
                  className="h-11 text-base md:h-8 md:text-sm"
                />
              </div>

              <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
                <Button onClick={uploadPdf} disabled={uploading || !pdfFile} className="w-full md:w-auto">
                  {uploading ? <><Loader2 className="size-4 animate-spin" /> Analyse…</> : <><Upload className="size-4" /> Analyser le PDF</>}
                </Button>
                {pdfMeta.format && <span className="text-xs text-muted-foreground">Format détecté : <code className="rounded bg-muted px-1">{pdfMeta.format}</code> · {pdfMeta.pages} pages</span>}
              </div>

              {uploading && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-1/3 animate-[amortbar_1.1s_ease-in-out_infinite] bg-[var(--chart-1)]" />
                  <style jsx>{`
                    @keyframes amortbar {
                      0% { transform: translateX(-100%); }
                      100% { transform: translateX(400%); }
                    }
                  `}</style>
                </div>
              )}

              {pdfMeta.warnings.length > 0 && (
                <ul className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-500">
                  {pdfMeta.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
                </ul>
              )}

              {pdfRows.length > 0 && <PreviewTable rows={pdfRows.slice(0, 8)} total={pdfRows.length} />}
              {pdfRows.length > 0 && <PaymentsSummary rows={pdfRows} />}

              <p className="text-xs text-amber-600 dark:text-amber-500">
                ⚠ L&apos;import remplace les échéances existantes et met à jour le solde restant + la mensualité.
              </p>
            </TabsContent>

            <TabsContent value="csv" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Colle le CSV de ton tableau bancaire. Colonnes reconnues :
                <code className="ml-1 rounded bg-muted px-1">date/échéance</code>,
                <code className="ml-1 rounded bg-muted px-1">mensualité</code>,
                <code className="ml-1 rounded bg-muted px-1">capital</code>,
                <code className="ml-1 rounded bg-muted px-1">intérêts</code>,
                <code className="ml-1 rounded bg-muted px-1">solde</code>.
              </p>
              <Textarea
                rows={10}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={`Date;Mensualité;Capital;Intérêts;Solde\n15/06/2024;1752,04;936,06;815,98;311063,94\n...`}
                className="font-mono text-xs"
              />
              {csvParsed.warnings.length > 0 && (
                <ul className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  {csvParsed.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
                </ul>
              )}
              {csvParsed.rows.length > 0 && <PreviewTable rows={csvParsed.rows.slice(0, 5)} total={csvParsed.rows.length} />}
            </TabsContent>
          </Tabs>
        </SheetBody>

        <SheetFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending} className="flex-1 md:flex-none">Annuler</Button>
          <Button
            onClick={() => {
              if (pdfRows.length > 0) return submitRows(pdfRows);
              return submitRows(csvParsed.rows);
            }}
            disabled={pending || (pdfRows.length === 0 && csvParsed.rows.length === 0)}
            className="flex-1 md:flex-none"
          >
            Importer {pdfRows.length > 0 ? `(${pdfRows.length})` : csvParsed.rows.length > 0 ? `(${csvParsed.rows.length})` : ""}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PreviewTable({ rows, total }: { rows: ParsedRow[]; total: number }) {
  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Aperçu — {total} lignes détectées ({rows.length} premières affichées)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-1.5 text-left font-medium">#</th>
              <th className="px-3 py-1.5 text-left font-medium">Date</th>
              <th className="px-3 py-1.5 text-right font-medium">Mensualité</th>
              <th className="px-3 py-1.5 text-right font-medium">Capital</th>
              <th className="px-3 py-1.5 text-right font-medium">Intérêts</th>
              <th className="px-3 py-1.5 text-right font-medium">Solde</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/60 last:border-none">
                <td className="px-3 py-1.5 text-muted-foreground">{r.index ?? i + 1}</td>
                <td className="px-3 py-1.5">{formatDateFR(r.dueDate)}</td>
                <td className="numeric px-3 py-1.5 text-right">{formatEUR(r.payment)}</td>
                <td className="numeric px-3 py-1.5 text-right">{formatEUR(r.principal)}</td>
                <td className="numeric px-3 py-1.5 text-right text-muted-foreground">{formatEUR(r.interest)}</td>
                <td className="numeric px-3 py-1.5 text-right font-medium">{formatEUR(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentsSummary({ rows }: { rows: ParsedRow[] }) {
  const totalPayments = rows.reduce((s, r) => s + r.payment, 0);
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0);
  const interestPct = totalPayments > 0 ? (totalInterest / totalPayments) * 100 : 0;
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-4">
      <Mini label="Échéances" value={rows.length.toString()} />
      <Mini label="Total payé" value={formatEUR(totalPayments)} />
      <Mini label="Capital total" value={formatEUR(totalPrincipal)} />
      <Mini label="Intérêts totaux" value={formatEUR(totalInterest)} sub={`${interestPct.toFixed(1)} % du total`} />
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="numeric mt-0.5 text-sm font-semibold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
