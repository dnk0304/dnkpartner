"use client";

/**
 * FiltersSidebar — the persistent left filter column for the 2-col /subastas
 * (and SEO province/type/category) listing.
 *
 * Replaces the old "advanced-only" SimpleFilters sidebar; this surface is
 * ALWAYS visible on desktop. Mobile collapses it into a Filtros drawer that
 * the parent mounts (same controlled-component pattern as SimpleFilters).
 *
 * Groups, top → bottom (per Pixel brief):
 *   1. "Crear alerta" CTA — opens AlertsModal seeded with the current filter
 *      set (province / municipality / category).
 *   2. Origen — BOE family (Judicial / Hacienda / Otras tributarias /
 *      Notarial / Administrativas). Multi-select, maps to filters.types.
 *   3. Tipo de bien — broad kind buckets (Vivienda / Vehículo / Local /
 *      Terreno). Radio, maps to filters.kind.
 *   4. ¿Dónde? — province + municipality dropdowns.
 *   5. Valor Subasta — Mínimo / Máximo price inputs.
 *   6. Depósito — Mín / Máx. NOT WIRED today (no backend filter param).
 *      Rendered DISABLED with a "próximamente" hint. FLAGGED to Ken.
 *   7. Pujas — Cualquiera / Con puja / Sin puja. NOT WIRED today (no API
 *      filter param). Rendered DISABLED. FLAGGED to Ken.
 *   8. Fecha de finalización — endsBefore (wired). endsAfter NOT WIRED;
 *      hint-only. FLAGGED to Ken.
 *   9. Fecha de publicación — NOT WIRED today. Hint-only. FLAGGED to Ken.
 *
 * Locked dimension support: when `lockedFilter` is passed (SEO pages), the
 * corresponding control is rendered DISABLED so users can't escape the
 * scoped dimension via the sidebar — they must navigate to /subastas to
 * widen.
 */

import * as React from "react";
import { Bell, X } from "lucide-react";
import {
  ObservatoryFilters,
  SIMPLE_KIND_OPTIONS,
  ALL_TYPES,
  AUCTION_TYPE_LABEL,
  SORT_OPTIONS,
  DEFAULT_SORT,
  ALL_STATUSES,
} from "./filters";
import { AuctionType } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Which dimensions a parent page can LOCK so users can't widen out of them
 * from the sidebar. SEO routes lock province / a BOE-family auction type /
 * a category. /subastas locks nothing.
 */
export type LockedFilter = {
  province?: string;
  /** When set, the corresponding chip is forced active and the rest disabled. */
  type?: AuctionType;
  /** A precise category (e.g. "Viviendas"). When set, the kind row is replaced
   *  with a single locked label and the category list is fixed to this one. */
  category?: string;
};

export type FiltersSidebarProps = {
  filters: ObservatoryFilters;
  provinces: string[];
  municipalities: string[];
  onChange: (next: Partial<ObservatoryFilters>) => void;
  onClear: () => void;
  /** Opens AlertsModal seeded with the current filters. */
  onOpenAlerts: () => void;
  /** Locked dimension(s) from the parent route (SEO pages). */
  lockedFilter?: LockedFilter;
  resultCount?: number | null;
  className?: string;
  /** Hide the internal "Filtros / Limpiar" heading bar — the mobile drawer
   *  renders its own sticky header so the inner one would duplicate. */
  hideInternalHeading?: boolean;
};

