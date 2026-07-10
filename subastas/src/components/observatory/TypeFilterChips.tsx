"use client";

/**
 * TypeFilterChips — fast row of "filter by BOE family" toggle chips.
 *
 * Mirrors the way Hacienda's own portal narrows by Tipo de Subasta. Sits
 * above the result list (below the PresetRow) so a user who came in via a
 * preset can still narrow further by family — and so the 5 BOE families now
 * in the data (Judicial / Hacienda / Otras tributarias / Notarial /
 * Administrativas) are surfaced as primary filter dimensions, not buried in
 * the Advanced Filters sheet.
 *
 * Behaviour:
 *   - Multi-select: clicking a chip toggles its membership in `filters.types`.
 *   - "Todos" clears the type filter.
 *   - Live counts (active + próxima apertura) load from /api/auctions once on
 *     mount via cheap limit=1 totalCount probes (mirrors PresetRow). The chip
 *     stays clickable while counts load — counts are an enrichment, not a
 *     gate.
 *   - Counts are only ever rendered when known; never a misleading "0".
 *
 * Visual: full-width row, snap-scroll on mobile, wrap on desktop. Active
 * chip uses the same `action-soft` fill used by the rest of the observatory
 * surface, with all-black text. No colored text on chips.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { AuctionType } from "@/types";
import { apiFetch } from "@/lib/api-path";
import { ObservatoryFilters, ALL_TYPES } from "./filters";
import { cn } from "@/lib/utils";

/** Which BOE families to surface as primary chips, in display order. */
const PRIMARY_TYPES: AuctionType[] = [
  "judicial",
  "aeat",
  "otras_tributarias",
  "notarial",
  "administrativas",
];

export type TypeFilterChipsProps = {
  filters: ObservatoryFilters;
  onChange: (next: Partial<ObservatoryFilters>) => void;
  className?: string;
};

type CountState = Partial<Record<AuctionType, number>>;

export function TypeFilterChips({
  filters,
  onChange,
  className,
}: TypeFilterChipsProps) {
  const t = useTranslations("listUi");
  const [counts, setCounts] = React.useState<CountState>({});

  // Live counts — one cheap totalCount probe per family, in parallel. Cached
  // server-side ~30s in /api/auctions. If any single one fails the rest still
  // render their numbers.
  React.useEffect(() => {
    let cancelled = false;
    const fetchCount = async (type: AuctionType): Promise<[AuctionType, number | null]> => {
      try {
        const res = await apiFetch(
          `/api/auctions?auctionTypes=${type}&statuses=celebrandose,proxima-apertura&page=1&limit=1`,
        );
        if (!res.ok) return [type, null];
        const body = await res.json();
        const n =
          typeof body?.pagination?.totalCount === "number" ? body.pagination.totalCount : null;
        return [type, n];
      } catch {
        return [type, null];
      }
    };
    (async () => {
      const results = await Promise.all(PRIMARY_TYPES.map(fetchCount));
      if (cancelled) return;
      const next: CountState = {};
      for (const [t, n] of results) {
        if (typeof n === "number") next[t] = n;
      }
      setCounts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleType = (id: AuctionType) => {
    const isActive = filters.types.includes(id);
    const nextTypes = isActive
      ? filters.types.filter((t) => t !== id)
      : [...filters.types, id];
    onChange({ types: nextTypes });
  };

  const allActive = filters.types.length === 0;

  return (
    <section
      aria-label={t("filtrarPorTipoDeSubasta")}
      className={cn("w-full", className)}
    >
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-tertiary)]">
        {t("tipoDeSubasta")}
      </div>
      <div
        className={cn(
          // Mobile: snap-scroll horizontal. Desktop: wrap.
          "flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory -mx-4 px-4",
          "md:flex-wrap md:overflow-visible md:mx-0 md:px-0 md:pb-0",
        )}
      >
        {/* "Todos" — clears the type filter. */}
        <button
          type="button"
          onClick={() => onChange({ types: [] })}
          aria-pressed={allActive}
          className={cn(
            "snap-start shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all min-h-[36px]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40",
            allActive
              ? "border-[var(--color-action)] bg-[var(--color-action-soft)] text-[var(--color-ink-primary)] shadow-sm"
              : "border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink-primary)] hover:border-[var(--color-action)]/40 hover:bg-[var(--color-action-soft)]/40",
          )}
        >
          {t("todos")}
        </button>
        {PRIMARY_TYPES.map((id) => {
          const meta = ALL_TYPES.find((t) => t.id === id);
          if (!meta) return null;
          const active = filters.types.includes(id);
          const count = counts[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggleType(id)}
              aria-pressed={active}
              className={cn(
                "snap-start shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all min-h-[36px]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40",
                active
                  ? "border-[var(--color-action)] bg-[var(--color-action-soft)] text-[var(--color-ink-primary)] shadow-sm"
                  : "border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink-primary)] hover:border-[var(--color-action)]/40 hover:bg-[var(--color-action-soft)]/40",
              )}
            >
              <span>{meta.label}</span>
              {typeof count === "number" && (
                <span
                  className={cn(
                    "tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    active
                      ? "bg-[var(--color-surface)] text-[var(--color-ink-primary)]"
                      : "bg-[var(--color-surface-muted)] text-[var(--color-ink-secondary)]",
                  )}
                  aria-label={t("countActivas", { count })}
                >
                  {count.toLocaleString("es-ES")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
