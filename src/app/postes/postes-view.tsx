"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Repeat, CalendarClock, Receipt, Tag, Link2, ChevronRight } from "lucide-react";
import { formatEUR } from "@/lib/format";
import { PosteDialog, type PropertyOption } from "@/components/poste-dialog";
import type { Poste, PosteKind } from "@/lib/postes";

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: "hebdo", biweekly: "bimensuel", monthly: "mensuel",
  quarterly: "trimestriel", yearly: "annuel",
};

const SECTIONS: { kind: PosteKind; title: string; hint: string; icon: typeof Repeat }[] = [
  { kind: "variable", title: "Enveloppes variables", hint: "Budgets étalés au fil du mois", icon: Repeat },
  { kind: "fixed", title: "Charges fixes", hint: "Échéances récurrentes datées", icon: CalendarClock },
  { kind: "oneoff", title: "Frais ponctuels", hint: "Dépenses exceptionnelles", icon: Receipt },
];

export function PostesView({
  postes,
  properties,
}: {
  postes: Poste[];
  properties: PropertyOption[];
}) {
  return (
    <div className="space-y-6">
      {SECTIONS.map((s) => {
        const items = postes.filter((p) => p.kind === s.kind);
        const total = items.reduce((acc, p) => acc + p.amount, 0);
        const Icon = s.icon;
        return (
          <section key={s.kind} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="size-4 text-muted-foreground" /> {s.title}
                  <span className="text-xs font-normal text-muted-foreground">· {s.hint}</span>
                </h2>
              </div>
              <PosteDialog
                defaultKind={s.kind}
                properties={properties}
                trigger={
                  <Button size="sm" variant="outline">
                    <Plus className="size-3.5" /> Ajouter
                  </Button>
                }
              />
            </div>

            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                Aucun poste ici pour l&apos;instant.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                {items.map((p) => (
                  <Link
                    key={p.id}
                    href={`/postes/${p.id}`}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.label}</span>
                        {!p.active && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            en pause
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        {p.kind === "fixed" && (
                          <span>{FREQUENCY_LABEL[p.frequency ?? "monthly"]} · jour {p.dayOfMonth ?? 1}</span>
                        )}
                        {p.kind === "variable" && <span>{FREQUENCY_LABEL[p.cadence ?? "monthly"] ?? "mensuel"}</span>}
                        {(p.txCategories.length > 0 || p.counterpartyPatterns.length > 0) && (
                          <span className="flex items-center gap-1">
                            <Link2 className="size-3" />
                            {p.txCategories.length + p.counterpartyPatterns.length} règle(s)
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Tag className="size-3" /> {p.category}
                        </span>
                      </div>
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="numeric tabular-nums font-semibold">{formatEUR(p.amount)}</span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </span>
                  </Link>
                ))}
                <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
                  <span>{items.length} poste(s)</span>
                  <span className="numeric tabular-nums">Total {formatEUR(total)}</span>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
