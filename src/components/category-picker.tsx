"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CUSTOM_SENTINEL = "__custom__";

/**
 * Category select that supports free-text custom categories.
 *
 * Accepts a list of presets + known user-custom values (e.g. extracted from
 * existing rows). If the current value is none of those, it is shown in the
 * dropdown with a "(personnalisé)" hint so the user can still re-select it.
 */
export function CategoryPicker({
  value,
  onChange,
  presets,
  presetLabels,
  extras = [],
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  presets: readonly string[];
  presetLabels: Record<string, string>;
  extras?: readonly string[];
  className?: string;
}) {
  const isPreset = presets.includes(value);
  const isExtra = !isPreset && extras.includes(value);
  const [mode, setMode] = useState<"select" | "custom">(
    isPreset || isExtra || value === "" ? "select" : "custom"
  );
  const [draft, setDraft] = useState(isPreset || isExtra ? "" : value);

  if (mode === "custom") {
    return (
      <div className={`flex items-center gap-1 ${className ?? ""}`}>
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="Ma catégorie"
          autoFocus
          className="h-8 text-xs"
        />
        <button
          type="button"
          className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => {
            setMode("select");
            setDraft("");
            onChange(presets[0] ?? "other");
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === CUSTOM_SENTINEL) {
          setMode("custom");
          setDraft("");
          onChange("");
        } else {
          onChange(v ?? "");
        }
      }}
    >
      <SelectTrigger className={`h-8 text-xs ${className ?? ""}`}>
        <SelectValue placeholder="Catégorie" />
      </SelectTrigger>
      <SelectContent>
        {presets.map((c) => (
          <SelectItem key={c} value={c}>
            {presetLabels[c] ?? c}
          </SelectItem>
        ))}
        {extras.length > 0 && (
          <>
            <div className="my-1 border-t border-border" />
            {extras.map((c) => (
              <SelectItem key={c} value={c}>
                {c}{" "}
                <span className="text-[10px] text-muted-foreground">(personnalisé)</span>
              </SelectItem>
            ))}
          </>
        )}
        <div className="my-1 border-t border-border" />
        <SelectItem value={CUSTOM_SENTINEL}>
          + Ajouter une catégorie personnalisée
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
