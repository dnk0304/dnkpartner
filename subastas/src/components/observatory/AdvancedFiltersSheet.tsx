"use client";

/**
 * AdvancedFiltersSheet — the "+ Más filtros" panel.
 *
 * Slide-over (uses our existing Radix Sheet wrapper) — semantically a dialog
 * with focus trap and ESC-to-close. Mobile = same component, full width.
 *
 * What lives here (per UX vision doc 05): precise statuses, auction types,
 * precise categories. Date/value ranges and characteristic toggles are flagged
 * for a later wave once the backend supports them; we only ship filters we
 * can actually apply today so we never lie about results.
 *
 * Save button shows the live result count via the same parent-controlled
 * resultCount prop the simple filter uses.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  ALL_CATEGORIES,
  ALL_STATUSES,
  ALL_TYPES,
  CATASTRO_USE_OPTIONS,
  FLOOR_LEVEL_OPTIONS,
  ObservatoryFilters,
} from "./filters";
import { cn } from "@/lib/utils";

export type AdvancedFiltersSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ObservatoryFilters;
  onChange: (next: Partial<ObservatoryFilters>) => void;
  /** Live result count of the current draft filters. */
  resultCount?: number | null;
  /**
   * Distinct catastroUse values observed in the loaded result set. Unioned with
   * the curated CATASTRO_USE_OPTIONS base so real data we didn't anticipate is
   * still filterable. Optional — falls back to the curated list alone.
   */
  useFacets?: string[];
  /** Save callback — typically just `onOpenChange(false)` since changes
   *  are already pushed up incrementally. Provided as a callback so a
   *  future "draft mode" can stage changes and commit on save. */
  onSave?: () => void;
  onClear?: () => void;
};

