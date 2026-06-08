"use client";

/**
 * HomeQuickFilterChips — the steering wheel for the home marquee carousel.
 *
 * Sits directly ABOVE the marquee and drives WHICH cards drift across it. A
 * chip click flips a controlled value the parent passes back into the
 * marquee's data feed (refetches `/api/auctions/recent?category|province|when`).
 *
 * Properties-first by design — Viviendas is hero / pre-selected emphasis,
 * other property categories sit left of vehicles. Vehicles + arte live
 * behind a "Más" trigger (we surface only the canonical Viviendas /
 * Otros inmuebles / Terrenos / Locales / Garajes / Trasteros / Provincia /
 * Termina esta semana in the primary row).
 *
 * Behaviour:
 *   - Category: SINGLE-select. Tapping the active category unsets it.
 *   - Province: opens a compact `<select>` styled as a chip. Single-select.
 *     Stacks on top of any category chip (server applies both).
 *   - When: single-select toggle for "termina esta semana".
 *
 * Each chip is a real `<button>` (or `<select>`) — full keyboard support,
 * `aria-pressed` reflects state, `min-h-[36px]` keeps tap targets honest.
 * `cursor-pointer` on every clickable surface (project standing rule).
 */

import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Canonical accented Spanish DB labels — `/api/auctions/recent?category=...`
 * does exact-match against these. Order is the visual L→R chip order
 * (properties-first; Viviendas leads).
 */
const PRIMARY_CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "Viviendas", label: "Viviendas" },
  { id: "Otros inmuebles", label: "Otros inmuebles" },
  { id: "Terrenos", label: "Terrenos" },
  { id: "Locales", label: "Locales" },
  { id: "Garajes", label: "Garajes" },
  { id: "Trasteros", label: "Trasteros" },
];

/** "Más" reveals the long tail (vehicles + arte). Same DB-label exact-match. */
const SECONDARY_CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "Fincas rústicas", label: "Fincas rústicas" },
  { id: "Naves industriales", label: "Naves industriales" },
  { id: "Turismos", label: "Turismos" },
  { id: "Motocicletas", label: "Motocicletas" },
  { id: "Vehículos Industriales", label: "Vehículos industriales" },
  { id: "Barcos", label: "Barcos" },
  { id: "Maquinaria", label: "Maquinaria" },
  { id: "Joyas", label: "Joyas" },
  { id: "Arte", label: "Arte" },
];

/**
 * Provinces commonly used as filter targets. Server does exact-match so we
 * pass them through unchanged. This is the same list the listing page uses
 * (Spain's 52 provincias) — kept compact here, full picker is on /subastas.
 */
const PROVINCES: ReadonlyArray<string> = [
  "A Coruña", "Álava", "Albacete", "Alicante", "Almería", "Asturias",
  "Ávila", "Badajoz", "Balears, Illes", "Barcelona", "Bizkaia", "Burgos",
  "Cáceres", "Cádiz", "Cantabria", "Castellón", "Ceuta", "Ciudad Real",
  "Córdoba", "Cuenca", "Gipuzkoa", "Girona", "Granada", "Guadalajara",
  "Huelva", "Huesca", "Jaén", "La Rioja", "Las Palmas", "León", "Lleida",
  "Lugo", "Madrid", "Málaga", "Melilla", "Murcia", "Navarra", "Ourense",
  "Palencia", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife",
  "Segovia", "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo",
  "Valencia", "Valladolid", "Zamora", "Zaragoza",
];

export type HomeChipsValue = {
  /** Exact DB category label, or null = no category filter. */
  category: string | null;
  /** Exact DB province label, or null = no province filter. */
  province: string | null;
  /** "termina-esta-semana" or null. Maps to /api/auctions/recent?when=... */
  when: "termina-esta-semana" | null;
};

export const EMPTY_CHIPS_VALUE: HomeChipsValue = {
  category: null,
  province: null,
  when: null,
};

export type HomeQuickFilterChipsProps = {
  value: HomeChipsValue;
  onChange: (next: HomeChipsValue) => void;
  /** Count of cards currently drifting. Decorative — shown next to "Todas". */
  driftingCount?: number;
  className?: string;
};

