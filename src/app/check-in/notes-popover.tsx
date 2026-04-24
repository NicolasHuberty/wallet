"use client";

import { useState, useTransition } from "react";
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
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setNote("");
    start(async () => {
      try {
        await onSave(null);
        toast.success("Note supprimée");
        setOpen(false);
        setConfirmDelete(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            className={`size-8 shrink-0 md:size-6 ${hasNote ? "text-[var(--chart-1)]" : "text-muted-foreground/60"}`}
            title={hasNote ? "Voir / modifier la note" : "Ajouter une note"}
          />
        }
      >
        {hasNote ? (
          <MessageSquareText className="size-4 md:size-3.5" />
        ) : (
          <MessageSquare className="size-4 md:size-3.5" />
        )}
      </SheetTrigger>
      <SheetContent desktopSize="md:max-w-md">
        <SheetHeader>
          <SheetTitle className="truncate">Note · {itemLabel}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            placeholder="Ex. paiement annuel divisé par 12, à renégocier en juillet…"
            className="text-base md:text-sm"
            autoFocus
          />
        </SheetBody>
        <SheetFooter className="flex items-center justify-between md:justify-between">
          {hasNote ? (
            <Button
              type="button"
              variant={confirmDelete ? "destructive" : "ghost"}
              size="sm"
              className={confirmDelete ? "" : "text-destructive"}
              disabled={pending}
              onClick={remove}
            >
              {confirmDelete ? "Confirmer ?" : "Supprimer"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-1 justify-end gap-2 md:flex-none">
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
              disabled={pending}
              className="flex-1 md:flex-none"
            >
              {pending ? "…" : "Enregistrer"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
