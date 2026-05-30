"use client";

/**
 * SimpleFilters — the four-question filter sidebar (¿Qué? ¿Dónde? ¿Cuándo? ¿Cuánto?).
 *
 * Per UX vision (doc 05): this is the *default* surface. 80% of users only ever
 * touch these four. The other 30+ filters live behind "Más filtros" in
 * <AdvancedFiltersSheet />.
 *
 * Behavior:
 *   - Controlled component: parent owns ObservatoryFilters state.
 *   - Radio/dropdown changes fire immediately.
 *   - Price inputs debounce 300ms via onBlur (parent does the work).
 *   - "Más filtros" button is provided as a slot so the parent can mount the
 *     advanced sheet however it prefers.
 */

import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import {
  ObservatoryFilters,
  SIMPLE_KIND_OPTIONS,
  SIMPLE_WHEN_OPTIONS,
  ALL_STATUSES,
  SORT_OPTIONS,
  DEFAULT_SORT,
} from "./filters";
import { cn } from "@/lib/utils";

export type SimpleFiltersProps = {
  filters: ObservatoryFilters;
  /** All known provinces (typed list from /api/auctions/counts). */
  provinces: string[];
  /** Municipalities of the currently-selected province (or empty list). */
  municipalities: string[];
  onChange: (next: Partial<ObservatoryFilters>) => void;
  onClear: () => void;
  /** Opens the advanced sheet. */
  onMoreClick: () => void;
  /** Total result count of the current filter set — drives the "ver N" hint. */
  resultCount?: number | null;
  className?: string;
};

