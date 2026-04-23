"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, MessageSquareText } from "lucide-react";
import { toast } from "sonner";

export function NotesPopover({
  itemLabel,
  existingNote,
  onSave,
}: {
  itemLabel: string;
  existingNote: string | null;
  onSave: (note: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(existingNote ?? "");
  const [pending, start] = useTransition();

  const hasNote = Boolean(existingNote && existingNote.trim());

  function submit() {
    start(async () => {
      try {
        await onSave(note.trim() || null);
        toast.success("Note enregistrée");
        setOpen(false);
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
            className={`size-6 shrink-0 ${hasNote ? "text-[var(--chart-1)]" : "text-muted-foreground/60"}`}
            title={hasNote ? "Voir / modifier la note" : "Ajouter une note"}
          />
        }
      >
        {hasNote ? (
          <MessageSquareText className="size-3.5" />
        ) : (
          <MessageSquare className="size-3.5" />
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">Note · {itemLabel}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Ex. paiement annuel divisé par 12, à renégocier en juillet…"
          />
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {hasNote && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={pending}
              onClick={() => {
                setNote("");
                start(async () => {
                  try {
                    await onSave(null);
                    toast.success("Note supprimée");
                    setOpen(false);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                });
              }}
            >
              Supprimer
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "…" : "Enregistrer"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InlineNote({ note }: { note: string | null }) {
  if (!note || !note.trim()) return null;
  return (
    <div className="mt-1 rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-1 text-[11px] italic text-muted-foreground">
      {note}
    </div>
  );
}