export function AdvancedFiltersSheet({
  open,
  onOpenChange,
  filters,
  onChange,
  resultCount,
  useFacets,
  onSave,
  onClear,
}: AdvancedFiltersSheetProps) {
  const t = useTranslations("listUi");
  const toggleStatus = (s: ObservatoryFilters["statuses"][number]) => {
    const next = filters.statuses.includes(s)
      ? filters.statuses.filter((x) => x !== s)
      : [...filters.statuses, s];
    onChange({ statuses: next });
  };
  const toggleType = (t: ObservatoryFilters["types"][number]) => {
    const next = filters.types.includes(t)
      ? filters.types.filter((x) => x !== t)
      : [...filters.types, t];
    onChange({ types: next });
  };
  const toggleCategory = (c: ObservatoryFilters["categories"][number]) => {
    const next = filters.categories.includes(c)
      ? filters.categories.filter((x) => x !== c)
      : [...filters.categories, c];
    onChange({ categories: next });
  };

  // --- Phase-2 honest property-attribute filters ---
  const toggleFloor = (v: string) => {
    const next = filters.floorLevels.includes(v)
      ? filters.floorLevels.filter((x) => x !== v)
      : [...filters.floorLevels, v];
    onChange({ floorLevels: next });
  };
  const toggleUse = (v: string) => {
    const next = filters.catastroUses.includes(v)
      ? filters.catastroUses.filter((x) => x !== v)
      : [...filters.catastroUses, v];
    onChange({ catastroUses: next });
  };

  // Floor options — closed vocabulary, plus any URL-selected value beyond the
  // curated range (e.g. "12") appended so it round-trips honestly.
  const floorOptions = React.useMemo(() => {
    const opts = FLOOR_LEVEL_OPTIONS.map((o) => ({ ...o }));
    const known = new Set(opts.map((o) => o.value));
    for (const v of filters.floorLevels) {
      if (!known.has(v)) {
        known.add(v);
        opts.push({ value: v, label: /^\d+$/.test(v) ? `Planta ${v}` : v });
      }
    }
    return opts;
  }, [filters.floorLevels]);

  // Catastro-use options — curated base ∪ observed facets ∪ selected values,
  // deduped, curated order first.
  const useOptions = React.useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of [...CATASTRO_USE_OPTIONS, ...(useFacets ?? []), ...filters.catastroUses]) {
      if (v && !seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
    return out;
  }, [useFacets, filters.catastroUses]);

  // Year-built range — local draft committed on blur so typing doesn't refetch
  // per keystroke. Kept in sync when the incoming filter changes externally.
  const [yearMinStr, setYearMinStr] = React.useState(
    filters.yearBuiltMin != null ? String(filters.yearBuiltMin) : "",
  );
  const [yearMaxStr, setYearMaxStr] = React.useState(
    filters.yearBuiltMax != null ? String(filters.yearBuiltMax) : "",
  );
  React.useEffect(() => {
    setYearMinStr(filters.yearBuiltMin != null ? String(filters.yearBuiltMin) : "");
  }, [filters.yearBuiltMin]);
  React.useEffect(() => {
    setYearMaxStr(filters.yearBuiltMax != null ? String(filters.yearBuiltMax) : "");
  }, [filters.yearBuiltMax]);

  const commitYear = () => {
    const parse = (s: string): number | null => {
      const n = parseInt(s, 10);
      // Server guards 1000–3000 and silently ignores out-of-range; mirror that
      // so the URL never carries a value the API will drop.
      return Number.isFinite(n) && n >= 1000 && n <= 3000 ? n : null;
    };
    const min = parse(yearMinStr);
    const max = parse(yearMaxStr);
    if (min !== filters.yearBuiltMin) onChange({ yearBuiltMin: min });
    if (max !== filters.yearBuiltMax) onChange({ yearBuiltMax: max });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-md bg-[var(--color-page)] border-r border-[var(--color-hairline)] p-0 flex flex-col"
      >
        <SheetHeader className="px-5 py-4 hairline-b">
          <SheetTitle className="font-serif text-lg text-[var(--color-ink-primary)]">
            {t("filtrosAvanzados")}
          </SheetTitle>
          <SheetDescription className="text-xs text-[var(--color-ink-tertiary)]">
            {t("refinaResultado")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <Section title={t("estadoPreciso")} hint={t("estadoPrecisoHint")}>
            <CheckGrid>
              {ALL_STATUSES.map((s) => (
                <CheckRow
                  key={s.id}
                  label={s.label}
                  checked={filters.statuses.includes(s.id)}
                  onCheckedChange={() => toggleStatus(s.id)}
                />
              ))}
            </CheckGrid>
          </Section>

          <Section title={t("tipoDeSubasta")}>
            <CheckGrid>
              {ALL_TYPES.map((t) => (
                <CheckRow
                  key={t.id}
                  label={t.label}
                  checked={filters.types.includes(t.id)}
                  onCheckedChange={() => toggleType(t.id)}
                />
              ))}
            </CheckGrid>
          </Section>

          <Section title={t("tipoDeBienPreciso")} hint={t("tipoDeBienPrecisoHint")}>
            <CheckGrid>
              {ALL_CATEGORIES.map((c) => (
                <CheckRow
                  key={c}
                  label={c}
                  checked={filters.categories.includes(c)}
                  onCheckedChange={() => toggleCategory(c)}
                />
              ))}
            </CheckGrid>
          </Section>

          <Section
            title={t("caracteristicasInmueble")}
            hint={t("caracteristicasInmuebleHint")}
          >
            <div className="space-y-5">
              {/* Garage — boolean, `true`-only engages (honest: we never filter
                  to an unknown/false "sin garaje"). */}
              <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-hairline)] px-3 py-2.5 cursor-pointer">
                <span className="text-sm text-[var(--color-ink-primary)]">
                  {t("soloConGaraje")}
                </span>
                <Switch
                  checked={filters.hasGarage}
                  onCheckedChange={(v) => onChange({ hasGarage: v === true })}
                  aria-label={t("soloConGaraje")}
                />
              </label>

              {/* Floor level — closed vocabulary IN-list. */}
              <div>
                <h4 className="text-xs font-medium text-[var(--color-ink-secondary)]">
                  {t("plantaLabel")}
                </h4>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {floorOptions.map((o) => (
                    <CheckRow
                      key={o.value}
                      label={o.label}
                      checked={filters.floorLevels.includes(o.value)}
                      onCheckedChange={() => toggleFloor(o.value)}
                    />
                  ))}
                </div>
              </div>

              {/* Catastro use — curated ∪ observed IN-list. */}
              <div>
                <h4 className="text-xs font-medium text-[var(--color-ink-secondary)]">
                  {t("usoCatastralLabel")}
                </h4>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {useOptions.map((u) => (
                    <CheckRow
                      key={u}
                      label={u}
                      checked={filters.catastroUses.includes(u)}
                      onCheckedChange={() => toggleUse(u)}
                    />
                  ))}
                </div>
              </div>

              {/* Year built — inclusive range, guarded 1000–3000. */}
              <div>
                <h4 className="text-xs font-medium text-[var(--color-ink-secondary)]">
                  {t("anoConstruccion")}
                </h4>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1000}
                    max={3000}
                    value={yearMinStr}
                    onChange={(e) => setYearMinStr(e.target.value)}
                    onBlur={commitYear}
                    placeholder={t("anoDesdePlaceholder")}
                    className="tnum w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/15"
                    aria-label={t("anoConstruccionDesdeAria")}
                  />
                  <span aria-hidden="true" className="text-[var(--color-ink-tertiary)]">
                    –
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1000}
                    max={3000}
                    value={yearMaxStr}
                    onChange={(e) => setYearMaxStr(e.target.value)}
                    onBlur={commitYear}
                    placeholder={t("anoHastaPlaceholder")}
                    className="tnum w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/15"
                    aria-label={t("anoConstruccionHastaAria")}
                  />
                </div>
              </div>
            </div>
          </Section>

          <Section title={t("proximamente")} hint={t("proximamenteHint")}>
            <ul className="text-xs text-[var(--color-ink-tertiary)] space-y-1.5 list-disc ml-4">
              <li>{t("comingSoonDates")}</li>
              <li>{t("comingSoonTasacion")}</li>
              <li>{t("comingSoonToggles")}</li>
              <li>{t("comingSoonSearch")}</li>
            </ul>
          </Section>
        </div>

        <SheetFooter className="px-5 py-4 hairline-t bg-[var(--color-surface)]">
          <div className="flex items-center justify-between w-full gap-3">
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-[var(--color-ink-tertiary)] hover:text-[var(--color-brand)] focus-visible:outline-none focus-visible:underline"
            >
              {t("limpiarTodo")}
            </button>
            <Button
              type="button"
              onClick={() => {
                onSave?.();
                onOpenChange(false);
              }}
              className="bg-[var(--color-action-soft)] border border-[var(--color-action)] text-[var(--color-ink-primary)] hover:bg-[var(--color-action-soft)]/80"
            >
              {resultCount != null ? t("verResultados", { count: resultCount.toLocaleString("es-ES") }) : t("aplicar")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="font-serif text-sm text-[var(--color-ink-primary)]">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-[var(--color-ink-tertiary)]">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function CheckGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">{children}</div>;
}

function CheckRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors text-sm",
        checked
          ? "border-[var(--color-brand)]/40 bg-[var(--color-brand)]/5 text-[var(--color-brand)]"
          : "border-[var(--color-hairline)] text-[var(--color-ink-primary)] hover:border-[var(--color-brand)]/40",
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="border-[var(--color-hairline)] data-[state=checked]:bg-[var(--color-brand)] data-[state=checked]:border-[var(--color-brand)]"
      />
      <span>{label}</span>
    </label>
  );
}