export function SimpleFilters({
  filters,
  provinces,
  municipalities,
  onChange,
  onClear,
  onMoreClick,
  resultCount,
  className,
}: SimpleFiltersProps) {
  // Local price inputs so we don't spam the parent during typing.
  const [minStr, setMinStr] = React.useState(
    filters.priceMin == null ? "" : String(filters.priceMin),
  );
  const [maxStr, setMaxStr] = React.useState(
    filters.priceMax == null ? "" : String(filters.priceMax),
  );

  React.useEffect(() => {
    setMinStr(filters.priceMin == null ? "" : String(filters.priceMin));
    setMaxStr(filters.priceMax == null ? "" : String(filters.priceMax));
  }, [filters.priceMin, filters.priceMax]);

  const commitPrice = () => {
    const parseN = (s: string) => {
      const t = s.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };
    onChange({
      priceMin: parseN(minStr),
      priceMax: parseN(maxStr),
    });
  };

  return (
    <aside
      className={cn(
        "rounded-lg border border-[--color-hairline] bg-[--color-surface] p-4 md:p-5 space-y-5",
        className,
      )}
      aria-label="Filtros"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-base text-[--color-ink-primary]">Filtros</h2>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-[--color-ink-tertiary] hover:text-[--color-brand] focus-visible:outline-none focus-visible:underline transition-colors"
        >
          Limpiar
        </button>
      </div>

      {/* ¿Qué buscas? */}
      <FilterBlock label="¿Qué buscas?">
        <div className="flex flex-wrap gap-1.5">
          {SIMPLE_KIND_OPTIONS.map((opt) => {
            const active = filters.kind === opt.id && filters.categories.length === 0;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange({ kind: opt.id, categories: [] })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40",
                  active
                    ? "border-[--color-brand] bg-[--color-brand] text-white"
                    : "border-[--color-hairline] text-[--color-ink-secondary] hover:border-[--color-brand]/40 hover:text-[--color-brand]",
                )}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </FilterBlock>

      {/* ¿Dónde? */}
      <FilterBlock label="¿Dónde?">
        <div className="space-y-2">
          <select
            value={filters.province}
            onChange={(e) => onChange({ province: e.target.value, municipality: "" })}
            className="tnum w-full rounded-md border border-[--color-hairline] bg-white px-3 py-2 text-sm text-[--color-ink-primary] focus:outline-none focus:border-[--color-brand] focus:ring-2 focus:ring-[--color-brand]/15"
            aria-label="Provincia"
          >
            <option value="">Todas las provincias</option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {filters.province && (
            <select
              value={filters.municipality}
              onChange={(e) => onChange({ municipality: e.target.value })}
              className="tnum w-full rounded-md border border-[--color-hairline] bg-white px-3 py-2 text-sm text-[--color-ink-primary] focus:outline-none focus:border-[--color-brand] focus:ring-2 focus:ring-[--color-brand]/15"
              aria-label="Municipio"
              disabled={municipalities.length === 0}
            >
              <option value="">Todos los municipios</option>
              {municipalities.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>
      </FilterBlock>

      {/* ¿Cuándo? */}
      <FilterBlock label="¿Cuándo?">
        <div className="space-y-1.5">
          {SIMPLE_WHEN_OPTIONS.map((opt) => {
            const active = filters.when === opt.id && filters.statuses.length === 0;
            return (
              <label
                key={opt.id}
                className="flex items-center gap-2 cursor-pointer text-sm text-[--color-ink-primary]"
              >
                <input
                  type="radio"
                  name="when"
                  value={opt.id}
                  checked={active}
                  onChange={() => onChange({ when: opt.id, statuses: [] })}
                  className="h-3.5 w-3.5 accent-[--color-brand]"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </FilterBlock>

      {/* ¿Cuánto? */}
      <FilterBlock label="¿Cuánto?">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={minStr}
            onChange={(e) => setMinStr(e.target.value)}
            onBlur={commitPrice}
            placeholder="Min €"
            className="tnum w-full rounded-md border border-[--color-hairline] bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:border-[--color-brand] focus:ring-2 focus:ring-[--color-brand]/15"
            aria-label="Precio mínimo"
          />
          <span aria-hidden="true" className="text-[--color-ink-tertiary]">
            –
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={maxStr}
            onChange={(e) => setMaxStr(e.target.value)}
            onBlur={commitPrice}
            placeholder="Max €"
            className="tnum w-full rounded-md border border-[--color-hairline] bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:border-[--color-brand] focus:ring-2 focus:ring-[--color-brand]/15"
            aria-label="Precio máximo"
          />
        </div>
      </FilterBlock>

      {/* Más filtros + live count */}
      <div className="pt-2 hairline-t">
        <button
          type="button"
          onClick={onMoreClick}
          className="inline-flex items-center gap-2 text-sm font-medium text-[--color-brand] hover:underline focus-visible:outline-none focus-visible:underline"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Más filtros
        </button>
        {resultCount != null && (
          <p className="mt-3 text-xs text-[--color-ink-tertiary] tnum">
            <span className="font-semibold text-[--color-ink-primary]">
              {resultCount.toLocaleString("es-ES")}
            </span>{" "}
            subastas coinciden
          </p>
        )}
      </div>
    </aside>
  );
}

function FilterBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[--color-ink-tertiary]">
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * Filter chip strip — small horizontal list of active filters shown above
 * the result list. Each chip has an `×` to remove.
 */
export function ActiveFilterChips({
  filters,
  onChange,
  onClear,
}: {
  filters: ObservatoryFilters;
  onChange: (next: Partial<ObservatoryFilters>) => void;
  onClear: () => void;
}) {
  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (filters.kind !== "todo" && filters.categories.length === 0) {
    const opt = SIMPLE_KIND_OPTIONS.find((o) => o.id === filters.kind);
    if (opt) chips.push({ key: "kind", label: opt.label, onRemove: () => onChange({ kind: "todo" }) });
  }
  if (filters.province) {
    chips.push({
      key: "province",
      label: filters.province,
      onRemove: () => onChange({ province: "", municipality: "" }),
    });
  }
  if (filters.municipality) {
    chips.push({
      key: "municipality",
      label: filters.municipality,
      onRemove: () => onChange({ municipality: "" }),
    });
  }
  // ¿Cuándo? — always surface a chip when no explicit statuses[] is set, INCLUDING
  // the default "Activas ahora". This makes the invisible default visible. Removing
  // it expands to all 6 statuses (effectively disabling the implicit status filter).
  if (filters.statuses.length === 0) {
    const opt = SIMPLE_WHEN_OPTIONS.find((o) => o.id === filters.when);
    if (opt) {
      chips.push({
        key: "when",
        label: opt.label,
        onRemove: () => onChange({ statuses: ALL_STATUSES.map((s) => s.id), when: "activas" }),
      });
    }
  }
  if (filters.priceMin != null) {
    chips.push({
      key: "pmin",
      label: `≥ ${filters.priceMin.toLocaleString("es-ES")} €`,
      onRemove: () => onChange({ priceMin: null }),
    });
  }
  if (filters.priceMax != null) {
    chips.push({
      key: "pmax",
      label: `≤ ${filters.priceMax.toLocaleString("es-ES")} €`,
      onRemove: () => onChange({ priceMax: null }),
    });
  }
  for (const c of filters.categories) {
    chips.push({
      key: `cat-${c}`,
      label: c,
      onRemove: () => onChange({ categories: filters.categories.filter((x) => x !== c) }),
    });
  }
  for (const s of filters.statuses) {
    chips.push({
      key: `st-${s}`,
      label: s,
      onRemove: () => onChange({ statuses: filters.statuses.filter((x) => x !== s) }),
    });
  }
  for (const t of filters.types) {
    chips.push({
      key: `tp-${t}`,
      label: t,
      onRemove: () => onChange({ types: filters.types.filter((x) => x !== t) }),
    });
  }
  if (filters.search) {
    chips.push({
      key: "search",
      label: `"${filters.search}"`,
      onRemove: () => onChange({ search: "" }),
    });
  }
  if (filters.sort && filters.sort !== DEFAULT_SORT) {
    const opt = SORT_OPTIONS.find((o) => o.id === filters.sort);
    if (opt) {
      chips.push({
        key: "sort",
        label: `Orden: ${opt.label}`,
        onRemove: () => onChange({ sort: DEFAULT_SORT }),
      });
    }
  }
  if (filters.pctTasacionMax != null) {
    chips.push({
      key: "pctTasacion",
      label: `≤ ${filters.pctTasacionMax}% tasación`,
      onRemove: () => onChange({ pctTasacionMax: null }),
    });
  }
  if (filters.endsBefore) {
    const d = new Date(filters.endsBefore);
    const fmt = isNaN(d.getTime())
      ? filters.endsBefore
      : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    chips.push({
      key: "endsBefore",
      label: `Termina antes del ${fmt}`,
      onRemove: () => onChange({ endsBefore: null }),
    });
  }
  if (filters.hasImage) {
    chips.push({
      key: "hasImage",
      label: "Con foto",
      onRemove: () => onChange({ hasImage: false }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full bg-[--color-surface-muted] border border-[--color-hairline] px-2.5 py-0.5 text-xs text-[--color-ink-secondary]"
        >
          {c.label}
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Quitar filtro ${c.label}`}
            className="ml-0.5 text-[--color-ink-tertiary] hover:text-[--color-brand] focus-visible:outline-none focus-visible:text-[--color-brand]"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-[--color-ink-tertiary] hover:text-[--color-brand] focus-visible:outline-none focus-visible:underline"
      >
        Limpiar todos
      </button>
    </div>
  );
}
