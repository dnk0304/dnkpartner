"use client";

/**
 * SortDropdown — small native <select> wired to Forge's `sort` param on
 * /api/auctions. Default = "Termina antes" (endsAt_asc) — urgency-first.
 *
 * Rendered next to the result-count header.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("listUi");
  return (
    <label
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-secondary)]",
        className,
      )}
    >
      <ArrowUpDown className="h-3.5 w-3.5 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
      <span className="sr-only">{t("ordenarPor")}</span>
      <span aria-hidden="true">{t("ordenar")}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortValue)}
        className="rounded-md border border-[var(--color-hairline)] bg-white px-2 py-1 text-xs text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/15"
        aria-label={t("ordenarResultados")}
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
