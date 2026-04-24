"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { saveHousehold, saveMember, deleteMember } from "./actions";
import { Plus, Trash2, Pencil, Check, X, Users } from "lucide-react";

type Household = { id: string; name: string; baseCurrency: string };
type Member = { id: string; householdId: string; name: string; email: string | null; color: string };

export function SettingsClient({ household, members }: { household: Household; members: Member[] }) {
  const [h, setH] = useState(household);
  const [pending, start] = useTransition();

  function saveH() {
    start(async () => {
      await saveHousehold({ id: h.id, name: h.name, baseCurrency: h.baseCurrency });
      toast.success("Ménage mis à jour");
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:gap-6">
      {/* ── Ménage ── */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <header className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="text-base font-semibold">Ménage</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Identifiant et devise utilisés dans toute l&apos;app.
          </p>
        </header>
        <div className="flex flex-col divide-y divide-border">
          <SettingRow
            label="Nom du ménage"
            description="Affiché dans la barre latérale et en en-tête."
            control={
              <Input
                value={h.name}
                onChange={(e) => setH({ ...h, name: e.target.value })}
                className="h-11 sm:max-w-xs"
              />
            }
          />
          <SettingRow
            label="Devise de base"
            description="Tous les montants sont affichés dans cette devise."
            control={
              <Input
                value={h.baseCurrency}
                onChange={(e) => setH({ ...h, baseCurrency: e.target.value.toUpperCase() })}
                className="h-11 w-full sm:w-28"
                maxLength={4}
                inputMode="text"
                autoCapitalize="characters"
              />
            }
          />
        </div>
        <footer className="flex justify-end border-t border-border bg-muted/30 px-4 py-3 sm:px-6">
          <Button onClick={saveH} disabled={pending} className="h-11 min-w-[120px]">
            {pending ? "…" : "Enregistrer"}
          </Button>
        </footer>
      </section>

      {/* ── Membres ── */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Membres</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {members.length}
            </span>
          </div>
          <MemberForm householdId={h.id} />
        </header>
        <ul className="divide-y divide-border">
          {members.map((m) => <MemberRow key={m.id} member={m} />)}
          {members.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">
              Aucun membre pour l&apos;instant.
            </li>
          )}
        </ul>
      </section>

      {/* ── Zone sensible ── */}
      <section className="rounded-2xl border border-destructive/30 bg-destructive/5 overflow-hidden">
        <header className="border-b border-destructive/30 px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="text-base font-semibold text-destructive">Zone sensible</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Actions irréversibles. Réfléchis à deux fois avant de cliquer.
          </p>
        </header>
        <div className="flex flex-col divide-y divide-destructive/20">
          <SettingRow
            label="Exporter mes données"
            description="Téléchargement JSON — bientôt disponible."
            control={
              <Button variant="outline" disabled className="h-11 sm:min-w-[140px]">
                Indisponible
              </Button>
            }
          />
          <SettingRow
            label="Supprimer mon compte"
            description="Efface le ménage, comptes, snapshots et prêts. Définitif."
            control={
              <Button
                variant="destructive"
                disabled
                className="h-11 sm:min-w-[140px]"
              >
                <Trash2 className="size-4" />
                Bientôt
              </Button>
            }
          />
        </div>
      </section>
    </div>
  );
}

function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <div className="w-full sm:w-auto sm:max-w-[60%] sm:flex-shrink-0">{control}</div>
    </div>
  );
}

function MemberForm({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [pending, start] = useTransition();

  function submit() {
    if (!name) { toast.error("Nom requis"); return; }
    start(async () => {
      await saveMember({ householdId, name, email: email || null, color });
      toast.success("Membre ajouté");
      setName(""); setEmail(""); setColor("#6366f1"); setOpen(false);
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} className="h-9">
        <Plus className="size-4" /> Ajouter
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
      <Input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} className="h-11 flex-1 sm:w-32 sm:flex-none" autoFocus />
      <Input placeholder="Email (optionnel)" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 flex-1 sm:w-48 sm:flex-none" />
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent"
          aria-label="Couleur"
        />
        <Button size="sm" onClick={submit} disabled={pending} className="h-11 flex-1 sm:flex-none">
          <Check className="size-4" /> Ajouter
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={pending} className="h-11">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: Member }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email ?? "");
  const [color, setColor] = useState(member.color);

  function save() {
    start(async () => {
      await saveMember({ id: member.id, householdId: member.householdId, name, email: email || null, color });
      toast.success("Mis à jour");
      setEditing(false);
    });
  }

  function remove() {
    if (!confirm(`Supprimer ${member.name} ?`)) return;
    start(async () => { await deleteMember(member.id); toast.success("Supprimé"); });
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 flex-1 sm:w-32 sm:flex-none" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 flex-1 sm:w-48 sm:flex-none" type="email" inputMode="email" />
        <div className="flex items-center gap-2">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent" aria-label="Couleur" />
          <Button size="sm" onClick={save} disabled={pending} className="h-11 flex-1 sm:flex-none">
            <Check className="size-4" /> OK
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending} className="h-11">
            <X className="size-4" />
          </Button>
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: member.color }}
          aria-hidden
        >
          {member.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate font-medium">{member.name}</div>
          {member.email && <div className="truncate text-xs text-muted-foreground">{member.email}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" className="size-11" onClick={() => setEditing(true)} disabled={pending} aria-label="Modifier">
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-11 text-destructive hover:text-destructive" onClick={remove} disabled={pending} aria-label="Supprimer">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}
