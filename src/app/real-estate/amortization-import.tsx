"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
        }))
      );
      toast.success(`${rows.length} échéances importées`);
      setOpen(false);
      setCsvText("");
      setPdfFile(null);
      setPdfRows([]);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline"><Upload className="size-4" /> Importer</Button>} />
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer un tableau d'amortissement</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="pdf" className="mt-2">
          <TabsList>
            <TabsTrigger value="pdf"><FileText className="size-3.5 mr-1" /> PDF bancaire</TabsTrigger>
            <TabsTrigger value="csv">CSV / texte</TabsTrigger>
          </TabsList>

          <TabsContent value="pdf" className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Dépose le tableau d'amortissement PDF fourni par ta banque (Crelan, BNP, ING, Belfius, KBC…).
              Le parser extrait les lignes à 5 colonnes (n° · mensualité · intérêts · capital · solde).
              Les dates sont générées à partir de la <strong>date de début du prêt</strong> ci-dessous (+1 mois par versement).
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>PDF du tableau</Label>
                <Input type="file" accept="application/pdf,.pdf" onChange={(e) => { setPdfFile(e.target.files?.[0] ?? null); setPdfRows([]); }} />
              </div>
              <div className="grid gap-2">
                <Label>Date du 1er versement (− 1 mois)</Label>
                <Input type="date" value={pdfStartDate} onChange={(e) => setPdfStartDate(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={uploadPdf} disabled={uploading || !pdfFile}>
                {uploading ? <><Loader2 className="size-4 animate-spin" /> Analyse…</> : <><Upload className="size-4" /> Analyser le PDF</>}
              </Button>
              {pdfMeta.format && <span className="text-xs text-muted-foreground">Format détecté : <code className="rounded bg-muted px-1">{pdfMeta.format}</code> · {pdfMeta.pages} pages</span>}
            </div>

            {pdfMeta.warnings.length > 0 && (
              <ul className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-500">
                {pdfMeta.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
              </ul>
            )}

            {pdfRows.length > 0 && (
              <PreviewTable rows={pdfRows.slice(0, 8)} total={pdfRows.length} />
            )}

            {pdfRows.length > 0 && (
              <PaymentsSummary rows={pdfRows} />
            )}

            <p className="text-xs text-amber-600 dark:text-amber-500">
              ⚠ L'import remplace les échéances existantes et met à jour le solde restant + la mensualité.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
              <Button onClick={() => submitRows(pdfRows)} disabled={pending || pdfRows.length === 0}>
                Importer {pdfRows.length > 0 ? `(${pdfRows.length})` : ""}
              </Button>
            </DialogFooter>
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
            {csvParsed.rows.length > 0 && (
              <PreviewTable rows={csvParsed.rows.slice(0, 5)} total={csvParsed.rows.length} />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
              <Button onClick={() => submitRows(csvParsed.rows)} disabled={pending || csvParsed.rows.length === 0}>
                Importer {csvParsed.rows.length > 0 ? `(${csvParsed.rows.length})` : ""}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PreviewTable({ rows, total }: { rows: ParsedRow[]; total: number }) {
  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Aperçu — {total} lignes détectées ({rows.length} premières affichées)
      </div>
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
