"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Check, ChevronLeft, ChevronRight, Home, Landmark, Receipt, ListChecks, Calculator, Upload, Loader2, FileCheck, X } from "lucide-react";
import { createFullProperty } from "./actions";
import { chargeCategoryLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

type ChargeDraft = {
  id: string;
  category: string;
  label: string;
  amount: number;
  includeInCostBasis: boolean;
  enabled: boolean;
};

type ParsedRow = {
  dueDate: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
};

type PdfExtraction = {
  rows: ParsedRow[];
  principal: number;
  monthlyPayment: number;
  termMonths: number;
  rateAnnualPct: number;
  finalBalance: number;
  totalInterest: number;
  pages?: number;
  filename: string;
};

function extractFromRows(rows: ParsedRow[]): Omit<PdfExtraction, "filename" | "pages"> {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const principal = Math.round((first.balance + first.principal) * 100) / 100;
  const monthlyPayment = first.payment;
  const termMonths = rows.length;
  const monthlyRate = principal > 0 ? first.interest / principal : 0;
  const rateAnnualPct = Math.round(monthlyRate * 12 * 10000) / 100;
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  return {
    rows,
    principal,
    monthlyPayment,
    termMonths,
    rateAnnualPct,
    finalBalance: last.balance,
    totalInterest,
  };
}

type WizardState = {
  name: string;
  address: string;
  signingDate: string;
  purchasePrice: number | "";
  currentValue: number | "";
  annualAppreciationPct: number | "";
  monthlyFees: number | "";
  surfaceSqm: number | "";

  hasMortgage: boolean;
  mortgageName: string;
  lender: string;
  principal: number | "";
  interestRatePct: number | "";
  termMonths: number | "";
  startDate: string;
  monthlyPayment: number | "";
  remainingBalance: number | "";

  charges: ChargeDraft[];
  customChargeLabel: string;
  customChargeCategory: string;

  pdfExtraction: PdfExtraction | null;
};

const defaultCharges: Omit<ChargeDraft, "id" | "amount" | "enabled">[] = [
  { category: "notary", label: "Notaire — frais et honoraires", includeInCostBasis: true },
  { category: "registration_tax", label: "Droits d'enregistrement", includeInCostBasis: true },
  { category: "credit_fees", label: "Frais de dossier crédit", includeInCostBasis: true },
  { category: "expertise", label: "Frais d'expertise", includeInCostBasis: true },
  { category: "mortgage_insurance", label: "Assurance solde restant dû (prime unique)", includeInCostBasis: true },
  { category: "renovation", label: "Travaux / rénovation initiale", includeInCostBasis: true },
  { category: "furniture", label: "Cuisine équipée / mobilier", includeInCostBasis: false },
  { category: "moving", label: "Déménagement", includeInCostBasis: false },
];

function initialState(): WizardState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: "",
    address: "",
    signingDate: today,
    purchasePrice: "",
    currentValue: "",
    annualAppreciationPct: 2,
    monthlyFees: 0,
    surfaceSqm: "",

    hasMortgage: false,
    mortgageName: "",
    lender: "",
    principal: "",
    interestRatePct: 3,
    termMonths: 300,
    startDate: today,
    monthlyPayment: "",
    remainingBalance: "",

    charges: defaultCharges.map((c, i) => ({ ...c, id: `default-${i}`, amount: 0, enabled: false })),
    customChargeLabel: "",
    customChargeCategory: "other",

    pdfExtraction: null,
  };
}