export function HomeQuickFilterChips({
  value,
  onChange,
  driftingCount,
  className,
}: HomeQuickFilterChipsProps) {
  const [showMore, setShowMore] = React.useState(false);

  const isAllActive =
    value.category === null && value.province === null && value.when === null;

  const setCategory = (id: string) => {
    onChange({ ...value, category: value.category === id ? null : id });
  };

  const setProvince = (p: string) => {
    onChange({ ...value, province: p === "" ? null : p });
  };

  const toggleWhen = () => {
    onChange({
      ...value,
      when: value.when === "termina-esta-semana" ? null : "termina-esta-semana",
    });
  };

  const clearAll = () => onChange(EMPTY_CHIPS_VALUE);

  return (
    <section
      aria-label="Filtrar el carrusel de subastas"
      className={cn("w-full", className)}
    >
      <div
        className={cn(
          // Mobile: snap-scroll. Desktop: wrap.
          "flex items-center gap-2 overflow-x-auto pb-1 snap-x snap-mandatory -mx-4 px-4",
          "md:flex-wrap md:overflow-visible md:mx-0 md:px-0 md:pb-0",
        )}
      >
        {/* "Todas" — clears all chips. Per Dennis (2026-06-03): no count
            pill here. The number we had was the carousel's fetch cap (30),
            not the true active total, so it read as a misleading site count.
            `driftingCount` is intentionally not rendered. */}
        <button
          type="button"
          onClick={clearAll}
          aria-pressed={isAllActive}
          className={chipClass(isAllActive)}
        >
          <span>Todas</span>
        </button>

        {/* Primary properties-first category chips */}
        {PRIMARY_CATEGORIES.map((cat) => {
          const active = value.category === cat.id;
          const isViviendas = cat.id === "Viviendas";
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              aria-pressed={active}
              className={cn(
                chipClass(active),
                // Viviendas gets a subtle emphasis ring when not active to signal
                // "this is the hero category" — the properties-first thesis made
                // visual without screaming.
                !active && isViviendas && "ring-1 ring-[var(--color-brand-soft)]/40",
              )}
              title={cat.label}
            >
              {cat.label}
            </button>
          );
        })}

        {/* "Más" — reveals long-tail categories inline. */}
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          aria-controls="home-chips-more"
          className={chipClass(false)}
        >
          <span>Más</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              showMore && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>

        {/* Province picker — styled as a chip; tap target is the whole pill. */}
        <label className={cn(chipClass(value.province !== null), "relative cursor-pointer pr-7")}>
          <span>{value.province ?? "Provincia"}</span>
          <ChevronDown
            className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
            aria-hidden="true"
          />
          <select
            value={value.province ?? ""}
            onChange={(e) => setProvince(e.target.value)}
            aria-label="Filtrar por provincia"
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          >
            <option value="">Todas las provincias</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        {/* "Termina esta semana" time chip. */}
        <button
          type="button"
          onClick={toggleWhen}
          aria-pressed={value.when === "termina-esta-semana"}
          className={chipClass(value.when === "termina-esta-semana")}
        >
          Termina esta semana
        </button>

        {/* Clear-all affordance when any chip is set. */}
        {!isAllActive && (
          <button
            type="button"
            onClick={clearAll}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium min-h-[36px]",
              "text-[var(--color-ink-tertiary)] hover:text-[var(--color-ink-primary)] cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40",
            )}
            aria-label="Limpiar filtros"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Limpiar
          </button>
        )}
      </div>

      {/* Long-tail row, revealed by "Más". */}
      {showMore && (
        <div
          id="home-chips-more"
          className={cn(
            "mt-2 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory -mx-4 px-4",
            "md:flex-wrap md:overflow-visible md:mx-0 md:px-0 md:pb-0",
          )}
        >
          {SECONDARY_CATEGORIES.map((cat) => {
            const active = value.category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                aria-pressed={active}
                className={chipClass(active)}
                title={cat.label}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── styling helpers (kept local so the marquee + chips share one visual lang) ── */

function chipClass(active: boolean): string {
  return cn(
    "snap-start shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px] cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40",
    active
      ? "border-[var(--color-action)] bg-[var(--color-action-soft)] text-[var(--color-ink-primary)] shadow-sm"
      : "border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink-primary)] hover:border-[var(--color-action)]/40 hover:bg-[var(--color-action-soft)]/40",
  );
}

function countPillClass(active: boolean): string {
  return cn(
    "tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
    active
      ? "bg-[var(--color-surface)] text-[var(--color-ink-primary)]"
      : "bg-[var(--color-surface-muted)] text-[var(--color-ink-secondary)]",
  );
}
