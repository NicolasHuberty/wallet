"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatEUR, formatDateFR } from "@/lib/format";
import { addEnvelopeRule } from "../actions";
import { previewPosteMatches } from "@/app/postes/actions";
import type { PostePreview } from "@/lib/postes";

type EnvelopeOption = { id: string; label: string };

/**
 * Création d'une règle de rapprochement : l'utilisateur saisit lui-même le motif
 * (texte recherché dans le libellé, insensible casse/accents) et choisit
 * l'enveloppe cible. Aperçu en direct des transactions qui seraient captées.
 */
export function RuleDialog({
  envelopes,
  initialPattern,
  initialEnvelopeId,
  trigger,
}: {
  envelopes: EnvelopeOption[];
  initialPattern: string;
  initialEnvelopeId?: string | null;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pattern, setPattern] = useState(initialPattern);
  const [envelopeId, setEnvelopeId] = useState<string | undefined>(
    initialEnvelopeId ?? envelopes[0]?.id,
  );
  const [preview, setPreview] = useState<PostePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [pending, start] = useTransition();

  const short = pattern.trim().length < 2;

  function onOpenChange(next: boolean) {
    if (next) {
      setPattern(initialPattern);
      setEnvelopeId(initialEnvelopeId ?? envelopes[0]?.id);
      setPreview(null);
    }
    setOpen(next);
  }

  // Aperçu en direct (débounce) à chaque changement de motif. Tout setState reste
  // dans le callback asynchrone (aucune mutation synchrone dans le corps de l'effet).
  useEffect(() => {
    if (!open || short) return;
    const p = pattern.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await previewPosteMatches({ counterpartyPatterns: [p], txCategories: [] });
        if (!cancelled) setPreview(res);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pattern, open, short]);

  function save() {
    const p = pattern.trim();
    if (p.length < 2) {
      toast.error("Motif trop court (2 caractères min).");
      return;
    }
    if (!envelopeId) {
      toast.error("Choisis une enveloppe.");
      return;
    }
    start(async () => {
      try {
        await addEnvelopeRule({ envelopeId, pattern: p });
        const env = envelopes.find((e) => e.id === envelopeId);
        toast.success(`Règle créée — « ${p} » → ${env?.label ?? "enveloppe"}`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? "Erreur");
      }
    });
  }

  const shownPreview = short ? null : preview;
  const sample = shownPreview?.matched ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Créer une règle de rapprochement</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Motif recherché</Label>
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="ex. delhaize, q8, bpost…"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              Texte cherché dans le libellé de la transaction (insensible à la casse et aux
              accents). Toute dépense contenant ce texte sera imputée à l&apos;enveloppe.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Enveloppe cible</Label>
            <Select value={envelopeId} onValueChange={(v) => setEnvelopeId(v ?? undefined)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choisir une enveloppe">
                  {(v) =>
                    (typeof v === "string" ? envelopes.find((e) => e.id === v)?.label : null) ??
                    "Choisir une enveloppe"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {envelopes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Aperçu d'impact */}
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Aperçu</span>
              <span className="text-muted-foreground">
                {short
                  ? "—"
                  : previewing
                    ? "calcul…"
                    : shownPreview
                      ? `${shownPreview.totalCount} transaction(s) · ${formatEUR(shownPreview.totalAmount)}`
                      : "—"}
              </span>
            </div>
            {sample.length > 0 ? (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {sample.slice(0, 8).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                  >
                    <span className="min-w-0 truncate">
                      <span className="mr-1.5 tabular-nums">{formatDateFR(m.date)}</span>
                      {m.label}
                    </span>
                    <span className="numeric shrink-0 tabular-nums">{formatEUR(m.amount)}</span>
                  </li>
                ))}
                {shownPreview && shownPreview.totalCount > Math.min(8, sample.length) && (
                  <li className="text-[10px] text-muted-foreground">
                    + {shownPreview.totalCount - Math.min(8, sample.length)} autres…
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {short
                  ? "Saisis au moins 2 caractères."
                  : previewing
                    ? ""
                    : "Aucune transaction ne correspond à ce motif."}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={pending} className="w-full">
            {pending ? "Création…" : "Créer la règle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
