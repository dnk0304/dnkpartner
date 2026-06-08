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
import { X } from "lucide-react";
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
import {
  ALL_CATEGORIES,
  ALL_STATUSES,
  ALL_TYPES,
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
  onSave,
  onClear,
}: AdvancedFiltersSheetProps) {
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-md bg-[var(--color-page)] border-r border-[var(--color-hairline)] p-0 flex flex-col"
      >
        <SheetHeader className="px-5 py-4 hairline-b">
          <SheetTitle className="font-serif text-lg text-[var(--color-ink-primary)]">
            Filtros avanzados
          </SheetTitle>
          <SheetDescription className="text-xs text-[var(--color-ink-tertiary)]">
            Refina el resultado con criterios precisos.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <Section title="Estado preciso" hint="Una o más de los 6 estados oficiales BOE.">
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

          <Section title="Tipo de subasta">
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

          <Section title="Tipo de bien (preciso)" hint="Filtra a categorías individuales del catálogo.">
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

          <Section title="Próximamente" hint="Las características avanzadas se añadirán según se completen los datos del scraper.">
            <ul className="text-xs text-[var(--color-ink-tertiary)] space-y-1.5 list-disc ml-4">
              <li>Rango de fechas (termina entre, publicada entre)</li>
              <li>Rangos de tasación y % sobre tasación</li>
              <li>Solo visitables / sin cargas / desocupadas / con foto</li>
              <li>Búsqueda por juzgado / referencia catastral / expediente</li>
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
              Limpiar todo
            </button>
            <Button
              type="button"
              onClick={() => {
                onSave?.();
                onOpenChange(false);
              }}
              className="bg-[var(--color-action-soft)] border border-[var(--color-action)] text-[var(--color-ink-primary)] hover:bg-[var(--color-action-soft)]/80"
            >
              {resultCount != null ? `Ver ${resultCount.toLocaleString("es-ES")} resultados` : "Aplicar"}
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
