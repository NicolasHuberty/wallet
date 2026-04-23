"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { saveHousehold, saveMember, deleteMember } from "./actions";
import { Plus, Trash2 } from "lucide-react";

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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Ménage</h2>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-2"><Label>Nom</Label><Input value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} /></div>
          <div className="grid gap-2 max-w-[140px]"><Label>Devise de base</Label><Input value={h.baseCurrency} onChange={(e) => setH({ ...h, baseCurrency: e.target.value.toUpperCase() })} /></div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={saveH} disabled={pending}>Enregistrer</Button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-base font-semibold">Membres</h2>
          <MemberForm householdId={h.id} />
        </div>
        <ul className="divide-y divide-border">
          {members.map((m) => <MemberRow key={m.id} member={m} />)}
          {members.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Aucun membre.</li>}
        </ul>
      </section>
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

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Ajouter</Button>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} className="w-32" />
      <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-48" />
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded border border-border" />
      <Button size="sm" onClick={submit} disabled={pending}>Ajouter</Button>
      <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
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
      <li className="flex flex-wrap items-center gap-2 px-5 py-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="w-32" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} className="w-48" />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded border border-border" />
        <Button size="sm" onClick={save} disabled={pending}>OK</Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>Annuler</Button>
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between px-5 py-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-full text-[11px] font-medium text-white" style={{ backgroundColor: member.color }}>
          {member.name.charAt(0)}
        </span>
        <div>
          <div className="font-medium">{member.name}</div>
          {member.email && <div className="text-xs text-muted-foreground">{member.email}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={pending}>Modifier</Button>
        <Button variant="ghost" size="icon" className="text-destructive" onClick={remove} disabled={pending}><Trash2 className="size-4" /></Button>
      </div>
    </li>
  );
}
