"use client";

/**
 * SortDropdown — small native <select> wired to Forge's `sort` param on
 * /api/auctions. Default = "Termina antes" (endsAt_asc) — urgency-first.
 *
 * Rendered next to the result-count header.
 */

import * as React from "react";
import { ArrowUpDown } from "lucide-react";
import { SORT_OPTIONS, SortValue } from "./filters";
import { cn } from "@/lib/utils";

export function SortDropdown({
  value,
  onChange,
  className,
}: {
  value: SortValue;
  onChange: (v: SortValue) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-[--color-ink-secondary]",
        className,
      )}
    >
      <ArrowUpDown className="h-3.5 w-3.5 text-[--color-ink-tertiary]" aria-hidden="true" />
      <span className="sr-only">Ordenar por</span>
      <span aria-hidden="true">Ordenar:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortValue)}
        className="rounded-md border border-[--color-hairline] bg-white px-2 py-1 text-xs text-[--color-ink-primary] focus:outline-none focus:border-[--color-brand] focus:ring-2 focus:ring-[--color-brand]/15"
        aria-label="Ordenar resultados"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