function computeMonthly(principal: number, ratePct: number, months: number) {
  const r = ratePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

const steps = [
  { key: "property", label: "Bien", icon: Home },
  { key: "mortgage", label: "Prêt", icon: Landmark },
  { key: "charges", label: "Frais", icon: Receipt },
  { key: "review", label: "Récap", icon: ListChecks },
] as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="numeric mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

export function PropertyWizard({ householdId, trigger }: { householdId: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardState>(initialState());
  const [pending, start] = useTransition();
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const u = <K extends keyof WizardState>(k: K, v: WizardState[K]) => setForm((p) => ({ ...p, [k]: v }));

  async function uploadMortgagePdf(file: File) {
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("startDate", form.signingDate);
      const res = await fetch("/api/amortization/parse-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur parsing");
      if (!data.rows || data.rows.length === 0) throw new Error("Aucune échéance détectée dans le PDF");
      const rows = data.rows as ParsedRow[];
      const ext = extractFromRows(rows);
      setForm((p) => ({
        ...p,
        hasMortgage: true,
        principal: ext.principal,
        interestRatePct: ext.rateAnnualPct,
        termMonths: ext.termMonths,
        monthlyPayment: ext.monthlyPayment,
        remainingBalance: ext.principal,
        startDate: p.signingDate,
        pdfExtraction: { ...ext, pages: data.pageCount, filename: file.name },
      }));
      toast.success(`${rows.length} échéances extraites · ${formatEUR(ext.monthlyPayment)}/mois · ${ext.rateAnnualPct}%`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadingPdf(false);
    }
  }

  function clearPdf() {
    setForm((p) => ({ ...p, pdfExtraction: null }));
  }

  function reset() {
    setForm(initialState());
    setStep(0);
  }

  function next() {
    if (step === 0) {
      if (!form.name || !form.signingDate || !form.purchasePrice) {
        toast.error("Nom, date de signature et prix d'achat requis");
        return;
      }
      if (form.currentValue === "" || form.currentValue === 0) {
        u("currentValue", Number(form.purchasePrice));
      }
      u("startDate", form.signingDate);
    }
    if (step === 1 && form.hasMortgage) {
      if (!form.principal || !form.termMonths) {
        toast.error("Capital et durée requis pour le prêt");
        return;
      }
      if (!form.monthlyPayment) {
        const monthly = computeMonthly(Number(form.principal), Number(form.interestRatePct), Number(form.termMonths));
        u("monthlyPayment", Math.round(monthly * 100) / 100);
      }
      if (!form.remainingBalance) u("remainingBalance", Number(form.principal));
    }
    setStep((s) => Math.min(3, s + 1));
  }

  function prev() { setStep((s) => Math.max(0, s - 1)); }

  const enabledCharges = form.charges.filter((c) => c.enabled && c.amount > 0);
  const totalCharges = enabledCharges.reduce((s, c) => s + c.amount, 0);
  const costBasisCharges = enabledCharges.filter((c) => c.includeInCostBasis).reduce((s, c) => s + c.amount, 0);

  async function submit() {
    start(async () => {
      try {
        await createFullProperty({
          householdId,
          property: {
            name: form.name,
            address: form.address || null,
            signingDate: form.signingDate,
            purchasePrice: Number(form.purchasePrice),
            currentValue: Number(form.currentValue || form.purchasePrice),
            annualAppreciationPct: Number(form.annualAppreciationPct || 0),
            monthlyFees: Number(form.monthlyFees || 0),
            surfaceSqm: form.surfaceSqm === "" ? null : Number(form.surfaceSqm),
          },
          mortgage: {
            enabled: form.hasMortgage,
            name: form.mortgageName || null,
            lender: form.lender || null,
            principal: form.hasMortgage ? Number(form.principal) : null,
            interestRatePct: form.hasMortgage ? Number(form.interestRatePct) : null,
            termMonths: form.hasMortgage ? Number(form.termMonths) : null,
            startDate: form.hasMortgage ? form.startDate : null,
            monthlyPayment: form.hasMortgage ? Number(form.monthlyPayment || 0) : null,
            remainingBalance: form.hasMortgage ? Number(form.remainingBalance || form.principal) : null,
          },
          charges: enabledCharges.map((c) => ({
            category: c.category,
            label: c.label,
            amount: c.amount,
            date: form.signingDate,
            includeInCostBasis: c.includeInCostBasis,
          })),
          amortizationRows: form.pdfExtraction?.rows,
        });
        const parts = [`Bien "${form.name}" créé`];
        if (form.hasMortgage) parts.push("prêt");
        if (enabledCharges.length > 0) parts.push(`${enabledCharges.length} frais`);
        if (form.pdfExtraction) parts.push(`${form.pdfExtraction.rows.length} échéances`);
        toast.success(parts.join(" + "));
        setOpen(false);
        reset();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={trigger as React.ReactElement ?? <Button size="sm"><Plus className="size-4" /> Nouveau bien</Button>} />
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Onboarding — nouveau bien immobilier</DialogTitle>
        </DialogHeader>

        <nav className="mb-2 flex items-center gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.key} className="flex flex-1 items-center gap-2">
                <div className={cn(
                  "flex size-8 items-center justify-center rounded-full text-xs font-medium border transition-colors shrink-0",
                  active && "bg-foreground text-background border-foreground",
                  done && "bg-[var(--color-success)] text-white border-[var(--color-success)]",
                  !active && !done && "bg-muted text-muted-foreground border-border"
                )}>
                  {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </div>
                <div className="flex-1">
                  <div className={cn("text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                    Étape {i + 1}
                  </div>
                  <div className="text-sm">{s.label}</div>
                </div>
                {i < steps.length - 1 && <div className="h-px flex-1 bg-border" />}
              </div>
            );
          })}
        </nav>

        <div className="pt-2">
          {step === 0 && (
            <div className="grid gap-4">
              <p className="text-xs text-muted-foreground">
                Ces infos décrivent le bien. La <strong>date de signature de l'acte</strong> sera utilisée comme date de référence pour les frais de notaire, droits d'enregistrement, etc.
              </p>
              <div className="grid gap-2"><Label>Nom du bien <span className="text-destructive">*</span></Label><Input value={form.name} onChange={(e) => u("name", e.target.value)} placeholder="Ex. Maison Louvain-la-Neuve" autoFocus /></div>
              <div className="grid gap-2"><Label>Adresse</Label><Input value={form.address} onChange={(e) => u("address", e.target.value)} placeholder="Rue, code postal, ville" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>Date de signature de l'acte <span className="text-destructive">*</span></Label><Input type="date" value={form.signingDate} onChange={(e) => u("signingDate", e.target.value)} /></div>
                <div className="grid gap-2"><Label>Surface (m²)</Label><Input type="number" value={form.surfaceSqm} onChange={(e) => u("surfaceSqm", e.target.value === "" ? "" : Number(e.target.value))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>Prix d'achat <span className="text-destructive">*</span></Label><Input type="number" value={form.purchasePrice} onChange={(e) => u("purchasePrice", e.target.value === "" ? "" : Number(e.target.value))} placeholder="320000" /></div>
                <div className="grid gap-2"><Label>Valeur actuelle (si différente)</Label><Input type="number" value={form.currentValue} onChange={(e) => u("currentValue", e.target.value === "" ? "" : Number(e.target.value))} placeholder={form.purchasePrice ? String(form.purchasePrice) : ""} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>Appréciation annuelle estimée (%)</Label><Input type="number" step="0.1" value={form.annualAppreciationPct} onChange={(e) => u("annualAppreciationPct", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                <div className="grid gap-2"><Label>Frais mensuels récurrents (taxes, entretien…)</Label><Input type="number" value={form.monthlyFees} onChange={(e) => u("monthlyFees", e.target.value === "" ? "" : Number(e.target.value))} /></div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4">
              <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
                <Checkbox id="hasMortgage" checked={form.hasMortgage} onCheckedChange={(v) => { u("hasMortgage", !!v); if (!v) clearPdf(); }} className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="hasMortgage" className="text-sm font-medium">J'ai contracté un prêt hypothécaire pour ce bien</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">Si non coché, on passe directement aux frais.</p>
                </div>
              </div>

              {form.hasMortgage && (
                <>
                  {!form.pdfExtraction ? (
                    <label className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
                      uploadingPdf ? "border-border bg-muted/30" : "border-[var(--chart-1)]/40 bg-[var(--chart-1)]/5 hover:bg-[var(--chart-1)]/10"
                    )}>
                      {uploadingPdf ? (
                        <>
                          <Loader2 className="size-6 animate-spin text-[var(--chart-1)]" />
                          <div className="text-sm font-medium">Analyse du PDF…</div>
                          <div className="text-xs text-muted-foreground">Extraction des échéances en cours</div>
                        </>
                      ) : (
                        <>
                          <Upload className="size-6 text-[var(--chart-1)]" />
                          <div className="text-sm font-medium">Importer le tableau d'amortissement PDF</div>
                          <div className="text-xs text-muted-foreground max-w-sm">
                            Dépose le PDF fourni par ta banque — capital, taux, durée, mensualité et toutes les échéances seront remplis automatiquement. Date de référence : <strong>{new Date(form.signingDate).toLocaleDateString("fr-BE")}</strong>.
                          </div>
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMortgagePdf(f); }}
                          />
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="rounded bg-muted px-1.5 py-0.5">Crelan</span>
                            <span className="rounded bg-muted px-1.5 py-0.5">BNP</span>
                            <span className="rounded bg-muted px-1.5 py-0.5">ING</span>
                            <span className="rounded bg-muted px-1.5 py-0.5">Belfius</span>
                            <span className="rounded bg-muted px-1.5 py-0.5">KBC</span>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">— ou saisir manuellement en bas —</div>
                        </>
                      )}
                    </label>
                  ) : (
                    <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <FileCheck className="size-5 text-[var(--color-success)] shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">Tableau d'amortissement extrait</div>
                            <div className="text-xs text-muted-foreground truncate">{form.pdfExtraction.filename} · {form.pdfExtraction.pages ?? "?"} pages · {form.pdfExtraction.rows.length} échéances</div>
                          </div>
                        </div>
                        <Button type="button" size="icon" variant="ghost" onClick={clearPdf} title="Retirer"><X className="size-4" /></Button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                        <Stat label="Capital" value={formatEUR(form.pdfExtraction.principal)} />
                        <Stat label="Mensualité" value={formatEUR(form.pdfExtraction.monthlyPayment)} />
                        <Stat label="Taux (annuel)" value={`${form.pdfExtraction.rateAnnualPct.toFixed(3)} %`} />
                        <Stat label="Durée" value={`${form.pdfExtraction.termMonths} mois (${(form.pdfExtraction.termMonths / 12).toFixed(1)} ans)`} />
                        <Stat label="Total intérêts" value={formatEUR(form.pdfExtraction.totalInterest)} />
                        <Stat label="Dernière échéance" value={new Date(form.pdfExtraction.rows[form.pdfExtraction.rows.length - 1].dueDate).toLocaleDateString("fr-BE", { month: "short", year: "numeric" })} />
                        <Stat label="Solde final" value={formatEUR(form.pdfExtraction.finalBalance)} />
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Les champs ci-dessous sont pré-remplis. Les {form.pdfExtraction.rows.length} échéances seront importées au clic sur "Créer tout le dossier".
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2"><Label>Nom du prêt</Label><Input value={form.mortgageName} onChange={(e) => u("mortgageName", e.target.value)} placeholder={`Prêt — ${form.name || "maison"}`} /></div>
                    <div className="grid gap-2"><Label>Prêteur</Label><Input value={form.lender} onChange={(e) => u("lender", e.target.value)} placeholder="BNP Paribas Fortis, Crelan…" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2"><Label>Capital emprunté <span className="text-destructive">*</span></Label><Input type="number" value={form.principal} onChange={(e) => u("principal", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                    <div className="grid gap-2"><Label>Taux (%)</Label><Input type="number" step="0.01" value={form.interestRatePct} onChange={(e) => u("interestRatePct", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                    <div className="grid gap-2"><Label>Durée (mois) <span className="text-destructive">*</span></Label><Input type="number" value={form.termMonths} onChange={(e) => u("termMonths", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2"><Label>Date 1er versement</Label><Input type="date" value={form.startDate} onChange={(e) => u("startDate", e.target.value)} /></div>
                    <div className="grid gap-2">
                      <Label>Mensualité</Label>
                      <div className="flex gap-1">
                        <Input type="number" step="0.01" value={form.monthlyPayment} onChange={(e) => u("monthlyPayment", e.target.value === "" ? "" : Number(e.target.value))} placeholder="auto-calculé" />
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          title="Calculer"
                          onClick={() => {
                            if (!form.principal || !form.termMonths) return toast.error("Capital et durée requis");
                            const m = computeMonthly(Number(form.principal), Number(form.interestRatePct), Number(form.termMonths));
                            u("monthlyPayment", Math.round(m * 100) / 100);
                          }}
                        ><Calculator className="size-4" /></Button>
                      </div>
                    </div>
                    <div className="grid gap-2"><Label>Solde restant (si en cours)</Label><Input type="number" value={form.remainingBalance} onChange={(e) => u("remainingBalance", e.target.value === "" ? "" : Number(e.target.value))} placeholder={form.principal ? String(form.principal) : ""} /></div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-3">
              <p className="text-xs text-muted-foreground">
                Coche les frais que tu as payés et indique le montant. Ces frais seront datés du <strong>{new Date(form.signingDate).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" })}</strong>.
              </p>
              <div className="rounded-lg border border-border divide-y divide-border">
                {form.charges.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-3">
                    <Checkbox
                      checked={c.enabled}
                      onCheckedChange={(v) => {
                        const enabled = !!v;
                        setForm((p) => ({ ...p, charges: p.charges.map((x) => x.id === c.id ? { ...x, enabled } : x) }));
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="text-xs text-muted-foreground">{chargeCategoryLabel[c.category]}{c.includeInCostBasis ? " · dans coût de revient" : " · hors coût"}</div>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      className="w-32"
                      disabled={!c.enabled}
                      value={c.amount || ""}
                      onChange={(e) => {
                        const amount = Number(e.target.value) || 0;
                        setForm((p) => ({ ...p, charges: p.charges.map((x) => x.id === c.id ? { ...x, amount, enabled: amount > 0 ? true : x.enabled } : x) }));
                      }}
                    />
                    <button
                      type="button"
                      title={c.includeInCostBasis ? "Dans le coût de revient" : "Hors coût de revient"}
                      className={cn("rounded-md border px-2 py-1 text-xs transition", c.includeInCostBasis ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]" : "border-border text-muted-foreground")}
                      onClick={() => setForm((p) => ({ ...p, charges: p.charges.map((x) => x.id === c.id ? { ...x, includeInCostBasis: !x.includeInCostBasis } : x) }))}
                    >
                      {c.includeInCostBasis ? "Coût ✓" : "Hors coût"}
                    </button>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-dashed border-border p-3">
                <div className="mb-2 text-xs font-medium">Ajouter un autre frais</div>
                <div className="flex gap-2">
                  <select
                    value={form.customChargeCategory}
                    onChange={(e) => u("customChargeCategory", e.target.value)}
                    className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
                  >
                    {Object.entries(chargeCategoryLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <Input
                    placeholder="Libellé (ex. Chaudière à condensation)"
                    value={form.customChargeLabel}
                    onChange={(e) => u("customChargeLabel", e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!form.customChargeLabel) return toast.error("Libellé requis");
                      setForm((p) => ({
                        ...p,
                        charges: [...p.charges, {
                          id: `custom-${Date.now()}`,
                          category: p.customChargeCategory,
                          label: p.customChargeLabel,
                          amount: 0,
                          enabled: true,
                          includeInCostBasis: true,
                        }],
                        customChargeLabel: "",
                      }));
                    }}
                  ><Plus className="size-4" /></Button>
                </div>
              </div>

              {enabledCharges.length > 0 && (
                <div className="rounded-lg bg-muted/30 border border-border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Total frais cochés</span>
                    <span className="numeric font-semibold">{formatEUR(totalCharges)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Dans le coût de revient</span>
                    <span className="numeric">{formatEUR(costBasisCharges)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4">
              <p className="text-xs text-muted-foreground">Vérifie avant de créer. Tout sera enregistré d'un coup (bien + prêt + frais).</p>

              <section className="rounded-lg border border-border p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Home className="size-4" /> Bien</h3>
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Nom</dt><dd className="font-medium">{form.name || "—"}</dd>
                  <dt className="text-muted-foreground">Adresse</dt><dd>{form.address || "—"}</dd>
                  <dt className="text-muted-foreground">Date d'acte</dt><dd>{new Date(form.signingDate).toLocaleDateString("fr-BE")}</dd>
                  <dt className="text-muted-foreground">Prix d'achat</dt><dd className="numeric font-medium">{formatEUR(Number(form.purchasePrice || 0))}</dd>
                  <dt className="text-muted-foreground">Valeur actuelle</dt><dd className="numeric">{formatEUR(Number(form.currentValue || form.purchasePrice || 0))}</dd>
                  {form.surfaceSqm && <><dt className="text-muted-foreground">Surface</dt><dd>{form.surfaceSqm} m²</dd></>}
                  <dt className="text-muted-foreground">Appréciation annuelle</dt><dd>{form.annualAppreciationPct}%</dd>
                  <dt className="text-muted-foreground">Frais mensuels</dt><dd className="numeric">{formatEUR(Number(form.monthlyFees || 0))}</dd>
                </dl>
              </section>

              <section className="rounded-lg border border-border p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Landmark className="size-4" /> Prêt hypothécaire</h3>
                {!form.hasMortgage ? <p className="text-sm text-muted-foreground">Aucun prêt associé</p> : (
                  <>
                    <dl className="grid grid-cols-2 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">Prêteur</dt><dd>{form.lender || "—"}</dd>
                      <dt className="text-muted-foreground">Capital</dt><dd className="numeric font-medium">{formatEUR(Number(form.principal || 0))}</dd>
                      <dt className="text-muted-foreground">Taux</dt><dd>{form.interestRatePct}%</dd>
                      <dt className="text-muted-foreground">Durée</dt><dd>{form.termMonths} mois ({Math.round(Number(form.termMonths || 0) / 12 * 10) / 10} ans)</dd>
                      <dt className="text-muted-foreground">Mensualité</dt><dd className="numeric font-medium">{formatEUR(Number(form.monthlyPayment || 0))}</dd>
                      <dt className="text-muted-foreground">Solde restant</dt><dd className="numeric">{formatEUR(Number(form.remainingBalance || form.principal || 0))}</dd>
                    </dl>
                    {form.pdfExtraction && (
                      <div className="mt-3 flex items-center gap-2 rounded-md bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 px-3 py-2 text-sm">
                        <FileCheck className="size-4 text-[var(--color-success)]" />
                        <span>Tableau d'amortissement : <strong>{form.pdfExtraction.rows.length} échéances</strong> seront importées (total intérêts {formatEUR(form.pdfExtraction.totalInterest)})</span>
                      </div>
                    )}
                  </>
                )}
              </section>

              <section className="rounded-lg border border-border p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Receipt className="size-4" /> Frais one-shot ({enabledCharges.length})</h3>
                {enabledCharges.length === 0 ? <p className="text-sm text-muted-foreground">Aucun frais</p> : (
                  <>
                    <ul className="divide-y divide-border">
                      {enabledCharges.map((c) => (
                        <li key={c.id} className="flex items-center justify-between py-1.5 text-sm">
                          <span>
                            {c.label}
                            {!c.includeInCostBasis && <span className="ml-2 text-xs text-muted-foreground">(hors coût)</span>}
                          </span>
                          <span className="numeric font-medium">{formatEUR(c.amount)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                      <span>Total</span>
                      <span className="numeric">{formatEUR(totalCharges)}</span>
                    </div>
                  </>
                )}
              </section>

              <section className="rounded-lg bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Coût de revient total estimé</span>
                  <span className="numeric font-semibold">{formatEUR(Number(form.purchasePrice || 0) + costBasisCharges)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Prix d'achat + frais inclus dans le coût de revient. C'est la base qui sera utilisée pour calculer la plus-value nette.
                </p>
              </section>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" onClick={prev} disabled={step === 0 || pending}>
            <ChevronLeft className="size-4" /> Précédent
          </Button>
          <div className="text-xs text-muted-foreground">Étape {step + 1} / {steps.length}</div>
          {step < steps.length - 1 ? (
            <Button onClick={next} disabled={pending}>
              Suivant <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={pending} className="bg-[var(--color-success)] hover:bg-[var(--color-success)]/90">
              <Check className="size-4" /> Créer tout le dossier
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