export function FiltersSidebar({
  filters,
  provinces,
  municipalities,
  onChange,
  onClear,
  onOpenAlerts,
  lockedFilter,
  resultCount,
  className,
  hideInternalHeading,
}: FiltersSidebarProps) {
  // Local price strings — avoid spamming the parent during typing.
  const [pMin, setPMin] = React.useState(
    filters.priceMin == null ? "" : String(filters.priceMin),
  );
  const [pMax, setPMax] = React.useState(
    filters.priceMax == null ? "" : String(filters.priceMax),
  );
  React.useEffect(() => {
    setPMin(filters.priceMin == null ? "" : String(filters.priceMin));
    setPMax(filters.priceMax == null ? "" : String(filters.priceMax));
  }, [filters.priceMin, filters.priceMax]);
  const commitPrice = () => {
    const parseN = (s: string): number | null => {
      const t = s.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };
    onChange({ priceMin: parseN(pMin), priceMax: parseN(pMax) });
  };

  // Origen (BOE family) — multi-select. Locked when lockedFilter.type is set.
  const isTypeActive = (t: AuctionType) =>
    lockedFilter?.type === t || filters.types.includes(t);
  const toggleType = (t: AuctionType) => {
    if (lockedFilter?.type) return; // locked
    const next = filters.types.includes(t)
      ? filters.types.filter((x) => x !== t)
      : [...filters.types, t];
    onChange({ types: next });
  };

  const provinceLocked = Boolean(lockedFilter?.province);
  const categoryLocked = Boolean(lockedFilter?.category);

  return (
    <aside
      aria-label="Filtros"
      className={cn(
        // Tailwind v4 requires the bg-[var(--token)] form for CSS vars; the
        // `bg-[var(--token)]` shorthand silently emits `background-color: --token`
        // and paints nothing. Same fix everywhere a token-coloured background
        // is needed (see drawer panel in SubastasListClient).
        "rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)]",
        // Internal spacing: tight enough to read as a stack of groups.
        "p-4 md:p-5 space-y-5 text-sm",
        className,
      )}
    >
      {/* 1. CREAR ALERTA CTA — prominent at the top. Opens AlertsModal pre-
            seeded with the current filter set so the alert remembers what
            the user was looking at. */}
      <button
        type="button"
        onClick={onOpenAlerts}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 rounded-md",
          "bg-[var(--color-brand)] text-white font-medium px-4 py-2.5",
          "hover:bg-[var(--color-brand)]/90 active:bg-[var(--color-brand)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
          "transition-colors",
        )}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        Crear alerta
      </button>

      {!hideInternalHeading && (
        <div className="flex items-baseline justify-between hairline-t pt-4">
          <h2 className="font-serif text-base text-[var(--color-ink-primary)]">Filtros</h2>
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-[var(--color-ink-tertiary)] hover:text-[var(--color-brand)] focus-visible:outline-none focus-visible:underline transition-colors"
          >
            Limpiar
          </button>
        </div>
      )}

      {/* 2. ORIGEN — BOE family (vertical list, not horizontal chips). */}
      <FilterBlock label="Origen">
        <div className="space-y-1">
          {(["judicial", "aeat", "otras_tributarias", "notarial", "administrativas"] as AuctionType[]).map(
            (t) => {
              const meta = ALL_TYPES.find((x) => x.id === t);
              if (!meta) return null;
              const active = isTypeActive(t);
              const disabled = Boolean(lockedFilter?.type) && lockedFilter?.type !== t;
              return (
                <label
                  key={t}
                  className={cn(
                    "flex items-center gap-2 cursor-pointer text-[var(--color-ink-primary)]",
                    disabled && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                    checked={active}
                    disabled={disabled}
                    onChange={() => toggleType(t)}
                  />
                  <span>{meta.label}</span>
                </label>
              );
            },
          )}
        </div>
      </FilterBlock>

      {/* 3. TIPO DE BIEN — broad kind buckets. Hidden behind a locked label
            when an SEO category page locks the dimension. */}
      <FilterBlock label="Tipo de bien">
        {categoryLocked ? (
          <div className="rounded-md border border-[var(--color-action)]/40 bg-[var(--color-action-soft)] px-2.5 py-1.5 text-xs text-[var(--color-ink-primary)]">
            {lockedFilter?.category}
            <span className="ml-1 text-[var(--color-ink-tertiary)]">(bloqueado)</span>
          </div>
        ) : (
          <div className="space-y-1">
            {SIMPLE_KIND_OPTIONS.map((opt) => {
              const active = filters.kind === opt.id && filters.categories.length === 0;
              return (
                <label
                  key={opt.id}
                  className="flex items-center gap-2 cursor-pointer text-[var(--color-ink-primary)]"
                >
                  <input
                    type="radio"
                    name="kind"
                    className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                    checked={active}
                    onChange={() => onChange({ kind: opt.id, categories: [] })}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </FilterBlock>

      {/* 4. ¿DÓNDE? — province + municipality. Province locked on SEO province
            pages (rendered as a labelled, disabled chip). */}
      <FilterBlock label="¿Dónde?">
        {provinceLocked ? (
          <div className="space-y-2">
            <div className="rounded-md border border-[var(--color-action)]/40 bg-[var(--color-action-soft)] px-2.5 py-1.5 text-xs text-[var(--color-ink-primary)]">
              {lockedFilter?.province}
              <span className="ml-1 text-[var(--color-ink-tertiary)]">(bloqueado)</span>
            </div>
            {/* Municipality stays editable — narrows within the locked province. */}
            <select
              value={filters.municipality}
              onChange={(e) => onChange({ municipality: e.target.value })}
              className="tnum w-full rounded-md border border-[var(--color-hairline)] bg-white px-3 py-2 text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/15"
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
          </div>
        ) : (
          <div className="space-y-2">
            <select
              value={filters.province}
              onChange={(e) => onChange({ province: e.target.value, municipality: "" })}
              className="tnum w-full rounded-md border border-[var(--color-hairline)] bg-white px-3 py-2 text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/15"
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
                className="tnum w-full rounded-md border border-[var(--color-hairline)] bg-white px-3 py-2 text-sm text-[var(--color-ink-primary)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/15"
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
        )}
      </FilterBlock>

      {/* 5. VALOR SUBASTA — Min/Max price. priceMin is a client-side
            post-filter today (API only supports priceMax); the input still
            applies correctly via applyClientFilters. */}
      <FilterBlock label="Valor Subasta">
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label="Mínimo"
            value={pMin}
            onChange={setPMin}
            onCommit={commitPrice}
            placeholder="€ Min"
            ariaLabel="Valor mínimo"
          />
          <NumberInput
            label="Máximo"
            value={pMax}
            onChange={setPMax}
            onCommit={commitPrice}
            placeholder="€ Max"
            ariaLabel="Valor máximo"
          />
        </div>
      </FilterBlock>

      {/* 6. DEPÓSITO — disabled (no backend filter param). Flagged in brief. */}
      <FilterBlock label="Depósito" disabledHint="Próximamente">
        <div className="grid grid-cols-2 gap-2 opacity-50 pointer-events-none">
          <NumberInput label="Mínimo" value="" onChange={() => {}} onCommit={() => {}} placeholder="€ Min" ariaLabel="Depósito mínimo" disabled />
          <NumberInput label="Máximo" value="" onChange={() => {}} onCommit={() => {}} placeholder="€ Max" ariaLabel="Depósito máximo" disabled />
        </div>
      </FilterBlock>

      {/* 7. PUJAS — disabled (pujaStatus isn't an API filter param today).
            We DO surface the field on the result rows already (PujaBadge),
            but server-side filtering would need a Forge follow-up. */}
      <FilterBlock label="Pujas" disabledHint="Próximamente">
        <div className="space-y-1 opacity-50 pointer-events-none">
          {["Cualquiera", "Con puja", "Sin puja"].map((lbl) => (
            <label key={lbl} className="flex items-center gap-2 text-[var(--color-ink-primary)] cursor-not-allowed">
              <input type="radio" name="pujas" disabled className="h-3.5 w-3.5 accent-[var(--color-brand)]" />
              <span>{lbl}</span>
            </label>
          ))}
        </div>
      </FilterBlock>

      {/* 8. FECHA DE FINALIZACIÓN — endsBefore (wired). endsAfter not
            supported by the API today; rendered DISABLED. */}
      <FilterBlock label="Fecha de finalización">
        <div className="grid grid-cols-2 gap-2">
          <DateInput
            label="Desde"
            value=""
            onChange={() => {}}
            disabled
            disabledHint="Próximamente"
            ariaLabel="Finaliza desde"
          />
          <DateInput
            label="Hasta"
            value={filters.endsBefore ? filters.endsBefore.slice(0, 10) : ""}
            onChange={(v) => onChange({ endsBefore: v ? new Date(v).toISOString() : null })}
            ariaLabel="Finaliza hasta"
          />
        </div>
      </FilterBlock>

      {/* 9. FECHA DE PUBLICACIÓN — disabled. No API filter today. */}
      <FilterBlock label="Fecha de publicación" disabledHint="Próximamente">
        <div className="grid grid-cols-2 gap-2 opacity-50 pointer-events-none">
          <DateInput label="Desde" value="" onChange={() => {}} disabled ariaLabel="Publicada desde" />
          <DateInput label="Hasta" value="" onChange={() => {}} disabled ariaLabel="Publicada hasta" />
        </div>
      </FilterBlock>

      {/* Live count footer — what the current draft maps to. */}
      {resultCount != null && (
        <div className="pt-3 hairline-t text-xs text-[var(--color-ink-tertiary)] tnum">
          <span className="font-semibold text-[var(--color-ink-primary)]">
            {resultCount.toLocaleString("es-ES")}
          </span>{" "}
          subastas coinciden
        </div>
      )}
    </aside>
  );
}

/* ── building blocks ───────────────────────────────────────────────────── */

function FilterBlock({
  label,
  disabledHint,
  children,
}: {
  label: string;
  disabledHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-tertiary)]">
          {label}
        </div>
        {disabledHint && (
          <span className="text-[10px] italic text-[var(--color-ink-tertiary)]">
            {disabledHint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  onCommit,
  placeholder,
  ariaLabel,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <label className="block text-[10px] text-[var(--color-ink-tertiary)]">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        className="tnum w-full rounded-md border border-[var(--color-hairline)] bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/15 disabled:bg-[var(--color-surface-muted)]"
      />
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
  ariaLabel,
  disabled,
  disabledHint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <label className="block text-[10px] text-[var(--color-ink-tertiary)]">
        {label}
        {disabledHint && (
          <span className="ml-1 italic">({disabledHint})</span>
        )}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        className="tnum w-full rounded-md border border-[var(--color-hairline)] bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/15 disabled:bg-[var(--color-surface-muted)] disabled:text-[var(--color-ink-tertiary)]"
      />
    </div>
  );
}

/* ── sort + activas/finalizadas tab strips (used by SubastasListClient) ─ */

/**
 * SortTabs — labelled inline tabs (replaces the dropdown for the default
 * view). Falls back to the SortDropdown on mobile when space is tight.
 */
export function SortTabs({
  value,
  onChange,
  className,
}: {
  value: typeof SORT_OPTIONS[number]["id"];
  onChange: (v: typeof SORT_OPTIONS[number]["id"]) => void;
  className?: string;
}) {
  // The brief asks for "Fecha fin / Publicadas recientes / Baratas / Más" —
  // mapped to existing SORT_OPTIONS. "Más" routes to the dropdown via the
  // parent (here we just render the 3 quick tabs + "Más" as the default
  // category_rank, which is the urgency-first multi-tier sort).
  const QUICK: Array<{ id: typeof SORT_OPTIONS[number]["id"]; label: string }> = [
    { id: "endsAt_asc", label: "Fecha fin" },
    { id: "published_desc", label: "Publicadas recientes" },
    { id: "price_asc", label: "Baratas" },
    { id: "category_rank", label: "Destacados" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Ordenar resultados"
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] p-0.5",
        className,
      )}
    >
      {QUICK.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40",
              active
                ? "bg-[var(--color-action-soft)] text-[var(--color-ink-primary)] ring-1 ring-[var(--color-action)]/40"
                : "text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * StatusTabs — Activas / Finalizadas. Maps to filters.when. Two buttons.
 */
export function StatusTabs({
  value,
  onChange,
  className,
}: {
  value: ObservatoryFilters["when"];
  onChange: (v: ObservatoryFilters["when"]) => void;
  className?: string;
}) {
  const TABS: Array<{ id: ObservatoryFilters["when"]; label: string }> = [
    { id: "activas", label: "Activas" },
    { id: "finalizadas", label: "Finalizadas" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Estado"
      className={cn(
        "inline-flex rounded-md border border-[var(--color-hairline)] overflow-hidden",
        className,
      )}
    >
      {TABS.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:bg-[var(--color-brand)]/5",
              active
                ? "bg-[var(--color-action-soft)] text-[var(--color-ink-primary)] ring-1 ring-[var(--color-action)]/40"
                : "bg-[var(--color-surface)] text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)]",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
